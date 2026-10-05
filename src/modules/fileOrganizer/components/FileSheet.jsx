import { useState } from 'react';
import { Sheet, Field, Input, Textarea, Select, Button, Toggle } from '../../../core/ui/components';
import { detectProvider, headFiles, fullFolderLabel } from '../lib/helpers';
import TagEditor from './TagEditor';
import FolderSelect from './FolderSelect';

/**
 * Add/edit file sheet. Add mode offers single-link vs bulk-paste (each
 * bulk line becomes an "Untitled link" entry, renamed afterward from the
 * list — same as the demo). Edit mode drops bulk mode and adds Starred +
 * Delete entry, and shows the original file name/link read-only.
 */
export default function FileSheet({
  open, onClose, existing, folders, files, currentFolderId, allTagNames, onCreate, onBulkCreate, onUpdate, onDelete,
}) {
  const isNew = !existing;
  const [mode, setMode] = useState('single');
  const [url, setUrl] = useState(existing?.url || '');
  const [displayName, setDisplayName] = useState(existing?.displayName || '');
  const [origName, setOrigName] = useState(existing?.originalFileName || '');
  const [tags, setTags] = useState(existing?.tags || []);
  const [revision, setRevision] = useState(existing?.revision || '');
  const [supersedes, setSupersedes] = useState(existing?.supersedes || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [folderId, setFolderId] = useState(existing?.folderId ?? currentFolderId ?? null);
  const [starred, setStarred] = useState(existing?.starred || false);
  const [bulkUrls, setBulkUrls] = useState('');

  if (!open) return null;

  const supersedeChoices = headFiles(files, existing?.id)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const save = () => {
    if (isNew && mode === 'bulk') {
      const lines = bulkUrls.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return;
      onBulkCreate(lines, folderId);
      onClose();
      return;
    }
    if (!url.trim()) return;
    const fields = {
      url: url.trim(),
      displayName: displayName.trim() || origName.trim() || 'Untitled file',
      originalFileName: origName.trim() || null,
      provider: detectProvider(url),
      folderId: folderId || null,
      tags,
      revision: revision.trim() || null,
      supersedes: supersedes || null,
      notes: notes.trim() || null,
    };
    if (isNew) onCreate(fields);
    else onUpdate(existing.id, { ...fields, starred });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isNew ? 'Add file' : 'Edit file'}
      footer={
        isNew
          ? (
            <>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={save}>{mode === 'bulk' ? 'Add files' : 'Add file'}</Button>
            </>
          )
          : (
            <>
              <Button variant="danger" onClick={() => { onDelete(existing.id); onClose(); }}>Delete entry</Button>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={save}>Save</Button>
            </>
          )
      }
    >
      {isNew && (
        <div className="fo-mode-switch">
          <button type="button" className={mode === 'single' ? 'is-on' : ''} onClick={() => setMode('single')}>Single link</button>
          <button type="button" className={mode === 'bulk' ? 'is-on' : ''} onClick={() => setMode('bulk')}>Bulk paste</button>
        </div>
      )}

      {isNew && mode === 'bulk' ? (
        <>
          <Field label="Paste links" hint="One per line.">
            <Textarea
              value={bulkUrls}
              onChange={(e) => setBulkUrls(e.target.value)}
              placeholder={'https://drive.google.com/...\nhttps://1drv.ms/...'}
              style={{ minHeight: 140 }}
            />
          </Field>
          <Field label="Folder">
            <FolderSelect folders={folders} value={folderId} onChange={setFolderId} />
          </Field>
          <p className="field-hint">Each entry is added as "Untitled link" — rename and tag afterward from the list.</p>
        </>
      ) : (
        <>
          {isNew ? (
            <Field label="Drive / OneDrive link">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" autoFocus />
            </Field>
          ) : (
            <Field label="Link"><div className="fo-readonly">{existing.url}</div></Field>
          )}
          <Field label="Display name">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. MPH Main SLD" autoFocus={!isNew} />
          </Field>
          {isNew ? (
            <Field label="Original file name" hint="Optional, as it is in Drive.">
              <Input value={origName} onChange={(e) => setOrigName(e.target.value)} placeholder="e.g. MPH_SLD_RevC.pdf" />
            </Field>
          ) : (
            <Field label="Original file name"><div className="fo-readonly">{existing.originalFileName || '(not set)'}</div></Field>
          )}
          <Field label="Tags">
            <TagEditor tags={tags} onChange={setTags} existingTags={allTagNames} />
          </Field>
          <Field label="Revision" hint="Optional.">
            <Input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="Rev B" />
          </Field>
          <Field label="Supersedes" hint="Optional — marks an older entry as replaced by this one.">
            <Select value={supersedes} onChange={(e) => setSupersedes(e.target.value)}>
              <option value="">— None —</option>
              {supersedeChoices.map((f) => (
                <option key={f.id} value={f.id}>{f.displayName} ({fullFolderLabel(folders, f.folderId)})</option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" hint="Optional.">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Field label="Folder">
            <FolderSelect folders={folders} value={folderId} onChange={setFolderId} />
          </Field>
          {!isNew && (
            <Field label="Starred">
              <Toggle checked={starred} onChange={setStarred} label="Starred" />
            </Field>
          )}
        </>
      )}
    </Sheet>
  );
}
