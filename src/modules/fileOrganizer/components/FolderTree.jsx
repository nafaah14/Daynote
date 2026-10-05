import { Inbox, Folder, Plus, Pencil, Trash2 } from 'lucide-react';
import { childFolders, fileCountInFolder, headFileCount } from '../lib/helpers';

function TreeNode({ folder, depth, folders, files, currentFolderId, onNavigate, onAddSub, onRename, onDelete }) {
  const kids = childFolders(folders, folder.id);
  return (
    <li>
      <div
        className={`fo-tree-row ${currentFolderId === folder.id ? 'is-active' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => onNavigate(folder.id)}
      >
        <Folder size={15} />
        <span className="fo-tree-label">{folder.name}</span>
        <span className="fo-tree-count">{fileCountInFolder(folders, files, folder.id)}</span>
        <span className="fo-tree-row-actions">
          <button className="icon-btn" title="Add subfolder" onClick={(e) => { e.stopPropagation(); onAddSub(folder.id); }}>
            <Plus size={12} />
          </button>
          <button className="icon-btn" title="Rename" onClick={(e) => { e.stopPropagation(); onRename(folder.id); }}>
            <Pencil size={12} />
          </button>
          <button className="icon-btn danger" title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}>
            <Trash2 size={12} />
          </button>
        </span>
      </div>
      {kids.length > 0 && (
        <ul className="fo-tree-children">
          {kids.map((f) => (
            <TreeNode
              key={f.id} folder={f} depth={depth + 1} folders={folders} files={files}
              currentFolderId={currentFolderId} onNavigate={onNavigate} onAddSub={onAddSub}
              onRename={onRename} onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function FolderTree({ folders, files, currentFolderId, onNavigate, onAddSub, onRename, onDelete }) {
  const roots = childFolders(folders, null);
  return (
    <ul className="fo-tree">
      <li>
        <div className={`fo-tree-row ${currentFolderId === null ? 'is-active' : ''}`} onClick={() => onNavigate(null)}>
          <Inbox size={15} />
          <span className="fo-tree-label">All Files</span>
          <span className="fo-tree-count">{headFileCount(files)}</span>
        </div>
      </li>
      {roots.map((f) => (
        <TreeNode
          key={f.id} folder={f} depth={1} folders={folders} files={files}
          currentFolderId={currentFolderId} onNavigate={onNavigate} onAddSub={onAddSub}
          onRename={onRename} onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
