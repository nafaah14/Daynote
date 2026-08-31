import { useState } from 'react';
import { Plus, ChevronRight } from 'lucide-react';
import { Sheet, Button } from '../../../core/ui/components';
import { runRange, forecast, hm, dparse, PROJECTION_SCENARIOS } from '../lib/overtimeEngine';
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
 */
export function PersonView({
  employee, ctx, period, asOf, cfg, patchDay, addManualEntry,
  projection, defaultScenario, onSetScenario, onSetOverride, onClearOverride, onClearAllOverrides,
  onClose,
}) {
  const [projectionOpen, setProjectionOpen] = useState(false);
  const [addEntryOpen, setAddEntryOpen] = useState(false);

  const pinned = projection.scenario != null;
  const effectiveScenario = projection.scenario ?? defaultScenario;
  const fc = forecast(employee, period.from, period.to, asOf, ctx, { scenario: effectiveScenario, overrides: projection.overrides });
  const approvedRange = runRange(employee, period.from, asOf, ctx, { approved: true });
  const r = fc.actual;

  return (
    <Sheet open wide onClose={onClose} title={employee.name}>
      <p className="ot-sub">{employee.sid} · {employee.desig || '—'} · {employee.staffType === 'duty' ? 'Duty staff' : 'Maintenance staff'}</p>

      <div className="ot-stats" style={{ marginTop: 12 }}>
        <div className="ot-stat accent-amber">
          <div className="k">OT to {fmt(asOf)}</div>
          <div className="v">{r.pct.toFixed(1)}<small>%</small></div>
          <div className="ot-sub">{hm(r.genOT + r.pubOT)} — {hm(r.pubOT)} holiday · {hm(r.genOT)} general</div>
        </div>
        <div className="ot-stat accent-slate">
          <div className="k">Projected to {fmt(period.to)}</div>
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

      <AttendanceView employee={employee} ctx={ctx} period={period} cfg={cfg} patchDay={patchDay} />

      {projectionOpen && (
        <ProjectionDetails
          employee={employee} fc={fc} asOf={asOf} cfg={cfg}
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
