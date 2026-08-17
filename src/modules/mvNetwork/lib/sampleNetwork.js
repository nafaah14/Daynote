/**
 * Small hardcoded network for visually verifying electricalModel.js +
 * mapRenderer.js against real geometry, before any persistence/CRUD exists
 * (Phase 1 of the MV Network module build). Loosely modeled on v39's demo
 * loader — one powerhouse, two feeders, a mix of DSS/RMU/connector nodes.
 */
import { uid, DEFAULT_AREAS } from './electricalModel';

function brk(name, state, kind) { return { id: uid('b'), name, state: state || 'ON', kind: kind || 'other' }; }
function dssBrk(earth) {
  const a = [brk('K-IN', 'ON', 'incomer'), brk('K-OUT', 'ON', 'outgoing')];
  if (earth) a.push(brk('ES', 'OFF', 'earth'));
  return a;
}
function phBrk(n) { const a = []; for (let i = 1; i <= n; i++) a.push(brk(`Panel 0${i}`, 'ON', 'outgoing')); return a; }

export function buildSampleNetwork() {
  const zone = 'male';
  const base = DEFAULT_AREAS[0].center;
  const at = (dLat, dLng) => [base[0] + dLat, base[1] + dLng];

  const ph = { id: uid('n'), zone, type: 'plant', name: 'Male Powerhouse', lat: at(0, 0)[0], lng: at(0, 0)[1], kva: '', voltage: '11 kV', notes: '', subtype: '', rotation: 0, sizeScale: 1, breakers: phBrk(2) };

  const mk = (type, name, dLat, dLng, kva, breakers) => ({
    id: uid('n'), zone, type, name, lat: at(dLat, dLng)[0], lng: at(dLat, dLng)[1],
    kva: kva || '', voltage: type === 'dss' ? '11/0.4 kV' : '11 kV', notes: '', subtype: '', rotation: 0, sizeScale: 1,
    breakers: breakers || dssBrk(false), lv0: type === 'dss' ? true : undefined,
  });

  const dss1 = mk('dss', 'DSS 01', 0.006, 0.004, '400');
  const dss2 = mk('dss', 'DSS 02', 0.010, 0.007, '250');
  const dss3 = mk('dss', 'DSS 03', 0.004, -0.006, '315');
  const rmu1 = mk('rmu', 'RMU 01', 0.014, 0.002, '', [brk('SW-IN', 'ON', 'incomer'), brk('SW-OUT', 'ON', 'outgoing')]);
  const conn1 = { id: uid('n'), zone, type: 'connector', name: '', lat: at(0.002, -0.002)[0], lng: at(0.002, -0.002)[1], kva: '', voltage: '', notes: '', subtype: '', rotation: 0, sizeScale: 1, breakers: [] };

  const nodes = [ph, dss1, dss2, dss3, rmu1, conn1];

  const bid = (n, name) => n.breakers.find((b) => b.name === name).id;
  const cab = (name, a, ab, b, bb, points) => ({
    id: uid('c'), zone, name, points: points || [[a.lat, a.lng], [b.lat, b.lng]],
    from: { node: a.id, breakerId: bid(a, ab) }, to: { node: b.id, breakerId: bid(b, bb) },
    size: '', ctype: '', length: '', year: '', notes: '',
  });

  const cables = [
    cab('C-01', ph, 'Panel 01', dss1, 'K-IN', [[ph.lat, ph.lng], [conn1.lat, conn1.lng], [dss1.lat, dss1.lng]]),
    cab('C-02', dss1, 'K-OUT', dss2, 'K-IN'),
    cab('C-03', dss1, 'K-OUT', dss3, 'K-IN'),
    cab('C-04', ph, 'Panel 02', rmu1, 'SW-IN'),
  ];

  const feeders = [
    { id: uid('f'), zone, name: 'Feeder 1', color: '#2b7fd4', sourceNode: ph.id, sourceBreaker: bid(ph, 'Panel 01'), hidden: false },
    { id: uid('f'), zone, name: 'Feeder 2', color: '#1d9e75', sourceNode: ph.id, sourceBreaker: bid(ph, 'Panel 02'), hidden: false },
  ];

  return {
    ver: 3,
    areas: JSON.parse(JSON.stringify(DEFAULT_AREAS)),
    feeders, nodes, cables, switchingLog: [],
  };
}
