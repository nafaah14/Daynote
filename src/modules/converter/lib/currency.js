/**
 * Currency rates: one free, keyless feed (open.er-api.com, USD-based, covers
 * MVR), cached in localStorage so the converter still works offline. Every
 * pair goes through the USD pivot, so one fetch prices every combination.
 */

export const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
export const QUICK_CURRENCIES = ['MVR', 'USD', 'EUR', 'GBP', 'INR', 'LKR', 'AED', 'SGD'];
export const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const CACHE_KEY = 'daybook.converter.rates';

export function loadCachedRates(storage = globalThis.localStorage) {
  try {
    const c = JSON.parse(storage.getItem(CACHE_KEY) || 'null');
    return c && c.rates && typeof c.fetchedAt === 'number' ? c : null;
  } catch { return null; }
}

export function saveCachedRates(cache, storage = globalThis.localStorage) {
  try { storage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* private mode: just don't cache */ }
}

export const isStale = (cache, now = Date.now()) => !cache || now - cache.fetchedAt > MAX_AGE_MS;

/** Fetch fresh rates. Throws on network or feed errors so the caller can fall back to the cache. */
export async function fetchRates(fetchImpl = fetch, now = Date.now()) {
  const res = await fetchImpl(RATES_URL);
  if (!res.ok) throw new Error(`Rates feed returned ${res.status}`);
  const body = await res.json();
  if (body.result !== 'success' || !body.rates) throw new Error('Rates feed returned no rates');
  return { rates: body.rates, fetchedAt: now };
}

/** Amount in `from` expressed in `to`. NaN when either currency isn't priced. */
export function convertCurrency(amount, from, to, rates) {
  const rf = from === 'USD' ? 1 : rates?.[from];
  const rt = to === 'USD' ? 1 : rates?.[to];
  if (!rf || !rt || !Number.isFinite(amount)) return NaN;
  return (amount / rf) * rt;
}

export function currencyName(code) {
  try { return new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) || code; } catch { return code; }
}
