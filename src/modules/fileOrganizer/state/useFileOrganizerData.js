import { useEffect, useRef, useState } from 'react';
import { loadConfig } from '../../../core/db/config';
import { newId } from '../../../core/db/schema';
import { detectProvider } from '../lib/helpers';

const FOLDERS_COL = 'fileOrganizerFolders';
const FILES_COL = 'fileOrganizerFiles';
const now = () => new Date().toISOString();

/**
 * Firebase (~650KB) is dynamically imported here, exactly like repo.jsx and
 * useCloudBackup.js already do — a static import would pull the whole SDK
 * into the main bundle for every visitor, cloud user or not.
 */
async function loadFirestore() {
  const cfg = loadConfig();
  if (!cfg) throw new Error('Cloud sync is not configured (Settings → Cloud sync).');
  const [{ dbOf }, firestore] = await Promise.all([
    import('../../../core/db/firebase'),
    import('firebase/firestore'),
  ]);
  return { db: dbOf(cfg), ...firestore };
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fsRef = useRef(null);
  const foldersRef = useRef([]);
  const filesRef = useRef([]);
  foldersRef.current = folders;
  filesRef.current = files;

  useEffect(() => {
    if (!cloud || !uid) { setLoading(false); return undefined; }
    let alive = true;
    let stopFolders = () => {};
    let stopFiles = () => {};
    setLoading(true);
    loadFirestore().then((fs) => {
      if (!alive) return;
      fsRef.current = fs;
      const { db, collection, onSnapshot } = fs;
      let foldersLoaded = false;
      let filesLoaded = false;
      const maybeDone = () => { if (foldersLoaded && filesLoaded) setLoading(false); };
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
    }).catch((e) => { if (alive) { setError(e?.message || 'Could not reach the cloud.'); setLoading(false); } });
    return () => { alive = false; stopFolders(); stopFiles(); };
  }, [cloud, uid]);

  const ready = () => {
    if (!cloud || !uid || !fsRef.current) throw new Error('Sign in to the cloud first (Settings → Cloud sync).');
    return fsRef.current;
  };
  const colRef = (fs, name) => fs.collection(fs.db, 'users', uid, name);

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

  return {
    loading,
    error,
    folders,
    files,

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
        originalFileName: null, createdAt: now(), updatedAt: now(), ...fields,
      };
      return putFile(file);
    },

    async updateFile(id, patch) {
      const file = filesRef.current.find((f) => f.id === id);
      if (!file) return null;
      return putFile({ ...file, ...patch, updatedAt: now() });
    },

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
          starred: false, createdAt: now(), updatedAt: now(),
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

    /** Renaming to an existing tag merges the two. */
    async renameTagGlobal(oldTag, newTag) {
      const fs = ready();
      const affected = filesRef.current.filter((f) => (f.tags || []).includes(oldTag));
      if (!affected.length) return;
      const batch = fs.writeBatch(fs.db);
      affected.forEach((f) => {
        const tags = f.tags.filter((t) => t !== oldTag);
        if (!tags.includes(newTag)) tags.push(newTag);
        batch.set(fs.doc(colRef(fs, FILES_COL), f.id), { ...f, tags, updatedAt: now() });
      });
      await batch.commit();
    },

    async deleteTagGlobal(tag) {
      const fs = ready();
      const affected = filesRef.current.filter((f) => (f.tags || []).includes(tag));
      if (!affected.length) return;
      const batch = fs.writeBatch(fs.db);
      affected.forEach((f) => {
        batch.set(fs.doc(colRef(fs, FILES_COL), f.id), { ...f, tags: f.tags.filter((t) => t !== tag), updatedAt: now() });
      });
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
