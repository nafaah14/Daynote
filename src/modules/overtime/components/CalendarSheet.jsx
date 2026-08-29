import { useState } from 'react';
import { Sheet, Button, Field, Input, Row } from '../../../core/ui/components';
import { Trash2 } from 'lucide-react';

/**
 * Public holiday list — Fridays are handled separately by cfg.fridayIsHoliday,
 * so this only needs the Islamic/civic dates. HANDOVER.md §8c: these move
 * with the moon sighting and must be checked against the government gazette
 * each period.
 */
export function CalendarSheet({ holidays, onSave, onClose }) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');

  const entries = Object.entries(holidays).sort(([a], [b]) => a.localeCompare(b));

  const add = () => {
    if (!date.trim() || !name.trim()) return;
    onSave({ ...holidays, [date.trim()]: name.trim() });
    setDate(''); setName('');
  };

  const remove = (d) => {
    const next = { ...holidays };
    delete next[d];
    onSave(next);
  };

  return (
    <Sheet open onClose={onClose} title="Public holidays">
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mawlid al-Nabi" /></Field>
        <Button variant="primary" size="sm" onClick={add}>Add</Button>
      </div>

      {entries.map(([d, n]) => (
        <Row
          key={d}
          title={n}
          meta={d}
          right={<Button size="sm" onClick={() => remove(d)}><Trash2 size={14} /></Button>}
        />
      ))}
    </Sheet>
  );
}
