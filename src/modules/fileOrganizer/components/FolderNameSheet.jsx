import { useState } from 'react';
import { Sheet, Field, Input, Button } from '../../../core/ui/components';

/** Shared create/rename sheet — pass `initial` for rename, leave it blank
 *  for create. Replaces the demo's window.prompt(), consistent with how
 *  every other module in Daybook takes short text input (e.g. Lists' item
 *  category sheet) rather than a native prompt. */
export default function FolderNameSheet({ open, onClose, title, initial = '', onSave }) {
  const [name, setName] = useState(initial);

  if (!open) return null;

  const save = () => {
    const t = name.trim();
    if (!t) return;
    onSave(t);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>Save</Button>
        </>
      }
    >
      <Field label="Folder name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          autoFocus
        />
      </Field>
    </Sheet>
  );
}
