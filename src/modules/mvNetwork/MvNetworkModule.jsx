import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, MousePointer2, Move, Factory, Square, CircleDot, Dot, Waypoints, ArrowLeft, Upload, Download,
  AlertTriangle, RotateCcw, CloudUpload, SlidersHorizontal, MoreVertical,
} from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import { MapView } from './components/MapView';
import { NodeSheet } from './components/NodeSheet';
import { CableSheet } from './components/CableSheet';
import { FeederSheet } from './components/FeederSheet';
import { FeederListSheet } from './components/FeederListSheet';
import { NodeDetail, CableDetail } from './components/DetailPanel';
import { TripPanel } from './components/TripPanel';
import { RecoveryPanel } from './components/RecoveryPanel';
import { CloudBackupPanel } from './components/CloudBackupPanel';
import { LayersPanel } from './components/LayersPanel';
import { useMvNetworkState } from './state/useMvNetworkState';
import { useCloudBackup } from './state/useCloudBackup';
import { useViewPrefs } from './state/useViewPrefs';
import {
  computeAssignment, breakerInUse, allAffectedNodes, anyTripped, physicalFeederOf, recoveryStatus,
} from './lib/electricalModel';
import { exportNetwork, parseImportedNetwork } from './lib/importExport';
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
  const repo = useRepo();
  const mv = useMvNetworkState();
  const { net } = mv;
  const mapRef = useRef(null);
  const fileInputRef = useRef(null);

  const [mode, setMode] = useState('view');
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null); // {points, fromNode}
  const [trippedFeeders, setTrippedFeeders] = useState([]);
  const [trippedNodes, setTrippedNodes] = useState([]);
  const [tripRadius, setTripRadius] = useState(100);
  const [recovery, setRecovery] = useState(null); // {active, targets, feederIds, mv, lv0, feederMV}

  const [nodeSheet, setNodeSheet] = useState(null); // {node, type, latlng}
  const [cableSheet, setCableSheet] = useState(null); // {cable, draft}
  const [feederSheet, setFeederSheet] = useState(null); // {feeder}
  const [feederListOpen, setFeederListOpen] = useState(false);
  const [tripPanelOpen, setTripPanelOpen] = useState(false);
  const [recoveryPanelOpen, setRecoveryPanelOpen] = useState(false);
  const [cloudBackupOpen, setCloudBackupOpen] = useState(false);
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { prefs, setPref } = useViewPrefs();

  /** Shared by JSON import and cloud restore — both replace the whole
   *  document, so both must drop session-only state that could reference
   *  ids the new network doesn't have. */
  const replaceNetwork = (incoming) => {
    mv.setNet(incoming);
    setSelected(null); setTrippedFeeders([]); setTrippedNodes([]); setRecovery(null);
    setMode('view'); setDraft(null);
  };

  const cloudBackup = useCloudBackup(net, { cloud: repo.cloud, uid: repo.uid }, replaceNetwork);

  const changeMode = (m) => { setMode(m); setDraft(null); };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') changeMode('view'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = useMemo(() => ({
    selected, mode,
    layersOn: { cables: prefs.cables, labels: prefs.labels, openPoints: prefs.openPoints, earthing: prefs.earthing },
    labelMode: prefs.labelMode, markerStyle: prefs.markerStyle, sizeScale: prefs.sizeScale, lineScale: prefs.lineScale,
    hiddenFeeders: {}, trippedFeeders, trippedNodes, tripRadius, recovery, draft,
  }), [selected, mode, prefs, trippedFeeders, trippedNodes, tripRadius, recovery, draft]);

  // Base map is a one-shot imperative command on the renderer, not part of
  // the per-frame view object — apply it whenever the preference changes.
  useEffect(() => {
    mapRef.current?.setBaseMap(prefs.baseMap);
  }, [prefs.baseMap]);

  const affectedNodes = useMemo(
    () => allAffectedNodes(net, trippedFeeders, trippedNodes),
    [net, trippedFeeders, trippedNodes],
  );

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

  /* -------------------------------- trip / recovery ------------------------- */

  const openTripPanel = () => { setRecoveryPanelOpen(false); setLayersPanelOpen(false); setTripPanelOpen(true); };

  const clearTrip = () => {
    setTrippedFeeders([]); setTrippedNodes([]);
  };

  /** Builds a fresh recovery session from the current trip (or, if nothing is
   *  tripped, from whatever DSS/RMU nodes are currently de-energised) — ported
   *  from v39's openRecovery(). */
  const openRecovery = () => {
    if (!recovery) {
      const { nodeF } = computeAssignment(net);
      let targets;
      let feederIds;
      if (anyTripped(trippedFeeders, trippedNodes)) {
        targets = affectedNodes.filter((n) => n.type === 'dss' || n.type === 'rmu').map((n) => n.id);
        feederIds = trippedFeeders.slice();
      } else {
        targets = net.nodes.filter((n) => (n.type === 'dss' || n.type === 'rmu') && !nodeF[n.id]).map((n) => n.id);
        feederIds = [];
      }
      const mvFlags = {}; const lv0 = {}; const feederMV = {};
      targets.forEach((id) => { mvFlags[id] = false; lv0[id] = true; });
      const involved = new Set(feederIds);
      targets.forEach((id) => { const f = physicalFeederOf(net, id); if (f) involved.add(f); });
      involved.forEach((fid) => { feederMV[fid] = false; });
      setRecovery({ active: true, targets, feederIds: [...involved], mv: mvFlags, lv0, feederMV });
    }
    setTripPanelOpen(false);
    setLayersPanelOpen(false);
    setRecoveryPanelOpen(true);
  };

  const finishRecovery = () => {
    const remaining = recovery.targets.filter((id) => recoveryStatus(net, recovery, id) !== 'full').length;
    if (remaining && !window.confirm(`${remaining} substation(s) are not fully restored. Finish anyway and clear the trip?`)) return;
    if (recovery.feederIds?.length) setTrippedFeeders((cur) => cur.filter((fid) => !recovery.feederIds.includes(fid)));
    setTrippedNodes((cur) => cur.filter((id) => !recovery.targets.includes(id)));
    setRecovery(null);
    setRecoveryPanelOpen(false);
  };

  /* --------------------------- import / export ----------------------------- */

  const handleExport = () => exportNetwork(net);

  const handleImportClick = () => fileInputRef.current?.click();
  const handleImportFile = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let incoming;
      try {
        incoming = parseImportedNetwork(reader.result);
      } catch (err) {
        window.alert(err.message);
        return;
      }
      const summary = `${incoming.nodes.length} nodes, ${incoming.cables.length} cables, ${incoming.feeders.length} feeders`;
      if (!window.confirm(`Replace the current network with this file? (${summary})\n\nThis can't be undone.`)) return;
      replaceNetwork(incoming);
    };
    reader.readAsText(file);
  };

  /* -------------------------------- cloud backup ---------------------------- */

  const handleRestoreLatest = async () => {
    const incoming = await cloudBackup.restoreLatest();
    if (!incoming) return null;
    const summary = `${incoming.nodes.length} nodes, ${incoming.cables.length} cables, ${incoming.feeders.length} feeders`;
    if (!window.confirm(`Replace the current network with your last cloud backup? (${summary})\n\nThis can't be undone.`)) return null;
    replaceNetwork(incoming);
    return incoming;
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
        <button type="button" className={`mvnet-mode-btn ${anyTripped(trippedFeeders, trippedNodes) ? 'is-tripped' : ''}`} onClick={openTripPanel}>
          <AlertTriangle size={14} /> Trip
        </button>
        <button type="button" className="mvnet-mode-btn" onClick={openRecovery}>
          <RotateCcw size={14} /> Recovery
        </button>
        <button type="button" className="mvnet-mode-btn" onClick={() => setFeederListOpen(true)}>
          <Zap size={14} /> Feeders
        </button>
        <button
          type="button" className={`mvnet-mode-btn ${layersPanelOpen ? 'is-active' : ''}`}
          onClick={() => { setTripPanelOpen(false); setRecoveryPanelOpen(false); setLayersPanelOpen((v) => !v); }}
        >
          <SlidersHorizontal size={14} /> Layers
        </button>
        <div className="mvnet-menu-wrap">
          <button type="button" className="mvnet-mode-btn" aria-label="More" onClick={() => setMenuOpen((v) => !v)}>
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div className="mvnet-menu">
              <button type="button" className="mvnet-menu-item" onClick={() => { setMenuOpen(false); handleImportClick(); }}>
                <Upload size={14} /> Import data (JSON)
              </button>
              <button type="button" className="mvnet-menu-item" onClick={() => { setMenuOpen(false); handleExport(); }}>
                <Download size={14} /> Export data (JSON)
              </button>
              <button type="button" className="mvnet-menu-item" onClick={() => { setMenuOpen(false); setCloudBackupOpen(true); }}>
                <CloudUpload size={14} /> Cloud backup…
              </button>
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleImportFile} />
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
      {tripPanelOpen && (
        <TripPanel
          net={net} trippedFeeders={trippedFeeders} trippedNodes={trippedNodes} tripRadius={tripRadius}
          affectedNodes={affectedNodes}
          onAddFeederTrip={(fid) => setTrippedFeeders((cur) => (cur.includes(fid) ? cur : [...cur, fid]))}
          onChangeFeederTrip={(oldId, newId) => setTrippedFeeders((cur) => {
            const next = cur.filter((x) => x !== oldId);
            return newId && !next.includes(newId) ? [...next, newId] : next;
          })}
          onAddNodeTrip={(id) => setTrippedNodes((cur) => (cur.includes(id) ? cur : [...cur, id]))}
          onRemoveNodeTrip={(id) => setTrippedNodes((cur) => cur.filter((x) => x !== id))}
          onRadiusChange={setTripRadius}
          onStartRecovery={openRecovery}
          onClearTrip={clearTrip}
          onZoomNode={(lat, lng) => mapRef.current?.zoomTo(lat, lng)}
          onClose={() => setTripPanelOpen(false)}
        />
      )}
      {recoveryPanelOpen && recovery && (
        <RecoveryPanel
          net={net} recovery={recovery}
          onToggleFeederMV={(fid) => setRecovery((cur) => ({ ...cur, feederMV: { ...cur.feederMV, [fid]: !cur.feederMV[fid] } }))}
          onToggleMV={(id) => setRecovery((cur) => ({ ...cur, mv: { ...cur.mv, [id]: !cur.mv[id] } }))}
          onToggleLv0={(id) => setRecovery((cur) => {
            if (!cur.mv[id]) return cur;
            return { ...cur, lv0: { ...cur.lv0, [id]: cur.lv0[id] === false ? true : false } };
          })}
          onAllMV={() => setRecovery((cur) => ({
            ...cur,
            feederMV: Object.fromEntries(Object.keys(cur.feederMV).map((fid) => [fid, true])),
            mv: Object.fromEntries(cur.targets.map((id) => [id, true])),
          }))}
          onAllLv0={() => setRecovery((cur) => ({
            ...cur,
            lv0: Object.fromEntries(cur.targets.map((id) => [id, cur.mv[id] ? true : cur.lv0[id]])),
          }))}
          onFinish={finishRecovery}
          onZoomNode={(lat, lng) => mapRef.current?.zoomTo(lat, lng)}
          onClose={() => setRecoveryPanelOpen(false)}
        />
      )}
      {layersPanelOpen && (
        <LayersPanel
          prefs={prefs}
          onChange={setPref}
          onClose={() => setLayersPanelOpen(false)}
        />
      )}
      {cloudBackupOpen && (
        <CloudBackupPanel
          configured={repo.configured} cloud={repo.cloud}
          lastBackupAt={cloudBackup.lastBackupAt} busy={cloudBackup.busy} error={cloudBackup.error}
          onBackupNow={cloudBackup.backupNow}
          onRestoreLatest={handleRestoreLatest}
          onClose={() => setCloudBackupOpen(false)}
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
  renderRef: (record) => <span className="ref-chip">{record.title}</span>,
  search: () => [],
  quickActions: [],
};
