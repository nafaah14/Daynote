import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  REGIONS, REGION_KEYS, GREY, unitsOf, outsideUnit, inhabitedCount, industrialCount,
  regionInhabited, regionAtollCount,
} from '../lib/regions';

/**
 * The browsable half: four department cards, then every atoll under each
 * region with its islands as chips, then the places outside the regions.
 *
 * Tapping anything here drives the map rather than navigating — the two
 * halves show one selection, so the screen always reads as a single answer.
 */
function AtollRow({ unit, color, open, onToggle, onFocusUnit, onFocusIsland, selected }) {
  const ref = useRef(null);
  const isSel = selected && selected.unitId === unit.id;
  const ind = industrialCount(unit);

  useEffect(() => {
    if (open && isSel) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [open, isSel]);

  return (
    <div className={`rgn-atoll ${isSel ? 'is-sel' : ''}`} ref={ref} style={{ '--c': color }}>
      <button
        type="button"
        className="rgn-atoll-head"
        aria-expanded={open}
        onClick={() => { onToggle(); if (!open) onFocusUnit(unit.id); }}
      >
        <span className="rgn-code">{unit.code}</span>
        <span className="rgn-atoll-name">
          {unit.name}
          <small>{unit.geo}</small>
        </span>
        <span className="rgn-atoll-n">
          {inhabitedCount(unit)}
          {ind ? <small>+{ind} ind.</small> : null}
        </span>
        <ChevronDown size={14} className={`rgn-caret ${open ? 'is-open' : ''}`} />
      </button>
      {open && (
        <div className="rgn-chips">
          {unit.isl.map((i) => (
            <button
              key={i.n}
              type="button"
              className={`rgn-chip${i.n === unit.cap ? ' is-cap' : ''}${i.t === 'ind' ? ' is-ind' : ''}${selected && selected.unitId === unit.id && selected.island === i.n ? ' is-sel' : ''}`}
              onClick={() => onFocusIsland(unit.id, i.n)}
            >
              {i.n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RegionPanel({
  shown, selected, onFocusRegion, onFocusUnit, onFocusIsland,
}) {
  const [openIds, setOpenIds] = useState([]);
  const out = outsideUnit();

  /* Follow the map: picking a place anywhere opens the atoll holding it, so
     the list never shows a different answer than the card does. */
  useEffect(() => {
    if (selected?.unitId) setOpenIds((cur) => (cur.includes(selected.unitId) ? cur : [...cur, selected.unitId]));
  }, [selected]);

  const toggle = (id) => setOpenIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <>
      <div className="rgn-cards">
        {REGION_KEYS.map((k) => {
          const r = REGIONS[k];
          return (
            <button
              key={k}
              type="button"
              className={`rgn-card ${shown[k] ? '' : 'is-off'}`}
              style={{ '--c': r.color }}
              onClick={() => onFocusRegion(k)}
            >
              <span className="rgn-card-top">
                <span className="rgn-letter">{k}</span>
                <span className="rgn-card-name">{r.name}</span>
              </span>
              <span className="rgn-card-gm">GM <b>{r.gm}</b></span>
              <span className="rgn-card-st">
                {regionAtollCount(k)} atolls · {regionInhabited(k)} inhabited islands
              </span>
            </button>
          );
        })}
      </div>

      {REGION_KEYS.map((k) => (
        <section key={k} className={`rgn-sec ${shown[k] ? '' : 'is-hidden'}`} style={{ '--c': REGIONS[k].color }}>
          <header className="rgn-sec-head">
            <div className="rgn-sec-title">{k} · {REGIONS[k].name}</div>
            <div className="rgn-sec-sub">GM {REGIONS[k].gm} · {regionInhabited(k)} inhabited islands</div>
          </header>
          {unitsOf(k).map((u) => (
            <AtollRow
              key={u.id}
              unit={u}
              color={REGIONS[k].color}
              open={openIds.includes(u.id)}
              onToggle={() => toggle(u.id)}
              onFocusUnit={onFocusUnit}
              onFocusIsland={onFocusIsland}
              selected={selected}
            />
          ))}
        </section>
      ))}

      <section className="rgn-sec" style={{ '--c': GREY }}>
        <header className="rgn-sec-head">
          <div className="rgn-sec-title">Outside the regional departments</div>
          <div className="rgn-sec-sub">Not covered by W, S, D or Y</div>
        </header>
        {out.isl.map((i) => (
          <div key={i.n} className="rgn-outrow">
            <button
              type="button"
              className={`rgn-chip${selected && selected.island === i.n && selected.unitId === out.id ? ' is-sel' : ''}`}
              onClick={() => onFocusIsland(out.id, i.n)}
            >
              {i.n}
            </button>
            <span>{i.owner}</span>
          </div>
        ))}
      </section>

      <details className="rgn-notes">
        <summary>Notes, sources and licence</summary>
        <ul>
          <li>
            Assignments follow STELCO Circular 2026/125 (7 Oct 2026). The scan was partly
            unreadable, so the four region/GM rows were confirmed by hand on 15 Oct 2026 —
            check them against the PDF before quoting them.
          </li>
          <li>
            Coloured areas are drawn around each atoll&apos;s islands. They show who covers
            an atoll and are <b>not official boundaries</b>; neighbouring areas can overlap
            at the edges.
          </li>
          <li>
            Malé, Hulhumalé and Hulhulé sit outside the four regions and are drawn in grey.
            Malé and Hulhumalé each have their own power generation department; Hulhulé
            (Velana airport) is run internally by MACL. Vilimalé is under Region S, as the
            circular states.
          </li>
          <li>
            Only inhabited islands are counted. Industrial and airport islands have a dashed
            outline and are excluded from the counts. Resorts and uninhabited islands are
            not shown.
          </li>
          <li>
            Island positions and Dhivehi names come from the Maldives OneMap island registry
            (2024): dataset © Boolean Private Limited, CC BY 4.0, filtered and corrected
            here; coordinates and Dhivehi names © Maldives Land and Survey Authority, under
            the OneMap Data Usage License. Vilimalé, Malé, Hulhumalé and Fuvahmulah were
            placed by hand, and their Dhivehi spellings still need a Dhivehi reader&apos;s check.
          </li>
          <li>Basemaps: Jawg Maps / OpenStreetMap, Esri World Imagery, OSM Humanitarian.</li>
        </ul>
      </details>
    </>
  );
}
