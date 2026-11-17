# RoomScan 3D — Build Plan v1.0.0

Nov 16, 2026 · @Nafaah

> **In Daybook.** This runs as a Daybook module (`src/modules/roomscan`), not a
> standalone app. Changes from the plan below: React screens (the AR session
> and Three.js scene stay plain code that React mounts); rooms are Daybook
> records (`roomscan.project`), so they sync between devices and need no
> IndexedDB, Worker API, D1 or R2; no separate wrangler config or PWA manifest;
> JavaScript with pure, tested geometry in `lib/geometry.js`; Three.js loads
> only on the AR / 3D screens. Milestones ship as ordinary Daybook versions.
> Done so far: v0.1.0 + v0.2.0 (module, Measure test) in Daybook v0.95.0.

## Goal and scope

RoomScan 3D is a web app (PWA) that runs in Chrome on Android. You walk a room with the phone camera, tap the corners and openings, and the app builds a dimensioned 2D floor plan and a 3D model of the room.

**v1.0.0 does:**

- AR capture of floor corners, ceiling height, doors and windows using WebXR on ARCore phones
- A 2D plan editor: wall lengths, area, perimeter, drag corners, snap to 90°
- A 3D viewer: walls with real openings, orbit and zoom, a first-person walk view
- Several rooms per project, saved on the phone (IndexedDB), working offline
- Exports: PNG, SVG, PDF and DXF for the plan; GLB for the 3D model; JSON for backup

**v1.0.0 does not do:** a full surface mesh or photo-textured scan, automatic furniture detection, or iPhone support. A depth-based point-cloud capture is a later phase (v1.2.0).

**Requirements:** an ARCore-supported Android phone with Google Play Services for AR, current Chrome, and HTTPS (Cloudflare provides that).

## How the scanning works

Capture uses the WebXR hit-test API: a crosshair (reticle) sits where the camera ray meets a real surface, and each tap records a 3D point in metres. Chrome on Android runs WebXR on top of ARCore. Hit Test, Anchors, Depth API and Lighting Estimation have shipped in Chrome; Plane Detection is still a developer trial ([Google ARCore–WebXR comparison](https://developers.google.com/ar/develop/webxr/arcore-comparison?hl=en)). So v1 is built on hit-test and anchors only, with depth sensing as an optional extra.

**Capture flow, one room:**

1. **Start AR.** Request `immersive-ar` with `hit-test`, `local-floor` and `dom-overlay` (needed for buttons over the camera view); `anchors` and `depth-sensing` are optional. Ask the user to sweep the phone slowly for 5–10 s so ARCore finds the floor.
2. **Mark floor corners.** Walk to each corner and tap where floor meets wall, going clockwise. The app draws the outline live in AR and shows each wall length as it goes. Tap the first point again to close the room.
3. **Set ceiling height.** Aim at the wall–ceiling line and tap; the app takes the height above the floor. Typing a value is the fallback.
4. **Mark openings.** Pick Door or Window, then tap the bottom-left and top-right corners on the wall. The app snaps the opening onto the nearest wall and stores its offset along the wall, width, height and sill height.
5. **Optional calibration.** Measure one wall with a tape and type it in; the app scales the whole room to match.
6. **Finish.** The app tidies the shape (square corners within ±5°, straight walls), then opens the 2D editor.

Each corner is held on an XR anchor where the phone supports it, which reduces drift while you walk.

## Tech stack and hosting

Host on **Cloudflare Workers with static assets**, not Pages. Cloudflare now recommends Workers static assets for new projects and puts new features there; Pages still works ([comparison](https://flaviocopes.com/cloudflare-pages-vs-workers/), [Cloudflare migration guide](https://developers.cloudflare.com/workers/static-assets/migrate-from-pages/)). Requests for static assets are free, and the same Worker can add an API later.

| Layer | Choice | Why |
| --- | --- | --- |
| Build | Vite + TypeScript | Fast dev server, small builds, types catch geometry bugs |
| AR | Raw WebXR Device API + Three.js `WebXRManager` | Direct access to hit-test, anchors and depth |
| 3D | Three.js (`OrbitControls`, `GLTFExporter`) | Wall meshes, viewer, GLB export |
| 2D | SVG editor in plain TypeScript | Sharp at any zoom, easy to export as SVG |
| UI | Vanilla TS + CSS; no framework | Matches your existing tools, small bundle |
| Storage | IndexedDB (`idb-keyval`) | Works offline, holds bigger projects than localStorage |
| Exports | `jspdf` for PDF; a small DXF writer in-house | No server needed |
| Offline | `vite-plugin-pwa` | Installable, works without signal |
| Hosting | Cloudflare Workers static assets + `wrangler` | HTTPS, free static requests |
| Later sync (v1.3.0) | Worker API + D1 (project data) + R2 (exports) | Share projects between devices |

`wrangler.jsonc` for v1 needs only a name, today's `compatibility_date`, and `"assets": { "directory": "./dist", "not_found_handling": "single-page-application" }`.

## Data model

One JSON-friendly model drives the 2D plan, the 3D model and every export. Units are metres; the floor plan uses x and z (y is up), matching WebXR and Three.js.

```ts
interface Project {
  id: string; name: string; schemaVersion: '1.0.0';
  createdAt: string; updatedAt: string;
  rooms: Room[];
}

interface Room {
  id: string; name: string;               // e.g. "Control room"
  corners: { x: number; z: number }[];    // clockwise, closed loop
  ceilingHeight: number;                  // m
  scale: number;                          // 1.0 unless tape-calibrated
  openings: Opening[];
  origin: { x: number; z: number; rotationY: number }; // place room in project
  rawCapture?: { points: number[][]; capturedAt: string }; // before tidy-up
}

interface Opening {
  id: string; type: 'door' | 'window' | 'opening';
  wallIndex: number;   // wall i runs corners[i] to corners[i+1]
  offset: number;      // m from wall start to opening's near edge
  width: number; height: number; sill: number; // sill = 0 for doors
}
```

Keeping the raw tapped points next to the tidied corners lets you undo the tidy-up and re-run it with other settings.

## Screens and modules

Five screens share one room model, so a change in the 2D editor shows up at once in 3D and in every export.

| Screen | What it does | Main module |
| --- | --- | --- |
| Projects | List, create, rename, duplicate, delete; import/export JSON | `store/` |
| AR Capture | Reticle, tap to place points, live outline with lengths, undo last point, step prompts | `capture/` |
| 2D Plan | Pan/zoom, drag corners, edit lengths by typing, add/move openings, area and perimeter, grid and 90° snap | `plan2d/` |
| 3D View | Orbit, first-person walk, toggle ceiling, floor grid, measure tool | `view3d/` |
| Export | PNG, SVG, PDF (plan with title block and scale bar), DXF (walls and openings on layers), GLB, JSON | `export/` |

**Geometry core (`geometry/`)** holds the pure functions every screen uses: polygon area and perimeter, corner squaring, wall segments from corners, opening placement on a wall, and wall mesh building. Walls are built per segment: a 2D wall face with holes cut for the openings (Three.js `Shape` + `holes`), extruded to a 0.15 m wall thickness. This needs no CSG library.

These functions take plain data and return plain data, so they are easy to unit-test without a phone.

## Repo structure

```text
roomscan-3d/
├─ CLAUDE.md              # rules for Claude Code (see last section)
├─ PLAN.md                # this plan, exported as Markdown
├─ CHANGELOG.md           # one entry per version
├─ package.json           # "version" is the app version
├─ vite.config.ts
├─ wrangler.jsonc
├─ index.html
├─ public/                # icons, manifest
├─ src/
│  ├─ main.ts             # router + app shell
│  ├─ version.ts          # reads version from package.json, shown in UI
│  ├─ model/              # types + schema migrations
│  ├─ geometry/           # pure maths, fully unit-tested
│  ├─ store/              # IndexedDB projects
│  ├─ capture/            # WebXR session, reticle, anchors, step flow
│  ├─ plan2d/             # SVG editor
│  ├─ view3d/             # Three.js scene, walls, controls
│  ├─ export/             # png, svg, pdf, dxf, glb, json
│  └─ ui/                 # shared components + styles
└─ tests/                 # Vitest unit tests (geometry, dxf, model)
```

## Dev workflow

You code in VS Code with Claude Code and test AR on the phone over USB. WebXR needs a secure context, and `localhost` counts as one, so USB port forwarding avoids certificate setup.

1. **One-time setup:** install Node LTS, Git and the Wrangler CLI (`npm i -D wrangler`), then run `npx wrangler login`. On the phone, turn on Developer options and USB debugging, and install Google Play Services for AR.
2. **Run locally:** `npm run dev` (Vite on port 5173).
3. **Open it on the phone:** connect USB, then `adb reverse tcp:5173 tcp:5173`, and open `http://localhost:5173` in Chrome on the phone. Or use `chrome://inspect` on the PC, which also does port forwarding.
4. **Debug:** `chrome://inspect` on the PC shows the phone's console and lets you inspect the DOM overlay.
5. **Desktop testing without a phone:** the Immersive Web Emulator extension for Chrome fakes an AR session, which is good enough for UI work. Geometry is tested with Vitest (`npm test`).
6. **Deploy:** `npm run build && npx wrangler deploy` publishes to `roomscan-3d.<your-subdomain>.workers.dev`. Later, connect the GitHub repo to Workers Builds so each push to `main` deploys.

**Versioning:** every change bumps `package.json` with `npm version patch|minor|major`, adds a CHANGELOG entry, and shows the version in the app's footer.

## Milestones

Each milestone ends deployed to Cloudflare and tested on your phone before the next one starts. Build them in this order; each depends on the one before.

1. **v0.1.0 — Skeleton.** Vite + TS project, app shell, version in footer, Wrangler deploy working, PWA manifest. *Done when:* the empty app loads from workers.dev on the phone.
2. **v0.2.0 — AR proof.** Start an `immersive-ar` session with DOM overlay, show the reticle, tap to drop markers, show the distance between two taps. *Done when:* a 1 m tape length reads within ±2 cm.
3. **v0.3.0 — Room capture.** Full flow: corners, close loop, ceiling height, live outline and lengths, undo, corner squaring, save to IndexedDB.
4. **v0.4.0 — 2D plan.** SVG plan with dimensions, area and perimeter, drag corners, type a length, grid snap.
5. **v0.5.0 — 3D view.** Extruded walls, floor, optional ceiling, orbit and walk modes, live sync with the 2D plan.
6. **v0.6.0 — Openings.** Capture doors and windows in AR; show, move and resize them in 2D; cut them out in 3D.
7. **v0.7.0 — Exports.** PNG, SVG, PDF, DXF, GLB, JSON import/export.
8. **v0.8.0 — Multi-room.** Several rooms per project, place and rotate rooms against each other in the 2D plan.
9. **v1.0.0 — Release.** Offline PWA install, tape calibration, help screens, error handling for phones without AR, field test on 3 real rooms.

**After v1:** v1.1.0 furniture boxes; v1.2.0 depth-sensing point cloud as a 3D overlay; v1.3.0 cloud sync with a Worker API, D1 and R2.

## Accuracy and risks

Expect roughly 1–3% error on wall lengths with careful capture; tape calibration in v1.0.0 removes most of the scale error. The accuracy target is a v0.2.0 test, so measure it on your phone early.

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Tracking drift on long walks | Room does not close; walls bend | Anchors per corner, a loop-closure check, auto-squaring, tape calibration |
| Plain walls and floors (white paint, glossy tiles) | Hit-test finds no surface | Prompt to sweep slowly, better lighting, fallback: tap at an estimated floor height |
| Corners hidden by furniture | Wrong corner position | Tap the floor–wall line on both walls and intersect the two lines |
| Hit-test within \~30–40 cm of the camera is noisy | Points jump | Ask the user to stand 1–3 m away; ignore hits closer than 0.4 m |
| Phone lacks ARCore or WebXR | App cannot capture | Feature check on load; manual-entry mode still gives 2D and 3D |
| Plane detection API changes | Breaks features built on it | Not used in v1; hit-test and anchors are stable |

## Starting in Claude Code

Export this doc as Markdown into the repo as `PLAN.md`, add the `CLAUDE.md` below, then give Claude Code the first prompt.

```markdown
# CLAUDE.md — RoomScan 3D

Read PLAN.md before any task. Build one milestone at a time.

## Stack
Vite + TypeScript, Three.js, raw WebXR, IndexedDB (idb-keyval), Vitest.
Hosted on Cloudflare Workers static assets via wrangler (assets dir ./dist).
No UI framework.

## Rules
- Units are metres; y is up; floor plan uses x/z.
- Geometry lives in src/geometry as pure functions with unit tests.
- Every change bumps package.json version (semver) and adds a CHANGELOG entry.
- Show the app version in the footer.
- Target: Chrome on Android with ARCore. Feature-detect WebXR and fall back to manual entry.
- Request 'hit-test' and 'local-floor' as required; 'dom-overlay', 'anchors', 'depth-sensing' as optional.
- Run `npm test` and `npm run build` before saying a task is done.

## Commands
npm run dev | npm test | npm run build | npx wrangler deploy
```

**First prompt:**

> Read PLAN.md and CLAUDE.md. Build milestone v0.1.0 (Skeleton): scaffold Vite + TypeScript, add Three.js, idb-keyval and Vitest, create the src folders from the plan, an app shell with the five screens as empty routes, the version in the footer, a PWA manifest, and wrangler.jsonc for Workers static assets. Then give me the exact commands to deploy and to test on my Android phone over USB.
