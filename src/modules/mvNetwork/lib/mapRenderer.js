/**
 * Imperative Leaflet wrapper — ported close to v39's render()/icon-builder
 * code, kept imperative rather than rewritten to react-leaflet (the existing
 * logic is already proven). A React shell (components/MapView.jsx) mounts
 * this into a container div via useRef + useEffect and calls `.render(...)`
 * whenever network/view state changes.
 */
import L from 'leaflet';
import { BASE_LAYERS, DEFAULT_BASE_LAYER, setBaseLayer } from '../../../core/map/baseLayers';
import {
  getFeeder, computeAssignment, isTripped, anyTripped, allAffectedNodes,
  isAffectedNode, recoveryActive, recoveryStatus, physicalFeederOf, recovCableEnergized,
  brkState, RECOV_COLOR,
} from './electricalModel';

/* Re-exported so LayersPanel keeps importing its basemap list from the
   renderer it drives, rather than reaching into core itself. */
export { BASE_LAYER_IDS, baseLayerName } from '../../../core/map/baseLayers';

const NODE_SIZE_M = { plant: 20, rmu: 10, dss: 13 };

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function shade(hex, amt) {
  const c = hex.replace('#', ''); const n = parseInt(c, 16);
  let r = (n >> 16) & 255; let g = (n >> 8) & 255; let b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
  g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
  b = Math.max(0, Math.min(255, Math.round(b + 255 * amt)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Style B — shallow isometric: front face + top + right wall. */
function isoBoxB(w, h, color, opts = {}) {
  const front = shade(color, -0.03); const right = shade(color, -0.20); const top = shade(color, 0.18);
  const edge = opts.edge || shade(color, -0.42);
  const dep = Math.max(3, w * 0.42);
  const W = 2 * w + dep + 4; const H = h + dep + 4; const x0 = 2; const topY = 2;
  const pts = (a) => a.map((p) => p.join(',')).join(' ');
  const fL = x0; const fR = x0 + 2 * w; const fT = topY + dep; const fB = fT + h;
  const top4 = [[fL, fT], [fL + dep, topY], [fR + dep, topY], [fR, fT]];
  const right4 = [[fR, fT], [fR + dep, topY], [fR + dep, topY + h], [fR, fB]];
  const cx = (fL + fR) / 2;
  const icon = opts.icon ? `<text x="${cx}" y="${fT + h * 0.64}" font-size="${Math.min(w * 0.95, 15)}" text-anchor="middle" fill="#fff" font-weight="700">${opts.icon}</text>` : '';
  const sel = opts.selected ? `<rect x="${fL - 2}" y="${fT - 2}" width="${2 * w + 4}" height="${h + 4}" fill="none" stroke="#2b7fd4" stroke-width="2.5" rx="2"/>` : '';
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
    <polygon points="${pts(right4)}" fill="${right}" stroke="${edge}" stroke-width="0.8" stroke-linejoin="round"/>
    <polygon points="${pts(top4)}" fill="${top}" stroke="${edge}" stroke-width="0.8" stroke-linejoin="round"/>
    <rect x="${fL}" y="${fT}" width="${2 * w}" height="${h}" fill="${front}" stroke="${edge}" stroke-width="0.8"/>
    ${icon}${sel}</svg>`;
  return { svg, W, H, anchorX: cx, anchorY: fB };
}

/** Style C — flat top-down rounded square footprint. */
function flatBoxC(w, color, opts = {}) {
  const edge = opts.edge || shade(color, -0.34);
  const side = 2 * w; const W = side + 4; const H = side + 4; const r = Math.max(2, w * 0.25);
  const icon = opts.icon ? `<text x="${W / 2}" y="${H / 2 + w * 0.4}" font-size="${Math.min(w, 14)}" text-anchor="middle" fill="#fff" font-weight="700">${opts.icon}</text>` : '';
  const sel = opts.selected ? `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="${r + 2}" fill="none" stroke="#2b7fd4" stroke-width="2.5"/>` : '';
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
    <rect x="2" y="2" width="${side}" height="${side}" rx="${r}" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <rect x="2" y="2" width="${side}" height="${side}" rx="${r}" fill="none" stroke="${edge}" stroke-width="0.8"/>
    ${icon}${sel}</svg>`;
  return { svg, W, H, anchorX: W / 2, anchorY: H / 2 };
}

/** Electrical-symbol style: white card with a single-line IEC-ish symbol. */
function symbolBox(w, color, type, opts = {}) {
  const s = 2 * w; const W = s + 4; const H = s + 4; const r = Math.max(2, w * 0.22);
  const sw = Math.max(1, s * 0.05);
  const sel = opts.selected ? `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="${r + 2}" fill="none" stroke="#2b7fd4" stroke-width="2.5"/>` : '';
  const card = `<rect x="2" y="2" width="${s}" height="${s}" rx="${r}" fill="#fff" stroke="${shade(color, -0.15)}" stroke-width="1.2"/>`;
  const O = 2; const cx = O + s / 2;
  let sym = '';
  if (type === 'plant') {
    const rc = s * 0.26; const cy = O + s * 0.5;
    sym = `<circle cx="${cx}" cy="${cy}" r="${rc}" fill="none" stroke="${color}" stroke-width="${sw}"/>
           <text x="${cx}" y="${cy + s * 0.11}" font-size="${s * 0.34}" font-weight="700" text-anchor="middle" fill="${color}" font-family="Georgia,serif">G</text>`;
  } else if (type === 'rmu') {
    const y = O + s * 0.5;
    sym = `<line x1="${O + s * 0.25}" y1="${y}" x2="${O + s * 0.75}" y2="${y}" stroke="${color}" stroke-width="${sw}"/>
           <circle cx="${O + s * 0.30}" cy="${y}" r="${s * 0.06}" fill="${color}"/>
           <circle cx="${O + s * 0.50}" cy="${y}" r="${s * 0.06}" fill="${color}"/>
           <circle cx="${O + s * 0.70}" cy="${y}" r="${s * 0.06}" fill="${color}"/>`;
  } else {
    const bx = O + s * 0.22; const bw = s * 0.56; const by = O + s * 0.34; const bh = s * 0.40;
    const bush = [bx + bw * 0.22, bx + bw * 0.5, bx + bw * 0.78];
    let bushSVG = '';
    bush.forEach((bcx) => {
      bushSVG += `<line x1="${bcx}" y1="${by - s * 0.12}" x2="${bcx}" y2="${by}" stroke="${color}" stroke-width="${sw * 0.8}"/>
                  <circle cx="${bcx}" cy="${by - s * 0.15}" r="${s * 0.035}" fill="${color}"/>`;
    });
    const footY = by + bh; const fy2 = footY + s * 0.07;
    let feetSVG = '';
    [bx + bw * 0.22, bx + bw * 0.78].forEach((fx) => { feetSVG += `<line x1="${fx}" y1="${footY}" x2="${fx}" y2="${fy2}" stroke="${color}" stroke-width="${sw * 0.8}"/>`; });
    const bcy = by + bh * 0.5; const u = s * 0.13;
    const bolt = `M ${cx + u * 0.4} ${bcy - u} L ${cx - u * 0.5} ${bcy + u * 0.15} L ${cx} ${bcy + u * 0.15} L ${cx - u * 0.4} ${bcy + u} L ${cx + u * 0.5} ${bcy - u * 0.15} L ${cx} ${bcy - u * 0.15} Z`;
    sym = `${bushSVG}<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${s * 0.05}" fill="#fff" stroke="${color}" stroke-width="${sw}"/>${feetSVG}<path d="${bolt}" fill="${color}"/>`;
  }
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">${card}${sym}${sel}</svg>`;
  return { svg, W, H, anchorX: W / 2, anchorY: H / 2 };
}

export function createMapRenderer(container, {
  onNodeClick, onCableClick, onMapClick, onNodeDragEnd, onCableVertexChange, initialView,
} = {}) {
  const map = L.map(container, { zoomControl: false })
    .setView((initialView && initialView.center) || [4.1755, 73.5093], (initialView && initialView.zoom) || 15);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  let baseTileLayer = null;
  let baseMapKey = null;
  function setBaseMap(key) {
    if (!BASE_LAYERS[key]) key = DEFAULT_BASE_LAYER;
    baseTileLayer = setBaseLayer(map, key, baseTileLayer);
    baseMapKey = key;
  }
  setBaseMap(DEFAULT_BASE_LAYER);

  const cableLayer = L.layerGroup().addTo(map);
  const pulseLayer = L.layerGroup().addTo(map);
  const nodeLayer = L.layerGroup().addTo(map);
  const tempLayer = L.layerGroup().addTo(map);

  let lastArgs = null;
  map.on('zoomend', () => { if (lastArgs) doRender(...lastArgs); });
  map.on('click', (e) => onMapClick?.(e.latlng));

  function metersToPixels(meters, lat) {
    const mpp = (40075016.686 * Math.abs(Math.cos((lat * Math.PI) / 180))) / (2 ** (map.getZoom() + 8));
    return meters / mpp;
  }
  function nodePx(n, sizeScale) {
    const perNode = n.sizeScale || 1;
    const base = (NODE_SIZE_M[n.type] || 12) * sizeScale * perNode;
    const px = metersToPixels(base, n.lat);
    return Math.max(2, Math.min(px, 80));
  }
  function cableW(lineScale) {
    const z = map.getZoom();
    const base = z <= 12 ? 1 : z <= 13 ? 1.3 : z <= 14 ? 1.7 : z <= 15 ? 2.1
      : z <= 16 ? 2.6 : z <= 17 ? 3.2 : z <= 18 ? 4 : 4.8;
    return Math.max(0.3, base * lineScale);
  }

  function buildingIcon(n, px, color, dimmed, isSel, isAffected, markerStyle) {
    const op = dimmed ? 0.32 : 1;
    const w = Math.max(4, px * 0.7);
    const edge = isAffected ? shade('#d83c3b', -0.42) : shade(color, -0.42);

    if (n.type === 'dss' && n.subtype === 'open') {
      const side = 2 * w; const pad = shade(color, 0.40); const fence = shade(color, -0.12); const txf = shade(color, -0.04);
      const inner = Math.max(5, side * 0.42);
      const sel = isSel ? 'box-shadow:0 0 0 3px rgba(43,127,212,.55);' : '';
      return L.divIcon({
        className: '', iconSize: [side + 4, side + 4], iconAnchor: [(side + 4) / 2, (side + 4) / 2],
        html: `<div style="position:relative;opacity:${op}">
          <div style="width:${side}px;height:${side}px;background:${pad};border:2px dashed ${fence};border-radius:3px;${sel}"></div>
          <div style="position:absolute;left:${(side - inner) / 2}px;top:${(side - inner) / 2}px;width:${inner}px;height:${inner}px;background:${txf};border:1px solid rgba(255,255,255,.85);border-radius:2px"></div>
        </div>`,
      });
    }

    const icon = n.type === 'plant' ? '⚡' : '';
    let box;
    if (markerStyle === 'symbol') box = symbolBox(w, color, n.type, { selected: isSel });
    else if (markerStyle === 'flat') box = flatBoxC(w, color, { selected: isSel, icon, edge });
    else {
      const heightFactor = n.type === 'plant' ? 1.5 : n.type === 'rmu' ? 0.7 : 1.0;
      const h = Math.max(3, w * heightFactor);
      box = isoBoxB(w, h, color, { selected: isSel, icon, edge });
    }
    const rot = n.rotation ? `transform:rotate(${n.rotation}deg);transform-origin:${box.anchorX}px ${box.anchorY}px;` : '';
    return L.divIcon({
      className: '', iconSize: [box.W, box.H], iconAnchor: [box.anchorX, box.anchorY],
      html: `<div style="opacity:${op};${rot}">${box.svg}</div>`,
    });
  }

  /* ---- draggable cable vertices (move mode) ---- */
  let vertexDragState = null;
  let vertexDragRaf = null;
  function startVertexDrag(ev, cable, index, isInsert) {
    L.DomEvent.stop(ev.originalEvent || ev);
    map.dragging.disable();
    if (isInsert) {
      const ll = ev.latlng || (ev.target && ev.target.getLatLng && ev.target.getLatLng());
      const at = ll ? [ll.lat, ll.lng] : cable.points[index];
      cable.points.splice(index, 0, at.slice ? at.slice() : [at[0], at[1]]);
    }
    vertexDragState = { cable, index };
    const move = (mev) => {
      if (!vertexDragState) return;
      let ll = mev.latlng;
      if (!ll && mev.originalEvent && mev.originalEvent.touches && mev.originalEvent.touches[0]) {
        const t = mev.originalEvent.touches[0];
        const rect = map.getContainer().getBoundingClientRect();
        ll = map.containerPointToLatLng(L.point(t.clientX - rect.left, t.clientY - rect.top));
      }
      if (!ll) return;
      vertexDragState.cable.points[vertexDragState.index] = [ll.lat, ll.lng];
      if (vertexDragRaf) return;
      vertexDragRaf = requestAnimationFrame(() => { vertexDragRaf = null; if (lastArgs) doRender(...lastArgs); });
    };
    const end = () => {
      if (!vertexDragState) return;
      map.off('mousemove', move); map.off('touchmove', move);
      map.off('mouseup', end); map.off('touchend', end);
      map.dragging.enable();
      const { cable: c } = vertexDragState;
      vertexDragState = null;
      onCableVertexChange?.(c);
    };
    map.on('mousemove', move); map.on('touchmove', move);
    map.on('mouseup', end); map.on('touchend', end);
  }

  /* ---- cable draft (draw-cable mode) ---- */
  function drawDraft(points) {
    tempLayer.clearLayers();
    if (!points) return;
    if (points.length > 1) L.polyline(points, { color: '#ba7517', weight: 4, dashArray: '6,5', opacity: 0.85 }).addTo(tempLayer);
    points.forEach((p) => L.circleMarker(p, { radius: 4, color: '#ba7517', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(tempLayer));
  }

  /**
   * Main render pass, mirroring v39's render(). `net` is the whole network
   * document; `view` carries UI/session state that isn't part of the saved
   * document (selection, trip state, recovery session, layer toggles, style).
   */
  function doRender(net, view = {}) {
    lastArgs = [net, view];
    const {
      selected = null, mode = 'view', layersOn = { cables: true, labels: false, openPoints: false, earthing: true },
      labelMode = 'persistent', markerStyle = '3d', sizeScale = 1, lineScale = 1,
      hiddenFeeders = {}, trippedFeeders = [], trippedNodes = [], recovery = null, draft = null,
    } = view;

    const { nodeF, cableF } = computeAssignment(net);
    cableLayer.clearLayers();
    nodeLayer.clearLayers();
    pulseLayer.clearLayers();

    if (layersOn.cables) {
      net.cables.forEach((c) => {
        const fid = cableF[c.id];
        const f = fid ? getFeeder(net, fid) : null;
        const energised = !!f;
        const tripped = isTripped(trippedFeeders, fid);
        if (fid && hiddenFeeders[fid]) return;
        const isSel = selected && selected.kind === 'cable' && selected.id === c.id;
        let color; let opacity; let dash;
        let inRecoveryScope = false; let scopeFeeder = null;
        if (recoveryActive(recovery)) {
          const tgt = new Set(recovery.targets);
          const recovSources = {};
          (recovery.feederIds || []).forEach((rfid) => { const rf = getFeeder(net, rfid); if (rf && rf.sourceNode) recovSources[rf.sourceNode] = rfid; });
          const endIn = (id) => tgt.has(id) || recovSources[id] !== undefined;
          const fromTieOpen = brkState(net, c.from.node, c.from.breakerId) === 'OFF';
          const toTieOpen = brkState(net, c.to.node, c.to.breakerId) === 'OFF';
          if (endIn(c.from.node) && endIn(c.to.node) && !fromTieOpen && !toTieOpen) {
            inRecoveryScope = true;
            scopeFeeder = recovSources[c.from.node] || recovSources[c.to.node] || physicalFeederOf(net, c.from.node);
          }
        }
        if (inRecoveryScope) {
          const recovFeederColor = scopeFeeder && getFeeder(net, scopeFeeder) ? getFeeder(net, scopeFeeder).color : '#1d9e75';
          if (recovCableEnergized(net, recovery, c)) { color = recovFeederColor; opacity = 0.95; dash = null; }
          else { color = '#d83c3b'; opacity = 0.5; dash = '7,6'; }
        } else {
          const dimmed = anyTripped(trippedFeeders, trippedNodes) && !tripped && !recoveryActive(recovery);
          color = f ? f.color : '#9b988e';
          if (tripped) color = '#d83c3b';
          opacity = dimmed ? 0.15 : (energised ? 0.92 : 0.55);
          dash = (tripped || !energised) ? '7,6' : null;
        }
        L.polyline(c.points, { color, weight: isSel ? cableW(lineScale) + 2.5 : cableW(lineScale), opacity, dashArray: dash, interactive: false }).addTo(cableLayer);
        const hit = L.polyline(c.points, { color: '#000', opacity: 0.002, weight: 18 }).addTo(cableLayer);
        hit.on('click', (e) => { L.DomEvent.stopPropagation(e); onCableClick?.(c); });

        if (mode === 'move') {
          for (let vi = 1; vi < c.points.length - 1; vi++) {
            const handle = L.circleMarker(c.points[vi], {
              radius: 6, color: '#13559c', weight: 2, fillColor: '#fff', fillOpacity: 1,
              className: 'cable-vertex', bubblingMouseEvents: false,
            }).addTo(cableLayer);
            handle.on('mousedown', (ev) => startVertexDrag(ev, c, vi, false));
            handle.on('touchstart', (ev) => startVertexDrag(ev, c, vi, false));
            const removeBend = (ev) => {
              L.DomEvent.stop(ev.originalEvent || ev);
              if (c.points.length <= 2) return;
              c.points.splice(vi, 1);
              onCableVertexChange?.(c);
            };
            handle.on('dblclick', removeBend);
            handle.on('contextmenu', removeBend);
          }
          for (let vi = 0; vi < c.points.length - 1; vi++) {
            const a = c.points[vi]; const b = c.points[vi + 1];
            const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            const addH = L.circleMarker(mid, {
              radius: 4, color: '#13559c', weight: 1.5, fillColor: '#cfe0f3', fillOpacity: 0.9,
              className: 'cable-vertex-add', bubblingMouseEvents: false,
            }).addTo(cableLayer);
            addH.on('mousedown', (ev) => startVertexDrag(ev, c, vi + 1, true));
            addH.on('touchstart', (ev) => startVertexDrag(ev, c, vi + 1, true));
          }
        }
      });
    }

    if (recoveryActive(recovery)) {
      const tripRadius = view.tripRadius || 100;
      recovery.targets.forEach((id) => {
        const st = recoveryStatus(net, recovery, id);
        if (st === 'full') return;
        const n = net.nodes.find((x) => x.id === id); if (!n || n.type === 'plant') return;
        const isMv = st === 'mv';
        L.circle([n.lat, n.lng], {
          radius: isMv ? tripRadius * 0.55 : tripRadius, color: isMv ? '#e8920c' : '#d83c3b', weight: 2,
          fillColor: isMv ? '#e8920c' : '#d83c3b', fillOpacity: 0.15, className: 'pulse-circle', interactive: false,
        }).addTo(pulseLayer);
      });
    } else if (anyTripped(trippedFeeders, trippedNodes)) {
      const tripRadius = view.tripRadius || 100;
      allAffectedNodes(net, trippedFeeders, trippedNodes).forEach((n) => {
        if (n.type === 'plant') return;
        L.circle([n.lat, n.lng], {
          radius: tripRadius, color: '#d83c3b', weight: 2, fillColor: '#d83c3b', fillOpacity: 0.15,
          className: 'pulse-circle', interactive: false,
        }).addTo(pulseLayer);
      });
    }

    net.nodes.forEach((n) => {
      const fid = nodeF[n.id];
      const f = fid ? getFeeder(net, fid) : null;
      if (fid && hiddenFeeders[fid] && n.type !== 'plant') return;
      const isAffected = isAffectedNode(net, trippedFeeders, trippedNodes, n);
      const inRecovery = recoveryActive(recovery) && recovery.targets.indexOf(n.id) !== -1;
      const dimmed = (anyTripped(trippedFeeders, trippedNodes) || recoveryActive(recovery)) && !isAffected && !inRecovery && n.type !== 'plant';
      const isSel = selected && selected.kind === 'node' && selected.id === n.id;
      let color = f ? f.color : '#8a8780';
      if (n.type === 'plant') color = '#13559c';
      if (isAffected) color = '#d83c3b';
      if (inRecovery) color = RECOV_COLOR[recoveryStatus(net, recovery, n.id)];
      const px = nodePx(n, sizeScale);
      const z = map.getZoom();
      const autoLabel = z >= 17;
      const isSelectedNode = isSel;
      const showLabel = labelMode === 'select' ? isSelectedNode : (layersOn.labels || autoLabel);
      let marker;
      const canDrag = mode === 'move';

      if (n.type === 'plant' || n.type === 'dss' || n.type === 'rmu') {
        marker = L.marker([n.lat, n.lng], { icon: buildingIcon(n, px, color, dimmed, isSel, isAffected, markerStyle), draggable: canDrag, autoPan: true });
      } else if (n.type === 'connector') {
        const dotPx = Math.max(11, Math.round(px * 0.42));
        const energized = !!fid;
        const dotColor = dimmed ? '#c9c6bd' : (energized ? (f ? f.color : '#6f6b62') : '#9b988e');
        const ring = isSel ? '#185fa5' : '#fff';
        marker = L.marker([n.lat, n.lng], {
          draggable: canDrag, autoPan: true,
          icon: L.divIcon({
            className: '', iconSize: [dotPx, dotPx], iconAnchor: [dotPx / 2, dotPx / 2],
            html: `<div style="width:${dotPx}px;height:${dotPx}px;border-radius:50%;background:${dotColor};border:2px solid ${ring};box-shadow:0 1px 3px rgba(0,0,0,.3);${dimmed ? 'opacity:.5;' : ''}"></div>`,
          }),
        });
      } else {
        marker = L.circleMarker([n.lat, n.lng], { radius: px / 2, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 1 });
      }
      marker.addTo(nodeLayer);
      if (canDrag) {
        marker.on('dragend', (e) => {
          const ll = e.target.getLatLng();
          onNodeDragEnd?.(n, ll.lat, ll.lng);
        });
      }

      let ringStatus = null;
      if (recoveryActive(recovery)) {
        if (recovery.targets.indexOf(n.id) !== -1) {
          const st = recoveryStatus(net, recovery, n.id);
          if (st === 'out' || st === 'mv') ringStatus = st;
        }
      } else if (isAffected && n.type !== 'plant') ringStatus = 'out';
      if (ringStatus && n.type !== 'plant') {
        const amber = ringStatus === 'mv';
        const sz = amber ? 34 : 54;
        L.marker([n.lat, n.lng], {
          icon: L.divIcon({
            className: '', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
            html: `<div class="aff-marker ${amber ? 'amber' : ''}" style="width:${sz}px;height:${sz}px;pointer-events:none"><div class="aff-ring"></div><div class="aff-ring r2"></div></div>`,
          }),
          interactive: false, zIndexOffset: -100,
        }).addTo(nodeLayer);
      }

      const badges = [];
      const earthed = layersOn.earthing && (n.breakers || []).some((b) => b.kind === 'earth' && b.state === 'ON');
      if (earthed) {
        badges.push(`<div class="earth-badge" title="Earthed">
          <svg viewBox="0 0 24 24" width="13" height="13"><line x1="12" y1="3" x2="12" y2="11" stroke="#0a7d3c" stroke-width="2.4"/><line x1="5" y1="11" x2="19" y2="11" stroke="#0a7d3c" stroke-width="2.4"/><line x1="7.5" y1="15" x2="16.5" y2="15" stroke="#0a7d3c" stroke-width="2.4"/><line x1="10" y1="19" x2="14" y2="19" stroke="#0a7d3c" stroke-width="2.4"/></svg>
        </div>`);
      }
      if (layersOn.openPoints && n.type !== 'plant') {
        const openIn = (n.breakers || []).some((b) => b.kind === 'incomer' && b.state === 'OFF');
        const openOut = (n.breakers || []).some((b) => b.kind === 'outgoing' && b.state === 'OFF');
        if (openIn || openOut) {
          const tag = openIn && openOut ? 'I/O' : (openIn ? 'I' : 'O');
          badges.push(`<div class="open-badge" title="Open point (${tag} open)">${tag}</div>`);
        }
      }
      if (badges.length) {
        const gap = px * 0.7 + 6;
        L.marker([n.lat, n.lng], {
          icon: L.divIcon({ className: 'badge-stack-icon', iconSize: [1, 1], iconAnchor: [-gap, 9 * badges.length], html: `<div class="badge-stack">${badges.join('')}</div>` }),
          interactive: false, zIndexOffset: 300,
        }).addTo(nodeLayer);
      }

      if (showLabel && !(n.type === 'connector' && !n.name)) {
        const pos = n.labelPos || 'top';
        const gap = n.type === 'connector' ? 8 : Math.round(px * 0.7 + 4);
        let dir = 'top'; let offset = [0, -gap];
        if (pos === 'bottom') { dir = 'bottom'; offset = [0, gap]; } else if (pos === 'left') { dir = 'left'; offset = [-gap, 0]; } else if (pos === 'right') { dir = 'right'; offset = [gap, 0]; }
        marker.bindTooltip(esc(n.name), { permanent: true, direction: dir, offset, className: `node-label${n.type === 'plant' ? ' plant-label' : ''}` });
      }
      marker.on('click', (e) => { L.DomEvent.stopPropagation(e); onNodeClick?.(n); });
    });

    drawDraft(draft && draft.points);
  }

  return {
    map,
    setBaseMap,
    getBaseMap: () => baseMapKey,
    render: doRender,
    zoomTo(lat, lng, minZoom = 17) { map.setView([lat, lng], Math.max(map.getZoom(), minZoom)); },
    setView(center, zoom) { map.setView(center, zoom); },
    setDragging(on) { if (on) map.dragging.enable(); else map.dragging.disable(); },
    destroy() { map.remove(); },
  };
}
