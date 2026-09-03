import { useState } from 'react';
import { Sheet, Button } from '../../../core/ui/components';
import { hm, dparse, addD, PROJECTION_SCENARIOS } from '../lib/overtimeEngine';
import { WeekDetails } from './WeekDetails';

const fmt = (k) => dparse(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const money = (n, cfg) => `${cfg.currency} ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Shows the arithmetic behind "Projected to X" instead of asking for trust:
 * what the remaining days are modelled on (this person's own averages,
 * scaled by whichever scenario is picked, per HANDOVER.md's forecast note),
 * then the same week-by-week 48h-line walk the engine actually ran, actual
 * weeks marked apart from modelled ones. Click a week to drill into its
 * Sun-Sat days and adjust any single day's estimate.
 */
export function ProjectionDetails({ employee, fc, asOf, cfg, onSetOverride, onClearOverride, onResetAll, onClose }) {
  const [openWeekStart, setOpenWeekStart] = useState(null);
  const { actual, projected, remaining, avgGen, avgHol, avgSat, scenario, mult, dayModel } = fc;
  const actualMin = actual.genOT + actual.pubOT;
  const projMin = projected.genOT + projected.pubOT;
  const remainingDays = remaining.genDays + remaining.holDays + remaining.satDays;
  const hasOverrides = Object.values(dayModel).some((m) => m.overridden);

  const rows = [
    { label: 'Fridays & public holidays', hint: 'every hour paid at ×' + cfg.publicMult, days: remaining.holDays, avg: avgHol * mult },
    { label: 'Rostered duty days', hint: 'only hours past the 48h line are paid', days: remaining.genDays, avg: avgGen * mult },
    { label: 'Saturdays & other off days', hint: 'whole day counted from card-in', days: remaining.satDays, avg: avgSat * mult },
  ];

  const openWeek = projected.weeks.find((w) => w.start === openWeekStart);

  return (
    <Sheet open wide onClose={onClose} title={`Projection · ${employee.name}`}>
      <p>
        Booked so far is <strong>{hm(actualMin)}</strong>, which is <strong>{actual.pct.toFixed(1)}%</strong> of basic.
        Modelling the {remainingDays} remaining days under the <strong>{PROJECTION_SCENARIOS[scenario].label}</strong> scenario
        lands at <strong>{hm(projMin)}</strong>, or <strong>{projected.pct.toFixed(1)}%</strong> — about{' '}
        <strong>{money(projected.amount, cfg)}</strong> on a {money(employee.basic, cfg)} basic.
      </p>
      {hasOverrides && (
        <Button size="sm" onClick={onResetAll}>Reset all custom estimates to default</Button>
      )}

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
      <p className="ot-sub">Click a week to see its Sun–Sat days and adjust any modelled estimate.</p>
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
                <tr key={w.start} className="ot-proj-week-row" onClick={() => setOpenWeekStart(w.start)}>
                  <td>
                    {fmt(w.start)} – {fmt(weekEnd)}{' '}
                    <span className={`ot-week-tag ${isActual ? 'actual' : 'modelled'}`}>{isActual ? 'actual' : 'modelled'}</span>
                  </td>
                  <td className="num mono">{hm(w.total)}</td>
                  <td><span className={`ot-line-tag ${w.crossed ? 'crossed' : 'under'}`}>{w.crossed ? 'crossed' : 'under'}</span></td>
                  <td className="num mono">{hm(genOT)}</td>
                  <td className="num mono">{hm(pubOT)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openWeek && (
        <WeekDetails
          employee={employee} week={openWeek} asOf={asOf} dayModel={dayModel}
          onSetOverride={onSetOverride} onClearOverride={onClearOverride}
          onClose={() => setOpenWeekStart(null)}
        />
      )}
    </Sheet>
  );
}
