import { useState } from 'react';
import { Sheet, Button, Field, Input, Select } from '../../../core/ui/components';
import { classify } from '../lib/overtimeEngine';

/**
 * A hand-added overtime entry, for the day something never made it into an
 * attendance import (or was carded wrong and fixed after the fact). Written
 * as a `manualRecs` entry on the day record — kept separate from imported
 * sessions/recs so adding one never touches what was actually imported —
 * and starts pending, same as any imported entry, so it goes through the
 * normal approval flow.
 */
export function AddEntrySheet({ employees, ctx, defaultPersonId, defaultDate, onAdd, onClose }) {
  const [personId, setPersonId] = useState(defaultPersonId || employees[0]?.no || '');
  const [date, setDate] = useState(defaultDate || '');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState(null);

  const save = () => {
    setError(null);
    if (!personId) return setError('Choose a staff member.');
    if (!date) return setError('Choose a date.');
    if (!start || !end) return setError('Enter a start and end time.');
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let min = (eh * 60 + em) - (sh * 60 + sm);
    if (min <= 0) min += 24 * 60; // crosses midnight
    const emp = employees.find((e) => e.no === personId);
    const kind = classify(emp, date, { s: start }, ctx);
    onAdd(personId, date, { id: `man${Date.now()}`, s: start, e: end, min, kind });
    onClose();
  };

  return (
    <Sheet
      open onClose={onClose} title="Add overtime entry"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Add</Button></>}
    >
      <Field label="Staff">
        <Select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          {employees.map((e) => <option key={e.no} value={e.no}>{e.name}</option>)}
        </Select>
      </Field>
      <Field label="Date">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Start"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      {error && <p className="settings-error">{error}</p>}
      <p className="ot-sub">
        Added as pending, same as an imported entry — it won't change anything already
        on file for that day, and shows up in Approvals until it's decided.
      </p>
    </Sheet>
  );
}
