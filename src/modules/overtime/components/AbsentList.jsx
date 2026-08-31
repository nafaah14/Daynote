import { useMemo, useState } from 'react';
import { Card, SectionLabel, EmptyState, Button } from '../../../core/ui/components';
import { UserX } from 'lucide-react';
import { dparse } from '../lib/overtimeEngine';
import { DayStatusSheet } from './DayStatusSheet';

const dowShort = (k) => dparse(k).toLocaleDateString(undefined, { weekday: 'short' });

const REASON = {
  mismatch: 'Schedule mismatch',
  holidayMissingPunch: 'Missing punch — holiday',
  absent: 'Absent',
};

/**
 * Everything that needs a human decision before it's trusted for pay: a
 * day whose attendance doesn't match its assigned shift (zero-credited
 * until fixed — see overtimeEngine.js's scheduleMismatch), a holiday with a
 * card missing its check-out, or an explicit absence. One list instead of
 * checking every person's calendar individually — "Review" opens the same
 * day sheet the calendar uses, so fixing the shift or adding a leave clears
 * the row on the next render.
 */
export function AbsentList({ rows, cfg, recordFor, patchDay, addManualPunch, setPunchDeleted, onOpenPerson }) {
  const [openKey, setOpenKey] = useState(null);

  const items = useMemo(() => {
    const list = [];
    rows.forEach((row) => {
      row.fc.actual.days.forEach((day) => {
        if (day.needsReview) list.push({ emp: row.e, day, reason: day.needsReview.reason });
        else if (day.status === 'absent') list.push({ emp: row.e, day, reason: 'absent' });
      });
    });
    return list.sort((a, b) => b.day.d.localeCompare(a.day.d));
  }, [rows]);

  // Derived from live `rows` on every render (not frozen at click time) so
  // fixing the shift or adding a leave updates the open sheet immediately,
  // instead of showing the stale pre-fix day.
  const openItem = useMemo(() => {
    if (!openKey) return null;
    const row = rows.find((r) => r.e.no === openKey.empNo);
    const day = row?.fc.actual.days.find((d) => d.d === openKey.date);
    return day ? { emp: row.e, day } : null;
  }, [openKey, rows]);

  return (
    <>
      <SectionLabel right={<span className="mono count">{items.length}</span>}>
        {items.length} {items.length === 1 ? 'day needs' : 'days need'} review
      </SectionLabel>
      <Card>
        {items.length === 0 ? (
          <EmptyState icon={UserX} title="Nothing to review" body="Every day either matches its assigned shift or has an explanation on file." />
        ) : (
          <div className="ot-table">
            {items.map((it) => (
              <div key={`${it.emp.no}|${it.day.d}`} className="ot-absent-row">
                <div className="ot-name-cell">
                  <button className="ot-link-btn" onClick={() => onOpenPerson(it.emp)}>{it.emp.name}</button>
                  <span className="ot-sub">{it.emp.desig || '—'}</span>
                </div>
                <span className="mono">{it.day.d} <span className="ot-dow">({dowShort(it.day.d)})</span></span>
                <span className={`ot-day-badge ${it.reason === 'absent' ? 'is-absent' : 'is-review'}`}>{REASON[it.reason]}</span>
                <Button size="sm" onClick={() => setOpenKey({ empNo: it.emp.no, date: it.day.d })}>Review</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {openItem && (
        <DayStatusSheet
          employee={openItem.emp} day={openItem.day} cfg={cfg}
          rawDay={recordFor(openItem.emp.no, openItem.day.d)?.data || null}
          patchDay={patchDay} addManualPunch={addManualPunch} setPunchDeleted={setPunchDeleted}
          onClose={() => setOpenKey(null)}
        />
      )}
    </>
  );
}
