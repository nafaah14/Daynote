import { SectionLabel } from '../../../core/ui/components';
import { hDec, hm, dparse } from '../lib/overtimeEngine';

const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);
const fmtWeekOf = (k) => dparse(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Unit-wide totals for the current period, plus a weekly load bar per
 * employee for the week containing `asOf` — the two questions HANDOVER.md
 * says the overview exists to answer: "how much so far" and "where will
 * this land."
 */
export function UnitOverview({ rows, cfg, weekRows, weekStartKey, elapsedDays, totalDays }) {
  const actualGen = sum(rows, (r) => r.fc.actual.genOT);
  const actualPub = sum(rows, (r) => r.fc.actual.pubOT);
  const actualAmount = sum(rows, (r) => r.fc.actual.amount);
  const totalBasic = sum(rows, (r) => r.e.basic || 0);
  const actualPct = totalBasic > 0 ? (actualAmount / totalBasic) * 100 : 0;

  const projGen = sum(rows, (r) => r.fc.projected.genOT);
  const projPub = sum(rows, (r) => r.fc.projected.pubOT);
  const projAmount = sum(rows, (r) => r.fc.projected.amount);
  const projPct = totalBasic > 0 ? (projAmount / totalBasic) * 100 : 0;
  const confidence = totalDays > 0 ? Math.round((elapsedDays / totalDays) * 100) : 0;

  const approvedGen = sum(rows, (r) => r.approved.genOT);
  const approvedPub = sum(rows, (r) => r.approved.pubOT);
  const approvedAmount = sum(rows, (r) => r.approved.amount);
  const waitingDays = sum(rows, (r) => r.fc.actual.pendingDays);

  return (
    <>
      <div className="ot-stats">
        <div className="ot-stat accent-amber">
          <div className="k">OT so far</div>
          <div className="v">{hDec(actualGen + actualPub)}<small>h</small></div>
          <div className="ot-sub">{hm(actualPub)} holiday · {hm(actualGen)} general</div>
          <div className="ot-sub">averaging {actualPct.toFixed(1)}% of basic salary</div>
        </div>
        <div className="ot-stat accent-slate">
          <div className="k">Projected full period</div>
          <div className="v">{hDec(projGen + projPub)}<small>h</small></div>
          <div className="ot-sub">{elapsedDays} of {totalDays} days elapsed · {confidence}% confidence</div>
          <div className="ot-sub">averaging {projPct.toFixed(1)}% of basic salary</div>
        </div>
        <div className={`ot-stat accent-red ${projPct >= (cfg.alertPct || 50) ? 'warn' : ''}`}>
          <div className="k">Projected cost</div>
          <div className="v">{cfg.currency} {projAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="ot-sub">{cfg.currency} {actualAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} earned to date</div>
        </div>
        <div className="ot-stat accent-teal">
          <div className="k">Approved</div>
          <div className="v">{hDec(approvedGen + approvedPub)}<small>h</small></div>
          <div className="ot-sub">{cfg.currency} {approvedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cleared</div>
          {waitingDays > 0 && <div className="ot-sub ot-pct-bad">{waitingDays} day{waitingDays === 1 ? '' : 's'} waiting</div>}
        </div>
      </div>

      <SectionLabel>Weekly load — week of {fmtWeekOf(weekStartKey)}</SectionLabel>
      <p className="ot-sub" style={{ marginBottom: 10 }}>Hours accumulate until the 48h line; everything past it is overtime.</p>
      <div className="ot-load-list">
        {[...weekRows].sort((a, b) => b.week.total - a.week.total).map(({ e, week }) => {
          const genOT = week.days.reduce((s, d) => s + d.genOT, 0);
          const pubOT = week.days.reduce((s, d) => s + d.pubOT, 0);
          const duty = Math.max(0, week.total - genOT - pubOT);
          const scale = Math.max(week.total, cfg.weeklyThresholdMin * 1.35, 1);
          const pct = (n) => `${(n / scale) * 100}%`;
          const pastLine = Math.max(0, week.total - cfg.weeklyThresholdMin);
          return (
            <div key={e.no} className="ot-load-row">
              <div className="ot-load-head">
                <strong>{e.name}</strong>
                <span className="ot-sub">
                  {hm(week.total)} logged
                  {week.crossed ? <> · <strong>48h line crossed</strong> · {hm(pastLine)} past line</> : ' · under the line'}
                  {pubOT > 0 && <> · {hm(pubOT)} holiday OT</>}
                </span>
              </div>
              <div className="ot-bar">
                <span className="seg duty" style={{ width: pct(duty) }} />
                <span className="seg gen" style={{ width: pct(genOT) }} />
                <span className="seg pub" style={{ width: pct(pubOT) }} />
                <span className="line48" style={{ left: pct(cfg.weeklyThresholdMin) }} />
              </div>
              <div className="ot-load-scale">
                <span>0h</span>
                <span>{hDec(scale)}h</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
