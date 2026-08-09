import { useEffect } from 'react';
import { useEditors } from './core/ui/editors';
import { renderEditor as reminderEditor } from './modules/reminders';
import { renderEditor as noteEditor } from './modules/notes/notes';
import { renderEditor as listEditor } from './modules/lists';
import { renderEditor as paymentEditor } from './modules/payments/payments';
import { renderEditor as linkEditor } from './modules/links/links';

/**
 * Wires each module's editor into the shared EditorHost.
 *
 * Kept here, alongside registry.js, rather than in each module, so the set of
 * editable-from-anywhere modules is visible in one place — and so core stays
 * unaware of which modules exist. A module that has no meaningful "open by
 * record" editor (Directory uses a detail view, Mandarin has no records to
 * edit) simply isn't listed.
 */
const EDITORS = {
  reminders: reminderEditor,
  notes: noteEditor,
  lists: listEditor,
  payments: paymentEditor,
  links: linkEditor,
};

export function ModuleEditors() {
  const { register } = useEditors();
  useEffect(() => {
    const unregs = Object.entries(EDITORS).map(([id, fn]) => register(id, fn));
    return () => unregs.forEach((u) => u());
  }, [register]);
  return null;
}
