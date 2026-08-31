import { Sheet } from '../../../core/ui/components';
import { hm, dparse, addD, attendanceLabel, isDutyDay, dkey } from '../lib/overtimeEngine';

const dowLong = (k) => dparse(k).toLocaleDateString(undefined, { weekday: 'long' });
const fmt = (k) => dparse(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const dutyWindow = (day, emp, cfg) => {
  if (day.schedS && day.schedE) return `${day.schedS}–${day.schedE}`;
  return isDutyDay(day, emp, cfg) ? `${cfg.dutyStart}–${cfg.dutyEnd}` : '—';
};

/**
 * Read-only Sun-Sat drill-down for one week of the attendance calendar —
 * distinct from `WeekDetails.jsx`, which is a *different*, editable popup
 * used by projections. Nothing here writes anything: it's a quick glance
 * at how a week's total was built up, not a place to change it.
 */
export function WeekAttendanceDetails({ employee, week, weekNumber, cfg, ctx, onClose }) {
  const todayKey = dkey(new Date());
  const total = week.total;
  const pct = cfg.weeklyThresholdMin > 0 ? (total / cfg.weeklyThresholdMin) * 100 : 0;
  const scale = Math.max(total, cfg.weeklyThresholdMin * 1.1, 1);
  const dutySum = week.days.reduce((s, d) => s + d.duty, 0);
  const genSum = week.days.reduce((s, d) => s + d.genOT, 0);
  const pubSum = week.days.reduce((s, d) => s + d.pubOT, 0);
  const workedSum = week.days.reduce((s, d) => s + d.duty + d.extra, 0);
  const extraSum = week.days.reduce((s, d) => s + d.extra, 0);
  const rosteredDays = week.days.filter((d) => isDutyDay(d, employee, cfg)).length;

  return (
    <Sheet open wide onClose={onClose} title={`Week ${weekNumber} · ${fmt(week.start)} – ${fmt(addD(week.start, 6))}`}>
      <p>
        <strong style={{ fontSize: 20 }}>{hm(total)}</strong> of {hm(cfg.weeklyThresholdMin)} target
        {' — '}<strong style={{ color: pct >= 100 ? 'var(--in, #1a8f5e)' : undefined }}>{pct.toFixed(0)}%</strong>
      </p>
      <div className="ot-bar" style={{ marginBottom: 6 }}>
        <span className="seg duty" style={{ width: `${(dutySum / scale) * 100}%` }} />
        <span className="seg gen" style={{ width: `${(genSum / scale) * 100}%` }} />
        <span className="seg pub" style={{ width: `${(pubSum / scale) * 100}%` }} />
        <span className="line48" style={{ left: `${(cfg.weeklyThresholdMin / scale) * 100}%` }} />
      </div>
      <p className="ot-sub" style={{ marginBottom: 16 }}>
        Duty hours {hm(dutySum)} · Extra hrs {hm(extraSum)} · Rostered {rosteredDays} days
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table className="ot-proj-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Duty</th>
              <th>Status</th>
              <th className="num">Worked</th>
              <th className="num">Duty hrs</th>
              <th className="num">Extra hrs</th>
              <th className="num">Running</th>
            </tr>
          </thead>
          <tbody>
            {week.days.map((day) => {
              const hasRecord = !!ctx.dayOf(employee.no, day.d);
              const status = attendanceLabel(day, employee, cfg, hasRecord, todayKey);
              return (
                <tr key={day.d}>
                  <td>{dowLong(day.d)}<div className="ot-sub">{fmt(day.d)}</div></td>
                  <td className="mono">{dutyWindow(day, employee, cfg)}</td>
                  <td><span className={`ot-attn-chip ${status.key}`}>{status.label}</span></td>
                  <td className="num mono">{hm(day.duty + day.extra)}</td>
                  <td className="num mono">{hm(day.duty)}</td>
                  <td className="num mono">{hm(day.extra)}</td>
                  <td className="num mono">{hm(day.cumAfter)}</td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={3}><strong>Week total</strong></td>
              <td className="num mono"><strong>{hm(workedSum)}</strong></td>
              <td className="num mono"><strong>{hm(dutySum)}</strong></td>
              <td className="num mono"><strong>{hm(extraSum)}</strong></td>
              <td className="num mono"><strong>{hm(total)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="ot-sub">
        <strong>Running</strong> is the week-to-date total — extra hours are paid once it passes the
        weekly threshold. A day marked Off duty or Leave adds nothing toward that threshold, but its
        hours (if any were worked anyway) still count toward the running total.
      </p>
    </Sheet>
  );
}
