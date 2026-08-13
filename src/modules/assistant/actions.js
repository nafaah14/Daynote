/**
 * Turns a tool_use block from the assistant (netlify/functions/assistant.js)
 * into a repo.create() call. Each handler matches the target module's actual
 * record shape — see reminders/index.jsx, notes/notes.jsx, lists/index.jsx.
 *
 * Callers pass the repo returned by useRepo(); this file never calls the hook
 * itself so it works the same inside a component or a plain event handler.
 */
import { TYPE as REMINDER_TYPE } from '../reminders';
import { TYPE as NOTE_TYPE, sanitize, plainText } from '../notes/notes';
import { LIST_TYPE, ITEM_TYPE } from '../lists';
import { dueLabel } from '../../core/dates';

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

const HANDLERS = {
  create_reminder: createReminder,
  add_note: addNote,
  add_list_item: addListItem,
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
    default:
      return 'Done.';
  }
}
