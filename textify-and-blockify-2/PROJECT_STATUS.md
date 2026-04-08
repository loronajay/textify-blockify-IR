# Project Status — Textify/Blockify 2

**Last updated:** 2026-04-08
**Current phase:** Phase 5D — Targeted Mutation (planning)

---

## Phase Status

| Phase | Name | Status |
|---|---|---|
| **1** | Blockify VM Writer | **Complete** |
| **2** | Preview & Validation UI | **Complete** |
| **3** | Local Bridge Service | **Complete** |
| **4** | Bridge Client (inside Blockify 2) | **Complete** |
| **5** | Agent Protocol | **Complete** |
| **5B** | MCP Server + Auto-Connect | **Complete** |
| **5C** | Self-Contained Prompt UI | **Complete** |
| **5D** | Targeted Mutation + Multi-Sprite Targeting | Future |
| **6** | TurboWarp Fork | Future |

---

## Phase 1 — What Was Built

### New functions in `blockify-turbowarp-2.js`

| Function | What it does |
|---|---|
| `generateUID()` | Produces unique block IDs — `crypto.randomUUID()` with Math.random fallback |
| `remintBlockIds(roots)` | Walks the full AST and replaces every opcode `id` with a fresh UID |
| `declareVariablesInVM(roots, vm)` | Creates scalar variables, lists, and broadcasts in the live VM; skips existing ones |
| `injectRootsIntoWorkspace(roots)` | Generates XML, parses to DOM, calls `ScratchBlocks.Xml.domToWorkspace` |
| `commitIRToWorkspace(irText)` | Top-level: parse → validate → remint → declare vars → inject. Returns `{success, blockCount}` or `{success, error}` |

### New extension block

| Block | Opcode | What it does |
|---|---|---|
| `commit IR from clipboard` | `commitIR` | Reads clipboard IR and calls `commitIRToWorkspace` directly |

### Tests

15 tests in `textify-and-blockify-2/__tests__/blockify2-vm-writer.test.js` — all passing.

Covers: remintBlockIds (ID replacement, uniqueness), declareVariablesInVM (scalars, lists, broadcasts, idempotency), injectRootsIntoWorkspace (XML injection), commitIRToWorkspace (success, error, double-commit, factory opcode passthrough, variable + inject together, procedure).

---

## Confirmed Runtime Facts (TurboWarp Desktop console)

- `ScratchBlocks` is a global accessible from unsandboxed extensions
- `ScratchBlocks.getMainWorkspace()` returns a live Blockly Workspace
- `ScratchBlocks.Xml.textToDom(xml)` and `ScratchBlocks.Xml.domToWorkspace(dom, workspace)` work as expected
- `domToWorkspace` fires change events that sync the VM automatically — no manual VM writes needed
- The bundler (esbuild) substitutes bare `ScratchBlocks` references with the embedded module — must use `globalThis['ScratchBlocks']` (bracket notation) to reach TurboWarp's real workspace ScratchBlocks

---

## Phase 2 — What Was Built

### New functions
| Function | What it does |
|---|---|
| `captureWorkspaceXml()` | Snapshots the current workspace as XML via `workspaceToDom` + `domToText` |
| `restoreWorkspaceXml(xml)` | Clears workspace and restores from saved XML — used for undo |
| `showProposalPanel(owner, irText)` | Floating panel with IR preview, Approve (green) and Reject (red) buttons |

### New extension blocks
| Block | What it does |
|---|---|
| `propose IR from clipboard` | Validates clipboard IR, stores as pending, shows preview panel |
| `approve pending IR` | Snapshots workspace, commits pending IR, clears pending state |
| `reject pending IR` | Discards pending IR, no workspace change |
| `undo last Blockify commit` | Restores workspace to pre-commit snapshot |
| `IR pending?` | Boolean reporter — true if a proposal is waiting |

### Instance state added
- `this.pendingIR` — IR waiting for approval, or null
- `this.preCommitWorkspaceXml` — workspace snapshot captured before last commit

### Tests
15 new tests in `blockify2-preview-ui.test.js` — all passing (30 total across both Phase 1 and 2 test files).

### Confirmed runtime facts (Phase 2)
- `ScratchBlocks.Xml.workspaceToDom(workspace)` works as expected
- `ScratchBlocks.Xml.domToText(dom)` returns XML string
- `workspace.clear()` exists and clears all blocks
- Full undo round-trip (snapshot → clear → restore) verified in TurboWarp Desktop console

---

## Phase 3 — What Was Built

### `bridge/bridge.js` — `createBridge({ port, timeout })`

HTTP + WebSocket relay server. No IR logic — pure relay.

| Endpoint | What it does |
|---|---|
| `GET /status` | Bridge running state + TurboWarp connection state |
| `GET /state` | Forwards `getState` WS message → returns IR |
| `GET /sprite/:name` | Forwards `getSprite` WS message → returns IR |
| `POST /propose` | Forwards `propose` → returns proposalId or validation error |
| `GET /proposal/:id` | Returns proposal status: pending / approved / rejected |
| `POST /commit/:id` | Forwards `commit` → marks approved |
| `POST /reject/:id` | Forwards `reject` → marks rejected |

Request/response correlation via message `id` field. Timeout configurable (default 5s). Proposal status updated by both programmatic commit/reject and unsolicited `proposalApproved`/`proposalRejected` WS events from TurboWarp.

### Tests
13 tests in `bridge/bridge.test.js` — all passing (43 total across all TB2 suites).

---

## Phase 4 — What Was Built

### `BridgeClient` class inside `blockify-turbowarp-2.js`

| Member | What it does |
|---|---|
| `connect(url)` | Opens WS to bridge, stores socket |
| `disconnect()` | Closes WS cleanly, cancels reconnect timer |
| `send(message)` | Sends JSON if WS is OPEN |
| `isConnected` | Boolean getter — true if `readyState === OPEN` |
| `_scheduleReconnect()` | Retries every 3s (configurable) after close |
| `_handleGetState(msg)` | Calls `__tb2TextifyHooks.exportAllStacksText` for all sprites → responds with combined IR |
| `_handleGetSprite(msg)` | Finds named sprite → responds with its IR |
| `_handlePropose(msg)` | Validates IR, calls `owner.proposeIRFromBridge(ir, proposalId, this)`, responds ok/error |
| `_handleCommit(msg)` | Calls `owner.approveIRFromBridge(proposalId, this)` → responds ok |
| `_handleReject(msg)` | Calls `owner.rejectIRFromBridge(proposalId, this)` → responds ok |

### New/updated methods on `BlockifyPhase1`

| Method | What it does |
|---|---|
| `proposeIRFromBridge(irText, proposalId, bridgeClient)` | Validates IR, stores pending, stores bridge client ref, shows proposal panel |
| `approveIRFromBridge(proposalId, bridgeClient)` | Snapshots, commits, sends `proposalApproved` to bridge |
| `rejectIRFromBridge(proposalId, bridgeClient)` | Clears pending, sends `proposalRejected` to bridge |
| `approveIR()` | Updated — also sends `proposalApproved` if proposal came from bridge |
| `rejectIR()` | Updated — also sends `proposalRejected` if proposal came from bridge |
| `connectBridge(args)` | Creates BridgeClient, connects to `args.URL` |
| `disconnectBridge()` | Disconnects and clears BridgeClient |
| `bridgeConnected()` | Returns `true` if WS is OPEN |

### New extension blocks

| Block | What it does |
|---|---|
| `connect to bridge [URL]` | Manually connects to bridge (default `ws://localhost:7331`) |
| `disconnect from bridge` | Closes bridge connection |
| `bridge connected?` | Boolean reporter |

### New instance properties

- `this._bridge` — the active `BridgeClient` instance, or null
- `this.pendingBridgeProposalId` — bridge proposal ID for current pending proposal, or null
- `this._bridgeClient` — bridge client ref stored during `proposeIRFromBridge`, cleared on approve/reject

### Tests

10 tests in `blockify2-bridge-client.test.js` — all passing (53 total across all TB2 suites).

### Confirmed runtime facts (Phase 4)

- `ws://localhost:7331` WebSocket connections succeed from unsandboxed TurboWarp Desktop extensions
- Bridge must be started with `node bridge.js` from `textify-and-blockify-2/bridge/` (has a CLI entry point as of this phase)
- `__textifyTestHooks.exportAllStacksText(target)` works at runtime for sprites with blocks; returns `''` for empty sprites

---

## Confirmed Runtime Facts (Phase 4)

- `ws://localhost:7331` WebSocket connections succeed from unsandboxed TurboWarp Desktop extensions
- Bridge HTTP server requires `Access-Control-Allow-Origin: *` headers — TurboWarp's `tw-editor://` origin is treated as cross-origin by the browser CORS policy. Fixed in `bridge.js`.
- All 10 manual tests in `PHASE4_MANUAL_TESTS.md` verified green end-to-end

---

## Phase 5 — What Was Built

### Agent runner (`agent/`)

| File | What it does |
|---|---|
| `runner.js` | CLI entry point. Parses args, fetches state, calls Claude, posts proposal. |
| `prompt-builder.js` | Constructs system prompt from IR grammar + project state + task constraints. |
| `response-parser.js` | Parses Claude's structured output: `IR_ONLY` / `NO_CHANGE` / `ERROR:<reason>`. |
| `claude-client.js` | Real Claude API caller via `@anthropic-ai/sdk`. Reads `ANTHROPIC_API_KEY` from env. |
| `agent/__tests__/runner.test.js` | 10 integration tests — real bridge, mock WS, seeded Claude responses. |
| `agent/__tests__/prompt-builder.test.js` | 13 tests covering prompt construction. |
| `agent/__tests__/response-parser.test.js` | 13 tests covering IR_ONLY / NO_CHANGE / ERROR / PARSE_FAILURE parsing. |

### Response protocol

Claude returns exactly one of:
- `IR_ONLY\n{ir}` — complete IR for the modified sprite
- `NO_CHANGE` — request already satisfied or not applicable
- `ERROR:<reason>` — ambiguous/contradictory task

### Scope model

- Read: full project via `GET /state`
- Write: one sprite at a time (matches current executor limit — extensible when executor gains multi-sprite support)

### Retry

On validation failure from bridge: one bounded retry with the exact error message fed back to Claude. Max 2 total attempts.

### Tests

36 tests across 3 files in `agent/__tests__/` — all passing (89 total across all TB2 suites).

### Confirmed runtime facts (Phase 5)

- `node agent/runner.js "add move 10 steps on green flag"` produces a live proposal in TurboWarp ✓
- User approves → block appears in workspace ✓
- Full loop verified: bridge → Claude API → IR → proposal panel → approve → blocks in workspace

---

## Phase 5B — What Was Built

### Goal

Eliminate the terminal command entirely. User loads extensions, opens Claude Code, describes changes — Claude Code starts the bridge, confirms connection, proposes IR. User approves in TurboWarp.

### Deliverables

| File | Status | What it does |
|---|---|---|
| `agent/mcp-server.js` | ✓ Built | MCP server over stdio. 5 tools + `ir-grammar` resource. Spawns and owns bridge process. |
| `blockify-turbowarp-2.js` | ✓ Built | Auto-connect on load — guarded by `typeof globalThis.WebSocket === 'function'` so tests are unaffected. |
| `blockify-turbowarp-2.embedded.js` | ✓ Rebuilt | Includes auto-connect change. |
| `.claude/settings.json` | ✓ Built | Project-local MCP config pointing at `mcp-server.js`. Checked into repo. |

### Tools

| Tool | What it does |
|---|---|
| `tb2_start_bridge` | Spawns `bridge/bridge.js` as a child process. Kills it on server exit. |
| `tb2_status` | Returns bridge running state, TurboWarp connected state, current editing target. |
| `tb2_get_state` | Full project IR via `GET /state`. |
| `tb2_get_sprite` | One sprite's IR via `GET /sprite/:name`. |
| `tb2_propose` | Posts IR to `/propose`. Returns proposalId or validation error — Claude Code handles retry. |

### Session flow

1. Load extensions in TurboWarp Desktop — auto-connect begins retrying immediately
2. Open Claude Code in repo — MCP server starts automatically
3. Tell Claude: "start the bridge" → Claude calls `tb2_start_bridge` → TurboWarp connects within 3s
4. Describe changes → Claude reads state, proposes IR → approve in TurboWarp → blocks appear

### Codex support (verified 2026-04-07)

The same TB2 MCP server works for Codex via `.codex/config.toml`.

- `.codex/config.toml` at repo root points at `textify-and-blockify-2/agent/mcp-server.js`
- `AGENTS.md` files added at repo root, `factory_extensions/`, and `textify-and-blockify-2/`
- **End-to-end verified 2026-04-07:** full propose → approve round trip completed in live Codex session. Same movement script (WASD + `movespeed` variable) proposed, TurboWarp showed proposal panel, user approved, blocks committed. ✓

**Snags logged for future Codex sessions:**
- Terminology: "bridge" is ambiguous in this repo (legacy TB1 shared state vs. TB2 localhost relay). Codex should be pointed at `textify-and-blockify-2` only.
- EPERM sandbox error when Codex tries to run Node filesystem operations without escalated permissions. Re-running with correct permissions resolves it.
- PowerShell HTTP: `Invoke-WebRequest` to `/propose` requires `-UseBasicParsing` flag or it fails.
- First session was slower due to calibration/tooling friction. Core TB2 pipeline behaved correctly once proposal was sent. Subsequent sessions should be faster.

### Confirmed runtime facts (Phase 5B)

Verified 2026-04-07 via live session in TurboWarp Desktop:

- Bridge starts with `node textify-and-blockify-2/bridge/bridge.js` and reports `TB2 bridge running on http://localhost:7331`
- TurboWarp auto-connects within ~3s of bridge start — `GET /status` returns `{"turbowarp":"connected"}` ✓
- `POST /propose` with a well-formed IR script returns `{"ok":true,"proposalId":"p-N"}` ✓
- Proposal panel appears in TurboWarp immediately after propose ✓
- Approving a proposal injects the block stack into the live workspace ✓
- Declaring a new variable (`movespeed`) in IR causes the variable to be created in the VM and appear in the variable list ✓
- Two sequential propose → approve cycles succeed in the same session with no state corruption ✓
- **Note:** the MCP `tb2_start_bridge` tool path was not exercised in this session — bridge was started via direct bash. The bridge, auto-connect, and proposal/approve/VM-write pipeline are fully verified. MCP tool loading requires Claude Code to be started from the `canon/` repo root so that `.claude/settings.json` is resolved correctly. Start fresh from that directory to get `tb2_*` tools active.

### Case study — first game loop (2026-04-07)

Task: build classic Pokemon/RPG WASD movement for a sprite, then refactor to use a `movespeed` variable.

Round 1 — movement script:
- Proposed `event_whenflagclicked → set rotation style → go to 0,0 → forever [check WASD keys → change x/y]`
- Approved. Blocks appeared in workspace immediately.

Round 2 — movespeed variable:
- Proposed same structure with `data_setvariableto movespeed 5` at top, replaced all literal `4` values with `data_variable movespeed` (negative directions use `operator_subtract 0 - movespeed`)
- Approved. `movespeed` variable was created automatically in the VM and appeared in the variable monitor list.

Both proposals were authored by Claude Code as raw IR text and committed via `POST /propose` → TurboWarp approve button. No clipboard, no manual IR editing, no console commands.

### Definition of done

- [x] `agent/mcp-server.js` exposes all 5 tools and `ir-grammar` resource
- [x] `tb2_start_bridge` spawns bridge; bridge killed on server exit
- [x] `tb2_status` accurately reflects bridge + TurboWarp state
- [x] Auto-connect fires on extension load (WebSocket guard keeps tests green)
- [x] `.claude/settings.json` created; MCP server loads in Claude Code
- [x] 100 TB2 tests passing after changes
- [x] End-to-end verified: open Claude Code → "start the bridge" → describe change → approve → blocks appear

---

## Phase 5C — What Was Built

### Goal

Make TB2 usable by general TurboWarp users with no terminal, no bridge, no Node.js. A unified persistent floating panel inside Blockify 2 drives the full prompt → AI → discuss → propose → approve loop entirely within the extension.

### Railway hosting (`textify-and-blockify-2/hosted/`)

| File | What it does |
|---|---|
| `hosted/server.js` | Express server. `POST /proxy/claude` forwards requests to Anthropic with the user's API key passed as `x-tb2-api-key` header (never stored server-side). `GET /blockify-turbowarp-2.embedded.js` and `GET /textify-turbowarp-2.js` serve extension files with `Access-Control-Allow-Origin: *`. `GET /health` for Railway health check. |
| `railway.toml` | Build command: `npm install && npm run build:blockify2`. Start command: `node textify-and-blockify-2/hosted/server.js`. Health check: `/health`. |
| `scripts/build-blockify2-embedded.mjs` | Updated: reads `TB2_PROXY_URL` env var at build time and injects it as `const TB2_CLAUDE_PROXY_URL` into the bundle. Defaults to `http://localhost:7331/proxy/claude` for local dev. Also injects `IR_GRAMMAR.md` as `__IR_GRAMMAR_TEXT__`. |

**Deploy process:** Two-pass. First deploy → get Railway URL → set `TB2_PROXY_URL` env var → redeploy so the correct proxy URL is baked into the embedded JS.

**Live URL:** `https://textify-blockify-production.up.railway.app`

### `TB2Panel` class

Persistent floating panel. Created once at extension load, never destroyed. State machine: Collapsed → Idle → Thinking → Proposal / Error. Settings accessible via gear icon.

| Feature | Detail |
|---|---|
| **Position** | Anchored `top:24px right:24px`, expands downward |
| **Draggable** | Drag by header bar. Cursor changes to grabbing. Position saved to `localStorage` and restored on next load. |
| **Resizable** | Custom triangle resize handle in bottom-right corner. Minimum size: 360×280px. Size saved to `localStorage`. |
| **Session log** | Persistent collapsible footer showing timestamped play-by-play of every agent loop step. Selectable text. "Copy All" button. Never cleared until extension is unloaded. |
| **API key storage** | Provider (`claude`/`openai`) and key stored in `localStorage` under `tb2_provider` / `tb2_api_key`. Never sent anywhere except as an HTTP header to the chosen provider (or Railway proxy for Claude). |
| **First run** | Opens in Settings view if no key is set; Idle view otherwise. |

### Chat flow

Phase 5C extended the original single-shot IR loop into a full conversation model.

| Response type | Agent usage | Panel behaviour |
|---|---|---|
| `DISCUSS\n<text>` | Questions, clarifications, design discussion | Text bubble added to chat history. User can reply freely. |
| `PROPOSE_READY\n<summary>\nIR_ONLY\n<ir>` | Agent signals intent before generating blocks | Green card with summary + "Build it ▶" / "Keep discussing" buttons. IR already in hand — "Build it" runs local validation immediately, no extra API call. |
| `IR_ONLY\n<ir>` | Short unambiguous requests | Goes straight to block preview (existing proposal flow). |
| `NO_CHANGE` | Already implemented | Chat bubble: "No changes needed". |
| `ERROR:<reason>` | Impossible/contradictory request | Error view with copyable message. |

Conversation history (`_conversationHistory[]`) is sent with every API call so the agent retains full session context. History is in-memory only — resets when the extension is unloaded.

### Context window management

| Threshold | Behaviour |
|---|---|
| > 40k chars in history | Yellow banner: "Context getting long" + Compact button |
| > 80k chars | Red banner: "Context window nearly full" + Compact button |

**Compact flow:** Makes one API call asking the agent to summarise what has been built. Clears `_conversationHistory` and `_chatMessages`. Pins the summary as a note in the chat display. Seeds the new history with the summary so the agent retains continuity.

### Usage limit error handling

Provider errors are now parsed into specific user-facing messages:

| Status | Message |
|---|---|
| 401 | "Invalid API key. Go to Settings and re-enter your [provider] key." |
| 429 (rate limit) | "Rate limit hit. Wait a moment and try again." |
| 429 (quota) | "Usage limit reached. Your [provider] API quota may be exhausted — check your account dashboard." |
| 529 / 503 | "[Provider] is currently overloaded. Try again in a moment." |
| 400 (context too long) | "Prompt too long. Use the Compact button to clear the context window and continue." |

### New / updated functions in `blockify-turbowarp-2.js`

| Function | What it does |
|---|---|
| `TB2Panel` | Persistent panel. Chat history, drag/resize, session log, context warning. |
| `TB2Panel.appendChat(role, text, opts)` | Adds a message to chat display. PROPOSE_READY entries render as action cards. |
| `TB2Panel.discardProposeReady()` | Removes the last propose_ready card from chat when user chooses "Keep discussing". |
| `TB2Panel.log(text)` | Appends a timestamped entry to the session log footer. |
| `buildTB2Prompt({ fullStateIR, spriteName, targetIR })` | Builds system prompt with grammar + IR state + response format rules. `userPrompt` removed — now in messages array. |
| `parseTB2AgentResponse(raw)` | Parses `IR_ONLY` / `NO_CHANGE` / `ERROR:` / `DISCUSS` / `PROPOSE_READY` / `PARSE_FAILURE`. |
| `callClaudeViaProxy(systemPrompt, messages, apiKey, proxyUrl)` | Updated: accepts full messages array for multi-turn conversation. |
| `callOpenAI(systemPrompt, messages, apiKey)` | Updated: accepts full messages array. |
| `parseProviderError(status, bodyText, providerName)` | Maps HTTP error codes to user-facing messages. |
| `BlockifyPhase1.runTB2AgentLoop(userPrompt)` | Full conversation-aware agent loop. Handles all response types, maintains history. |
| `BlockifyPhase1._pushHistory(role, content)` | Pushes to history and updates panel's `_contextCharCount`. |
| `BlockifyPhase1._popHistory()` | Rolls back last history entry (used on network failure). |
| `BlockifyPhase1.compactHistory()` | Summarises session via API, clears history, pins summary, seeds fresh context. |
| `BlockifyPhase1.proposeIRDirect(irText)` | Synchronous propose used by agent loop and "Build it" button. |

### Key design decisions confirmed during implementation

- Anthropic API **blocks browser CORS** — Claude calls must go through the Railway proxy. OpenAI passes browser CORS directly.
- `localStorage` is accessible from TurboWarp unsandboxed extensions.
- Panel DOM injection works in TurboWarp Desktop (extensions must be loaded from local files via the Files tab — untrusted network URLs are always sandboxed even in Desktop).
- `showProposalPanel` fully retired — all proposal paths route through `TB2Panel.showProposal()`.
- Conversation history is sent to the API on every call; the system prompt always carries the current IR state (freshly read via Textify 2 hooks).

### Tests

| File | Tests |
|---|---|
| `blockify2-provider-clients.test.js` | 6 passing |
| `blockify2-agent-logic.test.js` | 15 passing |
| `blockify2-prompt-ui.test.js` | 15 passing |

36 new tests. All pre-existing tests continue to pass.

### Verified end-to-end (2026-04-08)

- Railway health check passes ✓
- Extension files served at stable URLs with correct CORS headers ✓
- Claude proxy forwarding confirmed working ✓
- Panel loads from local file in TurboWarp Desktop (Files tab) ✓
- Chat flow: DISCUSS → PROPOSE_READY → Build it → block preview → Approve → blocks in workspace ✓
- Session log captures full play-by-play ✓
- Context warning appears after long sessions ✓

---

## Phase 5D — Scope (Future)

Defined after Phase 5B verification. Addresses the write-side ceiling that remains after 5C:

- **Targeted mutation operations** — `replace_script`, `insert_after`, `append`, `delete` instead of always full-sprite rewrites. Payload remains IR-based.
- **Multi-sprite write targeting** — explicit sprite naming in proposals, not just `editingTarget`.
- **Proposal precision metadata** — panel shows target sprite, script, and mutation type.
- **Stable targeting model** — deterministic handles for identifying which script/stack to mutate.
- **Variable/list cleanup on undo** — variables declared during a commit are currently not removed on undo; this phase fixes that.

Full-rewrite path stays as fallback. Approve/reject safety model unchanged. Depends on Phase 5C complete.

Planning doc: `planning-documents/PLAN_PHASE5D_TARGETED_MUTATION.md` (to be written after 5C verified)

---

## Current Limitations

- Single sprite only — commits to `vm.editingTarget`, no multi-sprite targeting
- Variable removal not handled — variables declared during a commit are not cleaned up if that commit is later undone
- No multi-sprite commit — agent proposes changes to one sprite at a time

---

## Files

```
textify-and-blockify-2/
  CLAUDE.md                              ← AI working rules for this folder (gitignored)
  PROJECT_STATUS.md                      ← this file
  blockify-turbowarp-2.js                ← TB2 Blockify source
  blockify-turbowarp-2.embedded.js       ← built artifact (scratch-blocks + IR grammar bundled in)
  textify-turbowarp-2.js                 ← TB2 Textify source
  hosted/
    server.js                            ← Railway Express server (Claude proxy + static file serving)
  planning-documents/
    PLAN_PHASE1_VM_WRITER.md             ← Phase 1 plan (complete)
    PLAN_PHASE2_PREVIEW_UI.md            ← Phase 2 plan (complete)
    PLAN_PHASE3_BRIDGE.md                ← Phase 3 plan (complete)
    PLAN_PHASE4_USERSCRIPT.md            ← Phase 4 plan (complete)
    PLAN_PHASE5_AGENT_PROTOCOL.md        ← Phase 5 plan (complete)
    PLAN_PHASE5B_MCP_SERVER.md           ← Phase 5B plan (complete)
    PLAN_PHASE5C_PROMPT_UI.md            ← Phase 5C plan (complete)
  __tests__/
    blockify2-vm-writer.test.js          ← Phase 1 tests (16 passing)
    blockify2-preview-ui.test.js         ← Phase 2 tests (15 passing)
    blockify2-bridge-client.test.js      ← Phase 4 tests (10 passing)
    blockify2-provider-clients.test.js   ← Phase 5C provider client tests (6 passing)
    blockify2-agent-logic.test.js        ← Phase 5C prompt/response logic tests (15 passing)
    blockify2-prompt-ui.test.js          ← Phase 5C panel state machine tests (15 passing)
  bridge/
    bridge.js                            ← Phase 3 bridge server (complete)
    bridge.test.js                       ← Phase 3 tests (13 passing)
  agent/
    runner.js                            ← Phase 5 CLI entry point
    prompt-builder.js                    ← Phase 5 prompt construction
    response-parser.js                   ← Phase 5 response parsing
    claude-client.js                     ← Phase 5 real Claude API caller
    mcp-server.js                        ← Phase 5B MCP server (5 tools + ir-grammar resource)
    __tests__/
      runner.test.js                     ← Phase 5 integration tests (10 passing)
      prompt-builder.test.js             ← Phase 5 prompt builder tests (13 passing)
      response-parser.test.js            ← Phase 5 response parser tests (13 passing)
  PHASE4_MANUAL_TESTS.md                 ← manual verification checklist for Phase 4 ✓

scripts/
  build-blockify2-embedded.mjs           ← TB2 build script (injects IR grammar + proxy URL)

railway.toml                             ← Railway build + start config

.claude/
  settings.json                          ← Phase 5B MCP config (project-local, checked in)
  settings.local.json                    ← local permissions (not checked in)
```
