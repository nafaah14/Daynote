import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Wallet, ArrowLeft, Trash2, CopyPlus } from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import {
  Card, SectionLabel, EmptyState, Button, Sheet, Field, Input, Select, Chip, Row,
} from '../../core/ui/components';
import { Fab } from '../../core/ui/extras';
import { CURRENCY, fmt, amt, num, buildLedger } from './ledger';
import './expenses.css';

/**
 * Expense pages — one ledger per page, laid out like the spreadsheet it
 * replaces: Income | Expense | Balance | Remarks, where each row's balance is
 * the previous balance plus income minus expense.
 *
 * A page is a parent record and its entries are children pointing back at it
 * through data.pageId — the same parent+child shape Ideas and Lists use.
 * Balances are never stored; they're recomputed from the entries every time,
 * so editing or deleting an old row can't leave a stale running total behind.
 */
export const PAGE_TYPE = 'expenses.page';
export const ENTRY_TYPE = 'expenses.entry';

export const KINDS = [
  { value: 'monthly', label: 'Monthly', hint: 'A month of income and spending. Start next month from its closing balance.' },
  { value: 'trip', label: 'Trip', hint: 'A travel plan — track the major costs as you book and spend.' },
  { value: 'general', label: 'General', hint: 'Anything else worth a running tally.' },
];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const monthTitle = (date) => date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export const entriesFor = (repo, pageId) => repo.query({ type: ENTRY_TYPE })
  .filter((e) => e.data?.pageId === pageId)
  .sort((a, b) => (a.data.date || '').localeCompare(b.data.date || '') || a.createdAt.localeCompare(b.createdAt));

/* ------------------------------ page editor ------------------------------ */

function PageSheet({ onClose, existing, preset }) {
  const repo = useRepo();
  const nav = useNavigate();
  const [title, setTitle] = useState(existing?.title || preset?.title || '');
  const [kind, setKind] = useState(existing?.data?.kind || preset?.kind || 'monthly');
  const [opening, setOpening] = useState(String(existing?.data?.opening ?? preset?.opening ?? ''));

  const save = () => {
    const t = title.trim();
    if (!t) return;
    const data = { ...(existing?.data || {}), kind, opening: num(opening) };
    if (existing) {
      repo.update(existing.id, { title: t, data });
    } else {
      const rec = repo.create(PAGE_TYPE, { title: t, data });
      // Closing the sheet pops its history entry with a deferred back(), which
      // would undo a navigation made now — so open the new page only once that
      // pop has landed (with a fallback in case it never comes).
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        window.removeEventListener('popstate', go);
        nav(`/expenses/${rec.id}`);
      };
      window.addEventListener('popstate', go);
      setTimeout(go, 400);
    }
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? 'Edit page' : 'New page'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>
            {existing ? 'Save changes' : 'Create page'}
          </Button>
        </>
      }
    >
      <Field label="Name">
        <Input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'trip' ? 'Colombo trip' : monthTitle(new Date())} autoFocus />
      </Field>
      <Field label="Kind" hint={KINDS.find((k) => k.value === kind)?.hint}>
        <Select value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </Select>
      </Field>
      <Field label={`Opening balance (${CURRENCY})`} hint="What you start with — leave empty to start from zero.">
        <Input type="text" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" />
      </Field>
    </Sheet>
  );
}

/* ------------------------------ entry editor ----------------------------- */

function EntrySheet({ pageId, existing, onClose }) {
  const repo = useRepo();
  const wasIncome = num(existing?.data?.income) > 0;
  const [dir, setDir] = useState(existing ? (wasIncome ? 'income' : 'expense') : 'expense');
  const [amount, setAmount] = useState(existing ? String(wasIncome ? existing.data.income : existing.data.expense) : '');
  const [date, setDate] = useState(existing?.data?.date || todayIso());
  const [remarks, setRemarks] = useState(existing?.title || '');

  const value = num(amount);
  const save = () => {
    if (value <= 0) return;
    const data = {
      ...(existing?.data || {}),
      pageId,
      date,
      income: dir === 'income' ? value : 0,
      expense: dir === 'expense' ? value : 0,
    };
    if (existing) repo.update(existing.id, { title: remarks.trim(), data });
    else repo.create(ENTRY_TYPE, { title: remarks.trim(), data });
    onClose();
  };

  const remove = () => {
    repo.softDelete(existing.id);
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? 'Edit entry' : 'New entry'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={value <= 0}>
            {existing ? 'Save changes' : 'Add entry'}
          </Button>
        </>
      }
    >
      <div className="cat-filter-bar">
        <Chip tone={dir === 'expense' ? 'accent' : 'neutral'} onClick={() => setDir('expense')}>Expense</Chip>
        <Chip tone={dir === 'income' ? 'accent' : 'neutral'} onClick={() => setDir('income')}>Income</Chip>
      </div>
      <Field label={`Amount (${CURRENCY})`}>
        <Input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00" autoFocus />
      </Field>
      <Field label="Remarks">
        <Input value={remarks} onChange={(e) => setRemarks(e.target.value)}
          placeholder={dir === 'income' ? 'Car slot rent' : 'Groceries'}
          onKeyDown={(e) => e.key === 'Enter' && save()} />
      </Field>
      <Field label="Date">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value || todayIso())} />
      </Field>
      {existing && <Button variant="danger" size="sm" onClick={remove}>Delete entry</Button>}
    </Sheet>
  );
}

/* -------------------------------- one page ------------------------------- */

export function ExpensePageScreen() {
  const { pageId } = useParams();
  const nav = useNavigate();
  const repo = useRepo();
  const [editing, setEditing] = useState(false);
  const [entry, setEntry] = useState(undefined); // undefined = closed, null = new
  const [nextMonth, setNextMonth] = useState(null);

  const page = repo.get(pageId);
  if (!page || page.deletedAt) {
    return (
      <div className="page">
        <Card>
          <EmptyState icon={Wallet} title="Page not found" body="It may have been deleted."
            action={<Button variant="outline" size="sm" onClick={() => nav('/expenses')}>Back to expenses</Button>} />
        </Card>
      </div>
    );
  }

  const entries = entriesFor(repo, pageId);
  const ledger = buildLedger(page, entries);
  const kind = KINDS.find((k) => k.value === page.data?.kind) || KINDS[2];

  const remove = () => {
    if (!window.confirm(`Delete "${page.title}" and its ${entries.length} entries?`)) return;
    entries.forEach((e) => repo.softDelete(e.id));
    repo.softDelete(page.id);
    nav('/expenses');
  };

  // Carry the closing balance forward, the way the next month's sheet starts
  // from the last balance cell of this one.
  const startNext = () => {
    const now = new Date();
    setNextMonth({
      kind: page.data?.kind || 'monthly',
      opening: Math.round(ledger.closing * 100) / 100,
      title: page.data?.kind === 'monthly' ? monthTitle(new Date(now.getFullYear(), now.getMonth() + (entries.length ? 1 : 0), 1)) : '',
    });
  };

  return (
    <div className="page has-fab">
      <button className="back" onClick={() => nav('/expenses')}><ArrowLeft size={15} /> Expenses</button>
      <div className="page-head">
        <div>
          <h1 className="page-title serif">{page.title}</h1>
          <p className="page-sub">{kind.label} · {entries.length} {entries.length === 1 ? 'entry' : 'entries'}</p>
        </div>
        <div className="head-actions">
          <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>
          <button className="icon-btn" aria-label="Start a new page from this balance" title="New page from closing balance" onClick={startNext}>
            <CopyPlus size={16} />
          </button>
          <button className="icon-btn danger" aria-label="Delete page" title="Delete page" onClick={remove}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <Card className="exp-summary">
        <div className="exp-summary-row"><span>Opening balance</span><span className="mono">{fmt(ledger.opening)}</span></div>
        <div className="exp-summary-row"><span>Income</span><span className="mono exp-in">+{fmt(ledger.totalIn)}</span></div>
        <div className="exp-summary-row"><span>Expense</span><span className="mono exp-out">{'−'}{fmt(ledger.totalOut)}</span></div>
        <div className="exp-summary-row exp-summary-total">
          <span>Balance</span>
          <span className={`mono ${ledger.closing < 0 ? 'exp-out' : ''}`}>{fmt(ledger.closing)}</span>
        </div>
      </Card>

      <SectionLabel right={<span className="mono count">{CURRENCY}</span>}>Ledger</SectionLabel>
      <Card>
        <div className="exp-table-wrap">
          <table className="exp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Income</th>
                <th className="num">Expense</th>
                <th className="num">Balance</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              <tr className="exp-opening">
                <td />
                <td />
                <td />
                <td className="num mono">{amt(ledger.opening)}</td>
                <td className="exp-remarks">Opening balance</td>
              </tr>
              {ledger.rows.map((r) => (
                <tr key={r.entry.id} className="exp-row" onClick={() => setEntry(r.entry)}>
                  <td className="exp-date">{fmtDate(r.entry.data.date)}</td>
                  <td className="num mono exp-in">{r.income ? amt(r.income) : ''}</td>
                  <td className="num mono exp-out">{r.expense ? amt(r.expense) : ''}</td>
                  <td className={`num mono ${r.balance < 0 ? 'exp-out' : ''}`}>{amt(r.balance)}</td>
                  <td className="exp-remarks">{r.entry.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {entries.length === 0 && (
          <EmptyState icon={Wallet} title="No entries yet" body="Add the first income or expense with the + button." />
        )}
      </Card>

      <Fab label="Add entry" onClick={() => setEntry(null)} />

      {entry !== undefined && <EntrySheet pageId={pageId} existing={entry || undefined} onClose={() => setEntry(undefined)} />}
      {editing && <PageSheet existing={page} onClose={() => setEditing(false)} />}
      {nextMonth && <PageSheet preset={nextMonth} onClose={() => setNextMonth(null)} />}
    </div>
  );
}

/* ------------------------------- all pages ------------------------------- */

const FILTERS = [{ value: 'all', label: 'All' }, ...KINDS];

export function ExpensesScreen() {
  const repo = useRepo();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('all');

  const pages = repo.query({ type: PAGE_TYPE })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const allEntries = repo.query({ type: ENTRY_TYPE });
  const shown = filter === 'all' ? pages : pages.filter((p) => (p.data?.kind || 'general') === filter);

  return (
    <div className="page has-fab">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Expenses</h1>
          <p className="page-sub">A page per month, trip or plan — balances in {CURRENCY}.</p>
        </div>
      </div>

      {pages.length > 0 && (
        <div className="cat-filter-bar">
          {FILTERS.map((f) => (
            <Chip key={f.value} tone={filter === f.value ? 'accent' : 'neutral'} onClick={() => setFilter(f.value)}>
              {f.label}
            </Chip>
          ))}
        </div>
      )}

      {pages.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title="No pages yet"
            body="Make one for this month, or for a trip you're planning, and log income and expenses as they happen."
            action={<Button variant="outline" size="sm" onClick={() => setCreating(true)}>New page</Button>}
          />
        </Card>
      ) : shown.length === 0 ? (
        <Card><EmptyState icon={Wallet} title="Nothing here" body="No pages of this kind." /></Card>
      ) : (
        <Card>
          <div className="ruled">
            {shown.map((p) => {
              const entries = allEntries.filter((e) => e.data?.pageId === p.id);
              const { closing } = buildLedger(p, entries);
              return (
                <Row
                  key={p.id}
                  accent="var(--accent-expenses)"
                  onClick={() => nav(`/expenses/${p.id}`)}
                  title={p.title}
                  meta={<Chip tone="neutral">{(KINDS.find((k) => k.value === p.data?.kind) || KINDS[2]).label}</Chip>}
                  right={<span className={`mono ${closing < 0 ? 'exp-out' : ''}`}>{fmt(closing)}</span>}
                />
              );
            })}
          </div>
        </Card>
      )}

      {creating && <PageSheet onClose={() => setCreating(false)} />}

      <Fab label="New page" onClick={() => setCreating(true)} />
    </div>
  );
}

/* ------------------------------- manifest -------------------------------- */

export default {
  id: 'expenses',
  title: 'Expenses',
  icon: Wallet,
  accent: 'var(--accent-expenses)',
  tier: 'integrated',
  routes: [
    { path: '/expenses', element: <ExpensesScreen /> },
    { path: '/expenses/:pageId', element: <ExpensePageScreen /> },
  ],

  renderRef: (record) => <span className="ref-chip">{record.title}</span>,

  search: ({ repo }, q) => {
    const pages = repo.query({ type: PAGE_TYPE });
    const nameOf = (id) => pages.find((p) => p.id === id)?.title || 'Expenses';
    return [
      ...pages.filter((p) => p.title.toLowerCase().includes(q))
        .map((p) => ({ id: p.id, title: p.title, sub: 'Expense page', to: `/expenses/${p.id}` })),
      ...repo.query({ type: ENTRY_TYPE }).filter((e) => (e.title || '').toLowerCase().includes(q))
        .map((e) => ({ id: e.id, title: e.title, sub: nameOf(e.data?.pageId), to: `/expenses/${e.data?.pageId}` })),
    ];
  },

  quickActions: [{ id: 'new-expense-page', label: 'New expense page', icon: Wallet, to: '/expenses' }],
};
