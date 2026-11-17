import {
  WebGLRenderer, Scene, PerspectiveCamera, Mesh, Group, RingGeometry, CircleGeometry, SphereGeometry,
  MeshBasicMaterial, BufferGeometry, Line, LineBasicMaterial, Float32BufferAttribute,
} from 'three';
import { hitUsable, MIN_HIT_RANGE } from './geometry';

/**
 * The AR measure session: WebXR hit-test on ARCore, drawn with Three.js.
 *
 * Imperative on purpose — the XR frame loop runs 60 times a second and has
 * nothing to do with React. The screen starts it, gets plain-data updates
 * (about 10 a second) and ends it.
 *
 * Taps are queued and handled in the next XR frame, because a hit-test
 * result (and creating an anchor from it) is only valid inside its frame.
 * Each point sits on an XR anchor where the phone supports it, so when
 * ARCore corrects its tracking the points move with the room.
 */

const MAX_POINTS = 200;
const ACCENT = 0x2ec4d6;
const WARN = 0xe0a030;

/**
 * Start a session from a tap (WebXR needs the user gesture).
 * overlay: the element shown over the camera (dom-overlay root).
 * onUpdate({ points, hit, camera, tooClose, anchored, overlay }), onEnd(points).
 * Returns { undo, clear, end }.
 */
export async function startMeasure({ overlay, onUpdate, onEnd }) {
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test', 'local-floor'],
    optionalFeatures: ['dom-overlay', 'anchors'],
    ...(overlay ? { domOverlay: { root: overlay } } : {}),
  });

  // Taps on the overlay's buttons must not also drop a point.
  const guard = (e) => { if (e.target?.closest?.('button, input, a, [data-ui]')) e.preventDefault(); };
  overlay?.addEventListener('beforexrselect', guard);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');

  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 1, 0.01, 50);

  // Reticle: a flat ring with a dot, laid on the surface the camera ray hits.
  const reticleMat = new MeshBasicMaterial({ color: ACCENT });
  const reticle = new Group();
  reticle.add(new Mesh(new RingGeometry(0.05, 0.065, 40).rotateX(-Math.PI / 2), reticleMat));
  reticle.add(new Mesh(new CircleGeometry(0.008, 16).rotateX(-Math.PI / 2), reticleMat));
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const markerGeo = new SphereGeometry(0.012, 16, 12);
  const markerMat = new MeshBasicMaterial({ color: 0xffffff });
  const pathLine = new Line(new BufferGeometry(), new LineBasicMaterial({ color: ACCENT }));
  const liveLine = new Line(new BufferGeometry(), new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  pathLine.frustumCulled = false;
  liveLine.frustumCulled = false;
  scene.add(pathLine, liveLine);

  /** { x, y, z, mesh, anchor? } */
  const points = [];
  let pendingTap = false;
  let anchored = false;
  let hit = null;
  let cam = null;
  let lastSent = 0;
  let ended = false;

  const plain = () => points.map(({ x, y, z }) => ({ x, y, z }));
  const send = (force) => {
    const now = performance.now();
    if (!force && now - lastSent < 100) return;
    lastSent = now;
    onUpdate?.({
      points: plain(),
      hit: hit && { ...hit },
      camera: cam && { ...cam },
      tooClose: !!hit && !!cam && !hitUsable(hit, cam),
      anchored,
      overlay: !!session.domOverlayState,
    });
  };

  // Fixed-size buffers, rewritten in place: a new attribute every frame
  // would leave a GPU buffer behind each time.
  for (const line of [pathLine, liveLine]) {
    line.geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(MAX_POINTS * 3), 3));
    line.geometry.setDrawRange(0, 0);
  }
  const setLine = (line, pts) => {
    const attr = line.geometry.getAttribute('position');
    const n = Math.min(pts.length, MAX_POINTS);
    for (let i = 0; i < n; i++) attr.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
    attr.needsUpdate = true;
    line.geometry.setDrawRange(0, n);
  };

  const removePoint = (pt) => {
    scene.remove(pt.mesh);
    pt.anchor?.delete?.();
  };

  let hitSource;
  try {
    const viewerSpace = await session.requestReferenceSpace('viewer');
    hitSource = await session.requestHitTestSource({ space: viewerSpace });
  } catch (e) {
    overlay?.removeEventListener('beforexrselect', guard);
    renderer.dispose();
    session.end().catch(() => {});
    throw e;
  }

  session.addEventListener('select', () => { pendingTap = true; });

  renderer.setAnimationLoop((_t, frame) => {
    if (!frame) return;
    const ref = renderer.xr.getReferenceSpace();
    const viewer = frame.getViewerPose(ref);
    cam = viewer ? { ...pick(viewer.transform.position) } : null;

    const results = frame.getHitTestResults(hitSource);
    const result = results[0];
    const pose = result?.getPose(ref);
    if (pose) {
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
      hit = pick(pose.transform.position);
      reticleMat.color.setHex(cam && !hitUsable(hit, cam) ? WARN : ACCENT);
    } else {
      reticle.visible = false;
      hit = null;
    }

    // Anchored points follow ARCore's corrections.
    for (const pt of points) {
      if (!pt.anchor || !frame.trackedAnchors?.has(pt.anchor)) continue;
      const ap = frame.getPose(pt.anchor.anchorSpace, ref);
      if (ap) Object.assign(pt, pick(ap.transform.position));
      pt.mesh.position.set(pt.x, pt.y, pt.z);
    }

    if (pendingTap) {
      pendingTap = false;
      if (hit && hitUsable(hit, cam) && points.length < MAX_POINTS) {
        const mesh = new Mesh(markerGeo, markerMat);
        mesh.position.set(hit.x, hit.y, hit.z);
        scene.add(mesh);
        const pt = { ...hit, mesh };
        points.push(pt);
        result.createAnchor?.()
          .then((a) => {
            if (!points.includes(pt) || ended) { a.delete(); return; }
            pt.anchor = a;
            anchored = true;
          })
          .catch(() => { /* anchors are optional */ });
        send(true);
      }
    }

    setLine(pathLine, points);
    const last = points[points.length - 1];
    liveLine.visible = !!(last && hit);
    if (liveLine.visible) setLine(liveLine, [last, hit]);

    renderer.render(scene, camera);
    send(false);
  });

  session.addEventListener('end', () => {
    ended = true;
    const result = plain();
    renderer.setAnimationLoop(null);
    hitSource.cancel?.();
    overlay?.removeEventListener('beforexrselect', guard);
    points.forEach(removePoint);
    scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    renderer.dispose();
    onEnd?.(result);
  });

  try {
    await renderer.xr.setSession(session);
  } catch (e) {
    session.end().catch(() => {}); // 'end' above tidies up
    throw e;
  }
  send(true);

  return {
    undo() {
      const pt = points.pop();
      if (pt) removePoint(pt);
      send(true);
    },
    clear() {
      points.splice(0).forEach(removePoint);
      send(true);
    },
    end() {
      if (!ended) session.end().catch(() => {});
    },
  };
}

const pick = (p) => ({ x: p.x, y: p.y, z: p.z });

export { MIN_HIT_RANGE };
