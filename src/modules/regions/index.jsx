import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Map as MapIcon, Layers, Maximize, Search, X, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Popover } from '../../core/ui/extras';
import { BASE_LAYER_IDS, baseLayerShortName } from '../../core/map/baseLayers';
import { RegionsMapView } from './components/RegionsMapView';
import { RegionPanel } from './components/RegionPanel';
import { PlaceDetail } from './components/PlaceDetail';
import { useRegionsPrefs } from './state/useRegionsPrefs';
import { REGIONS, REGION_KEYS, searchPlaces, unitById, unitsOf } from './lib/regions';
import './regions.css';

const STAGE_HINT = {
  atolls: 'Zoom in to see the islands',
  dots: 'Zoom in further for island names',
};

/**
 * Which STELCO regional department — and which General Manager — covers an
 * atoll or an island.
 *
 * Ported from the standalone STELCO Regional Departments map (v2.2.0) onto
 * Daybook's shell: the same data and the same zoom-stage map, now on the
 * module's basemaps (core/map/baseLayers, shared with MV Network), themed
 * with Daybook's tokens, and with the GM resolved against Directory instead
 * of being a dead name on a card.
 *
 * Full-screen rather than living in the scrolling `.content` column — same
 * call as MV Network: a map wants the whole viewport.
 */
function RegionsScreen() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const mapRef = useRef(null);
  const { prefs, setPref, toggleRegion, ensureShown } = useRegionsPrefs();

  const [selected, setSelected] = useState(null);   // { unitId, island|null }
  const [stage, setStage] = useState('atolls');
  const [mapGeneration, setMapGeneration] = useState(0);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);

  const hits = useMemo(() => (q.trim() ? searchPlaces(q, 10) : []), [q]);

  const pick = (unitId, island) => {
    const u = unitById(unitId);
    if (!u) return;
    ensureShown(u.reg);
    setSelected({ unitId, island: island || null });
    if (island) mapRef.current?.focusIsland(unitId, island);
    else mapRef.current?.focusUnit(unitId);
    setListsOpen(false);
  };

  /**
   * Deep link from global search: /regions?u=Th&i=Veymandoo.
   *
   * Consumed once through a ref rather than by clearing the params — the
   * same trap Directory hit with ?view=, where rewriting the URL re-ran the
   * effect and fought the user's next tap. The map's generation is part of
   * the key, so a remounted map is flown again instead of being left on the
   * whole country.
   */
  const consumed = useRef(null);
  useEffect(() => {
    const key = `${mapGeneration}:${params.get('u') || ''}:${params.get('i') || ''}`;
    if (!params.get('u') || consumed.current === key) return;
    consumed.current = key;
    pick(params.get('u'), params.get('i'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, mapGeneration]);

  /** Frame everything one department covers, rather than one atoll of it. */
  const focusRegion = (k) => {
    ensureShown(k);
    setSelected(null);
    mapRef.current?.focusPoints(unitsOf(k).flatMap((u) => u.isl.map((i) => [i.lat, i.lon])));
    setListsOpen(false);
  };

  return (
    <div className="rgn-page">
      <div className="rgn-toolbar">
        <button type="button" className="rgn-btn" onClick={() => nav('/')} aria-label="Back to Daybook">
          <ArrowLeft size={14} />
        </button>
        <div className="rgn-title">
          <b>Regional departments</b>
          <small>Circular 2026/125</small>
        </div>

        <div className="rgn-search">
          <Search size={14} />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setSearching(true); }}
            onFocus={() => setSearching(true)}
            placeholder="Find an island or atoll…"
            aria-label="Find an island or atoll"
            autoComplete="off"
          />
          {q && (
            <button type="button" className="rgn-search-clear" onClick={() => { setQ(''); setSearching(false); }} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
          {searching && q.trim() && (
            <div className="rgn-results">
              {hits.length === 0 && <div className="rgn-result-empty">No match</div>}
              {hits.map((h) => (
                <button
                  key={h.key}
                  type="button"
                  style={{ '--c': h.color }}
                  onClick={() => { setQ(h.label); setSearching(false); pick(h.unitId, h.island); }}
                >
                  <b>{h.label}</b> <small>{h.sub}</small>
                  <small className="rgn-result-detail">{h.detail}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rgn-ticks" role="group" aria-label="Regions to show">
          {REGION_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`rgn-tick ${prefs.shown[k] ? 'is-on' : ''}`}
              style={{ '--c': REGIONS[k].color }}
              aria-pressed={!!prefs.shown[k]}
              title={`${REGIONS[k].name} · ${REGIONS[k].gm}`}
              onClick={() => toggleRegion(k)}
            >
              {k}
            </button>
          ))}
        </div>

        <Popover icon={Layers} label="Base map" align="right">
          <div className="rgn-pop-label">Base map</div>
          {BASE_LAYER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`rgn-pop-item ${prefs.baseMap === id ? 'is-active' : ''}`}
              onClick={() => setPref('baseMap', id)}
            >
              {baseLayerShortName(id)}
            </button>
          ))}
        </Popover>

        <button type="button" className="rgn-btn" onClick={() => mapRef.current?.fitAll()} title="Show the whole country">
          <Maximize size={14} /> All
        </button>
        <button
          type="button"
          className={`rgn-btn rgn-lists-btn ${listsOpen ? 'is-active' : ''}`}
          onClick={() => setListsOpen((v) => !v)}
        >
          {listsOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />} Lists
        </button>
      </div>

      <div className="rgn-body">
        <div className="rgn-map-wrap">
          <RegionsMapView
            ref={mapRef}
            shown={prefs.shown}
            selected={selected}
            baseMap={prefs.baseMap}
            onSelect={(hit) => setSelected(hit)}
            onStageChange={setStage}
            onReady={() => setMapGeneration((n) => n + 1)}
          />
          {STAGE_HINT[stage] && <div className="rgn-hint">{STAGE_HINT[stage]}</div>}
          {selected && (
            <PlaceDetail
              selected={selected}
              onClose={() => setSelected(null)}
              onZoom={() => (selected.island
                ? mapRef.current?.focusIsland(selected.unitId, selected.island, 15)
                : mapRef.current?.focusUnit(selected.unitId))}
            />
          )}
        </div>

        <aside className={`rgn-side ${listsOpen ? 'is-open' : ''}`}>
          <RegionPanel
            shown={prefs.shown}
            selected={selected}
            onFocusRegion={focusRegion}
            onFocusUnit={(id) => pick(id, null)}
            onFocusIsland={(id, island) => pick(id, island)}
          />
        </aside>
      </div>
    </div>
  );
}

export default {
  id: 'regions',
  title: 'Regions',
  icon: MapIcon,
  accent: 'var(--accent-regions)',
  tier: 'integrated',
  routes: [{ path: '/regions', element: <RegionsScreen /> }],

  renderRef: (record) => <span className="ref-chip">{record.title}</span>,

  /**
   * Islands and atolls in global search, so "Veymandoo" from anywhere in
   * Daybook lands on the map with the answer open. Static data, so the repo
   * is unused — which is also why this can't go stale.
   */
  search: (ctx, term) => searchPlaces(term, 8).map((h) => ({
    id: `regions:${h.key}`,
    title: h.label,
    sub: [h.sub, h.detail].filter(Boolean).join(' · '),
    to: `/regions?u=${encodeURIComponent(h.unitId)}${h.island ? `&i=${encodeURIComponent(h.island)}` : ''}`,
  })),

  quickActions: [{ id: 'who-covers', label: 'Who covers an island?', icon: MapIcon, to: '/regions' }],
};
