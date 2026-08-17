import { useState } from 'react';
import { Sheet, Button } from '../../../core/ui/components';
import { dueLabel } from '../../../core/dates';

/** Backup now / Restore latest — local-first, backup-on-demand. Never a
 *  shared folder, never live sync; just this account's own single doc. */
export function CloudBackupPanel({
  configured, cloud, lastBackupAt, busy, error, onBackupNow, onRestoreLatest, onClose,
}) {
  const [notice, setNotice] = useState(null);

  const backup = async () => {
    setNotice(null);
    try { await onBackupNow(); setNotice('Backed up.'); } catch { /* error state shown below */ }
  };
  const restore = async () => {
    setNotice(null);
    try {
      const applied = await onRestoreLatest();
      setNotice(applied ? 'Restored from your last backup.' : 'No backup found for this account yet.');
    } catch { /* error state shown below */ }
  };

  return (
    <Sheet open onClose={onClose} title="Cloud backup">
      {!configured && (
        <p className="field-hint">Cloud sync isn't set up for Daybook yet — configure it in Settings → Cloud sync first.</p>
      )}
      {configured && !cloud && (
        <p className="field-hint">Configured, but not signed in — sign in from Settings → Cloud sync to back this network up.</p>
      )}
      {cloud && (
        <>
          <p className="field-hint">
            {lastBackupAt ? `Last backup: ${dueLabel(lastBackupAt)}` : 'Never backed up from this device.'}
            {' '}Auto-backs up ~60s after you stop editing, or tap below any time.
          </p>
          <div className="mvnet-row2" style={{ marginTop: 10 }}>
            <Button variant="primary" onClick={backup} disabled={busy}>Backup now</Button>
            <Button variant="outline" onClick={restore} disabled={busy}>Restore latest</Button>
          </div>
          {notice && <p className="mvnet-note" style={{ marginTop: 10 }}>{notice}</p>}
          {error && <p className="mvnet-error">{error}</p>}
        </>
      )}
    </Sheet>
  );
}
