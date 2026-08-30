import { useState } from 'react';
import { Check, Plus, ChevronRight } from 'lucide-react';
import { Sheet, Button } from '../../../core/ui/components';
import { runRange, forecast, getDay, STATUS, hm, dparse, PROJECTION_SCENARIOS } from '../lib/overtimeEngine';
import { HHMMField } from './HHMMField';
import { ProjectionDetails } from './ProjectionDetails';
import { AddEntrySheet } from './AddEntrySheet';

const fmt = (k) => dparse(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const dowShort = (k) => dparse(k).toLocaleDateString(undefined, { weekday: 'short' });
const money = (n, cfg) => `${cfg.currency} ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Day-by-day view with per-entry approval — HANDOVER.md calls this "where
 * supervisors spend their time." Approvals are written back through
 * `patchDay`, which merges into the day record's `appr` map — separate from
 * the punch data, so re-importing attendance never loses a decision made here.
 */
export function PersonView({
  employee, ctx, period, asOf, cfg, dayOf, patchDay, addManualEntry,
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

  const setApproval = (day, rec, patch) => {
    const raw = dayOf(employee.no, day.d) || {};
    const appr = { ...(raw.appr || {}) };
    const cur = appr[rec.id] || { app: rec.app, appMin: rec.appMin };
    appr[rec.id] = { ...cur, ...patch };
    patchDay(employee.no, day.d, { appr });
  };

  const approveWholeDay = (day, on) => {
    const raw = dayOf(employee.no, day.d) || {};
    const appr = { ...(raw.appr || {}) };
    day.recs.forEach((rec) => { appr[rec.id] = { app: on, appMin: on ? (rec.appMin || rec.min) : 0 }; });
    patchDay(employee.no, day.d, { appr });
  };

  const setStatus = (dateKey, status) => patchDay(employee.no, dateKey, { status });

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

      {r.days.map((day) => (
        <div key={day.d} className={`ot-day ${day.holiday ? 'is-holiday' : day.isOff ? 'is-off' : ''}`}>
          <div className="ot-day-head">
            <span className="d">
              {day.d} <span className="ot-dow">({dowShort(day.d)})</span>
              {day.holiday && <span className="ot-day-badge is-holiday">{day.holidayName || 'Friday'}</span>}
              {!day.holiday && day.isOff && <span className="ot-day-badge is-off">Off day</span>}
            </span>
            <select
              className="ot-status-select"
              value={getDay(employee, day.d, ctx).status}
              onChange={(e) => setStatus(day.d, e.target.value)}
              aria-label={`Status for ${day.d}`}
            >
              {Object.entries(STATUS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
            </select>
            <span className="meta">duty {hm(day.duty)} · extra {hm(day.extra)} · genOT {hm(day.genOT)} · pubOT {hm(day.pubOT)}</span>
          </div>
          {day.open && (
            <p className="ot-sub ot-incomplete-note">
              <span className="ot-chip-warn">Incomplete</span> No check-out on file for card-in at {day.openIn.join(', ')}. Nothing claimed for it.
            </p>
          )}
          {day.recs.length > 0 && (
            <>
              {day.recs.map((rec) => (
                <div key={rec.id} className="ot-rec-block">
                  <div className="ot-rec">
                    <span className="win mono">{rec.s}–{rec.e}</span>
                    <span className="mono">{hm(rec.min)}</span>
                    <span className="ot-rec-approve">
                      {rec.app ? (
                        <button
                          type="button" className="ot-approved-btn"
                          onClick={() => setApproval(day, rec, { app: false })}
                          aria-label={`Approved ${hm(rec.appMin)} — click to reopen`}
                        >
                          <Check size={12} /> {hm(rec.appMin)}
                        </button>
                      ) : (
                        <HHMMField
                          minutes={rec.appMin}
                          onCommit={(mins) => setApproval(day, rec, { appMin: mins })}
                          aria-label={`Approved minutes for ${rec.s}-${rec.e}`}
                        />
                      )}
                    </span>
                    <span className="ot-rec-action">
                      {!rec.app && (
                        <Button size="sm" variant="primary" onClick={() => setApproval(day, rec, { app: true, appMin: rec.appMin || rec.min })}>Approve</Button>
                      )}
                    </span>
                    <span className="ot-sub">
                      {rec.kind === 'callout' && 'call-out'}
                      {rec.kind === 'manual' && 'manual'}
                    </span>
                  </div>
                  <input
                    type="text"
                    className="ot-reason-input"
                    defaultValue={rec.note}
                    placeholder="Reason (optional)"
                    aria-label={`Reason for ${rec.s}-${rec.e}`}
                    onBlur={(e) => { if (e.target.value !== rec.note) setApproval(day, rec, { note: e.target.value }); }}
                  />
                </div>
              ))}
              {day.recs.length > 1 && (
                <div style={{ marginTop: 6 }}>
                  <Button size="sm" onClick={() => approveWholeDay(day, !day.approved)}>
                    {day.approved ? 'Reopen day' : 'Approve whole day'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      ))}

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
