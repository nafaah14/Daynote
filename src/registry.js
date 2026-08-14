import inbox from './modules/inbox';
import reminders from './modules/reminders';
import lists from './modules/lists';
import directory from './modules/directory/directory';
import roster from './modules/roster/roster';
import notes from './modules/notes/notes';
import payments from './modules/payments/payments';
import mandarin from './modules/mandarin/mandarin';
import links from './modules/links/links';
import orgstructure from './modules/orgstructure/orgstructure';
import sizes from './modules/sizes/sizes';
import personalInfo from './modules/personalInfo';
import trash from './modules/trash';
import hosted from './hosted';

/**
 * The only file you edit to add a capability.
 *
 * THE RULE THAT MAKES THIS LAST:
 *   modules import from core; core never imports from modules;
 *   modules never import each other.
 *
 * Directory looks like an exception — Roster shows directory people — but it
 * isn't. Person identity lives in core/people.js, and both modules talk to
 * that. Neither imports the other, so either could be deleted tomorrow.
 */
export const modules = [inbox, reminders, lists, notes, links, payments, directory, roster, orgstructure, sizes, mandarin, personalInfo, trash, ...hosted];

export const integrated = modules.filter((m) => m.tier === 'integrated');
export const hostedApps = modules.filter((m) => m.tier === 'hosted');

export const allRoutes = modules.flatMap((m) => m.routes || []);

/**
 * The bottom bar's default before you've customised it. Capped, and defined
 * in exactly one place, because Layout (Settings) and AppShell each need this
 * same fallback and it drifting out of sync between them is exactly how the
 * bar quietly started defaulting to all 7 modules instead of 4 once Notes,
 * Roster and Mandarin joined — nothing enforced the cap on the DEFAULT itself,
 * only on manually adding beyond it.
 */
export const NAV_CAP = 5;
export const defaultNav = integrated.slice(0, NAV_CAP).map((m) => m.id);
