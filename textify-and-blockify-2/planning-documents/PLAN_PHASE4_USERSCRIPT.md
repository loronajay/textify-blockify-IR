# Phase 4 Plan: TurboWarp Desktop Userscript

**Project:** Prompt-to-Blocks Engine
**File:** `textify-and-blockify-2/userscript.js` (new)
**Status:** Planning

---

## Context

Phase 3 built the bridge — an HTTP server that agents talk to. But the bridge can't do anything with TurboWarp yet because there's nothing on the TurboWarp side of the WebSocket.

Phase 4 is that missing piece. A userscript injected into TurboWarp Desktop that:
- Opens and maintains the WebSocket connection to the bridge
- Handles incoming messages by calling Blockify 2 and Textify 2
- Sends results and async events (approve/reject) back to the bridge

The userscript has no business logic. It is a thin adapter. Every decision stays in Blockify 2 and Textify 2.

---

## Pre-Phase Console Checks

Run these in TurboWarp Desktop before writing any Phase 4 code. Load `blockify-turbowarp-2.embedded.js` AND `textify-turbowarp-2.js` as unsandboxed extensions first, then open the console (F12).

**Check 1 — Can an unsandboxed extension open a WebSocket to localhost?**

Start the bridge first (`node bridge.js` from `textify-and-blockify-2/bridge/`), then run:

```js
const ws = new WebSocket('ws://localhost:7331');
ws.onopen = () => console.log('WS open:', ws.readyState);
ws.onerror = (e) => console.log('WS error:', e);
```

Expected: `WS open: 1` logged. If error fires, check that the bridge is running and on port 7331.

**Check 2 — Is `globalThis.__textifyTestHooks.exportAllStacksText` callable from the console?**

```js
typeof globalThis.__textifyTestHooks?.exportAllStacksText
// expect: "function"
```

**Check 3 — Does `exportAllStacksText` return IR for the editing target?**

```js
const hooks = globalThis.__textifyTestHooks;
const target = Scratch.vm.editingTarget;
const ir = hooks.exportAllStacksText(target);
console.log(ir.slice(0, 100));
// expect: IR text starting with [script or [procedure
```

**Check 4 — Does `Scratch.vm.runtime.targets` give all sprites?**

```js
Scratch.vm.runtime.targets.map(t => t.sprite?.name || '(stage)')
// expect: array of sprite names including Stage
```

**Report back:** pass/fail on each check plus the output of Check 3. If Check 1 fails, the WS approach still works — report the error message and we'll diagnose.

---

## Architectural Decision (already confirmed)

There is no separate `userscript.js` file. The bridge client lives inside `blockify-turbowarp-2.js`. The extension opens a WebSocket to `ws://localhost:7331` during `loadExtension()` and maintains it. The user loads the extension exactly as they do today — no new files, no new injection mechanism.

---

## Revised Architecture

There is no separate `userscript.js`. The bridge client lives inside Blockify 2:

```
blockify-turbowarp-2.js (loaded as unsandboxed extension)
  ├── Phase 1: commitIRToWorkspace
  ├── Phase 2: propose/approve/reject/undo panel
  └── Phase 4: BridgeClient — WS connection to bridge, message handlers
```

The extension connects to the bridge when it loads. If the bridge isn't running, it retries silently. If the bridge starts later, the extension reconnects automatically.

---

## What Phase 4 Adds to `blockify-turbowarp-2.js`

### `BridgeClient` class

Manages the WebSocket connection and message routing.

```
BridgeClient
  connect(url)        — open WS, schedule reconnect on close
  disconnect()        — close WS cleanly
  send(message)       — send JSON message to bridge
  onMessage(msg)      — dispatch to handlers by type
```

**Message handlers (bridge → TurboWarp):**

| Message type | Handler |
|---|---|
| `getState` | Call Textify 2 `exportAllStacksText()` for all sprites → respond with IR |
| `getSprite` | Call Textify 2 for named sprite → respond with IR |
| `propose` | Validate IR via Parser, call `proposeIRFromBridge(ir, proposalId)`, respond ok/error |
| `commit` | Call `approveIRFromBridge(proposalId)` → respond ok |
| `reject` | Call `rejectIRFromBridge(proposalId)` → respond ok |

**Unsolicited messages (TurboWarp → bridge):**

| Event | When sent |
|---|---|
| `proposalApproved` | User clicks Approve in the proposal panel |
| `proposalRejected` | User clicks Reject in the proposal panel |

### 3 new functions in `blockify-turbowarp-2.js`

**`proposeIRFromBridge(irText, bridgeProposalId)`**
Like `proposeIR()` but accepts IR directly instead of reading from clipboard. Stores `bridgeProposalId` alongside `pendingIR` so the bridge can be notified on approve/reject.

**`approveIRFromBridge(bridgeProposalId)`**
Like `approveIR()` — snapshots workspace, commits, clears pending. If `bridgeProposalId` matches the current pending proposal, also fires `proposalApproved` back to the bridge.

**`rejectIRFromBridge(bridgeProposalId)`**
Like `rejectIR()` — clears pending without committing. Fires `proposalRejected` back to the bridge.

### 1 new instance property

`this.pendingBridgeProposalId` — the bridge's proposalId for the current pending proposal, or null.

### Reconnection

`BridgeClient` attempts to reconnect every 3 seconds if the connection is lost. Silent — no errors shown to user unless a status indicator is present.

### Status indicator (optional for Phase 4)

A small persistent dot in the TurboWarp UI showing bridge connection state:
- 🟢 green — bridge connected
- 🔴 red — bridge not reachable

This is cosmetic only. Low priority — can ship without it.

---

## Textify 2 dependency

Phase 4 needs to call Textify 2 to handle `getState` and `getSprite`. This requires confirming that `textify-turbowarp-2.js` exposes `exportAllStacksText()` and single-sprite export via `__TB2_SHARED__` or its own test hooks.

Check `textify-turbowarp-2.js` before implementing `getState` and `getSprite` handlers.

---

## New Extension Block

| Block | What it does |
|---|---|
| `connect to bridge` | Manually opens WS connection to bridge (normally auto-connects on load) |
| `disconnect from bridge` | Closes WS connection |
| `bridge connected?` | Boolean reporter — true if bridge WS is open |

These are for user control and debugging. The auto-connect on load handles the normal case.

---

## Tests

Phase 4 logic is testable in Jest by mocking a WebSocket server and exercising the message handlers directly.

| Test | What it proves |
|---|---|
| BridgeClient connects to a mock WS server | Connection opens |
| BridgeClient reconnects after disconnect | Reconnect logic works |
| `getState` message → Textify 2 called → IR returned | State export round-trip |
| `propose` with valid IR → proposal panel state set | Propose handler works |
| `propose` with invalid IR → error response sent | Validation error surfaced |
| `commit` message → `approveIRFromBridge` called → `proposalApproved` sent back | Approve round-trip |
| `reject` message → `rejectIRFromBridge` called → `proposalRejected` sent back | Reject round-trip |
| User clicks Approve in panel → `proposalApproved` sent to bridge | UI → bridge notification |

---

## What Phase 4 Does NOT Include

- MCP tool wrapping — Phase 5
- Multi-proposal queue — one pending at a time
- Auth — localhost only
- Factory opcode catalog — Phase 5
- Textify 2 enhancements beyond what already works

---

## After Phase 4

With the bridge running and the extension loaded, the full loop works:

```
Agent calls POST /propose with IR
  → Bridge sends 'propose' WS message
  → Blockify 2 validates, shows proposal panel with visual block preview
  → User clicks Approve
  → Blockify 2 commits IR to workspace, blocks appear
  → Bridge receives 'proposalApproved' message
  → Agent polls GET /proposal/:id and sees "approved"
```

No clipboard. No console. No manual steps. The agent drives; the user validates.
