import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FolderOpen, Inbox, Star, Pencil, Trash2, History, ChevronRight, Tag, FolderPlus, ListChecks,
} from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import {
  Card, Row, SectionLabel, EmptyState, Button, Sheet, Select, Chip, Checkbox,
} from '../../core/ui/components';
import { Fab } from '../../core/ui/extras';
import { useFileOrganizerData } from './state/useFileOrganizerData';
import {
  childFolders, folderById, breadcrumbPath, allTags, ancestorChain,
  fileCountInFolder, isSearching, visibleFiles,
} from './lib/helpers';
import FolderTree from './components/FolderTree';
import FolderNameSheet from './components/FolderNameSheet';
import FileSheet from './components/FileSheet';
import HistorySheet from './components/HistorySheet';
import TagManagerSheet from './components/TagManagerSheet';
import MoveFilesSheet from './components/MoveFilesSheet';
import './fileOrganizer.css';

function Breadcrumb({ folders, currentFolderId, searching, onNavigate }) {
  if (searching) {
    const label = currentFolderId === null
      ? 'Searching all files'
      : `Searching in "${folderById(folders, currentFolderId)?.name || ''}" and its subfolders`;
    return <div className="fo-breadcrumb"><span>{label}</span></div>;
  }
  const path = breadcrumbPath(folders, currentFolderId);
  return (
    <div className="fo-breadcrumb">
      <a onClick={() => onNavigate(null)}>All Files</a>
      {path.map((f, i) => (
        <span key={f.id}>
          <span className="fo-bc-sep">/</span>
          {i === path.length - 1
            ? <span className="fo-bc-current">{f.name}</span>
            : <a onClick={() => onNavigate(f.id)}>{f.name}</a>}
        </span>
      ))}
    </div>
  );
}

function FileOrganizerScreen() {
  const repo = useRepo();
  const data = useFileOrganizerData({ cloud: repo.cloud, uid: repo.uid });
  const { folders, files } = data;

  // Folder navigation rides on a URL search param specifically so the
  // browser/phone back button steps back through folder history for free,
  // via React Router's own history integration — no need to hand-roll the
  // popstate bookkeeping the standalone demo needed (it had no router).
  const [params, setParams] = useSearchParams();
  const currentFolderId = params.get('folder') || null;
  const navigateToFolder = (id) => {
    setSearchQuery(''); setActiveTags([]);
    setParams(id ? { folder: id } : {});
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTags, setActiveTags] = useState([]);
  const [sortBy, setSortBy] = useState('name');
  const [foldersCollapsed, setFoldersCollapsed] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [foldersSheetOpen, setFoldersSheetOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [addingFile, setAddingFile] = useState(false);
  const [editingFile, setEditingFile] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [folderPrompt, setFolderPrompt] = useState(null); // { mode: 'add'|'rename', parentId? , id? }

  if (!repo.cloud) {
    return (
      <div className="page">
        <div className="page-head"><h1 className="page-title serif">File Organizer</h1></div>
        <Card>
          <EmptyState icon={FolderOpen} title="Cloud sync required" body="Sign in to the cloud first (Settings → Cloud sync) — this module stores folders and files in Firestore." />
        </Card>
      </div>
    );
  }
  if (data.loading) {
    return (
      <div className="page">
        <div className="page-head"><h1 className="page-title serif">File Organizer</h1></div>
        <Card><EmptyState icon={FolderOpen} title="Loading…" /></Card>
      </div>
    );
  }

  const searchingNow = isSearching(searchQuery, activeTags);
  const allTagNames = allTags(files);
  const visible = visibleFiles(folders, files, { currentFolderId, searchQuery, activeTags, sortBy });
  const currentChildFolders = searchingNow ? [] : childFolders(folders, currentFolderId);

  const toggleSelect = (id) => setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const handleDeleteFile = (id) => {
    if (!window.confirm('Delete this entry? This only removes it from the organizer — the actual file in Drive is untouched.')) return;
    data.deleteFile(id).catch(() => {});
  };
  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} file entr${selectedIds.length === 1 ? 'y' : 'ies'}? This only removes them from the organizer.`)) return;
    data.bulkDeleteFiles(selectedIds).then(() => setSelectedIds([])).catch(() => {});
  };
  const handleDeleteFolder = (id) => {
    const folder = folderById(folders, id);
    if (!folder) return;
    const childCount = folders.filter((f) => f.parentId === id).length + fileCountInFolder(folders, files, id);
    const msg = childCount > 0
      ? `This folder contains ${childCount} item(s). Delete it and move its contents up one level?`
      : 'Delete this empty folder?';
    if (!window.confirm(msg)) return;
    if (currentFolderId === id) navigateToFolder(folder.parentId);
    data.deleteFolder(id).catch(() => {});
  };
  const handleDeleteHistoryEntry = (id) => {
    if (!window.confirm('Permanently delete this old revision entry? This cannot be undone.')) return;
    data.deleteHistoryEntry(id).catch(() => {});
  };

  const fileRow = (file) => {
    const selected = selectedIds.includes(file.id);
    const chainLen = ancestorChain(files, file.id).length;
    return (
      <Row
        key={file.id}
        lead={selectMode ? <Checkbox checked={selected} onChange={() => toggleSelect(file.id)} label={`Select ${file.displayName}`} /> : undefined}
        title={
          <span className="fo-file-title-row">
            <span>{file.displayName}</span>
            {file.revision && <span className="fo-file-rev">{file.revision}</span>}
            {chainLen > 0 && (
              <button className="fo-history-badge" title="View earlier revisions" onClick={(e) => { e.stopPropagation(); setHistoryFor(file.id); }}>
                <History size={12} /> {chainLen}
              </button>
            )}
          </span>
        }
        meta={
          <>
            <div className="fo-file-sub">{file.originalFileName || 'untitled link'}</div>
            {file.notes && <div className="fo-file-notes">{file.notes}</div>}
            {file.tags?.length > 0 && (
              <div className="fo-file-tags">{file.tags.map((t) => <span key={t} className="fo-file-tag">{t}</span>)}</div>
            )}
          </>
        }
        onClick={selectMode ? () => toggleSelect(file.id) : undefined}
        href={selectMode ? undefined : file.url}
        target={selectMode ? undefined : '_blank'}
        rel={selectMode ? undefined : 'noopener'}
        right={selectMode ? undefined : (
          <span className="fo-row-actions">
            <button className="icon-btn" title="Star" onClick={() => data.updateFile(file.id, { starred: !file.starred })}>
              <Star size={15} fill={file.starred ? 'currentColor' : 'none'} />
            </button>
            <button className="icon-btn" title="Edit" onClick={() => setEditingFile(file)}><Pencil size={15} /></button>
            <button className="icon-btn danger" title="Delete" onClick={() => handleDeleteFile(file.id)}><Trash2 size={15} /></button>
          </span>
        )}
      />
    );
  };

  return (
    <div className="page has-fab">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">File Organizer</h1>
          <p className="page-sub">Dev preview — not yet on Dashboard.</p>
        </div>
        <div className="head-actions">
          <Button size="sm" onClick={() => setFoldersSheetOpen(true)}><FolderOpen size={14} /> Folders</Button>
          <Button size="sm" onClick={() => setTagManagerOpen(true)}><Tag size={14} /> Tags</Button>
        </div>
      </div>

      <Card className="capture-card">
        <div className="capture">
          <input
            className="capture-input" placeholder="Search files, tags, notes…"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search files, tags, notes"
          />
        </div>
      </Card>

      {allTagNames.length > 0 && (
        <div className="cat-filter-bar">
          {allTagNames.map((t) => (
            <Chip
              key={t} tone={activeTags.includes(t) ? 'accent' : 'neutral'}
              onClick={() => setActiveTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}
            >
              {t}
            </Chip>
          ))}
        </div>
      )}

      <Breadcrumb folders={folders} currentFolderId={currentFolderId} searching={searchingNow} onNavigate={navigateToFolder} />

      {selectMode ? (
        <div className="fo-toolbar">
          <span className="fo-selected-count">{selectedIds.length} selected</span>
          <Button size="sm" onClick={() => setMoveOpen(true)} disabled={!selectedIds.length}>Move to…</Button>
          <Button size="sm" variant="danger" onClick={handleBulkDelete} disabled={!selectedIds.length}>Delete</Button>
          <Button size="sm" onClick={() => { setSelectMode(false); setSelectedIds([]); }}>Done</Button>
        </div>
      ) : (
        <div className="fo-toolbar">
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="name">Sort: Name</option>
            <option value="newest">Sort: Newest</option>
            <option value="updated">Sort: Recently updated</option>
          </Select>
          <Button size="sm" onClick={() => setFolderPrompt({ mode: 'add', parentId: currentFolderId })}><FolderPlus size={14} /> Folder here</Button>
          <Button size="sm" onClick={() => setSelectMode(true)}><ListChecks size={14} /> Select</Button>
        </div>
      )}

      {currentChildFolders.length > 0 && (
        <>
          <button type="button" className="fo-folder-toggle" onClick={() => setFoldersCollapsed((c) => !c)}>
            <ChevronRight size={13} className={`fo-chevron ${foldersCollapsed ? '' : 'is-open'}`} />
            <span>Folders ({currentChildFolders.length})</span>
          </button>
          {!foldersCollapsed && (
            <Card>
              <div className="ruled">
                {currentChildFolders.map((f) => {
                  const count = fileCountInFolder(folders, files, f.id);
                  return (
                    <Row
                      key={f.id}
                      title={f.name}
                      meta={`${count} file${count === 1 ? '' : 's'}`}
                      onClick={() => navigateToFolder(f.id)}
                      right={
                        <span className="fo-row-actions">
                          <button className="icon-btn" title="Rename" onClick={(e) => { e.stopPropagation(); setFolderPrompt({ mode: 'rename', id: f.id }); }}>
                            <Pencil size={13} />
                          </button>
                          <button className="icon-btn danger" title="Delete" onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id); }}>
                            <Trash2 size={13} />
                          </button>
                        </span>
                      }
                    />
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}

      <SectionLabel right={<span className="mono count">{visible.length}</span>}>Files</SectionLabel>
      <Card>
        {visible.length === 0 ? (
          <EmptyState icon={Inbox} title="Nothing here yet" body="Add a link to a Drive or OneDrive file to get started." />
        ) : (
          <div className="ruled">{visible.map(fileRow)}</div>
        )}
      </Card>

      <Fab label="Add file" onClick={() => setAddingFile(true)} />

      <Sheet open={foldersSheetOpen} onClose={() => setFoldersSheetOpen(false)} title="Folders"
        headerActions={
          <button className="icon-btn" title="New folder" onClick={() => setFolderPrompt({ mode: 'add', parentId: null })}>
            <FolderPlus size={16} />
          </button>
        }>
        <FolderTree
          folders={folders} files={files} currentFolderId={currentFolderId}
          onNavigate={(id) => { navigateToFolder(id); setFoldersSheetOpen(false); }}
          onAddSub={(parentId) => setFolderPrompt({ mode: 'add', parentId })}
          onRename={(id) => setFolderPrompt({ mode: 'rename', id })}
          onDelete={handleDeleteFolder}
        />
      </Sheet>

      {folderPrompt && (
        <FolderNameSheet
          open
          onClose={() => setFolderPrompt(null)}
          title={folderPrompt.mode === 'rename' ? 'Rename folder' : 'New folder'}
          initial={folderPrompt.mode === 'rename' ? (folderById(folders, folderPrompt.id)?.name || '') : ''}
          onSave={(name) => {
            if (folderPrompt.mode === 'rename') data.renameFolder(folderPrompt.id, name).catch(() => {});
            else data.createFolder(name, folderPrompt.parentId).catch(() => {});
          }}
        />
      )}

      {(addingFile || editingFile) && (
        <FileSheet
          open
          onClose={() => { setAddingFile(false); setEditingFile(null); }}
          existing={editingFile}
          folders={folders}
          files={files}
          currentFolderId={currentFolderId}
          allTagNames={allTagNames}
          onCreate={(fields) => data.createFile(fields).catch(() => {})}
          onBulkCreate={(lines, folderId) => data.bulkAddFiles(lines, folderId).catch(() => {})}
          onUpdate={(id, patch) => data.updateFile(id, patch).catch(() => {})}
          onDelete={handleDeleteFile}
        />
      )}

      <HistorySheet
        open={!!historyFor}
        onClose={() => setHistoryFor(null)}
        fileId={historyFor}
        files={files}
        onOpenLink={(url) => window.open(url, '_blank', 'noopener')}
        onDeleteEntry={handleDeleteHistoryEntry}
      />

      <TagManagerSheet
        open={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
        files={files}
        onRenameTag={(oldTag, newTag) => data.renameTagGlobal(oldTag, newTag).catch(() => {})}
        onDeleteTag={(tag) => data.deleteTagGlobal(tag).catch(() => {})}
      />

      <MoveFilesSheet
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        count={selectedIds.length}
        folders={folders}
        onMove={(folderId) => {
          data.bulkMove(selectedIds, folderId).then(() => {
            setSelectMode(false); setSelectedIds([]);
          }).catch(() => {});
        }}
      />
    </div>
  );
}

export default {
  id: 'fileOrganizer',
  title: 'File Organizer',
  icon: FolderOpen,
  accent: 'var(--accent-fileorganizer)',
  tier: 'dev',
  routes: [{ path: '/test/file-organizer', element: <FileOrganizerScreen /> }],
};
