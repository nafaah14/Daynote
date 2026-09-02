import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, SectionLabel } from '../../../core/ui/components';
import {
  runRange, dkey, hm, hDec, dparse, addD, attendanceLabel, isDutyDay, daysBetween,
} from '../lib/overtimeEngine';
import { DayStatusSheet } from './DayStatusSheet';
import { WeekAttendanceDetails } from './WeekAttendanceDetails';

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtCell = (k) => dparse(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const fmtRange = (a, b) => `${fmtCell(a)} – ${fmtCell(b)}`;

const LEGEND = [
  ['present', 'Present'], ['attended', 'Attended'], ['leave', 'Leave'],
  ['absent', 'Absent'], ['review', 'Needs review'], ['offDuty', 'Off duty'],
  ['scheduled', 'Scheduled'], ['noRecord', 'No record'],
];

const dutyWindow = (day, emp, cfg) => {
  if (day.schedS && day.schedE) return `${day.schedS}–${day.schedE}`;
  return isDutyDay(day, emp, cfg) ? `${cfg.dutyStart}–${cfg.dutyEnd}` : '–';
};

/**
 * Read-only attendance at a glance — a roster calendar plus a week-by-week
 * worked-hours breakdown, replacing what used to be an editable day list
 * here. Editing moved elsewhere: day status is a click on a calendar cell
 * away (`DayStatusSheet`), and overtime-entry approval lives on the
 * Approvals tab's Pending/Approved toggle now. Its period nav is controlled
 * by the parent (`PersonView`) rather than owned here — the summary tiles up
 * top follow whichever period this calendar is showing, so navigating here
 * has to be visible one level up too.
 */
export function AttendanceView({ employee, ctx, calPeriod, onShiftPeriod, onResetPeriod, cfg, recordFor, patchDay, addManualPunch, setPunchDeleted }) {
  const [dayOpen, setDayOpen] = useState(null);
  const [weekOpen, setWeekOpen] = useState(null);
  const todayKey = dkey(new Date());

  const data = useMemo(() => runRange(employee, calPeriod.from, calPeriod.to, ctx, {}), [employee, calPeriod, ctx]);
  const dayByKey = useMemo(() => new Map(data.weeks.flatMap((w) => w.days).map((d) => [d.d, d])), [data]);

  const dutySum = data.days.reduce((s, d) => s + d.duty, 0);
  const extraSum = data.days.reduce((s, d) => s + d.extra, 0);
  const required = data.weeks.length * cfg.weeklyThresholdMin;

  const openWeek = weekOpen != null ? data.weeks.find((w) => w.start === weekOpen) : null;
  const openWeekIndex = openWeek ? data.weeks.indexOf(openWeek) + 1 : null;
  const openDay = dayOpen != null ? dayByKey.get(dayOpen) : null;

  return (
    <>
      <div className="ot-attn-nav">
        <SectionLabel>Roster calendar</SectionLabel>
        <div className="ot-attn-navctrl">
          <span className="ot-sub">{calPeriod.label}</span>
          <Button size="sm" onClick={() => onShiftPeriod(-1)} aria-label="Previous period"><ChevronLeft size={14} /></Button>
          <Button size="sm" onClick={onResetPeriod}>Current</Button>
          <Button size="sm" onClick={() => onShiftPeriod(1)} aria-label="Next period"><ChevronRight size={14} /></Button>
        </div>
      </div>

      <div className="ot-cal-grid">
        {DOW_LABELS.map((label, i) => (
          <div key={label} className={`ot-cal-dow ${i === 5 || i === 6 ? 'is-weekend' : ''}`}>{label}</div>
        ))}
        {data.weeks.map((week) => week.days.map((day) => {
          const spill = day.d < calPeriod.from || day.d > calPeriod.to;
          const hasRecord = !!ctx.dayOf(employee.no, day.d);
          const status = attendanceLabel(day, employee, cfg, hasRecord, todayKey);
          return (
            <button
              type="button" key={day.d}
              className={`ot-cal-cell ${status.key} ${spill ? 'is-spill' : ''} ${day.d === todayKey ? 'is-today' : ''}`}
              onClick={() => setDayOpen(day.d)}
            >
              <span className="ot-cal-date">{fmtCell(day.d)}</span>
              <span className="ot-cal-status">{status.label}</span>
              <span className="ot-cal-window">{dutyWindow(day, employee, cfg)}</span>
            </button>
          );
        }))}
      </div>
      <div className="ot-cal-legend">
        {LEGEND.map(([key, label]) => (
          <span key={key} className="ot-cal-legend-item"><span className={`ot-cal-swatch ${key}`} /> {label}</span>
        ))}
      </div>

      <div className="ot-attn-nav" style={{ marginTop: 'var(--sp-5)' }}>
        <SectionLabel>Worked hours</SectionLabel>
        <span className="ot-sub">{calPeriod.label}</span>
      </div>
      <div className="ot-stats" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="ot-stat accent-slate"><div className="k">Duty hours</div><div className="v">{hDec(dutySum)}<small>h</small></div></div>
        <div className="ot-stat accent-amber"><div className="k">Extra hrs</div><div className="v">{hDec(extraSum)}<small>h</small></div></div>
        <div className="ot-stat accent-teal"><div className="k">Total</div><div className="v">{hDec(dutySum + extraSum)}<small>h</small></div></div>
        <div className="ot-stat"><div className="k">Required</div><div className="v">{hDec(required)}<small>h</small></div></div>
      </div>

      <div className="ot-week-list">
        {data.weeks.map((week, i) => {
          const weekEnd = addD(week.start, 6);
          const wDuty = week.days.reduce((s, d) => s + d.duty, 0);
          const wExtra = week.days.reduce((s, d) => s + d.extra, 0);
          const wGen = week.days.reduce((s, d) => s + d.genOT, 0);
          const wPub = week.days.reduce((s, d) => s + d.pubOT, 0);
          const scale = Math.max(week.total, cfg.weeklyThresholdMin * 1.1, 1);
          const isCurrent = todayKey >= week.start && todayKey <= weekEnd;
          const dayIndex = isCurrent ? daysBetween(week.start, todayKey) + 1 : null;
          return (
            <div key={week.start} className="ot-week-row" onClick={() => setWeekOpen(week.start)}>
              <div className="ot-week-row-head">
                <span>Week {i + 1} · {fmtRange(week.start, weekEnd)}{isCurrent && <> · <strong>current</strong> · day {dayIndex}/7</>}</span>
              </div>
              <div className="ot-bar">
                <span className="seg duty" style={{ width: `${(wDuty / scale) * 100}%` }} />
                <span className="seg gen" style={{ width: `${(wGen / scale) * 100}%` }} />
                <span className="seg pub" style={{ width: `${(wPub / scale) * 100}%` }} />
                <span className="line48" style={{ left: `${(cfg.weeklyThresholdMin / scale) * 100}%` }} />
              </div>
              <div className="ot-week-row-cols">
                <span className="mono">{hm(wDuty)} duty</span>
                <span className="mono">{hm(wExtra)} extra</span>
                <span className="mono ot-strong">{hm(wDuty + wExtra)} total</span>
              </div>
            </div>
          );
        })}
      </div>

      {openDay && (
        <DayStatusSheet
          employee={employee} day={openDay} cfg={cfg}
          rawDay={recordFor(employee.no, openDay.d)?.data || null}
          patchDay={patchDay} addManualPunch={addManualPunch} setPunchDeleted={setPunchDeleted}
          onClose={() => setDayOpen(null)}
        />
      )}
      {openWeek && (
        <WeekAttendanceDetails
          employee={employee} week={openWeek} weekNumber={openWeekIndex} cfg={cfg} ctx={ctx}
          onClose={() => setWeekOpen(null)}
        />
      )}
    </>
  );
}
