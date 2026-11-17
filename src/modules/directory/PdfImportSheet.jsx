import { useRef, useState } from 'react';
import { Upload, AlertCircle, ArrowRight, ChevronLeft } from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import { Card, Button, Sheet, Field } from '../../core/ui/components';
import { extractSidPage } from './sidPage';
import { buildPlan } from './pdfDiff';

export function PdfImportSheet({ onClose }) {
  const repo = useRepo();
  const fileRef = useRef();

  const [step, setStep] = useState('pick'); // pick | parsing | summary | review | applying | done | error
  const [plan, setPlan] = useState(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [decisions, setDecisions] = useState([]); // parallel to plan.changedRecords
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStep('parsing');
    setError(null);
    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const { rows } = isPdf
        ? await (await import('./pdfImport')).extractSidPdf(file)
        : await extractSidPage(file);
      if (!rows.length) throw new Error('No staff rows were found in this file.');
      const built = buildPlan(rows, repo);
      setPlan(built);
      setDecisions(built.changedRecords.map(() => null));
      setReviewIndex(0);
      setStep('summary');
    } catch (err) {
      setError(err?.message || 'Could not read that file.');
      setStep('error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const decide = (choice) => {
    setDecisions((d) => {
      const next = [...d];
      next[reviewIndex] = choice;
      return next;
    });
    if (reviewIndex < plan.changedRecords.length - 1) setReviewIndex((i) => i + 1);
    else applyAll(decisions.map((d, i) => (i === reviewIndex ? choice : d)));
  };

  const decideAllRemaining = (choice) => {
    const next = [...decisions];
    for (let i = reviewIndex; i < next.length; i++) next[i] = choice;
    setDecisions(next);
    applyAll(next);
  };

  const applyAll = async (finalDecisions) => {
    setStep('applying');
    try {
      const batch = [...plan.newRecords];
      let updated = 0, ignored = 0;
      plan.changedRecords.forEach((cr, i) => {
        if (finalDecisions[i] === 'update') {
          const nextData = { ...cr.existing.data };
          let title = cr.existing.title;
          cr.changes.forEach((c) => {
            if (c.key === 'name') title = c.after;
            else nextData[c.key] = c.value !== undefined ? c.value : c.after;
          });
          batch.push({ ...cr.existing, title, data: nextData, updatedAt: new Date().toISOString() });
          updated++;
        } else {
          ignored++;
        }
      });
      await repo.bulkWrite(batch);
      setResult({
        added: plan.newRecords.length, updated, ignored, unchanged: plan.unchangedCount,
      });
      setStep('done');
    } catch (err) {
      setError(err?.message || 'The import could not be saved.');
      setStep('error');
    }
  };

  const skipToApply = () => applyAll(decisions);

  /* ------------------------------ render ------------------------------ */

  if (step === 'error') {
    return (
      <Sheet open onClose={onClose} title="Import failed"
        footer={<Button variant="primary" onClick={onClose}>Close</Button>}>
        <p className="settings-error"><AlertCircle size={14} /> {error}</p>
      </Sheet>
    );
  }

  if (step === 'done') {
    return (
      <Sheet open onClose={onClose} title="Import finished"
        footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <div className="import-result">
          <p><strong className="mono">{result.added}</strong> added</p>
          <p><strong className="mono">{result.updated}</strong> updated</p>
          {result.ignored > 0 && <p><strong className="mono">{result.ignored}</strong> left unchanged (ignored)</p>}
          <p><strong className="mono">{result.unchanged}</strong> already up to date</p>
        </div>
      </Sheet>
    );
  }

  if (step === 'parsing' || step === 'applying') {
    return (
      <Sheet open onClose={onClose} title={step === 'parsing' ? 'Reading the file…' : 'Saving…'}>
        <p className="settings-note" style={{ marginTop: 0 }}>
          {step === 'parsing'
            ? 'Scanning the export and matching it against your directory. This can take a moment for a large file.'
            : 'Writing changes.'}
        </p>
      </Sheet>
    );
  }

  if (step === 'summary' && plan) {
    const hasChanges = plan.changedRecords.length > 0;
    return (
      <Sheet
        open onClose={onClose} title="Import summary"
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={hasChanges ? () => setStep('review') : skipToApply}>
              {hasChanges ? `Review ${plan.changedRecords.length} change${plan.changedRecords.length === 1 ? '' : 's'}` : 'Import'}
            </Button>
          </>
        }
      >
        <div className="import-result" style={{ marginBottom: 0 }}>
          <p><strong className="mono">{plan.newRecords.length}</strong> new staff will be added</p>
          <p><strong className="mono">{plan.changedRecords.length}</strong> existing staff have changes to review</p>
          <p><strong className="mono">{plan.unchangedCount}</strong> already match — nothing to do</p>
        </div>
        {!hasChanges && plan.newRecords.length === 0 && (
          <p className="settings-note">Nothing to import — this file matches your directory exactly.</p>
        )}
      </Sheet>
    );
  }

  if (step === 'review' && plan) {
    const cr = plan.changedRecords[reviewIndex];
    const total = plan.changedRecords.length;
    return (
      <Sheet
        open onClose={onClose} title={`Review ${reviewIndex + 1} of ${total}`}
        footer={
          <>
            <Button onClick={() => decideAllRemaining('ignore')} size="sm">Ignore rest</Button>
            <span style={{ flex: 1 }} />
            <Button variant="outline" onClick={() => decide('ignore')}>Ignore</Button>
            <Button variant="primary" onClick={() => decide('update')}>
              Update <ArrowRight size={14} />
            </Button>
          </>
        }
      >
        {reviewIndex > 0 && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            style={{ marginBottom: 'var(--sp-3)', paddingLeft: 0 }}
            onClick={() => setReviewIndex((i) => i - 1)}
          >
            <ChevronLeft size={14} /> Back
          </button>
        )}

        <p className="detail-headline" style={{ marginTop: 0 }}>
          {cr.name} <span className="mono" style={{ color: 'var(--muted)', fontWeight: 400 }}>· {cr.sid}</span>
        </p>

        <Card className="pdf-diff-card">
          {cr.changes.map((c) => (
            <div className="pdf-diff-row" key={c.key}>
              <span className="pdf-diff-label">{c.label}</span>
              <div className="pdf-diff-values">
                <span className="pdf-diff-before">{c.before || '—'}</span>
                <ArrowRight size={13} style={{ color: 'var(--muted)', flex: 'none' }} />
                <span className="pdf-diff-after">{c.after}</span>
              </div>
            </div>
          ))}
        </Card>

        <Button variant="primary" size="sm" onClick={() => decideAllRemaining('update')} style={{ marginTop: 'var(--sp-3)' }}>
          Update this and all remaining
        </Button>
      </Sheet>
    );
  }

  /* step === 'pick' */
  return (
    <Sheet
      open onClose={onClose} title="Import from SID 2.0"
      footer={<Button onClick={onClose}>Cancel</Button>}
    >
      <p className="settings-note" style={{ marginTop: 0 }}>
        Best way: open SID 2.0 on a computer, pick the department (or all of them), press
        <strong> Ctrl+S</strong> and save as <strong>Webpage, Single File</strong> (.mhtml). That file
        carries the real table, so names and departments come through whole.
      </p>
      <p className="settings-note">
        It's matched to your directory by Staff ID — new staff are added, and anything different
        about an existing person is queued for you to review. Mobile numbers you've added by hand
        are never touched. A PDF export still works, but long departments can come out cut.
      </p>
      <Field label="Saved page or PDF">
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload size={15} /> Choose a file
        </Button>
      </Field>
      <input ref={fileRef} type="file" accept=".mhtml,.mht,.html,.htm,application/pdf,.pdf,multipart/related,text/html" hidden onChange={onFile} />
    </Sheet>
  );
}

export default PdfImportSheet;
