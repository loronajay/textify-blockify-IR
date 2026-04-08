# Phase 5C Plan: Self-Contained Prompt UI

**Project:** Prompt-to-Blocks Engine
**Status:** Planning
**Depends on:** Phase 5B complete (bridge, MCP, auto-connect all verified end-to-end)

---

## Goal

Make TB2 usable by general TurboWarp users — no terminal, no Node.js, no bridge, no IR.

A user loads the Blockify 2 extension from a hosted URL, enters their API key once, types
a prompt, and clicks Approve. Blocks appear. That is the entire flow.

The bridge remains fully functional for developers and Claude Code / Codex users. This phase
adds a second, self-contained path that lives entirely inside the extension.

---

## What This Phase Is Not

- **Not** a replacement for the bridge or MCP path — those stay unchanged
- **Not** a change to the IR grammar, parser, or validator
- **Not** multi-sprite commit — still one sprite at a time (existing limit)
- **Not** a hosted AI service — users bring their own API key (BYOK)
- **Not** Phase 6 — no TurboWarp fork, no native sidebar, no DOM surgery on TurboWarp's UI

---

## Deliverables

1. **Unified floating panel** — persistent, collapsible panel inside Blockify 2 with five views:
   Collapsed, Idle, Settings, Thinking, Proposal. Replaces the current ephemeral proposal panel.
2. **In-extension agent loop** — prompt → get state → build prompt → call AI → parse IR →
   propose → approve/reject. All inside the extension, no bridge required.
3. **Provider clients** — Claude (Anthropic) and OpenAI fetch wrappers, browser-compatible,
   no new npm dependencies.
4. **API key storage** — `localStorage`-backed key and provider selector. Never leaves the
   browser except as an Authorization header to the chosen provider.
5. **IR grammar inlined at build time** — esbuild imports `IR_GRAMMAR.md` as a text string
   so the system prompt is always current without a network fetch.
6. **Railway hosting** — `blockify-turbowarp-2.embedded.js` and `textify-turbowarp-2.js`
   served at stable public URLs with correct CORS headers.
7. **Rebuild** — `npm run build:blockify2` after all source changes.
8. **Updated `PROJECT_STATUS.md` and `CLAUDE.md`** file listing.

---

## Risks — Verify Before Writing Code

Each item below is a console check in TurboWarp before any implementation starts.
These take ~15 minutes and prevent building on a wrong assumption.

### R1 — fetch to api.anthropic.com from browser TurboWarp

In browser TurboWarp (not Desktop), run from an unsandboxed extension or DevTools:

```js
fetch('https://api.anthropic.com/v1/models', {
  headers: { 'x-api-key': 'sk-ant-test', 'anthropic-version': '2023-06-01' }
}).then(r => console.log('status:', r.status)).catch(e => console.error(e))
```

Expected: a response (even 401 is fine — means the request got through).
Failure mode: CORS block. If blocked, we need a thin CORS proxy on Railway.

### R2 — fetch to api.openai.com from browser TurboWarp

Same pattern:

```js
fetch('https://api.openai.com/v1/models', {
  headers: { 'Authorization': 'Bearer sk-test' }
}).then(r => console.log('status:', r.status)).catch(e => console.error(e))
```

Same expected result and failure mode as R1.

### R3 — localStorage accessible from extension context

```js
localStorage.setItem('tb2_test', 'hello')
console.log(localStorage.getItem('tb2_test')) // should print 'hello'
localStorage.removeItem('tb2_test')
```

Expected: works. Failure mode: SecurityError — if sandboxed, need an alternative
(sessionStorage, or a global object on the extension instance).

### R4 — Panel DOM injection in browser TurboWarp

The existing proposal panel injects a `div` into `document.body`. Confirm this
works in browser TurboWarp the same way it does in Desktop. Open browser TurboWarp,
load the extension, trigger a proposal from the existing `propose IR from clipboard`
block, and confirm the panel appears correctly.

### R5 — esbuild text import for IR_GRAMMAR.md

In `scripts/build-blockify2-embedded.mjs`, add a test import:

```js
import grammar from '../IR_GRAMMAR.md' assert { type: 'text' }
```

If esbuild handles this, the grammar is bundled as a string at build time.
If not, fallback is to read `IR_GRAMMAR.md` at build time and inject it as a
`const GRAMMAR = \`...\`` string literal via a small build script.

---

## Panel State Machine

The panel is created once at extension load time and persists for the session.

```
[Collapsed] ←─────────────────────────────────────────────┐
  small handle in corner                                   │ minimize button
  click → [Idle]                                           │
                                                           │
[Idle] ──────────────────────────────────────────────────→ ┘
  prompt textarea + Send button
  gear icon → [Settings]
  Send → validate (key set?) → [Thinking]

[Settings]
  provider selector: Claude | OpenAI
  API key input (password field)
  Save → [Idle]
  Cancel → [Idle]

[Thinking]
  spinner + "Working…"
  (no user interaction — request in flight)
  success → [Proposal]
  NO_CHANGE → [Idle] + status message "No changes needed"
  ERROR / network failure → [Idle] + status message (copyable)

[Proposal]
  block preview (same visual renderer as current proposal panel)
  "Approve" (green) / "Reject" (red) buttons
  Approve → commit → [Idle] + "Done ✓"
  Reject  → discard → [Idle]
```

**`showProposalPanel` is retired.** It currently spawns an ephemeral div. After Phase 5C
it becomes a method on the panel instance that transitions to Proposal view. Both the
in-extension agent and the bridge path call this method — the bridge path continues
to work unchanged from the user's perspective.

---

## In-Extension Agent Loop

When the user hits Send from the Idle view:

```
1. Read API key + provider from localStorage
2. Call __tb2TextifyHooks.exportAllStacksText(editingTarget) → IR string
3. buildSystemPrompt(irText) → system prompt (includes inlined IR_GRAMMAR.md)
4. buildUserPrompt(userPromptText) → user message
5. Call provider client (Claude or OpenAI) → raw response text
6. parseAgentResponse(responseText) → { type: 'IR_ONLY', ir } | { type: 'NO_CHANGE' } | { type: 'ERROR', reason }
7a. IR_ONLY → call this.proposeIR(ir)
    → on validation failure: retry once with error fed back to model (step 4 again)
    → on second failure: transition to error view with copyable message
7b. NO_CHANGE → transition to Idle with "No changes needed"
7c. ERROR → transition to Idle with copyable error message
```

### Prompt builder (in-extension version)

Same contract as `agent/prompt-builder.js`. Inlined into `blockify-turbowarp-2.js`
as two functions:

```js
function buildTB2SystemPrompt(irText) { ... }  // includes grammar + current IR
function buildTB2UserPrompt(userText) { ... }   // wraps user message
```

### Response parser (in-extension version)

Same contract as `agent/response-parser.js`. Inlined as:

```js
function parseTB2AgentResponse(text) { ... }   // returns { type, ir?, reason? }
```

Do not `require` the existing Node.js files — they use `fs` and won't work in the
browser. Port the logic only (no filesystem code involved in either file).

---

## Provider Clients

Two thin wrappers. Both accept `(systemPrompt, userPrompt, apiKey)` and return the
model's response text as a string.

### Claude client

```
POST https://api.anthropic.com/v1/messages
Headers:
  x-api-key: {apiKey}
  anthropic-version: 2023-06-01
  content-type: application/json
Body:
  model: claude-opus-4-6  (or latest Sonnet — configurable)
  max_tokens: 4096
  system: {systemPrompt}
  messages: [{ role: 'user', content: userPrompt }]
Response: message.content[0].text
```

### OpenAI client

```
POST https://api.openai.com/v1/chat/completions
Headers:
  Authorization: Bearer {apiKey}
  content-type: application/json
Body:
  model: gpt-4o
  max_tokens: 4096
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]
Response: choices[0].message.content
```

Both clients throw a descriptive error on non-2xx responses (include status + body
excerpt) so the panel can display it usefully.

---

## Retry UX

On `proposeIR` validation failure after the AI response:

1. **First failure:** silently rebuild the user prompt with the validation error appended,
   call the provider again (same session, same API key). Show "Retrying…" in the panel.
2. **Second failure:** transition panel to error view. Show the validation error as a
   copyable text block with a "Copy error" button. User can paste it into the prompt
   textarea and re-send manually with additional instructions.

No infinite loops. Max 2 total attempts per Send action.

---

## API Key Storage

Keys are stored in `localStorage` under these keys:

```
tb2_provider   "claude" | "openai"
tb2_api_key    the raw key string
```

The key is only ever sent as an HTTP header to the chosen provider's API endpoint.
It is never sent to Railway, never logged, never leaves the browser except as that header.

On first load: if no key is set, the panel opens in Settings view instead of Idle.

---

## IR Grammar Inlining

`IR_GRAMMAR.md` must be part of the system prompt. In the browser there is no filesystem.

Build-time solution: in `scripts/build-blockify2-embedded.mjs`, read `IR_GRAMMAR.md`
and pass it as a define or injected constant via esbuild, or use esbuild's text loader:

```js
// in build script
import { readFileSync } from 'fs'
const grammar = readFileSync('IR_GRAMMAR.md', 'utf8')
// pass as esbuild define: IR_GRAMMAR_TEXT = JSON.stringify(grammar)
```

In source:
```js
const IR_GRAMMAR_TEXT = __IR_GRAMMAR_TEXT__  // replaced at build time
```

Verify R5 first — if esbuild's native text import handles it, use that instead.

---

## Railway Hosting

Two files need to be hosted at stable public URLs:

```
blockify-turbowarp-2.embedded.js   ← the file users load in TurboWarp
textify-turbowarp-2.js             ← companion extension
```

Requirements:
- CORS header: `Access-Control-Allow-Origin: *` (TurboWarp fetches extensions cross-origin)
- Stable URL that doesn't change between deploys (versioned path or fixed filename)
- Served over HTTPS

A minimal Express server on Railway (or static file hosting) is sufficient.
The bridge does **not** need to be hosted — it remains local for the developer path.
Phase 5C general users never need the bridge.

---

## Session Flow (After Phase 5C)

### General user
1. Open TurboWarp (browser or Desktop)
2. Load Blockify 2 from hosted URL — panel appears, Settings view opens (first time)
3. Enter API key, select provider, Save
4. Panel shows Idle — prompt textarea ready
5. Type: *"add a score counter that increases when the player touches a coin"*
6. Hit Send → Thinking → Proposal panel with block preview
7. Click Approve → blocks appear in workspace
8. Repeat

### Developer (unchanged)
Bridge + MCP path continues to work exactly as before. The unified panel shows Idle
when no bridge proposal is active; if a bridge proposal arrives, the panel transitions
to Proposal view automatically.

---

## TDD Plan

Write tests first, then implement.

### New test file: `__tests__/blockify2-prompt-ui.test.js`

| Test | What it covers |
|---|---|
| Panel initialises in Idle state when key is set | Panel creation |
| Panel initialises in Settings state when no key | First-run flow |
| Send transitions to Thinking | State machine |
| NO_CHANGE response transitions to Idle with message | Response handling |
| IR_ONLY response calls proposeIR | Agent loop integration |
| Validation failure triggers one silent retry | Retry logic |
| Two consecutive failures show copyable error | Error state |
| Approve transitions to Idle with "Done ✓" | Proposal flow |
| Reject transitions to Idle | Proposal flow |
| Minimize collapses panel | Collapse toggle |

### New test file: `__tests__/blockify2-provider-clients.test.js`

| Test | What it covers |
|---|---|
| Claude client sends correct headers and body | Claude fetch wrapper |
| Claude client returns response text | Claude fetch wrapper |
| Claude client throws on non-2xx with status in message | Error handling |
| OpenAI client sends correct headers and body | OpenAI fetch wrapper |
| OpenAI client returns response text | OpenAI fetch wrapper |
| OpenAI client throws on non-2xx with status in message | Error handling |

### Unit tests for inlined prompt/response logic

Add to existing pattern — inline functions `buildTB2SystemPrompt`,
`buildTB2UserPrompt`, `parseTB2AgentResponse` are unit-tested directly.

---

## File Layout After Phase 5C

```
textify-and-blockify-2/
  blockify-turbowarp-2.js                ← panel, agent loop, provider clients, prompt/response logic added
  blockify-turbowarp-2.embedded.js       ← rebuilt (includes IR_GRAMMAR.md inlined)
  __tests__/
    blockify2-vm-writer.test.js          ← unchanged
    blockify2-preview-ui.test.js         ← updated: showProposalPanel now delegates to panel
    blockify2-bridge-client.test.js      ← unchanged
    blockify2-prompt-ui.test.js          ← NEW: panel state machine + agent loop
    blockify2-provider-clients.test.js   ← NEW: Claude + OpenAI fetch wrappers
  planning-documents/
    PLAN_PHASE5C_PROMPT_UI.md            ← this file

scripts/
  build-blockify2-embedded.mjs           ← updated: inlines IR_GRAMMAR.md at build time
```

Railway deployment (separate repo or service — not in this directory):
```
hosted/
  blockify-turbowarp-2.embedded.js
  textify-turbowarp-2.js
```

---

## Definition of Done

- [ ] R1–R5 risks verified in TurboWarp before implementation starts
- [ ] Panel appears on extension load; collapses/expands correctly
- [ ] First-run opens Settings; subsequent runs open Idle
- [ ] API key and provider saved to localStorage and persisted across reloads
- [ ] Send → Thinking → Proposal flow works end-to-end with a real API key
- [ ] NO_CHANGE returns user to Idle with status message
- [ ] Validation failure retries once silently; second failure shows copyable error
- [ ] Bridge proposal still drives the panel (bridge path unbroken)
- [ ] `showProposalPanel` replaced by panel state transition (no regression)
- [ ] Claude and OpenAI both work end-to-end with real keys
- [ ] IR grammar inlined at build time — system prompt is complete without network fetch
- [ ] Extension files hosted on Railway at stable URLs with correct CORS headers
- [ ] All new tests passing; existing 100 TB2 tests still passing
- [ ] `PROJECT_STATUS.md` and `CLAUDE.md` updated
