import { Sheet, Button, Toggle } from '../../../core/ui/components';
import { runRange, hm } from '../lib/overtimeEngine';
import { HHMMField } from './HHMMField';

/**
 * Day-by-day view with per-entry approval — HANDOVER.md calls this "where
 * supervisors spend their time." Approvals are written back through
 * `patchDay`, which merges into the day record's `appr` map — separate from
 * the punch data, so re-importing attendance never loses a decision made here.
 */
export function PersonView({ employee, ctx, period, dayOf, patchDay, onClose }) {
  const r = runRange(employee, period.from, period.to, ctx, {});

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

  return (
    <Sheet open onClose={onClose} title={employee.name}>
      <p className="ot-sub">{employee.sid} · {employee.desig || '—'} · {employee.staffType === 'duty' ? 'Duty staff' : 'Maintenance staff'}</p>

      <div className="ot-stats" style={{ marginTop: 12 }}>
        <div className="ot-stat"><div className="k">General</div><div className="v">{hm(r.genOT)}</div></div>
        <div className="ot-stat"><div className="k">Holiday</div><div className="v">{hm(r.pubOT)}</div></div>
        <div className="ot-stat"><div className="k">Pending</div><div className="v">{hm(r.pending)}</div></div>
        <div className="ot-stat"><div className="k">Percent</div><div className="v">{r.pct.toFixed(1)}<small>%</small></div></div>
      </div>

      {r.days.map((day) => (
        <div key={day.d} className="ot-day">
          <div className="ot-day-head">
            <span className="d">{day.d} · {day.status}{day.holiday ? ` (${day.holidayName})` : ''}</span>
            <span className="meta">duty {hm(day.duty)} · extra {hm(day.extra)} · genOT {hm(day.genOT)} · pubOT {hm(day.pubOT)}</span>
          </div>
          {day.open && (
            <p className="ot-sub" style={{ color: 'var(--out, #c0392b)' }}>
              Open session — no check-out on file for card-in at {day.openIn.join(', ')}. Nothing claimed for it.
            </p>
          )}
          {day.recs.length > 0 && (
            <>
              {day.recs.map((rec) => (
                <div key={rec.id} className="ot-rec">
                  <span className="win">{rec.s}–{rec.e}</span>
                  <span className="mono">{hm(rec.min)}</span>
                  <HHMMField
                    className="ot-hhmm mono"
                    minutes={rec.appMin}
                    onCommit={(mins) => setApproval(day, rec, { appMin: mins })}
                    aria-label={`Approved minutes for ${rec.s}-${rec.e}`}
                  />
                  <Toggle
                    checked={!!rec.app}
                    onChange={(on) => setApproval(day, rec, { app: on, appMin: rec.appMin || rec.min })}
                    label={`Approve ${rec.s}-${rec.e}`}
                  />
                  {rec.kind === 'callout' && <span className="ot-sub">call-out</span>}
                </div>
              ))}
              {day.recs.length > 1 && (
                <div style={{ marginTop: 6 }}>
                  <Button size="sm" onClick={() => approveWholeDay(day, !day.approved)}>
                    {day.approved ? 'Unapprove day' : 'Approve whole day'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </Sheet>
  );
}
