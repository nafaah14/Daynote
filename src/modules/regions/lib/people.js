/**
 * Resolving a name printed on the map to a real person in the Directory.
 *
 * Regions stores NAMES, not person ids — the circular names four GMs, and the
 * directory that will hold them is still being rebuilt. So this matches by
 * name at render time: the moment a GM (or later an HOD or a unit head) is
 * entered in Directory, their card here grows a working link and a phone
 * number, with no edit to the regions data. Until then the card simply says
 * so. Nothing here writes; Directory stays the only editor of people.
 *
 * Matching is deliberately cautious. A wrong person on a "who do I call"
 * screen is worse than no person, so an ambiguous name resolves to nothing.
 */
import { allPeople } from '../../../core/people';
import { norm } from './regions';

/** Dhivehi names romanise inconsistently; treat these as the same letter. */
const squash = (s) => norm(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The one person whose name is `name`, or null.
 *
 * Exact (normalised) full-name match wins outright. Failing that, a person
 * whose name contains every word of the searched name counts — "Ahmed
 * Shafeeu" finds "Ahmed Shafeeu Mohamed" — but only on two or more words,
 * and only if exactly one person qualifies.
 */
export function personByName(people, name) {
  const want = squash(name);
  if (!want) return null;

  const exact = people.filter((p) => squash(p.title) === want);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const words = want.split(' ');
  if (words.length < 2) return null;
  const partial = people.filter((p) => {
    const have = squash(p.title).split(' ');
    return words.every((w) => have.includes(w));
  });
  return partial.length === 1 ? partial[0] : null;
}

/**
 * Everyone the Directory places in `dept`. Accent- and apostrophe-blind, so
 * "Malé Power Generation Department" here matches the directory's
 * "Male' Power Generation Department".
 */
export function deptMembers(people, dept) {
  const want = squash(dept);
  if (!want) return [];
  return people.filter((p) => squash(p.data.dept) === want);
}

/**
 * An owner string that names a STELCO department, or null. Malé's and
 * Hulhumalé's power generation departments are real departments with staff
 * in the Directory; MACL is another company and never will be.
 */
export const deptFromOwner = (owner) => (/\bDepartment$/.test(String(owner || '').trim()) ? owner : null);

/** What the UI needs to show a resolved (or unresolved) contact in one row. */
export function contactFor(repo, { name, dept }) {
  const people = allPeople(repo);
  const person = name ? personByName(people, name) : null;
  return {
    name: name || null,
    person,
    to: person ? `/directory?view=${person.id}` : null,
    designation: person ? person.data.designation || '' : '',
    ext: person ? person.data.ext || '' : '',
    mobile: person ? person.data.mobile || '' : '',
    staffCount: dept ? deptMembers(people, dept).length : 0,
  };
}
