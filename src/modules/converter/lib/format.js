/** Number formatting and a small safe expression parser for the input box. */

/** Readable result: grouped digits, trimmed zeros, scientific only at the extremes. */
export function formatNumber(n) {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1e12 || a < 1e-6) return n.toExponential(4).replace(/\.?0+e/, 'e');
  if (a >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: a >= 1000 ? 3 : 6 });
  return Number(n.toPrecision(8)).toLocaleString('en-US', { maximumFractionDigits: 12 });
}

/**
 * Evaluate "12", "5*12", "(3+4)/2", "1,5" (comma is a decimal only when there
 * is no dot). No eval: a recursive-descent parser over + - * / and
 * parentheses. Returns NaN for anything it can't read, including empty input.
 */
export function parseInput(text) {
  let s = String(text || '').replace(/\s+/g, '').replace(/[×x]/g, '*').replace(/÷/g, '/');
  if (!s) return NaN;
  s = s.includes('.') ? s.replace(/,/g, '') : s.replace(/,/g, '.');
  let i = 0;
  const peek = () => s[i];

  function number() {
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (!m) throw new Error('number expected');
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function factor() {
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') throw new Error('missing )');
      i++;
      return v;
    }
    return number();
  }
  function term() {
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const r = factor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  try {
    const v = expr();
    return i === s.length ? v : NaN;
  } catch {
    return NaN;
  }
}
