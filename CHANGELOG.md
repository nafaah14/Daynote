# Changelog

Versions are semantic; the **build id** (`YYYYMMDD-HHMM`, UTC) identifies the
individual compile. Both are shown in **Settings → About**, and the version is
in the zip filename.

Two builds of the same version can differ if one was made before a fix — so
when checking whether something is live, compare the **build id**, not just
the version.

---

## 0.26.1

**Fixed**
- **Sheet footer hidden behind the on-screen keyboard on some devices.**
  Every add/edit sheet shifts itself above the keyboard using a live
  `--kb-inset` measurement, but a field that grabs focus right as the sheet
  opens (autoFocus, almost always the first field) can request the keyboard
  before that measurement's usual trigger — a `visualViewport` resize event
  — is guaranteed to fire afterward. When it didn't, the inset stayed at 0
  for the sheet's whole life, leaving the Save/Add button (and, on tall
  sheets, the header) hidden under the keyboard. Most visible on Stock's
  item sheet, the longest one in the app. Fixed by re-measuring a few times
  shortly after any focus inside the sheet, which catches the correct
  height regardless of whether that event ever lands.

---

## 0.26.0

A new module: Stock — the personal household inventory this app was missing.
One place for what you need to buy, what you already have, and where to find
the hard-to-get stuff.

**New**
- **Stock module** — track things you keep at home and buy again and again
  (toiletries, cleaning supplies, anything routinely restocked).
  - Each item has a **category**, an optional **shop** (handy for items that
    are hard to find) and **price**, a **quantity on hand**, and a **restock
    threshold** — once quantity drops to the threshold or below, it's
    automatically flagged as needing a buy.
  - The **Shopping list** tab shows only what currently needs buying;
    **All stock** shows everything you're tracking. Quick +/− controls on
    every row adjust quantity in one tap — no need to open a sheet for
    routine use.
  - **Barcode scanning** — scan a product's barcode with your camera to
    instantly find an existing item (to bump its quantity) or start a new
    one with the code already attached. An item can hold **multiple
    barcodes** — handy when several brands of the same thing (different
    toilet paper packs, say) should all point at one tracked item instead
    of creating duplicates. Falls back to manual code entry on browsers
    without camera barcode support.
  - Low-stock items appear on **Today** and raise a notification once they
    cross the threshold, same as reminders and payments.
  - The assistant can add new stock items and update quantities by voice or
    text ("we're down to 2 rolls of toilet paper", "bought 3 more").

---

## 0.19.2

The org structure now validates itself against the actual staff directory
and can auto-sync position counts to match reality.

**New**
- **Discrepancy audit banner** — shown at the top of the Org Structure
  page whenever the structure's declared headcount doesn't match the staff
  directory. Checks run at three levels:
  - **Per-position**: does the "existing" count for "Senior Technician" in
    Mechanical match how many people in the directory actually have that
    designation in that unit?
  - **Per-unit**: does the unit's total existing headcount match the number
    of directory staff assigned to it? Shows the directory count inline
    when they differ.
  - **Department-wide**: does the sum of all existing counts match the
    total number of people in the directory for this department?
  - Also flags staff assigned to the department but to a unit that doesn't
    exist in the structure, or to no unit at all.
  The banner is collapsible and lists every issue with full context.
- **Per-position mismatch highlighting** — rows where the "existing" count
  doesn't match the directory get a tinted background, a coloured input
  border, and a small "dir: N" label showing the actual count.
- **"Sync from staff" button** — appears on any unit card with
  discrepancies. One tap updates every position's existing count to match
  the directory, adds new rows for job titles found in the directory but
  missing from the position table, and zeroes positions whose job title no
  longer appears. Vacant counts are never touched.

---

## 0.19.1

Fixes the Purpose & Services text fields, which had a real editing bug on
mobile.

**Fixed**
- **Rich text fields (Purpose & Services) rewritten to fix mobile editing.**
  The previous version synced React state back into the field on every
  keystroke via `dangerouslySetInnerHTML`, which fights with how mobile
  keyboards work — predictive text, autocorrect, and IME composition all
  fire input events mid-keystroke, and resetting the field's content in the
  middle of that is what was corrupting typed text. Rewritten to match the
  pattern Notes already uses successfully: the field is uncontrolled while
  focused (the DOM is the source of truth during editing), and the value is
  only read back out and saved on blur. This also cuts a write-per-character
  down to one write per edit.
- Placeholder text now uses a CSS-only `:empty::before` rule instead of a
  JS-managed overlay div, removing another point where React and the
  contentEditable's own DOM state could get out of sync.
- Pasted content is now sanitized down to plain formatting tags (bold,
  italic, underline, lists) — same allowlist approach Notes uses — so
  copy-pasted content from elsewhere can't drag in scripts or stray markup.

---

## 0.19.0

New module: Org Structure for Male' Power Generation Department.

**New**
- **Org Structure module** with three tabs:
  - **Structure** — unit cards with editable position/headcount tables
    (existing + vacant counts, auto-totalled), department summary strip,
    unit head dropdown (populated from the unit's own staff in Directory),
    add/remove units and positions.
  - **Purpose & Services** — rich-text fields per unit with bold, italic,
    underline, and ordered/unordered lists via a compact toolbar. Fields
    auto-size to fit content (no internal scrollbar).
  - **Staff** — the department's staff filtered live from the main
    Directory (by department name match), with search and unit/designation
    filters. Unit can be changed here via a dropdown and the change flows
    straight to Directory (same record, no sync needed).
- **JSON import** — upload the exported org structure JSON to seed units,
  positions, and purpose/services text.
- **Print preview** — landscape-oriented tree view: department at the top,
  units as branches with position tables, followed by a purpose & services
  page. Uses the same print-overlay mechanism as Payments statements and
  Directory exports.
- Unit head selection auto-clears the previous head when a new one is
  chosen (one head per unit enforced). The crown marker from v0.18.0 shows
  here too.

---

## 0.18.0

Directory can now produce a real printable/exportable list, and tracks unit
heads.

**New**
- **Export preview.** A new "Export" button in Directory's toolbar opens a
  print-formatted preview of whatever's currently showing — respects search
  and every active filter. From there: "Print / Save PDF" (fixed column
  widths via `<colgroup>`, so it won't reflow oddly when printed) or
  "CSV" for a plain spreadsheet file. Reuses the same overlay + print-only
  body class mechanism Payments' statement preview already used.
- **Unit heads.** A person's editor now has a "Unit head" toggle, scoped to
  their (Department, Unit) pair specifically — not just Unit name, since
  several departments reuse the same unit name. Turning it on for someone
  when another person already holds that unit's head position shows who'll
  be replaced *before* you save, then demotes them automatically on save
  (one head per unit is the norm, so this is enforced rather than just
  suggested). Unit heads show a small crown next to their name in the list,
  detail view, and export. The Filter sheet gained a matching "Unit heads"
  option: all staff / unit heads only / excluding unit heads.

---

## 0.17.0

Directory can now sync itself from the SID 2.0 staff-directory PDF export,
not just CSV.

**New**
- **PDF import for Directory.** Upload the SID 2.0 export PDF and it's
  parsed directly (no CSV conversion step) and matched against your
  directory by Staff ID. New staff are added automatically. Anyone already
  in your directory whose Designation, Department, Unit, Extension, or Name
  differs is queued for review — one person at a time, old value vs new,
  with Update / Ignore (plus "update rest" / "ignore rest" shortcuts once
  you've seen enough). Nothing is written until you've been through the
  whole queue. Mobile numbers are never touched by either importer.
- The PDF parser (pdfjs-dist) is loaded on demand only when you tap
  "Import PDF" — it doesn't add to the app's normal load time.

---

## 0.12.0

Notes gets room to breathe, and a new module for anyone you pay or who pays
you.

**New**
- **Payments module.** Rent, loans, subscriptions — anything with a
  counterparty and a recurring amount. Pay and Receive are deliberately
  isolated: each tab shows only its own total (what you owe / what's owed to
  you), never a combined figure. Wording stays generic ("payment", "who
  pays/pays you") rather than assuming rent.
  - Set a due day of the month per item; Daybook reminds you when it's due,
    in-app and via push, the same way reminders do.
  - What's owed is computed from the item's start date and amount minus what
    you've logged — nothing is materialised month-by-month, so this doesn't
    grow the store the way a stored monthly charge would.
  - Opening an item shows its running balance, a pending-by-month breakdown,
    and its payment history, with a bottom-right button to log a new payment
    without leaving that screen.
- **Full-screen note editor.** Replaces the old bottom sheet, which capped
  the writing area at under half the screen inside an already-capped sheet.
  Title and body now fill essentially the whole screen; the toolbars above
  and below are icon-only and collapse related controls into dropdowns
  (bullet style, text size, colour) instead of spending a row of buttons on
  each.
- **Five bullet/number styles** in the note editor — disc, circle, square,
  numbered, lettered — up from the one fixed bullet style before.

**Changed**
- `send-reminders.js` (the scheduled push function) now covers any module
  with a due date, not just reminders — payments due dates push the same way.

---

Interaction and density pass — mostly about making things reachable and
editable where you actually are.

**New**
- **Editable from Today.** Tapping a reminder or a pinned note on Today opens
  its editor in place. Built on a small editor registry so Today can open any
  module's editor by record without importing that module — the core/module
  boundary stays intact.
- **List expand/collapse.** A chevron on each list row (both the Lists screen
  and Today) peeks at its open items inline. Tapping the row still opens the
  list; the chevron only toggles the preview.
- **Directory detail view.** Opening a staff member now shows a read-only card
  first — no keyboard springing up — with Close and Edit. Editing is a
  deliberate second step. Back returns to the list at the same scroll position.
- **Clear recently-done reminders.** A Clear button on that section.
- **Bottom-right action button** (Google-Keep style) on Reminders, Notes,
  Lists and Directory, within thumb reach. On Today it's a Search button
  instead, since Today's job is to find, not to add.

**Changed**
- **Swipe navigation** now re-checks for an open editor or focused field at
  both the start AND end of the gesture. A swipe begun on the page could
  previously still complete a navigation after you'd started typing; it can't
  now.
- **Mobile density** tightened a notch — smaller base font, less row padding
  and section spacing on small screens only, so more than three items fit
  without feeling cramped. Desktop is unchanged.

**Still pending**
- More Mandarin vocabulary (deferred to a later build).

---

## 0.9.0

First properly versioned build. Everything before this was unversioned, which
is what made "is this fix actually deployed?" impossible to answer.

**Modules (7 integrated, 2 hosted)**
- **Inbox** — capture without deciding what something is; triage later.
- **Reminders** — time-triggered, with recurrence that rolls forward on
  completion rather than materialising future instances.
- **Lists** — context-triggered, in two modes: `clearable` (shopping) and
  `collection` (films, books, with ratings).
- **Notes** — rich text (bold/italic/underline/bullets), six colour tiles with
  separate light and dark values, HTML sanitised before it reaches the DOM.
- **Directory** — 1,900+ staff, faceted filters, CSV import that scores column
  *content* rather than trusting the header row, and never blanks a field the
  import doesn't carry.
- **Roster** — salary and promotion tracking, manual drag ordering, links to
  Directory for identity.
- **Mandarin** — four scenarios, speech recognition scoring per character.
- Hosted placeholders: Streaming, Network.

**Architecture**
- Modules import from `core`; `core` never imports modules; modules never
  import each other. Person identity lives in `core/people.js`, which is how
  Directory and Roster share people without either importing the other.
- One record envelope for everything, with a loose `data` blob so modules can
  add fields for years without a migration.

**Sync**
- Local mirror of every record: opening the app and searching cost zero reads.
- Delta sync — only records whose `updatedAt` is newer than the last
  watermark. Idle syncs read nothing at all.
- Three modes: manual, on-open, live. Reads only; writes always go straight up.
- Monthly full reconcile as the clock-skew safety net, instead of an overlap
  window taxing every sync.

**Notifications**
- In-app bell with unread badge and retained history.
- Local device notification when something comes due while the app is running.
- Scheduled push via Netlify function (needs Firebase Admin credentials).

**Fixed in this version**
- Duplicate `'directory'` module id — a leftover hosted-app stub survived
  Directory's promotion to a real module, corrupting every screen that lists
  modules.
- Two `ReferenceError` crashes in Settings (`byId` in Layout, `repo` in
  Notifications) that unmounted the whole app.
- Notification collector held a stale repo, so any reminder created after
  launch was invisible for the rest of the session.
- Push subscriptions were created and thrown away, so scheduled push had no
  address to deliver to.
- Scheduled sender used a three-field query needing a composite index; now
  ranges on one field and filters the rest in code.
- App opened blank while waiting on Firebase Auth before reading its own
  cache — now paints from cache on the first render.
- Fonts loaded via CSS `@import`, serialising four render-blocking hops; now
  preconnected `<link>`s, with the CJK font non-blocking.
- CSV import fired one write per row; now a single batched write.
- `nav` setting is validated and deduplicated at the storage boundary.
- Error boundary around routed content, so a screen-level crash leaves the
  shell and tabs usable.

---

## Deploying

`daybook-vX.Y.Z-READY-TO-DEPLOY.zip` is the built site with `index.html` at
the top level — drop it on Netlify as-is.

The source zip extracts into a `daybook/` folder. Deploying that folder
directly gives Netlify's "Page not found", because `index.html`,
`package.json` and `netlify.toml` are all one level down from where it looks.
Either commit the folder's *contents* at the repo root, or set the site's
**Base directory** to `daybook`.

## Releasing a new version

```bash
npm version patch     # or minor / major — updates package.json
npm run build
```

The version flows automatically into Settings → About and should go in the zip
filename. Add an entry here describing what changed.
