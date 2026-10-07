import { useEffect, useRef, useState } from 'react';
import { loadConfig } from '../../../core/db/config';
import { newId } from '../../../core/db/schema';
import { detectProvider } from '../lib/helpers';

const FOLDERS_COL = 'fileOrganizerFolders';
const FILES_COL = 'fileOrganizerFiles';
const META_COL = 'fileOrganizerMeta';
const TAGS_DOC = 'tags';
const DRIVE_DOC = 'driveScan';
const now = () => new Date().toISOString();

/**
 * Firebase (~650KB) is dynamically imported here, exactly like repo.jsx and
 * useCloudBackup.js already do — a static import would pull the whole SDK
 * into the main bundle for every visitor, cloud user or not.
 */
async function loadFirestore() {
  const cfg = loadConfig();
  if (!cfg) throw new Error('Cloud sync is not configured (Settings → Cloud sync).');
  const [{ dbOf, getIdToken }, firestore] = await Promise.all([
    import('../../../core/db/firebase'),
    import('firebase/firestore'),
  ]);
  return { db: dbOf(cfg), getIdToken: () => getIdToken(cfg), ...firestore };
}

/**
 * Live Firestore data for the two dedicated per-user collections this
 * module owns — see the brief's schema. Unlike repo.jsx's generic records
 * store, this is a small, dedicated dataset, so it just listens live
 * (onSnapshot) rather than reimplementing repo's read-cost-minimising
 * mirror/watermark machinery, the same choice sessions/mvNetwork made.
 */
export function useFileOrganizerData({ cloud, uid }) {
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  // Known tag names, independent of which (if any) files currently carry
  // them — see metaDocRef below for why this exists as its own doc.
  const [knownTags, setKnownTags] = useState([]);
  // Client-readable Drive-scan settings — the watched folder and whether
  // it's connected. The refresh token itself is never in here, or
  // anywhere client-readable at all; see driveRefreshTokens in the
  // Firestore rules.
  const [driveSettings, setDriveSettings] = useState({ watchedFolderId: null, watchedFolderLink: null, lastScanAt: null, connected: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const fsRef = useRef(null);
  const foldersRef = useRef([]);
  const filesRef = useRef([]);
  const knownTagsRef = useRef([]);
  const driveSettingsRef = useRef(driveSettings);
  foldersRef.current = folders;
  filesRef.current = files;
  knownTagsRef.current = knownTags;
  driveSettingsRef.current = driveSettings;

  useEffect(() => {
    if (!cloud || !uid) { setLoading(false); return undefined; }
    let alive = true;
    let stopFolders = () => {};
    let stopFiles = () => {};
    let stopTags = () => {};
    let stopDrive = () => {};
    setLoading(true);
    loadFirestore().then((fs) => {
      if (!alive) return;
      fsRef.current = fs;
      const { db, collection, doc, onSnapshot } = fs;
      let foldersLoaded = false;
      let filesLoaded = false;
      let tagsLoaded = false;
      let driveLoaded = false;
      const maybeDone = () => { if (foldersLoaded && filesLoaded && tagsLoaded && driveLoaded) setLoading(false); };
      stopFolders = onSnapshot(
        collection(db, 'users', uid, FOLDERS_COL),
        (snap) => { setFolders(snap.docs.map((d) => d.data())); foldersLoaded = true; maybeDone(); },
        (e) => { setError(e?.message || 'Could not load folders.'); setLoading(false); }
      );
      stopFiles = onSnapshot(
        collection(db, 'users', uid, FILES_COL),
        (snap) => { setFiles(snap.docs.map((d) => d.data())); filesLoaded = true; maybeDone(); },
        (e) => { setError(e?.message || 'Could not load files.'); setLoading(false); }
      );
      stopTags = onSnapshot(
        doc(db, 'users', uid, META_COL, TAGS_DOC),
        (snap) => { setKnownTags(snap.exists() ? (snap.data().tags || []) : []); tagsLoaded = true; maybeDone(); },
        (e) => { setError(e?.message || 'Could not load tags.'); setLoading(false); }
      );
      stopDrive = onSnapshot(
        doc(db, 'users', uid, META_COL, DRIVE_DOC),
        (snap) => {
          setDriveSettings(snap.exists()
            ? { watchedFolderId: null, watchedFolderLink: null, lastScanAt: null, connected: false, ...snap.data() }
            : { watchedFolderId: null, watchedFolderLink: null, lastScanAt: null, connected: false });
          driveLoaded = true; maybeDone();
        },
        (e) => { setError(e?.message || 'Could not load Drive-scan settings.'); setLoading(false); }
      );
    }).catch((e) => { if (alive) { setError(e?.message || 'Could not reach the cloud.'); setLoading(false); } });
    return () => { alive = false; stopFolders(); stopFiles(); stopTags(); stopDrive(); };
  }, [cloud, uid]);

  const ready = () => {
    if (!cloud || !uid || !fsRef.current) throw new Error('Sign in to the cloud first (Settings → Cloud sync).');
    return fsRef.current;
  };
  const colRef = (fs, name) => fs.collection(fs.db, 'users', uid, name);
  /** One fixed doc, same shape as the mvNetwork backup doc — a tag is
   *  otherwise just a string that happens to appear on a file's `tags`
   *  array, with nowhere to exist independent of that. */
  const metaDocRef = (fs) => fs.doc(fs.db, 'users', uid, META_COL, TAGS_DOC);
  const driveDocRef = (fs) => fs.doc(fs.db, 'users', uid, META_COL, DRIVE_DOC);

  const putFolder = async (folder) => {
    const fs = ready();
    await fs.setDoc(fs.doc(colRef(fs, FOLDERS_COL), folder.id), folder);
    return folder;
  };
  const putFile = async (file) => {
    const fs = ready();
    await fs.setDoc(fs.doc(colRef(fs, FILES_COL), file.id), file);
    return file;
  };
  const updateFile = async (id, patch) => {
    const file = filesRef.current.find((f) => f.id === id);
    if (!file) return null;
    return putFile({ ...file, ...patch, updatedAt: now() });
  };

  return {
    loading,
    error,
    folders,
    files,
    knownTags,
    driveSettings,
    scanning,

    /** Merges fields into the Drive-scan settings doc — used for saving
     *  the pasted watched-folder link/id. Never the place `connected` or
     *  the refresh token live on the backend side; this doc only ever
     *  holds what's safe for the client to read and write. */
    async updateDriveSettings(patch) {
      const fs = ready();
      await fs.setDoc(driveDocRef(fs), patch, { merge: true });
    },

    /** Starts the Drive OAuth flow: mints a server-signed consent URL
     *  (see functions/drive-oauth-start.js for why this has to be a fetch
     *  rather than a plain link) and navigates the browser to it. The
     *  callback redirects back into the app with ?driveConnected=1 or
     *  ?driveError=...; index.jsx reads that query param on mount and
     *  flips `connected` itself (this function never does, since the
     *  redirect lands on a fresh page load with no promise left to
     *  resolve). */
    async connectDrive() {
      const fs = ready();
      const token = await fs.getIdToken();
      const res = await fetch('/drive-oauth-start', { headers: { authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not start connecting Google Drive.');
      window.location.assign(data.url);
    },

    /** Only flips the local "connected" flag — the refresh token stored
     *  server-side is left alone. Revoking it at Google's end too is a
     *  reasonable follow-up, just not something this phase's brief asked
     *  for; reconnecting later re-grants consent regardless. */
    async disconnectDrive() {
      const fs = ready();
      await fs.setDoc(driveDocRef(fs), { connected: false }, { merge: true });
    },

    /**
     * Calls drive-scan, then creates a new 'unfiled' entry for every
     * returned file whose driveFileId isn't already known — checked
     * against files of EVERY status (including 'ignored'), so dismissing
     * a file doesn't make it reappear on the next scan. Returns how many
     * were new.
     */
    async scanDrive() {
      const fs = ready();
      const folderId = driveSettingsRef.current.watchedFolderId;
      if (!folderId) throw new Error('Paste a watched folder link first.');
      setScanning(true);
      try {
        const token = await fs.getIdToken();
        const res = await fetch('/drive-scan', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ folderId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'Scan failed.');

        const knownDriveIds = new Set(filesRef.current.map((f) => f.driveFileId).filter(Boolean));
        const newFiles = (data.files || []).filter((f) => !knownDriveIds.has(f.id));

        if (newFiles.length) {
          const batch = fs.writeBatch(fs.db);
          newFiles.forEach((f) => {
            const id = newId();
            batch.set(fs.doc(colRef(fs, FILES_COL), id), {
              id, displayName: f.name, originalFileName: f.name, url: f.webViewLink, provider: 'google',
              driveFileId: f.id, status: 'unfiled', folderId: null, tags: [], revision: null,
              supersedes: null, notes: null, starred: false, createdAt: now(), updatedAt: now(),
            });
          });
          batch.set(driveDocRef(fs), { lastScanAt: now() }, { merge: true });
          await batch.commit();
        } else {
          await fs.setDoc(driveDocRef(fs), { lastScanAt: now() }, { merge: true });
        }
        return newFiles.length;
      } finally {
        setScanning(false);
      }
    },

    /** "Add to library" (-> 'active') / "Ignore" (-> 'ignored') on an
     *  unfiled entry — a thin wrapper so the Needs Review UI doesn't need
     *  to know updateFile's generic patch shape. */
    async setFileStatus(id, status) {
      return updateFile(id, { status });
    },

    /** Stages a tag name ahead of using it on any file — e.g. from the
     *  Tags manager's "+ Add" row. */
    async addKnownTag(name) {
      const fs = ready();
      const t = name.trim();
      if (!t || knownTagsRef.current.includes(t)) return;
      const next = [...knownTagsRef.current, t].sort((a, b) => a.localeCompare(b));
      await fs.setDoc(metaDocRef(fs), { tags: next });
    },

    async createFolder(name, parentId) {
      const folder = { id: newId(), name, parentId: parentId || null, createdAt: now() };
      return putFolder(folder);
    },

    async renameFolder(id, name) {
      const folder = foldersRef.current.find((f) => f.id === id);
      if (!folder) return null;
      return putFolder({ ...folder, name });
    },

    /** Reparents children (folders and files) up one level, then removes
     *  the folder itself — same "delete and promote contents" behaviour
     *  as the demo. */
    async deleteFolder(id) {
      const fs = ready();
      const folder = foldersRef.current.find((f) => f.id === id);
      if (!folder) return;
      const batch = fs.writeBatch(fs.db);
      foldersRef.current.filter((f) => f.parentId === id).forEach((f) => {
        batch.set(fs.doc(colRef(fs, FOLDERS_COL), f.id), { ...f, parentId: folder.parentId });
      });
      filesRef.current.filter((f) => f.folderId === id).forEach((f) => {
        batch.set(fs.doc(colRef(fs, FILES_COL), f.id), { ...f, folderId: folder.parentId, updatedAt: now() });
      });
      batch.delete(fs.doc(colRef(fs, FOLDERS_COL), id));
      await batch.commit();
    },

    async createFile(fields) {
      const file = {
        id: newId(), tags: [], revision: null, supersedes: null, notes: null, starred: false,
        originalFileName: null, status: 'active', driveFileId: null, createdAt: now(), updatedAt: now(), ...fields,
      };
      return putFile(file);
    },

    updateFile,

    async deleteFile(id) {
      const fs = ready();
      await fs.deleteDoc(fs.doc(colRef(fs, FILES_COL), id));
    },

    /** Bulk-paste mode: each line becomes an "Untitled link" entry. */
    async bulkAddFiles(lines, folderId) {
      const fs = ready();
      const batch = fs.writeBatch(fs.db);
      lines.forEach((url) => {
        const id = newId();
        batch.set(fs.doc(colRef(fs, FILES_COL), id), {
          id, displayName: 'Untitled link', originalFileName: null, url, provider: detectProvider(url),
          folderId: folderId || null, tags: [], revision: null, supersedes: null, notes: null,
          starred: false, status: 'active', driveFileId: null, createdAt: now(), updatedAt: now(),
        });
      });
      await batch.commit();
      return lines.length;
    },

    async bulkMove(ids, folderId) {
      const fs = ready();
      const batch = fs.writeBatch(fs.db);
      ids.forEach((id) => {
        const f = filesRef.current.find((x) => x.id === id);
        if (!f) return;
        batch.set(fs.doc(colRef(fs, FILES_COL), id), { ...f, folderId: folderId || null, updatedAt: now() });
      });
      await batch.commit();
    },

    async bulkDeleteFiles(ids) {
      const fs = ready();
      const batch = fs.writeBatch(fs.db);
      ids.forEach((id) => batch.delete(fs.doc(colRef(fs, FILES_COL), id)));
      await batch.commit();
    },

    /** Renaming to an existing tag merges the two. Also keeps the known-
     *  tags doc in sync — a tag staged here but never put on a file would
     *  otherwise ignore renames/deletes entirely (no file carries it for
     *  the per-file loop below to find). */
    async renameTagGlobal(oldTag, newTag) {
      const fs = ready();
      const affected = filesRef.current.filter((f) => (f.tags || []).includes(oldTag));
      const inKnown = knownTagsRef.current.includes(oldTag);
      if (!affected.length && !inKnown) return;
      const batch = fs.writeBatch(fs.db);
      affected.forEach((f) => {
        const tags = f.tags.filter((t) => t !== oldTag);
        if (!tags.includes(newTag)) tags.push(newTag);
        batch.set(fs.doc(colRef(fs, FILES_COL), f.id), { ...f, tags, updatedAt: now() });
      });
      const knownNext = knownTagsRef.current.filter((t) => t !== oldTag);
      if (!knownNext.includes(newTag)) knownNext.push(newTag);
      batch.set(metaDocRef(fs), { tags: knownNext.sort((a, b) => a.localeCompare(b)) });
      await batch.commit();
    },

    async deleteTagGlobal(tag) {
      const fs = ready();
      const affected = filesRef.current.filter((f) => (f.tags || []).includes(tag));
      const inKnown = knownTagsRef.current.includes(tag);
      if (!affected.length && !inKnown) return;
      const batch = fs.writeBatch(fs.db);
      affected.forEach((f) => {
        batch.set(fs.doc(colRef(fs, FILES_COL), f.id), { ...f, tags: f.tags.filter((t) => t !== tag), updatedAt: now() });
      });
      batch.set(metaDocRef(fs), { tags: knownTagsRef.current.filter((t) => t !== tag) });
      await batch.commit();
    },

    /** Permanently removes one old revision entry, repairing the chain so
     *  anything that pointed at it now points at what IT superseded. */
    async deleteHistoryEntry(id) {
      const fs = ready();
      const deleted = filesRef.current.find((f) => f.id === id);
      if (!deleted) return;
      const batch = fs.writeBatch(fs.db);
      filesRef.current.filter((f) => f.supersedes === id).forEach((f) => {
        batch.set(fs.doc(colRef(fs, FILES_COL), f.id), { ...f, supersedes: deleted.supersedes || null, updatedAt: now() });
      });
      batch.delete(fs.doc(colRef(fs, FILES_COL), id));
      await batch.commit();
    },
  };
}
