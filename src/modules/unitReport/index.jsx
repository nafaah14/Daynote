import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ClipboardList, ArrowLeft, Trash2, FileText, FileSpreadsheet, Plus, ClipboardPaste, ArrowDownWideNarrow, Pencil, Upload, ListChecks, X,
} from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import {
  Card, SectionLabel, EmptyState, Button, Sheet, Field, Input, Select, Textarea, Chip, Row, Toggle, OptionRow,
} from '../../core/ui/components';
import { Fab, ReorderList } from '../../core/ui/extras';
import { PdfPreviewScreen } from '../../core/ui/PdfPreview';
import {
  REPORT_TYPE, SECTIONS, blankRow, monthName, addMonths, thisMonth, dmy, pctOf, sectionTitle,
  fileBase, nextMonthData, byStart, rowsFromText, CHECKS_TYPE, missingChecks,
} from './lib/report';
import { planImport, applyImport } from './lib/powerlog';
import ImportSheet from './ImportSheet';
import './unitReport.css';

/**
 * Monthly unit-head report — fill the month's tasks as they happen, then
 * export the meeting sheet as PDF or Excel in the office layout.
 */

const BASE = '/unit-report';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const download = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Open a route only after a closing Sheet's history pop has landed. */
const navAfterSheet = (nav, to) => {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', go);
    nav(to);
  };
  window.addEventListener('popstate', go);
  setTimeout(go, 400);
};

const reportsOf = (repo) => repo.query({ type: REPORT_TYPE })
  .sort((a, b) => (b.data?.month || '').localeCompare(a.data?.month || ''));

/** The standard routine checks; until they're set, the latest report's routine list. */
const standardChecks = (repo) => {
  const rec = repo.query({ type: CHECKS_TYPE })[0];
  if (rec) return rec.data?.items || [];
  return (reportsOf(repo)[0]?.data?.routine || []).map((r) => r.details).filter(Boolean);
};

const saveChecks = (repo, items) => {
  const rec = repo.query({ type: CHECKS_TYPE })[0];
  if (rec) repo.update(rec.id, { data: { ...rec.data, items } });
  else repo.create(CHECKS_TYPE, { title: 'Standard routine checks', data: { items } });
};

/* ---------------------------- standard checks ---------------------------- */

function ChecksSheet({ current, onClose }) {
  const repo = useRepo();
  const [items, setItems] = useState(standardChecks(repo));
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t || items.some((i) => i.toLowerCase() === t.toLowerCase())) return;
    setItems([...items, t]);
    setText('');
  };
  const fromReport = current.map((r) => r.details).filter(Boolean);
  return (
    <Sheet
      open onClose={onClose} title="Standard routine checks"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { saveChecks(repo, items); onClose(); }}>Save</Button>
        </>
      }
    >
      <p className="ur-hint">Every new report starts with these. On a report you can delete any of them, and pick them back from the dropdown.</p>
      <div className="ruled ur-checks">
        {items.map((c, i) => (
          <div key={c} className="ur-check">
            <span>{c}</span>
            <button className="icon-btn" aria-label={`Remove ${c}`} title="Remove" onClick={() => setItems(items.filter((_, j) => j !== i))}>
              <X size={15} />
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="ur-empty">No standard checks.</p>}
      </div>
      <div className="ur-check-add">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a check"
          onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button size="sm" onClick={add} disabled={!text.trim()}>Add</Button>
      </div>
      {fromReport.length > 0 && (
        <Button size="sm" variant="outline" onClick={() => setItems([...new Set([...items, ...fromReport])])}>
          Add this report's routine tasks
        </Button>
      )}
    </Sheet>
  );
}

/* ------------------------------ new month -------------------------------- */

function NewMonthSheet({ reports, onClose }) {
  const repo = useRepo();
  const nav = useNavigate();
  const latest = reports[0];
  const [month, setMonth] = useState(latest ? addMonths(latest.data.month, 1) : thisMonth());
  const [carry, setCarry] = useState(true);
  const [plans, setPlans] = useState(true);
  const [routine, setRoutine] = useState(true);
  const existing = reports.find((r) => r.data.month === month);
  const checks = standardChecks(repo);

  const create = () => {
    if (!month) return;
    if (existing) {
      onClose();
      navAfterSheet(nav, `${BASE}/${existing.id}`);
      return;
    }
    const data = nextMonthData(latest, month, { carry, plans, routine }, checks);
    const rec = repo.create(REPORT_TYPE, { title: monthName(month), data });
    onClose();
    navAfterSheet(nav, `${BASE}/${rec.id}`);
  };

  return (
    <Sheet
      open onClose={onClose} title="New monthly report"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={!month}>{existing ? 'Open it' : 'Create'}</Button>
        </>
      }
    >
      <Field label="Month" hint={existing ? `${monthName(month)} already has a report.` : undefined}>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </Field>
      {!existing && (
        <OptionRow title="Start routine with the standard checks" hint={`${checks.length} checks, no dates`}
          control={<Toggle checked={routine} onChange={setRoutine} label="Standard routine checks" />} />
      )}
      {latest && !existing && (
        <>
          <p className="ur-hint">Starts from {latest.title}: same department, unit and head.</p>
          <OptionRow title="Last month's plans become tasks" hint={`${(latest.data.planned || []).length} planned`}
            control={<Toggle checked={plans} onChange={setPlans} label="Plans become tasks" />} />
          <OptionRow title="Carry over tasks not at 100 %"
            control={<Toggle checked={carry} onChange={setCarry} label="Carry over unfinished" />} />
        </>
      )}
    </Sheet>
  );
}

/* ------------------------------ header sheet ----------------------------- */

function HeaderSheet({ report, onSave, onClose }) {
  const d = report.data;
  const [f, setF] = useState({ department: d.department || '', unit: d.unit || '', head: d.head || '', staff: String(d.staff ?? '') });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet
      open onClose={onClose} title="Report header"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { onSave({ ...f, staff: f.staff.trim() }); onClose(); }}>Save</Button>
        </>
      }
    >
      <Field label="Department name"><Input value={f.department} onChange={set('department')} placeholder="Male Power Generation Department" /></Field>
      <Field label="Unit name"><Input value={f.unit} onChange={set('unit')} placeholder="Electrical Services" /></Field>
      <Field label="Unit head (name / designation)"><Input value={f.head} onChange={set('head')} placeholder="Name / Chief Electrical Engineer" /></Field>
      <Field label="No. of staff"><Input value={f.staff} onChange={set('staff')} inputMode="numeric" /></Field>
    </Sheet>
  );
}

/* -------------------------------- row sheet ------------------------------ */

const PCTS = [0, 25, 50, 75, 100];

function RowSheet({ section, row, month, checks = [], onSave, onDelete, onClose }) {
  const isNew = !row;
  const inMonth = todayIso().startsWith(month);
  const [f, setF] = useState(row || blankRow({ start: section === 'tasks' && inMonth ? todayIso() : '' }));
  const [to, setTo] = useState(section);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const planned = to === 'planned';
  const ok = f.details.trim();
  const save = () => {
    if (!ok) return;
    onSave({ ...f, details: f.details.trim(), remarks: f.remarks.trim() }, to);
    onClose();
  };

  return (
    <Sheet
      open onClose={onClose} title={isNew ? 'Add task' : 'Edit task'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!ok}>{isNew ? 'Add' : 'Save'}</Button>
        </>
      }
    >
      {isNew && section === 'routine' && checks.length > 0 && (
        <Field label="Standard check" hint="Pick one this report doesn't have, or type your own below.">
          <Select value={checks.includes(f.details) ? f.details : ''} onChange={(e) => setF({ ...f, details: e.target.value })}>
            <option value="">Other — type it</option>
            {checks.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Details">
        <Textarea rows={2} value={f.details} onChange={set('details')} placeholder="DG4: Troubleshoot LT water pressure low shutdown" autoFocus={isNew && !(section === 'routine' && checks.length)} />
      </Field>
      {!planned && (
        <div className="ur-two">
          <Field label="Start date">
            <Input type="date" value={f.start} onChange={set('start')} />
          </Field>
          <Field label="Completed / estimated">
            <Input type="date" value={f.end} onChange={set('end')} />
          </Field>
        </div>
      )}
      {!planned && f.start && f.end !== f.start && (
        <div className="ur-chips"><Chip onClick={() => setF({ ...f, end: f.start })}>Same day</Chip></div>
      )}
      {!planned && (
        <Field label="Completion %">
          <div className="ur-pct">
            <Input value={f.pct} onChange={set('pct')} inputMode="numeric" placeholder="—" />
            {PCTS.map((p) => (
              <Chip key={p} tone={String(f.pct) === String(p) ? 'accent' : 'neutral'} onClick={() => setF({ ...f, pct: String(p) })}>{p}</Chip>
            ))}
          </div>
        </Field>
      )}
      <Field label="Remarks / additional notes">
        <Textarea rows={2} value={f.remarks} onChange={set('remarks')} placeholder="ESM replaced" />
      </Field>
      <Field label="Section">
        <Select value={to} onChange={(e) => setTo(e.target.value)}>
          {SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Select>
      </Field>
      {!isNew && <Button variant="danger" size="sm" onClick={() => { onDelete(); onClose(); }}>Delete task</Button>}
    </Sheet>
  );
}

/* ------------------------------- paste sheet ----------------------------- */

function PasteSheet({ onAdd, onClose }) {
  const [text, setText] = useState('');
  const rows = rowsFromText(text);
  return (
    <Sheet
      open onClose={onClose} title="Add several"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!rows.length} onClick={() => { onAdd(rows); onClose(); }}>
            Add {rows.length || ''}
          </Button>
        </>
      }
    >
      <Field label="One task per line" hint="Paste from notes or WhatsApp; leading numbers are dropped. Add dates after.">
        <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </Field>
    </Sheet>
  );
}

/* ------------------------------- one report ------------------------------ */

function rowMeta(key, r) {
  if (key === 'planned') return r.remarks || null;
  const dates = r.start || r.end
    ? (r.start === r.end || !r.end ? dmy(r.start || r.end) : `${dmy(r.start) || '…'} → ${dmy(r.end)}`)
    : 'No dates';
  return [dates, r.remarks].filter(Boolean).join(' · ');
}

export function ReportScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const repo = useRepo();
  const [editHead, setEditHead] = useState(false);
  const [editing, setEditing] = useState(null); // { section, row|null }
  const [pasting, setPasting] = useState(null); // section key
  const [pdf, setPdf] = useState(undefined); // undefined = closed, null = generating
  const [busy, setBusy] = useState('');
  const [importing, setImporting] = useState(null); // { source, plan }
  const [managing, setManaging] = useState(false);
  const fileRef = useRef(null);

  const report = repo.get(id);
  if (!report || report.deletedAt) {
    return (
      <div className="page">
        <Card>
          <EmptyState icon={ClipboardList} title="Report not found" body="It may have been deleted."
            action={<Button variant="outline" size="sm" onClick={() => nav(BASE)}>All reports</Button>} />
        </Card>
      </div>
    );
  }
  const d = report.data;
  const save = (patch) => repo.update(report.id, { title: monthName(d.month), data: { ...d, ...patch } });

  const saveRow = (from, row, to) => {
    const next = { ...d };
    const fromList = [...(d[from] || [])];
    const at = fromList.findIndex((r) => r.id === row.id);
    if (to === from) {
      if (at === -1) fromList.push(row); else fromList[at] = row;
      next[from] = fromList;
    } else {
      if (at !== -1) fromList.splice(at, 1);
      next[from] = fromList;
      next[to] = [...(d[to] || []), row];
    }
    save(next);
  };

  const removeRow = (key, rowId) => save({ [key]: (d[key] || []).filter((r) => r.id !== rowId) });

  const removeReport = () => {
    if (!window.confirm(`Delete the ${report.title} report?`)) return;
    repo.softDelete(report.id);
    nav(BASE);
  };

  const openPdf = async () => {
    setPdf(null);
    const { reportPdf } = await import('./lib/pdf');
    setPdf(reportPdf(d));
  };

  const excel = async () => {
    setBusy('xlsx');
    try {
      const { reportXlsx } = await import('./lib/xlsx');
      download(await reportXlsx(d), `${fileBase(d)}.xlsx`);
    } catch (err) {
      console.error('Excel export failed:', err);
      window.alert('Could not make the Excel file.');
    } finally {
      setBusy('');
    }
  };

  const pickPowerlog = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('import');
    try {
      const { readPowerlog } = await import('./lib/powerlogPdf');
      const source = await readPowerlog(file);
      setImporting({ source, plan: planImport(d, source.tasks, standardChecks(repo)) });
    } catch (err) {
      console.error('Powerlog import failed:', err);
      window.alert(err.message || 'Could not read that PDF.');
    } finally {
      setBusy('');
    }
  };

  const missing = missingChecks(standardChecks(repo), d.routine);

  const done = (d.tasks || []).filter((r) => pctOf(r) === 100).length;

  return (
    <div className="page">
      <button className="back" onClick={() => nav(BASE)}><ArrowLeft size={15} /> Monthly reports</button>
      <div className="page-head">
        <div>
          <h1 className="page-title serif">{monthName(d.month)}</h1>
          <p className="page-sub">{(d.tasks || []).length} tasks · {done} completed</p>
        </div>
        <div className="head-actions">
          <button className="icon-btn danger" aria-label="Delete report" title="Delete report" onClick={removeReport}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="ur-export">
        <Button variant="primary" size="sm" onClick={openPdf}><FileText size={14} /> PDF</Button>
        <Button variant="outline" size="sm" onClick={excel} disabled={busy === 'xlsx'}>
          <FileSpreadsheet size={14} /> {busy === 'xlsx' ? 'Making…' : 'Excel'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy === 'import'}>
          <Upload size={14} /> {busy === 'import' ? 'Reading…' : 'Import Powerlog'}
        </Button>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={pickPowerlog} />
      </div>

      <Card className="ur-head" onClick={() => setEditHead(true)}>
        <div className="ur-head-dept">{d.department || 'Department name'}</div>
        <div className="ur-head-line">{d.unit || 'Unit'} · {d.head || 'Unit head'} · {d.staff || '—'} staff</div>
        <Pencil size={14} className="ur-head-edit" />
      </Card>

      {SECTIONS.map((s) => {
        const rows = d[s.key] || [];
        return (
          <section key={s.key} className="ur-section">
            <SectionLabel
              right={
                <span className="ur-sec-actions">
                  {s.key === 'routine' && missing.length > 0 && (
                    <Chip onClick={() => save({ routine: [...rows, ...missing.map((details) => blankRow({ details }))] })}>
                      Add missing ({missing.length})
                    </Chip>
                  )}
                  {s.key === 'routine' && (
                    <button className="icon-btn" title="Standard routine checks" aria-label="Standard routine checks" onClick={() => setManaging(true)}>
                      <ListChecks size={15} />
                    </button>
                  )}
                  {s.key !== 'planned' && rows.length > 1 && (
                    <button className="icon-btn" title="Sort by start date" aria-label="Sort by start date"
                      onClick={() => save({ [s.key]: byStart(rows) })}>
                      <ArrowDownWideNarrow size={15} />
                    </button>
                  )}
                  <button className="icon-btn" title="Add several" aria-label="Add several" onClick={() => setPasting(s.key)}>
                    <ClipboardPaste size={15} />
                  </button>
                  <button className="icon-btn" title="Add" aria-label="Add" onClick={() => setEditing({ section: s.key, row: null })}>
                    <Plus size={16} />
                  </button>
                </span>
              }
            >
              <span className="ur-swatch" style={{ background: `#${s.fill}` }} />{sectionTitle(s.key, d.month)}
            </SectionLabel>
            <Card>
              {rows.length === 0 ? (
                <p className="ur-empty">Nothing yet.</p>
              ) : (
                <ReorderList
                  items={rows.map((r) => ({ ...r, label: r.details }))}
                  onReorder={(ids) => save({ [s.key]: ids.map((rid) => rows.find((r) => r.id === rid)) })}
                  renderItem={(r) => {
                    const p = pctOf(r);
                    return (
                      <button type="button" className="ur-row" onClick={() => setEditing({ section: s.key, row: r })}>
                        <span className="ur-n mono">{rows.findIndex((x) => x.id === r.id) + 1}</span>
                        <span className="ur-body">
                          <span className="ur-details">{r.details}</span>
                          {rowMeta(s.key, r) && <span className="ur-meta">{rowMeta(s.key, r)}</span>}
                        </span>
                        {s.key !== 'planned' && p != null && (
                          <span className={`ur-pctbadge mono ${p === 100 ? 'is-done' : ''}`}>{p}%</span>
                        )}
                      </button>
                    );
                  }}
                />
              )}
            </Card>
          </section>
        );
      })}

      {editHead && <HeaderSheet report={report} onSave={save} onClose={() => setEditHead(false)} />}
      {editing && (
        <RowSheet
          section={editing.section} row={editing.row} month={d.month} checks={missing}
          onSave={(row, to) => saveRow(editing.section, row, to)}
          onDelete={() => removeRow(editing.section, editing.row.id)}
          onClose={() => setEditing(null)}
        />
      )}
      {pasting && (
        <PasteSheet onAdd={(rows) => save({ [pasting]: [...(d[pasting] || []), ...rows] })} onClose={() => setPasting(null)} />
      )}
      {managing && <ChecksSheet current={d.routine || []} onClose={() => setManaging(false)} />}
      {importing && (
        <ImportSheet
          month={d.month} source={importing.source} plan={importing.plan}
          onApply={(plan) => save(applyImport(d, plan))}
          onClose={() => setImporting(null)}
        />
      )}
      {pdf !== undefined && (
        <PdfPreviewScreen title={report.title} blob={pdf} fileName={`${fileBase(d)}.pdf`} onClose={() => setPdf(undefined)} />
      )}
    </div>
  );
}

/* ------------------------------- all reports ----------------------------- */

export function ReportsScreen() {
  const repo = useRepo();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const reports = reportsOf(repo);

  return (
    <div className="page has-fab">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Monthly reports</h1>
          <p className="page-sub">Unit head meeting sheet — log tasks through the month, export PDF or Excel.</p>
        </div>
      </div>

      {reports.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No reports yet"
            body="Start this month's report. The next one copies the header, routine tasks and last month's plans."
            action={<Button variant="outline" size="sm" onClick={() => setCreating(true)}>New report</Button>}
          />
        </Card>
      ) : (
        <Card>
          <div className="ruled">
            {reports.map((r) => {
              const tasks = r.data?.tasks || [];
              return (
                <Row
                  key={r.id}
                  accent="var(--accent-unitreport)"
                  onClick={() => nav(`${BASE}/${r.id}`)}
                  title={monthName(r.data.month)}
                  meta={<span className="muted">{r.data.unit || 'Unit report'}</span>}
                  right={<span className="mono">{tasks.length} tasks</span>}
                />
              );
            })}
          </div>
        </Card>
      )}

      {creating && <NewMonthSheet reports={reports} onClose={() => setCreating(false)} />}
      <Fab label="New report" onClick={() => setCreating(true)} />
    </div>
  );
}

/* ------------------------------- manifest -------------------------------- */

export default {
  id: 'unitreport',
  title: 'Monthly Report',
  icon: ClipboardList,
  accent: 'var(--accent-unitreport)',
  tier: 'integrated',
  routes: [
    { path: BASE, element: <ReportsScreen /> },
    { path: `${BASE}/:id`, element: <ReportScreen /> },
  ],

  renderRef: (record) => <span className="ref-chip">{record.title}</span>,

  search: ({ repo }, q) => {
    const reports = reportsOf(repo);
    const hits = reports.filter((r) => r.title.toLowerCase().includes(q))
      .map((r) => ({ id: r.id, title: `${r.title} report`, sub: 'Monthly report', to: `${BASE}/${r.id}` }));
    for (const r of reports) {
      for (const s of SECTIONS) {
        for (const row of r.data?.[s.key] || []) {
          if ((row.details || '').toLowerCase().includes(q)) {
            hits.push({ id: `${r.id}-${row.id}`, title: row.details, sub: `${r.title} · ${s.label}`, to: `${BASE}/${r.id}` });
          }
        }
      }
    }
    return hits.slice(0, 30);
  },

  quickActions: [{ id: 'open-unitreport', label: 'Monthly report', icon: ClipboardList, to: BASE }],
};
