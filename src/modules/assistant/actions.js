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

/** Case-insensitive match against a payment item's title, exact first then substring. */
function findPaymentItem(repo, name) {
  const needle = name.trim().toLowerCase();
  const items = repo.query({ type: PAYMENT_ITEM_TYPE });

  const exact = items.filter((i) => i.title.trim().toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new Error(`More than one payment is named "${name}" — be more specific.`);

  const partial = items.filter((i) => i.title.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new Error(`More than one payment matches "${name}" — be more specific.`);

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

const HANDLERS = {
  create_reminder: createReminder,
  add_note: addNote,
  add_list_item: addListItem,
  add_contact: addContact,
  add_payment: addPayment,
  log_payment: logPayment,
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
    default:
      return 'Done.';
  }
}
