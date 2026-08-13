/**
 * Pure month/ledger math for the Payments module. Deliberately independent
 * of the repo and of modules/reminders — modules never import each other, so
 * the small amount of date arithmetic reminders already has for its own
 * recurrence rule is duplicated here rather than shared.
 *
 * The core idea: nothing is materialised month by month. A monthly charge
 * per item per month, stored forever, is exactly the kind of write growth
 * this app avoids elsewhere (see repo.jsx). Instead, what's owed is computed
 * on the fly from the item's start date and amount, minus whatever payments
 * have actually been logged against it.
 */

const pad2 = (n) => String(n).padStart(2, '0');

export const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
export const currentMonthKey = () => monthKey(new Date());

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return monthKey(d);
}

/** Inclusive count of months from startKey through endKey. */
export function monthsCount(startKey, endKey) {
  const [sy, sm] = startKey.split('-').map(Number);
  const [ey, em] = endKey.split('-').map(Number);
  return Math.max(0, (ey - sy) * 12 + (em - sm) + 1);
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: 'short', year: 'numeric' });
}

/** A day-of-month clamped to whatever that month actually has (30 Feb → 28/29). */
export function clampedDate(year, monthIndex0, day) {
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
  return new Date(year, monthIndex0, Math.min(day, lastDay));
}

/**
 * The next due date on/after `now`, walking forward one month at a time from
 * the item's start month. Returns null once that would land past the item's
 * end month, meaning there's nothing left to remind about.
 */
export function nextDueDate(item, now = new Date()) {
  const [sy, sm] = (item.startMonth || currentMonthKey()).split('-').map(Number);
  const day = Number(item.dueDay) || 1;
  let candidate = clampedDate(sy, sm - 1, day);
  let guard = 0;
  while (candidate < now && guard++ < 1200) {
    candidate = clampedDate(candidate.getFullYear(), candidate.getMonth() + 1, day);
  }
  if (item.endMonth && monthKey(candidate) > item.endMonth) return null;
  return candidate.toISOString();
}

/** Sum of every payment logged against this item. */
export const totalPaid = (payments) => payments.reduce((s, p) => s + (Number(p.data?.amount) || 0), 0);

/**
 * What's owed right now: every month from the item's start through the
 * current month (or its end month, if that's sooner) at the monthly amount,
 * minus everything paid. Negative means an overpayment / credit.
 */
export function pendingAmount(item, payments, now = new Date()) {
  const cur = monthKey(now);
  const cap = item.endMonth && item.endMonth < cur ? item.endMonth : cur;
  const accrued = monthsCount(item.startMonth, cap) * (Number(item.amount) || 0);
  return accrued - totalPaid(payments);
}

/**
 * A month-by-month breakdown of due/paid/pending.
 *
 * A payment carrying an explicit `allocations` array (even an empty one)
 * applies directly to the month(s) it names — nothing is guessed. An empty
 * array means "no month, pure credit"; a populated one applies each slice's
 * amount to that month, and anything beyond what that month still owes
 * spills into the credit pool rather than being force-fit there.
 *
 * A payment with NO `allocations` field is a legacy record that predates
 * explicit allocation, and is applied oldest-month-first (FIFO) exactly as
 * every payment used to be — this is what keeps existing history reading
 * the same after this change. Explicit allocations only ever *add to* the
 * credit pool (via overflow); only the legacy/FIFO branch *draws from* it,
 * since an allocation is a deliberate instruction and shouldn't silently
 * pull top-up funds meant for something else. Both styles interleave
 * correctly because this is one chronological walk, not "all allocated,
 * then all legacy".
 */
export function monthlyAging(item, payments, now = new Date()) {
  const cur = monthKey(now);
  const cap = item.endMonth && item.endMonth < cur ? item.endMonth : cur;
  const n = monthsCount(item.startMonth, cap);
  const months = [];
  for (let i = 0; i < n; i++) {
    months.push({ month: addMonths(item.startMonth, i), due: Number(item.amount) || 0, paid: 0 });
  }
  const byMonth = new Map(months.map((m) => [m.month, m]));

  const sorted = payments.slice().sort((a, b) =>
    (a.data.date || '').localeCompare(b.data.date || '') || a.createdAt.localeCompare(b.createdAt));

  let credit = 0;
  sorted.forEach((p) => {
    const allocations = p.data?.allocations;
    if (Array.isArray(allocations)) {
      if (allocations.length === 0) {
        // Explicit "no month" — the whole amount is credit, not silently dropped.
        credit += Number(p.data?.amount) || 0;
        return;
      }
      allocations.forEach((a) => {
        const amt = Number(a.amount) || 0;
        const m = byMonth.get(a.month);
        if (!m) { credit += amt; return; }
        const room = Math.max(m.due - m.paid, 0);
        const apply = Math.min(room, amt);
        m.paid += apply;
        if (amt - apply > 0.001) credit += amt - apply;
      });
      return;
    }

    let remaining = (Number(p.data?.amount) || 0) + credit;
    credit = 0;
    for (let i = 0; i < months.length && remaining > 0.001; i++) {
      const m = months[i];
      const cap2 = m.due - m.paid;
      if (cap2 > 0.001) {
        const apply = Math.min(cap2, remaining);
        m.paid += apply;
        remaining -= apply;
      }
    }
    if (remaining > 0.001) credit += remaining;
  });

  return {
    months: months.map((m) => ({ ...m, pending: m.due - m.paid })),
    credit,
  };
}

/**
 * A single chronological feed mixing monthly charges and payments, each
 * carrying the running balance immediately after it — what a printed
 * statement and an in-app ledger view both want. One row per PAYMENT, not
 * one per allocation slice, so a split payment stays a single row carrying
 * its full `allocations` array for the caller to render as it likes (e.g.
 * "Jun 2026: 3,500 + Dec 2025: 500").
 */
export function buildLedger(item, payments, now = new Date()) {
  const { months } = monthlyAging(item, payments, now);
  const totalBilled = months.reduce((s, m) => s + m.due, 0);
  const totalSettled = totalPaid(payments);
  const balance = pendingAmount(item, payments, now);

  const sortedPayments = payments.slice().sort((a, b) =>
    (a.data.date || '').localeCompare(b.data.date || '') || a.createdAt.localeCompare(b.createdAt));

  const events = [];
  months.forEach((m) => {
    events.push({ type: 'charge', date: `${m.month}-01`, month: m.month, amount: m.due });
  });
  sortedPayments.forEach((p) => {
    events.push({
      type: 'payment',
      date: p.data.date || p.createdAt.slice(0, 10),
      amount: Number(p.data?.amount) || 0,
      note: p.data?.note || '',
      allocations: p.data?.allocations || null,
      id: p.id,
    });
  });
  events.sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  const rows = events.map((e) => {
    running += e.type === 'charge' ? e.amount : -e.amount;
    return { ...e, balance: running };
  });

  return { totalBilled, totalSettled, balance, rows };
}
