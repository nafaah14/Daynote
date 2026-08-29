import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../../core/ui/components';
import { hm, money } from '../lib/overtimeEngine';

/** Unit-wide totals and the cost projection for the current salary period. */
export function UnitOverview({ period, onShiftPeriod, rows, cfg }) {
  const active = rows.length;
  const genOT = rows.reduce((s, r) => s + r.all.genOT, 0);
  const pubOT = rows.reduce((s, r) => s + r.all.pubOT, 0);
  const projectedCost = rows.reduce((s, r) => s + r.fc.projected.amount, 0);
  const overAlert = rows.filter((r) => r.fc.projected.pct >= (cfg.alertPct || 50)).length;

  return (
    <>
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div>
          <h1 className="page-title serif">Overtime</h1>
          <p className="page-sub">{period.label}</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" onClick={() => onShiftPeriod(-1)} aria-label="Previous period"><ChevronLeft size={15} /></Button>
          <Button size="sm" onClick={() => onShiftPeriod(1)} aria-label="Next period"><ChevronRight size={15} /></Button>
        </div>
      </div>

      <div className="ot-stats">
        <div className="ot-stat">
          <div className="k">Staff</div>
          <div className="v">{active}</div>
        </div>
        <div className="ot-stat">
          <div className="k">General OT</div>
          <div className="v">{hm(genOT)}</div>
        </div>
        <div className="ot-stat">
          <div className="k">Holiday OT</div>
          <div className="v">{hm(pubOT)}</div>
        </div>
        <div className={`ot-stat ${overAlert > 0 ? 'warn' : ''}`}>
          <div className="k">Projected cost</div>
          <div className="v">{cfg.currency} {money(projectedCost)}</div>
          {overAlert > 0 && <div className="ot-sub">{overAlert} over {cfg.alertPct}% of basic</div>}
        </div>
      </div>
    </>
  );
}
