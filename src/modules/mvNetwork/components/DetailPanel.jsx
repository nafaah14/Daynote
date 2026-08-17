import { X } from 'lucide-react';
import { Button } from '../../../core/ui/components';
import {
  brkLabel, getNode, getBreaker, computeAssignment, getFeeder, breakersThroughConnector,
} from '../lib/electricalModel';

const TYPE_LABEL = {
  plant: 'Powerhouse / grid station', rmu: 'Ring main unit', dss: 'Distribution substation',
};

/** Read-only detail card for a selected node or cable, with breaker toggles
 *  and an Edit button into the corresponding Sheet — ported from v39's
 *  showNodeDetail / showCableDetail. */
export function NodeDetail({
  net, node, onClose, onEdit, onToggleBreaker, onToggleLv0, onZoom,
}) {
  const { nodeF } = computeAssignment(net);
  const feeder = nodeF[node.id] ? getFeeder(net, nodeF[node.id]) : null;

  if (node.type === 'connector') {
    const conns = net.cables.filter((c) => c.from.node === node.id || c.to.node === node.id);
    return (
      <div className="mvnet-detail">
        <button type="button" className="mvnet-close" onClick={onClose}><X size={14} /></button>
        <h3>{node.name || 'Node'}</h3>
        <div className="mvnet-sub">Cable junction · always conductive</div>
        {conns.length === 0
          ? <p className="field-hint">No cables connected yet</p>
          : conns.map((c) => {
            const otherEnd = c.from.node === node.id ? c.to : c.from;
            const other = getNode(net, otherEnd.node);
            const otherName = other ? (other.name || (other.type === 'connector' ? 'Node' : '?')) : '?';
            return <div className="mvnet-drow" key={c.id}><span className="k">{c.name || 'cable'}</span><span>→ {otherName}</span></div>;
          })}
        <div className="mvnet-detail-actions">
          <Button size="sm" onClick={onZoom}>Zoom</Button>
          <Button size="sm" onClick={onEdit}>Edit</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mvnet-detail">
      <button type="button" className="mvnet-close" onClick={onClose}><X size={14} /></button>
      <h3>{node.name}</h3>
      <div className="mvnet-sub">{TYPE_LABEL[node.type]}</div>
      {feeder && <div className="mvnet-drow"><span className="k">Feeder</span><span style={{ color: feeder.color }}>● {feeder.name}</span></div>}
      {node.kva && <div className="mvnet-drow"><span className="k">Transformer</span><span>{node.kva} kVA</span></div>}
      {node.voltage && <div className="mvnet-drow"><span className="k">Voltage</span><span>{node.voltage}</span></div>}
      {node.type === 'dss' && (
        <div className="mvnet-drow">
          <span className="k">LV0</span>
          <button type="button" className={`mvnet-brk-state ${node.lv0 !== false ? 'is-on' : 'is-off'}`} onClick={() => onToggleLv0(node.id)}>
            {node.lv0 !== false ? 'ON' : 'OFF'}
          </button>
        </div>
      )}
      {node.notes && <div className="mvnet-drow"><span className="k">Notes</span><span>{node.notes}</span></div>}
      {(node.breakers || []).length > 0 && <div className="mvnet-detail-label">Breakers · tap state to toggle</div>}
      {(node.breakers || []).map((b) => (
        <div className="mvnet-drow" key={b.id}>
          <span className="k">{b.name}</span>
          <button type="button" className={`mvnet-brk-state ${b.state === 'ON' ? 'is-on' : 'is-off'}`} onClick={() => onToggleBreaker(node.id, b.id)}>
            {brkLabel(b.state)}
          </button>
        </div>
      ))}
      <div className="mvnet-detail-actions">
        <Button size="sm" onClick={onEdit}>Edit</Button>
        <Button size="sm" onClick={onZoom}>Zoom</Button>
      </div>
    </div>
  );
}

function CableEndRow({ net, cable, endKey, onToggleBreaker }) {
  const end = cable[endKey];
  const node = getNode(net, end.node);
  if (node && node.type === 'connector') {
    const reached = breakersThroughConnector(net, end.node, cable.id);
    if (!reached.length) {
      return <div className="mvnet-drow"><span className="k">{node.name || 'Node'} · junction</span><span>no breaker</span></div>;
    }
    return reached.map((r) => (
      <div className="mvnet-drow" key={r.brk.id}>
        <span className="k">{r.node.name} · {r.brk.name} <span style={{ color: 'var(--muted)' }}>(via {node.name || 'Node'})</span></span>
        <button type="button" className={`mvnet-brk-state ${r.brk.state === 'ON' ? 'is-on' : 'is-off'}`} onClick={() => onToggleBreaker(r.node.id, r.brk.id)}>
          {brkLabel(r.brk.state)}
        </button>
      </div>
    ));
  }
  const b = getBreaker(net, end.node, end.breakerId);
  return (
    <div className="mvnet-drow">
      <span className="k">{node ? node.name : '?'} · {b ? b.name : 'unassigned'}</span>
      {b && (
        <button type="button" className={`mvnet-brk-state ${b.state === 'ON' ? 'is-on' : 'is-off'}`} onClick={() => onToggleBreaker(end.node, b.id)}>
          {brkLabel(b.state)}
        </button>
      )}
    </div>
  );
}

export function CableDetail({ net, cable, onClose, onEdit, onToggleBreaker }) {
  const { cableF } = computeAssignment(net);
  const feeder = cableF[cable.id] ? getFeeder(net, cableF[cable.id]) : null;
  const from = getNode(net, cable.from.node);
  const to = getNode(net, cable.to.node);
  return (
    <div className="mvnet-detail">
      <button type="button" className="mvnet-close" onClick={onClose}><X size={14} /></button>
      <h3>{cable.name || 'Cable'}</h3>
      <div className="mvnet-sub">{from?.name || 'Node'} → {to?.name || 'Node'}</div>
      <div className="mvnet-drow"><span className="k">Feeder</span><span style={feeder ? { color: feeder.color } : undefined}>{feeder ? `● ${feeder.name}` : 'De-energised'}</span></div>
      {cable.size && <div className="mvnet-drow"><span className="k">Size</span><span>{cable.size}</span></div>}
      {cable.ctype && <div className="mvnet-drow"><span className="k">Type</span><span>{cable.ctype}</span></div>}
      {cable.year && <div className="mvnet-drow"><span className="k">Installed</span><span>{cable.year}</span></div>}
      {cable.notes && <div className="mvnet-drow"><span className="k">Notes</span><span>{cable.notes}</span></div>}
      <div className="mvnet-detail-label">End breakers · tap to toggle</div>
      <CableEndRow net={net} cable={cable} endKey="from" onToggleBreaker={onToggleBreaker} />
      <CableEndRow net={net} cable={cable} endKey="to" onToggleBreaker={onToggleBreaker} />
      <div className="mvnet-detail-actions"><Button size="sm" onClick={onEdit}>Edit details</Button></div>
    </div>
  );
}
