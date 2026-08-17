import { useState } from 'react';
import {
  Sheet, Field, Input, Select, Button,
} from '../../../core/ui/components';
import { FEEDER_COLORS } from '../lib/electricalModel';

/** Create/edit form for a feeder — ported from v39's openFeederForm. */
export function FeederSheet({
  feeder, plants, existingCount, onSave, onDelete, onClose,
}) {
  const isNew = !feeder;
  const f = feeder || { name: '', color: FEEDER_COLORS[existingCount % FEEDER_COLORS.length], sourceNode: '', sourceBreaker: '' };

  const [name, setName] = useState(f.name || '');
  const [color, setColor] = useState(f.color);
  const [sourceNode, setSourceNode] = useState(f.sourceNode || '');
  const [sourceBreaker, setSourceBreaker] = useState(f.sourceBreaker || '');

  const srcPlant = plants.find((p) => p.id === sourceNode);
  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    onSave({ name: name.trim(), color, sourceNode: sourceNode || null, sourceBreaker: sourceNode ? sourceBreaker : '' });
  };

  return (
    <Sheet
      open onClose={onClose}
      title={isNew ? 'Add feeder' : 'Edit feeder'}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>{isNew ? 'Add feeder' : 'Save'}</Button>
        </>
      )}
    >
      <Field label="Feeder name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Feeder 4" autoFocus />
      </Field>
      <Field label="Colour">
        <div className="mvnet-colorpick">
          {FEEDER_COLORS.map((cl) => (
            <button key={cl} type="button" className={`mvnet-copt ${color === cl ? 'is-sel' : ''}`} style={{ background: cl }} onClick={() => setColor(cl)} aria-label={cl} />
          ))}
        </div>
      </Field>

      {plants.length === 0 ? (
        <p className="field-hint">No powerhouse on the map yet. Add the feeder now and set its source once you've placed one.</p>
      ) : (
        <>
          <Field label="Source (powerhouse / grid station)">
            <Select value={sourceNode} onChange={(e) => { setSourceNode(e.target.value); setSourceBreaker(''); }}>
              <option value="">— select —</option>
              {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          {sourceNode && (
            <Field
              label="Outgoing panel breaker (optional)"
              hint={srcPlant && !(srcPlant.breakers || []).length
                ? 'This powerhouse has no panel breakers yet — add them in its Edit form.'
                : 'If set, this feeder leaves the source only through this panel breaker.'}
            >
              <Select value={sourceBreaker} onChange={(e) => setSourceBreaker(e.target.value)}>
                <option value="">— any —</option>
                {(srcPlant?.breakers || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          )}
        </>
      )}

      {!isNew && (
        <Button variant="danger" size="sm" onClick={onDelete}>Delete feeder</Button>
      )}
    </Sheet>
  );
}
