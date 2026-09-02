import { useState } from 'react';
import { Plus, ChevronRight } from 'lucide-react';
import { Sheet, Button } from '../../../core/ui/components';
import { runRange, forecast, hm, dparse, dkey, periodFor, periodShift, PROJECTION_SCENARIOS } from '../lib/overtimeEngine';
import { ProjectionDetails } from './ProjectionDetails';
import { AddEntrySheet } from './AddEntrySheet';
import { AttendanceView } from './AttendanceView';

const fmt = (k) => dparse(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const money = (n, cfg) => `${cfg.currency} ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * One person's overtime at a glance: stat tiles up top (so far / projected /
 * projected pay / approved), an attendance calendar and worked-hours
 * breakdown below (`AttendanceView`). Entry-level approval and day-status
 * editing live elsewhere now — approvals on the Approvals tab's
 * Pending/Approved toggle, status editing behind a click on a calendar day
 * — this sheet is a "check on this person" view, not the editing surface.
 *
 * The period nav lives here, not in `AttendanceView` — the tiles up top are
 * meant to describe whatever period the roster calendar below is showing,
 * so paging that calendar has to move the summary with it rather than
 * leaving the two disagreeing about which period is on screen.
 */
export function PersonView({
  employee, ctx, period, cfg, recordFor, patchDay, addManualEntry, addManualPunch, setPunchDeleted,
  projection, defaultScenario, onSetScenario, onSetOverride, onClearOverride, onClearAllOverrides,
  onClose,
}) {
  const [projectionOpen, setProjectionOpen] = useState(false);
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [calPeriod, setCalPeriod] = useState(period);

  const todayKey = dkey(new Date());
  // Same clamp the main Overtime page uses for its own `asOf`: today, pulled
  // inside whichever period is on screen — a fully past period's "so far"
  // is just the whole thing, a future one hasn't started.
  const calAsOf = todayKey < calPeriod.from ? calPeriod.from : (todayKey > calPeriod.to ? calPeriod.to : todayKey);

  const pinned = projection.scenario != null;
  const effectiveScenario = projection.scenario ?? defaultScenario;
  const fc = forecast(employee, calPeriod.from, calPeriod.to, calAsOf, ctx, { scenario: effectiveScenario, overrides: projection.overrides });
  const approvedRange = runRange(employee, calPeriod.from, calAsOf, ctx, { approved: true });
  const r = fc.actual;

  return (
    <Sheet open wide onClose={onClose} title={employee.name}>
      <p className="ot-sub">{employee.sid} · {employee.desig || '—'} · {employee.staffType === 'duty' ? 'Duty staff' : 'Maintenance staff'}</p>

      <div className="ot-stats" style={{ marginTop: 12 }}>
        <div className="ot-stat accent-amber">
          <div className="k">OT to {fmt(calAsOf)}</div>
          <div className="v">{r.pct.toFixed(1)}<small>%</small></div>
          <div className="ot-sub">{hm(r.genOT + r.pubOT)} — {hm(r.pubOT)} holiday · {hm(r.genOT)} general</div>
        </div>
        <div className="ot-stat accent-slate">
          <div className="k">Projected to {fmt(calPeriod.to)}</div>
          <div className="v">{fc.projected.pct.toFixed(1)}<small>%</small></div>
          <div className="ot-sub">{hm(fc.projected.genOT + fc.projected.pubOT)} overtime</div>
          <div className="ot-scenario-picker" role="tablist" aria-label="Projection scenario">
            {Object.entries(PROJECTION_SCENARIOS).map(([key, s]) => (
              <button
                key={key} type="button" role="tab" aria-selected={effectiveScenario === key}
                className={`ot-scenario-btn ${effectiveScenario === key ? 'is-on' : ''}`}
                onClick={() => onSetScenario(key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="ot-sub">
            {pinned ? (
              <>Pinned to this scenario — <button className="ot-link-btn" onClick={() => onSetScenario(null)}>use the Overview default instead</button></>
            ) : 'Following the Overview default'}
          </div>
          <button className="ot-link-btn" style={{ fontSize: 11.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 2 }} onClick={() => setProjectionOpen(true)}>
            How this was projected <ChevronRight size={12} />
          </button>
        </div>
        <div className={`ot-stat accent-red ${fc.projected.pct >= (cfg.alertPct || 50) ? 'warn' : ''}`}>
          <div className="k">Projected pay</div>
          <div className="v">{money(fc.projected.amount, cfg)}</div>
          <div className="ot-sub">{fc.projected.pct.toFixed(1)}% of {money(employee.basic, cfg)} basic</div>
        </div>
        <div className="ot-stat accent-teal">
          <div className="k">Approved</div>
          <div className="v">{approvedRange.pct.toFixed(1)}<small>%</small></div>
          <div className="ot-sub">{money(approvedRange.amount, cfg)} cleared</div>
          {r.pending > 0 && <div className="ot-sub ot-pct-bad">{hm(r.pending)} pending</div>}
        </div>
      </div>

      <div style={{ margin: '4px 0 10px' }}>
        <Button size="sm" onClick={() => setAddEntryOpen(true)}><Plus size={14} /> Add entry</Button>
      </div>

      <AttendanceView
        employee={employee} ctx={ctx} cfg={cfg}
        calPeriod={calPeriod}
        onShiftPeriod={(n) => setCalPeriod((p) => periodShift(p, n))}
        onResetPeriod={() => setCalPeriod(periodFor(todayKey))}
        recordFor={recordFor} patchDay={patchDay} addManualPunch={addManualPunch} setPunchDeleted={setPunchDeleted}
      />

      {projectionOpen && (
        <ProjectionDetails
          employee={employee} fc={fc} asOf={calAsOf} cfg={cfg}
          onSetOverride={onSetOverride} onClearOverride={onClearOverride} onResetAll={onClearAllOverrides}
          onClose={() => setProjectionOpen(false)}
        />
      )}
      {addEntryOpen && (
        <AddEntrySheet
          employees={[employee]} ctx={ctx} defaultPersonId={employee.no}
          onAdd={addManualEntry} onClose={() => setAddEntryOpen(false)}
        />
      )}
    </Sheet>
  );
}
