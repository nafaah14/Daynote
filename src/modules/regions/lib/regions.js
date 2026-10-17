/**
 * Every lookup into the regions data happens here — the map renderer, the
 * side lists, global search and the module's public answer to "who covers
 * this island?" all come through these functions.
 *
 * The one rule worth remembering: an island's region is DERIVED from its
 * unit's `reg`, never stored on the island. Colours, counts, cards, lists,
 * ticks and labels all follow from that, so moving an atoll between regions
 * is a single edit in the data and nothing else needs touching.
 */
import { REGIONS, UNITS } from '../data/regionsData';

export { REGIONS, UNITS };

/** Outside the four regions: Malé, Hulhumalé, Hulhulé. */
export const GREY = '#8a94a3';

export const REGION_KEYS = Object.keys(REGIONS);

export const TYPES = { inh: 'Inhabited island', ind: 'Industrial / airport island' };

/** The unit that holds everything outside the regional departments. */
export const OUTSIDE_ID = 'MC';

export const colorOf = (reg) => (reg ? REGIONS[reg].color : GREY);

export const unitById = (id) => UNITS.find((u) => u.id === id) || null;

export const unitsOf = (reg) => UNITS.filter((u) => u.reg === reg);

export const inhabitedCount = (u) => u.isl.filter((i) => i.t === 'inh').length;

export const industrialCount = (u) => u.isl.filter((i) => i.t === 'ind').length;

export const regionInhabited = (reg) => unitsOf(reg).reduce((s, u) => s + inhabitedCount(u), 0);

/** Atolls proper — Kulhudhuffushi City and Vilimalé are units but not atolls. */
export const regionAtollCount = (reg) => unitsOf(reg).filter((u) => u.hull).length;

export const outsideUnit = () => unitById(OUTSIDE_ID);

export const islandIn = (u, name) => u.isl.find((i) => norm(i.n) === norm(name)) || null;

/** Accent- and apostrophe-insensitive, so `hulhule` finds Hulhulé. */
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ']/g, '').trim();

/**
 * The whole answer about one place, flat enough to render straight into a
 * detail card or hand to another module. For a place outside the regions
 * `region`/`gm`/`atoll` are null and `managedBy` carries who runs it.
 */
export function describe(u, i) {
  const r = u.reg ? REGIONS[u.reg] : null;
  return {
    kind: i ? 'island' : 'atoll',
    unitId: u.id,
    island: i ? i.n : null,
    islandDv: i ? i.dv || null : null,
    atoll: u.reg ? u.name : null,
    atollCode: u.reg ? u.code : null,
    geo: u.geo,
    isCapital: !!(i && i.n === u.cap),
    region: u.reg,
    regionName: r ? r.name : null,
    gm: r ? r.gm : null,
    managedBy: r ? null : (i && i.owner) || null,
    type: i ? TYPES[i.t] : null,
    color: colorOf(u.reg),
    lat: i ? i.lat : u.center[0],
    lon: i ? i.lon : u.center[1],
  };
}

/**
 * Every match for an island name, atoll name or atoll code.
 *
 * Returns an array, not a record: 15 island names repeat across atolls
 * (Maalhos is in both Baa and Alif Alif, under different GMs), so a
 * single-result API would quietly pick one and be wrong half the time.
 */
export function find(query) {
  const q = norm(query);
  if (!q) return [];
  const out = [];
  UNITS.forEach((u) => {
    if (u.reg && (norm(u.name) === q || norm(u.code) === q)) out.push(describe(u));
    u.isl.forEach((i) => { if (norm(i.n) === q) out.push(describe(u, i)); });
  });
  return out;
}

/** Exact lookup by atoll code + island name, e.g. ('Th', 'Veymandoo'). */
export function responsibleFor(atollCode, islandName) {
  const u = UNITS.find((x) => norm(x.code) === norm(atollCode));
  if (!u) return null;
  const i = islandIn(u, islandName);
  return i ? describe(u, i) : null;
}

/**
 * Prefix-first substring search over islands, atolls and codes, for the
 * module's own search box and for the shell's global search. Each hit knows
 * the unit it came from so the caller can focus the map without a re-lookup.
 */
export function searchPlaces(query, limit = 10) {
  const q = norm(query);
  if (!q) return [];
  const hits = [];
  UNITS.forEach((u) => {
    if (u.reg && norm(`${u.name} ${u.code} ${u.geo}`).includes(q)) {
      hits.push({
        key: `u:${u.id}`, unitId: u.id, island: null,
        label: `${u.name} (${u.code})`, sub: 'Atoll / city',
        detail: `Region ${u.reg} · GM ${REGIONS[u.reg].gm}`,
        color: colorOf(u.reg), sort: norm(u.name),
      });
    }
    u.isl.forEach((i) => {
      if (!norm(i.n).includes(q)) return;
      hits.push({
        key: `i:${u.id}:${i.n}`,
        unitId: u.id,
        island: i.n,
        label: i.n,
        sub: u.reg ? `${u.name} (${u.code})` : 'Outside the regional departments',
        detail: u.reg ? `Region ${u.reg} · GM ${REGIONS[u.reg].gm}` : i.owner || '',
        color: colorOf(u.reg),
        sort: norm(i.n),
      });
    });
  });
  return hits
    .sort((a, b) => (a.sort.startsWith(q) ? 0 : 1) - (b.sort.startsWith(q) ? 0 : 1)
      || a.sort.localeCompare(b.sort))
    .slice(0, limit);
}
