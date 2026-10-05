import { useState } from 'react';
import { Sheet, Field, Button } from '../../../core/ui/components';
import FolderSelect from './FolderSelect';

export default function MoveFilesSheet({ open, onClose, count, folders, onMove }) {
  const [folderId, setFolderId] = useState(null);
  if (!open) return null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Move ${count} file${count === 1 ? '' : 's'}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { onMove(folderId); onClose(); }}>Move</Button>
        </>
      }
    >
      <Field label="Destination folder">
        <FolderSelect folders={folders} value={folderId} onChange={setFolderId} />
      </Field>
    </Sheet>
  );
}
