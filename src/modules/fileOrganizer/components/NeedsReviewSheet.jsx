import { useState } from 'react';
import { Check, X, ExternalLink } from 'lucide-react';
import { Sheet, Field, Button } from '../../../core/ui/components';
import TagEditor from './TagEditor';
import FolderSelect from './FolderSelect';

/** Click-to-rename, same pattern as Lists' item names — committed on
 *  blur/Enter, reverted on Escape. Kept local rather than shared across
 *  modules, per the project's import rule (modules never import each
 *  other). */
function InlineName({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  const commit = () => {
    setEditing(false);
    const t = text.trim();
    if (t && t !== value) onSave(t);
    else setText(value);
  };

  if (editing) {
    return (
      <input
        className="fo-review-name-input"
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setText(value); setEditing(false); }
        }}
      />
    );
  }
  return (
    <span className="fo-review-name" title="Click to rename" onClick={() => { setText(value); setEditing(true); }}>
      {value}
    </span>
  );
}

function ReviewRow({ file, folders, allTagNames, onRename, onTagsChange, onFolderChange, onPromote, onIgnore }) {
  return (
    <div className="fo-review-row">
      <div className="fo-review-head">
        <InlineName value={file.displayName} onSave={onRename} />
        <a className="icon-btn" href={file.url} target="_blank" rel="noopener" title="Open in Drive">
          <ExternalLink size={14} />
        </a>
      </div>
      {file.originalFileName && <div className="fo-file-sub">{file.originalFileName}</div>}
      <Field label="Tags">
        <TagEditor tags={file.tags || []} onChange={onTagsChange} existingTags={allTagNames} />
      </Field>
      <Field label="Folder">
        <FolderSelect folders={folders} value={file.folderId} onChange={onFolderChange} />
      </Field>
      <div className="fo-review-actions">
        <Button size="sm" variant="primary" onClick={onPromote}><Check size={14} /> Add to library</Button>
        <Button size="sm" onClick={onIgnore}><X size={14} /> Ignore</Button>
      </div>
    </div>
  );
}

/**
 * The scan's inbox — unfiled Drive files, each with its own inline rename/
 * tag/folder controls (committing immediately, same as everywhere else in
 * this module) plus the two ways out: promote into the real library, or
 * dismiss it for good.
 */
export default function NeedsReviewSheet({ open, onClose, files, folders, allTagNames, onRename, onTagsChange, onFolderChange, onPromote, onIgnore }) {
  if (!open) return null;

  return (
    <Sheet open={open} onClose={onClose} title={`Needs review (${files.length})`}>
      {files.length === 0 ? (
        <p className="field-hint">Nothing waiting — run a scan to check for new files.</p>
      ) : (
        <div className="fo-review-list">
          {files.map((f) => (
            <ReviewRow
              key={f.id}
              file={f}
              folders={folders}
              allTagNames={allTagNames}
              onRename={(name) => onRename(f.id, name)}
              onTagsChange={(tags) => onTagsChange(f.id, tags)}
              onFolderChange={(folderId) => onFolderChange(f.id, folderId)}
              onPromote={() => onPromote(f.id)}
              onIgnore={() => onIgnore(f.id)}
            />
          ))}
        </div>
      )}
    </Sheet>
  );
}
