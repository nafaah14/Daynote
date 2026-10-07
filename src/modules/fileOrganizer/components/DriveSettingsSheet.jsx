import { useState } from 'react';
import { Link2, RefreshCw, Unplug } from 'lucide-react';
import { Sheet, Field, Input, Button } from '../../../core/ui/components';
import { parseDriveFolderId } from '../lib/helpers';

/**
 * Drive connect/settings + manual "Scan now" — everything the brief's
 * frontend section asks for except the per-file Needs Review controls,
 * which live in NeedsReviewSheet instead since they're a different list
 * (unfiled files, not settings).
 */
export default function DriveSettingsSheet({ open, onClose, driveSettings, scanning, onSave, onConnect, onDisconnect, onScan }) {
  const [linkInput, setLinkInput] = useState(driveSettings.watchedFolderLink || '');
  const [linkError, setLinkError] = useState('');
  const [connectError, setConnectError] = useState('');
  const [scanResult, setScanResult] = useState(null); // { count } | { error }

  if (!open) return null;

  const saveFolderLink = () => {
    const t = linkInput.trim();
    if (!t) { onSave({ watchedFolderId: null, watchedFolderLink: null }); setLinkError(''); return; }
    const id = parseDriveFolderId(t);
    if (!id) { setLinkError("That doesn't look like a Drive folder link — paste the folder's share link."); return; }
    setLinkError('');
    onSave({ watchedFolderId: id, watchedFolderLink: t });
  };

  const connect = async () => {
    setConnectError('');
    try { await onConnect(); } catch (e) { setConnectError(e.message); }
  };

  const scan = async () => {
    setScanResult(null);
    try {
      const count = await onScan();
      setScanResult({ count });
    } catch (e) {
      setScanResult({ error: e.message });
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Google Drive scan">
      <Field label="Connection">
        {driveSettings.connected ? (
          <Button size="sm" variant="danger" onClick={onDisconnect}><Unplug size={14} /> Disconnect</Button>
        ) : (
          <Button size="sm" variant="primary" onClick={connect}><Link2 size={14} /> Connect Google Drive</Button>
        )}
      </Field>
      {connectError && <p className="field-hint fo-error">{connectError}</p>}

      <Field label="Watched folder" hint="Paste the share link of the one Drive folder to watch for new files.">
        <Input
          value={linkInput}
          onChange={(e) => setLinkInput(e.target.value)}
          onBlur={saveFolderLink}
          onKeyDown={(e) => e.key === 'Enter' && saveFolderLink()}
          placeholder="https://drive.google.com/drive/folders/…"
        />
      </Field>
      {linkError && <p className="field-hint fo-error">{linkError}</p>}

      <Field label="Scan">
        <Button
          size="sm" onClick={scan}
          disabled={scanning || !driveSettings.connected || !driveSettings.watchedFolderId}
        >
          <RefreshCw size={14} className={scanning ? 'fo-spin' : ''} /> {scanning ? 'Scanning…' : 'Scan now'}
        </Button>
        <p className="field-hint">
          {driveSettings.lastScanAt ? `Last scanned ${new Date(driveSettings.lastScanAt).toLocaleString()}.` : 'Never scanned yet.'}
        </p>
        {scanResult?.count > 0 && <p className="field-hint">{scanResult.count} new file{scanResult.count === 1 ? '' : 's'} found — check Needs Review.</p>}
        {scanResult?.count === 0 && <p className="field-hint">No new files.</p>}
        {scanResult?.error && <p className="field-hint fo-error">{scanResult.error}</p>}
      </Field>
    </Sheet>
  );
}
