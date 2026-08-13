# Daybook — Assistant Module: Implementation Brief

Reference design: `design-reference/daybook-assistant-mockup.html` (visual reference only — do not copy its HTML/CSS structure, match layout/motion/interaction pattern using our actual theme tokens).

---

## 1. Overview

Add an AI assistant that lets the user type or speak simple commands ("remind me to pay DHIRAAGU bill Friday", "what's due this week", "add a note about turbine 2") and have them executed against the app's existing modules — without duplicating any Firestore logic.

**Core principle:** the assistant module is a thin orchestration layer. It never talks to Firestore directly. It calls the *existing* exported functions from other modules (`reminders`, `notes`, `ledger`, `lists`) the same way any other consumer of those modules would.

---

## 2. Architecture

```
User input (text or mic)
   │
   ▼
src/modules/assistant/  (client)
   │  1. For queries: fetch relevant data client-side first (e.g. upcoming
   │     reminders, ledger due items) and include as context
   │  2. Send { message, context } to Netlify Function
   ▼
netlify/functions/assistant.js  (server, thin relay only)
   │  - Holds ANTHROPIC_API_KEY (Netlify env var, never in repo)
   │  - Sends message + context + tool definitions to Claude API
   │  - Returns Claude's response (text and/or tool_use blocks) as JSON
   ▼
src/modules/assistant/ (client)
   │  - If tool_use returned: execute the matching action using the
   │    TARGET module's existing exported function (e.g. reminders.create())
   │  - Render a result card (see design reference)
   │  - Optionally send the tool result back to Claude for a natural-
   │    language confirmation line
```

**Import rule stays intact:** `assistant` imports from `reminders`, `notes`, `ledger`, `lists` (read/write functions they already export) — never the reverse, and assistant doesn't reach into their Firestore collections directly.

---

## 3. Netlify Function

**File:** `netlify/functions/assistant.js`

- Runtime: Node (Netlify Functions default)
- Env var required: `ANTHROPIC_API_KEY` (set in Netlify site settings → Environment variables, NOT in `netlify.toml` or repo)
- Model: `claude-sonnet-4-6`
- Request in: `{ message: string, context: object }` — `context` holds whatever client-side data was pre-fetched for query-type questions (Phase 1, Option A — see brief history)
- Request out to Anthropic API: system prompt + tool definitions (below) + user message with context injected
- Response out to client: forward Claude's `content` array as-is (text blocks + tool_use blocks); client handles interpretation

Keep this function dumb — no Firestore admin SDK, no business logic, no validation beyond basic request shape. All of that stays client-side where it already exists.

---

## 4. Tool schema (Phase 1 — 5 tools)

Define these as the `tools` array sent to the Claude API. Names/params below are a starting spec — adjust field names to match each module's actual existing function signatures.

```json
[
  {
    "name": "create_reminder",
    "description": "Create a new reminder with a title and due date/time",
    "input_schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "due_date": { "type": "string", "description": "ISO 8601 date, e.g. 2026-08-14" },
        "due_time": { "type": "string", "description": "24hr time, e.g. 09:00, optional" },
        "notes": { "type": "string", "description": "optional additional detail" }
      },
      "required": ["title", "due_date"]
    }
  },
  {
    "name": "add_note",
    "description": "Create a new note with a title and content",
    "input_schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "content": { "type": "string" }
      },
      "required": ["content"]
    }
  },
  {
    "name": "add_list_item",
    "description": "Add an item to an existing named list, optionally with a category",
    "input_schema": {
      "type": "object",
      "properties": {
        "list_name": { "type": "string" },
        "item_text": { "type": "string" },
        "category": { "type": "string", "description": "optional" }
      },
      "required": ["list_name", "item_text"]
    }
  },
  {
    "name": "query_reminders",
    "description": "Not directly executed — reserved. Reminder queries are answered from pre-fetched context in Phase 1, not a live tool call.",
    "input_schema": { "type": "object", "properties": {} }
  },
  {
    "name": "query_ledger_due",
    "description": "Not directly executed — reserved. Ledger due-item queries are answered from pre-fetched context in Phase 1, not a live tool call.",
    "input_schema": { "type": "object", "properties": {} }
  }
]
```

**Note on queries (Option A, as decided):** for "what's due this week" style questions, the client pre-fetches the relevant reminders/ledger data *before* calling the Netlify Function, and passes it in as `context`. Claude summarizes from that context in its text response rather than calling a tool. Only the three action tools (`create_reminder`, `add_note`, `add_list_item`) are real tool calls in Phase 1. The two query tools above are placeholders for Phase 2 (see §8) — fine to omit them entirely from the actual `tools` array for now and just handle queries via context injection + plain text response.

---

## 5. Module file structure

```
src/modules/assistant/
  index.jsx              — entry, registers overlay + nav button
  AssistantBar.jsx        — collapsed pill (bottom nav center button)
  AssistantOverlay.jsx    — expanded sheet: input, mic, card stack
  ResultCard.jsx          — single result card component, accepts
                             { type, accentToken, icon, title, subtitle, onTap }
  useAssistant.js          — hook: manages input state, calls Netlify
                             Function, executes returned tool calls,
                             manages card stack/history state
  actions.js               — maps tool_use names → calls into other
                             modules' exported functions
                             (imports from modules/reminders, modules/notes,
                             modules/ledger, modules/lists — one-way only)
  assistant.css            — component styles, new accent tokens below
```

Register in `src/registry.js` per your existing module registration pattern — but see §6, the assistant is NOT a pinnable/reorderable nav item like other modules; it's a fixed fixture.

---

## 6. Nav bar changes

- Bottom nav restructured: center slot permanently reserved for the assistant button (raised, larger, ~62px vs standard ~48px icon size), flanked by pinned modules on either side, `More` remains fixed rightmost — unchanged
- Assistant button is NOT part of the pinnable/reorderable module list
- **Settings → Layout** (existing screen) gets updated, not replaced:
  - Assistant appears in the list as a locked/non-removable entry purely for clarity (so the user understands why the center slot isn't available to reassign) — greyed out or with a "always active" badge, no toggle
  - Reorder/pin logic for the remaining modules stays exactly as it works today, just now targeting fewer total visible pinned slots since center is reserved
  - `More` entry stays locked/fixed as it already is today
- **More screen**: no changes — continues to show the full module list, pinned or not

---

## 7. Result card → module tap-through

Each card's `onTap` should route to the actual record in its owning module's existing overlay/detail view (e.g. tapping a reminder card opens the Reminders module already scrolled/focused to that item) — reuse whatever deep-link/open-record pattern already exists for that module; don't build a new one.

---

## 8. Explicitly out of scope for Phase 1

- Directory, Org Structure, Roster tools — add once the pattern is proven
- Multi-turn tool use / Claude calling a tool, getting a result, and deciding to call another tool in the same turn (Option B from earlier discussion) — Phase 1 is single-shot: one user message → context-informed answer or one tool call → one card
- Persisting assistant conversation history to Firestore — Phase 1 card stack can be session-only (resets on app reload); revisit if it proves useful to keep history longer
- Undo / edit-after-creation from within the assistant itself — user can always edit via the normal module UI after the fact

---

## 9. Suggested build order

1. Netlify Function + env var setup (test with `curl` or Postman before touching UI)
2. `actions.js` — wire the 3 action tools to existing module functions, test standalone
3. Nav bar visual restructure (center button, Settings → Layout update) — matches mockup
4. `AssistantOverlay` + `ResultCard` UI — matches mockup, initially with mocked data
5. Wire `useAssistant` to the real Netlify Function + `actions.js`
6. Mic input (Web Speech API) last — it's additive and independent of everything else

---

## 10. Things to flag back if any of these don't match reality

- Actual exported function names/signatures in `reminders`, `notes`, `ledger`, `lists` modules (this brief guesses field names — Claude Code should read the real files first)
- Whether Settings → Layout currently stores pin config in Firestore or localStorage
- Existing deep-link/open-record pattern for tap-through (§7) — if none exists yet, that's a small addition needed first
