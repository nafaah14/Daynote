import { useState } from 'react';
import { HandCoins, Pencil, Trash2, ArrowLeft, FileText, Copy, Check } from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import {
  Card, Row, SectionLabel, EmptyState, Button, Sheet, Field, Input, Textarea, Toggle, Chip, useBackClose,
} from '../../core/ui/components';
import { HomeVisibility, Fab } from '../../core/ui/extras';
import { isOverdue, endOfToday } from '../../core/dates';
import {
  currentMonthKey, monthLabel, nextDueDate, pendingAmount, monthlyAging, buildLedger,
} from './ledger';
import './payments.css';

export const ITEM_TYPE = 'payments.item';
export const TX_TYPE = 'payments.tx';

export const CATEGORIES = ['Rent', 'Loan', 'Subscription', 'Utility', 'Other'];

const CURRENCY = 'MVR';
export const fmt = (n) =>
  `${CURRENCY} ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Format a date string as a clean date (no relative "x days ago"). */
const fmtDate = (d) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

const paymentsFor = (repo, itemId) => repo.query({ type: TX_TYPE }).filter((t) => t.data.itemId === itemId);

export function statusOf(item, pending) {
  if (item.data.active === false) return { key: 'paused', label: 'Paused', color: 'var(--muted)' };
  if (Math.abs(pending) < 0.01) return { key: 'settled', label: 'Settled', color: 'var(--in)' };
  if (pending > 0) {
    return { key: 'pending', label: item.data.kind === 'pay' ? 'You owe' : 'Owed to you', color: 'var(--out)' };
  }
  return { key: 'credit', label: item.data.kind === 'pay' ? 'You overpaid' : 'Overpaid to you', color: 'var(--gold)' };
}

/* -------------------------------- item editor ---------------------------- */

function ItemSheet({ existing, initialKind, onClose }) {
  const repo = useRepo();
  const isNew = !existing;
  const d = existing?.data || {};
  const [kind, setKind] = useState(d.kind || initialKind || 'receive');
  const [name, setName] = useState(existing?.title || '');
  const [category, setCategory] = useState(d.category || '');
  const [amount, setAmount] = useState(d.amount ?? '');
  const [startMonth, setStartMonth] = useState(d.startMonth || currentMonthKey());
  const [endMonth, setEndMonth] = useState(d.endMonth || '');
  const [dueDay, setDueDay] = useState(d.dueDay || 1);
  const [notes, setNotes] = useState(d.notes || '');
  const [remind, setRemind] = useState(d.remind !== false);
  const [active, setActive] = useState(d.active !== false);
  const [home, setHome] = useState(existing?.home || 'auto');
  const [error, setError] = useState(null);

  const save = () => {
    setError(null);
    if (!name.trim()) return setError('Give it a name — what this payment is for.');
    const amt = parseFloat(amount);
    if (Number.isNaN(amt) || amt <= 0) return setError('Enter a valid monthly amount.');
    const start = startMonth || currentMonthKey();
    if (endMonth && endMonth < start) return setError("End month can't be before the start month.");

    const day = Math.min(31, Math.max(1, Number(dueDay) || 1));
    const data = {
      kind, category: category.trim(), amount: amt,
      startMonth: start, endMonth: endMonth || null,
      dueDay: day, active, remind, notes: notes.trim(),
    };
    const dueAt = (active && remind) ? nextDueDate(data, new Date()) : null;
    const payload = { title: name.trim(), home, dueAt, data };

    if (isNew) repo.create(ITEM_TYPE, payload);
    else repo.update(existing.id, payload);
    onClose();
  };

  const remove = () => {
    if (existing) {
      paymentsFor(repo, existing.id).forEach((t) => repo.softDelete(t.id));
      repo.softDelete(existing.id);
    }
    onClose();
  };

  return (
    <Sheet open onClose={onClose}
      title={isNew ? 'New payment' : 'Edit payment'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{isNew ? 'Add' : 'Save'}</Button></>}>
      <Field label="Direction">
        <div className="segmented" role="radiogroup" aria-label="Direction">
          <button type="button" role="radio" aria-checked={kind === 'receive'}
            className={`segment ${kind === 'receive' ? 'is-on' : ''}`} onClick={() => setKind('receive')}>I receive this</button>
          <button type="button" role="radio" aria-checked={kind === 'pay'}
            className={`segment ${kind === 'pay' ? 'is-on' : ''}`} onClick={() => setKind('pay')}>I pay this</button>
        </div>
      </Field>
      <Field label="What for">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Flat rent, laptop loan" autoFocus />
      </Field>
      <Field label="Who" hint="Optional — the person or company.">
        <Input value={category} onChange={(e) => setCategory(e.target.value)} list="pay-categories" placeholder="Landlord, Ahmed…" />
        <datalist id="pay-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label="Monthly amount">
        <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </Field>
      <Field label="Start month">
        <Input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
      </Field>
      <Field label="End month" hint="Leave blank if it's ongoing.">
        <Input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
      </Field>
      <Field label="Due day of month" hint="Clamped to the last day for shorter months.">
        <Input type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
      </Field>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Unit, contact, agreement details…" />
      </Field>
      <div className="option-row" style={{ padding: '4px 0 var(--sp-4)' }}>
        <span className="option-body"><span className="option-title">Remind me</span><span className="option-hint">A notification when this becomes due.</span></span>
        <span className="option-control"><Toggle checked={remind} onChange={setRemind} label="Remind me when due" /></span>
      </div>
      {!isNew && (
        <div className="option-row" style={{ padding: '4px 0 var(--sp-4)' }}>
          <span className="option-body"><span className="option-title">Active</span><span className="option-hint">Paused items stop accruing and reminding.</span></span>
          <span className="option-control"><Toggle checked={active} onChange={setActive} label="Active" /></span>
        </div>
      )}
      <HomeVisibility value={home} onChange={setHome} autoHint="Appears on Today when it's due or overdue." />
      {error && <p className="settings-error">{error}</p>}
      {!isNew && <Button variant="danger" size="sm" onClick={remove}><Trash2 size={14} /> Delete, with its payment history</Button>}
    </Sheet>
  );
}

/* -------------------------------- payment editor with allocation -------------------------------- */

function PaymentSheet({ item, existing, onClose }) {
  const repo = useRepo();
  const isNew = !existing;
  const payments = paymentsFor(repo, item.id);
  const aging = monthlyAging(item.data, payments);
  const owedMonths = aging.months.filter((m) => m.pending > 0.01);

  // For existing tx, load its allocations
  const existingAllocs = existing?.data?.allocations || [];

  // Start with blank amount (never auto-fill)
  const [totalAmount, setTotalAmount] = useState(existing ? String(existing.data.amount) : '');
  const [date, setDate] = useState(existing?.data?.date || new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(existing?.data?.note || '');

  /**
   * Allocation rows are the primary path now, not an opt-in toggle — if
   * anything is pending, you pick which month(s) it settles. The one
   * concession to friction: with exactly one month owed, that row is
   * prefilled with its full pending amount, so the common case is still a
   * single tap — it's still saved as an explicit allocation, just a
   * one-entry one. An empty `allocs` array (nothing pending, and not
   * editing a previously-allocated entry) falls back to the plain amount
   * field below, saved with `allocations: []` — explicit "no month", not
   * legacy.
   */
  const [allocs, setAllocs] = useState(() => {
    if (existingAllocs.length > 0) return existingAllocs.map((a) => ({ ...a }));
    if (owedMonths.length === 1) {
      return [{ month: owedMonths[0].month, amount: String(owedMonths[0].pending), note: '' }];
    }
    return owedMonths.map((m) => ({ month: m.month, amount: '', note: '' }));
  });

  const updateAlloc = (i, patch) => setAllocs((a) => a.map((x, j) => j === i ? { ...x, ...patch } : x));

  const allocTotal = allocs.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);

  const save = () => {
    if (allocs.length > 0) {
      const validAllocs = allocs.filter((a) => parseFloat(a.amount) > 0);
      if (validAllocs.length === 0) return;
      const total = validAllocs.reduce((s, a) => s + parseFloat(a.amount), 0);
      const payload = {
        title: item.title,
        data: {
          itemId: item.id,
          amount: total,
          date,
          note: note.trim(),
          allocations: validAllocs.map((a) => ({
            month: a.month,
            amount: parseFloat(a.amount),
            note: (a.note || '').trim(),
          })),
        },
      };
      if (isNew) repo.create(TX_TYPE, payload);
      else repo.update(existing.id, payload);
    } else {
      const amt = parseFloat(totalAmount);
      if (Number.isNaN(amt) || amt <= 0) return;
      const payload = {
        title: item.title,
        data: { itemId: item.id, amount: amt, date, note: note.trim(), allocations: [] },
      };
      if (isNew) repo.create(TX_TYPE, payload);
      else repo.update(existing.id, payload);
    }
    onClose();
  };

  const remove = () => { repo.softDelete(existing.id); onClose(); };
  const isPayDir = item.data.kind === 'pay';

  return (
    <Sheet open onClose={onClose}
      title={isNew ? (isPayDir ? 'Log payment' : 'Log receipt') : 'Edit entry'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{isNew ? 'Log it' : 'Save'}</Button></>}>

      <Field label="Date">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      {allocs.length > 0 ? (
        <>
          <SectionLabel>Allocate by month</SectionLabel>
          {allocs.map((a, i) => (
            <div key={a.month} className="pay-alloc-row">
              <div className="pay-alloc-header">
                <span className="pay-alloc-month">{monthLabel(a.month)}</span>
                <span className="pay-alloc-owed">
                  {owedMonths.find((m) => m.month === a.month)
                    ? `${fmt(owedMonths.find((m) => m.month === a.month).pending)} pending`
                    : 'No balance'}
                </span>
              </div>
              <Input type="number" inputMode="decimal" value={a.amount}
                onChange={(e) => updateAlloc(i, { amount: e.target.value })} placeholder="0.00" />
              <Input value={a.note} onChange={(e) => updateAlloc(i, { note: e.target.value })}
                placeholder="Note for this month…" style={{ marginTop: 4, fontSize: 13 }} />
            </div>
          ))}
          <p className="settings-note" style={{ marginTop: 'var(--sp-2)' }}>
            Total: <strong className="mono">{fmt(allocTotal)}</strong>
          </p>
        </>
      ) : (
        <>
          <Field label={isPayDir ? 'Amount paid' : 'Amount received'}>
            <Input type="number" inputMode="decimal" value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" autoFocus />
          </Field>
        </>
      )}

      <Field label="Note" hint="Optional — bank transfer, partial payment…">
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {!isNew && <Button variant="danger" size="sm" onClick={remove}><Trash2 size={14} /> Delete this entry</Button>}
    </Sheet>
  );
}

/* -------------------------------- report preview -------------------------------- */

function ReportPreview({ item, payments, onClose }) {
  useBackClose(onClose);
  const isPayDir = item.data.kind === 'pay';
  const chargeWord = isPayDir ? 'Charge due' : 'Rent due';
  const payWord = isPayDir ? 'Paid' : 'Received';

  const printedOn = new Date();
  // Filename the browser suggests when saving as PDF comes from document.title.
  // Give it the payment name + date, e.g. "Car Parking Rent C-0210 — Statement 2026-08-03".
  const fileTitle = `${item.title} — Statement ${printedOn.toLocaleDateString('en-CA')}`;

  // Shared with the inline ledger view (PaymentHistoryView) — one row per
  // payment rather than one per allocation slice, so a split payment reads
  // as a single line with a "Jun 2026 X + Dec 2025 Y" style description.
  const ledger = buildLedger(item.data, payments);
  const ledgerRows = ledger.rows.map((r) => ({
    ...r,
    label: r.type === 'charge'
      ? `${chargeWord} — ${monthLabel(r.month)}`
      : [payWord, r.note, allocSummary(r.allocations)].filter(Boolean).join(' — '),
  }));

  const handlePrint = () => {
    const prev = document.title;
    document.title = fileTitle;
    document.body.classList.add('printing-report');
    const cleanup = () => {
      document.body.classList.remove('printing-report');
      document.title = prev;
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    // Safety net for browsers that don't fire afterprint reliably.
    setTimeout(cleanup, 1000);
  };

  const periodLabel = `${monthLabel(item.data.startMonth)} — ${item.data.endMonth ? monthLabel(item.data.endMonth) : 'ongoing'}`;

  return (
    <div className="pay-history-scrim pay-report-scrim">
      <div className="pay-history-top no-print">
        <div className="pay-history-heading">
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Back"><ArrowLeft size={19} /></button>
          <div className="pay-history-titles">
            <h2 className="pay-history-title">Report preview</h2>
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={handlePrint}>Print / Save PDF</button>
      </div>

      <div className="pay-history-scroll pay-report-body">
        <div className="pay-report-content">
          <div className="pay-report-head">
            <h1 className="pay-report-h1">Payment Statement</h1>
            <p className="pay-report-generated">Generated {printedOn.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>

          <h2 className="pay-report-h2">{item.title}</h2>
          <p className="pay-report-who">
            {isPayDir ? 'Payment you make' : 'Payment you receive'}
            {' · '}{fmt(item.data.amount)} / month
            {' · '}{periodLabel}
            {item.data.category ? ` · ${item.data.category}` : ''}
          </p>

          <div className="pay-report-summary">
            <div className="pay-report-summary-row">
              <span>Total billed</span><span className="mono">{fmt(ledger.totalBilled)}</span>
            </div>
            <div className="pay-report-summary-row">
              <span>Total {isPayDir ? 'paid' : 'settled'}</span><span className="mono">{fmt(ledger.totalSettled)}</span>
            </div>
            <div className="pay-report-summary-row pay-report-summary-total">
              <span>Balance</span>
              <span className={`mono ${ledger.balance > 0.01 ? 'pay-report-outstanding' : ''}`}>{fmt(ledger.balance)}</span>
            </div>
          </div>

          <table className="pay-report-table">
            <thead>
              <tr><th>Date</th><th>Description</th><th className="pay-report-num">Amount</th><th className="pay-report-num">Running balance</th></tr>
            </thead>
            <tbody>
              {ledgerRows.map((r, i) => (
                <tr key={i} className={r.type === 'payment' ? 'pay-report-payment-row' : ''}>
                  <td className="pay-report-date">{fmtDate(r.date)}</td>
                  <td>{r.label}</td>
                  <td className="mono pay-report-num">{r.type === 'charge' ? `+${fmt(r.amount)}` : `\u2212${fmt(r.amount)}`}</td>
                  <td className={`mono pay-report-num ${r.balance > 0.01 ? 'pay-report-outstanding' : ''}`}>{fmt(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- history / detail -------------------------------- */

/** "Jun 2026 MVR 3,500.00 + Dec 2025 MVR 500.00" — null when there's nothing to summarise. */
function allocSummary(allocations) {
  if (!allocations || allocations.length === 0) return null;
  return allocations.map((a) => `${monthLabel(a.month)} ${fmt(a.amount)}`).join(' + ');
}

function PaymentHistoryView({ item, onClose }) {
  useBackClose(onClose);
  const repo = useRepo();
  // Re-read the item live from repo so edits are reflected immediately
  const liveItem = repo.query({ type: ITEM_TYPE }).find((i) => i.id === item.id) || item;
  const payments = paymentsFor(repo, liveItem.id);
  const aging = monthlyAging(liveItem.data, payments);
  const owedMonths = aging.months.filter((m) => m.pending > 0.01);
  const ledger = buildLedger(liveItem.data, payments);
  const status = statusOf(liveItem, ledger.balance);
  const isPayDir = liveItem.data.kind === 'pay';
  const chargeWord = isPayDir ? 'Charge due' : 'Rent due';
  const payWord = isPayDir ? 'Paid' : 'Received';

  const [logging, setLogging] = useState(undefined);
  const [showReport, setShowReport] = useState(false);
  const [editing, setEditing] = useState(false);

  if (showReport) {
    return <ReportPreview item={liveItem} payments={payments} onClose={() => setShowReport(false)} />;
  }

  return (
    <div className="pay-history-scrim">
      <div className="pay-history-top">
        <div className="pay-history-heading">
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Back"><ArrowLeft size={19} /></button>
          <div className="pay-history-titles">
            <h2 className="pay-history-title">{liveItem.title}</h2>
            <p className="pay-history-sub">
              {[liveItem.data.category, `${fmt(liveItem.data.amount)} / month`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="pay-history-actions">
          <button type="button" className="icon-btn" onClick={() => setShowReport(true)} aria-label="Report" title="Report">
            <FileText size={18} />
          </button>
          <button type="button" className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit"><Pencil size={18} /></button>
        </div>
      </div>

      <div className="pay-history-scroll">
        <Card className="pay-ledger-summary">
          <div className="pay-ledger-summary-row">
            <span>Total billed</span>
            <span className="mono">{fmt(ledger.totalBilled)}</span>
          </div>
          <div className="pay-ledger-summary-row">
            <span>Total settled</span>
            <span className="mono">{fmt(ledger.totalSettled)}</span>
          </div>
          <div className="pay-ledger-summary-row pay-ledger-summary-total">
            <span>{status.label}</span>
            <span className="mono" style={{ color: status.color }}>{fmt(ledger.balance)}</span>
          </div>
        </Card>

        {(owedMonths.length > 0 || aging.credit > 0.01) && (
          <>
            <SectionLabel>Pending by month</SectionLabel>
            <Card>
              <div className="ruled" style={{ padding: '0 var(--sp-4)' }}>
                {owedMonths.map((m) => (
                  <div className="pay-aging-row" key={m.month}>
                    <span className="pay-aging-month">{monthLabel(m.month)}</span>
                    <span className="pay-aging-amt">{fmt(m.pending)}</span>
                  </div>
                ))}
                {aging.credit > 0.01 && (
                  <div className="pay-aging-row">
                    <span className="pay-aging-month">Advance credit</span>
                    <span className="pay-aging-amt pay-aging-credit">{fmt(aging.credit)}</span>
                  </div>
                )}
              </div>
            </Card>
          </>
        )}

        <SectionLabel right={<span className="mono count">{ledger.rows.length}</span>}>Ledger</SectionLabel>
        {ledger.rows.length === 0 ? (
          <Card>
            <EmptyState icon={HandCoins} title="Nothing here yet" body="Charges and payments will build up here as you go." />
          </Card>
        ) : (
          <Card>
            <div className="ruled" style={{ padding: '0 var(--sp-4)' }}>
              {ledger.rows.map((r) => r.type === 'charge' ? (
                <div key={`charge-${r.month}`} className="pay-hist-row pay-ledger-row-charge">
                  <span className="pay-hist-left">
                    <span className="pay-hist-date">{fmtDate(r.date)}</span>
                    <span className="pay-hist-note">{chargeWord} — {monthLabel(r.month)}</span>
                  </span>
                  <span className="pay-hist-right">
                    <span className="pay-hist-amt">{fmt(r.amount)}</span>
                    <span className="pay-ledger-bal mono">{fmt(r.balance)}</span>
                  </span>
                </div>
              ) : (
                <button key={r.id} type="button" className="pay-hist-row"
                  onClick={() => setLogging(payments.find((p) => p.id === r.id))}>
                  <span className="pay-hist-left">
                    <span className="pay-hist-date">{fmtDate(r.date)}</span>
                    {r.note && <span className="pay-hist-note">{r.note}</span>}
                    {allocSummary(r.allocations) && <span className="pay-hist-note">{allocSummary(r.allocations)}</span>}
                  </span>
                  <span className="pay-hist-right">
                    <span className="pay-hist-amt">{payWord} {fmt(r.amount)}</span>
                    <span className="pay-ledger-bal mono">{fmt(r.balance)}</span>
                    <span role="button" tabIndex={0} className="icon-btn" aria-label="Delete"
                      onClick={(e) => { e.stopPropagation(); repo.softDelete(r.id); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); repo.softDelete(r.id); } }}>
                      <Trash2 size={14} />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Fab className="fab-overlay"
        label={liveItem.data.kind === 'pay' ? 'Log payment' : 'Log receipt'}
        onClick={() => setLogging(null)} />

      {logging !== undefined && (
        <PaymentSheet item={liveItem} existing={logging || undefined} onClose={() => setLogging(undefined)} />
      )}

      {editing && (
        <ItemSheet existing={liveItem} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

/* -------------------------------- screen -------------------------------- */

export function PaymentsScreen() {
  const repo = useRepo();
  const [tab, setTab] = useState('receive');
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(undefined);

  const items = repo.query({ type: ITEM_TYPE }).filter((i) => i.data.kind === tab);
  const rows = items.map((item) => {
    const payments = paymentsFor(repo, item.id);
    const pending = pendingAmount(item.data, payments);
    return { item, pending, status: statusOf(item, pending) };
  });

  const order = { pending: 0, credit: 1, settled: 2, paused: 3 };
  rows.sort((a, b) => (order[a.status.key] - order[b.status.key]) || (b.pending - a.pending));

  const total = rows.reduce((s, r) => s + Math.max(r.pending, 0), 0);

  return (
    <div className="page has-fab">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Payments</h1>
          <p className="page-sub">Rent, loans, subscriptions — anyone you pay or who pays you.</p>
        </div>
      </div>

      <div className="segmented" role="radiogroup" aria-label="Direction" style={{ marginBottom: 'var(--sp-3)' }}>
        <button type="button" role="radio" aria-checked={tab === 'receive'}
          className={`segment ${tab === 'receive' ? 'is-on' : ''}`} onClick={() => setTab('receive')}>Receive</button>
        <button type="button" role="radio" aria-checked={tab === 'pay'}
          className={`segment ${tab === 'pay' ? 'is-on' : ''}`} onClick={() => setTab('pay')}>Pay</button>
      </div>

      <Card className="pay-stat">
        <div className="pay-stat-label">{tab === 'pay' ? 'You owe' : 'Owed to you'}</div>
        <div className="pay-stat-amt" style={{ color: total > 0.01 ? 'var(--out)' : 'var(--in)' }}>{fmt(total)}</div>
      </Card>

      <SectionLabel right={<span className="mono count">{rows.length}</span>}>
        {tab === 'pay' ? 'Money out' : 'Money in'}
      </SectionLabel>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={HandCoins}
            title={tab === 'pay' ? 'Nothing you pay yet' : 'Nothing you receive yet'}
            body="Add what you pay or receive, and the monthly amount."
            action={<Button variant="outline" size="sm" onClick={() => setEditing(null)}>Add one</Button>} />
        </Card>
      ) : (
        <Card>
          <div className="ruled">
            {rows.map(({ item, pending, status }) => (
              <Row key={item.id}
                accent={item.data.kind === 'pay' ? 'var(--out)' : 'var(--in)'}
                title={item.title}
                onClick={() => setViewing(item)}
                meta={
                  <span className="pay-item-sub">
                    {item.data.category && <span style={{ fontWeight: 500 }}>{item.data.category}</span>}
                    <span className="mono">{fmt(item.data.amount)}/mo</span>
                    <Chip tone={status.key === 'pending' ? 'out' : status.key === 'credit' ? 'gold' : status.key === 'settled' ? 'in' : 'neutral'}>{status.label}</Chip>
                  </span>
                }
                right={<span className="mono" style={{ color: status.color }}>{fmt(pending)}</span>} />
            ))}
          </div>
        </Card>
      )}

      {editing !== undefined && <ItemSheet existing={editing || undefined} initialKind={tab} onClose={() => setEditing(undefined)} />}
      {viewing && <PaymentHistoryView item={viewing} onClose={() => setViewing(null)} />}
      <Fab label="New payment" onClick={() => setEditing(null)} />
    </div>
  );
}

export const renderEditor = (record, close) => <ItemSheet existing={record || undefined} onClose={close} />;

/* ------------------------------- manifest ------------------------------ */

export default {
  id: 'payments', title: 'Payments', icon: HandCoins, accent: 'var(--accent-loans)', tier: 'integrated',
  routes: [{ path: '/payments', element: <PaymentsScreen /> }],
  today: ({ repo }) => {
    const items = repo.query({ type: ITEM_TYPE }).filter((i) => i.data.active !== false);
    const due = items.filter((i) => i.dueAt && i.dueAt <= endOfToday() && i.home !== 'hidden');
    const pinned = items.filter((i) => i.home === 'pinned' && !due.some((d) => d.id === i.id));
    const records = [...pinned, ...due];
    if (!records.length) return [];
    return [{
      id: 'payments-due', priority: 15,
      label: due.some((i) => isOverdue(i.dueAt)) ? 'Payments due & overdue' : 'Payments due',
      records,
      render: (i) => (
        <Row key={i.id} accent={i.data.kind === 'pay' ? 'var(--out)' : 'var(--in)'} title={i.title}
          meta={<span className="pay-item-sub"><span className="mono">{fmt(i.data.amount)}</span>
            {i.dueAt && <span className={isOverdue(i.dueAt) ? 'due-over mono' : 'mono'}>{fmtDate(i.dueAt)}</span>}
          </span>} />
      ),
    }];
  },
  renderRef: (record) => <span className="ref-chip">{record.title}</span>,
  search: ({ repo }, q) =>
    repo.query({ type: ITEM_TYPE })
      .filter((i) => i.title.toLowerCase().includes(q) || (i.data.category || '').toLowerCase().includes(q))
      .map((i) => ({ id: i.id, title: i.title, sub: i.data.kind === 'pay' ? 'You pay' : 'You receive', to: '/payments' })),
  quickActions: [{ id: 'new-payment', label: 'New payment', icon: HandCoins, to: '/payments' }],
  raiseEvents: ({ repo }) => {
    const now = new Date().toISOString();
    const items = repo.query({ type: ITEM_TYPE }).filter((i) => i.data.active !== false);
    const notices = [];
    items.forEach((i) => {
      if (!i.dueAt || i.dueAt > now) return;
      if (i.data.remind !== false) {
        notices.push({ title: i.data.kind === 'pay' ? 'Payment due' : 'Payment expected', body: i.title, url: '/payments', kind: 'reminder', dedupeKey: `payment:${i.id}:${i.dueAt}` });
      }
      const next = nextDueDate(i.data, new Date(Date.parse(i.dueAt) + 1000));
      if (next !== i.dueAt) repo.update(i.id, { dueAt: next, data: { ...i.data, pushedAt: null } });
    });
    return notices;
  },
  notifications: [{ id: 'payments.due', label: 'Payments due', hint: 'When a payment becomes due.', default: true }],
};
