import { PERSON_TYPE, personFields, personBySid } from '../../core/people';

/**
 * Fields compared between the PDF and an existing record. `name` is
 * included because a staff ID match already proves identity, so a name
 * difference here is a real spelling correction, not a mismatch.
 *
 * Mobile is never in this list — the PDF export doesn't carry it, and it's
 * the one field hand-collected data must never lose.
 */
export const DIFF_FIELDS = [
  ['name', 'Name'],
  ['designation', 'Designation'],
  ['dept', 'Department'],
  ['unit', 'Unit'],
  ['ext', 'Extension'],
];

/**
 * Build the import plan: brand-new staff (added without asking, per how
 * this was scoped) and existing staff with at least one changed field
 * (queued for one-by-one review). A field only counts as "changed" when the
 * PDF actually supplies a non-empty value that differs — a blank Extension
 * cell in the PDF must never look like an instruction to erase one.
 */
export function buildPlan(rows, repo) {
  const newRecords = [];
  const changedRecords = [];
  let unchangedCount = 0;

  rows.forEach((row) => {
    const sid = (row.sid || '').trim();
    const existing = sid ? personBySid(repo, sid) : null;

    if (!existing) {
      newRecords.push(repo.draft(PERSON_TYPE, {
        title: row.name || 'Unnamed',
        data: personFields({
          sid, designation: row.designation, dept: row.dept, unit: row.unit, ext: row.ext,
        }),
      }));
      return;
    }

    const changes = [];
    DIFF_FIELDS.forEach(([key, label]) => {
      const after = (key === 'name' ? row.name : row[key] || '').trim();
      const before = (key === 'name' ? existing.title : existing.data[key] || '').trim();
      if (after && after !== before) changes.push({ key, label, before, after });
    });

    if (changes.length === 0) unchangedCount++;
    else changedRecords.push({ existing, sid, name: row.name || existing.title, changes, decision: null });
  });

  return { newRecords, changedRecords, unchangedCount };
}
