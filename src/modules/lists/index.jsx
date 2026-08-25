import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ListChecks, ChevronDown, Eraser, Star, ArrowLeft, BellRing, Trash2,
  Tag, Plus, X, FolderOpen, CalendarDays,
} from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import {
  Card, Row, SectionLabel, EmptyState, Button, Sheet, Field, Input, Select, Checkbox, Chip, CompleteButton,
} from '../../core/ui/components';
import { PinMenu, Fab, Popover } from '../../core/ui/extras';
import { registerProvider, isOnAgendaDay } from '../../core/dashboardRegistry';

export const LIST_TYPE = 'lists.list';
export const ITEM_TYPE = 'lists.item';

export const MODES = [
  { value: 'clearable', label: 'Clearable', hint: 'Check off, then clear. Shopping, packing.' },
  { value: 'collection', label: 'Collection', hint: 'Builds up over time. Movies, books.' },
];

const doneWord = (mode) => (mode === 'collection' ? 'Finished' : 'Got it');

const toDateInput = (d) => d.toLocaleDateString('en-CA'); // matches <input type="date">'s value format
const todayInput = () => toDateInput(new Date());
const tomorrowInput = () => { const d = new Date(); d.setDate(d.getDate() + 1); return toDateInput(d); };

/**
 * Quick day-assign, right on the list's own screen — same compact
 * icon+dropdown format as PinMenu, so setting or clearing the Dashboard
 * agenda day doesn't require opening the full Edit sheet for it.
 * `value`/`onChange` work in dueAt ISO strings (or null), same as the
 * record field itself, so callers don't need to know about date-input format.
 */
function ListDateMenu({ value, onChange }) {
  const dateInputValue = value ? toDateInput(new Date(value)) : '';
  const setFromInput = (v) => onChange(v ? new Date(`${v}T00:00`).toISOString() : null);

  return (
    <Popover icon={CalendarDays} label="Show on a day" align="right">
      {(close) => (
        <div className="rt-menu list-date-menu">
          <button type="button" className={`rt-menu-item ${dateInputValue === todayInput() ? 'is-on' : ''}`}
            onClick={() => setFromInput(todayInput())}>Today</button>
          <button type="button" className={`rt-menu-item ${dateInputValue === tomorrowInput() ? 'is-on' : ''}`}
            onClick={() => setFromInput(tomorrowInput())}>Tomorrow</button>
          <div className="list-date-menu-input">
            <Input type="date" value={dateInputValue} onChange={(e) => setFromInput(e.target.value)} />
          </div>
          {value && (
            <button type="button" className="rt-menu-item rt-menu-danger" onClick={() => { onChange(null); close(); }}>
              Clear date
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}

/* ------------------------------ list editor ---------------------------- */

function ListSheet({ open, onClose, existing }) {
  const repo = useRepo();
  const nav = useNavigate();
  const [title, setTitle] = useState(existing?.title || '');
  const [mode, setMode] = useState(existing?.data?.mode || 'clearable');
  const [home, setHome] = useState(existing?.home || 'auto');
  const [category, setCategory] = useState(existing?.data?.category || '');
  const [newCat, setNewCat] = useState('');
  const [dueDate, setDueDate] = useState(() => existing?.dueAt ? toDateInput(new Date(existing.dueAt)) : '');

  const existingCategories = useMemo(() => {
    const set = new Set();
    repo.query({ type: LIST_TYPE }).forEach((l) => { if (l.data?.category) set.add(l.data.category); });
    return [...set].sort();
  }, [repo]);

  const save = () => {
    if (!title.trim()) return;
    const cat = newCat.trim() || category;
    const dueAt = dueDate ? new Date(`${dueDate}T00:00`).toISOString() : null;
    if (existing) repo.update(existing.id, { title: title.trim(), home, dueAt, data: { ...existing.data, mode, category: cat } });
    else {
      const rec = repo.create(LIST_TYPE, { title: title.trim(), home, dueAt, data: { mode, category: cat } });
      nav(`/lists/${rec.id}`);
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit list' : 'New list'}
      headerActions={<PinMenu value={home} onChange={setHome} autoLabel="has open items" />}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>
            {existing ? 'Save changes' : 'Create list'}
          </Button>
        </>
      }
    >
      <Field label="Name">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Shopping" autoFocus />
      </Field>
      <Field label="Category" hint="Group related lists together on the main screen.">
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
      <Field label="Behaviour" hint={MODES.find((m) => m.value === mode)?.hint}>
        <Select value={mode} onChange={(e) => setMode(e.target.value)}>
          {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
      </Field>
      <Field label="Show on a day" hint="Optional — appears in Dashboard's day agenda until every item's checked off. Leave empty to keep it pinned-board only.">
        <div className="quick-picks">
          <Chip tone={dueDate === todayInput() ? 'in' : 'neutral'} onClick={() => setDueDate(todayInput())}>Today</Chip>
          <Chip tone={dueDate === tomorrowInput() ? 'in' : 'neutral'} onClick={() => setDueDate(tomorrowInput())}>Tomorrow</Chip>
        </div>
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      {existing && (
        <Button variant="danger" size="sm" onClick={() => { repo.softDelete(existing.id); onClose(); nav('/lists'); }}>
          Delete list
        </Button>
      )}
    </Sheet>
  );
}

export const renderEditor = (record, close) => (
  <ListSheet open onClose={close} existing={record || undefined} />
);

const EXPAND_KEY = 'daybook.lists.expanded';
export function loadExpanded() {
  try { return new Set(JSON.parse(localStorage.getItem(EXPAND_KEY) || '[]')); }
  catch { return new Set(); }
}
export function persistExpanded(id, on) {
  const set = loadExpanded();
  if (on) set.add(id); else set.delete(id);
  try { localStorage.setItem(EXPAND_KEY, JSON.stringify([...set])); } catch { /* quota */ }
  return set;
}

export function ListPreview({ listId, limit = 6 }) {
  const repo = useRepo();
  const open = repo.query({ type: ITEM_TYPE, done: false })
    .filter((i) => i.data?.listId === listId);
  const shown = open.slice(0, limit);

  if (open.length === 0) {
    return <div className="list-sub-more">Nothing open in this list.</div>;
  }

  return (
    <>
      {shown.map((it) => (
        <div key={it.id} className="list-sub-item">
          <Checkbox checked={false}
            onChange={() => repo.update(it.id, { doneAt: new Date().toISOString() })}
            label={`Mark ${it.title} done`} />
          <span className="list-sub-text">{it.title}</span>
          {it.data?.category && <span className="list-sub-cat">{it.data.category}</span>}
        </div>
      ))}
      {open.length > shown.length && (
        <div className="list-sub-more">+{open.length - shown.length} more…</div>
      )}
    </>
  );
}

/* -------------------------------- one list ----------------------------- */

function Stars({ value, onChange }) {
  return (
    <span className="stars" onClick={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={`star ${value >= n ? 'on' : ''}`}
          onClick={() => onChange(value === n ? 0 : n)}>
          <Star size={13} fill={value >= n ? 'currentColor' : 'none'} />
        </button>
      ))}
    </span>
  );
}

/* ---- Item category: inline sheet with keyboard-safe footer ---- */

function ItemCategorySheet({ open, onClose, existingCategories, onSelect }) {
  const [text, setText] = useState('');

  if (!open) return null;

  return (
    <Sheet open={open} onClose={onClose} title="Set category"
      footer={
        <>
          <Button onClick={() => { onSelect(''); onClose(); }}>Clear</Button>
          <Button variant="primary" onClick={() => { if (text.trim()) { onSelect(text.trim()); onClose(); } }}
            disabled={!text.trim()}>Set</Button>
        </>
      }>
      <Field label="Category name">
        <Input value={text} onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Produce, Dairy" autoFocus />
      </Field>
      {existingCategories.length > 0 && (
        <div className="cat-existing">
          <span className="eyebrow">Existing</span>
          <div className="cat-existing-chips">
            {existingCategories.map((c) => (
              <Chip key={c} tone="neutral" onClick={() => { onSelect(c); onClose(); }}>{c}</Chip>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function ListScreen() {
  const { listId } = useParams();
  const nav = useNavigate();
  const repo = useRepo();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [addCatFor, setAddCatFor] = useState(null);
  const [filterCat, setFilterCat] = useState(null);

  const list = repo.get(listId);
  if (!list || list.deletedAt) {
    return (
      <div className="page">
        <Card><EmptyState icon={ListChecks} title="List not found" body="It may have been deleted."
          action={<Button variant="outline" size="sm" onClick={() => nav('/lists')}>Back to lists</Button>} /></Card>
      </div>
    );
  }

  const mode = list.data?.mode || 'clearable';
  const items = repo.query({ type: ITEM_TYPE }).filter((i) => i.data?.listId === listId);

  const allItemCategories = useMemo(() => {
    const set = new Set();
    items.forEach((i) => { if (i.data?.category) set.add(i.data.category); });
    return [...set].sort();
  }, [items]);

  const hasItemCats = allItemCategories.length > 0;

  const openItems = items.filter((i) => !i.doneAt);
  const doneItems = items.filter((i) => i.doneAt);

  // Filter by category
  const visibleOpen = filterCat
    ? openItems.filter((i) => (i.data?.category || '') === filterCat)
    : openItems;

  // Group open items by category when categories exist
  const groupedOpen = useMemo(() => {
    if (!hasItemCats) return [{ cat: null, items: visibleOpen }];
    const groups = {};
    const uncategorized = [];
    visibleOpen.forEach((item) => {
      const cat = item.data?.category || '';
      if (!cat) { uncategorized.push(item); return; }
      (groups[cat] ||= []).push(item);
    });
    const result = Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, items]) => ({ cat, items }));
    if (uncategorized.length) result.push({ cat: null, items: uncategorized });
    return result;
  }, [visibleOpen, hasItemCats]);

  const add = () => {
    const t = text.trim();
    if (!t) return;
    repo.create(ITEM_TYPE, { title: t, data: { listId } });
    setText('');
  };

  const clearDone = () => doneItems.forEach((i) => repo.softDelete(i.id));

  const promote = (item) => {
    repo.create('reminders.task', {
      title: item.title,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      links: [{ rel: 'from-list', id: item.id }],
    });
  };

  const setItemCategory = (itemId, cat) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const nextData = { ...item.data };
    if (cat) nextData.category = cat;
    else delete nextData.category;
    repo.update(itemId, { data: nextData });
  };

  const renderItem = (item, showCat = true) => (
    <Row
      key={item.id}
      accent="var(--accent-lists)"
      title={
        <span className="list-item-title-row">
          <span>{item.title}</span>
          {showCat && item.data?.category && (
            <span className="list-item-cat-badge">{item.data.category}</span>
          )}
        </span>
      }
      dim={!!item.doneAt && mode === 'clearable'}
      right={
        <span className="list-item-actions">
          <CompleteButton
            completed={!!item.doneAt}
            onToggle={() => repo.update(item.id, { doneAt: item.doneAt ? null : new Date().toISOString() })}
            label={doneWord(mode)}
          />
          <button className="icon-btn" title="Set category"
            onClick={(e) => { e.stopPropagation(); setAddCatFor(item.id); }}>
            <Tag size={13} />
          </button>
          {!item.doneAt && (
            <button className="icon-btn" title="Remind me tomorrow"
              onClick={(e) => { e.stopPropagation(); promote(item); }}>
              <BellRing size={14} />
            </button>
          )}
          {item.doneAt && mode === 'collection' && (
            <Stars value={item.data?.rating || 0}
              onChange={(v) => repo.update(item.id, { data: { ...item.data, rating: v } })} />
          )}
        </span>
      }
    />
  );

  return (
    <div className="page">
      <button className="back" onClick={() => nav('/lists')}><ArrowLeft size={15} /> Lists</button>
      <div className="page-head">
        <div>
          <h1 className="page-title serif">{list.title}</h1>
          <p className="page-sub">{MODES.find((m) => m.value === mode)?.hint}</p>
        </div>
        <div className="head-actions">
          <ListDateMenu value={list.dueAt} onChange={(dueAt) => repo.update(list.id, { dueAt })} />
          <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>
          <button className="icon-btn danger" aria-label="Delete list" title="Delete list"
            onClick={() => {
              if (!window.confirm(`Delete "${list.title}" and its items?`)) return;
              repo.query({ type: ITEM_TYPE })
                .filter((i) => i.data?.listId === list.id)
                .forEach((i) => repo.softDelete(i.id));
              repo.softDelete(list.id);
              nav('/lists');
            }}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* ---- Add item ---- */}
      <Card className="capture-card">
        <div className="capture">
          <input className="capture-input" placeholder="Add an item" value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            aria-label="Add an item" />
          <Button variant="primary" size="sm" onClick={add} disabled={!text.trim()}>Add</Button>
        </div>
      </Card>

      {/* ---- Category filter bar ---- */}
      {hasItemCats && (
        <div className="cat-filter-bar">
          <Chip tone={!filterCat ? 'accent' : 'neutral'} onClick={() => setFilterCat(null)}>All</Chip>
          {allItemCategories.map((c) => (
            <Chip key={c} tone={filterCat === c ? 'accent' : 'neutral'}
              onClick={() => setFilterCat(filterCat === c ? null : c)}>{c}</Chip>
          ))}
        </div>
      )}

      {/* ---- Open items ---- */}
      <SectionLabel right={<span className="mono count">{visibleOpen.length}</span>}>
        {mode === 'collection' ? 'To get to' : 'Still needed'}
      </SectionLabel>
      <Card>
        {visibleOpen.length === 0 ? (
          <EmptyState icon={ListChecks} title="All clear" body="Add the next thing above." />
        ) : hasItemCats && !filterCat ? (
          <div className="ruled">
            {groupedOpen.map(({ cat, items: groupItems }) => (
              <div key={cat || '__none__'}>
                {cat && <div className="cat-group-label"><Tag size={12} /> {cat}</div>}
                {groupItems.map((item) => renderItem(item, !cat))}
              </div>
            ))}
          </div>
        ) : (
          <div className="ruled">
            {visibleOpen.map((item) => renderItem(item, true))}
          </div>
        )}
      </Card>

      {/* ---- Done items ---- */}
      {doneItems.length > 0 && (
        <>
          <SectionLabel
            right={mode === 'clearable'
              ? <Button size="sm" variant="quiet" onClick={clearDone}><Eraser size={13} /> Clear</Button>
              : <span className="mono count">{doneItems.length}</span>}>
            {doneWord(mode)}
          </SectionLabel>
          <Card>
            <div className="ruled">
              {doneItems.map((item) => renderItem(item, true))}
            </div>
          </Card>
        </>
      )}

      {editing && <ListSheet open onClose={() => setEditing(false)} existing={list} />}

      <ItemCategorySheet
        open={!!addCatFor}
        onClose={() => setAddCatFor(null)}
        existingCategories={allItemCategories}
        onSelect={(cat) => addCatFor && setItemCategory(addCatFor, cat)}
      />
    </div>
  );
}

/* ------------------------------- all lists ----------------------------- */

function ListRow({ list, openCount, onOpen, expanded, onToggle }) {
  return (
    <div className="today-list-block">
      <div className="today-item">
        <div className="today-item-main" onClick={onOpen}>
          <Row
            accent="var(--accent-lists)"
            title={list.title}
            meta={<Chip tone="neutral">{list.data?.mode === 'collection' ? 'Collection' : 'Clearable'}</Chip>}
            right={<span className="mono">{openCount}</span>}
          />
        </div>
        <button
          className={`list-expand-btn ${expanded ? 'is-open' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-expanded={expanded}>
          <ChevronDown size={16} />
        </button>
      </div>
      {expanded && <div className="list-sub-items"><ListPreview listId={list.id} /></div>}
    </div>
  );
}

export function ListsScreen() {
  const repo = useRepo();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(() => loadExpanded());
  const lists = repo.query({ type: LIST_TYPE });
  const items = repo.query({ type: ITEM_TYPE });

  const toggle = (id) => setExpanded(new Set(persistExpanded(id, !expanded.has(id))));

  // Extract all list-level categories
  const listCategories = useMemo(() => {
    const set = new Set();
    lists.forEach((l) => { if (l.data?.category) set.add(l.data.category); });
    return [...set].sort();
  }, [lists]);

  // Group lists by category
  const grouped = useMemo(() => {
    const groups = {};
    const uncategorized = [];
    lists.forEach((l) => {
      const cat = l.data?.category || '';
      if (!cat) { uncategorized.push(l); return; }
      (groups[cat] ||= []).push(l);
    });
    const result = Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, lists]) => ({ cat, lists }));
    if (uncategorized.length) result.push({ cat: null, lists: uncategorized });
    return result;
  }, [lists]);

  const hasListCats = listCategories.length > 0;

  const renderListRow = (l) => {
    const mine = items.filter((i) => i.data?.listId === l.id);
    const openCount = mine.filter((i) => !i.doneAt).length;
    return (
      <ListRow
        key={l.id}
        list={l}
        openCount={openCount}
        expanded={expanded.has(l.id)}
        onToggle={() => toggle(l.id)}
        onOpen={() => nav(`/lists/${l.id}`)}
      />
    );
  };

  return (
    <div className="page has-fab">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Lists</h1>
          <p className="page-sub">Things that wait until you're in the right place.</p>
        </div>
      </div>

      {lists.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="No lists yet"
            body="Shopping, films to watch, books to read — each one picks its own behaviour."
            action={<Button variant="outline" size="sm" onClick={() => setCreating(true)}>Create a list</Button>}
          />
        </Card>
      ) : hasListCats ? (
        /* ---- Grouped by category ---- */
        grouped.map(({ cat, lists: groupLists }) => (
          <div key={cat || '__uncategorized__'}>
            <SectionLabel right={<span className="mono count">{groupLists.length}</span>}>
              {cat ? (
                <span className="list-cat-section"><FolderOpen size={13} /> {cat}</span>
              ) : 'Other'}
            </SectionLabel>
            <Card>
              <div className="ruled">
                {groupLists.map(renderListRow)}
              </div>
            </Card>
          </div>
        ))
      ) : (
        /* ---- Flat list (no categories) ---- */
        <Card>
          <div className="ruled">
            {lists.map(renderListRow)}
          </div>
        </Card>
      )}

      {creating && <ListSheet open onClose={() => setCreating(false)} />}

      <Fab label="New list" onClick={() => setCreating(true)} />
    </div>
  );
}

/* ------------------------------ dashboard ------------------------------- */

// A list has no single "done" flag the way a reminder does, so for day-
// agenda purposes it's treated as "completed" once it has no open items
// left — that's what lets an overdue list with things still on it roll
// forward onto Today via isOnAgendaDay, exactly like Reminders/Payments,
// while a cleared one settles on its real day and stops nagging.
function listAgendaItem(l, allItems) {
  const openCount = allItems.filter((i) => i.data?.listId === l.id && !i.doneAt).length;
  return {
    id: l.id, title: l.title, type: 'lists',
    dueDate: l.dueAt, pinned: l.home === 'pinned',
    completed: openCount === 0, completedAt: null,
    to: `/lists/${l.id}`, openCount,
    record: l,
  };
}

/** Dashboard's pinned-list preview: the open items, right here, plus an
 *  explicit way to go edit/clear the real thing — rather than either
 *  landing on the (not very useful) name/mode/category edit sheet, or
 *  navigating straight into the list itself. The list's own in-app back
 *  button always returns to /lists, not wherever you came from, which is
 *  what made a bare navigate-there-on-tap feel like it "opened the list
 *  instead of the dashboard" — staying on Dashboard until you explicitly
 *  ask to open it avoids that entirely. */
function ListQuickPreview({ list, onOpen, onClose }) {
  return (
    <Sheet
      open onClose={onClose} title={list.title}
      footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={onOpen}>Open list</Button></>}
    >
      <ListPreview listId={list.id} limit={10} />
    </Sheet>
  );
}

registerProvider({
  id: 'lists',
  getItemsForDate: (date, repo) => {
    const allItems = repo.query({ type: ITEM_TYPE });
    return repo.query({ type: LIST_TYPE })
      .filter((l) => l.dueAt)
      .map((l) => listAgendaItem(l, allItems))
      .filter((item) => isOnAgendaDay(item.dueDate, item.completed, date));
  },
  getPinnedItems: (repo) => repo.query({ type: LIST_TYPE })
    .filter((l) => l.home === 'pinned')
    .map((l) => ({
      id: l.id, title: l.title, type: 'lists',
      dueDate: null, pinned: true, completed: false, completedAt: null,
      to: `/lists/${l.id}`,
      record: l,
    })),
  togglePin: (repo, item) => repo.update(item.id, { home: item.pinned ? 'auto' : 'pinned' }),
  renderPreview: (record, { onOpen, onClose }) => (
    <ListQuickPreview list={record} onOpen={onOpen} onClose={onClose} />
  ),
  // Inline (non-popup) preview for the day agenda's expandable list card —
  // same open-items view as the pinned preview, just rendered in place
  // instead of inside a Sheet.
  renderInline: (record) => <ListPreview listId={record.id} limit={20} />,
});

/* ------------------------------- manifest ------------------------------ */

export default {
  id: 'lists',
  title: 'Lists',
  icon: ListChecks,
  accent: 'var(--accent-lists)',
  tier: 'integrated',
  routes: [
    { path: '/lists', element: <ListsScreen /> },
    { path: '/lists/:listId', element: <ListScreen /> },
  ],

  renderRef: (record) => <span className="ref-chip">{record.title}</span>,

  search: ({ repo }, q) => {
    const lists = repo.query({ type: LIST_TYPE });
    const nameOf = (id) => lists.find((l) => l.id === id)?.title || 'List';
    return [
      ...lists.filter((l) => l.title.toLowerCase().includes(q))
        .map((l) => ({ id: l.id, title: l.title, sub: 'List', to: `/lists/${l.id}` })),
      ...repo.query({ type: ITEM_TYPE }).filter((i) => i.title.toLowerCase().includes(q))
        .map((i) => ({ id: i.id, title: i.title, sub: nameOf(i.data?.listId), to: `/lists/${i.data?.listId}` })),
    ];
  },

  quickActions: [{ id: 'new-list', label: 'New list', icon: ListChecks, to: '/lists' }],
};
