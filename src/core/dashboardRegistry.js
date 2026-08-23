/**
 * A small registry so the Dashboard module can pull items from every other
 * module without importing any of them — the same "core never imports
 * modules, modules self-register" shape as core/ui/editors.jsx's
 * EditorHost, just push-based at import time instead of mount time.
 *
 * Nothing calls registerProvider directly from here. Each module's own
 * entry file (already statically imported once by src/registry.js, to
 * build the main module list) calls it at load time as a side effect —
 * so importing registry.js is what triggers every provider to register,
 * without dashboardRegistry.js ever needing to know a single module name.
 *
 * Item shape: { id, title, type, dueDate, pinned, completed, completedAt, record, to? }
 *   `type` is the provider id ('reminders'|'lists'|'payments'|'notes'|'links'),
 *   used for sort order and for looking the provider back up. `record` is the
 *   raw repo record, carried along so the Dashboard can open it with the
 *   existing generic editor host (useEditors().openForRecord) rather than
 *   needing its own render/edit path per module. `to` is optional: when a
 *   module's own edit sheet isn't the useful thing to land on (a list's
 *   sheet is just name/mode/category, not its items), the provider can set
 *   a route instead and a tap navigates there rather than opening the editor.
 *
 * `toggleComplete` is optional — only Reminders has a real "done" concept
 * that a swipe gesture should drive (see the Dashboard build's per-module
 * scope decision: Payments' "paid" is a computed ledger balance, not a
 * flag, and Lists/Notes/Links have no due date or completion state at all).
 *
 * `renderPreview: (record, { onOpen, onClose }) => ReactNode` is also
 * optional — when a module's own edit sheet (or navigating straight to its
 * full screen) isn't the right thing for a quick tap, it can render a small
 * popup instead, with `onOpen` wired to whatever `to`/openForRecord would
 * otherwise have done. Lists uses this for its pinned items.
 */

import { startOfDay, endOfDay } from './dates';

const providers = [];

export const MODULE_ORDER = ['reminders', 'lists', 'payments', 'notes', 'links'];

/**
 * Whether a `dueAt` timestamp belongs on `date`'s agenda.
 *   - Falls exactly on that calendar day: always shown there.
 *   - Not completed, and `date` is today: also rolls forward onto today
 *     while overdue — mirrors Reminders' own existing today() rule
 *     (dueAt <= endOfToday()) so the primary "what needs me today" case
 *     doesn't regress.
 *   - Once completed, an item settles onto its real due day permanently —
 *     it does not keep rolling forward after being dealt with.
 *   - Any other browsed day (past or future) is a literal view: exact-day
 *     match only.
 */
export function isOnAgendaDay(dueAt, completed, date) {
  if (!dueAt) return false;
  const dayStartIso = startOfDay(date).toISOString();
  const dayEndIso = endOfDay(date).toISOString();
  if (dueAt >= dayStartIso && dueAt <= dayEndIso) return true;
  if (completed) return false;
  const isToday = startOfDay(date).getTime() === startOfDay(new Date()).getTime();
  return isToday && dueAt < dayStartIso;
}

/**
 * Idempotent by id, not a bare push — Vite's dev-time HMR re-executes a
 * module's top-level code (including this call) whenever that file is
 * hot-reloaded, but dashboardRegistry.js itself isn't reloaded alongside
 * it, so its `providers` array would otherwise accumulate a duplicate
 * entry per edit and every item would render once per stale copy.
 */
export function registerProvider(provider) {
  const i = providers.findIndex((p) => p.id === provider.id);
  if (i !== -1) providers[i] = provider;
  else providers.push(provider);
}

export function providerFor(type) {
  return providers.find((p) => p.id === type);
}

/** Items due on `date` (a Date), for the day agenda. */
export function getAllItemsForDate(date, repo) {
  const items = providers.flatMap((p) => p.getItemsForDate(date, repo));
  return items.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')
    || MODULE_ORDER.indexOf(a.type) - MODULE_ORDER.indexOf(b.type));
}

/** Everything pinned (home === 'pinned'), across every module, for the
 *  always-visible pinned board — independent of the selected day. */
export function getPinnedItems(repo) {
  return providers.flatMap((p) => p.getPinnedItems(repo));
}
