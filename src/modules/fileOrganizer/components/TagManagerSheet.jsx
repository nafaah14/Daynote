import { useState } from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { Sheet, Button, Input } from '../../../core/ui/components';
import { allTags } from '../lib/helpers';

/** Click the pencil to rename a tag in place — renaming to one that
 *  already exists merges the two (handled by the caller's onRename). */
function TagRow({ tag, count, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(tag);

  const commit = () => {
    setEditing(false);
    const t = text.trim();
    if (t && t !== tag) onRename(tag, t);
    else setText(tag);
  };

  return (
    <div className="fo-tagmgr-row">
      {editing ? (
        <input
          className="fo-tagmgr-input"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setText(tag); setEditing(false); }
          }}
        />
      ) : (
        <span className="fo-tagmgr-name">{tag}</span>
      )}
      <span className="fo-tagmgr-count">{count} file{count === 1 ? '' : 's'}</span>
      <button className="icon-btn" title="Rename or merge" onClick={() => { setText(tag); setEditing(true); }}>
        <Pencil size={14} />
      </button>
      <button
        className="icon-btn danger"
        title="Delete tag"
        onClick={() => {
          const msg = count > 0
            ? `Remove tag "${tag}" from ${count} file(s)? This cannot be undone.`
            : `Delete tag "${tag}"? It isn't on any files yet.`;
          if (!window.confirm(msg)) return;
          onDelete(tag);
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/**
 * `knownTags` holds names saved here even before they're on any file —
 * without it, a tag only ever exists by being typed onto a file, so
 * there was no way to stage one ahead of time from this screen.
 */
export default function TagManagerSheet({ open, onClose, files, knownTags, onAddTag, onRenameTag, onDeleteTag }) {
  const [newTag, setNewTag] = useState('');
  if (!open) return null;
  const tags = [...new Set([...allTags(files), ...knownTags])].sort((a, b) => a.localeCompare(b));

  const addTag = () => {
    const t = newTag.trim();
    if (!t) return;
    onAddTag(t);
    setNewTag('');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Manage tags" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="fo-tagmgr-add">
        <Input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder="New tag name"
        />
        <Button size="sm" onClick={addTag} disabled={!newTag.trim()}><Plus size={14} /> Add</Button>
      </div>
      {tags.length === 0 ? (
        <p className="field-hint">No tags yet.</p>
      ) : (
        <div className="ruled">
          {tags.map((t) => (
            <TagRow
              key={t}
              tag={t}
              count={files.filter((f) => (f.tags || []).includes(t)).length}
              onRename={onRenameTag}
              onDelete={onDeleteTag}
            />
          ))}
        </div>
      )}
      <p className="field-hint">Renaming a tag to one that already exists merges the two — files keep both tags' effect under the new name. A tag added here shows up as a suggestion on any file until you delete it, even before you've used it.</p>
    </Sheet>
  );
}
