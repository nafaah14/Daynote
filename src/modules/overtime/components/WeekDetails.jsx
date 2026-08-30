import { Sheet, Button } from '../../../core/ui/components';
import { hm, dparse, addD } from '../lib/overtimeEngine';
import { HHMMField } from './HHMMField';

const dowLong = (k) => dparse(k).toLocaleDateString(undefined, { weekday: 'long' });
const fmt = (k) => dparse(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const TYPE_LABEL = { holiday: 'Friday / public holiday', sat: 'Saturday / off day', gen: 'Rostered duty day', none: 'Not scheduled' };

/**
 * Sun-Sat drill-down for one week of a projection — opened by clicking a
 * week row in ProjectionDetails. Actual days are read-only (they're history,
 * not a model); modelled days show the estimate the scenario multiplier
 * produced and let a supervisor override it (e.g. "this particular week is
 * an overhaul week"), with a per-day reset back to that computed default.
 */
export function WeekDetails({ employee, week, asOf, dayModel, onSetOverride, onClearOverride, onClose }) {
  const days = week.days;

  return (
    <Sheet open onClose={onClose} title={`${fmt(week.start)} – ${fmt(addD(week.start, 6))} · ${employee.name}`}>
      {days.map((day) => {
        const isActual = day.d <= asOf;
        const model = dayModel[day.d];
        return (
          <div key={day.d} className="ot-week-day">
            <div className="ot-week-day-head">
              <span className="d">{dowLong(day.d)} <span className="ot-sub">{fmt(day.d)}</span></span>
              <span className={`ot-week-tag ${isActual ? 'actual' : 'modelled'}`}>{isActual ? 'actual' : 'modelled'}</span>
            </div>
            <div className="ot-sub">
              {day.holiday ? (day.holidayName || 'Friday') : model ? TYPE_LABEL[model.type] : 'Recorded'}
            </div>
            {isActual ? (
              <div className="ot-week-day-val mono">{hm(day.otRec)}</div>
            ) : (
              <div className="ot-week-day-edit">
                <HHMMField
                  minutes={model ? model.usedMin : day.otRec}
                  onCommit={(mins) => onSetOverride(day.d, mins)}
                  aria-label={`Estimate for ${fmt(day.d)}`}
                />
                {model?.overridden ? (
                  <Button size="sm" onClick={() => onClearOverride(day.d)}>Reset to default</Button>
                ) : (
                  <span className="ot-sub">default: {hm(model ? model.modelledMin : 0)}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Sheet>
  );
}
