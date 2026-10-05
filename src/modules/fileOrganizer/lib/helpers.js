/**
 * Pure derivations over {folders, files} — ported from the standalone demo's
 * module-level functions, just taking the arrays as arguments instead of
 * closing over a global `state` object.
 */

export function detectProvider(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('drive.google.com') || u.includes('docs.google.com')) return 'google';
  if (u.includes('onedrive.live.com') || u.includes('1drv.ms') || u.includes('sharepoint.com')) return 'onedrive';
  return 'other';
}

export function childFolders(folders, parentId) {
  return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));
}

export function folderById(folders, id) {
  return folders.find((f) => f.id === id) || null;
}

export function breadcrumbPath(folders, folderId) {
  const path = [];
  let cur = folderById(folders, folderId);
  while (cur) { path.unshift(cur); cur = folderById(folders, cur.parentId); }
  return path;
}

export function fullFolderLabel(folders, folderId) {
  const path = breadcrumbPath(folders, folderId);
  return path.length ? path.map((f) => f.name).join(' / ') : 'All Files';
}

export function allTags(files) {
  const set = new Set();
  files.forEach((f) => (f.tags || []).forEach((t) => set.add(t)));
  return [...set].sort();
}

export function isSuperseded(files, fileId) {
  return files.some((f) => f.supersedes === fileId);
}

export function fileCountInFolder(folders, files, folderId) {
  return files.filter((f) => f.folderId === folderId && !isSuperseded(files, f.id)).length;
}

export function headFileCount(files) {
  return files.filter((f) => !isSuperseded(files, f.id)).length;
}

export function collectDescendantFolderIds(folders, folderId) {
  let ids = [folderId];
  childFolders(folders, folderId).forEach((f) => { ids = ids.concat(collectDescendantFolderIds(folders, f.id)); });
  return ids;
}

export function fileById(files, id) {
  return files.find((f) => f.id === id) || null;
}

export function ancestorChain(files, fileId) {
  const chain = [];
  let cur = fileById(files, fileId);
  while (cur && cur.supersedes) {
    const prev = fileById(files, cur.supersedes);
    if (!prev) break;
    chain.push(prev);
    cur = prev;
  }
  return chain;
}

export function headFiles(files, excludeId) {
  return files.filter((f) => f.id !== excludeId && !isSuperseded(files, f.id));
}

function matchesSearch(f, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (f.displayName || '').toLowerCase().includes(needle)
    || (f.originalFileName || '').toLowerCase().includes(needle)
    || (f.notes || '').toLowerCase().includes(needle)
    || (f.tags || []).some((t) => t.toLowerCase().includes(needle));
}

function matchesTags(f, tags) {
  if (!tags.length) return true;
  return tags.every((t) => (f.tags || []).includes(t));
}

export function isSearching(searchQuery, activeTags) {
  return !!searchQuery || activeTags.length > 0;
}

/** Files to show for the current folder/search/tag/sort state — starred
 *  files always pin to the top regardless of sort mode, superseded entries
 *  never show (they're reached only through the history badge). */
export function visibleFiles(folders, files, { currentFolderId, searchQuery, activeTags, sortBy }) {
  let pool;
  if (isSearching(searchQuery, activeTags)) {
    const scopeIds = collectDescendantFolderIds(folders, currentFolderId);
    pool = files.filter((f) => scopeIds.includes(f.folderId) && !isSuperseded(files, f.id));
  } else {
    pool = files.filter((f) => f.folderId === currentFolderId && !isSuperseded(files, f.id));
  }
  return pool
    .filter((f) => matchesSearch(f, searchQuery) && matchesTags(f, activeTags))
    .sort((a, b) => {
      if (!!b.starred !== !!a.starred) return (b.starred ? 1 : 0) - (a.starred ? 1 : 0);
      if (sortBy === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortBy === 'updated') return new Date(b.updatedAt) - new Date(a.updatedAt);
      return a.displayName.localeCompare(b.displayName);
    });
}

export function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return ''; }
}
