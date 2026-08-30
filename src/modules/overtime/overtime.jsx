import { useMemo, useState } from 'react';
import { Timer, Upload, SlidersHorizontal, CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '../../core/ui/components';
import { useOvertimeConfig, CONFIG_TYPE } from './state/useOvertimeConfig';
import { useOvertimeStaff, STAFF_META_TYPE } from './state/useOvertimeStaff';
import { useOvertimeDays, DAY_TYPE } from './state/useOvertimeDays';
import { useOvertimeProjections, PROJECTION_TYPE } from './state/useOvertimeProjections';
import {
  DEF_CFG, SEED_HOLIDAYS, dkey, dparse, periodFor, periodShift, runRange, runWeek, forecast, weekStart, daysBetween,
} from './lib/overtimeEngine';
import { UnitOverview } from './components/UnitOverview';
import { OvertimeReport } from './components/OvertimeReport';
import { StaffTable } from './components/StaffTable';
import { ApprovalsQueue } from './components/ApprovalsQueue';
import { PersonView } from './components/PersonView';
import { ImportSheet } from './components/ImportSheet';
import { AddEntrySheet } from './components/AddEntrySheet';
import { RulesSheet } from './components/RulesSheet';
import { CalendarSheet } from './components/CalendarSheet';
import './overtime.css';

function OvertimeScreen() {
  const { cfg, holidays, updateCfg, setHolidays } = useOvertimeConfig();
  const { employees } = useOvertimeStaff();
  const { dayOf, patchDay, addManualEntry } = useOvertimeDays();
  const { projectionFor, setScenario, setOverride, clearOverride, clearAllOverrides } = useOvertimeProjections();

  const [period, setPeriod] = useState(() => periodFor(dkey(new Date())));
  const [rangeMode, setRangeMode] = useState('cycle'); // 'cycle' | 'custom'
  const [customFrom, setCustomFrom] = useState(period.from);
  const [customTo, setCustomTo] = useState(period.to);
  const [asOfOverride, setAsOfOverride] = useState(null);
  const [unitFilter, setUnitFilter] = useState('ALL');
  const [view, setView] = useState('overview'); // 'overview' | 'staff' | 'approvals' | 'report'
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const shiftPeriod = (n) => {
    setPeriod((p) => periodShift(p, n));
    setAsOfOverride(null);
    setRangeMode('cycle');
  };

  const startCustomRange = () => {
    setCustomFrom(period.from);
    setCustomTo(period.to);
    setRangeMode('custom');
  };

  const fmtRangeLabel = (from, to) => {
    const f = dparse(from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const t = dparse(to).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    return `${f} – ${t}`;
  };

  const range = useMemo(() => {
    if (rangeMode === 'custom' && customFrom && customTo && customFrom <= customTo) {
      return { from: customFrom, to: customTo, label: fmtRangeLabel(customFrom, customTo) };
    }
    return period;
  }, [rangeMode, customFrom, customTo, period]);

  const asOf = useMemo(() => {
    const today = dkey(new Date());
    const natural = today < range.from ? range.from : (today > range.to ? range.to : today);
    const wanted = asOfOverride || natural;
    return wanted < range.from ? range.from : (wanted > range.to ? range.to : wanted);
  }, [range, asOfOverride]);

  const ctx = useMemo(() => ({ cfg, holidays, dayOf }), [cfg, holidays, dayOf]);

  const units = useMemo(() => [...new Set(
    employees.filter((e) => e.active && e.unit).map((e) => e.unit)
  )].sort(), [employees]);

  const activeEmployees = useMemo(() => employees.filter((e) => e.active
    && (unitFilter === 'ALL' || e.unit === unitFilter)), [employees, unitFilter]);

  /**
   * `fc.actual` is "so far" (real recorded days, up to `asOf`); `fc.projected`
   * re-runs the same engine with the rest of the period modelled — these are
   * two different quantities and both matter, so both are computed once here
   * rather than approximated from a single range query.
   */
  const rows = useMemo(() => activeEmployees.map((e) => ({
    e,
    fc: forecast(e, range.from, range.to, asOf, ctx, projectionFor(e.no)),
    approved: runRange(e, range.from, asOf, ctx, { approved: true }),
  })), [activeEmployees, range, ctx, asOf, projectionFor]);

  const currentWeekStart = useMemo(() => weekStart(asOf), [asOf]);
  const weekRows = useMemo(() => activeEmployees.map((e) => ({
    e, week: runWeek(e, currentWeekStart, ctx),
  })), [activeEmployees, currentWeekStart, ctx]);

  const periodElapsedDays = daysBetween(range.from, asOf) + 1;
  const periodTotalDays = daysBetween(range.from, range.to) + 1;

  return (
    <div className="page">
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div>
          <h1 className="page-title serif">Overtime</h1>
          <p className="page-sub">{range.label}</p>
        </div>
        {rangeMode === 'cycle' && (
          <div style={{ display: 'flex', gap: 6 }}>
            <Button size="sm" onClick={() => shiftPeriod(-1)} aria-label="Previous period"><ChevronLeft size={15} /></Button>
            <Button size="sm" onClick={() => shiftPeriod(1)} aria-label="Next period"><ChevronRight size={15} /></Button>
          </div>
        )}
      </div>

      {/* Applies across Overview, Staff and Approvals alike — one range and
          one unit, not re-picked per tab. */}
      <div className="ot-filterbar">
        <label className="ot-filter">
          <span className="eyebrow">Period</span>
          <select
            value={rangeMode}
            onChange={(e) => (e.target.value === 'custom' ? startCustomRange() : setRangeMode('cycle'))}
          >
            <option value="cycle">{period.label}</option>
            <option value="custom">Custom range…</option>
          </select>
        </label>
        {rangeMode === 'custom' && (
          <div className="ot-range-inputs">
            <label className="ot-filter">
              <span className="eyebrow">From</span>
              <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <span>→</span>
            <label className="ot-filter">
              <span className="eyebrow">To</span>
              <input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </div>
        )}
        <label className="ot-filter">
          <span className="eyebrow">Actuals to</span>
          <input
            type="date" value={asOf}
            min={range.from} max={range.to}
            onChange={(e) => setAsOfOverride(e.target.value || null)}
          />
        </label>
        {units.length > 1 && (
          <label className="ot-filter">
            <span className="eyebrow">Unit</span>
            <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
              <option value="ALL">All units</option>
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={() => setImportOpen(true)}><Upload size={14} /> Import</Button>
        <Button size="sm" onClick={() => setCalendarOpen(true)}><CalendarDays size={14} /> Holidays</Button>
        <Button size="sm" onClick={() => setRulesOpen(true)}><SlidersHorizontal size={14} /> Rules</Button>
        <Button size="sm" onClick={() => setAddEntryOpen(true)}><Plus size={14} /> Add entry</Button>
      </div>

      <div className="ot-tabs" role="tablist">
        {[['overview', 'Overview'], ['staff', 'Staff'], ['approvals', 'Approvals'], ['report', 'Overtime']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} className={`ot-tab ${view === id ? 'is-on' : ''}`} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      {view === 'overview' && (
        <UnitOverview
          rows={rows} cfg={cfg} weekRows={weekRows} weekStartKey={currentWeekStart}
          elapsedDays={periodElapsedDays} totalDays={periodTotalDays}
          asOf={asOf} periodTo={range.to} onSelect={setSelectedPerson}
        />
      )}
      {view === 'staff' && <StaffTable rows={rows} cfg={cfg} asOf={asOf} periodTo={range.to} onSelect={setSelectedPerson} />}
      {view === 'approvals' && (
        <ApprovalsQueue rows={rows} cfg={cfg} dayOf={dayOf} patchDay={patchDay} onOpenPerson={setSelectedPerson} />
      )}
      {view === 'report' && <OvertimeReport employees={activeEmployees} ctx={ctx} cfg={cfg} period={range} />}

      {selectedPerson && (
        <PersonView
          employee={selectedPerson} ctx={ctx} period={range} asOf={asOf} cfg={cfg}
          dayOf={dayOf} patchDay={patchDay} addManualEntry={addManualEntry}
          projection={projectionFor(selectedPerson.no)}
          onSetScenario={(scenario) => setScenario(selectedPerson.no, scenario)}
          onSetOverride={(date, mins) => setOverride(selectedPerson.no, date, mins)}
          onClearOverride={(date) => clearOverride(selectedPerson.no, date)}
          onClearAllOverrides={() => clearAllOverrides(selectedPerson.no)}
          onClose={() => setSelectedPerson(null)}
        />
      )}
      {importOpen && <ImportSheet onClose={() => setImportOpen(false)} />}
      {addEntryOpen && (
        <AddEntrySheet employees={activeEmployees} ctx={ctx} onAdd={addManualEntry} onClose={() => setAddEntryOpen(false)} />
      )}
      {rulesOpen && <RulesSheet cfg={cfg} onUpdate={updateCfg} onClose={() => setRulesOpen(false)} />}
      {calendarOpen && <CalendarSheet holidays={holidays} onSave={setHolidays} onClose={() => setCalendarOpen(false)} />}
    </div>
  );
}

const personLinkId = (record) => record.links?.find((l) => l.rel === 'person')?.id || null;

/**
 * Standing alerts, not day-scoped agenda items — projected overtime cost and
 * pending approvals don't have a natural single due date the way a payment
 * or reminder does. Raised through core/notify's shared feed (HANDOVER.md
 * §8b/§8d) rather than core/dashboardRegistry, which expects a real dated
 * record per item; nothing here needs a core-file change.
 */
function raiseEvents({ repo }) {
  const cfgRecord = repo.query({ type: CONFIG_TYPE })[0];
  const cfg = { ...DEF_CFG, ...(cfgRecord?.data?.cfg || {}) };
  const holidaysMap = cfgRecord?.data?.holidays || Object.fromEntries(SEED_HOLIDAYS);
  const metas = repo.query({ type: STAFF_META_TYPE });
  const rosterByPersonId = new Map(
    repo.query({ type: 'roster.staff' }).map((r) => [personLinkId(r), r])
  );
  const dayByKey = new Map(
    repo.query({ type: DAY_TYPE }).filter((r) => r.data.date)
      .map((r) => [`${personLinkId(r)}|${r.data.date}`, r.data])
  );
  const projByPerson = new Map(
    repo.query({ type: PROJECTION_TYPE }).map((r) => [personLinkId(r), r.data])
  );
  const ctx = { cfg, holidays: holidaysMap, dayOf: (no, d) => dayByKey.get(`${no}|${d}`) };

  const today = dkey(new Date());
  const period = periodFor(today);
  const notices = [];
  let openCount = 0, pendingCount = 0;

  metas.forEach((m) => {
    const personId = personLinkId(m);
    if (!personId || m.data.active === false) return;
    const person = repo.get(personId);
    const roster = rosterByPersonId.get(personId);
    const emp = {
      no: personId, name: person?.title || 'Unknown',
      staffType: m.data.staffType, dutyMin: m.data.dutyMin, dutyDays: m.data.dutyDays,
      basic: roster?.data.salary || 0,
    };
    const r = runRange(emp, period.from, period.to, ctx, {});
    r.days.forEach((d) => { if (d.open) openCount++; pendingCount += d.recs.filter((x) => !x.app).length; });
    if (!roster) return;
    const fc = forecast(emp, period.from, period.to, today, ctx, projByPerson.get(personId) || {});
    if (fc.projected.pct >= (cfg.alertPct || 50)) {
      notices.push({
        title: 'Projected overtime alert',
        body: `${emp.name} is projected at ${fc.projected.pct.toFixed(0)}% of basic this period`,
        url: '/overtime', kind: 'alert',
        dedupeKey: `overtime:proj:${personId}:${period.from}`,
      });
    }
  });

  if (openCount > 0) {
    notices.push({
      title: 'Open attendance sessions',
      body: `${openCount} day(s) with no check-out on file`,
      url: '/overtime', kind: 'alert', dedupeKey: `overtime:open:${today}`,
    });
  }
  if (pendingCount > 0) {
    notices.push({
      title: 'Overtime approvals pending',
      body: `${pendingCount} entries awaiting approval`,
      url: '/overtime', kind: 'reminder', dedupeKey: `overtime:pending:${today}`,
    });
  }
  return notices;
}

export default {
  id: 'overtime',
  title: 'Overtime',
  icon: Timer,
  accent: 'var(--accent-overtime)',
  tier: 'integrated',
  routes: [{ path: '/overtime', element: <OvertimeScreen /> }],
  quickActions: [{ id: 'overtime-import', label: 'Import attendance', icon: Upload, to: '/overtime' }],
  raiseEvents,
};
