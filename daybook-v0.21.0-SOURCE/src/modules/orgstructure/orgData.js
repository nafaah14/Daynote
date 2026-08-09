/**
 * ORG STRUCTURE data model.
 *
 * Two record types, both stored via the shared repo:
 *   org.unit   — one per unit (name, color, positions[], purpose, services)
 *   org.meta   — singleton holding department-wide metadata (HOD, dept name)
 *
 * Staff are NOT duplicated here. They live in Directory (PERSON_TYPE) and
 * are filtered by the department name stored in org.meta. Changing a
 * person's unit here updates the same record Directory reads — no sync.
 */

export const UNIT_TYPE = 'org.unit';
export const META_TYPE = 'org.meta';

export const DEPT_NAME = "Male' Power Generation Department";

export const UNIT_COLORS = {
  mech:   { bg: '#2e7d32', label: 'Green' },
  gm:     { bg: '#00838f', label: 'Teal' },
  elec:   { bg: '#1565c0', label: 'Blue' },
  ic:     { bg: '#6a1b9a', label: 'Purple' },
  amber:  { bg: '#b26a00', label: 'Amber' },
  navy:   { bg: '#0f2a4a', label: 'Navy' },
};
const COLOR_KEYS = Object.keys(UNIT_COLORS);

export const nextColor = (existingUnits) => {
  const used = new Set(existingUnits.map((u) => u.data.color));
  return COLOR_KEYS.find((c) => !used.has(c)) || COLOR_KEYS[existingUnits.length % COLOR_KEYS.length];
};

export const unitFields = (data = {}) => ({
  name: '', color: 'elec', head: '', sortOrder: 0,
  positions: [],   // [{ id, title, existing, vacant }]
  purpose: '',     // rich-ish text (HTML)
  services: '',    // rich-ish text (HTML)
  ...data,
});

export const metaFields = (data = {}) => ({
  department: DEPT_NAME,
  headOfDepartment: '',
  ...data,
});

/* ---- queries ---- */

export const allUnits = (repo) =>
  repo.query({ type: UNIT_TYPE })
    .sort((a, b) => (a.data.sortOrder || 0) - (b.data.sortOrder || 0)
      || a.createdAt.localeCompare(b.createdAt));

export const getMeta = (repo) => {
  const list = repo.query({ type: META_TYPE });
  return list.length ? list[0] : null;
};

export const getDeptName = (repo) => {
  const m = getMeta(repo);
  return m?.data?.department || DEPT_NAME;
};

/** All Directory people whose dept matches this org structure's department. */
export const deptStaff = (people, deptName) =>
  people.filter((p) => (p.data.dept || '').trim() === (deptName || '').trim());

/** Staff assigned to a specific unit within the department. */
export const unitStaff = (people, unitName) =>
  people.filter((p) => (p.data.unit || '').trim() === (unitName || '').trim());

/* ---- import from JSON ---- */

/**
 * Import org structure from a JSON file.
 *
 * Creates/replaces the unit records AND assigns each staff member to their
 * unit in the main Directory — the JSON's `staff` array carries a `unitId`
 * → unit-name mapping that gets written to the person's `unit` (and `dept`)
 * fields in the shared Directory record.
 *
 * For Directory people already in this department but absent from the JSON
 * (e.g. someone added after the JSON was last exported), their existing
 * unit assignment is left untouched.
 *
 * @param {object} repo   — the Daybook repo handle
 * @param {object} people — result of allPeople(repo), passed in to avoid
 *                          a redundant query
 * @param {string|object} json — the file contents (string or parsed object)
 * @returns {{ unitCount: number, staffAssigned: number }}
 */
export function importJson(repo, people, json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data.units || !Array.isArray(data.units)) {
    throw new Error('Invalid file — expected a "units" array.');
  }

  const dept = data.meta?.department || DEPT_NAME;

  // ---- 1. Meta record ----
  const existingMeta = getMeta(repo);
  const metaPayload = {
    title: 'Org Meta',
    data: metaFields({
      department: dept,
      headOfDepartment: data.meta?.headOfDepartment || '',
    }),
  };
  if (existingMeta) repo.update(existingMeta.id, metaPayload);
  else repo.create(META_TYPE, metaPayload);

  // ---- 2. Unit records ----
  const existingUnits = allUnits(repo);
  existingUnits.forEach((u) => repo.softDelete(u.id));

  // Build unitId → unit name lookup for staff assignment
  const unitIdToName = {};

  const toHtml = (txt) => {
    if (!txt) return '';
    if (txt.includes('<')) return txt; // already HTML
    return txt.split('\n').join('<br>');
  };

  data.units.forEach((u, i) => {
    unitIdToName[u.id] = u.name;

    repo.create(UNIT_TYPE, {
      title: u.name,
      data: unitFields({
        name: u.name,
        color: u.color || COLOR_KEYS[i % COLOR_KEYS.length],
        head: u.head || '',
        sortOrder: i,
        positions: (u.positions || []).map((p) => ({
          id: p.id || `pos_${Math.random().toString(36).slice(2, 8)}`,
          title: p.title || '',
          existing: Number(p.existing) || 0,
          vacant: Number(p.vacant) || 0,
        })),
        purpose: toHtml(u.purpose || ''),
        services: toHtml(u.services || ''),
      }),
    });
  });

  // ---- 3. Assign staff to units in the Directory ----
  // Build a staffId → unitName map from the JSON's staff array
  const staffToUnit = new Map();
  (data.staff || []).forEach((s) => {
    const sid = String(s.staffId || '').trim();
    const unitName = unitIdToName[s.unitId] || '';
    if (sid && unitName) staffToUnit.set(sid, unitName);
  });

  // Build a quick staffId → Directory person index
  const bySid = new Map();
  people.forEach((p) => {
    const sid = String(p.data.sid || '').trim();
    if (sid) bySid.set(sid, p);
  });

  let staffAssigned = 0;

  // For every staff member the JSON knows about: set dept + unit on the
  // matching Directory person.
  staffToUnit.forEach((unitName, sid) => {
    const person = bySid.get(sid);
    if (!person) return; // not in Directory (yet) — nothing to assign
    const needsDept = (person.data.dept || '').trim() !== dept;
    const needsUnit = (person.data.unit || '').trim() !== unitName;
    if (needsDept || needsUnit) {
      repo.update(person.id, {
        data: { ...person.data, dept, unit: unitName },
      });
      staffAssigned++;
    }
  });

  return { unitCount: data.units.length, staffAssigned };
}

/* ---- position helpers ---- */

export function uid() {
  return 'pos_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function unitTotals(unit) {
  let existing = 0, vacant = 0;
  (unit.data.positions || []).forEach((p) => {
    existing += Number(p.existing) || 0;
    vacant += Number(p.vacant) || 0;
  });
  return { existing, vacant, total: existing + vacant };
}

export function deptTotals(units) {
  let existing = 0, vacant = 0;
  units.forEach((u) => {
    const t = unitTotals(u);
    existing += t.existing;
    vacant += t.vacant;
  });
  return { existing, vacant, total: existing + vacant };
}

/* ---- audit: compare structure vs actual staff ---- */

/**
 * Compare the org structure's declared headcount against the actual staff
 * in the Directory. Returns a list of human-readable issues and per-unit /
 * per-position mismatch flags the UI can highlight.
 */
export function auditStructure(units, deptPeople) {
  const issues = [];
  const unitMismatch = new Set();   // unit ids with any discrepancy
  const posMismatch = new Map();    // posId → { declared, actual }

  const unitNames = new Set(units.map((u) => u.data.name));

  units.forEach((u) => {
    const staff = unitStaff(deptPeople, u.data.name);

    if (staff.length === 0 && (u.data.positions || []).some((p) => p.existing > 0)) {
      issues.push(`${u.data.name}: structure shows existing staff, but no one in the directory is assigned to this unit.`);
      unitMismatch.add(u.id);
      return;
    }

    // Count actual staff by designation (job title)
    const jobCounts = {};
    staff.forEach((p) => {
      const job = p.data.designation || 'Unspecified';
      jobCounts[job] = (jobCounts[job] || 0) + 1;
    });

    const matchedJobs = new Set();

    (u.data.positions || []).forEach((pos) => {
      const declared = Number(pos.existing) || 0;
      const title = pos.title || '';
      // Skip vacant-only rows
      if (/vacant/i.test(title) || /pre-breakdown/i.test(title)) return;

      if (jobCounts[title] != null) {
        matchedJobs.add(title);
        const actual = jobCounts[title];
        if (declared !== actual) {
          posMismatch.set(pos.id, { declared, actual });
          unitMismatch.add(u.id);
          issues.push(`${u.data.name} — "${title}": structure shows ${declared} existing, but the directory has ${actual}.`);
        }
      } else if (declared > 0) {
        posMismatch.set(pos.id, { declared, actual: 0 });
        unitMismatch.add(u.id);
        issues.push(`${u.data.name} — "${title}": structure shows ${declared} existing, but no one in the directory has this job title.`);
      }
    });

    // Staff with jobs that have no matching position row
    Object.keys(jobCounts).forEach((job) => {
      if (!matchedJobs.has(job)) {
        unitMismatch.add(u.id);
        issues.push(`${u.data.name}: ${jobCounts[job]} staff with job "${job}" have no matching position row — sync to add it.`);
      }
    });

    // Unit-level total check
    const totalExisting = (u.data.positions || []).reduce((a, p) => a + (Number(p.existing) || 0), 0);
    if (totalExisting !== staff.length) {
      unitMismatch.add(u.id);
      issues.push(`${u.data.name}: total existing (${totalExisting}) ≠ actual staff in directory (${staff.length}).`);
    }
  });

  // Department-level total
  const structTotal = units.reduce((a, u) => a + (u.data.positions || []).reduce((s, p) => s + (Number(p.existing) || 0), 0), 0);
  if (structTotal !== deptPeople.length) {
    issues.push(`Department total: structure shows ${structTotal} existing, but directory has ${deptPeople.length} staff.`);
  }

  // Staff assigned to this dept but to a unit that doesn't exist in structure
  const unassigned = deptPeople.filter((p) => {
    const u = (p.data.unit || '').trim();
    return !u || !unitNames.has(u);
  });
  if (unassigned.length > 0) {
    issues.push(`${unassigned.length} staff in this department are unassigned or assigned to a unit not in the structure.`);
  }

  return { issues, unitMismatch, posMismatch };
}

/* ---- sync: update position counts from actual staff ---- */

/**
 * For a single unit, set each position's "existing" count to match the
 * actual number of staff with that designation in the directory. Positions
 * whose title doesn't match anyone get zeroed. Job titles found in the
 * directory but missing from the position table are added as new rows.
 * Vacant counts are left untouched.
 *
 * Returns the updated positions array (caller is responsible for writing
 * it back via repo.update).
 */
export function syncUnitPositions(unit, deptPeople) {
  const staff = unitStaff(deptPeople, unit.data.name);
  const jobCounts = {};
  staff.forEach((p) => {
    const job = p.data.designation || 'Unspecified';
    jobCounts[job] = (jobCounts[job] || 0) + 1;
  });

  const matchedTitles = new Set();
  const positions = (unit.data.positions || []).map((pos) => {
    const title = pos.title || '';
    if (jobCounts[title] != null) {
      matchedTitles.add(title);
      return { ...pos, existing: jobCounts[title] };
    }
    // Skip clearing special rows
    if (/vacant/i.test(title) || /pre-breakdown/i.test(title)) return pos;
    return { ...pos, existing: 0 };
  });

  // Add new rows for unmatched job titles
  Object.keys(jobCounts).forEach((job) => {
    if (!matchedTitles.has(job)) {
      positions.push({ id: uid(), title: job, existing: jobCounts[job], vacant: 0 });
    }
  });

  return positions;
}

/* ---- export to JSON ---- */

/**
 * Build a JSON object mirroring the import format so the file can be
 * round-tripped: import → edit → export → import again elsewhere.
 *
 * Staff are included with their current unit assignment derived from their
 * Directory record — not from any stored mapping — so the export always
 * reflects reality.
 */
export function exportJson(units, meta, deptPeople) {
  const dept = meta?.data?.department || DEPT_NAME;

  // Build a unit-name → short id map (use the color key or a slug)
  const nameToId = {};
  units.forEach((u) => {
    nameToId[u.data.name] = u.data.color || u.data.name.toLowerCase().replace(/\s+/g, '_').slice(0, 12);
  });

  return {
    meta: {
      department: dept,
      headOfDepartment: meta?.data?.headOfDepartment || '',
      exportedAt: new Date().toISOString(),
    },
    units: units.map((u) => ({
      id: nameToId[u.data.name],
      name: u.data.name,
      color: u.data.color,
      head: u.data.head || '',
      positions: (u.data.positions || []).map((p) => ({
        id: p.id,
        title: p.title,
        existing: p.existing,
        vacant: p.vacant,
      })),
      purpose: u.data.purpose || '',
      services: u.data.services || '',
    })),
    staff: deptPeople.map((p) => ({
      staffId: p.data.sid,
      name: p.title,
      designation: p.data.designation,
      unitId: nameToId[p.data.unit] || '',
      unit: p.data.unit || '',
    })),
  };
}
