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
  const { importText } = useAttendanceImporter();
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

  return (
    <Sheet open onClose={onClose} title="Import">
      <Picker
        label="Attendance report"
        hint="Employee Number, Date, Schedule, Attendance columns — the primary source"
        busy={busy}
        onFile={handle(importText, setAttLog)}
      />
      <LogView log={attLog} />

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
