import { useState } from 'react';
import { Sheet, Button, Field } from '../../../core/ui/components';
import { Upload } from 'lucide-react';
import { useAttendanceImporter } from '../state/useAttendanceImporter';
import { useUnitReportImporter } from '../state/useUnitReportImporter';
import { useLegacyApprovalImporter } from '../state/useLegacyApprovalImporter';

function Picker({ label, hint, onFile, busy, accept = '.csv,text/csv' }) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="file" accept={accept}
        disabled={busy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />
    </Field>
  );
}

function LogView({ log }) {
  if (!log) return null;
  if (log.error) return <p className="ot-log bad">{log.error}</p>;
  return (
    <div className="ot-log">
      <p>{log.matched.length} matched{log.days != null ? `, ${log.days} days written` : ''}.</p>
      {/* What the import actually decided. A day count on its own can read
          as success while nothing at all changed. */}
      {log.stats?.length > 0 && (
        <ul>{log.stats.map((s, i) => <li key={i}>{s}</li>)}</ul>
      )}
      {log.unmatched.length > 0 && (
        <p className="bad">
          No Directory match for staff number{log.unmatched.length > 1 ? 's' : ''}:{' '}
          {log.unmatched.map((u) => u.sid).join(', ')} — add them in Directory/Roster first.
        </p>
      )}
      {/* Never blocks the import — a heads-up on what the source file itself
          says, so nothing gets trusted without a look (see the legacy
          approval importer's own doc comment). */}
      {log.flags?.length > 0 && (
        <div className="bad">
          <p>{log.flags.length} thing{log.flags.length > 1 ? 's' : ''} worth checking in the source file:</p>
          <ul>{log.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

/** Attendance CSV is the primary source; the unit report only carries HRMS
 *  reconciliation figures now that salary comes from Roster. */
export function ImportSheet({ onClose }) {
  const { importText, resolveConflicts } = useAttendanceImporter();
  const { importReportText } = useUnitReportImporter();
  const { importText: importLegacyApprovalText } = useLegacyApprovalImporter();
  const [attLog, setAttLog] = useState(null);
  const [reportLog, setReportLog] = useState(null);
  const [legacyLog, setLegacyLog] = useState(null);
  // Kept so the same file can be re-applied with HRMS's decisions winning,
  // without making the user find and pick it a second time.
  const [legacyText, setLegacyText] = useState(null);
  const [busy, setBusy] = useState(false);

  const handle = (fn, setLog) => async (file) => {
    setBusy(true);
    try { setLog(fn(await file.text())); }
    catch (e) { setLog({ error: e.message }); }
    finally { setBusy(false); }
  };

  const decideConflicts = (action) => {
    resolveConflicts(attLog.conflicts, action);
    setAttLog((l) => ({ ...l, conflicts: [] }));
  };

  const conflictDays = attLog?.conflicts?.reduce((s, c) => s + c.dates.length, 0) || 0;

  return (
    <Sheet open onClose={onClose} title="Import">
      <Picker
        label="Attendance report"
        hint="Employee Number, Date, Schedule, Attendance columns — the primary source"
        busy={busy}
        onFile={handle(importText, setAttLog)}
      />
      <LogView log={attLog} />

      {conflictDays > 0 && (
        <div className="ot-conflict-box">
          <p>
            {conflictDays} day{conflictDays === 1 ? '' : 's'} across {attLog.conflicts.length} staff already{' '}
            {conflictDays === 1 ? 'has' : 'have'} approved or hand-added entries — left exactly as they are.
            Import the new punches for those days anyway?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={() => decideConflicts('keep')}>Keep existing</Button>
            <Button size="sm" variant="primary" onClick={() => decideConflicts('replace')}>Replace with import</Button>
          </div>
        </div>
      )}

      <Picker
        label="Unit overtime report"
        hint="Optional — loads the HRMS's own figures for the reconciliation panel"
        busy={busy}
        onFile={handle(importReportText, setReportLog)}
      />
      <LogView log={reportLog} />

      <Picker
        label="Approved OT (legacy)"
        hint="HRMS's My Overtimes page for one person's full period, saved as .mhtml — the real authorized daily figures for pre-Aug-2026 reports"
        accept=".mhtml,.mht"
        busy={busy}
        onFile={async (file) => {
          setBusy(true);
          try {
            const text = await file.text();
            setLegacyText(text);
            setLegacyLog(importLegacyApprovalText(text));
          } catch (e) { setLegacyLog({ error: e.message }); setLegacyText(null); }
          finally { setBusy(false); }
        }}
      />
      <LogView log={legacyLog} />

      {legacyLog?.skipped > 0 && legacyText && (
        <div className="ot-conflict-box">
          <p>
            {legacyLog.skipped} claim{legacyLog.skipped === 1 ? '' : 's'} kept the approval decision made here by hand
            instead of the one in the file — so those figures did not move. Apply HRMS's own decisions to them?
            Anything HRMS does not pay becomes unapproved again.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={() => setLegacyLog((l) => ({ ...l, skipped: 0 }))}>Keep my decisions</Button>
            <Button size="sm" variant="primary" onClick={() => setLegacyLog(importLegacyApprovalText(legacyText, { force: true }))}>
              Apply HRMS&apos;s decisions
            </Button>
          </div>
        </div>
      )}

      <Button onClick={onClose}><Upload size={14} /> Done</Button>
    </Sheet>
  );
}
