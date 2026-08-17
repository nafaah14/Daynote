import { Plus } from 'lucide-react';
import { Sheet, Button } from '../../../core/ui/components';

/** Feeder roster: color, name, DSS count, and tripped status. Trip control
 *  itself lives in TripPanel — this just reflects it. */
export function FeederListSheet({
  feeders, dssCountByFeeder, trippedFeeders, onEdit, onAdd, onClose,
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
            <span className="mvnet-feeder-count">{tripped ? 'TRIPPED' : `${dssCountByFeeder[f.id] || 0} DSS`}</span>
          </div>
        );
      })}
      <Button variant="outline" size="sm" onClick={onAdd} style={{ marginTop: 10 }}><Plus size={14} /> Add feeder</Button>
    </Sheet>
  );
}
