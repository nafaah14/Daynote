import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { createMapRenderer } from '../lib/mapRenderer';

/**
 * React shell around the imperative Leaflet renderer. Mounts once via
 * useRef + useEffect and re-renders on every prop change — the renderer
 * itself owns the Leaflet instance and never gets rebuilt for a data change.
 * Exposes zoomTo/setBaseMap imperatively since those are one-shot commands,
 * not state the render loop needs to track.
 */
export const MapView = forwardRef(function MapView({
  net, view, onNodeClick, onCableClick, onMapClick, onNodeDragEnd, onCableVertexChange, initialView,
}, ref) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const callbacksRef = useRef({});
  callbacksRef.current = { onNodeClick, onCableClick, onMapClick, onNodeDragEnd, onCableVertexChange };

  useImperativeHandle(ref, () => ({
    zoomTo: (lat, lng, minZoom) => rendererRef.current?.zoomTo(lat, lng, minZoom),
    setBaseMap: (key) => rendererRef.current?.setBaseMap(key),
  }), []);

  useEffect(() => {
    const renderer = createMapRenderer(containerRef.current, {
      initialView,
      onNodeClick: (n) => callbacksRef.current.onNodeClick?.(n),
      onCableClick: (c) => callbacksRef.current.onCableClick?.(c),
      onMapClick: (latlng) => callbacksRef.current.onMapClick?.(latlng),
      onNodeDragEnd: (n, lat, lng) => callbacksRef.current.onNodeDragEnd?.(n, lat, lng),
      onCableVertexChange: (c) => callbacksRef.current.onCableVertexChange?.(c),
    });
    rendererRef.current = renderer;
    return () => renderer.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.render(net, view);
  }, [net, view]);

  return <div ref={containerRef} className="mvnet-map" />;
});
