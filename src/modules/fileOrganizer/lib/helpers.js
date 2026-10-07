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
  files.filter(isActive).forEach((f) => (f.tags || []).forEach((t) => set.add(t)));
  return [...set].sort();
}

export function isSuperseded(files, fileId) {
  return files.some((f) => f.supersedes === fileId);
}

/**
 * A file's status gates whether it shows up in normal browsing at all.
 * Missing `status` (every file created before Phase 2 added the field)
 * reads as 'active' — the brief's "existing/manual entries default to
 * active" is handled this way, by treating absence as active everywhere
 * it's checked, rather than as a one-time migration write over every
 * existing document.
 */
export const isActive = (f) => (f.status || 'active') === 'active';
export const isUnfiled = (f) => f.status === 'unfiled';

/** The Drive-scan "Needs Review" inbox — unfiled files only, newest first
 *  so a fresh scan's results land at the top. */
export function unfiledFiles(files) {
  return files.filter(isUnfiled).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Parses a pasted Drive folder link down to its bare folder ID, or null
 *  if the link doesn't look like one. Matches the id Drive's own URLs use
 *  (letters, digits, - and _) — the same shape drive-scan.js re-checks
 *  server-side before using it in a query. */
export function parseDriveFolderId(link) {
  const m = String(link || '').match(/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/** The file that replaced this one, if any — lets a superseded entry
 *  found through search point back to the current version. */
export function supersededBy(files, fileId) {
  return files.find((f) => f.supersedes === fileId) || null;
}

export function fileCountInFolder(folders, files, folderId) {
  return files.filter((f) => f.folderId === folderId && isActive(f) && !isSuperseded(files, f.id)).length;
}

export function headFileCount(files) {
  return files.filter((f) => isActive(f) && !isSuperseded(files, f.id)).length;
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
  return files.filter((f) => f.id !== excludeId && isActive(f) && !isSuperseded(files, f.id));
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

/**
 * Files to show for the current folder/search/tag/sort state — starred
 * files always pin to the top regardless of sort mode.
 *
 * Two different exclusions, for two different reasons:
 *  - Non-active files (unfiled/ignored) never show here, in search
 *    included — they live in the "Needs Review" inbox instead, and have
 *    no folder (folderId is null) until promoted to active.
 *  - Superseded entries stay out of plain browsing (that's the point of
 *    marking something superseded — the folder shows only what's
 *    current), but a search DOES reach them. Otherwise an old revision
 *    becomes unfindable the moment something replaces it: the only way
 *    back to it is through the history badge on whichever file superseded
 *    it, which means already knowing that file.
 */
export function visibleFiles(folders, files, { currentFolderId, searchQuery, activeTags, sortBy }) {
  const active = files.filter(isActive);
  let pool;
  if (isSearching(searchQuery, activeTags)) {
    const scopeIds = collectDescendantFolderIds(folders, currentFolderId);
    pool = active.filter((f) => scopeIds.includes(f.folderId));
  } else {
    pool = active.filter((f) => f.folderId === currentFolderId && !isSuperseded(files, f.id));
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
