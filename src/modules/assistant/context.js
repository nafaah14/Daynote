import { TYPE as REMINDER_TYPE } from '../reminders';
import { TYPE as NOTE_TYPE } from '../notes/notes';
import { LIST_TYPE, ITEM_TYPE } from '../lists';
import { ITEM_TYPE as PAYMENT_ITEM_TYPE } from '../payments/payments';
import { TYPE as STOCK_TYPE, needsRestock } from '../stock/stock';
import { IDEA_TYPE, ACTION_TYPE, progressOf } from '../ideas';

const DUE_WINDOW_DAYS = 14;
const MAX_REMINDERS = 20;
const MAX_ITEMS_PER_LIST = 10;
const MAX_NOTES = 10;
const MAX_PAYMENTS = 20;
const MAX_STOCK = 20;
const MAX_IDEAS = 20;

/**
 * A compact, Today-shaped snapshot for the assistant to answer questions
 * against (its system prompt is told to use ONLY this data) — due-soon or
 * pinned reminders, lists with open items, pinned notes, due-soon or pinned
 * payments. Not a full dump of the repo: keeps the request small and keeps
 * note bodies (and the whole directory — see actions.js) out of the payload.
 */
export function buildContext(repo) {
  const windowEnd = new Date(Date.now() + DUE_WINDOW_DAYS * 864e5).toISOString();

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

  const payments = repo.query({ type: PAYMENT_ITEM_TYPE })
    .filter((i) => i.data?.active !== false)
    .filter((i) => (i.dueAt && i.dueAt <= windowEnd) || i.home === 'pinned')
    .slice(0, MAX_PAYMENTS)
    .map((i) => ({ title: i.title, direction: i.data.kind, amount: i.data.amount, dueAt: i.dueAt }));

  const stock = repo.query({ type: STOCK_TYPE })
    .filter(needsRestock)
    .slice(0, MAX_STOCK)
    .map((i) => ({
      title: i.title,
      qty: i.data.qty,
      category: i.data.category || null,
      shops: (i.data.shops || []).map((s) => s.shop).filter(Boolean),
    }));

  // Active + someday only — done/archived ideas are what listIdeas (a read
  // tool, see actions.js) exists for, same reasoning as keeping the full
  // directory and full note bodies out of this payload.
  const allIdeaActions = repo.query({ type: ACTION_TYPE });
  const ideas = repo.query({ type: IDEA_TYPE })
    .filter((i) => ['active', 'someday'].includes(i.data?.status || 'active'))
    .slice(0, MAX_IDEAS)
    .map((i) => {
      const progress = progressOf(allIdeaActions.filter((a) => a.data?.ideaId === i.id));
      return {
        title: i.title,
        status: i.data?.status || 'active',
        progress: progress ? `${progress.done}/${progress.total} (${progress.pct}%)` : 'no actions yet',
      };
    });

  const context = {};
  if (reminders.length) context.reminders = reminders;
  if (lists.length) context.lists = lists;
  if (notes.length) context.notes = notes;
  if (payments.length) context.payments = payments;
  if (stock.length) context.stock = stock;
  if (ideas.length) context.ideas = ideas;
  return context;
}
