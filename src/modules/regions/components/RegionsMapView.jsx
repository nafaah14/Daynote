import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { createRegionsRenderer } from '../lib/regionsMap';

/**
 * React shell around the imperative renderer — mounted once, never rebuilt.
 * Same pattern (and the same reasoning) as MV Network's MapView: the
 * renderer owns the Leaflet instance, props drive restyling, and one-shot
 * commands (fly to an island, swap the basemap) go through the ref.
 */
export const RegionsMapView = forwardRef(function RegionsMapView({
  shown, selected, baseMap, onSelect, onStageChange, onReady,
}, ref) {
  const boxRef = useRef(null);
  const rendererRef = useRef(null);
  const cbRef = useRef({});
  cbRef.current = { onSelect, onStageChange, onReady };

  useImperativeHandle(ref, () => ({
    fitAll: (animate) => rendererRef.current?.fitAll(animate),
    focusPoints: (points, pad) => rendererRef.current?.focusPoints(points, pad),
    focusUnit: (unitId) => rendererRef.current?.focusUnit(unitId),
    focusIsland: (unitId, island, zoom) => rendererRef.current?.focusIsland(unitId, island, zoom),
    invalidateSize: () => rendererRef.current?.invalidateSize(),
  }), []);

  useEffect(() => {
    const renderer = createRegionsRenderer(boxRef.current, {
      onSelect: (hit) => cbRef.current.onSelect?.(hit),
      onStageChange: (stage) => cbRef.current.onStageChange?.(stage),
    });
    rendererRef.current = renderer;
    /* Tells the host a NEW map exists, so anything it had already asked of
       the old one (fly to the island in the URL) can be asked again. In
       development React mounts, unmounts and remounts under StrictMode, and
       without this the deep link flew a map that was then thrown away and
       the screen stayed on the whole country. */
    cbRef.current.onReady?.();
    return () => { renderer.destroy(); rendererRef.current = null; };
  }, []);

  useEffect(() => {
    rendererRef.current?.render({ shown, selected });
  }, [shown, selected]);

  useEffect(() => {
    rendererRef.current?.setBaseMap(baseMap);
  }, [baseMap]);

  return <div ref={boxRef} className="rgn-map" />;
});
