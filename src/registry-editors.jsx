import { useEffect } from 'react';
import { useEditors } from './core/ui/editors';
import { renderEditor as reminderEditor } from './modules/reminders';
import { renderEditor as noteEditor } from './modules/notes/notes';
import { renderEditor as listEditor } from './modules/lists';
import { renderEditor as paymentEditor } from './modules/payments/payments';
import { renderEditor as linkEditor } from './modules/links/links';
import { renderEditor as stockEditor } from './modules/stock/stock';
import { renderEditor as personEditor } from './modules/directory/directory';
import { renderEditor as ideaEditor } from './modules/ideas';

/**
 * Wires each module's editor into the shared EditorHost.
 *
 * Kept here, alongside registry.js, rather than in each module, so the set of
 * editable-from-anywhere modules is visible in one place — and so core stays
 * unaware of which modules exist. A module with no meaningful "open by
 * record" editor (Mandarin has no records to edit) simply isn't listed.
 * Directory's normal browsing is a detail view rather than this kind of
 * edit-by-record flow, but its PersonSheet fits the same (record, close)
 * shape as everyone else's, so it's listed too — the Dashboard's quick-add
 * uses openNew('directory') to open a blank "new person" form.
 */
const EDITORS = {
  reminders: reminderEditor,
  notes: noteEditor,
  lists: listEditor,
  payments: paymentEditor,
  links: linkEditor,
  stock: stockEditor,
  directory: personEditor,
  ideas: ideaEditor,
};

export function ModuleEditors() {
  const { register } = useEditors();
  useEffect(() => {
    const unregs = Object.entries(EDITORS).map(([id, fn]) => register(id, fn));
    return () => unregs.forEach((u) => u());
  }, [register]);
  return null;
}
