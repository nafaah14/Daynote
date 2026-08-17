import { useMemo } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../core/ui/components';
import { getNode, getFeeder, recoveryOrder, recoveryStatus, RECOV_COLOR } from '../lib/electricalModel';

const STATUS_LABEL = { out: 'Out', mv: 'MV only', full: 'Restored' };

/** Recovery board — manual, session-tracked restoration tracking (never
 *  touches real breaker state). Ported from v39's #recovPanel / renderRecovery. */
export function RecoveryPanel({
  net, recovery, onToggleFeederMV, onToggleMV, onToggleLv0, onAllMV, onAllLv0, onFinish, onZoomNode, onClose,
}) {
  const targets = recovery.targets.map((id) => getNode(net, id)).filter(Boolean);
  const counts = { out: 0, mv: 0, full: 0 };
  targets.forEach((n) => { counts[recoveryStatus(net, recovery, n.id)]++; });
  const total = targets.length || 1;

  const groups = useMemo(() => recoveryOrder(net, recovery.targets), [net, recovery.targets]);

  return (
    <div className="mvnet-panel">
      <button type="button" className="mvnet-close" onClick={onClose}><X size={14} /></button>
      <h3>Recovery</h3>
      <div className="mvnet-sub">{counts.full}/{targets.length} fully restored</div>

      <div className="mvnet-recov-stats">
        {['out', 'mv', 'full'].map((k) => (
          <div className={`mvnet-recov-stat mvnet-recov-${k}`} key={k}>
            <div className="rn">{counts[k]}</div>
            <div className="rl">{STATUS_LABEL[k]}</div>
          </div>
        ))}
      </div>
      <div className="mvnet-recov-prog">
        {counts.full > 0 && <div className="seg" style={{ width: `${(counts.full / total) * 100}%`, background: '#1d9e75' }} />}
        {counts.mv > 0 && <div className="seg" style={{ width: `${(counts.mv / total) * 100}%`, background: '#e8920c' }} />}
        {counts.out > 0 && <div className="seg" style={{ width: `${(counts.out / total) * 100}%`, background: '#d83c3b' }} />}
      </div>
      <p className="field-hint">Close each feeder breaker first, then confirm <b>MV</b> outward in order. Cables energise as you go. <b>LV0</b> tracks customer supply and does not affect MV.</p>

      <div className="mvnet-row2" style={{ marginBottom: 8 }}>
        <Button size="sm" variant="outline" onClick={onAllMV}>All MV on</Button>
        <Button size="sm" variant="outline" onClick={onAllLv0}>All LV0 on</Button>
      </div>

      {groups.map((g) => {
        const f = g.feederId ? getFeeder(net, g.feederId) : null;
        const src = g.source ? getNode(net, g.source) : null;
        return (
          <div className="mvnet-recovgroup" key={g.feederId || 'unassigned'}>
            <div className="mvnet-recovgrouphead">
              <span className="mvnet-feeder-dot" style={{ background: f ? f.color : '#9b988e' }} />
              {f ? f.name : 'Unassigned'}
            </div>
            {g.feederId && (
              <div className="mvnet-recovitem" style={{ background: recovery.feederMV[g.feederId] ? 'var(--in-soft)' : 'var(--hover-weak)' }}>
                <span className="mvnet-recovdot" style={{ background: recovery.feederMV[g.feederId] ? '#1d9e75' : '#d83c3b' }} />
                <span className="mvnet-recovname">① {src ? src.name : 'Source'} breaker</span>
                <button type="button" className={`mvnet-brk-state ${recovery.feederMV[g.feederId] ? 'is-on' : 'is-off'}`} onClick={() => onToggleFeederMV(g.feederId)}>
                  MV {recovery.feederMV[g.feederId] ? 'CLOSED' : 'OPEN'}
                </button>
              </div>
            )}
            {g.nodes.map((id, i) => {
              const n = getNode(net, id);
              if (!n) return null;
              const st = recoveryStatus(net, recovery, id);
              const mvOn = !!recovery.mv[id];
              const lv0On = recovery.lv0[id] !== false;
              const isRmu = n.type === 'rmu';
              return (
                <div className="mvnet-recovitem" key={id}>
                  <span className="mvnet-recovdot" style={{ background: RECOV_COLOR[st] }} />
                  <button type="button" className="mvnet-recovname" onClick={() => onZoomNode(n.lat, n.lng)}>
                    {g.feederId ? `${i + 2}. ` : ''}{n.name}{isRmu && <span className="mvnet-sub"> RMU</span>}
                  </button>
                  <button type="button" className={`mvnet-brk-state ${mvOn ? 'is-on' : 'is-off'}`} onClick={() => onToggleMV(id)}>
                    MV {mvOn ? 'CLOSED' : 'OPEN'}
                  </button>
                  {!isRmu && (
                    <button type="button" className={`mvnet-brk-state ${lv0On ? 'is-on' : 'is-off'}`} disabled={!mvOn} onClick={() => onToggleLv0(id)}>
                      LV0 {lv0On ? 'ON' : 'OFF'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      <Button variant="primary" onClick={onFinish} style={{ width: '100%', marginTop: 10 }}>
        {(counts.out || counts.mv) ? 'Finish (some still out)' : 'All restored — finish & clear trip'}
      </Button>
    </div>
  );
}
