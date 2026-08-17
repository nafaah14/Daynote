import { useState } from 'react';
import { X } from 'lucide-react';
import { Select, Button } from '../../../core/ui/components';

/** Feeder-trip / substation-trip panel — ported from v39's #tripPanel. Local
 *  session state only: tripping never touches the saved network document. */
export function TripPanel({
  net, trippedFeeders, trippedNodes, tripRadius, affectedNodes,
  onAddFeederTrip, onChangeFeederTrip, onAddNodeTrip, onRemoveNodeTrip, onRadiusChange,
  onStartRecovery, onClearTrip, onZoomNode, onClose,
}) {
  const [tripMode, setTripMode] = useState('feeder');
  const [pendingRows, setPendingRows] = useState(trippedFeeders.length ? 0 : 1);
  const [nodeSearch, setNodeSearch] = useState('');

  const anyTripped = trippedFeeders.length > 0 || trippedNodes.length > 0;
  const dss = affectedNodes.filter((n) => n.type === 'dss');
  const rmuCount = affectedNodes.filter((n) => n.type === 'rmu').length;
  const kva = dss.reduce((s, n) => s + (parseFloat(n.kva) || 0), 0);

  const searchHits = nodeSearch.trim()
    ? net.nodes.filter((n) => n.type !== 'plant' && n.name.toLowerCase().includes(nodeSearch.trim().toLowerCase()) && !trippedNodes.includes(n.id)).slice(0, 10)
    : [];

  return (
    <div className="mvnet-panel">
      <button type="button" className="mvnet-close" onClick={onClose}><X size={14} /></button>
      <h3>Feeder trip</h3>
      <div className="mvnet-sub">
        {!anyTripped ? 'Select tripped feeder(s) or substation(s)' : (
          [trippedFeeders.length && `${trippedFeeders.length} feeder${trippedFeeders.length > 1 ? 's' : ''}`,
            trippedNodes.length && `${trippedNodes.length} substation${trippedNodes.length > 1 ? 's' : ''}`]
            .filter(Boolean).join(' + ') + ' tripped'
        )}
      </div>

      <div className="mvnet-seg" style={{ marginBottom: 10 }}>
        <button type="button" className={`mvnet-seg-btn ${tripMode === 'feeder' ? 'is-active' : ''}`} onClick={() => setTripMode('feeder')}>Feeder trip</button>
        <button type="button" className={`mvnet-seg-btn ${tripMode === 'node' ? 'is-active' : ''}`} onClick={() => setTripMode('node')}>Substation trip</button>
      </div>

      {tripMode === 'feeder' ? (
        <>
          {trippedFeeders.map((fid) => {
            const used = trippedFeeders.filter((x) => x !== fid);
            const opts = net.feeders.filter((f) => f.id === fid || !used.includes(f.id));
            return (
              <div className="mvnet-triprow" key={fid}>
                <span className="mvnet-tripdot" />
                <Select value={fid} onChange={(e) => onChangeFeederTrip(fid, e.target.value)}>
                  <option value="">— remove —</option>
                  {opts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </div>
            );
          })}
          {Array.from({ length: pendingRows }).map((_, i) => {
            const opts = net.feeders.filter((f) => !trippedFeeders.includes(f.id));
            return (
              <div className="mvnet-triprow" key={`pending-${i}`}>
                <span className="mvnet-tripdot is-pending" />
                <Select
                  value=""
                  onChange={(e) => { if (e.target.value) { onAddFeederTrip(e.target.value); setPendingRows((n) => Math.max(0, n - 1)); } }}
                >
                  <option value="">— select feeder —</option>
                  {opts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </div>
            );
          })}
          <Button size="sm" variant="outline" onClick={() => setPendingRows((n) => n + 1)} style={{ width: '100%', marginTop: 4 }}>
            + Add another tripped feeder
          </Button>
        </>
      ) : (
        <>
          <div className="mvnet-search-wrap">
            <input
              className="input" placeholder="Search substation to mark tripped…"
              value={nodeSearch} onChange={(e) => setNodeSearch(e.target.value)}
            />
            {searchHits.length > 0 && (
              <div className="mvnet-search-results">
                {searchHits.map((n) => (
                  <button
                    type="button" key={n.id} className="mvnet-search-hit"
                    onClick={() => { onAddNodeTrip(n.id); setNodeSearch(''); }}
                  >
                    <span className="mono">{n.name}</span>
                    <span className="mvnet-sub">{n.type.toUpperCase()}{n.kva ? ` · ${n.kva} kVA` : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {trippedNodes.length === 0
            ? <p className="field-hint" style={{ marginTop: 8 }}>No substations marked tripped</p>
            : trippedNodes.map((id) => {
              const n = net.nodes.find((x) => x.id === id);
              if (!n) return null;
              return (
                <div className="mvnet-triprow" key={id}>
                  <span className="mvnet-tripdot" />
                  <span className="mono" style={{ flex: 1, fontSize: 12.5 }}>{n.name}</span>
                  <button type="button" className="mvnet-brk-del" onClick={() => onRemoveNodeTrip(id)}><X size={13} /></button>
                </div>
              );
            })}
        </>
      )}

      {anyTripped && (
        <div className="mvnet-radrow">
          <span className="mvnet-sub">Radius</span>
          <input type="range" min={20} max={400} step={10} value={tripRadius} onChange={(e) => onRadiusChange(parseInt(e.target.value, 10))} />
          <span className="mono mvnet-sub">{tripRadius} m</span>
        </div>
      )}

      {anyTripped && (
        <>
          <div className="mvnet-ftres">
            <div className="mvnet-fttitle">{dss.length} substation{dss.length === 1 ? '' : 's'} affected</div>
            <div className="mvnet-ftstat"><span>Load affected</span><span>{kva.toLocaleString()} kVA</span></div>
            <div className="mvnet-ftstat"><span>RMUs affected</span><span>{rmuCount}</span></div>
          </div>
          <div className="mvnet-detail-label">Affected substations</div>
          <div className="mvnet-dsslist">
            {dss.length === 0
              ? <p className="field-hint">None</p>
              : dss.map((n) => (
                <button type="button" key={n.id} className="mvnet-dssitem" onClick={() => onZoomNode(n.lat, n.lng)}>
                  <span className="mono">{n.name}</span>
                  <span className="mvnet-sub">{n.kva ? `${n.kva} kVA` : ''}</span>
                </button>
              ))}
          </div>
          <Button variant="primary" onClick={onStartRecovery} style={{ width: '100%', marginTop: 10 }}>Start recovery →</Button>
          <Button onClick={onClearTrip} style={{ width: '100%', marginTop: 6, justifyContent: 'center' }}>Clear all trips</Button>
        </>
      )}
    </div>
  );
}
