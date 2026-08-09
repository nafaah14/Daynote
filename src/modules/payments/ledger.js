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
 * A month-by-month breakdown of due/paid/pending, applying payments oldest
 * month first (FIFO) — the common case, and the same rule a simple manual
 * ledger would apply without asking you to allocate every payment by hand.
 * Any payment beyond what's currently due becomes credit, which the next
 * month's charge absorbs automatically as soon as it accrues.
 */
export function monthlyAging(item, payments, now = new Date()) {
  const cur = monthKey(now);
  const cap = item.endMonth && item.endMonth < cur ? item.endMonth : cur;
  const n = monthsCount(item.startMonth, cap);
  const months = [];
  for (let i = 0; i < n; i++) {
    months.push({ month: addMonths(item.startMonth, i), due: Number(item.amount) || 0, paid: 0 });
  }

  const sorted = payments.slice().sort((a, b) =>
    (a.data.date || '').localeCompare(b.data.date || '') || a.createdAt.localeCompare(b.createdAt));

  let credit = 0;
  sorted.forEach((p) => {
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
