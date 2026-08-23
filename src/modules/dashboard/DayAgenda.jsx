import { useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Sunrise } from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import { Card, EmptyState, Button } from '../../core/ui/components';
import { dueLabel, startOfDay } from '../../core/dates';
import { getAllItemsForDate } from '../../core/dashboardRegistry';
import { AgendaRow } from './AgendaRow';

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isToday = (d) => startOfDay(d).getTime() === startOfDay(new Date()).getTime();

/**
 * Date-navigable agenda: defaults to today, prev/next day plus jump-to-today.
 * Chronological first, then Reminders → Lists → Payments → Notes → Links as
 * a tiebreak (MODULE_ORDER in dashboardRegistry.js) — in practice only
 * Reminders and Payments ever land here, since Lists/Notes/Links carry no
 * date (see the Dashboard build's per-module scope decision).
 */
export function DayAgenda() {
  const repo = useRepo();
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const items = getAllItemsForDate(date, repo);

  return (
    <div className="dash-agenda">
      <div className="dash-agenda-header">
        <button type="button" className="icon-btn" aria-label="Previous day" onClick={() => setDate((d) => addDays(d, -1))}>
          <ChevronLeft size={18} />
        </button>
        <span className="dash-agenda-date serif">{dueLabel(date.toISOString())}</span>
        <button type="button" className="icon-btn" aria-label="Next day" onClick={() => setDate((d) => addDays(d, 1))}>
          <ChevronRight size={18} />
        </button>
        {/* Always rendered, just disabled on today — kept it appearing only
            when needed shifted every other button's position on a tap,
            which made repeated prev/next taps land on the wrong control. */}
        <Button size="sm" variant="quiet" disabled={isToday(date)} onClick={() => setDate(startOfDay(new Date()))}>
          <CalendarDays size={13} /> Today
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState icon={Sunrise} title="Nothing on the agenda" body="Nothing due this day." />
        </Card>
      ) : (
        <Card>
          <div className="ruled">
            {items.map((item) => <AgendaRow key={item.id} item={item} />)}
          </div>
        </Card>
      )}
    </div>
  );
}
