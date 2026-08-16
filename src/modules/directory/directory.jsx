import { useState, useMemo, useRef, useEffect, lazy, Suspense } from 'react';
import {
  Contact, Search, Upload, Trash2, Phone, X, SlidersHorizontal, Check,
  AlertCircle, Pencil, Copy, FileText, Download, Crown, Printer, UserRound,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useRepo } from '../../core/db/repo';
import {
  PERSON_TYPE, personFields, allPeople, personBySid, facetsOf, matchesPerson, unitHeadOf,
} from '../../core/people';
import {
  Card, Row, SectionLabel, EmptyState, Button, Sheet, Field, Input, Select,
  Textarea, Chip, Toggle, OptionRow,
} from '../../core/ui/components';
import { Fab } from '../../core/ui/extras';
import { parseCsv, guessMapping, toPeople, FIELD_LABELS } from './csv';
import { ExportPreview } from './ExportPreview';
import './directory.css';

const DirectoryPrintPreview = lazy(() => import('./DirectoryPrint').then(m => ({ default: m.DirectoryPrintPreview })));

// pdfjs-dist is ~1.2MB — split it into its own chunk so everyone else's
// page load doesn't pay for a feature only used a few times a month.
const PdfImportSheet = lazy(() => import('./PdfImportSheet'));

export const TYPE = PERSON_TYPE;

/* -------------------------------- editor ------------------------------- */

/**
 * Read-only detail view. Opening a staff member shows this first — a calm
 * card you can read without the keyboard springing up, which is what happened
 * when tapping went straight to the edit form. Editing is a deliberate second
 * step via the Edit button, not the default.
 */
function PersonDetail({ person, onClose }) {
  const repo = useRepo();
  // Read live so an edit made from the sheet-on-top reflects immediately.
  const live = repo.get(person.id) || person;
  const d = live.data || {};
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const rows = (d.personal
    ? [['Company', d.company], ['Designation', d.designation], ['Mobile', d.mobile], ['Note', d.note]]
    : [
        ['Staff ID', d.sid],
        ['Designation', d.designation],
        ['Department', d.dept],
        ['Unit', d.unit],
        ['Extension', d.ext],
        ['Mobile', d.mobile],
        ['Note', d.note],
      ]
  ).filter(([, v]) => v);

  const copyCard = async () => {
    const lines = [live.title];
    if (d.sid) lines.push(`Staff ID: ${d.sid}`);
    if (d.company) lines.push(d.company);
    if (d.designation) lines.push(d.designation);
    if (d.mobile) lines.push(`Phone: ${d.mobile}`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard blocked */ }
  };

  return (
    <>
      <Sheet
        open onClose={onClose}
        title={live.title}
        footer={
          <>
            <Button onClick={copyCard} size="sm" variant="outline">
              {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
            </Button>
            <span style={{ flex: 1 }} />
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button>
          </>
        }
      >
        {(d.designation || d.isUnitHead || d.personal) && (
          <p className="detail-headline">
            {d.designation}
            {d.isUnitHead && <Chip tone="in"><Crown size={11} /> Unit head</Chip>}
            {d.personal && <Chip tone="neutral"><UserRound size={11} /> Personal</Chip>}
          </p>
        )}

        <div className="detail-list">
          {rows.map(([label, value]) => (
            <div className="detail-row" key={label}>
              <span className="detail-label">{label}</span>
              {label === 'Mobile'
                ? <a className="detail-value dir-tel" href={`tel:${value}`}>{value}</a>
                : label === 'Extension'
                  ? <span className="detail-value mono">{value}</span>
                  : <span className="detail-value">{value}</span>}
            </div>
          ))}
        </div>

        {d.mobile && (
          <a className="btn btn-primary btn-md detail-call" href={`tel:${d.mobile}`}>
            <Phone size={15} /> Call {live.title.split(' ')[0]}
          </a>
        )}
      </Sheet>

      {editing && <PersonSheet existing={live} onClose={() => setEditing(false)} />}
    </>
  );
}

function PersonSheet({ existing, onClose }) {
  const repo = useRepo();
  const isNew = !existing;
  const [f, setF] = useState(() => ({
    name: existing?.title || '',
    ...personFields(existing?.data),
  }));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const people = allPeople(repo);
  const facets = facetsOf(people);

  // One unit head is the norm per (department, unit) pair — surface who'd
  // be replaced *before* saving, not as a surprise afterward. Meaningless
  // for a personal contact, which has no unit to head.
  const headConflict = !f.personal && f.isUnitHead && f.unit.trim()
    ? unitHeadOf(people, f.dept, f.unit, existing?.id)
    : null;

  const save = () => {
    if (!f.name.trim()) return setError('Name is required.');
    const sid = f.personal ? '' : String(f.sid).trim();
    if (sid) {
      const clash = personBySid(repo, sid);
      if (clash && clash.id !== existing?.id) {
        return setError(`Staff ID ${sid} already belongs to ${clash.title}.`);
      }
    }
    if (headConflict) {
      repo.update(headConflict.id, { data: { ...headConflict.data, isUnitHead: false } });
    }
    const { name, ...data } = f;
    // Switching a record to personal drops the staff-only fields rather than
    // just hiding them — otherwise a dept/unit typed in before flipping the
    // toggle would silently linger and could still collide with Org
    // Structure's dept-name matching (see the comment on personFields).
    const payload = {
      title: name.trim(),
      data: personFields(f.personal
        ? { ...data, sid: '', dept: '', unit: '', ext: '', isUnitHead: false }
        : { ...data, sid, company: '' }),
    };
    if (isNew) repo.create(PERSON_TYPE, payload);
    else repo.update(existing.id, payload);
    onClose();
  };

  return (
    <Sheet
      open onClose={onClose}
      title={isNew ? 'Add person' : existing.title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>{isNew ? 'Add' : 'Save'}</Button>
        </>
      }
    >
      <Field label="Name">
        <Input value={f.name} onChange={set('name')} autoFocus placeholder="Full name" />
      </Field>

      <OptionRow
        title="Personal contact"
        hint="A restaurant, a friend, someone at another company — not org staff. Keeps them out of Org Structure and out of Directory prints/exports by default."
        control={
          <Toggle
            checked={f.personal}
            onChange={(v) => setF((s) => ({ ...s, personal: v }))}
            label="Personal contact"
          />
        }
      />

      {f.personal ? (
        <>
          <Field label="Company" hint="Who they're with, if relevant.">
            <Input value={f.company} onChange={set('company')} list="dir-companies" />
          </Field>
          <Field label="Designation">
            <Input value={f.designation} onChange={set('designation')} list="dir-designations" />
          </Field>
        </>
      ) : (
        <>
          <Field label="Staff ID">
            <Input value={f.sid} onChange={set('sid')} inputMode="numeric" placeholder="180133" />
          </Field>
          <Field label="Designation">
            <Input value={f.designation} onChange={set('designation')} list="dir-designations" />
          </Field>
          <Field label="Department">
            <Input value={f.dept} onChange={set('dept')} list="dir-depts" />
          </Field>
          <Field label="Unit">
            <Input value={f.unit} onChange={set('unit')} list="dir-units" />
          </Field>
          <OptionRow
            title="Unit head"
            hint={
              !f.unit.trim()
                ? 'Add a unit above to mark someone as its head.'
                : headConflict
                  ? `Replaces ${headConflict.title} as head of ${f.unit}.`
                  : 'One head per unit is the norm.'
            }
            control={
              <Toggle
                checked={f.isUnitHead}
                disabled={!f.unit.trim()}
                onChange={(v) => setF((s) => ({ ...s, isUnitHead: v }))}
                label="Unit head"
              />
            }
          />
          <Field label="Extension">
            <Input value={f.ext} onChange={set('ext')} inputMode="numeric" placeholder="7954" />
          </Field>
        </>
      )}

      <Field label="Mobile" hint="Fill these in as you collect them.">
        <Input value={f.mobile} onChange={set('mobile')} inputMode="tel" placeholder="7XXXXXX" />
      </Field>
      <Field label="Note">
        <Textarea value={f.note} onChange={set('note')} rows={2} />
      </Field>

      {/* datalists give free-text fields the convenience of a dropdown
          without locking you out of typing something new */}
      <datalist id="dir-designations">{facets.designations.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dir-depts">{facets.depts.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dir-units">{facets.units.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dir-companies">{facets.companies.map((v) => <option key={v} value={v} />)}</datalist>

      {error && <p className="settings-error">{error}</p>}

      {!isNew && (
        <Button variant="danger" size="sm" onClick={() => { repo.softDelete(existing.id); onClose(); }}>
          <Trash2 size={14} /> Remove from directory
        </Button>
      )}
    </Sheet>
  );
}

/* -------------------------------- import ------------------------------- */

function ImportSheet({ onClose }) {
  const repo = useRepo();
  const fileRef = useRef();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [map, setMap] = useState(null);
  const [mode, setMode] = useState('merge');   // merge | skip
  const [done, setDone] = useState(null);

  const analyse = (raw) => {
    const p = parseCsv(raw);
    if (!p.rows.length) return;
    setParsed(p);
    setMap(guessMapping(p.headers, p.rows));
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result)); analyse(String(reader.result)); };
    reader.readAsText(file);
  };

  const preview = useMemo(() => {
    if (!parsed || !map) return [];
    return toPeople(parsed.rows.slice(0, 5), map, parsed.headers.length);
  }, [parsed, map]);

  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(null);

  /**
   * Build every record first, then write them as ONE batched operation.
   *
   * The obvious version — a loop of repo.create() — fires a thousand separate
   * writes. On Firestore they go unawaited and any that fail do so silently,
   * leaving other devices with a partial directory. Locally it re-parses the
   * whole store per record, which is quadratic. Both are why this assembles
   * the list up front.
   */
  const run = async () => {
    setRunning(true); setFailed(null);
    try {
      const people = toPeople(parsed.rows, map, parsed.headers.length);
      const batch = [];
      let added = 0, updated = 0, skipped = 0;

      // track staff IDs seen in THIS file too, so a CSV that repeats someone
      // doesn't create them twice
      const seen = new Map();

      people.forEach((p) => {
        const sid = String(p.sid || '').trim();
        const existing = sid ? (seen.get(sid) || personBySid(repo, sid)) : null;

        if (existing) {
          if (mode === 'skip') { skipped++; return; }
          // merge: never blank a field the import doesn't carry — this is
          // what protects the mobile numbers you've collected by hand
          const next = { ...existing.data };
          ['designation', 'dept', 'unit', 'ext', 'mobile'].forEach((k) => {
            if (p[k]) next[k] = p[k];
          });
          const rec = {
            ...existing,
            title: p.name || existing.title,
            data: next,
            updatedAt: new Date().toISOString(),
          };
          if (sid) seen.set(sid, rec);
          batch.push(rec);
          updated++;
        } else {
          const rec = repo.draft(PERSON_TYPE, {
            title: p.name || 'Unnamed',
            data: personFields({
              sid, designation: p.designation, dept: p.dept,
              unit: p.unit, ext: p.ext, mobile: p.mobile,
            }),
          });
          if (sid) seen.set(sid, rec);
          batch.push(rec);
          added++;
        }
      });

      await repo.bulkWrite(batch);
      setDone({ added, updated, skipped });
    } catch (e) {
      setFailed(e?.message || 'The import could not be saved.');
    } finally {
      setRunning(false);
    }
  };

  if (done) {
    return (
      <Sheet open onClose={onClose} title="Import finished"
        footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <div className="import-result">
          <p><strong className="mono">{done.added}</strong> added</p>
          <p><strong className="mono">{done.updated}</strong> updated</p>
          {done.skipped > 0 && <p><strong className="mono">{done.skipped}</strong> skipped</p>}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open onClose={onClose} title="Import staff from CSV"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={run} disabled={!parsed || running}>
            {running ? 'Importing…' : `Import ${parsed ? `${parsed.rows.length} rows` : ''}`}
          </Button>
        </>
      }
    >
      {!parsed ? (
        <>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Choose a CSV file
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
          <Field label="Or paste it" hint="First row should be the header.">
            <Textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => text.trim() && analyse(text)}
              placeholder="Name,Staff ID,Designation,Dept,Unit,EXT"
            />
          </Field>
        </>
      ) : (
        <>
          <p className="settings-note" style={{ marginTop: 0 }}>
            {parsed.rows.length} rows found. Check the columns matched correctly — the
            header row in these exports is often mislabelled, so these are guessed from
            the data itself.
          </p>

          {Object.keys(FIELD_LABELS).map((key) => (
            <Field key={key} label={FIELD_LABELS[key]}>
              <Select
                value={map[key]}
                onChange={(e) => setMap({ ...map, [key]: Number(e.target.value) })}
              >
                <option value={-1}>— not in file —</option>
                {parsed.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {i + 1}. {h || '(blank)'} — e.g. {(parsed.rows[0]?.[i] || '').slice(0, 24)}
                  </option>
                ))}
              </Select>
            </Field>
          ))}

          <SectionLabel>Preview</SectionLabel>
          <Card>
            <div className="ruled">
              {preview.map((p, i) => (
                <Row
                  key={i}
                  title={p.name || <span style={{ color: 'var(--out)' }}>no name</span>}
                  meta={<>{p.designation && <Chip tone="neutral">{p.designation}</Chip>}
                    <span className="mono">{p.sid}</span>{p.unit && <span>{p.unit}</span>}</>}
                />
              ))}
            </div>
          </Card>

          {failed && <p className="settings-error"><AlertCircle size={14} /> {failed}</p>}

          <Field label="If a staff ID already exists">
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="merge">Update their details (keeps mobile numbers you've added)</option>
              <option value="skip">Leave them alone</option>
            </Select>
          </Field>
        </>
      )}
    </Sheet>
  );
}

/* -------------------------------- filters ------------------------------ */

const HEAD_FILTER_LABELS = {
  only: 'Unit heads only',
  exclude: 'Excluding unit heads',
};

const KIND_FILTER_LABELS = {
  staff: 'Staff only',
  personal: 'Personal only',
};

function FilterSheet({ facets, value, onChange, onClose }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const clear = () => onChange({ dept: '', unit: '', designation: '', headFilter: '', kind: '', company: '' });

  // units narrow to the chosen department — a flat list of 200 is unusable
  const units = value.dept ? facets.unitsByDept[value.dept] || [] : facets.units;
  const showingPersonal = value.kind !== 'staff';
  const showingStaff = value.kind !== 'personal';

  return (
    <Sheet open onClose={onClose} title="Filter"
      footer={<><Button onClick={clear}>Clear all</Button>
        <Button variant="primary" onClick={onClose}>Show results</Button></>}>
      <Field label="Kind">
        <Select value={value.kind} onChange={set('kind')}>
          <option value="">Staff and personal</option>
          <option value="staff">{KIND_FILTER_LABELS.staff}</option>
          <option value="personal">{KIND_FILTER_LABELS.personal}</option>
        </Select>
      </Field>
      {showingStaff && (
        <>
          <Field label="Department">
            <Select value={value.dept} onChange={(e) => onChange({ ...value, dept: e.target.value, unit: '' })}>
              <option value="">All departments</option>
              {facets.depts.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="Unit" hint={value.dept ? 'Narrowed to the department above.' : undefined}>
            <Select value={value.unit} onChange={set('unit')}>
              <option value="">All units</option>
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
          <Field label="Unit heads" hint="One unit head is the norm per unit.">
            <Select value={value.headFilter} onChange={set('headFilter')}>
              <option value="">All staff</option>
              <option value="only">{HEAD_FILTER_LABELS.only}</option>
              <option value="exclude">{HEAD_FILTER_LABELS.exclude}</option>
            </Select>
          </Field>
        </>
      )}
      {showingPersonal && facets.companies.length > 0 && (
        <Field label="Company">
          <Select value={value.company} onChange={set('company')}>
            <option value="">All companies</option>
            {facets.companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Designation">
        <Select value={value.designation} onChange={set('designation')}>
          <option value="">All designations</option>
          {facets.designations.map((d) => <option key={d} value={d}>{d}</option>)}
        </Select>
      </Field>
    </Sheet>
  );
}

/* -------------------------------- screen ------------------------------- */

export function DirectoryScreen() {
  const repo = useRepo();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ dept: '', unit: '', designation: '', headFilter: '', kind: '', company: '' });
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(undefined);
  const [importing, setImporting] = useState(false);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dirPrinting, setDirPrinting] = useState(false);

  const people = allPeople(repo);

  // If navigated with ?view=ID (e.g. from global search), open that person's
  // detail card. We consume the id once via a ref rather than calling
  // setSearchParams to clear it — clearing the param pushes/replaces history,
  // which races with the detail Sheet's own history entry and was closing the
  // card the instant it opened (the "tries to open, then bounces back" bug).
  const consumedView = useRef(null);
  const viewId = searchParams.get('view');
  useEffect(() => {
    if (viewId && consumedView.current !== viewId) {
      consumedView.current = viewId;
      const person = people.find((p) => p.id === viewId);
      if (person) setViewing(person);
    }
  }, [viewId, people]);

  const facets = useMemo(() => {
    const base = facetsOf(people);
    const unitsByDept = {};
    people.forEach((p) => {
      const d = (p.data.dept || '').trim();
      const u = (p.data.unit || '').trim();
      if (!d || !u) return;
      (unitsByDept[d] ||= new Set()).add(u);
    });
    Object.keys(unitsByDept).forEach((d) => {
      unitsByDept[d] = [...unitsByDept[d]].sort((a, b) => a.localeCompare(b));
    });
    return { ...base, unitsByDept };
  }, [people]);

  const list = useMemo(() => {
    const term = q.trim();
    return people
      .filter((p) => (!filters.kind
        || (filters.kind === 'personal' ? p.data.personal : !p.data.personal)))
      .filter((p) => (!filters.dept || p.data.dept === filters.dept))
      .filter((p) => (!filters.unit || p.data.unit === filters.unit))
      .filter((p) => (!filters.company || p.data.company === filters.company))
      .filter((p) => (!filters.designation || p.data.designation === filters.designation))
      .filter((p) => (!filters.headFilter
        || (filters.headFilter === 'only' ? p.data.isUnitHead : !p.data.isUnitHead)))
      .filter((p) => (!term || matchesPerson(p, term)))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [people, q, filters]);

  const activeFilters = Object.entries(filters).filter(([, v]) => v);
  const filterLabel = (k, v) => (k === 'headFilter' ? HEAD_FILTER_LABELS[v] : k === 'kind' ? KIND_FILTER_LABELS[v] : v);
  const withMobile = people.filter((p) => p.data.mobile).length;
  const personalCount = people.filter((p) => p.data.personal).length;

  return (
    <div className="page has-fab">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Directory</h1>
          <p className="page-sub">
            Staff and personal contacts in one place. A correction made once shows up
            everywhere else in the app that points here.
          </p>
        </div>
      </div>

      <Card className="capture-card">
        <div className="capture">
          <Search size={15} style={{ color: 'var(--muted)', flex: 'none' }} />
          <input
            className="capture-input"
            placeholder="Name, staff ID, designation, company"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search directory"
          />
          {q && <button className="icon-btn" onClick={() => setQ('')} aria-label="Clear"><X size={15} /></button>}
        </div>
      </Card>

      <div className="sort-bar" data-no-swipe>
        <button className={`sort-pill ${activeFilters.length ? 'is-active' : ''}`} onClick={() => setFiltering(true)}>
          <SlidersHorizontal size={13} style={{ verticalAlign: '-2px' }} /> Filter
          {activeFilters.length > 0 && ` · ${activeFilters.length}`}
        </button>
        {activeFilters.map(([k, v]) => (
          <button key={k} className="sort-pill is-active" onClick={() => setFilters({ ...filters, [k]: '' })}>
            {(() => { const label = filterLabel(k, v); return label.length > 26 ? `${label.slice(0, 26)}…` : label; })()} <X size={11} style={{ verticalAlign: '-1px' }} />
          </button>
        ))}
        <button className="sort-pill" onClick={() => setImporting(true)}>
          <Upload size={13} style={{ verticalAlign: '-2px' }} /> Import CSV
        </button>
        <button className="sort-pill" onClick={() => setPdfImporting(true)}>
          <FileText size={13} style={{ verticalAlign: '-2px' }} /> Import PDF
        </button>
        <button
          className={`sort-pill ${list.length === 0 ? 'is-blocked' : ''}`}
          onClick={() => list.length > 0 && setExporting(true)}
        >
          <Download size={13} style={{ verticalAlign: '-2px' }} /> Export
        </button>
        <button
          className={`sort-pill ${list.length === 0 ? 'is-blocked' : ''}`}
          onClick={() => list.length > 0 && setDirPrinting(true)}
        >
          <Printer size={13} style={{ verticalAlign: '-2px' }} /> Print
        </button>
      </div>

      <SectionLabel right={<span className="mono count">{list.length}</span>}>
        {q || activeFilters.length ? 'Matches' : 'Everyone'}
      </SectionLabel>
      <Card>
        {list.length === 0 ? (
          <EmptyState
            icon={Contact}
            title={people.length === 0 ? 'Directory is empty' : 'No matches'}
            body={people.length === 0
              ? 'Import your staff CSV to fill this in, or add someone by hand.'
              : 'Try a shorter search, or clear the filters.'}
            action={people.length === 0
              ? <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
                  <Upload size={14} /> Import CSV
                </Button>
              : null}
          />
        ) : (
          <div className="dir-table">
            <div className="dir-head">
              <span className="eyebrow">Name</span>
              <span className="eyebrow">Staff ID</span>
              {/* Extension is worth showing when there's room, but on a phone
                  it costs the name column more than it's worth. */}
              <span className="eyebrow dir-ext">Ext</span>
              <span className="eyebrow">Mobile</span>
            </div>
            {list.slice(0, 300).map((p) => (
              <div key={p.id} className="dir-row" onClick={() => setViewing(p)}>
                <div className="dir-name-cell">
                  <span className="dir-name">
                    {p.data.isUnitHead && <Crown size={12} className="dir-head-icon" aria-label="Unit head" />}
                    {p.data.personal && <UserRound size={12} className="dir-head-icon" aria-label="Personal contact" />}
                    {p.title}
                  </span>
                  {/* Designation and unit (or, for a personal contact,
                      company) share one ellipsised line. As two stacked
                      elements they wrapped to three or four lines per
                      person, which is unreadable at nearly two thousand
                      rows. */}
                  <span className="dir-sub">
                    {(p.data.personal
                      ? [p.data.designation, p.data.company]
                      : [p.data.designation, p.data.unit]
                    ).filter(Boolean).join(' · ')}
                  </span>
                </div>
                <span className="roster-cell mono">{p.data.sid || '—'}</span>
                <span className="roster-cell mono dir-ext">{p.data.ext || '—'}</span>
                <span className="roster-cell mono">
                  {p.data.mobile
                    ? <a href={`tel:${p.data.mobile}`} onClick={(e) => e.stopPropagation()} className="dir-tel">
                        <Phone size={11} /> {p.data.mobile}
                      </a>
                    : <span style={{ color: 'var(--rule-strong)' }}>—</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {list.length > 300 && (
        <p className="settings-note">
          Showing the first 300 of {list.length}. Narrow it with search or a filter.
        </p>
      )}

      {people.length > 0 && (
        <p className="settings-note">
          <span className="mono" style={{ color: 'var(--ink)' }}>{withMobile}</span> of{' '}
          <span className="mono" style={{ color: 'var(--ink)' }}>{people.length}</span> have a
          mobile number{personalCount > 0 && <> ({personalCount} personal)</>}. Re-importing the
          CSV never wipes the ones you've added by hand.
        </p>
      )}

      {viewing && (
        <PersonDetail person={viewing} onClose={() => setViewing(null)} />
      )}

      {editing !== undefined && (
        <PersonSheet existing={editing || undefined} onClose={() => setEditing(undefined)} />
      )}
      {importing && <ImportSheet onClose={() => setImporting(false)} />}
      {pdfImporting && (
        <Suspense fallback={null}>
          <PdfImportSheet onClose={() => setPdfImporting(false)} />
        </Suspense>
      )}
      {filtering && (
        <FilterSheet facets={facets} value={filters} onChange={setFilters} onClose={() => setFiltering(false)} />
      )}
      {exporting && (
        <ExportPreview
          people={list}
          filters={filters}
          filterLabel={filterLabel}
          searchTerm={q}
          onClose={() => setExporting(false)}
        />
      )}
      {dirPrinting && (
        <Suspense fallback={null}>
          <DirectoryPrintPreview
            people={list}
            filters={filters}
            filterLabel={filterLabel}
            searchTerm={q}
            onClose={() => setDirPrinting(false)}
          />
        </Suspense>
      )}

      <Fab label="Add person" onClick={() => setEditing(null)} />
    </div>
  );
}

/* ------------------------------- manifest ------------------------------ */

export default {
  id: 'directory',
  title: 'Directory',
  icon: Contact,
  accent: 'var(--accent-notes)',
  tier: 'integrated',
  routes: [{ path: '/directory', element: <DirectoryScreen /> }],

  today: () => [],           // a lookup, not a to-do

  renderRef: (record) => <span className="ref-chip">{record.title}</span>,

  search: ({ repo }, q) =>
    allPeople(repo)
      .filter((p) => matchesPerson(p, q))
      .slice(0, 12)
      .map((p) => ({
        id: p.id,
        title: p.title,
        sub: [p.data.designation, p.data.personal ? p.data.company : (p.data.ext && `ext ${p.data.ext}`)]
          .filter(Boolean).join(' · '),
        to: `/directory?view=${p.id}`,
      })),

  quickActions: [{ id: 'find-person', label: 'Find someone', icon: Contact, to: '/directory' }],
};
