import { SectionLabel } from '../../../core/ui/components';
import { hm, dparse, PROJECTION_SCENARIOS } from '../lib/overtimeEngine';

const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);
const fmtWeekOf = (k) => dparse(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Unit-wide totals for the current period, plus a weekly load bar per
 * employee for the week containing `asOf` — the two questions HANDOVER.md
 * says the overview exists to answer: "how much so far" and "where will
 * this land."
 */
export function UnitOverview({
  rows, cfg, weekRows, weekStartKey, elapsedDays, totalDays, asOf, periodTo, onSelect,
  defaultScenario, onSetDefaultScenario,
}) {
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
          <div className="v">{hm(actualGen + actualPub)}</div>
          <div className="ot-sub">{hm(actualPub)} holiday · {hm(actualGen)} general</div>
          <div className="ot-sub">averaging {actualPct.toFixed(1)}% of basic salary</div>
        </div>
        <div className="ot-stat accent-slate">
          <div className="k">Projected full period</div>
          <div className="v">{hm(projGen + projPub)}</div>
          <div className="ot-sub">{elapsedDays} of {totalDays} days elapsed · {confidence}% confidence</div>
          <div className="ot-sub">averaging {projPct.toFixed(1)}% of basic salary</div>
          <div className="ot-scenario-picker" role="tablist" aria-label="Default projection scenario for every staff member">
            {Object.entries(PROJECTION_SCENARIOS).map(([key, s]) => (
              <button
                key={key} type="button" role="tab" aria-selected={defaultScenario === key}
                className={`ot-scenario-btn ${defaultScenario === key ? 'is-on' : ''}`}
                onClick={() => onSetDefaultScenario(key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="ot-sub">Default for everyone — a staff member pinned to a different scenario keeps it until this changes.</div>
        </div>
        <div className={`ot-stat accent-red ${projPct >= (cfg.alertPct || 50) ? 'warn' : ''}`}>
          <div className="k">Projected cost</div>
          <div className="v">{cfg.currency} {projAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="ot-sub">{cfg.currency} {actualAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} earned to date</div>
        </div>
        <div className="ot-stat accent-teal">
          <div className="k">Approved</div>
          <div className="v">{hm(approvedGen + approvedPub)}</div>
          <div className="ot-sub">{cfg.currency} {approvedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cleared</div>
          {waitingDays > 0 && <div className="ot-sub ot-pct-bad">{waitingDays} day{waitingDays === 1 ? '' : 's'} waiting</div>}
        </div>
      </div>

      <SectionLabel>Highest projected overtime</SectionLabel>
      <p className="ot-sub" style={{ marginBottom: 4 }}>
        <span style={{ color: '#B87400' }}>■</span> booked so far, <span style={{ opacity: .6 }}>■</span> still to come
      </p>
      <div className="ot-rank-row" style={{ borderTop: 0, cursor: 'default', paddingBottom: 6 }}>
        <span />
        <span />
        <span className="ot-sub" style={{ textAlign: 'right' }}>to {fmtWeekOf(asOf)}</span>
        <span className="ot-sub" style={{ textAlign: 'right' }}>projected to {fmtWeekOf(periodTo)}</span>
      </div>
      <div className="ot-rank-list" style={{ marginBottom: 'var(--sp-5)' }}>
        {[...rows].sort((a, b) => (b.fc.projected.genOT + b.fc.projected.pubOT) - (a.fc.projected.genOT + a.fc.projected.pubOT))
          .map((r) => {
            const actualMin = r.fc.actual.genOT + r.fc.actual.pubOT;
            const projMin = r.fc.projected.genOT + r.fc.projected.pubOT;
            const maxProj = Math.max(...rows.map((x) => x.fc.projected.genOT + x.fc.projected.pubOT), 1);
            const totalWidth = (projMin / maxProj) * 100;
            const bookedWidth = projMin > 0 ? totalWidth * (actualMin / projMin) : 0;
            return (
              <div key={r.e.no} className="ot-rank-row" onClick={() => onSelect(r.e)}>
                <div className="ot-name-cell">
                  <span className="ot-name">{r.e.name}</span>
                  <span className="ot-sub">{r.e.desig || '—'}</span>
                </div>
                <div className="ot-rank-bar">
                  <span className="booked" style={{ width: `${bookedWidth}%` }} />
                  <span className="remaining" style={{ width: `${Math.max(0, totalWidth - bookedWidth)}%` }} />
                </div>
                <div className="ot-rank-figures">
                  <span className="h">{hm(actualMin)}</span>
                  <span className="pct">{r.fc.actual.pct.toFixed(1)}%</span>
                </div>
                <div className="ot-rank-figures">
                  <span className="h">{hm(projMin)}</span>
                  <span className={`pct ${r.fc.projected.pct >= (cfg.alertPct || 50) ? 'ot-pct-bad' : ''}`}>{r.fc.projected.pct.toFixed(1)}%</span>
                </div>
              </div>
            );
          })}
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
                <span>{hm(scale)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
