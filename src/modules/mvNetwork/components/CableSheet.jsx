import { useState } from 'react';
import {
  Sheet, Field, Input, Select, Textarea, Button,
} from '../../../core/ui/components';
import { uid, pathLength, brkLabel } from '../lib/electricalModel';

const CABLE_TYPES = ['XLPE underground', 'PILC underground', 'Overhead line', 'Submarine'];

function BreakerField({
  label, node, value, onChange, newName, onNewName,
}) {
  if (!node) return null;
  if (node.type === 'connector') {
    return (
      <Field label={label}>
        <div className="mvnet-note">Node — no breaker (always connected)</div>
      </Field>
    );
  }
  const opts = (node.breakers || []).filter((b) => b.kind !== 'earth' || b.id === value);
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— select breaker —</option>
        {opts.map((b) => <option key={b.id} value={b.id}>{b.name} ({brkLabel(b.state)})</option>)}
        <option value="__new__">+ Create new breaker…</option>
      </Select>
      {value === '__new__' && (
        <Input value={newName} onChange={(e) => onNewName(e.target.value)} placeholder="New breaker name, e.g. K2.00" style={{ marginTop: 6 }} />
      )}
    </Field>
  );
}

/** Create/edit form for a cable, including the breaker (or new-breaker)
 *  picker at each end — ported from v39's openCableForm. */
export function CableSheet({
  cable, draft, fromNode, toNode, onSave, onDelete, onClose,
}) {
  const isNew = !cable;
  const c = cable || {
    name: '', points: draft.points, size: '', ctype: CABLE_TYPES[0], length: '', year: '', notes: '',
  };
  const autoLen = pathLength(c.points);

  const [name, setName] = useState(c.name || '');
  const [size, setSize] = useState(c.size || '');
  const [year, setYear] = useState(c.year || '');
  const [ctype, setCtype] = useState(c.ctype || CABLE_TYPES[0]);
  const [length, setLength] = useState(c.length || '');
  const [notes, setNotes] = useState(c.notes || '');
  const [fromBrk, setFromBrk] = useState(cable ? (cable.from.breakerId || '') : '');
  const [toBrk, setToBrk] = useState(cable ? (cable.to.breakerId || '') : '');
  const [fromNewName, setFromNewName] = useState('');
  const [toNewName, setToNewName] = useState('');
  const [error, setError] = useState('');

  const fromLabel = fromNode ? (fromNode.name || (fromNode.type === 'connector' ? 'Node' : '?')) : '?';
  const toLabel = toNode ? (toNode.name || (toNode.type === 'connector' ? 'Node' : '?')) : '?';

  const resolveEnd = (node, value, newName) => {
    if (node.type === 'connector') return { breakerId: null };
    if (value === '__new__') {
      const trimmed = newName.trim();
      if (!trimmed) return { error: `Enter a name for the new breaker at ${node.name}` };
      const newBreaker = { id: uid('b'), name: trimmed, state: 'ON', kind: 'other' };
      return { breakerId: newBreaker.id, newBreaker };
    }
    if (!value) return { error: `Select a breaker at ${node.name}` };
    return { breakerId: value };
  };

  const save = () => {
    setError('');
    const rf = resolveEnd(fromNode, fromBrk, fromNewName);
    if (rf.error) { setError(rf.error); return; }
    const rt = resolveEnd(toNode, toBrk, toNewName);
    if (rt.error) { setError(rt.error); return; }
    const newBreakers = [];
    if (rf.newBreaker) newBreakers.push({ nodeId: fromNode.id, breaker: rf.newBreaker });
    if (rt.newBreaker) newBreakers.push({ nodeId: toNode.id, breaker: rt.newBreaker });
    onSave({
      name: name.trim(), size: size.trim(), year: year.trim(), ctype, length: length.trim(), notes: notes.trim(),
      fromBreakerId: rf.breakerId,
      toBreakerId: rt.breakerId,
      newBreakers,
    });
  };

  return (
    <Sheet
      open onClose={onClose}
      title={isNew ? 'New cable' : 'Edit cable'}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>{isNew ? 'Add cable' : 'Save'}</Button>
        </>
      )}
    >
      <div className="mvnet-note">{fromLabel} → {toLabel} · path {autoLen} m</div>
      <Field label="Cable name / ID">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. C-1042" autoFocus />
      </Field>
      <div className="mvnet-row2">
        <Field label="Size"><Input value={size} onChange={(e) => setSize(e.target.value)} placeholder="3×240 mm²" /></Field>
        <Field label="Installed year"><Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2019" /></Field>
      </div>
      <Field label="Type">
        <Select value={ctype} onChange={(e) => setCtype(e.target.value)}>
          {CABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label={`Length (m) — blank uses map path (${autoLen} m)`}>
        <Input type="number" value={length} onChange={(e) => setLength(e.target.value)} placeholder={String(autoLen)} />
      </Field>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>

      <BreakerField label={`Breaker at ${fromLabel}`} node={fromNode} value={fromBrk} onChange={setFromBrk} newName={fromNewName} onNewName={setFromNewName} />
      <BreakerField label={`Breaker at ${toLabel}`} node={toNode} value={toBrk} onChange={setToBrk} newName={toNewName} onNewName={setToNewName} />

      {error && <p className="mvnet-error">{error}</p>}

      {!isNew && (
        <Button variant="danger" size="sm" onClick={onDelete}>Delete cable</Button>
      )}
    </Sheet>
  );
}
