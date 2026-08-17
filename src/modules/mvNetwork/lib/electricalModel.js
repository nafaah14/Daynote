/**
 * Pure electrical-network logic — energization tracing, feeder-trip impact,
 * and recovery sequencing. Ported from mv-network-manager-v39.html with all
 * DOM/Leaflet/localStorage dependencies stripped: every function takes the
 * network document (`net`) as an explicit argument instead of reading a
 * global `S`, so this file has no side effects and no external state.
 *
 * Network shape:
 *   net = { ver, areas, feeders, nodes, cables, switchingLog }
 *   node:   {id, zone, type:'plant'|'rmu'|'dss'|'connector', name, lat, lng,
 *            kva, voltage, notes, subtype, rotation, lv0,
 *            breakers:[{id, name, state:'ON'|'OFF', kind:'incomer'|'outgoing'|'earth'|'other'}]}
 *   cable:  {id, zone, name, points:[[lat,lng]...], from:{node, breakerId}, to:{node, breakerId},
 *            size, ctype, length, year, notes}
 *   feeder: {id, zone, name, color, sourceNode, sourceBreaker, hidden}
 *   area:   {id, name, center:[lat,lng], zoom}
 */

export const DEFAULT_AREAS = [
  { id: 'male', name: 'Male', center: [4.1755, 73.5093], zoom: 15 },
  { id: 'hulhumale', name: 'Hulhumale', center: [4.2105, 73.5385], zoom: 15 },
];

export const FEEDER_COLORS = [
  '#2b7fd4', '#1d9e75', '#d85a30', '#7f77dd', '#ba7517',
  '#d4537e', '#0f6e56', '#993c1d', '#534ab7', '#185fa5',
];

export const RECOV_COLOR = { out: '#d83c3b', mv: '#e8920c', full: '#1d9e75' };

export const NODE_SIZE_M = { plant: 20, rmu: 10, dss: 13 };

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function freshNetwork() {
  return {
    ver: 3,
    areas: JSON.parse(JSON.stringify(DEFAULT_AREAS)),
    feeders: [], nodes: [], cables: [], switchingLog: [],
  };
}

/** migration chain: v1 (breaker strings) -> v2 (node breakers) -> v3 (areas + breaker kinds) */
export function migrate(s) {
  if (!s) return null;
  if (s.ver !== 2 && s.ver !== 3) {
    s.nodes.forEach((n) => { n.breakers = n.breakers || []; });
    (s.cables || []).forEach((c) => {
      ['from', 'to'].forEach((endK) => {
        const end = c[endK];
        if (end.breakerId !== undefined) return;
        const node = s.nodes.find((n) => n.id === end.node);
        const bname = (end.breaker || '').trim() || `BRK${node ? node.breakers.length + 1 : 1}`;
        let brk = node ? node.breakers.find((b) => b.name === bname) : null;
        if (!brk && node) { brk = { id: uid('b'), name: bname, state: end.state || 'ON' }; node.breakers.push(brk); }
        c[endK] = { node: end.node, breakerId: brk ? brk.id : null };
      });
    });
    (s.feeders || []).forEach((f) => {
      if (f.sourceBreaker && f.sourceNode) {
        const node = s.nodes.find((n) => n.id === f.sourceNode);
        const brk = node ? node.breakers.find((b) => b.name === f.sourceBreaker) : null;
        f.sourceBreaker = brk ? brk.id : '';
      }
    });
    s.ver = 2;
  }
  if (s.ver === 2) {
    s.areas = s.areas || JSON.parse(JSON.stringify(DEFAULT_AREAS));
    s.switchingLog = s.switchingLog || [];
    s.nodes.forEach((n) => {
      n.breakers = n.breakers || [];
      if (n.rotation === undefined) n.rotation = 0;
      n.breakers.forEach((b) => { if (!b.kind) b.kind = 'other'; });
    });
    s.ver = 3;
  }
  s.areas = s.areas && s.areas.length ? s.areas : JSON.parse(JSON.stringify(DEFAULT_AREAS));
  s.nodes.forEach((n) => {
    n.breakers = n.breakers || [];
    if (n.rotation === undefined) n.rotation = 0;
    if (n.sizeScale === undefined) n.sizeScale = 1;
    if (n.type === 'dss' && n.lv0 === undefined) n.lv0 = true;
    n.breakers.forEach((b) => { if (!b.kind) b.kind = 'other'; });
  });
  return s;
}

/* ------------------------------ lookups -------------------------------- */

export const getNode = (net, id) => net.nodes.find((n) => n.id === id);
export const getFeeder = (net, id) => net.feeders.find((f) => f.id === id);
export const getCable = (net, id) => net.cables.find((c) => c.id === id);
export const getBreaker = (net, nodeId, brkId) => {
  const n = getNode(net, nodeId);
  return n ? (n.breakers || []).find((b) => b.id === brkId) : null;
};

/** A Node (type:'connector') is a passive junction — always conductive. */
export function brkState(net, nodeId, brkId) {
  const n = getNode(net, nodeId);
  if (n && n.type === 'connector') return 'ON';
  const b = getBreaker(net, nodeId, brkId);
  return b ? b.state : 'ON';
}

/** Internally still 'ON'/'OFF' — displayed to the user as CLOSED/OPEN. */
export const brkLabel = (state) => (state === 'ON' ? 'CLOSED' : 'OPEN');
export const brkName = (net, nodeId, brkId) => { const b = getBreaker(net, nodeId, brkId); return b ? b.name : '—'; };
export const breakerInUse = (net, brkId) =>
  net.cables.some((c) => c.from.breakerId === brkId || c.to.breakerId === brkId)
  || net.feeders.some((f) => f.sourceBreaker === brkId);

export const zoneFeeders = (net, zone) => net.feeders.filter((f) => f.zone === zone);
export const zoneNodes = (net, zone) => net.nodes.filter((n) => n.zone === zone);
export const zoneCables = (net, zone) => net.cables.filter((c) => c.zone === zone);

export const cableAtBreaker = (net, brkId) => net.cables.find((c) => c.from.breakerId === brkId || c.to.breakerId === brkId);

/** Walk outward from a connector (Node), excluding the cable arrived on, and
 *  collect every real breaker it ultimately reaches — handles connector chains. */
export function breakersThroughConnector(net, connNodeId, excludeCableId, visited = new Set()) {
  if (visited.has(connNodeId)) return [];
  visited.add(connNodeId);
  let found = [];
  net.cables.forEach((c) => {
    if (c.id === excludeCableId) return;
    let otherEnd = null;
    if (c.from.node === connNodeId) otherEnd = c.to;
    else if (c.to.node === connNodeId) otherEnd = c.from;
    else return;
    const on = getNode(net, otherEnd.node);
    if (!on) return;
    if (on.type === 'connector') {
      found = found.concat(breakersThroughConnector(net, on.id, c.id, visited));
    } else {
      const b = getBreaker(net, otherEnd.node, otherEnd.breakerId);
      if (b) found.push({ node: on, brk: b });
    }
  });
  return found;
}

/* ------------------------------ traversal -------------------------------- */

/** Radial energization trace: for each feeder, walk outward from its source
 *  through closed breakers only. Returns which feeder energizes each node/cable. */
export function computeAssignment(net) {
  const nodeF = {}; const cableF = {};
  const cablesByNode = {};
  net.cables.forEach((c) => {
    (cablesByNode[c.from.node] = cablesByNode[c.from.node] || []).push(c);
    (cablesByNode[c.to.node] = cablesByNode[c.to.node] || []).push(c);
  });
  net.feeders.forEach((f) => {
    if (!f.sourceNode || !getNode(net, f.sourceNode)) return;
    const visitedN = new Set([f.sourceNode]);
    const queue = [f.sourceNode];
    while (queue.length) {
      const nid = queue.shift();
      (cablesByNode[nid] || []).forEach((c) => {
        if (brkState(net, c.from.node, c.from.breakerId) !== 'ON') return;
        if (brkState(net, c.to.node, c.to.breakerId) !== 'ON') return;
        if (nid === f.sourceNode && f.sourceBreaker) {
          const endHere = c.from.node === nid ? c.from : c.to;
          if (endHere.breakerId && endHere.breakerId !== f.sourceBreaker) return;
        }
        const other = c.from.node === nid ? c.to.node : c.from.node;
        if (!cableF[c.id]) cableF[c.id] = f.id;
        if (other && !visitedN.has(other)) { visitedN.add(other); queue.push(other); }
      });
    }
    visitedN.forEach((nid) => { if (nid !== f.sourceNode && !nodeF[nid]) nodeF[nid] = f.id; });
  });
  return { nodeF, cableF };
}

export function affectedByTrip(net, feederId) {
  const { nodeF } = computeAssignment(net);
  return net.nodes.filter((n) => nodeF[n.id] === feederId);
}

export const isTripped = (trippedFeeders, fid) => trippedFeeders.indexOf(fid) !== -1;
export const isNodeTripped = (trippedNodes, nid) => trippedNodes.indexOf(nid) !== -1;
export const anyTripped = (trippedFeeders, trippedNodes) => trippedFeeders.length > 0 || trippedNodes.length > 0;

export function allAffectedNodes(net, trippedFeeders, trippedNodes) {
  const { nodeF } = computeAssignment(net);
  const set = new Set();
  net.nodes.forEach((n) => { if (isTripped(trippedFeeders, nodeF[n.id]) || isNodeTripped(trippedNodes, n.id)) set.add(n.id); });
  return net.nodes.filter((n) => set.has(n.id));
}

export function isAffectedNode(net, trippedFeeders, trippedNodes, n) {
  const { nodeF } = computeAssignment(net);
  return isTripped(trippedFeeders, nodeF[n.id]) || isNodeTripped(trippedNodes, n.id);
}

/* ------------------------------ recovery -------------------------------- *
 * Manual tracking, independent of actual breaker states. Each target DSS has
 * a session-tracked MV flag (default off) and LV0 flag (default on). The
 * operator taps to confirm each restoration; no real breaker is operated.
 *   MV off            -> 'out'  (red)
 *   MV on + LV0 off   -> 'mv'   (amber)
 *   MV on + LV0 on    -> 'full' (green)
 * recovery = {active, targets:[nodeId], feederIds:[], feederMV:{feederId:bool},
 *             mv:{nodeId:bool}, lv0:{nodeId:bool}} */

export const recoveryActive = (recovery) => !!(recovery && recovery.active && recovery.targets && recovery.targets.length > 0);

export function recoveryStatus(net, recovery, nodeId) {
  if (!recovery || !recovery.mv) return 'out';
  if (!recovery.mv[nodeId]) return 'out';
  const n = getNode(net, nodeId);
  if (n && n.type === 'rmu') return 'full'; // RMU has no LV0 — restored once MV is on
  return recovery.lv0[nodeId] === false ? 'mv' : 'full';
}

/** Adjacency over cables. If respectOpen, a cable is skipped when either end
 *  breaker is OFF — so traversal follows only the currently-closed radial path. */
export function buildAdjacency(net, respectOpen) {
  const adj = {};
  net.cables.forEach((c) => {
    if (respectOpen) {
      if (brkState(net, c.from.node, c.from.breakerId) !== 'ON') return;
      if (brkState(net, c.to.node, c.to.breakerId) !== 'ON') return;
    }
    (adj[c.from.node] = adj[c.from.node] || []).push({ cableId: c.id, other: c.to.node });
    (adj[c.to.node] = adj[c.to.node] || []).push({ cableId: c.id, other: c.from.node });
  });
  return adj;
}

/** Which feeder a node belongs to physically — the feeder whose source
 *  reaches it in the fewest hops (ignoring breaker states). */
export function physicalFeederOf(net, nodeId) {
  const adj = buildAdjacency(net);
  let bestF = null; let bestD = Infinity;
  net.feeders.forEach((f) => {
    if (!f.sourceNode) return;
    const dist = { [f.sourceNode]: 0 };
    const q = [f.sourceNode];
    while (q.length) {
      const n = q.shift();
      (adj[n] || []).forEach((e) => { if (dist[e.other] === undefined) { dist[e.other] = dist[n] + 1; q.push(e.other); } });
    }
    if (dist[nodeId] !== undefined && dist[nodeId] < bestD) { bestD = dist[nodeId]; bestF = f.id; }
  });
  return bestF;
}

/** Group + order target nodes to match each feeder's real radial connection
 *  order: powerhouse -> DSS -> DSS -> ... Traces over the cable topology
 *  IGNORING the trip (so a tripped feeder breaker doesn't break the trace),
 *  but treats open points as high-cost links so the radial path is preferred
 *  over back-feed ties. */
export function recoveryOrder(net, targetIds) {
  const sourceNodes = new Set(net.feeders.map((f) => f.sourceNode).filter(Boolean));
  function edgeCost(c) {
    const isOpenPoint = (nodeId, br) => br && !sourceNodes.has(nodeId)
      && (br.kind === 'incomer' || br.kind === 'outgoing') && br.state === 'OFF';
    const a = isOpenPoint(c.from.node, getBreaker(net, c.from.node, c.from.breakerId));
    const b = isOpenPoint(c.to.node, getBreaker(net, c.to.node, c.to.breakerId));
    return (a || b) ? 1000 : 1;
  }
  const adjAll = {};
  net.cables.forEach((c) => {
    const w = edgeCost(c);
    (adjAll[c.from.node] = adjAll[c.from.node] || []).push({ other: c.to.node, w, cableId: c.id });
    (adjAll[c.to.node] = adjAll[c.to.node] || []).push({ other: c.from.node, w, cableId: c.id });
  });
  const distByFeeder = {}; const orderByFeeder = {};
  net.feeders.forEach((f) => {
    if (!f.sourceNode) return;
    const dist = { [f.sourceNode]: 0 };
    const visited = new Set();
    for (;;) {
      let u = null; let ud = Infinity;
      Object.keys(dist).forEach((k) => { if (!visited.has(k) && dist[k] < ud) { ud = dist[k]; u = k; } });
      if (u === null) break;
      visited.add(u);
      (adjAll[u] || []).forEach((e) => {
        if (u === f.sourceNode && f.sourceBreaker) {
          const c = getCable(net, e.cableId); const eh = c.from.node === u ? c.from : c.to;
          if (eh.breakerId && eh.breakerId !== f.sourceBreaker) return; // honour source panel
        }
        const nd = ud + e.w;
        if (dist[e.other] === undefined || nd < dist[e.other]) dist[e.other] = nd;
      });
    }
    distByFeeder[f.id] = dist;
    orderByFeeder[f.id] = Object.keys(dist).sort((a, b) => dist[a] - dist[b]);
  });
  const assign = {};
  targetIds.forEach((id) => {
    let bestF = null; let bestD = Infinity;
    net.feeders.forEach((f) => {
      const d = distByFeeder[f.id] ? distByFeeder[f.id][id] : undefined;
      if (d !== undefined && d < bestD) { bestD = d; bestF = f.id; }
    });
    const fid = bestF || '__none__';
    (assign[fid] = assign[fid] || []).push(id);
  });
  const groups = [];
  net.feeders.forEach((f) => {
    const list = assign[f.id];
    if (list && list.length) {
      const seq = orderByFeeder[f.id] || [];
      list.sort((a, b) => seq.indexOf(a) - seq.indexOf(b));
      groups.push({ feederId: f.id, source: f.sourceNode, nodes: list });
    }
  });
  if (assign.__none__) groups.push({ feederId: null, source: null, nodes: assign.__none__ });
  return groups;
}

/** During recovery, a node is recovery-energized if it's a powerhouse with
 *  any feeder MV on, or a target DSS/RMU with its mv flag on. */
export function recovNodeEnergized(net, recovery, nodeId) {
  if (!recoveryActive(recovery)) return false;
  const n = getNode(net, nodeId);
  if (!n) return false;
  if (n.type === 'plant') return !!(recovery.feederMV && Object.values(recovery.feederMV).some((v) => v));
  return !!recovery.mv[nodeId];
}

/** A cable is only energized if the specific breaker it terminates at on
 *  each end is actually closed — checking only the node's overall recovery-MV
 *  flag is wrong whenever a node has more than one breaker (e.g. a normally-
 *  open tie). */
export function recovCableEnergized(net, recovery, c) {
  const fromBrkOpen = brkState(net, c.from.node, c.from.breakerId) === 'OFF';
  const toBrkOpen = brkState(net, c.to.node, c.to.breakerId) === 'OFF';
  if (fromBrkOpen || toBrkOpen) return false;
  return recovNodeEnergized(net, recovery, c.from.node) && recovNodeEnergized(net, recovery, c.to.node);
}

/* ------------------------------ geometry -------------------------------- */

/** Haversine distance in meters — no Leaflet dependency. */
export function distanceMeters(a, b) {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function pathLength(points) {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += distanceMeters(points[i - 1], points[i]);
  return Math.round(m);
}

/** Nearest area by centre distance — only if reasonably close (<8km). */
export function nearestArea(areas, lat, lng) {
  let best = null; let bestD = Infinity;
  areas.forEach((z) => {
    const d = distanceMeters([lat, lng], z.center);
    if (d < bestD) { bestD = d; best = z; }
  });
  return bestD < 8000 ? best : null;
}
