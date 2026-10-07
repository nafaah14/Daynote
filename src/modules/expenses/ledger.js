/**
 * Pure money helpers for Expenses — no React, no repo, so the balance math
 * can be tested on its own.
 */

export const CURRENCY = 'MVR';
/** "19,494.00" — the bare figure, for table cells under an MVR header. */
export const amt = (n) =>
  `${(n < 0 ? '\u2212' : '')}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "19,494.00 MVR" — suffix form, matching how the sheet shows rufiyaa. */
export const fmt = (n) => `${amt(n)} ${CURRENCY}`;

export const num = (v) => {
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Running balance, row by row — the spreadsheet's IF(income, prev+income, prev-expense). */
export function buildLedger(page, entries) {
  const opening = num(page.data?.opening);
  let balance = opening;
  let totalIn = 0;
  let totalOut = 0;
  const rows = entries.map((e) => {
    const income = num(e.data?.income);
    const expense = num(e.data?.expense);
    totalIn += income;
    totalOut += expense;
    balance += income - expense;
    return { entry: e, income, expense, balance };
  });
  return { opening, totalIn, totalOut, closing: balance, rows };
}
