import { Sheet } from '../../../core/ui/components';
import { hm, hDec, dparse, addD } from '../lib/overtimeEngine';

const fmt = (k) => dparse(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const money = (n, cfg) => `${cfg.currency} ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Shows the arithmetic behind "Projected to X" instead of asking for trust:
 * what the remaining days are modelled on (this person's own averages,
 * per HANDOVER.md's forecast note), then the same week-by-week 48h-line
 * walk the engine actually ran, actual weeks marked apart from modelled ones.
 */
export function ProjectionDetails({ employee, fc, asOf, cfg, onClose }) {
  const { actual, projected, remaining, avgGen, avgHol, avgSat } = fc;
  const actualMin = actual.genOT + actual.pubOT;
  const projMin = projected.genOT + projected.pubOT;
  const remainingDays = remaining.genDays + remaining.holDays + remaining.satDays;

  const rows = [
    { label: 'Fridays & public holidays', hint: 'every hour paid at ×' + cfg.publicMult, days: remaining.holDays, avg: avgHol },
    { label: 'Rostered duty days', hint: 'only hours past the 48h line are paid', days: remaining.genDays, avg: avgGen },
    { label: 'Saturdays & other off days', hint: 'whole day counted from card-in', days: remaining.satDays, avg: avgSat },
  ];

  return (
    <Sheet open onClose={onClose} title={`Projection · ${employee.name}`}>
      <p>
        Booked so far is <strong>{hm(actualMin)}</strong>, which is <strong>{actual.pct.toFixed(1)}%</strong> of basic.
        The projection adds the {remainingDays} remaining days and lands at <strong>{hm(projMin)}</strong>, or{' '}
        <strong>{projected.pct.toFixed(1)}%</strong> — about <strong>{money(projected.amount, cfg)}</strong> on a{' '}
        {money(employee.basic, cfg)} basic.
      </p>

      <h3 className="ot-sub" style={{ fontWeight: 700, color: 'var(--ink)', marginTop: 18 }}>1 · What the remaining days are modelled on</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="ot-proj-table">
          <thead>
            <tr>
              <th>Day type ahead</th>
              <th className="num">Days left</th>
              <th className="num">Average each</th>
              <th className="num">Expected</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}<div className="ot-sub">{r.hint}</div></td>
                <td className="num mono">{r.days}</td>
                <td className="num mono">{hm(r.avg)}</td>
                <td className="num mono">{hm(r.avg * r.days)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ot-sub">
        Averages are this person's own, over the {actual.days.length} days already recorded — including days
        they did not come in, so someone who works two Fridays in four carries a Friday average of about half a shift.
      </p>

      <h3 className="ot-sub" style={{ fontWeight: 700, color: 'var(--ink)', marginTop: 18 }}>2 · Week by week, once the 48-hour line is applied</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="ot-proj-table">
          <thead>
            <tr>
              <th>Week</th>
              <th className="num">Counted</th>
              <th>48h line</th>
              <th className="num">General OT</th>
              <th className="num">Holiday OT</th>
            </tr>
          </thead>
          <tbody>
            {projected.weeks.map((w) => {
              const weekEnd = addD(w.start, 6);
              const isActual = weekEnd <= asOf;
              const genOT = w.days.reduce((s, d) => s + d.genOT, 0);
              const pubOT = w.days.reduce((s, d) => s + d.pubOT, 0);
              return (
                <tr key={w.start}>
                  <td>
                    {fmt(w.start)} – {fmt(weekEnd)}{' '}
                    <span className={`ot-week-tag ${isActual ? 'actual' : 'modelled'}`}>{isActual ? 'actual' : 'modelled'}</span>
                  </td>
                  <td className="num mono">{hDec(w.total)}h</td>
                  <td><span className={`ot-line-tag ${w.crossed ? 'crossed' : 'under'}`}>{w.crossed ? 'crossed' : 'under'}</span></td>
                  <td className="num mono">{hm(genOT)}</td>
                  <td className="num mono">{hm(pubOT)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}
