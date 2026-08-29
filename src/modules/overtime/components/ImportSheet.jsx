import { useState } from 'react';
import { Sheet, Button, Field } from '../../../core/ui/components';
import { Upload } from 'lucide-react';
import { useAttendanceImporter } from '../state/useAttendanceImporter';
import { useUnitReportImporter } from '../state/useUnitReportImporter';

function Picker({ label, hint, onFile, busy }) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="file" accept=".csv,text/csv"
        disabled={busy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />
    </Field>
  );
}

function LogView({ log }) {
  if (!log) return null;
  if (log.error) return <p className="ot-log bad">{log.error}</p>;
  return (
    <div className="ot-log">
      <p>{log.matched.length} matched{log.days != null ? `, ${log.days} days written` : ''}.</p>
      {log.unmatched.length > 0 && (
        <p className="bad">
          No Directory match for staff number{log.unmatched.length > 1 ? 's' : ''}:{' '}
          {log.unmatched.map((u) => u.sid).join(', ')} — add them in Directory/Roster first.
        </p>
      )}
    </div>
  );
}

/** Attendance CSV is the primary source; the unit report only carries HRMS
 *  reconciliation figures now that salary comes from Roster. */
export function ImportSheet({ onClose }) {
  const { importText, resolveConflicts } = useAttendanceImporter();
  const { importReportText } = useUnitReportImporter();
  const [attLog, setAttLog] = useState(null);
  const [reportLog, setReportLog] = useState(null);
  const [busy, setBusy] = useState(false);

  const handle = (fn, setLog) => async (file) => {
    setBusy(true);
    try { setLog(fn(await file.text())); }
    catch (e) { setLog({ error: e.message }); }
    finally { setBusy(false); }
  };

  const decideConflicts = (action) => {
    resolveConflicts(attLog.conflicts, action);
    setAttLog((l) => ({ ...l, conflicts: [] }));
  };

  const conflictDays = attLog?.conflicts?.reduce((s, c) => s + c.dates.length, 0) || 0;

  return (
    <Sheet open onClose={onClose} title="Import">
      <Picker
        label="Attendance report"
        hint="Employee Number, Date, Schedule, Attendance columns — the primary source"
        busy={busy}
        onFile={handle(importText, setAttLog)}
      />
      <LogView log={attLog} />

      {conflictDays > 0 && (
        <div className="ot-conflict-box">
          <p>
            {conflictDays} day{conflictDays === 1 ? '' : 's'} across {attLog.conflicts.length} staff already{' '}
            {conflictDays === 1 ? 'has' : 'have'} approved or hand-added entries — left exactly as they are.
            Import the new punches for those days anyway?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={() => decideConflicts('keep')}>Keep existing</Button>
            <Button size="sm" variant="primary" onClick={() => decideConflicts('replace')}>Replace with import</Button>
          </div>
        </div>
      )}

      <Picker
        label="Unit overtime report"
        hint="Optional — loads the HRMS's own figures for the reconciliation panel"
        busy={busy}
        onFile={handle(importReportText, setReportLog)}
      />
      <LogView log={reportLog} />

      <Button onClick={onClose}><Upload size={14} /> Done</Button>
    </Sheet>
  );
}
