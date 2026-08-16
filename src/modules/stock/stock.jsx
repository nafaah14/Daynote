import { useState, useMemo } from 'react';
import { Package, Plus, Minus, Camera, Trash2, X } from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import {
  Card, Row, SectionLabel, EmptyState, Button, Sheet, Field, Input, Textarea, Chip,
} from '../../core/ui/components';
import { HomeVisibility, Fab } from '../../core/ui/extras';
import { BarcodeScanner } from './BarcodeScanner';
import './stock.css';

export const TYPE = 'stock.item';

const CURRENCY = 'MVR';
export const fmtPrice = (n) =>
  `${CURRENCY} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const needsRestock = (item) => (item.data.qty ?? 0) <= (item.data.lowStockAt ?? 0);

/** "City Mart MVR 35.50" for one shop, "3 shops from MVR 12.00" for several, null when there's nothing to show. */
export function shopSummary(item) {
  const shops = item.data.shops || [];
  if (shops.length === 0) return null;
  if (shops.length === 1) {
    const s = shops[0];
    return [s.shop, s.price != null ? fmtPrice(s.price) : null].filter(Boolean).join(' ') || null;
  }
  const priced = shops.filter((s) => s.price != null);
  if (priced.length === 0) return `${shops.length} shops`;
  const min = Math.min(...priced.map((s) => s.price));
  return `${shops.length} shops from ${fmtPrice(min)}`;
}

/* -------------------------------- item editor ---------------------------- */

function StockItemSheet({ open, onClose, existing, prefill }) {
  const repo = useRepo();
  const isNew = !existing;
  const d = existing?.data || {};
  const [title, setTitle] = useState(existing?.title || '');
  const [category, setCategory] = useState(d.category || '');
  const [newCat, setNewCat] = useState('');
  const [shops, setShops] = useState(
    (d.shops || []).map((s) => ({ shop: s.shop || '', price: s.price != null ? String(s.price) : '' })),
  );
  const [qty, setQty] = useState(d.qty != null ? String(d.qty) : '0');
  const [lowStockAt, setLowStockAt] = useState(d.lowStockAt != null ? String(d.lowStockAt) : '1');
  const [barcodes, setBarcodes] = useState(d.barcodes || (prefill?.barcode ? [prefill.barcode] : []));
  const [notes, setNotes] = useState(existing?.notes || '');
  const [home, setHome] = useState(existing?.home || 'auto');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  const existingCategories = useMemo(() => {
    const set = new Set();
    repo.query({ type: TYPE }).forEach((i) => { if (i.data?.category) set.add(i.data.category); });
    return [...set].sort();
  }, [repo]);

  const existingShops = useMemo(() => {
    const set = new Set();
    repo.query({ type: TYPE }).forEach((i) => (i.data?.shops || []).forEach((s) => { if (s.shop) set.add(s.shop); }));
    return [...set].sort();
  }, [repo]);

  const updateShopRow = (i, patch) => setShops((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const removeShopRow = (i) => setShops((prev) => prev.filter((_, j) => j !== i));
  const addShopRow = () => setShops((prev) => [...prev, { shop: '', price: '' }]);

  const save = () => {
    setError(null);
    if (!title.trim()) return setError('Give it a name.');
    const cat = newCat.trim() || category;
    const shopsData = shops
      .map((s) => ({ shop: s.shop.trim(), price: s.price.trim() === '' ? null : parseFloat(s.price) }))
      .filter((s) => s.shop);
    const data = {
      ...d,
      category: cat,
      shops: shopsData,
      qty: Math.max(0, parseInt(qty, 10) || 0),
      lowStockAt: Math.max(0, parseInt(lowStockAt, 10) || 0),
      barcodes,
    };
    if (existing) repo.update(existing.id, { title: title.trim(), notes, home, data });
    else repo.create(TYPE, { title: title.trim(), notes, home, data });
    onClose();
  };

  const remove = () => {
    if (existing) repo.softDelete(existing.id);
    onClose();
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={isNew ? 'New item' : 'Edit item'}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save}>{isNew ? 'Add' : 'Save'}</Button>
          </>
        }
      >
        <Field label="Name">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Toilet paper" autoFocus />
        </Field>
        <Field label="Category" hint="Group related items together.">
          {existingCategories.length > 0 && (
            <div className="cat-existing-chips" style={{ marginBottom: 8 }}>
              {existingCategories.map((c) => (
                <Chip key={c} tone={category === c ? 'accent' : 'neutral'}
                  onClick={() => { setCategory(category === c ? '' : c); setNewCat(''); }}>{c}</Chip>
              ))}
            </div>
          )}
          <Input value={newCat} onChange={(e) => { setNewCat(e.target.value); setCategory(''); }}
            placeholder="New category or leave blank" />
        </Field>
        <Field label="Shops &amp; prices" hint="One row per place you buy this — handy for hard-to-find items, and for comparing prices.">
          {shops.map((s, i) => (
            <div key={i} className="stock-shop-row">
              <Input value={s.shop} onChange={(e) => updateShopRow(i, { shop: e.target.value })}
                list="stock-shops" placeholder="City Mart…" />
              <Input type="number" inputMode="decimal" value={s.price}
                onChange={(e) => updateShopRow(i, { price: e.target.value })} placeholder="0.00" />
              <button type="button" className="icon-btn" aria-label="Remove shop" onClick={() => removeShopRow(i)}>
                <X size={14} />
              </button>
            </div>
          ))}
          <datalist id="stock-shops">{existingShops.map((s) => <option key={s} value={s} />)}</datalist>
          <Button size="sm" onClick={addShopRow}>+ Add a shop</Button>
        </Field>
        <div className="stock-field-pair">
          <Field label="Quantity on hand">
            <Input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Restock at" hint="Flagged once qty drops to this.">
            <Input type="number" min="0" value={lowStockAt} onChange={(e) => setLowStockAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Barcodes" hint="Attach one per brand/variant you buy — scanning any of them finds this same item.">
          {barcodes.length > 0 && (
            <div className="cat-existing-chips" style={{ marginBottom: 8 }}>
              {barcodes.map((code) => (
                <Chip key={code} tone="neutral"
                  onClick={() => setBarcodes((prev) => prev.filter((c) => c !== code))}>
                  {code} <X size={11} style={{ marginLeft: 4, verticalAlign: -1 }} />
                </Chip>
              ))}
            </div>
          )}
          <Button size="sm" onClick={() => setScanning(true)}><Camera size={14} /> Scan a barcode</Button>
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. get the blue pack" />
        </Field>
        <HomeVisibility value={home} onChange={setHome} autoHint="Appears on Today whenever this needs restocking." />
        {error && <p className="settings-error">{error}</p>}
        {!isNew && (
          <Button variant="danger" size="sm" onClick={remove}><Trash2 size={14} /> Delete item</Button>
        )}
      </Sheet>
      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onDetect={(code) => {
            setBarcodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
            setScanning(false);
          }}
        />
      )}
    </>
  );
}

export const renderEditor = (record, close) => (
  <StockItemSheet open onClose={close} existing={record || undefined} />
);

/* -------------------------------- screen ---------------------------------- */

function QtyStepper({ item, onAdjust }) {
  return (
    <span className="stock-qty" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="icon-btn" aria-label={`Decrease ${item.title}`}
        onClick={() => onAdjust(item, -1)}>
        <Minus size={14} />
      </button>
      <span className="mono stock-qty-val">{item.data.qty ?? 0}</span>
      <button type="button" className="icon-btn" aria-label={`Increase ${item.title}`}
        onClick={() => onAdjust(item, 1)}>
        <Plus size={14} />
      </button>
    </span>
  );
}

export function StockScreen() {
  const repo = useRepo();
  const [tab, setTab] = useState('shopping');
  const [filterCat, setFilterCat] = useState(null);
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(undefined);
  const [editing, setEditing] = useState(null);
  const [scanning, setScanning] = useState(false);

  const items = repo.query({ type: TYPE });

  const categories = useMemo(() => {
    const set = new Set();
    items.forEach((i) => { if (i.data?.category) set.add(i.data.category); });
    return [...set].sort();
  }, [items]);

  const shopping = items.filter(needsRestock);
  const base = tab === 'shopping' ? shopping : items;
  const visible = filterCat ? base.filter((i) => (i.data?.category || '') === filterCat) : base;

  const adjustQty = (item, delta) => {
    const qty = Math.max(0, (item.data.qty ?? 0) + delta);
    repo.update(item.id, { data: { ...item.data, qty } });
  };

  const add = () => {
    const t = text.trim();
    if (!t) return;
    repo.create(TYPE, { title: t, data: { category: '', shops: [], qty: 0, lowStockAt: 1, barcodes: [] } });
    setText('');
  };

  const handleScan = (code) => {
    setScanning(false);
    // Deferred: closing the scanner and opening the next sheet are both
    // back-button-tracked overlays (useBackClose) — swapping them in the
    // same commit races the scanner's own deferred history.back() against
    // the next sheet's history.pushState(), which can pop the sheet's entry
    // out from under it and bounce it shut immediately. A tick's delay lets
    // the scanner's close finish first.
    setTimeout(() => {
      const match = items.find((i) => i.data?.barcodes?.includes(code));
      if (match) setEditing(match);
      else setAdding({ barcode: code });
    }, 60);
  };

  return (
    <div className="page has-fab">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Stock</h1>
          <p className="page-sub">What you keep at home, and when to buy more.</p>
        </div>
      </div>

      <div className="segmented" role="radiogroup" aria-label="View" style={{ marginBottom: 'var(--sp-3)' }}>
        <button type="button" role="radio" aria-checked={tab === 'shopping'}
          className={`segment ${tab === 'shopping' ? 'is-on' : ''}`} onClick={() => setTab('shopping')}>
          Shopping list
        </button>
        <button type="button" role="radio" aria-checked={tab === 'all'}
          className={`segment ${tab === 'all' ? 'is-on' : ''}`} onClick={() => setTab('all')}>
          All stock
        </button>
      </div>

      <Card className="capture-card">
        <div className="capture">
          <input className="capture-input" placeholder="Add an item" value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            aria-label="Add an item" />
          <button type="button" className="icon-btn" aria-label="Scan barcode" title="Scan barcode"
            onClick={() => setScanning(true)}>
            <Camera size={17} />
          </button>
          <Button variant="primary" size="sm" onClick={add} disabled={!text.trim()}>Add</Button>
        </div>
      </Card>

      {categories.length > 0 && (
        <div className="cat-filter-bar">
          <Chip tone={!filterCat ? 'accent' : 'neutral'} onClick={() => setFilterCat(null)}>All</Chip>
          {categories.map((c) => (
            <Chip key={c} tone={filterCat === c ? 'accent' : 'neutral'}
              onClick={() => setFilterCat(filterCat === c ? null : c)}>{c}</Chip>
          ))}
        </div>
      )}

      <SectionLabel right={<span className="mono count">{visible.length}</span>}>
        {tab === 'shopping' ? 'Needs buying' : 'Everything tracked'}
      </SectionLabel>

      <Card>
        {visible.length === 0 ? (
          <EmptyState
            icon={Package}
            title={tab === 'shopping' ? 'All stocked up' : 'Nothing tracked yet'}
            body={tab === 'shopping'
              ? "Nothing's low right now."
              : 'Add the first thing you keep stock of.'}
            action={tab === 'all'
              ? <Button variant="outline" size="sm" onClick={() => setAdding(null)}>Add an item</Button>
              : undefined}
          />
        ) : (
          <div className="ruled">
            {visible.map((item) => {
              const low = needsRestock(item);
              return (
                <Row
                  key={item.id}
                  accent={low ? 'var(--out)' : 'var(--accent-stock)'}
                  wash={low}
                  title={item.title}
                  onClick={() => setEditing(item)}
                  meta={
                    <span className="stock-item-sub">
                      {item.data.category && <Chip tone="neutral">{item.data.category}</Chip>}
                      {shopSummary(item) && <span style={{ color: 'var(--muted)' }}>{shopSummary(item)}</span>}
                    </span>
                  }
                  right={<QtyStepper item={item} onAdjust={adjustQty} />}
                />
              );
            })}
          </div>
        )}
      </Card>

      {adding !== undefined && (
        <StockItemSheet open onClose={() => setAdding(undefined)} prefill={adding || undefined} />
      )}
      {editing && (
        <StockItemSheet open onClose={() => setEditing(null)} existing={editing} />
      )}
      {scanning && (
        <BarcodeScanner onClose={() => setScanning(false)} onDetect={handleScan} />
      )}

      <Fab label="Add item" onClick={() => setAdding(null)} />
    </div>
  );
}

/* ------------------------------- manifest ------------------------------ */

export default {
  id: 'stock',
  title: 'Stock',
  icon: Package,
  accent: 'var(--accent-stock)',
  tier: 'integrated',
  routes: [{ path: '/stock', element: <StockScreen /> }],

  today: ({ repo }) => {
    const all = repo.query({ type: TYPE }).filter((i) => i.home !== 'hidden');
    const low = all.filter(needsRestock);
    const pinned = all.filter((i) => i.home === 'pinned' && !low.some((l) => l.id === i.id));
    const records = [...low, ...pinned];
    if (!records.length) return [];
    return [{
      id: 'stock-restock',
      priority: 20,
      label: 'Restock needed',
      records,
      render: (i) => (
        <Row key={i.id} accent="var(--out)" wash title={i.title}
          meta={<span className="stock-item-sub">
            {i.data.category && <Chip tone="neutral">{i.data.category}</Chip>}
            <span className="mono">{i.data.qty ?? 0} left</span>
          </span>} />
      ),
    }];
  },

  renderRef: (record) => <span className="ref-chip">{record.title}</span>,

  search: ({ repo }, q) =>
    repo.query({ type: TYPE })
      .filter((i) => i.title.toLowerCase().includes(q)
        || (i.data.category || '').toLowerCase().includes(q)
        || (i.data.shops || []).some((s) => (s.shop || '').toLowerCase().includes(q)))
      .map((i) => ({ id: i.id, title: i.title, sub: i.data.category || 'Stock', to: '/stock' })),

  quickActions: [{ id: 'add-stock-item', label: 'Add stock item', icon: Plus, to: '/stock?add=1' }],

  raiseEvents: ({ repo }) => {
    const now = new Date().toISOString();
    const items = repo.query({ type: TYPE });
    const notices = [];
    items.forEach((i) => {
      const low = needsRestock(i);
      if (low && !i.data.lowSince) {
        repo.update(i.id, { data: { ...i.data, lowSince: now } });
        notices.push({
          title: 'Restock needed',
          body: i.title,
          url: '/stock',
          kind: 'reminder',
          dedupeKey: `stock:${i.id}:low:${now}`,
        });
      } else if (!low && i.data.lowSince) {
        repo.update(i.id, { data: { ...i.data, lowSince: null } });
      }
    });
    return notices;
  },
  notifications: [{ id: 'stock.low', label: 'Restock needed', hint: 'When something at home drops to or below its restock threshold.', default: true }],
};
