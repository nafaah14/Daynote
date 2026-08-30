import { useState } from 'react';
import { Sheet, Button, Field, Input, Select, Row, SectionLabel } from '../../../core/ui/components';
import { Trash2, Pencil } from 'lucide-react';
import { normalizeHoliday } from '../lib/overtimeEngine';

/**
 * Public holidays and "off" days — Fridays are handled separately by
 * cfg.fridayIsHoliday, so this only needs the rest of the calendar.
 *
 * The two kinds behave differently, not just cosmetically: a public
 * holiday makes every hour worked that day overtime, regardless of the
 * 48h line. An "off" day (a one-off closure that isn't a gazetted public
 * holiday) behaves like a Saturday instead — not a scheduled duty day, but
 * ordinary overtime rules apply if someone works it. Keeping them in one
 * list, clearly marked, means a mixed date like this only needs setting
 * once here instead of per person.
 */
export function CalendarSheet({ holidays, onSave, onClose }) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState('public');
  const [editingDate, setEditingDate] = useState(null);

  const entries = Object.entries(holidays)
    .map(([d, v]) => ({ date: d, ...normalizeHoliday(v) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const publicEntries = entries.filter((e) => e.kind !== 'off');
  const offEntries = entries.filter((e) => e.kind === 'off');

  const resetForm = () => { setDate(''); setName(''); setKind('public'); setEditingDate(null); };

  const edit = (entry) => {
    setEditingDate(entry.date); setDate(entry.date); setName(entry.name); setKind(entry.kind || 'public');
  };

  const save = () => {
    if (!date.trim() || !name.trim()) return;
    const next = { ...holidays };
    if (editingDate && editingDate !== date) delete next[editingDate];
    next[date.trim()] = { name: name.trim(), kind };
    onSave(next);
    resetForm();
  };

  const remove = (d) => {
    const next = { ...holidays };
    delete next[d];
    onSave(next);
    if (editingDate === d) resetForm();
  };

  const list = (items, emptyLabel) => (items.length === 0 ? (
    <p className="ot-sub" style={{ padding: '8px 2px' }}>{emptyLabel}</p>
  ) : items.map((e) => (
    <Row
      key={e.date}
      title={e.name}
      meta={e.date}
      right={(
        <span style={{ display: 'flex', gap: 4 }}>
          <Button size="sm" onClick={() => edit(e)} aria-label={`Edit ${e.name}`}><Pencil size={14} /></Button>
          <Button size="sm" onClick={() => remove(e.date)} aria-label={`Delete ${e.name}`}><Trash2 size={14} /></Button>
        </span>
      )}
    />
  )));

  return (
    <Sheet open onClose={onClose} title="Holidays">
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mawlid al-Nabi" /></Field>
        <Field label="Kind">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="public">Public holiday</option>
            <option value="off">Off day (like a Saturday)</option>
          </Select>
        </Field>
        <Button variant="primary" size="sm" onClick={save}>{editingDate ? 'Save' : 'Add'}</Button>
        {editingDate && <Button size="sm" onClick={resetForm}>Cancel</Button>}
      </div>

      <SectionLabel right={<span className="mono count">{publicEntries.length}</span>}>Public holidays</SectionLabel>
      {list(publicEntries, 'None added yet.')}

      <SectionLabel right={<span className="mono count">{offEntries.length}</span>}>Off days</SectionLabel>
      <p className="ot-sub" style={{ marginTop: -4 }}>Not a scheduled duty day, but worked hours count as ordinary overtime — same as a Saturday.</p>
      {list(offEntries, 'None added yet.')}
    </Sheet>
  );
}
