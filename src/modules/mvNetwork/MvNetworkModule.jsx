import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, MousePointer2, Move, Factory, Square, CircleDot, Dot, Waypoints, ArrowLeft,
} from 'lucide-react';
import { MapView } from './components/MapView';
import { NodeSheet } from './components/NodeSheet';
import { CableSheet } from './components/CableSheet';
import { FeederSheet } from './components/FeederSheet';
import { FeederListSheet } from './components/FeederListSheet';
import { NodeDetail, CableDetail } from './components/DetailPanel';
import { useMvNetworkState } from './state/useMvNetworkState';
import { computeAssignment, breakerInUse } from './lib/electricalModel';
import './mvNetwork.css';

const MODES = [
  { id: 'view', label: 'Select', icon: MousePointer2 },
  { id: 'add-plant', label: 'Powerhouse', icon: Factory },
  { id: 'add-rmu', label: 'RMU', icon: Square },
  { id: 'add-dss', label: 'DSS', icon: CircleDot },
  { id: 'add-connector', label: 'Node', icon: Dot },
  { id: 'draw-cable', label: 'Cable', icon: Waypoints },
  { id: 'move', label: 'Move', icon: Move },
];

const HINTS = {
  'add-plant': 'Tap the map to place a powerhouse / grid station',
  'add-rmu': 'Tap the map to place an RMU',
  'add-dss': 'Tap the map to place a DSS',
  'add-connector': 'Tap the map to drop a Node (cable junction)',
  'draw-cable': 'Tap a node to start the cable, tap along the route, tap another node to finish',
  move: 'Drag equipment or cable bends · drag a faint dot to add a bend',
};

/**
 * Phase 2: local state (localStorage) + equipment CRUD + cable drawing —
 * functional parity with v39 minus the multi-user/live-sync pieces. The
 * electrical model and map renderer are unchanged from Phase 1.
 */
function MvNetworkScreen() {
  const nav = useNavigate();
  const mv = useMvNetworkState();
  const { net } = mv;
  const mapRef = useRef(null);

  const [mode, setMode] = useState('view');
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null); // {points, fromNode}
  const [trippedFeeders, setTrippedFeeders] = useState([]);

  const [nodeSheet, setNodeSheet] = useState(null); // {node, type, latlng}
  const [cableSheet, setCableSheet] = useState(null); // {cable, draft}
  const [feederSheet, setFeederSheet] = useState(null); // {feeder}
  const [feederListOpen, setFeederListOpen] = useState(false);

  const changeMode = (m) => { setMode(m); setDraft(null); };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') changeMode('view'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = useMemo(() => ({
    selected, mode,
    layersOn: { cables: true, labels: false, openPoints: true, earthing: true },
    labelMode: 'persistent', markerStyle: '3d', sizeScale: 1, lineScale: 1,
    hiddenFeeders: {}, trippedFeeders, trippedNodes: [], recovery: null, draft,
  }), [selected, mode, trippedFeeders, draft]);

  const selectedNode = selected?.kind === 'node' ? net.nodes.find((n) => n.id === selected.id) : null;
  const selectedCable = selected?.kind === 'cable' ? net.cables.find((c) => c.id === selected.id) : null;

  const dssCountByFeeder = useMemo(() => {
    const { nodeF } = computeAssignment(net);
    const counts = {};
    net.nodes.forEach((n) => { if (n.type === 'dss' && nodeF[n.id]) counts[nodeF[n.id]] = (counts[nodeF[n.id]] || 0) + 1; });
    return counts;
  }, [net]);

  /* ------------------------------ map events ------------------------------ */

  const handleNodeClick = (n) => {
    if (mode === 'draw-cable') {
      if (!draft) { setDraft({ points: [[n.lat, n.lng]], fromNode: n.id }); return; }
      if (n.id !== draft.fromNode) {
        const points = [...draft.points, [n.lat, n.lng]];
        setDraft(null); setMode('view');
        setCableSheet({ cable: null, draft: { points, fromNode: draft.fromNode, toNode: n.id } });
      }
      return;
    }
    setSelected({ kind: 'node', id: n.id });
  };

  const handleCableClick = (c) => {
    if (mode !== 'view') return;
    setSelected({ kind: 'cable', id: c.id });
  };

  const handleMapClick = (latlng) => {
    if (mode === 'add-plant' || mode === 'add-rmu' || mode === 'add-dss') {
      setNodeSheet({ node: null, type: mode.replace('add-', ''), latlng });
      return;
    }
    if (mode === 'add-connector') {
      const rec = mv.addNode({
        zone: 'male', type: 'connector', name: '', lat: latlng.lat, lng: latlng.lng,
        kva: '', voltage: '', notes: '', subtype: '', rotation: 0, sizeScale: 1, breakers: [],
      });
      setSelected({ kind: 'node', id: rec.id });
      setMode('view');
      return;
    }
    if (mode === 'draw-cable' && draft) {
      setDraft((cur) => ({ ...cur, points: [...cur.points, [latlng.lat, latlng.lng]] }));
      return;
    }
    if (mode === 'view') setSelected(null);
  };

  const handleNodeDragEnd = (n, lat, lng) => mv.moveNode(n.id, lat, lng);
  const handleCableVertexChange = (c) => mv.updateCablePoints(c.id, c.points);

  /* -------------------------------- sheets -------------------------------- */

  const saveNode = (data) => {
    if (nodeSheet.node) mv.updateNode(nodeSheet.node.id, data);
    else {
      const rec = mv.addNode({ zone: 'male', type: nodeSheet.type, lat: nodeSheet.latlng.lat, lng: nodeSheet.latlng.lng, ...data });
      setSelected({ kind: 'node', id: rec.id });
    }
    setNodeSheet(null); setMode('view');
  };
  const deleteNode = () => {
    if (!window.confirm(`Delete ${nodeSheet.node.name}?`)) return;
    mv.deleteNode(nodeSheet.node.id);
    setSelected(null); setNodeSheet(null);
  };

  const saveCable = (data) => {
    data.newBreakers.forEach(({ nodeId, breaker }) => mv.addBreaker(nodeId, breaker));
    const { newBreakers: _newBreakers, fromBreakerId, toBreakerId, ...rest } = data;
    if (cableSheet.cable) {
      mv.updateCable(cableSheet.cable.id, {
        ...rest,
        from: { ...cableSheet.cable.from, breakerId: fromBreakerId },
        to: { ...cableSheet.cable.to, breakerId: toBreakerId },
      });
    } else {
      const { points, fromNode, toNode } = cableSheet.draft;
      const rec = mv.addCable({
        zone: 'male', points,
        from: { node: fromNode, breakerId: fromBreakerId },
        to: { node: toNode, breakerId: toBreakerId },
        ...rest,
      });
      setSelected({ kind: 'cable', id: rec.id });
    }
    setCableSheet(null);
  };
  const deleteCable = () => {
    if (!window.confirm('Delete this cable?')) return;
    mv.deleteCable(cableSheet.cable.id);
    setSelected(null); setCableSheet(null);
  };

  const saveFeeder = (data) => {
    if (feederSheet.feeder) mv.updateFeeder(feederSheet.feeder.id, data);
    else mv.addFeeder(data);
    setFeederSheet(null);
  };
  const deleteFeeder = () => {
    if (!window.confirm(`Delete ${feederSheet.feeder.name}? Cables and nodes stay on the map.`)) return;
    mv.deleteFeeder(feederSheet.feeder.id);
    setTrippedFeeders((cur) => cur.filter((id) => id !== feederSheet.feeder.id));
    setFeederSheet(null);
  };

  const plants = net.nodes.filter((n) => n.type === 'plant');
  const fromNode = cableSheet && (cableSheet.cable
    ? net.nodes.find((n) => n.id === cableSheet.cable.from.node)
    : net.nodes.find((n) => n.id === cableSheet.draft.fromNode));
  const toNode = cableSheet && (cableSheet.cable
    ? net.nodes.find((n) => n.id === cableSheet.cable.to.node)
    : net.nodes.find((n) => n.id === cableSheet.draft.toNode));

  return (
    <div className="mvnet-page">
      <div className="mvnet-toolbar">
        <button type="button" className="mvnet-mode-btn" onClick={() => nav('/')} aria-label="Back to Daybook">
          <ArrowLeft size={14} />
        </button>
        {MODES.map((m) => (
          <button key={m.id} type="button" className={`mvnet-mode-btn ${mode === m.id ? 'is-active' : ''}`} onClick={() => changeMode(m.id)}>
            <m.icon size={14} /> {m.label}
          </button>
        ))}
        <div className="spacer" />
        {HINTS[mode] && <span className="mvnet-hint">{HINTS[mode]}</span>}
        <button type="button" className="mvnet-mode-btn" onClick={() => setFeederListOpen(true)}>
          <Zap size={14} /> Feeders
        </button>
      </div>

      <div className="mvnet-map-wrap">
        <MapView
          ref={mapRef}
          net={net}
          view={view}
          initialView={net.nodes[0] ? { center: [net.nodes[0].lat, net.nodes[0].lng], zoom: 17 } : { center: [4.1755, 73.5093], zoom: 15 }}
          onNodeClick={handleNodeClick}
          onCableClick={handleCableClick}
          onMapClick={handleMapClick}
          onNodeDragEnd={handleNodeDragEnd}
          onCableVertexChange={handleCableVertexChange}
        />

        {selectedNode && (
          <NodeDetail
            net={net} node={selectedNode}
            onClose={() => setSelected(null)}
            onEdit={() => setNodeSheet({ node: selectedNode, type: selectedNode.type, latlng: null })}
            onToggleBreaker={mv.toggleBreaker}
            onToggleLv0={mv.toggleLv0}
            onZoom={() => mapRef.current?.zoomTo(selectedNode.lat, selectedNode.lng)}
          />
        )}
        {selectedCable && (
          <CableDetail
            net={net} cable={selectedCable}
            onClose={() => setSelected(null)}
            onEdit={() => setCableSheet({ cable: selectedCable, draft: null })}
            onToggleBreaker={mv.toggleBreaker}
          />
        )}
      </div>

      {nodeSheet && (
        <NodeSheet
          node={nodeSheet.node} type={nodeSheet.type} latlng={nodeSheet.latlng}
          isBreakerInUse={(brkId) => breakerInUse(net, brkId)}
          onSave={saveNode}
          onDelete={deleteNode}
          onClose={() => setNodeSheet(null)}
        />
      )}
      {cableSheet && (
        <CableSheet
          cable={cableSheet.cable} draft={cableSheet.draft} fromNode={fromNode} toNode={toNode}
          onSave={saveCable}
          onDelete={deleteCable}
          onClose={() => setCableSheet(null)}
        />
      )}
      {feederListOpen && (
        <FeederListSheet
          feeders={net.feeders} dssCountByFeeder={dssCountByFeeder} trippedFeeders={trippedFeeders}
          onToggleTrip={(fid) => setTrippedFeeders((cur) => (cur.includes(fid) ? cur.filter((id) => id !== fid) : [...cur, fid]))}
          onEdit={(f) => setFeederSheet({ feeder: f })}
          onAdd={() => setFeederSheet({ feeder: null })}
          onClose={() => setFeederListOpen(false)}
        />
      )}
      {feederSheet && (
        <FeederSheet
          feeder={feederSheet.feeder} plants={plants} existingCount={net.feeders.length}
          onSave={saveFeeder}
          onDelete={deleteFeeder}
          onClose={() => setFeederSheet(null)}
        />
      )}
    </div>
  );
}

export default {
  id: 'network',
  title: 'MV Network',
  icon: Zap,
  accent: 'var(--accent-mvnetwork)',
  tier: 'integrated',
  routes: [{ path: '/network', element: <MvNetworkScreen /> }],
  today: () => [],
  renderRef: (record) => <span className="ref-chip">{record.title}</span>,
  search: () => [],
  quickActions: [],
};
