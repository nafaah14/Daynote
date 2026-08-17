import { X } from 'lucide-react';
import { Toggle } from '../../../core/ui/components';
import { baseLayerName, BASE_LAYER_IDS } from '../lib/mapRenderer';

const MARKER_STYLES = [
  { id: '3d', label: '3D blocks' },
  { id: 'flat', label: 'Flat' },
  { id: 'symbol', label: 'Symbol' },
];

/** Map display controls — cable/label/badge visibility, marker style, base
 *  map, and the two size sliders. Device-local (see useViewPrefs), ported
 *  from v39's always-visible sidebar into an on-demand panel. */
export function LayersPanel({ prefs, onChange, onClose }) {
  return (
    <div className="mvnet-panel">
      <button type="button" className="mvnet-close" onClick={onClose}><X size={14} /></button>
      <h3>Map & layers</h3>

      <div className="mvnet-detail-label">Base map</div>
      <div className="mvnet-seg mvnet-seg-wrap">
        {BASE_LAYER_IDS.map((id) => (
          <button key={id} type="button" className={`mvnet-seg-btn ${prefs.baseMap === id ? 'is-active' : ''}`} onClick={() => onChange('baseMap', id)}>
            {baseLayerName(id)}
          </button>
        ))}
      </div>

      <div className="mvnet-detail-label">Map layers</div>
      <div className="mvnet-layerrow">
        <span>Cable routes</span>
        <Toggle checked={prefs.cables} onChange={(v) => onChange('cables', v)} label="Cable routes" />
      </div>
      <div className="mvnet-layerrow">
        <span>Node labels</span>
        <Toggle checked={prefs.labels} onChange={(v) => onChange('labels', v)} label="Node labels" />
      </div>
      <div className="mvnet-seg" style={{ margin: '0 0 10px' }}>
        <button type="button" className={`mvnet-seg-btn ${prefs.labelMode === 'persistent' ? 'is-active' : ''}`} onClick={() => onChange('labelMode', 'persistent')}>Persistent</button>
        <button type="button" className={`mvnet-seg-btn ${prefs.labelMode === 'select' ? 'is-active' : ''}`} onClick={() => onChange('labelMode', 'select')}>Tap to show</button>
      </div>
      <div className="mvnet-layerrow">
        <span>Open points</span>
        <Toggle checked={prefs.openPoints} onChange={(v) => onChange('openPoints', v)} label="Open points" />
      </div>
      <div className="mvnet-layerrow">
        <span>Earthing</span>
        <Toggle checked={prefs.earthing} onChange={(v) => onChange('earthing', v)} label="Earthing" />
      </div>

      <div className="mvnet-detail-label">Marker style</div>
      <div className="mvnet-seg">
        {MARKER_STYLES.map((s) => (
          <button key={s.id} type="button" className={`mvnet-seg-btn ${prefs.markerStyle === s.id ? 'is-active' : ''}`} onClick={() => onChange('markerStyle', s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="mvnet-detail-label">Equipment size — {prefs.sizeScale.toFixed(1)}×</div>
      <input type="range" min={0.3} max={2} step={0.1} value={prefs.sizeScale} onChange={(e) => onChange('sizeScale', parseFloat(e.target.value))} />

      <div className="mvnet-detail-label">Line thickness — {prefs.lineScale.toFixed(1)}×</div>
      <input type="range" min={0.2} max={2} step={0.1} value={prefs.lineScale} onChange={(e) => onChange('lineScale', parseFloat(e.target.value))} />
    </div>
  );
}
