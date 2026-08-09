/**
 * PERSON IDENTITY — a core concept, not a module's private business.
 *
 * Directory is the *editor* for people; it is not the owner. Identity lives
 * here in core so that Roster, Meetings, Work Distribution or anything else
 * can resolve a person without importing Directory — which would break the
 * rule that modules never import each other.
 *
 * A module that needs people stores a link, never a copy:
 *     links: [{ rel: 'person', id: personId }]
 * and reads the name through personOf(). That is why editing someone in
 * Directory instantly corrects them everywhere.
 */

export const PERSON_TYPE = 'directory.person';

/**
 * person record shape
 *   title: full name
 *   data: { sid, designation, dept, unit, ext, mobile, email, note }
 */

export const personFields = (data = {}) => ({
  sid: '', designation: '', dept: '', unit: '',
  ext: '', mobile: '', email: '', note: '', isUnitHead: false,
  ...data,
});

export const allPeople = (repo) => repo.query({ type: PERSON_TYPE });

export const personById = (repo, id) => {
  const r = repo.get(id);
  return r && r.type === PERSON_TYPE && !r.deletedAt ? r : null;
};

export const personBySid = (repo, sid) =>
  allPeople(repo).find((p) => String(p.data.sid) === String(sid)) || null;

/** Resolve the person a record points at, via its 'person' link. */
export const personOf = (repo, record) => {
  const link = record?.links?.find((l) => l.rel === 'person');
  return link ? personById(repo, link.id) : null;
};

export const linkToPerson = (personId) => ({ rel: 'person', id: personId });

/** Find by staff ID or create. Used by importers and by module migrations. */
export function findOrCreatePerson(repo, { sid, name, ...rest }) {
  const existing = sid ? personBySid(repo, sid) : null;
  if (existing) return existing;
  return repo.create(PERSON_TYPE, {
    title: (name || '').trim() || 'Unnamed',
    data: personFields({ sid: String(sid || '').trim(), ...rest }),
  });
}

/* ---- shared vocabulary for filters, derived from the data itself ---- */

export function facetsOf(people) {
  const uniq = (key) => [...new Set(
    people.map((p) => (p.data[key] || '').trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
  return {
    depts: uniq('dept'),
    units: uniq('unit'),
    designations: uniq('designation'),
  };
}

export const matchesPerson = (p, term) => {
  const t = term.toLowerCase();
  const d = p.data;
  return p.title.toLowerCase().includes(t)
    || String(d.sid || '').includes(t)
    || (d.designation || '').toLowerCase().includes(t)
    || (d.dept || '').toLowerCase().includes(t)
    || (d.unit || '').toLowerCase().includes(t)
    || String(d.ext || '').includes(t)
    || String(d.mobile || '').includes(t);
};

/**
 * The current unit head for a (dept, unit) pair, if any.
 *
 * Scoped by dept+unit together, not unit alone — several departments reuse
 * the same unit name (e.g. "Electrical Services Unit" exists under both
 * Hulhumale' and Male' power generation), so unit name by itself isn't a
 * safe key.
 */
export const unitHeadOf = (people, dept, unit, excludeId) =>
  people.find((p) => p.id !== excludeId && p.data.isUnitHead
    && (p.data.dept || '').trim() === (dept || '').trim()
    && (p.data.unit || '').trim() === (unit || '').trim()) || null;
