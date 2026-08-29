import { useMemo, useState } from 'react';
import { Timer, Upload, SlidersHorizontal, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../core/ui/components';
import { useOvertimeConfig, CONFIG_TYPE } from './state/useOvertimeConfig';
import { useOvertimeStaff, STAFF_META_TYPE } from './state/useOvertimeStaff';
import { useOvertimeDays, DAY_TYPE } from './state/useOvertimeDays';
import {
  DEF_CFG, SEED_HOLIDAYS, dkey, periodFor, periodShift, runRange, runWeek, forecast, weekStart, daysBetween,
} from './lib/overtimeEngine';
import { UnitOverview } from './components/UnitOverview';
import { StaffTable } from './components/StaffTable';
import { ApprovalsQueue } from './components/ApprovalsQueue';
import { PersonView } from './components/PersonView';
import { ImportSheet } from './components/ImportSheet';
import { RulesSheet } from './components/RulesSheet';
import { CalendarSheet } from './components/CalendarSheet';
import './overtime.css';

function OvertimeScreen() {
  const { cfg, holidays, updateCfg, setHolidays } = useOvertimeConfig();
  const { employees } = useOvertimeStaff();
  const { dayOf, patchDay } = useOvertimeDays();

  const [period, setPeriod] = useState(() => periodFor(dkey(new Date())));
  const [view, setView] = useState('overview'); // 'overview' | 'approvals'
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const asOf = useMemo(() => {
    const today = dkey(new Date());
    return today < period.from ? period.from : (today > period.to ? period.to : today);
  }, [period]);

  const ctx = useMemo(() => ({ cfg, holidays, dayOf }), [cfg, holidays, dayOf]);
  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);

  /**
   * `fc.actual` is "so far" (real recorded days, up to `asOf`); `fc.projected`
   * re-runs the same engine with the rest of the period modelled — these are
   * two different quantities and both matter, so both are computed once here
   * rather than approximated from a single range query.
   */
  const rows = useMemo(() => activeEmployees.map((e) => ({
    e,
    fc: forecast(e, period.from, period.to, asOf, ctx),
    approved: runRange(e, period.from, asOf, ctx, { approved: true }),
  })), [activeEmployees, period, ctx, asOf]);

  const currentWeekStart = useMemo(() => weekStart(asOf), [asOf]);
  const weekRows = useMemo(() => activeEmployees.map((e) => ({
    e, week: runWeek(e, currentWeekStart, ctx),
  })), [activeEmployees, currentWeekStart, ctx]);

  const periodElapsedDays = daysBetween(period.from, asOf) + 1;
  const periodTotalDays = daysBetween(period.from, period.to) + 1;

  return (
    <div className="page">
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div>
          <h1 className="page-title serif">Overtime</h1>
          <p className="page-sub">{period.label}</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" onClick={() => setPeriod((p) => periodShift(p, -1))} aria-label="Previous period"><ChevronLeft size={15} /></Button>
          <Button size="sm" onClick={() => setPeriod((p) => periodShift(p, 1))} aria-label="Next period"><ChevronRight size={15} /></Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={() => setImportOpen(true)}><Upload size={14} /> Import</Button>
        <Button size="sm" onClick={() => setCalendarOpen(true)}><CalendarDays size={14} /> Holidays</Button>
        <Button size="sm" onClick={() => setRulesOpen(true)}><SlidersHorizontal size={14} /> Rules</Button>
      </div>

      <div className="ot-tabs" role="tablist">
        {[['overview', 'Overview'], ['staff', 'Staff'], ['approvals', 'Approvals']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} className={`ot-tab ${view === id ? 'is-on' : ''}`} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      {view === 'overview' && (
        <UnitOverview
          rows={rows} cfg={cfg} weekRows={weekRows} weekStartKey={currentWeekStart}
          elapsedDays={periodElapsedDays} totalDays={periodTotalDays}
        />
      )}
      {view === 'staff' && <StaffTable rows={rows} cfg={cfg} onSelect={setSelectedPerson} />}
      {view === 'approvals' && (
        <ApprovalsQueue rows={rows} cfg={cfg} dayOf={dayOf} patchDay={patchDay} onOpenPerson={setSelectedPerson} />
      )}

      {selectedPerson && (
        <PersonView
          employee={selectedPerson} ctx={ctx} period={period}
          dayOf={dayOf} patchDay={patchDay}
          onClose={() => setSelectedPerson(null)}
        />
      )}
      {importOpen && <ImportSheet onClose={() => setImportOpen(false)} />}
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
    const fc = forecast(emp, period.from, period.to, today, ctx);
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
