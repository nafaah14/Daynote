/**
 * Turns a tool_use block from the assistant (netlify/functions/assistant.js)
 * into a repo.create() call. Each handler matches the target module's actual
 * record shape — see reminders/index.jsx, notes/notes.jsx, lists/index.jsx,
 * payments/payments.jsx + payments/ledger.js, and core/people.js (directory
 * identity lives in core, not in modules/directory — see that file).
 *
 * Callers pass the repo returned by useRepo(); this file never calls the hook
 * itself so it works the same inside a component or a plain event handler.
 */
import { TYPE as REMINDER_TYPE } from '../reminders';
import { TYPE as NOTE_TYPE, sanitize, plainText } from '../notes/notes';
import { LIST_TYPE, ITEM_TYPE } from '../lists';
import {
  ITEM_TYPE as PAYMENT_ITEM_TYPE, TX_TYPE as PAYMENT_TX_TYPE, fmt as fmtPayment, allocSummary,
} from '../payments/payments';
import { currentMonthKey, nextDueDate, monthLabel } from '../payments/ledger';
import { TYPE as STOCK_TYPE } from '../stock/stock';
import {
  IDEA_TYPE, ACTION_TYPE, STATUSES, progressOf, lastTouched,
} from '../ideas';
import { dueLabel } from '../../core/dates';
// Directory has no module of its own to import from — identity lives in
// core/people.js precisely so things like this don't have to reach into
// modules/directory (see the comment at the top of that file).
import { PERSON_TYPE, personFields, personBySid, allPeople } from '../../core/people';

/** Plain text (as the model sends it) -> the sanitized HTML notes store. */
function textToHtml(text) {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return sanitize(escaped.split('\n').map((line) => `<div>${line || '<br>'}</div>`).join(''));
}

function createReminder(repo, input) {
  const title = (input.title || '').trim();
  if (!title) throw new Error('create_reminder requires a title.');

  let dueAt = null;
  if (input.due_date) {
    const dt = input.due_time
      ? new Date(`${input.due_date}T${input.due_time}`)
      : new Date(`${input.due_date}T00:00`);
    if (!isNaN(dt)) dueAt = dt.toISOString();
  }

  return repo.create(REMINDER_TYPE, { title, dueAt });
}

function addNote(repo, input) {
  const content = (input.content || '').trim();
  if (!content) throw new Error('add_note requires content.');

  const html = textToHtml(content);
  const title = (input.title || '').trim() || content.split('\n')[0].slice(0, 60) || 'Untitled note';

  return repo.create(NOTE_TYPE, {
    title,
    data: { html, color: 'plain', preview: plainText(html).slice(0, 200) },
  });
}

/** Case-insensitive match against a list's title — assistant input is spoken/typed, not picked from a UI. */
function findListByName(repo, name) {
  const needle = name.trim().toLowerCase();
  return repo.query({ type: LIST_TYPE }).find((l) => l.title.trim().toLowerCase() === needle) || null;
}

function addListItem(repo, input) {
  const listName = (input.list_name || '').trim();
  const itemText = (input.item_text || '').trim();
  if (!listName) throw new Error('add_list_item requires a list_name.');
  if (!itemText) throw new Error('add_list_item requires item_text.');

  // The tool is documented as adding to an "existing" list, but the assistant
  // has no way to browse lists before calling it — create one on the fly
  // rather than fail on a name that's merely unseen.
  let list = findListByName(repo, listName);
  if (!list) list = repo.create(LIST_TYPE, { title: listName, data: { mode: 'clearable', category: '' } });

  const category = (input.category || '').trim();
  return repo.create(ITEM_TYPE, {
    title: itemText,
    data: { listId: list.id, ...(category ? { category } : {}) },
  });
}

const MAX_DIRECTORY_RESULTS = 15;

/**
 * Read-only directory lookup — the assistant's only way to see directory
 * data, since it's deliberately kept out of buildContext (see context.js).
 * Runs entirely against what's already loaded on this device/account; never
 * a call anywhere else. name/dept/unit are substring-matched, case-
 * insensitive, and ANDed together when more than one is given.
 */
export function searchDirectory(repo, input) {
  const name = (input.name || '').trim().toLowerCase();
  const dept = (input.dept || '').trim().toLowerCase();
  const unit = (input.unit || '').trim().toLowerCase();
  const company = (input.company || '').trim().toLowerCase();
  const kind = input.kind === 'personal' || input.kind === 'staff' ? input.kind : null;
  if (!name && !dept && !unit && !company && !kind) {
    throw new Error('search_directory requires at least one of name, dept, unit, company, or kind.');
  }

  const matches = allPeople(repo).filter((p) => {
    if (name && !p.title.toLowerCase().includes(name)) return false;
    if (dept && !(p.data.dept || '').toLowerCase().includes(dept)) return false;
    if (unit && !(p.data.unit || '').toLowerCase().includes(unit)) return false;
    if (company && !(p.data.company || '').toLowerCase().includes(company)) return false;
    if (kind === 'personal' && !p.data.personal) return false;
    if (kind === 'staff' && p.data.personal) return false;
    return true;
  });

  const results = matches.slice(0, MAX_DIRECTORY_RESULTS).map((p) => ({
    sid: p.data.sid || null,
    name: p.title,
    personal: !!p.data.personal,
    company: p.data.company || null,
    designation: p.data.designation || null,
    dept: p.data.dept || null,
    unit: p.data.unit || null,
    ext: p.data.ext || null,
    mobile: p.data.mobile || null,
    email: p.data.email || null,
  }));

  return { count: matches.length, truncated: matches.length > results.length, results };
}

function addContact(repo, input) {
  const name = (input.name || '').trim();
  if (!name) throw new Error('add_contact requires a name.');

  const personal = input.personal === true;
  const sid = personal ? '' : (input.sid || '').trim();
  const fields = {};
  ['designation', 'dept', 'unit', 'ext', 'mobile', 'note', 'company'].forEach((k) => {
    const v = (input[k] || '').trim();
    if (v) fields[k] = v;
  });
  if (input.personal !== undefined) fields.personal = personal;
  // Personal contacts never carry dept/unit — those are read by Org
  // Structure (see core/people.js) and a stray match against a real
  // department name would skew its staff counts.
  if (personal) { delete fields.dept; delete fields.unit; }

  // sid is the only reliable dedupe key (per core/people.js) — without one,
  // always create rather than guess a name match and silently overwrite
  // someone else's record.
  const existing = sid ? personBySid(repo, sid) : null;
  if (existing) {
    repo.update(existing.id, { title: name, data: { ...existing.data, ...fields } });
    return repo.get(existing.id);
  }
  return repo.create(PERSON_TYPE, { title: name, data: personFields({ sid, ...fields }) });
}

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function addPayment(repo, input) {
  const name = (input.name || '').trim();
  if (!name) throw new Error('add_payment requires a name.');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('add_payment requires a positive amount.');

  // Both optional — a payment defaults to starting this month with no end,
  // but startMonth in particular is routinely backdated (a loan or rent that
  // actually began earlier), which is exactly what lets pendingAmount/
  // monthlyAging in ledger.js correctly show what's accrued since then.
  const startMonth = (input.start_month || '').trim();
  if (startMonth && !MONTH_KEY_RE.test(startMonth)) {
    throw new Error('add_payment: start_month must be in YYYY-MM form.');
  }
  const endMonth = (input.end_month || '').trim();
  if (endMonth && !MONTH_KEY_RE.test(endMonth)) {
    throw new Error('add_payment: end_month must be in YYYY-MM form.');
  }
  if (startMonth && endMonth && endMonth < startMonth) {
    throw new Error("add_payment: end_month can't be before start_month.");
  }

  const data = {
    kind: input.direction === 'receive' ? 'receive' : 'pay',
    category: (input.who || '').trim(),
    amount,
    startMonth: startMonth || currentMonthKey(),
    endMonth: endMonth || null,
    dueDay: Math.min(31, Math.max(1, Number(input.due_day) || 1)),
    active: true,
    remind: true,
    notes: '',
  };
  const dueAt = nextDueDate(data, new Date());
  return repo.create(PAYMENT_ITEM_TYPE, { title: name, dueAt, data });
}

// Punctuation/spacing-insensitive, so "Udhares 11 cleaning" still lines up
// with a title actually stored as "Udhares-11 Cleaning" — people don't
// remember a payment's exact hyphenation any better than the assistant does.
const stripPunct = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function bigrams(s) {
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

/** Dice coefficient over character bigrams — tolerant of typos, word order, and missing/extra words without needing a real fuzzy-match library. */
function titleSimilarity(a, b) {
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (ba.size === 0 || bb.size === 0) return a === b ? 1 : 0;
  let overlap = 0;
  for (const g of ba) if (bb.has(g)) overlap++;
  return (2 * overlap) / (ba.size + bb.size);
}

/**
 * Case-insensitive match against a payment item's title: exact, then
 * substring, then the same two ignoring punctuation/spacing, then a fuzzy
 * nearest-title fallback. The fuzzy pass auto-picks only when one candidate
 * is clearly the best match; otherwise it throws with named suggestions
 * instead of a flat "not found" — the user rarely remembers a payment's
 * exact stored name, so a close guess should still resolve or at least
 * hand back something to pick from.
 */
function findPaymentItem(repo, name) {
  const needle = name.trim().toLowerCase();
  const items = repo.query({ type: PAYMENT_ITEM_TYPE });

  const exact = items.filter((i) => i.title.trim().toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new Error(`More than one payment is named "${name}" — be more specific.`);

  const partial = items.filter((i) => i.title.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(`More than one payment matches "${name}" — be more specific: ${partial.map((i) => `"${i.title}"`).join(', ')}.`);
  }

  const normNeedle = stripPunct(needle);
  if (normNeedle) {
    const normMatches = items.filter((i) => stripPunct(i.title).includes(normNeedle));
    if (normMatches.length === 1) return normMatches[0];
    if (normMatches.length > 1) {
      throw new Error(`More than one payment matches "${name}" — be more specific: ${normMatches.map((i) => `"${i.title}"`).join(', ')}.`);
    }
  }

  if (items.length > 0 && normNeedle) {
    const scored = items
      .map((i) => ({ item: i, score: titleSimilarity(normNeedle, stripPunct(i.title)) }))
      .sort((a, b) => b.score - a.score);
    const [best, second] = scored;
    if (best.score >= 0.5 && (!second || best.score - second.score >= 0.15)) return best.item;
    const suggestions = scored.filter((s) => s.score >= 0.25).slice(0, 4);
    if (suggestions.length > 0) {
      throw new Error(`No payment named "${name}" — did you mean ${suggestions.map((s) => `"${s.item.title}"`).join(' or ')}?`);
    }
  }

  return null;
}

function logPayment(repo, input) {
  const name = (input.name || '').trim();
  if (!name) throw new Error('log_payment requires a name.');

  // Unlike add_list_item, this never auto-creates — logging a payment against
  // a recurring item that doesn't exist yet would silently invent one instead
  // of surfacing the real problem (nothing has been set up to log against).
  const item = findPaymentItem(repo, name);
  if (!item) throw new Error(`No payment named "${name}" — set one up first with add_payment or in the app.`);

  const date = input.date && !isNaN(new Date(input.date)) ? input.date : new Date().toISOString().slice(0, 10);
  const note = (input.note || '').trim();

  // Named month(s) — apply exactly where the user said, same as the manual
  // "allocate by month" entry in the app. The stored amount is the sum of
  // the allocations, not a separately-typed total, so the two can never
  // disagree.
  const rawAllocations = Array.isArray(input.allocations) ? input.allocations : null;
  if (rawAllocations && rawAllocations.length > 0) {
    const allocations = rawAllocations.map((a) => {
      const month = String(a.month || '').trim();
      const amt = Number(a.amount);
      if (!MONTH_KEY_RE.test(month)) throw new Error(`log_payment: allocation month "${a.month}" must be in YYYY-MM form.`);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('log_payment: each allocation needs a positive amount.');
      return { month, amount: amt, note: '' };
    });
    const total = allocations.reduce((s, a) => s + a.amount, 0);
    return repo.create(PAYMENT_TX_TYPE, {
      title: item.title,
      data: { itemId: item.id, amount: total, date, note, allocations },
    });
  }

  // No month named — settles oldest-due-first, exactly as it always has.
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('log_payment requires a positive amount.');
  return repo.create(PAYMENT_TX_TYPE, { title: item.title, data: { itemId: item.id, amount, date, note } });
}

/** Case-insensitive match against a stock item's title, exact first then substring. */
function findStockItem(repo, name) {
  const needle = name.trim().toLowerCase();
  const items = repo.query({ type: STOCK_TYPE });

  const exact = items.filter((i) => i.title.trim().toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new Error(`More than one stock item is named "${name}" — be more specific.`);

  const partial = items.filter((i) => i.title.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new Error(`More than one stock item matches "${name}" — be more specific.`);

  return null;
}

function addStockItem(repo, input) {
  const name = (input.name || '').trim();
  if (!name) throw new Error('add_stock_item requires a name.');

  const fields = {};
  if (input.category !== undefined) fields.category = (input.category || '').trim();
  if (input.qty !== undefined) {
    const qty = Number(input.qty);
    if (!Number.isFinite(qty) || qty < 0) throw new Error('add_stock_item: qty must be a non-negative number.');
    fields.qty = qty;
  }
  if (input.low_stock_at !== undefined) {
    const low = Number(input.low_stock_at);
    if (!Number.isFinite(low) || low < 0) throw new Error('add_stock_item: low_stock_at must be a non-negative number.');
    fields.lowStockAt = low;
  }

  // Same name already tracked — update it rather than create a duplicate,
  // same reasoning as add_contact's upsert-by-match.
  const existing = findStockItem(repo, name);

  // shop/price add or update ONE entry in the item's shops list (upsert by
  // shop name, case-insensitive) — an item can be bought at several shops,
  // so this never replaces the whole list.
  if (input.shop !== undefined && (input.shop || '').trim()) {
    const shopName = input.shop.trim();
    let price = null;
    if (input.price !== undefined) {
      price = Number(input.price);
      if (!Number.isFinite(price) || price < 0) throw new Error('add_stock_item: price must be a non-negative number.');
    }
    const baseShops = existing ? (existing.data.shops || []) : [];
    const idx = baseShops.findIndex((s) => s.shop.toLowerCase() === shopName.toLowerCase());
    fields.shops = idx >= 0
      ? baseShops.map((s, i) => (i === idx ? { shop: shopName, price: input.price !== undefined ? price : s.price } : s))
      : [...baseShops, { shop: shopName, price }];
  }

  if (existing) {
    repo.update(existing.id, { data: { ...existing.data, ...fields } });
    return repo.get(existing.id);
  }
  return repo.create(STOCK_TYPE, {
    title: name,
    data: { category: '', shops: [], qty: 0, lowStockAt: 1, barcodes: [], ...fields },
  });
}

function updateStockQty(repo, input) {
  const name = (input.name || '').trim();
  if (!name) throw new Error('update_stock_qty requires a name.');

  const item = findStockItem(repo, name);
  if (!item) throw new Error(`No stock item named "${name}" — set one up first with add_stock_item or in the app.`);

  const hasSet = input.set_qty !== undefined;
  const hasDelta = input.delta !== undefined;
  if (hasSet === hasDelta) throw new Error('update_stock_qty requires exactly one of set_qty or delta.');

  let qty;
  if (hasSet) {
    qty = Number(input.set_qty);
    if (!Number.isFinite(qty) || qty < 0) throw new Error('update_stock_qty: set_qty must be a non-negative number.');
  } else {
    const delta = Number(input.delta);
    if (!Number.isFinite(delta)) throw new Error('update_stock_qty: delta must be a number.');
    qty = Math.max(0, (item.data.qty ?? 0) + delta);
  }

  repo.update(item.id, { data: { ...item.data, qty } });
  return repo.get(item.id);
}

/** Case-insensitive match against an idea's title: exact, then substring,
 *  then a fuzzy nearest-title fallback — same three-step match as
 *  findPaymentItem/findStockItem above, since an idea's exact stored title
 *  is no more memorable than a payment's. */
function findIdeaByName(repo, name) {
  const needle = name.trim().toLowerCase();
  const ideaList = repo.query({ type: IDEA_TYPE });

  const exact = ideaList.filter((i) => i.title.trim().toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new Error(`More than one idea is named "${name}" — be more specific.`);

  const partial = ideaList.filter((i) => i.title.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(`More than one idea matches "${name}" — be more specific: ${partial.map((i) => `"${i.title}"`).join(', ')}.`);
  }

  const normNeedle = stripPunct(needle);
  if (normNeedle) {
    const normMatches = ideaList.filter((i) => stripPunct(i.title).includes(normNeedle));
    if (normMatches.length === 1) return normMatches[0];
    if (normMatches.length > 1) {
      throw new Error(`More than one idea matches "${name}" — be more specific: ${normMatches.map((i) => `"${i.title}"`).join(', ')}.`);
    }
  }

  if (ideaList.length > 0 && normNeedle) {
    const scored = ideaList
      .map((i) => ({ item: i, score: titleSimilarity(normNeedle, stripPunct(i.title)) }))
      .sort((a, b) => b.score - a.score);
    const [best, second] = scored;
    if (best.score >= 0.5 && (!second || best.score - second.score >= 0.15)) return best.item;
    const suggestions = scored.filter((s) => s.score >= 0.25).slice(0, 4);
    if (suggestions.length > 0) {
      throw new Error(`No idea named "${name}" — did you mean ${suggestions.map((s) => `"${s.item.title}"`).join(' or ')}?`);
    }
  }

  return null;
}

/** Same three-step match, scoped to one idea's own (non-deleted) actions —
 *  action text isn't unique across ideas, only within the one it belongs to. */
function findActionByText(repo, idea, text) {
  const needle = text.trim().toLowerCase();
  const actionList = repo.query({ type: ACTION_TYPE }).filter((a) => a.data?.ideaId === idea.id);

  const exact = actionList.filter((a) => a.title.trim().toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new Error(`More than one action in "${idea.title}" matches "${text}" — be more specific.`);

  const partial = actionList.filter((a) => a.title.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(`More than one action in "${idea.title}" matches "${text}" — be more specific: ${partial.map((a) => `"${a.title}"`).join(', ')}.`);
  }

  if (actionList.length > 0) {
    const normNeedle = stripPunct(needle);
    const scored = actionList
      .map((a) => ({ item: a, score: titleSimilarity(normNeedle, stripPunct(a.title)) }))
      .sort((a, b) => b.score - a.score);
    const [best, second] = scored;
    if (best.score >= 0.5 && (!second || best.score - second.score >= 0.15)) return best.item;
  }

  return null;
}

function normalizeStatus(input) {
  if (input === undefined || input === null || input === '') return undefined;
  const v = String(input).trim().toLowerCase();
  const found = STATUSES.find((s) => s.value === v);
  if (!found) throw new Error(`status must be one of: ${STATUSES.map((s) => s.value).join(', ')}.`);
  return found.value;
}

function addIdea(repo, input) {
  const title = (input.title || '').trim();
  if (!title) throw new Error('add_idea requires a title.');
  const status = normalizeStatus(input.status) || 'active';
  return repo.create(IDEA_TYPE, { title, notes: (input.detail || '').trim(), data: { status, progressNote: '' } });
}

function addIdeaAction(repo, input) {
  const ideaName = (input.idea_name || '').trim();
  const title = (input.title || '').trim();
  if (!ideaName) throw new Error('add_idea_action requires idea_name.');
  if (!title) throw new Error('add_idea_action requires a title.');

  // Unlike add_list_item, this never auto-creates the parent — silently
  // spawning a new idea from a stray mention would be worse here than for
  // a shopping list.
  const idea = findIdeaByName(repo, ideaName);
  if (!idea) throw new Error(`No idea named "${ideaName}" — create it first with add_idea.`);

  return repo.create(ACTION_TYPE, { title, data: { ideaId: idea.id } });
}

function updateIdeaAction(repo, input) {
  const ideaName = (input.idea_name || '').trim();
  const actionText = (input.action_text || '').trim();
  if (!ideaName) throw new Error('update_idea_action requires idea_name.');
  if (!actionText) throw new Error('update_idea_action requires action_text.');
  if (input.done === undefined && input.new_text === undefined) {
    throw new Error('update_idea_action requires at least one of done or new_text.');
  }

  const idea = findIdeaByName(repo, ideaName);
  if (!idea) throw new Error(`No idea named "${ideaName}".`);
  const action = findActionByText(repo, idea, actionText);
  if (!action) throw new Error(`No action matching "${actionText}" in "${idea.title}".`);

  const patch = {};
  if (input.done !== undefined) patch.doneAt = input.done ? new Date().toISOString() : null;
  if (input.new_text !== undefined) {
    const t = (input.new_text || '').trim();
    if (!t) throw new Error('new_text cannot be empty.');
    patch.title = t;
  }
  // repo.update's own return value is the up-to-date record; repo.get()
  // right after would still read the pre-update one, since it comes from a
  // ref that only refreshes on the next render, not synchronously.
  return repo.update(action.id, patch);
}

function deleteIdeaAction(repo, input) {
  const ideaName = (input.idea_name || '').trim();
  const actionText = (input.action_text || '').trim();
  if (!ideaName) throw new Error('delete_idea_action requires idea_name.');
  if (!actionText) throw new Error('delete_idea_action requires action_text.');

  const idea = findIdeaByName(repo, ideaName);
  if (!idea) throw new Error(`No idea named "${ideaName}".`);
  const action = findActionByText(repo, idea, actionText);
  if (!action) throw new Error(`No action matching "${actionText}" in "${idea.title}".`);

  repo.softDelete(action.id);
  // The pre-delete snapshot, plus the idea's own title for the confirmation
  // line — describeToolResult has no other way to reach it once deleted.
  return { ...action, ideaTitle: idea.title };
}

function updateIdea(repo, input) {
  const ideaName = (input.idea_name || '').trim();
  if (!ideaName) throw new Error('update_idea requires idea_name.');
  const hasChange = ['status', 'detail', 'progress_note', 'new_title'].some((k) => input[k] !== undefined);
  if (!hasChange) throw new Error('update_idea requires at least one of status, detail, progress_note, or new_title.');

  const idea = findIdeaByName(repo, ideaName);
  if (!idea) throw new Error(`No idea named "${ideaName}".`);

  const status = normalizeStatus(input.status);
  const data = { ...idea.data };
  if (status !== undefined) data.status = status;
  if (input.progress_note !== undefined) data.progressNote = (input.progress_note || '').trim();

  const patch = { data };
  if (input.detail !== undefined) patch.notes = (input.detail || '').trim();
  if (input.new_title !== undefined) {
    const t = (input.new_title || '').trim();
    if (!t) throw new Error('new_title cannot be empty.');
    patch.title = t;
  }
  return repo.update(idea.id, patch);
}

const MAX_IDEA_RESULTS = 30;
const daysAgo = (ts) => Math.floor((Date.now() - ts) / 86400000);

/**
 * Read-only lookup — the assistant's way to answer "what ideas do I have"
 * beyond what buildContext already covers (active/someday only, capped
 * small — see context.js), and the only way to see one idea's exact action
 * text before calling update_idea_action/delete_idea_action, which match
 * an action by that exact text. Never writes anything, same as
 * search_directory.
 */
export function listIdeas(repo, input) {
  const status = normalizeStatus(input.status);

  if (input.name) {
    const idea = findIdeaByName(repo, input.name);
    if (!idea) throw new Error(`No idea named "${input.name}".`);
    const actions = repo.query({ type: ACTION_TYPE }).filter((a) => a.data?.ideaId === idea.id);
    const progress = progressOf(actions);
    return {
      title: idea.title,
      status: idea.data?.status || 'active',
      detail: idea.notes || null,
      progressNote: idea.data?.progressNote || null,
      progress: progress ? `${progress.done}/${progress.total} (${progress.pct}%)` : 'no actions yet',
      daysSinceTouched: daysAgo(lastTouched(idea, actions)),
      actions: actions.map((a) => ({ text: a.title, done: !!a.doneAt })),
    };
  }

  const ideaList = repo.query({ type: IDEA_TYPE }).filter((i) => !status || (i.data?.status || 'active') === status);
  const allActions = repo.query({ type: ACTION_TYPE });
  const results = ideaList.slice(0, MAX_IDEA_RESULTS).map((i) => {
    const actions = allActions.filter((a) => a.data?.ideaId === i.id);
    const progress = progressOf(actions);
    return {
      title: i.title,
      status: i.data?.status || 'active',
      progress: progress ? `${progress.done}/${progress.total} (${progress.pct}%)` : 'no actions yet',
      daysSinceTouched: daysAgo(lastTouched(i, actions)),
    };
  });
  return { count: ideaList.length, truncated: ideaList.length > results.length, results };
}

const HANDLERS = {
  create_reminder: createReminder,
  add_note: addNote,
  add_list_item: addListItem,
  add_contact: addContact,
  add_payment: addPayment,
  log_payment: logPayment,
  add_stock_item: addStockItem,
  update_stock_qty: updateStockQty,
  add_idea: addIdea,
  add_idea_action: addIdeaAction,
  update_idea_action: updateIdeaAction,
  delete_idea_action: deleteIdeaAction,
  update_idea: updateIdea,
};

/**
 * Run a single tool_use block (as returned by the assistant function) against
 * the repo. Returns the created record. Throws on an unknown tool name or
 * invalid input — callers decide how to surface that.
 */
export function runToolCall(repo, toolUse) {
  const handler = HANDLERS[toolUse.name];
  if (!handler) throw new Error(`Unknown assistant tool: ${toolUse.name}`);
  return handler(repo, toolUse.input || {});
}

/** Human-readable confirmation line for the overlay's log, per tool. */
export function describeToolResult(repo, toolUse, record) {
  switch (toolUse.name) {
    case 'create_reminder': {
      const due = record.dueAt ? ` — ${dueLabel(record.dueAt)}` : '';
      return `Reminder added: "${record.title}"${due}`;
    }
    case 'add_note':
      return `Note added: "${record.title}"`;
    case 'add_list_item': {
      const list = repo.get(record.data?.listId);
      return `Added "${record.title}" to ${list?.title || 'the list'}`;
    }
    case 'add_contact': {
      const tag = record.data.personal
        ? record.data.company ? ` — personal, ${record.data.company}` : ' — personal'
        : '';
      return `Contact saved: "${record.title}"${tag}`;
    }
    case 'add_payment': {
      const dir = record.data.kind === 'pay' ? 'You pay' : 'You receive';
      // Surface the start month whenever it isn't just "this month" — that's
      // the detail most worth confirming back, since a wrong one is silent
      // until someone checks the ledger.
      const start = record.data.startMonth !== currentMonthKey()
        ? `, starting ${monthLabel(record.data.startMonth)}` : '';
      return `Payment set up: "${record.title}" — ${dir} ${fmtPayment(record.data.amount)}/month${start}`;
    }
    case 'log_payment': {
      const summary = allocSummary(record.data.allocations);
      return summary
        ? `Logged ${fmtPayment(record.data.amount)} against "${record.title}" — ${summary}`
        : `Logged ${fmtPayment(record.data.amount)} against "${record.title}"`;
    }
    case 'add_stock_item':
      return `Tracking "${record.title}"${record.data.category ? ` — ${record.data.category}` : ''}`;
    case 'update_stock_qty':
      return `"${record.title}" is now at ${record.data.qty}${record.data.qty <= (record.data.lowStockAt ?? 0) ? ' — needs restocking' : ''}`;
    case 'add_idea':
      return `Idea saved: "${record.title}"${record.data.status !== 'active' ? ` — ${record.data.status}` : ''}`;
    case 'add_idea_action': {
      const idea = repo.get(record.data?.ideaId);
      return `Added "${record.title}" to ${idea?.title || 'the idea'}`;
    }
    case 'update_idea_action':
      return record.doneAt ? `Marked "${record.title}" done` : `Updated "${record.title}"`;
    case 'delete_idea_action':
      return `Removed "${record.title}" from ${record.ideaTitle || 'the idea'}`;
    case 'update_idea':
      return `Updated "${record.title}"${record.data?.status ? ` — ${record.data.status}` : ''}`;
    default:
      return 'Done.';
  }
}
