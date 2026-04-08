# Phase 3 Plan: Local Bridge Service

**Project:** Prompt-to-Blocks Engine
**Folder:** `textify-and-blockify-2/bridge/` (new)
**Status:** Planning

---

## Context

Phases 1 and 2 gave Blockify 2 the ability to commit and preview IR inside TurboWarp. The remaining gap is how IR gets there. Today the answer is the clipboard — the user copies IR, clicks a block. That works for manual testing but breaks the agent flow.

Phase 3 replaces the clipboard with a local HTTP API. An agent (Claude Code, GPT, any tool that can call HTTP) sends IR to `POST /propose`. TurboWarp shows the preview panel. The user clicks Approve. Blocks appear. The agent never touches the clipboard or the console.

---

## Architecture

```
Agent (Claude Code, etc.)
  ↓ HTTP  (localhost:7331)
Bridge (Node.js process)       ← Phase 3
  ↕ WebSocket
TurboWarp Desktop userscript   ← Phase 4
  ↓ calls
Blockify 2 / Textify 2
```

**The bridge is a relay.** It has no IR logic. It does not parse, validate, or modify IR. All of that lives in Blockify 2. The bridge's job is to translate HTTP calls into WebSocket messages and route responses back.

**The userscript (Phase 4) owns the TurboWarp side.** It opens the WebSocket connection to the bridge on startup, listens for messages, calls Blockify 2 and Textify 2, and sends results back. Phase 3 defines the protocol. Phase 4 implements the TurboWarp end of it.

**Phase 3 and 4 are interdependent but separable.** The bridge can be built and fully tested against a mock WebSocket client. The userscript can be written to the protocol spec without the bridge being deployed. They meet at integration time.

---

## HTTP API

Base URL: `http://localhost:7331`

All request and response bodies are JSON. All responses include `{"ok": true, ...}` on success or `{"ok": false, "error": "..."}` on failure.

### `GET /status`
Returns bridge and TurboWarp connection status.

**Response:**
```json
{
  "ok": true,
  "bridge": "running",
  "turbowarp": "connected"   // or "disconnected"
}
```

### `GET /state`
Returns Textify 2 IR of the full current project.

**Response:**
```json
{
  "ok": true,
  "ir": "[procedure\n  proccode:..."
}
```

Forwards a `getState` WS message to TurboWarp and waits for the response. Times out after 5 seconds if TurboWarp is not connected or does not respond.

### `GET /sprite/:name`
Returns Textify 2 IR for a single named sprite.

**Response:**
```json
{
  "ok": true,
  "sprite": "Player",
  "ir": "[script\n  body:..."
}
```

### `POST /propose`
Submits IR for preview. TurboWarp shows the proposal panel. The user approves or rejects from there.

**Request body:**
```json
{
  "ir": "[script\n  body:..."
}
```

**Response (immediate — does not wait for user):**
```json
{
  "ok": true,
  "proposalId": "p-1712345678"
}
```

Returns as soon as TurboWarp confirms the proposal was received and validated. If validation fails, returns `{"ok": false, "error": "ParseError: ..."}` immediately.

The user's approve/reject happens asynchronously — the agent can poll `GET /proposal/:id` to check status.

### `GET /proposal/:id`
Returns the current status of a proposal.

**Response:**
```json
{
  "ok": true,
  "proposalId": "p-1712345678",
  "status": "pending"   // "pending" | "approved" | "rejected"
}
```

### `POST /commit/:id`
Programmatically approves a pending proposal (bypasses the UI). Intended for automated workflows where user confirmation is not required.

**Response:**
```json
{ "ok": true }
```

### `POST /reject/:id`
Programmatically rejects a pending proposal.

**Response:**
```json
{ "ok": true }
```

---

## WebSocket Protocol

The bridge listens for a single WebSocket connection from TurboWarp's userscript. All messages are JSON. Every message has an `id` field for request/response correlation so multiple requests can be in flight simultaneously.

### Bridge → TurboWarp

```json
{ "id": "req-001", "type": "getState" }
{ "id": "req-002", "type": "getSprite", "name": "Player" }
{ "id": "req-003", "type": "propose", "ir": "[script ...]" }
{ "id": "req-004", "type": "commit", "proposalId": "p-123" }
{ "id": "req-005", "type": "reject", "proposalId": "p-123" }
```

### TurboWarp → Bridge

```json
{ "id": "req-001", "type": "stateResponse", "ok": true, "ir": "..." }
{ "id": "req-002", "type": "spriteResponse", "ok": true, "ir": "..." }
{ "id": "req-003", "type": "proposeResponse", "ok": true, "proposalId": "p-123" }
{ "id": "req-003", "type": "proposeResponse", "ok": false, "error": "ParseError: ..." }
{ "id": "req-004", "type": "commitResponse", "ok": true }
{ "id": "req-005", "type": "rejectResponse", "ok": true }
```

### TurboWarp → Bridge (unsolicited)

```json
{ "type": "proposalApproved", "proposalId": "p-123" }
{ "type": "proposalRejected", "proposalId": "p-123" }
```

TurboWarp sends these when the user clicks Approve or Reject in the proposal panel, so the bridge can update proposal status without polling.

---

## Files

```
textify-and-blockify-2/
  bridge/
    bridge.js          ← Node.js HTTP + WebSocket server
    bridge.test.js     ← Jest tests (mock WS client)
```

The bridge is a standalone Node.js script — no bundling needed. Runs with `node bridge.js`. Dependencies: Node's built-in `http` module + `ws` package for WebSocket.

---

## Tests

The bridge is tested with a mock WebSocket client that simulates TurboWarp. No real TurboWarp instance is needed.

| Test | What it proves |
|---|---|
| `GET /status` with no WS client → turbowarp: "disconnected" | Status reflects connection state |
| `GET /status` with mock WS client connected → turbowarp: "connected" | Connection detected |
| `GET /state` with mock client → forwards `getState`, returns IR | State request round-trip |
| `GET /state` with no client → 503 error | Graceful failure when TurboWarp not connected |
| `GET /state` with client that times out → 504 error | Timeout handling |
| `POST /propose` with valid IR → mock client receives `propose` message | Proposal forwarded |
| `POST /propose` → mock client responds with validation error → 400 | Validation error surfaced |
| `GET /proposal/:id` after propose → "pending" | Status tracking works |
| Mock client sends `proposalApproved` → `GET /proposal/:id` → "approved" | Async status update |
| `POST /commit/:id` → mock client receives `commit` message | Programmatic commit forwarded |
| `POST /reject/:id` → mock client receives `reject` message | Programmatic reject forwarded |

---

## Risk: Verify WebSocket Access from TurboWarp Desktop

Before writing Phase 4 (userscript), confirm in TurboWarp Desktop's console:

```js
// Can a userscript open a WebSocket to localhost?
const ws = new WebSocket('ws://localhost:7331');
ws.onopen = () => console.log('connected');
ws.onerror = (e) => console.log('error', e);
```

TurboWarp Desktop is an Electron app — localhost WebSocket connections should be unrestricted, but worth confirming before building Phase 4.

This check belongs at the start of Phase 4, not Phase 3. The bridge can be fully built and tested without it.

---

## What Phase 3 Does NOT Include

- The TurboWarp userscript — Phase 4
- MCP tool interface — Phase 5
- Authentication — localhost-only, no auth in Phase 3
- Multi-client support — one TurboWarp connection at a time
- Persistent proposal history — proposals live in memory only

---

## After Phase 3

With the bridge running and Phase 4's userscript loaded, an agent can drive TurboWarp with nothing but HTTP calls:

```bash
# Get current project state
curl http://localhost:7331/state

# Propose a change
curl -X POST http://localhost:7331/propose \
  -H 'Content-Type: application/json' \
  -d '{"ir": "[script body:[stack: ...]]"}'

# Check if user approved
curl http://localhost:7331/proposal/p-123
```

That is the complete agent interface for Phase 3. Phase 5 wraps this in MCP tools so agents don't have to manage HTTP calls manually.
