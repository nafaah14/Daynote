# Daybook

**v0.10.0** — see `CHANGELOG.md` for what's in this release.

Version and build id are both shown in **Settings → About**. When checking
whether a fix is live, compare the **build id** — two builds of the same
version can differ if one predates the fix.

One shell, many modules. A daybook is the ledger you write entries into before
posting them anywhere — which is exactly what the Inbox does here.

```bash
npm install
npm run dev
```

Runs on localStorage out of the box. No config, no account, no backend.

---

## The rule that makes this last

**Modules import from `core`. `core` never imports from modules. Modules never
import each other.**

If Reminders needs to show a loan payment, it does not import Loans — it holds
a `link` and asks core to render it, or reads by type string. Break this rule
once and in eighteen months you will have modules that cannot be removed
without the whole thing collapsing.

---

## Two tiers

**Integrated modules** (`src/modules/`) share the record envelope. They appear
on Today, in search, and can be created from the Inbox.

**Hosted apps** (`src/hosted/`) share only the shell — auth, navigation, the
design system, the launcher. They own their data entirely. Spaced-repetition
scheduling has nothing to do with `dueAt`/`tags`/`title`, so the Mandarin app
should never be forced into the envelope.

Capabilities are opt-in. A hosted app can implement `today()` later to surface
"12 cards due" without ever adopting the envelope.

---

## The module contract

`src/modules/<id>/index.jsx` default-exports a manifest:

```js
{
  id, title, icon, accent, tier: 'integrated',
  routes: [{ path, element }],

  today:     ({ repo }) => [cards],        // what belongs on the home screen
  renderRef: (record)   => <Chip/>,        // how others display my records
  search:    ({ repo }, q) => [hits],      // contribute to global search
  quickActions: [...],
}
```

The shell asks every registered module those questions and composes the
answers. Add a module and it appears on Today, in search, and in the launcher
without editing a single existing screen — only `src/registry.js`.

---

## The record envelope

One shape for everything, one collection: `users/{uid}/records/{id}`.

| field | why |
|---|---|
| `type` | namespaced `module.entity` |
| `title` | top-level so *any* record can render without knowing its type |
| `dueAt` | top-level and denormalized so Today is one query, not N |
| `data` | loose blob — add fields for years with no migration |
| `deletedAt` | always soft delete |
| `schemaVersion` | lazy migration on read; your escape hatch |
| `links` | `[{ rel, id }]` — cross-module references without coupling |

Single collection over one-per-module is what buys cheap cross-module queries.
You lose per-type security rules and the collection grows unbounded; for one
person and a few thousand records a year, neither bites.

---

## Switching to Firestore

`src/core/db/adapter-firestore.js` already matches the local adapter's
interface. Set the `VITE_FB_*` env vars and swap the adapter in
`src/core/db/repo.jsx`. No module changes — that is the entire point of the
adapter seam.

---

## Reminders vs Lists

Not the same thing, and the dividing line is not what they contain:

- **Reminder** — time-triggered. It comes and finds you.
- **List** — context-triggered. It waits until you arrive somewhere.

A list's *mode* is a property of the list, not a new module:
`clearable` (shopping — check off, then wipe) and `collection` (films —
accumulates, checking off archives it with a rating).

Recurrence stores a rule and computes the **next** occurrence on completion.
Future instances are never materialised. A long-missed repeat rolls forward to
the next future date rather than replaying every occurrence you skipped.

---

## Notifications — read before building

You cannot reliably schedule a future notification from a PWA. Notification
Triggers never shipped and service workers get killed, so any in-app timer is
fiction. Climb this ladder:

1. **Nothing.** Today screen plus a badge. Free, and you open the app daily.
2. **A Telegram bot.** A scheduled job queries `dueAt <= now` and messages you.
   No push permissions, no iOS quirks, works everywhere, free reminder log.
   For a personal app this is the sweet spot.
3. **Web Push.** Only if you want it to feel native. Needs a scheduled
   function. Android is fine; iOS only when installed to the home screen, and
   still temperamental.

---

## Person identity lives in core

`src/core/people.js` owns the canonical person record. Directory is the
*editor* for people, not the owner.

Modules that need a person store a **link**, never a copy:

```js
links: [{ rel: 'person', id: personId }]
```

and read the name back through `personOf(repo, record)`. That is why fixing a
spelling in Directory corrects it everywhere at once, and why Roster and
Directory can both exist without importing each other.

**The one write-back.** Roster's edit sheet may change a person's designation,
because a promotion is a genuine change of title. Every other module reads
people and never writes them. If a second write-back ever seems necessary,
that is the signal the field belongs in Directory instead.

Directory imports staff from CSV (`Import` on the filter bar). The column
guesser scores content rather than trusting the header row, because these
exports mislabel column two as "Designation" when it holds the name. It also
repairs rows where an unescaped comma inside a unit name pushes the columns
out of alignment. Re-importing **never blanks a field the CSV doesn't carry**,
so mobile numbers you collect by hand survive every refresh from HR.

## Notifications, in two layers

- **In-app feed** (the bell, top right) — always reliable. Records of type
  `notify.event`, so they sync and survive reloads. Unread drives the badge;
  "Mark all read" silences the badge without deleting anything, and History
  keeps the last 200.
- **Push** — best effort, covered above.

Modules opt in by adding `raiseEvents({ repo })` to their manifest, the same
shape as `today()` and `search()`. A `dedupeKey` stops the same event being
raised again on every app open. Core never learns what a reminder is.

## Writing many records at once

`repo.bulkWrite(records)` — use it for anything importing more than a handful.
Assemble records with `repo.draft(type, fields)` (builds without writing), then
write the lot in one call.

A loop of `repo.create()` is the trap. On Firestore it fires one unawaited
write per record and failures are silent, so other devices end up with a
partial copy. On localStorage it re-parses the entire store per record, which
is quadratic and will hang the browser at a few thousand rows.

Single writes are awaited internally now and surface failures in a banner
under the top bar, so a broken cloud connection is visible rather than quietly
losing data.

## What syncs and what doesn't

**Syncs** (everything in the record store): directory people, roster entries,
reminders, lists, notes, inbox captures, notification history.

**Per-device, by design** (localStorage): theme, Today layout, bottom-bar
choice, notification preferences, the Firebase config itself, and the roster's
sort mode. These describe how *this device* is set up, not what you track.

## Deploying to Netlify

### Quickest: drag and drop the pre-built site

Use `daybook-vX.Y.Z-READY-TO-DEPLOY.zip` — that's the contents of `dist/`
with `index.html` at the top level. Drop it straight onto Netlify. No build
step runs, so nothing can be misconfigured, and secrets scanning doesn't
apply because there's no CI build.

### From a Git repo

Build command `npm run build`, publish directory `dist` — both already in
`netlify.toml`.

**The gotcha that causes "Page not found":** the source zip extracts into a
`daybook/` folder. If you commit that folder to a repo, everything Netlify
needs — `package.json`, `netlify.toml`, and eventually `dist/` — sits one
level below where it looks. It finds no build config, publishes the repo root,
and serves a 404 because there's no `index.html` there.

Two ways to fix it, either is fine:

- Commit the *contents* of `daybook/` at the repo root, so `package.json` is
  top-level; or
- Leave the folder and set **Base directory** to `daybook` in Site
  configuration → Build & deploy. Netlify then resolves `netlify.toml` and
  `dist` relative to that.

A 404 from Netlify's own error page means it served a directory with no
`index.html` in it — that's always a publish-directory problem, never an
application error.

**If the build fails on "likely secret":** that's Netlify's smart detection
matching the Firebase web API key against the Google API key pattern. It is not
a secret — every Firebase browser app ships its config, because the client has
to know which project to talk to, and Google documents this. Security comes
from the Firestore rules scoping documents to `request.auth.uid`.

Three fixes, in order of how much they preserve:

1. **`netlify.toml` already sets `SECRETS_SCAN_SMART_DETECTION_ENABLED=false`.**
   This turns off only the pattern heuristic; scanning of environment variables
   marked as secret keeps running, so a real leak still fails the build.
   Note it deliberately contains no API key — safelisting the value *by writing
   it into netlify.toml* just adds another scanned file containing it, which is
   self-defeating.

2. **Set it in the Netlify UI instead** — Site configuration → Environment
   variables → `SECRETS_SCAN_SMART_DETECTION_ENABLED` = `false`. Some setups
   don't pick these up from `netlify.toml`. For a narrower version, use
   `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` set to the key itself; putting it
   in the UI keeps the value out of the repo entirely, which is what makes the
   safelist work here when the file version doesn't.

3. **Guaranteed: stop shipping the key.** Set `DEFAULT_CONFIG = null` in
   `src/core/db/config.js`. The app then starts unconfigured and asks for the
   config in Settings → Cloud sync — a one-time paste per device, stored in
   localStorage. Every code path already handles this; it was the original
   design. Verified: with it nulled, the key appears zero times in the built
   bundle.

Avoid `SECRETS_SCAN_ENABLED=false`. That disables everything, including the
checks worth keeping.

**Never put the VAPID private key or Firebase Admin credentials in a `VITE_`
variable.** Vite bakes anything `VITE_`-prefixed into the browser bundle.
Those belong in the Netlify UI under their plain names, which is how
`.env.example` lists them.

## Checking WHICH build is live

Settings → About shows the version, the build id (`YYYYMMDD-HHMM`, UTC), when
it was built, and the loaded module list.

This exists because "is the deployed site actually running this code?" is
otherwise unanswerable from the outside, and it matters more than it sounds:
**a failed Netlify build leaves the previous successful deploy serving.** So a
fix can appear not to have worked when it simply never went out — which is
exactly the shape of a secrets-scanning failure blocking every deploy while
the old bundle stays live.

If the build time shown is older than the code you last pushed, the fix isn't
live yet and no amount of debugging the source will change what you're seeing.

## First paint

Fonts are loaded from `index.html` with `preconnect`, never with a CSS
`@import`. An `@import` can only be discovered after the stylesheet containing
it has downloaded and parsed, which serialises the whole chain — app CSS, then
fonts.googleapis.com, then fonts.gstatic.com, then the font files — with every
hop render-blocking. Preconnecting starts those handshakes immediately, in
parallel with the app JS.

The CJK font for Mandarin is loaded non-blocking (fetched as non-applicable
media, then switched on). It's a large download and only the Mandarin screens
need it, so it must never hold up first paint for everything else.

For reference, the mirror itself is *not* a bottleneck: parsing ~650KB of
cached records costs about 4ms, and writing it about the same. Worth measuring
before optimising — the obvious suspect was the wrong one.

## Layout, round two — three real bugs, found by actually reproducing it

The first fix (the undefined `byId`) was real but incomplete. Rather than
guess at what was still wrong, I built a harness that renders the real
Settings screen in a real DOM (jsdom + react-dom, not a mock) and clicks the
Layout tab exactly like a person would, then tried it against a battery of
stored-settings shapes. That surfaced three separate problems:

1. **A duplicate module id.** `src/hosted/index.jsx` still listed a
   placeholder for Directory — left over from before the real Directory
   module existed, the one stub I forgot to remove when Directory graduated
   from tier 2 (I did remember to remove Mandarin's). Two entries sharing the
   id `'directory'`, one real and one dead, polluted every screen that lists
   modules: Settings, Today's Apps section, the launcher.
2. **`nav` was never validated coming out of storage.** If it was ever
   anything but a proper array of strings — corrupted, hand-edited, written
   by an older build — every consumer (`.map`, `.includes`, `.filter`) threw
   immediately. Reproduced with a string, an object, and outright malformed
   JSON; all three crashed the unfixed code and all pass now.
3. **The "cap the bar at 4" rule silently stopped applying to the default.**
   Once Notes, Roster and Mandarin brought the integrated count to 7, a fresh
   install's default nav became all 7 — nothing enforced the cap on the
   fallback itself, only on manually adding beyond it.

Fixes: the stub is gone; `nav` is validated and deduplicated at the one place
untrusted data enters the app (`core/settings/settings.jsx`'s `load()`), with
the same guard on `setNav()` so the app's own code can't reintroduce a bad
shape either; and the default is now `defaultNav` in `registry.js`, capped and
defined exactly once so Settings and the shell can't drift apart on it again.
Ten corrupted-state scenarios, all passing against the fixed code.

If Layout still misbehaves after this, it would help to know whether it shows
the "Something broke" fallback card (meaning the boundary is catching a real
error — check the browser console for what it says) or something else
entirely, and whether you're on this build or possibly an older Netlify
deploy.

## The Settings crash, and the safety net now in place

Two bugs from earlier rounds, both the same mistake: a variable used in one
component's render without ever being declared in that component's scope —
`byId` in Layout, `repo` in Notifications. A plain JavaScript `ReferenceError`
during render, and nothing anywhere was catching it, so React unmounted the
entire tree. Blank screen, nothing to tap, no way back — because there was
genuinely nothing left rendered to interact with.

Both are fixed. I then ran a real lint pass (`no-undef`, with proper browser
globals) across the whole `src` tree to check for the same mistake elsewhere,
since one instance of it is a good reason to suspect a second — which is
exactly how the Notifications bug turned up. Zero remain.

**`src/core/shell/ErrorBoundary.jsx`** is the systemic fix, so a future
mistake like this — mine or anyone's — degrades instead of dying. It wraps
only the routed content, not the whole shell, so the top bar and bottom tabs
stay alive and clickable even if the current screen throws; tapping any tab
is itself an escape hatch before the fallback's own buttons matter. Verified
by actually rendering a component that throws through the real boundary — it
catches the error and shows the fallback, and a healthy screen still passes
through untouched.

## Why the app used to open blank

`loading` used to include `uid === undefined` — "auth hasn't confirmed yet."
That meant the cached mirror, which exists specifically to make reopening the
app instant, was gated behind the single slowest thing in the whole boot
sequence: a dynamic import of the Firebase SDK chunk (627KB, on a cold cache),
then Firebase Auth reading your session back from IndexedDB. The fast data
sat on disk the whole time, unused, until the slow network-dependent part
finished.

Fixed by remembering which account was signed in last (`daybook.lastUid`) and
reading *that* account's mirror synchronously on the very first render —
before auth has even started resolving. `loading` now means only "nothing to
show yet," which cached data satisfies immediately. Auth and sync then true
things up quietly behind whatever's already on screen.

Two cases where this can't help, both unavoidable and both rare: the very
first time you ever open the app on a device (nothing cached to guess from),
and switching to a different account on the same device (briefly shows the
previous account's cache before self-correcting once auth confirms — the
cloud-sync effect re-reads keyed on whichever uid actually resolves, so a
wrong guess never sticks).

## Read cost

Firestore bills per **document read**, so the whole sync design is built around
not reading. Three things make it cheap:

1. **A local mirror.** Every synced record is kept on the device. Opening the
   app and searching Directory read from memory, never from the cloud — 0
   reads however much you type.
2. **Delta sync.** A sync asks for `updatedAt > watermark`, so it reads only
   what genuinely changed. Nothing changed means nothing read.
3. **The watermark advances past your own writes.** You already hold what you
   just wrote, so there's no point paying to read it back. Without this,
   syncing after importing 1,900 staff would read all 1,900 straight back.

Measured over a session with 3,800 staff, a full CSV import, 50 edits and 200
syncs:

| | reads |
|---|---|
| First sync on a new device | 1,900 (once, unavoidable) |
| 1,000 searches and reloads | 0 |
| Sync after importing 1,900 staff | 0 |
| Sync after 50 edits made here | 0 |
| Sync picking up 4 remote changes | 4 |
| 200 syncs with nothing changed | 0 |

**No overlap window, deliberately.** The usual guard against clock skew is to
re-ask for the last N seconds every sync. It backfires twice: an idle app
re-reads the same tail forever, and a fast bulk import lands inside the window
so you pay to read your own import back. Skew is handled instead by one full
reconcile every 30 days (`RECONCILE_DAYS` in `repo.jsx`), which repairs
anything a delta could miss for a rounding error against the free tier.

### Sync modes

Settings → Cloud sync. These control **reads only**.

- **Manual** — pulls only when you tap the refresh icon in the top bar. Cheapest.
- **When the app opens** — one delta check per launch. The default.
- **Live** — an open listener using `docChanges()`, so still delta-only.

Writes always upload immediately in every mode. Writes are cheap (20,000/day
free) and you make a few dozen a day, so queueing them would mean an outbox and
conflict handling to save nothing measurable.

Settings → Cloud sync shows last sync time, reads consumed by it, and a running
total, so you can watch the actual usage rather than guess.

## Cloud sync

Settings → Cloud sync. Paste the Firebase config, sign in, publish the rules
it shows you. Three things worth knowing:

1. Config is stored at **runtime**, not baked in at build time — change
   projects without redeploying.
2. The config is not a secret. Every Firebase web app ships it to the browser.
   Security comes entirely from the Firestore rules on that screen.
3. The SDK is a **lazily loaded 627KB chunk**. If you never turn cloud sync
   on, you never download it.

"Upload this device's data" is a one-time move of anything created before you
switched sync on. Safe to run twice — records keep their IDs, so nothing
duplicates.

## Mandarin

Ported from the standalone drill app. Four scenarios, each with vocabulary and
a conversation; only the lines marked *You* are drilled.

Recognition uses the browser's own engine, which means **Chrome or Edge, over
HTTPS**. The screen says so plainly when either is missing rather than just
failing silently. The original could also score through Azure for syllable
accuracy and fluency numbers; that's left out because it needs an external SDK
and an API key, and the browser engine answers the question that matters — did
you say the right thing.

Scoring compares character by character after stripping punctuation, and takes
the best of the engine's alternatives, because Mandarin recognition regularly
returns the right sounds with the wrong homophone on its first guess. A phrase
that contains the target counts as a pass, so a trailing 啊 doesn't fail you.

Worth noting: I said earlier this had to be a tier-2 hosted app because its
data wouldn't fit the record envelope. That turned out to be wrong. Progress is
one record per scenario with the indices done, and the envelope's loose `data`
blob took it without complaint — so it's a full module, and progress syncs like
everything else.

## Build order from here

Loans next — the account carries a mode, `recurring` (monthly accrual, your
rent ledger) or `principal` (one-off loan with repayments), both feeding the
same charge/payment ledger. Keep the allocation UI from the rent ledger; it is
the strongest part of that file. Then Notes.

Keep each old app alive until its replacement is genuinely better. A big-bang
rewrite is how this dies at 40% done.

---

## Settings, themes and the config layer

App configuration lives in `src/core/settings/` — deliberately **not** in the
record store. Theme, what shows on Today, the bottom bar, and notification
prefs are *how you want the app arranged*, not things you track. Same
localStorage-now / Firestore-later seam as the repo.

**Themes:** Light (default, white), Dark, System (follows the OS), and Paper
(the original ledger cream). Adding a theme is one block in `tokens.css` — the
token *names* never change, only their values per theme, so no component needs
editing.

## The Today rule

Today shows what needs you today, nothing else:

- a **reminder** shows if it's due today or overdue — future and undated ones
  stay in the module;
- a **list** shows if it has open items and you've kept it on Today;
- **inbox** captures show until you sort or clear them.

Three levers sit on top, so you decide exactly what earns a place:

1. **Module switch** (Settings → Layout) — turn a whole module off Today.
2. **Pin** — force one record to always show, even against the rule. Stored as
   `home: 'pinned'` on the record; appears in a Pinned section up top.
3. **Hide** — the eye-off on a Today row sets `home: 'hidden'`: gone from Today,
   still in its module. "Clear inbox from home" is just this applied in bulk.

Also configurable in Settings → Layout: which apps appear in the Apps section
(or whether it shows at all), and which modules/apps sit in the bottom bar
(Today is always first, up to four more).

## Notifications — three layers

1. **In-app bell.** Always works, no setup. Modules opt in with
   `raiseEvents({ repo })` on their manifest; a `dedupeKey` stops the same
   event being raised twice.
2. **Local device notification.** Fires on the phone's notification shade when
   something comes due *while the app is open or recently backgrounded*. No
   server, no subscription — just permission. This covers most of what people
   actually want from reminders.
3. **Real push to a closed phone.** Needs `netlify/functions/send-reminders.js`
   running, which needs cloud sync on plus Firebase Admin credentials in
   Netlify. Enabling notifications now *saves* the subscription as a
   `system.pushSubscription` record, which is what the sender delivers to —
   without it stored, the sender has no address and silently does nothing.

The collector loop reads the repo through a ref. Depending on `[repo.loading]`
alone captured the repo at app-start, so any reminder created afterwards was
invisible to notifications for the whole session.

The sender queries a **range on `dueAt` only** and filters type and done-state
in code. The obvious query — type, doneAt and dueAt together — mixes equality
and range across three fields, needs a composite index, and fails with
FAILED_PRECONDITION until someone builds one.

The client half runs from the static site: permission, service worker,
subscribe, and a **Send a test** button that fires a real notification on the
device with no server. Categories are opt-in per module — a module declares a
`notifications: [...]` array in its manifest and the settings page picks it up.

Scheduled delivery (being woken at 7am for a due reminder) is the part a PWA
genuinely cannot do alone. `netlify/functions/send-reminders.js` is the cron
job that does it; it needs:

1. **VAPID keys** — `npx web-push generate-vapid-keys`, then set
   `VITE_VAPID_PUBLIC_KEY` (client) and `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT`
   (server env). Sample keys are in `.env.example` — **regenerate before
   deploying.**
2. **Firestore** — so the function can read your reminders and the device push
   subscriptions. Until sync is on, local + test notifications still work;
   only scheduled delivery waits.

The Telegram-bot route from earlier remains the lower-maintenance alternative
if you don't want to run Web Push.

## PWA / install

`public/manifest.webmanifest`, icons, and `public/sw.js` are wired up, so the
app installs to the home screen. On iPhone, notifications only work once it's
installed and opened from the home screen — that's an Apple constraint, and the
Notifications tab says so when it detects it can't subscribe.
