import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Users, Search, Trash2, Plus, GripVertical, Check } from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import {
  personOf, findOrCreatePerson, allPeople, linkToPerson, personBySid,
} from '../../core/people';
import {
  Card, Row, SectionLabel, EmptyState, Button, Sheet, Field, Input, Chip,
} from '../../core/ui/components';

export const TYPE = 'roster.staff';

const DEPT = 'Malé Power Generation Department — Electrical Services';
const DEPT_NAME = "Male' Power Generation Department";
const UNIT_NAME = 'Electrical Services Unit';

/* ----------------------------- seed data -------------------------------
   The 18 rows from the original HTML. Seeds BOTH a directory person and a
   roster entry that links to them.

   Roster no longer owns names or designations — Directory does. A roster
   entry holds only what is genuinely roster business: salary, promotion
   date, and manual order. Everything else is read through the link, which
   is why correcting a name in Directory fixes it here too.
------------------------------------------------------------------------ */
const SEED = [
  [1,  '10551',  'Ahmed Shafeeq',        'Service Engineer',      '16-06-2025', 18540.42],
  [2,  '110130', 'Ahmed Sinaz',          'Service Supervisor',    '16-06-2025',  9501.07],
  [3,  '120076', 'Mohamed Salah',        'Engineer',              '16-06-2025', 14798.47],
  [4,  '120087', 'Abdulla Arham',        'Service Supervisor',    '16-07-2025', 10953.52],
  [5,  '150070', 'Shaubaan Ibrahim',     'Senior Technician',     '16-06-2025',  8948.70],
  [6,  '160054', 'Yoosuf Adly Ishaq',    'Technician',            '16-06-2022',  8279.59],
  [7,  '160056', 'Siddheeq Hassan',      'Senior Technician',     '16-06-2025', 10951.31],
  [8,  '160057', 'Ahmed Faizan',         'Assistant Engineer',    '16-06-2025', 13770.84],
  [9,  '190055', 'Mohamed Zareer',       'Technician',            '16-06-2025',  7538.26],
  [10, '210015', 'Mukarram Hassan',      'Engineer',              '16-06-2025', 14800.05],
  [11, '210034', 'Raaidh Eejaz Rasheed', 'Technician',            '16-07-2025',  8280.31],
  [12, '220184', 'Mohamed Rifath',       'Technician',            '16-07-2025',  7200.39],
  [13, '230054', 'Mohamed Saahil',       'Assistant Technician',  '16-06-2025',  6570.18],
  [14, '230157', 'Ahmed Shujau',         'Assistant Technician',  '22-10-2024',  6570.37],
  [15, '230210', 'Mohamed Musthafa',     'Assistant Officer',     '-',           5942.11],
  [16, '240141', 'Mohamed Haail Hussain','Senior Supervisor',     '-',          14561.87],
  [17, '240153', 'Ali Shinaaz',          'Assistant Technician',  '01-05-2025',  6001.84],
  [18, '240241', 'Abdulla Shifaan',      'Assistant Technician',  '01-02-2025',  5997.50],
];

/**
 * "Has this roster been seeded?" is a fact about the ACCOUNT, not about the
 * device — so it lives in a synced record, not in localStorage.
 *
 * The previous version kept it in localStorage and guarded against second
 * devices by checking whether any Directory people existed. Importing a staff
 * CSV creates Directory people, so importing the directory silently prevented
 * the roster from ever seeding. Wrong proxy, real consequence.
 */
const FLAG_TYPE = 'system.flag';
const SEED_KEY = 'roster.seeded';

const fmt = (n) => Number(n).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const SORTS = [
  { key: 'manual',   label: 'Manual' },
  { key: 'no',       label: 'No.' },
  { key: 'name',     label: 'Name' },
  { key: 'jobTitle', label: 'Title' },
  { key: 'salary',   label: 'Salary' },
];

/** Manual order lives on each record. Records that have never been dragged
 *  fall back to their `no`, so the initial manual order is 1..N as expected. */
const rankOf = (r) => r.data.rank ?? r.data.no;

/* ------------------------------- add sheet -----------------------------
   New in v2 of the standalone app: create a staff record from inside the
   roster. Same field set as edit, plus staff ID (which must be unique).
------------------------------------------------------------------------ */
function AddSheet({ onClose }) {
  const repo = useRepo();
  const [sid, setSid]           = useState('');
  const [name, setName]         = useState('');
  const [designation, setDesig] = useState('');
  const [salary, setSalary]     = useState('');
  const [promo, setPromo]       = useState('-');
  const [error, setError]       = useState(null);

  const roster = repo.query({ type: TYPE });

  // If they're already in Directory, adding to the roster shouldn't ask you
  // to retype what we already know.
  const known = sid.trim() ? personBySid(repo, sid.trim()) : null;

  const save = () => {
    const s = sid.trim();
    if (!s) return setError('Staff ID is required.');
    const n = (known?.title || name).trim();
    if (!n) return setError('Name is required.');

    const already = roster.some((r) => {
      const p = personOf(repo, r);
      return String(p?.data.sid || r.data.sid) === s;
    });
    if (already) return setError('They are already on this roster.');

    const person = findOrCreatePerson(repo, {
      sid: s,
      name: n,
      designation: designation.trim() || known?.data.designation || '',
      dept: known?.data.dept || DEPT_NAME,
      unit: known?.data.unit || UNIT_NAME,
    });

    const nums = roster.map((r) => Number(r.data.no) || 0);
    repo.create(TYPE, {
      title: n,
      links: [linkToPerson(person.id)],
      data: {
        no: nums.length ? Math.max(...nums) + 1 : 1,
        salary: Number(salary) || 0,
        promo: promo.trim() || '-',
      },
    });
    onClose();
  };

  return (
    <Sheet
      open onClose={onClose} title="Add to roster"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Add</Button>
        </>
      }
    >
      <Field label="Staff ID" hint="If they're already in Directory, the rest fills itself in.">
        <Input value={sid} onChange={(e) => setSid(e.target.value)} inputMode="numeric" autoFocus placeholder="250017" />
      </Field>

      {known ? (
        <div className="known-person">
          <Check size={15} /> <strong>{known.title}</strong>
          <span>{known.data.designation}</span>
        </div>
      ) : (
        <>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </Field>
          <p className="settings-note" style={{ marginTop: '-8px' }}>
            Not in Directory yet — they'll be added there too.
          </p>
        </>
      )}

      <Field label="Designation">
        <Input
          value={designation}
          onChange={(e) => setDesig(e.target.value)}
          placeholder={known?.data.designation || 'Technician'}
        />
      </Field>
      <Field label="Basic salary (Rf)">
        <Input type="number" inputMode="decimal" step="0.01" value={salary} onChange={(e) => setSalary(e.target.value)} />
      </Field>
      <Field label="Last promotion" hint="DD-MM-YYYY, or leave as -">
        <Input value={promo} onChange={(e) => setPromo(e.target.value)} />
      </Field>
      {error && <p className="settings-error">{error}</p>}
    </Sheet>
  );
}

/* ------------------------------- edit sheet ----------------------------
   The original app had per-row salary/promo overrides. Here each staff is
   its own record, so an edit is just a patch — no override layer needed.
------------------------------------------------------------------------ */
function EditSheet({ existing, onClose }) {
  const repo = useRepo();
  const person = personOf(repo, existing);

  const [designation, setDesignation] = useState(person?.data.designation || existing.data.jobTitle || '');
  const [salary, setSalary] = useState(existing.data.salary);
  const [promo,  setPromo]  = useState(existing.data.promo);

  const save = () => {
    // Roster keeps salary, promotion date and order. Nothing else.
    repo.update(existing.id, {
      data: { ...existing.data, salary: Number(salary) || 0, promo: promo.trim() || '-' },
    });

    // THE ONE WRITE-BACK. A promotion changes someone's designation for real,
    // so this is the single place a module is allowed to correct Directory
    // rather than just read from it.
    if (person && designation.trim() && designation.trim() !== person.data.designation) {
      repo.update(person.id, {
        data: { ...person.data, designation: designation.trim() },
      });
    }
    onClose();
  };

  return (
    <Sheet
      open onClose={onClose}
      title={person?.title || existing.title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </>
      }
    >
      <Field label="Staff ID">
        <Input value={person?.data.sid || existing.data.sid || ''} readOnly />
      </Field>
      <Field
        label="Designation"
        hint="Saving a change here also updates them in Directory — a promotion is a real change of title."
      >
        <Input value={designation} onChange={(e) => setDesignation(e.target.value)} />
      </Field>
      <Field label="Basic salary (Rf)">
        <Input
          type="number" inputMode="decimal" step="0.01"
          value={salary} onChange={(e) => setSalary(e.target.value)}
        />
      </Field>
      <Field label="Last promotion" hint="DD-MM-YYYY, or leave as -">
        <Input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="16-06-2025" />
      </Field>

      <p className="settings-note" style={{ marginTop: 0 }}>
        Name, department and contact details live in Directory. Edit them there and
        they change everywhere at once.
      </p>

      <Button
        variant="danger" size="sm"
        onClick={() => { repo.softDelete(existing.id); onClose(); }}
      >
        <Trash2 size={14} /> Remove from roster
      </Button>
      <p className="settings-note">Removing from the roster leaves them in Directory.</p>
    </Sheet>
  );
}

/* --------------------------------- screen ------------------------------ */
export function RosterScreen() {
  const repo = useRepo();
  const [q, setQ] = useState('');
  const [mode, setMode] = useState(() => localStorage.getItem('daybook.roster.mode') || 'sort');
  const [sortKey, setSortKey] = useState('no');
  const [sortDir, setSortDir] = useState('asc');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding]   = useState(() =>
    new URLSearchParams(window.location.search).has('add')
  );

  useEffect(() => { localStorage.setItem('daybook.roster.mode', mode); }, [mode]);

  const all = repo.query({ type: TYPE });

  // Seed once per ACCOUNT, and migrate any legacy rows that still carry
  // embedded names from before Directory existed.
  const seedingRef = useRef(false);
  useEffect(() => {
    if (repo.loading || seedingRef.current) return;
    seedingRef.current = true;

    const marker = repo
      .query({ type: FLAG_TYPE })
      .find((f) => f.data?.key === SEED_KEY);

    const markSeeded = () =>
      repo.create(FLAG_TYPE, { title: 'Roster seeded', data: { key: SEED_KEY } });

    if (!marker) {
      if (all.length > 0) {
        // already has entries from before this marker existed — record the
        // fact so no device ever re-seeds, but don't add anything
        markSeeded();
      } else {
        SEED.forEach(([no, sid, name, jobTitle, promo, salary]) => {
          const person = findOrCreatePerson(repo, {
            sid, name, designation: jobTitle, dept: DEPT_NAME, unit: UNIT_NAME,
          });
          repo.create(TYPE, {
            title: name,
            links: [linkToPerson(person.id)],
            data: { no, salary, promo },
          });
        });
        markSeeded();
      }
      seedingRef.current = false;
      return;
    }

    // legacy rows: data.sid present but no person link yet
    const legacy = all.filter(
      (r) => !r.links?.some((l) => l.rel === 'person') && r.data?.sid
    );
    legacy.forEach((r) => {
      const person = findOrCreatePerson(repo, {
        sid: r.data.sid,
        name: r.title,
        designation: r.data.jobTitle,
        dept: r.data.dept || DEPT_NAME,
        unit: UNIT_NAME,
      });
      const { sid, jobTitle, dept, ...keep } = r.data;
      repo.update(r.id, { links: [...(r.links || []), linkToPerson(person.id)], data: keep });
    });

    seedingRef.current = false;
  }, [repo.loading, all.length]);

  /** Name and designation come from Directory, never from the roster row. */
  const infoOf = (r) => {
    const p = personOf(repo, r);
    return {
      name: p?.title || r.title || 'Unknown',
      sid: p?.data.sid || r.data.sid || '',
      designation: p?.data.designation || r.data.jobTitle || '',
      personId: p?.id || null,
    };
  };

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    let out = all;
    if (term) {
      out = out.filter((r) => {
        const i = infoOf(r);
        return i.name.toLowerCase().includes(term)
          || String(i.sid).includes(term)
          || i.designation.toLowerCase().includes(term);
      });
    }
    return [...out].sort((a, b) => {
      if (mode === 'manual') return rankOf(a) - rankOf(b);
      const ai = infoOf(a), bi = infoOf(b);
      const val = (r, i) => (
        sortKey === 'name' ? i.name
          : sortKey === 'jobTitle' ? i.designation
            : r.data[sortKey]
      );
      const av = val(a, ai), bv = val(b, bi);
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av ?? '').localeCompare(String(bv ?? ''));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [all, q, mode, sortKey, sortDir]);

  const setSort = (key) => {
    if (key === 'manual') { setMode('manual'); return; }
    setMode('sort');
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const isActive = (key) => (key === 'manual' ? mode === 'manual' : mode === 'sort' && sortKey === key);

  /* --------------------------- drag to reorder ---------------------------
     Pointer events unify mouse and touch. Only the grip has touch-action:none,
     so the rest of the row scrolls normally on mobile. During drag we mutate
     a local `order` array for live preview; on drop we write a single
     fractional rank to the moved record — no cascade updates.
  ------------------------------------------------------------------------ */
  const rowRefs = useRef(new Map());
  const setRowRef = useCallback((id) => (el) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  }, []);

  const [drag, setDrag] = useState(null); // { id, y, order }

  const dragEnabled = mode === 'manual' && !q.trim();

  const beginDrag = (e, id) => {
    if (!dragEnabled || !e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id, y: e.clientY, order: list.map((r) => r.id) });
    document.body.classList.add('dragging-active');
  };

  const moveDrag = (e) => {
    if (!drag) return;
    e.preventDefault();
    const y = e.clientY;

    // auto-scroll near viewport edges
    const margin = 90;
    if (y < margin) window.scrollBy(0, -8);
    else if (y > window.innerHeight - margin) window.scrollBy(0, 8);

    // hit-test to find where the moved row should sit
    const rest = drag.order.filter((id) => id !== drag.id);
    let insertAt = rest.length;
    for (let i = 0; i < rest.length; i++) {
      const el = rowRefs.current.get(rest[i]);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) { insertAt = i; break; }
    }
    const nextOrder = [...rest];
    nextOrder.splice(insertAt, 0, drag.id);
    const same = nextOrder.length === drag.order.length &&
      nextOrder.every((id, i) => id === drag.order[i]);
    setDrag({ ...drag, y, order: same ? drag.order : nextOrder });
  };

  const endDrag = () => {
    if (!drag) return;
    const { id, order } = drag;
    const idx = order.indexOf(id);
    const beforeId = order[idx - 1];
    const afterId  = order[idx + 1];
    const findR = (rid) => all.find((r) => r.id === rid);
    const b = beforeId ? findR(beforeId) : null;
    const a = afterId  ? findR(afterId)  : null;

    let newRank;
    if (!b && a) newRank = rankOf(a) - 1;
    else if (b && !a) newRank = rankOf(b) + 1;
    else if (b && a) newRank = (rankOf(b) + rankOf(a)) / 2;
    else newRank = 1;

    const moved = findR(id);
    if (moved) repo.update(id, { data: { ...moved.data, rank: newRank } });

    setDrag(null);
    document.body.classList.remove('dragging-active');
  };

  // clean up if the component unmounts mid-drag
  useEffect(() => () => document.body.classList.remove('dragging-active'), []);

  // during a drag, the visual order is the drag order, not the sort order
  const shownList = drag
    ? drag.order.map((id) => list.find((r) => r.id === id)).filter(Boolean)
    : list;

  const draggedRec = drag ? all.find((r) => r.id === drag.id) : null;

  const total = all.reduce((s, r) => s + (Number(r.data.salary) || 0), 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Roster</h1>
          <p className="page-sub">{DEPT}</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> Add
        </Button>
      </div>

      <Card className="capture-card">
        <div className="capture">
          <Search size={15} style={{ color: 'var(--muted)', flex: 'none' }} />
          <input
            className="capture-input"
            placeholder="Search by name, staff ID, title"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search roster"
          />
        </div>
      </Card>

      <div className="sort-bar" role="tablist" aria-label="Order" data-no-swipe>
        {SORTS.map((s) => {
          const active = isActive(s.key);
          const isManualBlocked = s.key === 'manual' && q.trim();
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={active}
              className={`sort-pill ${active ? 'is-active' : ''} ${isManualBlocked ? 'is-blocked' : ''}`}
              onClick={() => setSort(s.key)}
              title={isManualBlocked ? 'Clear the search to reorder manually' : undefined}
            >
              {s.label}
              {active && s.key !== 'manual' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
            </button>
          );
        })}
      </div>

      {mode === 'manual' && q.trim() && (
        <p className="settings-note" style={{ marginTop: 0 }}>
          Reordering is paused while searching. Clear the search to drag rows.
        </p>
      )}

      <SectionLabel right={<span className="mono count">{list.length}</span>}>
        {q ? 'Matches' : 'Staff'}
      </SectionLabel>
      <Card>
        {list.length === 0 ? (
          <EmptyState
            icon={Users}
            title={q ? 'No matches' : 'No staff yet'}
            body={q ? 'Try a shorter search.' : 'The roster will appear here.'}
          />
        ) : (
          <div
            className="roster-table"
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="roster-head" role="row">
              <span className="eyebrow">Name</span>
              <span className="eyebrow">Staff ID</span>
              <span className="eyebrow">Promotion</span>
              <span className="eyebrow">Salary</span>
            </div>
            {shownList.map((r) => (
              <div
                key={r.id}
                ref={setRowRef(r.id)}
                role="row"
                className={`roster-row ${drag?.id === r.id ? 'is-dragging' : ''}`}
                onClick={() => setEditing(r)}
              >

                <div className="roster-name-cell">
                  {dragEnabled && (
                    <button
                      className="grip"
                      aria-label={`Drag ${infoOf(r).name} to reorder`}
                      onPointerDown={(e) => beginDrag(e, r.id)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GripVertical size={16} strokeWidth={1.7} />
                    </button>
                  )}
                  <div className="roster-name-block">
                    <span className="roster-name">{infoOf(r).name}</span>
                    <span className="roster-jobtitle">
                      <Chip tone="neutral">{infoOf(r).designation || 'No designation'}</Chip>
                    </span>
                  </div>
                </div>

                <span className="roster-cell mono">{infoOf(r).sid || '—'}</span>
                <span className="roster-cell mono">
                  {!r.data.promo || r.data.promo === '-' ? '—' : r.data.promo}
                </span>
                <span className="roster-cell mono roster-salary">{fmt(r.data.salary)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {draggedRec && (
        <div className="drag-ghost" style={{ top: drag.y - 22 }}>
          {infoOf(draggedRec).name}
        </div>
      )}

      {!q && all.length > 0 && (
        <p className="settings-note">
          Total basic salary <span className="mono" style={{ color: 'var(--ink)' }}>Rf {fmt(total)}</span>
          {' '}across {all.length} staff.
        </p>
      )}

      {editing && <EditSheet existing={editing} onClose={() => setEditing(null)} />}
      {adding && <AddSheet onClose={() => setAdding(false)} />}
    </div>
  );
}

/* ------------------------------- manifest ------------------------------ */
export default {
  id: 'roster',
  title: 'Roster',
  icon: Users,
  accent: 'var(--accent-notes)',
  tier: 'integrated',
  routes: [{ path: '/roster', element: <RosterScreen /> }],

  renderRef: (record) => <span className="ref-chip">{record.title}</span>,

  search: ({ repo }, q) =>
    repo.query({ type: TYPE })
      .map((r) => {
        const p = personOf(repo, r);
        return {
          rec: r,
          name: p?.title || r.title,
          sid: p?.data.sid || r.data.sid || '',
          designation: p?.data.designation || r.data.jobTitle || '',
        };
      })
      .filter((x) =>
        x.name.toLowerCase().includes(q) ||
        String(x.sid).includes(q) ||
        x.designation.toLowerCase().includes(q)
      )
      .map((x) => ({
        id: x.rec.id,
        title: x.name,
        sub: `Roster · ${x.designation}`,
        to: '/roster',
      })),

  quickActions: [
    { id: 'find-staff', label: 'Find staff', icon: Users, to: '/roster' },
    { id: 'add-staff',  label: 'Add staff',  icon: Plus,  to: '/roster?add=1' },
  ],
};
