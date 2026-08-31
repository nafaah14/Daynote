import { useState } from 'react';
import { Sheet, Button, Field, Input, Row, Toggle } from '../../../core/ui/components';
import { Trash2, Pencil } from 'lucide-react';

const slug = (label) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `shift${Date.now()}`;

/**
 * The "Change Shift" catalog, editable here instead of asked for as a code
 * change — a seasonal shift (Ramazan hours) or a swapped naming convention
 * shouldn't need a release. `earlyOT` on a preset means a card-in ahead of
 * its start is claimable time on the day it's applied to, not silently
 * clipped — see overtimeEngine.js's dayFacts.
 */
export function ShiftPresetsSheet({ presets, onSave, onClose }) {
  const [label, setLabel] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [earlyOT, setEarlyOT] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const resetForm = () => { setLabel(''); setStart(''); setEnd(''); setEarlyOT(false); setEditingId(null); };

  const edit = (preset) => {
    setEditingId(preset.id); setLabel(preset.label); setStart(preset.start); setEnd(preset.end); setEarlyOT(!!preset.earlyOT);
  };

  const save = () => {
    if (!label.trim() || !start || !end) return;
    const entry = { id: editingId || slug(label), label: label.trim(), start, end, earlyOT };
    const next = editingId ? presets.map((p) => (p.id === editingId ? entry : p)) : [...presets, entry];
    onSave(next);
    resetForm();
  };

  const remove = (id) => {
    onSave(presets.filter((p) => p.id !== id));
    if (editingId === id) resetForm();
  };

  return (
    <Sheet open onClose={onClose} title="Shifts">
      <p className="ot-sub" style={{ marginBottom: 10 }}>
        The presets available from "Change Shift" on a person's day — pick one to override that
        one day's schedule when the imported roster doesn't match what actually happened.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Label"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Evening Shift" /></Field>
        <Field label="Start"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Toggle checked={earlyOT} onChange={setEarlyOT} label="Early OT" />
        <Button variant="primary" size="sm" onClick={save}>{editingId ? 'Save' : 'Add'}</Button>
        {editingId && <Button size="sm" onClick={resetForm}>Cancel</Button>}
      </div>

      {presets.length === 0 ? (
        <p className="ot-sub" style={{ padding: '8px 2px' }}>No shifts added yet.</p>
      ) : presets.map((p) => (
        <Row
          key={p.id}
          title={p.label}
          meta={`${p.start} – ${p.end}${p.earlyOT ? ' · Early OT' : ''}`}
          right={(
            <span style={{ display: 'flex', gap: 4 }}>
              <Button size="sm" onClick={() => edit(p)} aria-label={`Edit ${p.label}`}><Pencil size={14} /></Button>
              <Button size="sm" onClick={() => remove(p.id)} aria-label={`Delete ${p.label}`}><Trash2 size={14} /></Button>
            </span>
          )}
        />
      ))}
    </Sheet>
  );
}
