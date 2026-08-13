import { TYPE as REMINDER_TYPE } from '../reminders';
import { TYPE as NOTE_TYPE } from '../notes/notes';
import { LIST_TYPE, ITEM_TYPE } from '../lists';

const REMINDER_WINDOW_DAYS = 14;
const MAX_REMINDERS = 20;
const MAX_ITEMS_PER_LIST = 10;
const MAX_NOTES = 10;

/**
 * A compact, Today-shaped snapshot for the assistant to answer questions
 * against (its system prompt is told to use ONLY this data) — due-soon or
 * pinned reminders, lists with open items, pinned notes. Not a full dump of
 * the repo: keeps the request small and keeps note bodies out of the payload.
 */
export function buildContext(repo) {
  const windowEnd = new Date(Date.now() + REMINDER_WINDOW_DAYS * 864e5).toISOString();

  const reminders = repo.query({ type: REMINDER_TYPE, done: false })
    .filter((r) => (r.dueAt && r.dueAt <= windowEnd) || r.home === 'pinned')
    .slice(0, MAX_REMINDERS)
    .map((r) => ({ title: r.title, dueAt: r.dueAt }));

  const lists = repo.query({ type: LIST_TYPE })
    .map((list) => {
      const openItems = repo.query({ type: ITEM_TYPE, done: false })
        .filter((i) => i.data?.listId === list.id)
        .slice(0, MAX_ITEMS_PER_LIST)
        .map((i) => i.title);
      return openItems.length ? { name: list.title, openItems } : null;
    })
    .filter(Boolean);

  const notes = repo.query({ type: NOTE_TYPE })
    .filter((n) => n.home === 'pinned')
    .slice(0, MAX_NOTES)
    .map((n) => ({ title: n.title }));

  const context = {};
  if (reminders.length) context.reminders = reminders;
  if (lists.length) context.lists = lists;
  if (notes.length) context.notes = notes;
  return context;
}
