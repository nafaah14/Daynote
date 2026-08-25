import { useState, useMemo, useRef } from 'react';
import {
  Building2, Search, X, Plus, Trash2,
  Upload, Crown, ChevronDown, ChevronUp, Printer, Download,
  RefreshCw, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import { allPeople, matchesPerson } from '../../core/people';
import {
  Card, SectionLabel, EmptyState, Button, Sheet,
} from '../../core/ui/components';
import {
  UNIT_TYPE, META_TYPE, UNIT_COLORS, allUnits, getMeta, getDeptName,
  deptStaff, unitStaff, unitTotals, deptTotals, importJson, exportJson,
  auditStructure, syncUnitPositions,
  unitFields, metaFields, nextColor, uid,
} from './orgData';
import { RichField } from './RichField';
import { OrgPrintPreview, StaffPrintPreview } from './OrgPrint';
import './orgstructure.css';

export const TYPE = UNIT_TYPE;

/* ================================ TABS ================================ */

function TabBar({ tab, setTab }) {
  const tabs = [
    { id: 'structure', label: 'Structure' },
    { id: 'purpose', label: 'Purpose & Services' },
    { id: 'staff', label: 'Staff' },
  ];
  return (
    <div className="org-tabs" data-no-swipe>
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`org-tab ${tab === t.id ? 'is-active' : ''}`}
          onClick={() => setTab(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ================================ STRUCTURE TAB ======================== */

function SummaryStrip({ units }) {
  const t = deptTotals(units);
  return (
    <div className="org-summary">
      <div className="org-sum-card"><span className="org-sum-num">{t.existing}</span><span className="org-sum-lbl">Existing</span></div>
      <div className="org-sum-card org-sum-vacant"><span className="org-sum-num">{t.vacant}</span><span className="org-sum-lbl">Vacant</span></div>
      <div className="org-sum-card org-sum-total"><span className="org-sum-num">{t.total}</span><span className="org-sum-lbl">Headcount</span></div>
      <div className="org-sum-card"><span className="org-sum-num">{units.length}</span><span className="org-sum-lbl">Units</span></div>
    </div>
  );
}

function UnitCard({ unit, repo, deptPeople, audit }) {
  const [expanded, setExpanded] = useState(true);
  const t = unitTotals(unit);
  const color = UNIT_COLORS[unit.data.color] || UNIT_COLORS.elec;
  const hasIssue = audit?.unitMismatch?.has(unit.id);

  // Unit head dropdown: filter people in this unit
  const staffInUnit = unitStaff(deptPeople, unit.data.name);
  const headPerson = staffInUnit.find((p) => p.data.isUnitHead);
  const actualStaffCount = staffInUnit.length;

  const updatePos = (posId, field, value) => {
    const positions = unit.data.positions.map((p) =>
      p.id === posId ? { ...p, [field]: field === 'title' ? value : (Number(value) || 0) } : p
    );
    repo.update(unit.id, { data: { ...unit.data, positions } });
  };

  const addPos = () => {
    const positions = [...unit.data.positions, { id: uid(), title: '', existing: 0, vacant: 0 }];
    repo.update(unit.id, { data: { ...unit.data, positions } });
  };

  const removePos = (posId) => {
    const positions = unit.data.positions.filter((p) => p.id !== posId);
    repo.update(unit.id, { data: { ...unit.data, positions } });
  };

  const handleSync = () => {
    const positions = syncUnitPositions(unit, deptPeople);
    repo.update(unit.id, { data: { ...unit.data, positions } });
  };

  const setHead = (personId) => {
    staffInUnit.forEach((p) => {
      if (p.data.isUnitHead && p.id !== personId) {
        repo.update(p.id, { data: { ...p.data, isUnitHead: false } });
      }
    });
    if (personId) {
      const person = staffInUnit.find((p) => p.id === personId);
      if (person) {
        repo.update(person.id, { data: { ...person.data, isUnitHead: true } });
        repo.update(unit.id, { data: { ...unit.data, head: `${person.title} (${person.data.designation})` } });
      }
    } else {
      repo.update(unit.id, { data: { ...unit.data, head: '' } });
    }
  };

  return (
    <Card className={`org-unit-card ${hasIssue ? 'org-unit-mismatch' : ''}`}>
      <div className="org-unit-head" style={{ background: color.bg }}>
        <div>
          <h3 className="org-unit-title">{unit.data.name}</h3>
          {unit.data.head && <div className="org-unit-headperson">{unit.data.head}</div>}
        </div>
        <button
          className="org-unit-toggle"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <>
          <div className="org-unit-totals">
            <span className={t.existing !== actualStaffCount ? 'org-mismatch-text' : ''}>
              Existing <b>{t.existing}</b>
              {t.existing !== actualStaffCount && <span className="org-mismatch-note"> (directory: {actualStaffCount})</span>}
            </span>
            <span>Vacant <b>{t.vacant}</b></span>
            <span>Total <b>{t.total}</b></span>
            {hasIssue && (
              <button type="button" className="org-sync-btn" onClick={handleSync} title="Sync existing counts from staff directory">
                <RefreshCw size={13} /> Sync from staff
              </button>
            )}
          </div>

          <div className="org-unit-field">
            <label className="eyebrow">Unit Head</label>
            <select
              className="org-select"
              value={headPerson?.id || ''}
              onChange={(e) => setHead(e.target.value)}
            >
              <option value="">— Select unit head —</option>
              {staffInUnit.sort((a, b) => a.title.localeCompare(b.title)).map((p) => (
                <option key={p.id} value={p.id}>{p.title} ({p.data.designation})</option>
              ))}
            </select>
          </div>

          <div className="org-pos-table-wrap">
            <table className="org-pos-table">
              <colgroup>
                <col />
                <col style={{ width: 72 }} />
                <col style={{ width: 72 }} />
                <col style={{ width: 60 }} />
                <col style={{ width: 36 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Position / Job Title</th>
                  <th style={{ textAlign: 'center' }}>Existing</th>
                  <th style={{ textAlign: 'center' }}>Vacant</th>
                  <th style={{ textAlign: 'center' }}>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {unit.data.positions.map((pos) => {
                  const pm = audit?.posMismatch?.get(pos.id);
                  return (
                    <tr key={pos.id} className={pm ? 'org-pos-mismatch' : ''}>
                      <td>
                        <input
                          type="text"
                          className="org-pos-input"
                          value={pos.title}
                          onChange={(e) => updatePos(pos.id, 'title', e.target.value)}
                          placeholder="Job title"
                        />
                      </td>
                      <td>
                        <input type="number" className={`org-pos-num ${pm ? 'org-pos-num-warn' : ''}`} value={pos.existing} onChange={(e) => updatePos(pos.id, 'existing', e.target.value)} min={0} />
                        {pm && <div className="org-pos-actual">dir: {pm.actual}</div>}
                      </td>
                      <td><input type="number" className="org-pos-num" value={pos.vacant} onChange={(e) => updatePos(pos.id, 'vacant', e.target.value)} min={0} /></td>
                      <td className="org-pos-total">{(pos.existing || 0) + (pos.vacant || 0)}</td>
                      <td>
                        <button className="org-pos-del" onClick={() => removePos(pos.id)} title="Remove"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="org-unit-foot">
            <Button size="sm" variant="outline" onClick={addPos}><Plus size={13} /> Add position</Button>
            <Button size="sm" variant="danger" onClick={() => {
              if (confirm(`Remove "${unit.data.name}" from the structure?`)) repo.softDelete(unit.id);
            }}>
              <Trash2 size={13} /> Remove unit
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function StructureTab({ units, repo, deptPeople, audit }) {
  const addUnit = () => {
    const name = prompt('New unit name:');
    if (!name) return;
    repo.create(UNIT_TYPE, {
      title: name,
      data: unitFields({
        name,
        color: nextColor(units),
        sortOrder: units.length,
      }),
    });
  };

  return (
    <>
      <SummaryStrip units={units} />
      <div className="org-units-grid">
        {units.map((u) => <UnitCard key={u.id} unit={u} repo={repo} deptPeople={deptPeople} audit={audit} />)}
      </div>
      <div style={{ marginTop: 12 }}>
        <Button variant="outline" onClick={addUnit}><Plus size={14} /> Add unit</Button>
      </div>
    </>
  );
}

/* ================================ PURPOSE TAB ========================= */

function PurposeTab({ units, repo }) {
  return (
    <div className="org-purpose-grid">
      {units.map((u) => {
        const color = UNIT_COLORS[u.data.color] || UNIT_COLORS.elec;
        return (
          <Card key={u.id} className="org-purpose-card">
            <div className="org-unit-head" style={{ background: color.bg }}>
              <h3 className="org-unit-title">{u.data.name}</h3>
            </div>
            <div className="org-purpose-body">
              <label className="eyebrow">Purpose</label>
              <RichField
                value={u.data.purpose || ''}
                onChange={(html) => repo.update(u.id, { data: { ...u.data, purpose: html } })}
                placeholder="What this unit exists to do…"
              />
              <label className="eyebrow" style={{ marginTop: 12 }}>Services</label>
              <RichField
                value={u.data.services || ''}
                onChange={(html) => repo.update(u.id, { data: { ...u.data, services: html } })}
                placeholder="Services this unit delivers…"
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ================================ STAFF TAB =========================== */

function StaffTab({ deptPeople, units, repo, meta }) {
  const [q, setQ] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [filterJob, setFilterJob] = useState('');
  const [staffPrinting, setStaffPrinting] = useState(false);
  const unitNames = useMemo(() => units.map((u) => u.data.name).sort(), [units]);

  const jobs = useMemo(() => {
    const pool = filterUnit
      ? deptPeople.filter((p) => p.data.unit === filterUnit)
      : deptPeople;
    return [...new Set(pool.map((p) => p.data.designation).filter(Boolean))].sort();
  }, [deptPeople, filterUnit]);

  const list = useMemo(() => {
    const term = q.trim();
    return deptPeople
      .filter((p) => !filterUnit || p.data.unit === filterUnit)
      .filter((p) => !filterJob || p.data.designation === filterJob)
      .filter((p) => !term || matchesPerson(p, term))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [deptPeople, q, filterUnit, filterJob]);

  const changeUnit = (personId, newUnit) => {
    const person = deptPeople.find((p) => p.id === personId);
    if (!person) return;
    // If they were unit head of the old unit, clear it
    const data = { ...person.data, unit: newUnit };
    if (person.data.isUnitHead && person.data.unit !== newUnit) {
      data.isUnitHead = false;
    }
    repo.update(personId, { data });
  };

  return (
    <>
      <Card className="capture-card" style={{ marginBottom: 12 }}>
        <div className="capture">
          <Search size={15} style={{ color: 'var(--muted)', flex: 'none' }} />
          <input
            className="capture-input"
            placeholder="Search name or staff ID"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && <button className="icon-btn" onClick={() => setQ('')} aria-label="Clear"><X size={15} /></button>}
        </div>
      </Card>

      <div className="org-staff-filters">
        <select className="org-select" value={filterUnit} onChange={(e) => { setFilterUnit(e.target.value); setFilterJob(''); }}>
          <option value="">All units</option>
          {unitNames.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select className="org-select" value={filterJob} onChange={(e) => setFilterJob(e.target.value)}>
          <option value="">All designations</option>
          {jobs.map((j) => <option key={j} value={j}>{j}</option>)}
        </select>
        <button className="sort-pill" onClick={() => setStaffPrinting(true)}>
          <Printer size={13} style={{ verticalAlign: '-2px' }} /> Print staff list
        </button>
      </div>

      <SectionLabel right={<span className="mono count">{list.length}</span>}>
        Staff
      </SectionLabel>

      <Card>
        {list.length === 0 ? (
          <EmptyState icon={Building2} title="No staff match" body="Try a different search or filter." />
        ) : (
          <div className="org-staff-list">
            {list.slice(0, 200).map((p) => (
              <div key={p.id} className="org-staff-row">
                <div className="org-staff-info">
                  <span className="org-staff-name">
                    {p.data.isUnitHead && <Crown size={11} className="dir-head-icon" />}
                    {p.title}
                  </span>
                  <span className="org-staff-sub">{p.data.designation}</span>
                </div>
                <span className="org-staff-sid mono">{p.data.sid}</span>
                <select
                  className="org-select org-unit-sel"
                  value={p.data.unit || ''}
                  onChange={(e) => changeUnit(p.id, e.target.value)}
                >
                  <option value="">— Unassigned —</option>
                  {unitNames.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </Card>
      {list.length > 200 && (
        <p className="settings-note">Showing first 200. Narrow with search or a filter.</p>
      )}
      {staffPrinting && (
        <StaffPrintPreview
          units={units}
          deptPeople={deptPeople}
          meta={meta}
          filterUnit={filterUnit}
          onClose={() => setStaffPrinting(false)}
        />
      )}
    </>
  );
}

/* ================================ IMPORT SHEET ======================== */

function ImportSheet({ onClose, repo, people }) {
  const fileRef = useRef();
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = importJson(repo, people, reader.result);
        setDone(result);
      } catch (err) {
        setError(err?.message || 'Could not import that file.');
      }
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  if (done) {
    return (
      <Sheet open onClose={onClose} title="Import complete"
        footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <div className="import-result">
          <p><strong className="mono">{done.unitCount}</strong> units imported</p>
          <p><strong className="mono">{done.staffAssigned}</strong> staff assigned to units in your directory</p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Import org structure"
      footer={<Button onClick={onClose}>Cancel</Button>}>
      <p className="settings-note" style={{ marginTop: 0 }}>
        Upload the JSON file exported from the org structure app. It will replace the current
        structure (units, positions, purpose &amp; services) and assign each staff member to
        their unit in your directory by matching Staff ID. Staff already in your directory
        whose unit isn't in the JSON keep their existing assignment.
      </p>
      {error && <p className="settings-error">{error}</p>}
      <Button variant="outline" onClick={() => fileRef.current?.click()}>
        <Upload size={15} /> Choose JSON file
      </Button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
    </Sheet>
  );
}

/* ================================ AUDIT BANNER ======================== */

function AuditBanner({ audit }) {
  const [expanded, setExpanded] = useState(false);
  const { issues } = audit;

  if (issues.length === 0) {
    return (
      <div className="org-audit org-audit-ok">
        <CheckCircle2 size={15} />
        <span>Structure matches the staff directory.</span>
      </div>
    );
  }

  return (
    <div className="org-audit org-audit-warn">
      <button type="button" className="org-audit-head" onClick={() => setExpanded(!expanded)}>
        <AlertTriangle size={15} />
        <span>
          <strong>{issues.length}</strong> {issues.length === 1 ? 'discrepancy' : 'discrepancies'} between structure and staff directory
        </span>
        <span className="org-audit-toggle">{expanded ? 'Hide ▴' : 'Show ▾'}</span>
      </button>
      {expanded && (
        <ul className="org-audit-list">
          {issues.map((msg, i) => <li key={i}>{msg}</li>)}
        </ul>
      )}
    </div>
  );
}

/* ================================ SCREEN ============================== */

export function OrgStructureScreen() {
  const repo = useRepo();
  const [tab, setTab] = useState('structure');
  const [importing, setImporting] = useState(false);
  const [printing, setPrinting] = useState(false);

  const units = allUnits(repo);
  const meta = getMeta(repo);
  const dept = getDeptName(repo);
  const people = allPeople(repo);
  const deptPpl = useMemo(() => deptStaff(people, dept), [people, dept]);

  // Ensure meta record exists
  if (!meta && repo.all.length > 0) {
    // First load — create the singleton
    repo.create(META_TYPE, { title: 'Org Meta', data: metaFields() });
  }

  const handleExport = () => {
    const json = exportJson(units, meta, deptPpl);
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `org_structure_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const audit = useMemo(() => auditStructure(units, deptPpl), [units, deptPpl]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Org Structure</h1>
          <p className="page-sub">{dept}</p>
        </div>
      </div>

      {units.length > 0 && <AuditBanner audit={audit} />}

      <div className="org-toolbar" data-no-swipe>
        <button className="sort-pill" onClick={() => setImporting(true)}>
          <Upload size={13} style={{ verticalAlign: '-2px' }} /> Import
        </button>
        <button className="sort-pill" onClick={handleExport}>
          <Download size={13} style={{ verticalAlign: '-2px' }} /> Export
        </button>
        <button className="sort-pill" onClick={() => setPrinting(true)}>
          <Printer size={13} style={{ verticalAlign: '-2px' }} /> Print
        </button>
      </div>

      <TabBar tab={tab} setTab={setTab} />

      {tab === 'structure' && <StructureTab units={units} repo={repo} deptPeople={deptPpl} audit={audit} />}
      {tab === 'purpose' && <PurposeTab units={units} repo={repo} />}
      {tab === 'staff' && <StaffTab deptPeople={deptPpl} units={units} repo={repo} meta={meta} />}

      {importing && <ImportSheet onClose={() => setImporting(false)} repo={repo} people={people} />}
      {printing && <OrgPrintPreview units={units} meta={meta} deptPeople={deptPpl} onClose={() => setPrinting(false)} />}
    </div>
  );
}

/* ================================ MANIFEST ============================ */

export default {
  id: 'orgstructure',
  title: 'Org Structure',
  icon: Building2,
  accent: 'var(--accent-notes)',
  tier: 'integrated',
  routes: [{ path: '/orgstructure', element: <OrgStructureScreen /> }],
  search: () => [],
  quickActions: [],
};
