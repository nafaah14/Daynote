import { useCallback, useEffect, useState } from 'react';
import { freshNetwork, migrate, uid } from '../lib/electricalModel';

const STORAGE_KEY = 'daybook.mvNetwork.network';

/**
 * Local-first persistence for the network document — localStorage only for
 * now (Phase 2). Cloud backup-on-demand comes later; this hook's shape
 * (one `net` document + mutator functions) is what that phase will wrap.
 */
function loadNetwork() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshNetwork();
    return migrate(JSON.parse(raw)) || freshNetwork();
  } catch {
    return freshNetwork();
  }
}

export function useMvNetworkState() {
  const [net, setNet] = useState(loadNetwork);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(net));
  }, [net]);

  const addNode = useCallback((node) => {
    const rec = { id: uid('n'), breakers: [], rotation: 0, sizeScale: 1, ...node };
    setNet((cur) => ({ ...cur, nodes: [...cur.nodes, rec] }));
    return rec;
  }, []);

  const updateNode = useCallback((id, patch) => {
    setNet((cur) => ({ ...cur, nodes: cur.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  }, []);

  /** Also detaches the node's cable ends and any feeder sourced from it, mirroring v39. */
  const deleteNode = useCallback((id) => {
    setNet((cur) => ({
      ...cur,
      nodes: cur.nodes.filter((n) => n.id !== id),
      feeders: cur.feeders.map((f) => (f.sourceNode === id ? { ...f, sourceNode: null, sourceBreaker: '' } : f)),
    }));
  }, []);

  /** Moves a node and re-pins whichever cable endpoints were anchored to it. */
  const moveNode = useCallback((id, lat, lng) => {
    setNet((cur) => ({
      ...cur,
      nodes: cur.nodes.map((n) => (n.id === id ? { ...n, lat, lng } : n)),
      cables: cur.cables.map((c) => {
        if (c.from.node !== id && c.to.node !== id) return c;
        const points = c.points.map((p) => p.slice());
        if (c.from.node === id) points[0] = [lat, lng];
        if (c.to.node === id) points[points.length - 1] = [lat, lng];
        return { ...c, points };
      }),
    }));
  }, []);

  const addBreaker = useCallback((nodeId, breaker) => {
    setNet((cur) => ({
      ...cur,
      nodes: cur.nodes.map((n) => (n.id === nodeId ? { ...n, breakers: [...(n.breakers || []), breaker] } : n)),
    }));
  }, []);

  const toggleBreaker = useCallback((nodeId, brkId) => {
    setNet((cur) => ({
      ...cur,
      nodes: cur.nodes.map((n) => (n.id !== nodeId ? n : {
        ...n,
        breakers: (n.breakers || []).map((b) => (b.id === brkId ? { ...b, state: b.state === 'ON' ? 'OFF' : 'ON' } : b)),
      })),
    }));
  }, []);

  const toggleLv0 = useCallback((nodeId) => {
    setNet((cur) => ({
      ...cur,
      nodes: cur.nodes.map((n) => (n.id === nodeId ? { ...n, lv0: n.lv0 === false ? true : false } : n)),
    }));
  }, []);

  const addCable = useCallback((cable) => {
    const rec = { id: uid('c'), ...cable };
    setNet((cur) => ({ ...cur, cables: [...cur.cables, rec] }));
    return rec;
  }, []);

  const updateCable = useCallback((id, patch) => {
    setNet((cur) => ({ ...cur, cables: cur.cables.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  }, []);

  const updateCablePoints = useCallback((id, points) => {
    setNet((cur) => ({ ...cur, cables: cur.cables.map((c) => (c.id === id ? { ...c, points } : c)) }));
  }, []);

  const deleteCable = useCallback((id) => {
    setNet((cur) => ({ ...cur, cables: cur.cables.filter((c) => c.id !== id) }));
  }, []);

  const addFeeder = useCallback((feeder) => {
    const rec = { id: uid('f'), ...feeder };
    setNet((cur) => ({ ...cur, feeders: [...cur.feeders, rec] }));
    return rec;
  }, []);

  const updateFeeder = useCallback((id, patch) => {
    setNet((cur) => ({ ...cur, feeders: cur.feeders.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  }, []);

  const deleteFeeder = useCallback((id) => {
    setNet((cur) => ({ ...cur, feeders: cur.feeders.filter((f) => f.id !== id) }));
  }, []);

  return {
    net, setNet,
    addNode, updateNode, deleteNode, moveNode,
    addBreaker, toggleBreaker, toggleLv0,
    addCable, updateCable, updateCablePoints, deleteCable,
    addFeeder, updateFeeder, deleteFeeder,
  };
}
