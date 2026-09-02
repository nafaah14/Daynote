import { Sheet, OptionRow, Toggle, Input } from '../../../core/ui/components';

const num = (v, fallback = 0) => { const n = parseFloat(v); return Number.isNaN(n) ? fallback : n; };

/** Every threshold, multiplier and shift setting, editable in one place —
 *  HANDOVER.md §10's Rules page. `dutyPastLine` is flagged there as a real
 *  policy switch (payroll cost, not a tuning knob), not cosmetic. */
export function RulesSheet({ cfg, onUpdate, onClose }) {
  const set = (key) => (v) => onUpdate({ [key]: v });

  return (
    <Sheet open onClose={onClose} title="Overtime rules">
      <OptionRow
        title="Weekly threshold"
        hint="Hours credited before general overtime begins"
        control={<Input type="number" step="1" style={{ width: 90 }} value={cfg.weeklyThresholdMin / 60}
          onChange={(e) => set('weeklyThresholdMin')(num(e.target.value, 48) * 60)} />}
      />
      <OptionRow
        title="Office day"
        hint="Maintenance staff duty window"
        control={(
          <span style={{ display: 'flex', gap: 6 }}>
            <Input value={cfg.dutyStart} onChange={(e) => set('dutyStart')(e.target.value)} style={{ width: 66 }} />
            <Input value={cfg.dutyEnd} onChange={(e) => set('dutyEnd')(e.target.value)} style={{ width: 66 }} />
          </span>
        )}
      />
      <OptionRow
        title="Shift starts"
        hint="Comma-separated, duty/shift staff"
        control={<Input value={cfg.shiftStarts.join(', ')} onChange={(e) => set('shiftStarts')(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} style={{ width: 150 }} />}
      />
      <OptionRow
        title="Handover minutes"
        hint="Counted as normal working time, not overtime"
        control={<Input type="number" style={{ width: 90 }} value={cfg.handoverMin} onChange={(e) => set('handoverMin')(num(e.target.value))} />}
      />
      <OptionRow
        title="Early-card grace"
        hint="Minutes a duty shift may be carded in early"
        control={<Input type="number" style={{ width: 90 }} value={cfg.earlyGraceMin} onChange={(e) => set('earlyGraceMin')(num(e.target.value))} />}
      />
      <OptionRow
        title="Rostered hours past the line are overtime too"
        hint="Payroll-affecting — needs sign-off before enabling for a live period"
        control={<Toggle checked={!!cfg.dutyPastLine} onChange={set('dutyPastLine')} label="Rostered hours past the 48h line count as overtime" />}
      />
      <OptionRow
        title="Fridays are always overtime"
        control={<Toggle checked={!!cfg.fridayIsHoliday} onChange={set('fridayIsHoliday')} label="Fridays are always overtime" />}
      />
      <OptionRow
        title="General multiplier"
        control={<Input type="number" step="0.05" style={{ width: 90 }} value={cfg.generalMult} onChange={(e) => set('generalMult')(num(e.target.value, 1.25))} />}
      />
      <OptionRow
        title="Public holiday multiplier"
        control={<Input type="number" step="0.05" style={{ width: 90 }} value={cfg.publicMult} onChange={(e) => set('publicMult')(num(e.target.value, 1.5))} />}
      />
      <OptionRow
        title="Monthly hours"
        hint="A full month of basic salary buys this many hours"
        control={<Input type="number" style={{ width: 90 }} value={cfg.monthlyHours} onChange={(e) => set('monthlyHours')(num(e.target.value, 154))} />}
      />
      <OptionRow
        title="Dashboard alert threshold"
        hint="Flag a person when projected OT reaches this % of basic"
        control={<Input type="number" style={{ width: 90 }} value={cfg.alertPct} onChange={(e) => set('alertPct')(num(e.target.value, 50))} />}
      />
      <OptionRow
        title="Annual leave credit"
        hint="Minutes credited toward the weekly line"
        control={<Input type="number" style={{ width: 90 }} value={cfg.annualCreditMin} onChange={(e) => set('annualCreditMin')(num(e.target.value))} />}
      />
      <OptionRow
        title="Extended hours scenario"
        hint="× this person's own average, when modelling a busier-than-usual remaining period"
        control={(
          <Input
            type="number" step="0.05" style={{ width: 90 }}
            value={cfg.scenarioMultipliers?.extended ?? 1.3}
            onChange={(e) => set('scenarioMultipliers')({ ...cfg.scenarioMultipliers, extended: num(e.target.value, 1.3) })}
          />
        )}
      />
      <OptionRow
        title="Extreme (overhaul) scenario"
        hint="× this person's own average, for a period like an engine overhaul"
        control={(
          <Input
            type="number" step="0.05" style={{ width: 90 }}
            value={cfg.scenarioMultipliers?.extreme ?? 1.6}
            onChange={(e) => set('scenarioMultipliers')({ ...cfg.scenarioMultipliers, extreme: num(e.target.value, 1.6) })}
          />
        )}
      />
      <OptionRow
        title="Attendance match grace"
        hint="How far a card-in may fall from the assigned shift's start before the day needs review"
        control={<Input type="number" style={{ width: 90 }} value={cfg.attendanceGraceMin} onChange={(e) => set('attendanceGraceMin')(num(e.target.value, 30))} />}
      />
      <OptionRow
        title="Old-rules cutover date"
        hint="Dates before this use the pre-Aug-2026 rules in the Unit OT Comparison and Transition Period reports"
        control={<Input type="date" style={{ width: 150 }} value={cfg.legacyCutoverDate} onChange={(e) => set('legacyCutoverDate')(e.target.value)} />}
      />
    </Sheet>
  );
}
