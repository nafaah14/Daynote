/**
 * Electrical calculators. Pure functions; voltages are line-to-line for
 * three-phase (400 V) and line-to-neutral for single-phase (230 V).
 */

const SQRT3 = Math.sqrt(3);
const k = (phase) => (phase === 3 ? SQRT3 : 1);

/** Apparent power in kVA from line current. */
export const ampsToKva = ({ phase, volts, amps }) => (k(phase) * volts * amps) / 1000;

/** Real input power in kW from line current at a power factor. */
export const ampsToKw = ({ phase, volts, amps, pf }) => ampsToKva({ phase, volts, amps }) * pf;

/** Motor shaft/output power in kW: input power times efficiency (0-1). */
export const ampsToOutputKw = ({ phase, volts, amps, pf, eff = 1 }) => ampsToKw({ phase, volts, amps, pf }) * eff;

/** Line current for a kW figure. With `eff`, `kw` is the output (shaft) power, so input is kw / eff. */
export const kwToAmps = ({ phase, volts, kw, pf, eff = 1 }) => (kw * 1000) / (k(phase) * volts * pf * eff);

/** Line current for a kVA rating. */
export const kvaToAmps = ({ phase, volts, kva }) => (kva * 1000) / (k(phase) * volts);

/**
 * Power triangle: give any two of kw, kva, kvar, pf; get all four back.
 * kvar is a magnitude (lagging/leading isn't distinguished). Returns null when
 * fewer than two values are given or they can't coexist (kW above kVA, pf > 1).
 */
export function powerTriangle({ kw, kva, kvar, pf }) {
  const has = Number.isFinite;
  let P; let S; let Q;
  if (has(kw) && has(kva)) {
    if (kw > kva || kva <= 0) return null;
    P = kw; S = kva; Q = Math.sqrt(S * S - P * P);
  } else if (has(kw) && has(kvar)) {
    P = kw; Q = kvar; S = Math.hypot(P, Q);
  } else if (has(kva) && has(kvar)) {
    if (kvar > kva) return null;
    S = kva; Q = kvar; P = Math.sqrt(S * S - Q * Q);
  } else if (has(kw) && has(pf)) {
    if (pf <= 0 || pf > 1) return null;
    P = kw; S = P / pf; Q = Math.sqrt(Math.max(S * S - P * P, 0));
  } else if (has(kva) && has(pf)) {
    if (pf < 0 || pf > 1) return null;
    S = kva; P = S * pf; Q = Math.sqrt(Math.max(S * S - P * P, 0));
  } else if (has(kvar) && has(pf)) {
    if (pf <= 0 || pf >= 1) return null;
    Q = kvar; S = Q / Math.sqrt(1 - pf * pf); P = S * pf;
  } else return null;
  return { kw: P, kva: S, kvar: Q, pf: S === 0 ? 1 : P / S };
}

/** Conductor resistivity in ohm·mm²/m at ~70 °C operating temperature. */
export const RESISTIVITY = { copper: 0.0225, aluminium: 0.036 };

/**
 * Resistive voltage drop over a cable run (`length` is one-way, metres,
 * `area` is mm²). Single-phase counts the return conductor (x2); three-phase
 * uses root-3. Ignores reactance, so it understates drop on large conductors.
 */
export function voltageDrop({ phase, amps, length, area, material = 'copper', volts }) {
  const run = phase === 3 ? SQRT3 : 2;
  const drop = (run * RESISTIVITY[material] * length * amps) / area;
  return { volts: drop, percent: volts ? (drop / volts) * 100 : NaN };
}

/** Battery energy in Wh from amp-hours at a nominal voltage, and the reverse. */
export const ahToWh = (ah, volts) => ah * volts;
export const whToAh = (wh, volts) => wh / volts;
