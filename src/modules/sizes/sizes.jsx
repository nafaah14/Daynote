import { useState, useCallback, useMemo } from 'react';
import {
  Ruler, ChevronDown, Plus, Trash2, Pencil, Check, X, Eye, Glasses,
  Shirt, Footprints, Info,
} from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import {
  Card, SectionLabel, EmptyState, Button, Sheet, Field, Input, Select,
} from '../../core/ui/components';
import { DIAGRAMS } from './diagrams';

export const TYPE = 'sizes.profile';

/* ===================================================================
   DEFAULT CATEGORIES — seeded on first use, fully editable afterward.
   Each category has a set of fields (name + optional unit) and an
   optional "sizeChart" text describing how to measure.
   =================================================================== */
const DEFAULT_CATEGORIES = [
  {
    key: 'body',
    label: 'Body Measurements',
    icon: 'ruler',
    sizeChart: 'Chest/Bust: measure around the fullest part.\nWaist: measure at the natural waistline, the narrowest part.\nHips: measure around the widest part of the hips.\nInseam: inside leg from crotch to ankle bone.\nShoulder: from one shoulder edge to the other across the back.\nArm length: shoulder to wrist with arm slightly bent.\nNeck: around the base of the neck.',
    fields: [
      { id: 'height', name: 'Height', unit: 'cm' },
      { id: 'weight', name: 'Weight', unit: 'kg' },
      { id: 'chest', name: 'Chest / Bust', unit: 'cm' },
      { id: 'waist', name: 'Waist', unit: 'cm' },
      { id: 'hips', name: 'Hips', unit: 'cm' },
      { id: 'inseam', name: 'Inseam', unit: 'cm' },
      { id: 'shoulder', name: 'Shoulder Width', unit: 'cm' },
      { id: 'armLength', name: 'Arm Length', unit: 'cm' },
      { id: 'neck', name: 'Neck', unit: 'cm' },
    ],
  },
  {
    key: 'tshirt',
    label: 'T-Shirts / Tops',
    icon: 'shirt',
    sizeChart: 'Measure your chest circumference (fullest part) and match to the brand chart. Common sizing: XS (<86), S (86–91), M (91–97), L (97–102), XL (102–107), XXL (107–112) cm.\nLength: nape of neck to bottom hem.',
    fields: [
      { id: 'usuk', name: 'US/UK Size', unit: '' },
      { id: 'eu', name: 'EU Size', unit: '' },
      { id: 'asian', name: 'Asian Size', unit: '' },
      { id: 'chest', name: 'Chest', unit: 'cm' },
      { id: 'length', name: 'Length', unit: 'cm' },
      { id: 'sleeve', name: 'Sleeve', unit: 'cm' },
      { id: 'notes', name: 'Notes', unit: '' },
    ],
  },
  {
    key: 'pants',
    label: 'Pants / Trousers',
    icon: 'ruler',
    sizeChart: 'Waist: measure at the natural waistline where you wear your pants.\nInseam: from the crotch seam to the hem.\nOutseam: from the waist to the hem (outside of the leg).\nCommon sizing: 28–38 inches (waist).',
    fields: [
      { id: 'waist', name: 'Waist', unit: 'in' },
      { id: 'inseam', name: 'Inseam', unit: 'in' },
      { id: 'length', name: 'Length', unit: 'in' },
      { id: 'usuk', name: 'US/UK Size', unit: '' },
      { id: 'eu', name: 'EU Size', unit: '' },
      { id: 'notes', name: 'Notes', unit: '' },
    ],
  },
  {
    key: 'shorts',
    label: 'Shorts',
    icon: 'ruler',
    sizeChart: 'Same waist measurement as pants. Length is typically measured from the waist to the hem on the outside of the leg.',
    fields: [
      { id: 'waist', name: 'Waist', unit: 'in' },
      { id: 'length', name: 'Length', unit: 'in' },
      { id: 'size', name: 'Label Size', unit: '' },
      { id: 'notes', name: 'Notes', unit: '' },
    ],
  },
  {
    key: 'shoes',
    label: 'Shoes',
    icon: 'footprints',
    sizeChart: 'Foot length: stand on paper, mark the heel and longest toe, measure the distance.\nFoot width: measure the widest part of the foot.\nUS, UK, and EU sizes vary by brand — always note the brand.',
    fields: [
      { id: 'footLength', name: 'Foot Length', unit: 'cm' },
      { id: 'footWidth', name: 'Foot Width', unit: 'cm' },
      { id: 'us', name: 'US Size', unit: '' },
      { id: 'uk', name: 'UK Size', unit: '' },
      { id: 'eu', name: 'EU Size', unit: '' },
      { id: 'notes', name: 'Notes', unit: '' },
    ],
  },
  {
    key: 'boxers',
    label: 'Boxers / Underwear',
    icon: 'ruler',
    sizeChart: 'Waist: measure at the natural waistline (where the elastic sits).\nHips: measure at the widest part.\nCommon sizing: S (28–30), M (32–34), L (36–38), XL (40–42) inches waist.',
    fields: [
      { id: 'waist', name: 'Waist', unit: 'in' },
      { id: 'size', name: 'Label Size', unit: '' },
      { id: 'notes', name: 'Notes', unit: '' },
    ],
  },
  {
    key: 'glasses',
    label: 'Glasses / Spectacles',
    icon: 'glasses',
    sizeChart: 'Frame measurements (printed on the inside of the temple arm, e.g. 52□18-140):\n\nLens width: horizontal width of one lens in mm (first number, e.g. 52).\nBridge: distance between the two lenses in mm (second number, e.g. 18).\nTemple length: length of the arm piece in mm (third number, e.g. 140).\nFrame width: total horizontal width of the frame front in mm (typically 125–150).\nLens height: vertical height of one lens in mm.\nPD (Pupillary Distance): distance between the centers of your pupils in mm. Measured by an optometrist or with a ruler (average ~63mm for adults).',
    fields: [
      { id: 'lensWidth', name: 'Lens Width', unit: 'mm' },
      { id: 'bridge', name: 'Bridge', unit: 'mm' },
      { id: 'templeLength', name: 'Temple Length', unit: 'mm' },
      { id: 'frameWidth', name: 'Frame Width', unit: 'mm' },
      { id: 'lensHeight', name: 'Lens Height', unit: 'mm' },
      { id: 'pd', name: 'PD (Pupillary Distance)', unit: 'mm' },
    ],
  },
  {
    key: 'prescription',
    label: 'Glasses Prescription',
    icon: 'glasses',
    sizeChart: 'SPH (Sphere): corrects nearsightedness (−) or farsightedness (+).\nCYL (Cylinder): corrects astigmatism; always comes with an axis.\nAXIS: angle (1–180°) for the cylinder correction.\nADD: additional magnifying power for reading (bifocals/progressives).\nPD: pupillary distance in mm.',
    fields: [
      { id: 'r_sph', name: 'Right SPH', unit: '' },
      { id: 'r_cyl', name: 'Right CYL', unit: '' },
      { id: 'r_axis', name: 'Right AXIS', unit: '°' },
      { id: 'r_add', name: 'Right ADD', unit: '' },
      { id: 'l_sph', name: 'Left SPH', unit: '' },
      { id: 'l_cyl', name: 'Left CYL', unit: '' },
      { id: 'l_axis', name: 'Left AXIS', unit: '°' },
      { id: 'l_add', name: 'Left ADD', unit: '' },
      { id: 'pd', name: 'PD', unit: 'mm' },
      { id: 'date', name: 'Rx Date', unit: '' },
      { id: 'notes', name: 'Notes', unit: '' },
    ],
  },
];

const ICON_MAP = {
  ruler: Ruler,
  shirt: Shirt,
  footprints: Footprints,
  glasses: Glasses,
};

/* ===================================================================
   Components
   =================================================================== */

function SizeChartHelp({ text, Diagram, onClose }) {
  return (
    <div className="sizes-help">
      <div className="sizes-help-head">
        <span className="sizes-help-title">How to measure</span>
        <button type="button" className="icon-btn" onClick={onClose}><X size={16} /></button>
      </div>
      {Diagram && (
        <div className="sizes-diagram">
          <Diagram />
        </div>
      )}
      <pre className="sizes-help-body">{text}</pre>
    </div>
  );
}

function CategorySection({ cat, values, onChange, onRemoveCategory }) {
  const [expanded, setExpanded] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const Icon = ICON_MAP[cat.icon] || Ruler;
  const filled = cat.fields.filter((f) => values[f.id]?.trim()).length;

  return (
    <div className="sizes-cat">
      <div className="sizes-cat-head" onClick={() => setExpanded((e) => !e)}>
        <span className="sizes-cat-left">
          <Icon size={16} strokeWidth={1.8} />
          <span className="sizes-cat-label">{cat.label}</span>
          <span className="sizes-cat-count mono">{filled}/{cat.fields.length}</span>
        </span>
        <span className="sizes-cat-right">
          {cat.sizeChart && (
            <button type="button" className="icon-btn" title="How to measure"
              onClick={(e) => { e.stopPropagation(); setShowHelp((h) => !h); }}>
              <Info size={15} />
            </button>
          )}
          {cat.isCustom && (
            <button type="button" className="icon-btn danger" title="Remove category"
              onClick={(e) => { e.stopPropagation(); onRemoveCategory?.(cat.key); }}>
              <Trash2 size={14} />
            </button>
          )}
          <ChevronDown size={16} className={`sizes-chev ${expanded ? 'is-open' : ''}`} />
        </span>
      </div>
      {showHelp && cat.sizeChart && (
        <SizeChartHelp text={cat.sizeChart} Diagram={DIAGRAMS[cat.key]} onClose={() => setShowHelp(false)} />
      )}
      {expanded && (
        <div className="sizes-fields">
          {cat.fields.map((f) => (
            <div key={f.id} className="sizes-field">
              <label className="sizes-field-label">
                {f.name}
                {f.unit && <span className="sizes-field-unit">({f.unit})</span>}
              </label>
              <input
                className="sizes-field-input"
                value={values[f.id] || ''}
                onChange={(e) => onChange(f.id, e.target.value)}
                placeholder="—"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Add custom category sheet ---- */

function AddCategorySheet({ open, onClose, onAdd }) {
  const [label, setLabel] = useState('');
  const [fieldsText, setFieldsText] = useState('');

  const save = () => {
    if (!label.trim()) return;
    const lines = fieldsText.split('\n').map((l) => l.trim()).filter(Boolean);
    const fields = lines.map((line, i) => {
      // Support "Name (unit)" syntax
      const match = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      if (match) return { id: `custom_${i}`, name: match[1].trim(), unit: match[2].trim() };
      return { id: `custom_${i}`, name: line, unit: '' };
    });
    if (!fields.length) {
      fields.push({ id: 'custom_0', name: 'Value', unit: '' });
    }
    onAdd({
      key: `custom_${Date.now()}`,
      label: label.trim(),
      icon: 'ruler',
      sizeChart: '',
      isCustom: true,
      fields,
    });
    setLabel('');
    setFieldsText('');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add Custom Category"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!label.trim()}>Add</Button>
        </>
      }>
      <Field label="Category name">
        <Input value={label} onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Watch, Belt, Hat" autoFocus />
      </Field>
      <Field label="Measurements" hint="One per line. Add unit in parentheses: Wrist (cm)">
        <textarea className="input textarea" rows={5} value={fieldsText}
          onChange={(e) => setFieldsText(e.target.value)}
          placeholder={'Wrist circumference (cm)\nCase diameter (mm)\nBand width (mm)'} />
      </Field>
    </Sheet>
  );
}

/* ---- Add custom field to existing category ---- */

function AddFieldSheet({ open, onClose, onAdd }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');

  const save = () => {
    if (!name.trim()) return;
    onAdd({ id: `f_${Date.now()}`, name: name.trim(), unit: unit.trim() });
    setName('');
    setUnit('');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add Measurement Field"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>Add</Button>
        </>
      }>
      <Field label="Field name">
        <Input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Thigh circumference" autoFocus />
      </Field>
      <Field label="Unit (optional)">
        <Input value={unit} onChange={(e) => setUnit(e.target.value)}
          placeholder="e.g. cm, in, mm" />
      </Field>
    </Sheet>
  );
}

/* ===================================================================
   Main screen
   =================================================================== */

export function SizesScreen() {
  const repo = useRepo();
  const [addingCat, setAddingCat] = useState(false);
  const [addingFieldTo, setAddingFieldTo] = useState(null); // category key

  // Single record stores everything
  const records = repo.query({ type: TYPE });
  const record = records[0] || null;
  const data = record?.data || {};
  const categories = data.categories || DEFAULT_CATEGORIES;
  const values = data.values || {}; // { 'catKey.fieldId': 'value' }

  const persist = useCallback((nextCats, nextVals) => {
    const payload = {
      title: 'My Sizes',
      data: { categories: nextCats, values: nextVals },
    };
    if (record) repo.update(record.id, payload);
    else repo.create(TYPE, payload);
  }, [record, repo]);

  const handleChange = (catKey, fieldId, value) => {
    const key = `${catKey}.${fieldId}`;
    const next = { ...values, [key]: value };
    persist(categories, next);
  };

  const addCategory = (cat) => {
    const next = [...categories, cat];
    persist(next, values);
  };

  const removeCategory = (catKey) => {
    if (!window.confirm('Remove this category and its data?')) return;
    const next = categories.filter((c) => c.key !== catKey);
    // Remove values for this category
    const nextVals = { ...values };
    Object.keys(nextVals).forEach((k) => { if (k.startsWith(catKey + '.')) delete nextVals[k]; });
    persist(next, nextVals);
  };

  const addFieldToCategory = (catKey, field) => {
    const next = categories.map((c) => {
      if (c.key !== catKey) return c;
      return { ...c, fields: [...c.fields, field] };
    });
    persist(next, values);
  };

  const catValues = (catKey) => {
    const out = {};
    Object.entries(values).forEach(([k, v]) => {
      if (k.startsWith(catKey + '.')) {
        out[k.slice(catKey.length + 1)] = v;
      }
    });
    return out;
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">My Sizes</h1>
          <p className="page-sub">Personal measurements and sizing reference.</p>
        </div>
      </div>

      {categories.map((cat) => (
        <div key={cat.key}>
          <SectionLabel right={
            <button type="button" className="icon-btn" title="Add field"
              onClick={() => setAddingFieldTo(cat.key)}>
              <Plus size={14} />
            </button>
          }>{cat.label}</SectionLabel>
          <Card>
            <CategorySection
              cat={cat}
              values={catValues(cat.key)}
              onChange={(fieldId, val) => handleChange(cat.key, fieldId, val)}
              onRemoveCategory={cat.isCustom ? removeCategory : undefined}
            />
          </Card>
        </div>
      ))}

      <div className="sizes-add-cat">
        <Button variant="outline" onClick={() => setAddingCat(true)}>
          <Plus size={15} /> Add custom category
        </Button>
      </div>

      {addingCat && (
        <AddCategorySheet open onClose={() => setAddingCat(false)} onAdd={addCategory} />
      )}
      {addingFieldTo && (
        <AddFieldSheet open onClose={() => setAddingFieldTo(null)}
          onAdd={(field) => addFieldToCategory(addingFieldTo, field)} />
      )}
    </div>
  );
}

/* ------------------------------- manifest ------------------------------ */

export default {
  id: 'sizes',
  title: 'My Sizes',
  icon: Ruler,
  accent: 'var(--accent-sizes)',
  tier: 'integrated',
  routes: [{ path: '/sizes', element: <SizesScreen /> }],
  search: ({ repo }, q) => {
    const records = repo.query({ type: TYPE });
    if (!records.length) return [];
    const data = records[0]?.data || {};
    const cats = data.categories || DEFAULT_CATEGORIES;
    const matches = cats.filter((c) => c.label.toLowerCase().includes(q));
    if (matches.length) {
      return [{ id: 'sizes', title: 'My Sizes', sub: matches.map((c) => c.label).join(', '), to: '/sizes' }];
    }
    return [];
  },
  quickActions: [{ id: 'my-sizes', label: 'My Sizes', icon: Ruler, to: '/sizes' }],
};
