/**
 * Imperative Leaflet renderer for the regions map — same shape as MV
 * Network's (components/RegionsMapView.jsx mounts it once into a div and
 * calls .render() on state changes), because a map with ~200 markers should
 * never be rebuilt by React on every prop change. Layers are built once, at
 * construction; render() only restyles them.
 *
 * What the zoom stages are for: at country scale, 189 dots is noise and what
 * you actually want is "which colour covers this atoll", so only the atoll
 * areas and their labels draw. Zoom in and dots appear, then names, then the
 * dot opens into a ring around the island, and finally the ring disappears
 * so the satellite image of the island itself is unobstructed.
 */
import L from 'leaflet';
import { DEFAULT_BASE_LAYER, isImagery, setBaseLayer } from '../../../core/map/baseLayers';
import { UNITS, REGIONS, colorOf, unitById, islandIn } from './regions';

/** Leaflet zoom levels at which each stage starts. */
export const Z_DOTS = 9;
export const Z_NAMES = 10.5;
export const Z_RING = 12.5;
export const Z_CLEAR = 14.5;

const FIT = { paddingTopLeft: [12, 16], paddingBottomRight: [12, 44] };

const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createRegionsRenderer(container, { onSelect, onStageChange } = {}) {
  const map = L.map(container, { zoomSnap: 0.25, minZoom: 5, maxZoom: 18, zoomControl: false });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.createPane('hulls').style.zIndex = 380;

  let baseKey = DEFAULT_BASE_LAYER;
  let baseTile = setBaseLayer(map, baseKey, null);

  /* ---- build every layer once ---- */
  const allBounds = L.latLngBounds([]);
  const hulls = [];          // atoll coverage areas
  const atollLabels = [];    // code + name, shown only when zoomed out
  const markers = [];        // one per inhabited / industrial island

  UNITS.forEach((u) => {
    const c = colorOf(u.reg);
    if (u.hull) {
      const poly = L.polygon(u.hull, { pane: 'hulls' });
      poly.bindTooltip(
        `<b>${esc(u.name)}</b> (${esc(u.code)})<br>${u.reg
          ? `Region ${u.reg} · ${esc(REGIONS[u.reg].gm)}`
          : 'Outside the regional departments'}`,
        { sticky: true, className: 'rgn-tip' },
      );
      poly.on('click', (e) => {
        // A click on a path bubbles on to the map, whose own handler clears
        // the selection — so without this an atoll opened and shut again in
        // the same tap.
        L.DomEvent.stopPropagation(e);
        onSelect?.({ unitId: u.id, island: null });
      });
      poly.addTo(map);
      poly._reg = u.reg;
      hulls.push(poly);
      allBounds.extend(poly.getBounds());

      const label = L.marker(u.center, {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'rgn-alabel',
          iconSize: null,
          html: `<div style="--c:${c}"><span class="c">${esc(u.code)}</span><span class="n">${esc(u.name)}</span></div>`,
        }),
      });
      label._reg = u.reg;
      atollLabels.push(label);
    }

    u.isl.forEach((i) => {
      const m = L.circleMarker([i.lat, i.lon], { radius: 5 });
      m.bindTooltip(esc(i.n), {
        permanent: true, direction: 'right', offset: [8, 0],
        className: `rgn-ilab${i.n === u.cap ? ' is-cap' : ''}`,
      });
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelect?.({ unitId: u.id, island: i.n });
      });
      Object.assign(m, { _unit: u.id, _name: i.n, _reg: u.reg, _cap: i.n === u.cap, _ind: i.t === 'ind', _c: c });
      allBounds.extend(m.getLatLng());
      markers.push(m);
    });
  });

  /* The selected place's halo. One reused layer rather than restyling the
     marker itself, so the dot keeps its zoom-stage styling underneath. */
  const halo = L.circleMarker([0, 0], {
    radius: 16, color: '#fff', weight: 3, opacity: 0.95,
    fillColor: '#000', fillOpacity: 0.08, interactive: false, className: 'rgn-halo',
  });

  let state = { shown: { W: true, S: true, D: true, Y: true }, selected: null };
  let stage = null;

  const isShown = (reg) => (reg ? state.shown[reg] !== false : true); // outside the regions: always on

  /** The single place that decides what is drawn at the current zoom. */
  function paint() {
    const z = map.getZoom();
    const imagery = isImagery(baseKey);

    container.classList.toggle('is-zlo', z < 7.5);
    container.classList.toggle('is-names', z >= Z_NAMES);

    hulls.forEach((h) => {
      const on = isShown(h._reg);
      const c = colorOf(h._reg);
      const fill = !on ? 0.04
        : z >= 12 ? 0
          : z >= Z_NAMES ? 0.07
            : z >= Z_DOTS ? 0.15
              : (imagery ? 0.32 : 0.26);
      h.setStyle({
        color: c, fillColor: c, fillOpacity: fill,
        weight: on ? (z >= 12 ? 1.5 : 2) : 1,
        opacity: on ? (z >= 12 ? 0.7 : 0.95) : 0.3,
        dashArray: z >= 12 ? '6 6' : null,
      });
    });

    atollLabels.forEach((l) => {
      const want = isShown(l._reg) && z < Z_NAMES;
      if (want && !map.hasLayer(l)) l.addTo(map);
      if (!want && map.hasLayer(l)) map.removeLayer(l);
    });

    const sel = state.selected;
    markers.forEach((m) => {
      const want = isShown(m._reg) && (z >= Z_DOTS || isSelected(m));
      if (!want) { if (map.hasLayer(m)) map.removeLayer(m); return; }
      if (!map.hasLayer(m)) m.addTo(map);

      // Fully zoomed in the name moves above the island, so the label never
      // covers the thing you zoomed in to look at.
      const far = z >= Z_CLEAR;
      const tip = m.getTooltip();
      if (tip && m._far !== far) {
        m._far = far;
        tip.options.direction = far ? 'top' : 'right';
        tip.options.offset = far ? [0, -34] : [8, 0];
      }
      // ...and unconditionally re-place it: a permanent tooltip only
      // repositions itself on zoom, so after flying between two islands at
      // the same zoom every name stayed pinned where the previous island's
      // dot used to be, while the dots themselves moved correctly.
      if (tip && tip._map) tip.update();

      if (z >= Z_CLEAR) {
        m.setStyle({ radius: 14, opacity: 0, fillOpacity: 0.01, dashArray: null });
      } else if (z >= Z_RING) {
        m.setStyle({
          radius: 12, color: m._c, weight: m._cap ? 3 : 2,
          opacity: 0.95, fillOpacity: 0.01, dashArray: m._ind ? '4 3' : null,
        });
      } else {
        const r = (m._cap ? 6 : 4.5) * (z >= Z_NAMES ? 1.15 : 1);
        m.setStyle({
          radius: r,
          color: m._cap ? '#111' : (m._ind ? m._c : '#fff'),
          weight: m._cap ? 2.5 : 1.5,
          opacity: 1,
          fillColor: m._ind ? '#fff' : m._c,
          fillOpacity: 1,
          dashArray: m._ind ? '2 2' : null,
        });
      }
    });

    const selMarker = sel && sel.island ? markerFor(sel.unitId, sel.island) : null;
    if (selMarker) {
      halo.setLatLng(selMarker.getLatLng());
      halo.setStyle({ color: selMarker._c, radius: z >= Z_RING ? 20 : 13 });
      if (!map.hasLayer(halo)) halo.addTo(map);
    } else if (map.hasLayer(halo)) {
      map.removeLayer(halo);
    }

    const next = z < Z_DOTS ? 'atolls' : z < Z_NAMES ? 'dots' : z < Z_RING ? 'names' : 'close';
    if (next !== stage) { stage = next; onStageChange?.(stage); }
  }

  const isSelected = (m) => !!(state.selected && state.selected.island === m._name
    && state.selected.unitId === m._unit);

  const markerFor = (unitId, island) => markers.find((m) => m._unit === unitId && m._name === island) || null;

  /* Both events, not just zoomend: flying between two islands at the same
     zoom is a pan, which fires no zoomend — and the dots and their labels
     were left drawn at the old island's screen position until the next zoom
     forced a repaint. Painting on moveend restyles every marker, which is
     what flushes the vector layer. */
  map.on('zoomend', paint);
  map.on('moveend', paint);
  map.on('click', () => onSelect?.(null));

  map.fitBounds(allBounds, FIT);
  paint();

  /* A map laid out in a flex row renders at the wrong size whenever its box
     changes without the window changing — opening the side panel, rotating a
     phone, the toolbar wrapping to two rows. Leaflet only listens for window
     resize, so watch the container itself. */
  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => map.invalidateSize())
    : null;
  ro?.observe(container);

  return {
    map,
    render(next) {
      state = { ...state, ...next };
      paint();
    },
    setBaseMap(key) {
      if (key === baseKey) return;
      baseKey = key;
      baseTile = setBaseLayer(map, key, baseTile);
      paint();
    },
    fitAll(animate = true) {
      if (animate) map.flyToBounds(allBounds, { ...FIT, duration: 0.8 });
      else map.fitBounds(allBounds, FIT);
    },
    /** Frame an arbitrary set of points — used to fly to a whole region. */
    focusPoints(points, pad = 0.08) {
      if (!points || !points.length) return;
      map.flyToBounds(L.latLngBounds(points).pad(pad), { ...FIT, duration: 0.8 });
    },
    /** Frame one atoll / city, capped so a single-island unit doesn't slam to max zoom. */
    focusUnit(unitId) {
      const u = unitById(unitId);
      if (!u || !u.isl.length) return;
      const bb = L.latLngBounds(u.isl.map((i) => [i.lat, i.lon]));
      map.flyToBounds(bb.pad(0.15), { maxZoom: 12, duration: 0.8 });
    },
    focusIsland(unitId, island, zoom = 14) {
      const u = unitById(unitId);
      const i = u && islandIn(u, island);
      if (!i) return;
      map.flyTo([i.lat, i.lon], zoom, { duration: 0.9 });
    },
    invalidateSize() { map.invalidateSize(); },
    destroy() {
      ro?.disconnect();
      map.remove();
    },
  };
}
