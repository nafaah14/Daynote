import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  Sheet, Field, Input, Select, Textarea, Button, Toggle,
} from '../../../core/ui/components';
import { uid, brkLabel } from '../lib/electricalModel';

const TYPE_LABEL = {
  plant: 'Powerhouse / grid station', rmu: 'Ring main unit', dss: 'Distribution substation', connector: 'Node (cable junction)',
};
const BREAKER_KINDS = [
  { value: 'incomer', label: 'Incomer (MV in)' },
  { value: 'outgoing', label: 'Outgoing (MV out)' },
  { value: 'earth', label: 'Earth switch' },
  { value: 'other', label: 'Other' },
];
const LABEL_POSITIONS = ['top', 'bottom', 'left', 'right'];

/** Create/edit form for a powerhouse, RMU, DSS, or connector Node — ported
 *  from v39's openNodeForm, rebuilt on Daybook's Sheet/Field components. */
export function NodeSheet({
  node, type, latlng, isBreakerInUse, onSave, onDelete, onClose,
}) {
  const isNew = !node;
  const n = node || {
    type, lat: latlng?.lat, lng: latlng?.lng, name: '', kva: '',
    voltage: type === 'dss' ? '11/0.4 kV' : (type === 'plant' ? '11 kV' : ''),
    notes: '', breakers: [], rotation: 0, sizeScale: 1, subtype: 'closed', lv0: true, labelPos: 'top',
  };

  const [name, setName] = useState(n.name || '');
  const [kva, setKva] = useState(n.kva || '');
  const [subtype, setSubtype] = useState(n.subtype || 'closed');
  const [lv0, setLv0] = useState(n.lv0 !== false);
  const [voltage, setVoltage] = useState(n.voltage || '');
  const [rotation, setRotation] = useState(n.rotation || 0);
  const [sizeScale, setSizeScale] = useState(n.sizeScale || 1);
  const [labelPos, setLabelPos] = useState(n.labelPos || 'top');
  const [notes, setNotes] = useState(n.notes || '');
  const [breakers, setBreakers] = useState((n.breakers || []).map((b) => ({ ...b })));

  const updateBrk = (i, patch) => setBreakers((cur) => cur.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const removeBrk = (i) => {
    if (!isNew && isBreakerInUse?.(breakers[i].id)) return;
    setBreakers((cur) => cur.filter((_, j) => j !== i));
  };
  const addBrk = () => setBreakers((cur) => [...cur, { id: uid('b'), name: '', state: 'ON', kind: 'other' }]);

  const canSave = name.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      voltage: voltage.trim(),
      kva: type === 'dss' ? kva.trim() : (n.kva || ''),
      subtype: type === 'dss' ? subtype : undefined,
      lv0: type === 'dss' ? lv0 : undefined,
      notes: notes.trim(),
      rotation, sizeScale, labelPos,
      breakers: breakers.filter((b) => b.name.trim()),
    });
  };

  return (
    <Sheet
      open onClose={onClose}
      title={`${isNew ? 'Add' : 'Edit'} ${TYPE_LABEL[type]}`}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>{isNew ? 'Add to map' : 'Save'}</Button>
        </>
      )}
    >
      <Field label="Name / number">
        <Input
          value={name} onChange={(e) => setName(e.target.value)} autoFocus
          placeholder={type === 'dss' ? 'e.g. DSS1512' : type === 'rmu' ? 'e.g. RMU2B' : 'e.g. Male Powerhouse'}
        />
      </Field>

      {type === 'dss' && (
        <>
          <Field label="Transformer size (kVA)">
            <Input type="number" value={kva} onChange={(e) => setKva(e.target.value)} placeholder="e.g. 500" />
          </Field>
          <Field label="Substation type">
            <Select value={subtype} onChange={(e) => setSubtype(e.target.value)}>
              <option value="closed">Closed (building)</option>
              <option value="open">Open type (fenced)</option>
            </Select>
          </Field>
          <Field label="LV0 (customer load)">
            <Toggle checked={lv0} onChange={setLv0} label="LV0 breaker" />
          </Field>
        </>
      )}

      {type !== 'connector' && (
        <Field label="Voltage">
          <Input value={voltage} onChange={(e) => setVoltage(e.target.value)} placeholder="e.g. 11/0.4 kV" />
        </Field>
      )}

      {type !== 'connector' && (
        <>
          <Field label={`Block rotation — ${rotation}°`}>
            <input type="range" min={-45} max={45} step={5} value={rotation} onChange={(e) => setRotation(parseInt(e.target.value, 10))} />
          </Field>
          <Field label={`Block size — ${sizeScale.toFixed(1)}×`}>
            <input type="range" min={0.3} max={2.5} step={0.1} value={sizeScale} onChange={(e) => setSizeScale(parseFloat(e.target.value))} />
          </Field>
          <Field label="Label position">
            <div className="mvnet-seg">
              {LABEL_POSITIONS.map((p) => (
                <button key={p} type="button" className={`mvnet-seg-btn ${labelPos === p ? 'is-active' : ''}`} onClick={() => setLabelPos(p)}>
                  {p[0].toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </Field>
        </>
      )}

      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>

      {type !== 'connector' && (
        <Field label="Breakers">
          {breakers.length === 0 && (
            <p className="field-hint" style={{ margin: '0 0 8px' }}>No breakers yet — add the panel/breaker numbers (e.g. K1.00).</p>
          )}
          {breakers.map((b, i) => {
            const inUse = !isNew && isBreakerInUse?.(b.id);
            return (
              <div className="mvnet-brk-edit" key={b.id}>
                <Input value={b.name} onChange={(e) => updateBrk(i, { name: e.target.value })} placeholder={`e.g. K1.0${i + 1}`} />
                <button type="button" className={`mvnet-brk-state ${b.state === 'ON' ? 'is-on' : 'is-off'}`} onClick={() => updateBrk(i, { state: b.state === 'ON' ? 'OFF' : 'ON' })}>
                  {brkLabel(b.state)}
                </button>
                <Select value={b.kind || 'other'} onChange={(e) => {
                  if (e.target.value === 'earth' && inUse) return;
                  updateBrk(i, { kind: e.target.value });
                }}
                >
                  {BREAKER_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </Select>
                <button type="button" className="mvnet-brk-del" title={inUse ? 'In use — reassign first' : 'Delete'} onClick={() => removeBrk(i)}>
                  {inUse ? '🔒' : <X size={13} />}
                </button>
              </div>
            );
          })}
          <Button size="sm" variant="outline" onClick={addBrk}><Plus size={14} /> Add breaker</Button>
        </Field>
      )}

      {!isNew && (
        <Button variant="danger" size="sm" onClick={onDelete}>Delete {TYPE_LABEL[type].toLowerCase()}</Button>
      )}
    </Sheet>
  );
}
