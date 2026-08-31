import { Sheet, Field, Select } from '../../../core/ui/components';
import { STATUS, hm, dparse } from '../lib/overtimeEngine';

const fmtLong = (k) => dparse(k).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

/**
 * A single day's status, opened by clicking a cell in the attendance
 * calendar — deliberately small, since assigning "this day was leave" is a
 * quick one-field decision, not a page. Writes through the same `patchDay`
 * mechanism the old inline status `<select>` used.
 */
export function DayStatusSheet({ employee, day, patchDay, onClose }) {
  return (
    <Sheet open onClose={onClose} title={fmtLong(day.d)}>
      <p className="ot-sub">{employee.name}</p>
      <p className="ot-sub" style={{ marginBottom: 14 }}>
        duty {hm(day.duty)} · extra {hm(day.extra)} · genOT {hm(day.genOT)} · pubOT {hm(day.pubOT)}
      </p>
      <Field label="Status">
        <Select
          className="ot-status-select"
          value={day.status}
          onChange={(e) => patchDay(employee.no, day.d, { status: e.target.value })}
          aria-label={`Status for ${day.d}`}
        >
          {Object.entries(STATUS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
        </Select>
      </Field>
    </Sheet>
  );
}
