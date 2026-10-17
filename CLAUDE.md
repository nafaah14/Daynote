# Daybook — Agent Instructions

Daybook is a personal PWA: one shell, many modules (reminders, lists, notes,
payments, expenses, stock, directory, roster, overtime, Mandarin, File
Organizer, regions map, …). Vite + React 19, Firebase (Firestore) backend,
deployed on Cloudflare Pages. `README.md` is the architecture reference — read
it before structural work.

## Commands

```bash
npm run dev      # vite dev server
npm test         # vitest run
npm run lint     # oxlint
npm run build    # vite build -> dist/
```

Run `npm test` and `npm run build` before committing anything non-trivial.

## Architecture rules (non-negotiable)

- **Modules import from `core`. `core` never imports from modules. Modules
  never import each other.** Cross-module needs go through `links`
  (`[{ rel, id }]`), type strings, or `core` helpers (e.g. `core/people.js`).
- Two tiers: integrated modules (`src/modules/`) share the record envelope;
  hosted apps (`src/hosted/`) share only the shell and own their data.
- A module is a default-exported manifest from `src/modules/<id>/index.jsx`
  (`id, title, icon, accent, tier, routes, today, renderRef, search,
  quickActions`). Register it in `src/registry.js` only — don't edit existing
  screens to add a module.
- One record envelope, one collection: `users/{uid}/records/{id}` with `type`
  (`module.entity`), `title`, `dueAt`, `data`, `deletedAt` (always soft
  delete), `schemaVersion`, `links`.
- DB access goes through the adapter seam (`src/core/db/`); modules never talk
  to Firestore directly.
- Notifications: no in-app timers (unreliable in PWAs). Reminders are sent by
  the scheduled worker in `workers/send-reminders`.

## Layout

```
src/core/        shared: db, ui (tokens.css), shell, notifications, map, people.js, crypto
src/modules/     integrated modules
src/hosted/      hosted apps (own their data)
src/registry.js  the module list — the one place modules are wired in
functions/       Cloudflare Pages Functions (assistant, Drive OAuth + scan)
workers/         scheduled Cloudflare worker (send-reminders)
design-reference/ visual references
```

## Workflow conventions

- **Bump the version in `package.json` with every notable change** (minor for
  features, patch for fixes). It is shown in Settings → About next to the
  build id (`YYYYMMDD-HHMM` UTC); when checking whether a fix is live, compare
  the build id, not just the version. Add a `CHANGELOG.md` entry when asked.
- **Payroll / Overtime / HRMS work must be verified against real source
  data**: reproduce the source system's own published totals and pin them in a
  fixture test. Never "fix" from markup pattern-matching alone. State plainly
  what was verified end-to-end versus only at unit level — the user tests in
  the browser themselves.
- Match surrounding code style; keep comments sparse and in the file's voice.
- Commit messages: short imperative summary in the existing style
  (e.g. "Add Expenses module — ledger pages in MVR for monthly and trip
  spending").

## Deploy

`origin` is `github.com/nafaah14/Daynote`, branch `main`. Pushing to `main`
deploys to Cloudflare Pages (`https://daynote-bvc.pages.dev`). Only commit or
push when the user asks.

## Secrets and files not to touch

- `.env`, `.dev.vars`, `workers/send-reminders/.dev.vars` are gitignored —
  never commit or print them. `.env.example` documents the keys.
- `body1.json` / `body2.json` are gitignored scratch files.
- Cloudflare env vars for Drive/Firestore (`GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `OAUTH_STATE_SECRET`,
  `FB_PROJECT_ID`, `FB_CLIENT_EMAIL`, `FB_PRIVATE_KEY`) are set in the
  Cloudflare dashboard, not in the repo.

## Known state

- `src/modules/fileOrganizer/` is intentionally **not** registered on the
  Dashboard (`dashboardRegistry.js`) until the user gives an explicit go-ahead.
  Phase 2 (Drive scan) also depends on the user's Google Cloud / Cloudflare /
  Firestore setup — ask where that stands before debugging "it doesn't work".

## Scope

Work inside this repo. A sibling project, `DB-Panel-Designer`, lives at
`C:\Users\salaf\Documents\2.VS Code\DB-Panel-Designer` with its own
`CLAUDE.md`; don't mix the two.
