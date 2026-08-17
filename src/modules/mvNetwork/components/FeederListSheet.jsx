import { Plus, Zap } from 'lucide-react';
import { Sheet, Button } from '../../../core/ui/components';

/** Feeder roster: color, name, DSS count, and a quick trip toggle (session-only —
 *  the full multi-feeder trip/recovery workflow is a later phase). */
export function FeederListSheet({
  feeders, dssCountByFeeder, trippedFeeders, onToggleTrip, onEdit, onAdd, onClose,
}) {
  return (
    <Sheet open onClose={onClose} title="Feeders">
      {feeders.length === 0 && <p className="field-hint">No feeders yet.</p>}
      {feeders.map((f) => {
        const tripped = trippedFeeders.includes(f.id);
        return (
          <div className="mvnet-feeder-row" key={f.id}>
            <span className="mvnet-feeder-dot" style={{ background: tripped ? '#d83c3b' : f.color }} />
            <button type="button" className="mvnet-feeder-name" onClick={() => onEdit(f)}>{f.name}</button>
            <span className="mvnet-feeder-count">{dssCountByFeeder[f.id] || 0} DSS</span>
            <button type="button" className={`mvnet-feeder-trip ${tripped ? 'is-tripped' : ''}`} onClick={() => onToggleTrip(f.id)}>
              <Zap size={13} /> {tripped ? 'Tripped' : 'Trip'}
            </button>
          </div>
        );
      })}
      <Button variant="outline" size="sm" onClick={onAdd} style={{ marginTop: 10 }}><Plus size={14} /> Add feeder</Button>
    </Sheet>
  );
}
