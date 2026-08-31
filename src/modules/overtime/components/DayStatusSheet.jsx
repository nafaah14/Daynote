import { useState } from 'react';
import { Plus, Trash2, RotateCcw } from 'lucide-react';
import { Sheet, Field, Select, Input, Button } from '../../../core/ui/components';
import { STATUS, hm, dparse, tmin, fmtT, punchLog } from '../lib/overtimeEngine';

const fmtLong = (k) => dparse(k).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

/**
 * A single day's status, plus its punch log — opened by clicking a cell in
 * the attendance calendar. Status writes through the same `patchDay` the
 * old inline `<select>` used. The punch log is a level more raw: individual
 * card-in/out events, editable directly (no approval, no reason — these
 * are facts a supervisor is asserting first-hand, not a claim being routed
 * for sign-off) so a missing check-out can be filled in and immediately
 * flow into that day's extra-time calculation.
 */
export function DayStatusSheet({ employee, day, rawDay, patchDay, addManualPunch, setPunchDeleted, onClose }) {
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState('in');
  const [addTime, setAddTime] = useState('');

  const punches = punchLog(rawDay);

  const submitAdd = () => {
    if (!addTime) return;
    addManualPunch(employee.no, day.d, { id: `man${Date.now()}`, type: addType, sec: tmin(addTime) * 60 });
    setAddTime('');
    setAddOpen(false);
  };

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

      <div className="ot-punch-head">
        <span className="eyebrow">Punch log</span>
        <Button size="sm" onClick={() => setAddOpen((v) => !v)}><Plus size={13} /> Add punch</Button>
      </div>

      {addOpen && (
        <div className="ot-punch-add">
          <Select value={addType} onChange={(e) => setAddType(e.target.value)} style={{ width: 90 }}>
            <option value="in">Card in</option>
            <option value="out">Card out</option>
          </Select>
          <Input type="time" value={addTime} onChange={(e) => setAddTime(e.target.value)} />
          <Button size="sm" variant="primary" onClick={submitAdd} disabled={!addTime}>Add</Button>
        </div>
      )}

      {punches.length === 0 ? (
        <p className="ot-sub">No punches on file for this day.</p>
      ) : (
        <div className="ot-punch-list">
          {punches.map((p) => (
            <div key={p.id} className={`ot-punch-row ${p.deleted ? 'is-deleted' : ''}`}>
              <span className={`ot-punch-icon ${p.type}`}>{p.type === 'in' ? 'CI' : 'CO'}</span>
              <span className="mono">{fmtT(p.sec / 60)}</span>
              {p.manual && <span className="ot-punch-tag">Manual</span>}
              {p.deleted && <span className="ot-punch-tag is-deleted-tag">Deleted</span>}
              <span className="ot-punch-action">
                {p.deleted ? (
                  <Button size="sm" onClick={() => setPunchDeleted(employee.no, day.d, p.id, false)}>
                    <RotateCcw size={12} /> Restore
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setPunchDeleted(employee.no, day.d, p.id, true)} aria-label={`Delete ${p.type === 'in' ? 'card-in' : 'card-out'} at ${fmtT(p.sec / 60)}`}>
                    <Trash2 size={12} />
                  </Button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
