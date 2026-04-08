# Phase 5B Plan: MCP Server + Auto-Connect

**Project:** Prompt-to-Blocks Engine
**Status:** Planning
**Depends on:** Phase 5 complete (agent runner fully verified end-to-end)

---

## Goal

Eliminate the terminal command. The user loads two extensions in TurboWarp Desktop, opens
Claude Code in the repo, and describes what they want. Claude Code starts the bridge,
confirms TurboWarp is connected, and proposes block changes directly. The user approves
in TurboWarp. Done.

No terminal. No console commands. No copy-paste. No IR editing.

---

## What This Phase Is Not

- **Not** a new IR format or grammar change — IR_GRAMMAR.md is the unchanged contract
- **Not** a change to the bridge protocol — bridge.js is frozen
- **Not** a replacement for runner.js — it stays for scripting and CI use
- **Not** multi-sprite commit — still one sprite at a time (Phase 5 limit)

---

## Deliverables

1. **`agent/mcp-server.js`** — MCP server exposing 5 tools and the IR grammar as a resource.
   Spawns and owns the bridge process. Runs via stdio (Claude Code MCP protocol).
2. **Auto-connect on load** — one-line change to `blockify-turbowarp-2.js`: call
   `connectBridge` at extension registration time so TurboWarp connects to
   `ws://localhost:7331` automatically. Existing connect/disconnect blocks are unchanged
   and continue to work as manual overrides.
3. **`.claude/settings.json`** — project-local MCP config checked into the repo. One entry
   pointing at `mcp-server.js`. Claude Code picks it up automatically when opened in
   the repo.
4. **Rebuild** — `npm run build:blockify2` after the auto-connect change.
5. **Updated `PROJECT_STATUS.md` and `CLAUDE.md`** file listing.

---

## Tools

The MCP server exposes 5 tools over stdio.

### `tb2_start_bridge`

Spawns `bridge/bridge.js` as a child process owned by the MCP server.

- If bridge is already running (port in use or process alive): responds "bridge already running"
- On success: responds with the bridge URL (`http://localhost:7331`)
- The bridge process is killed when the MCP server exits (Claude Code closes)
- If the bridge crashes: `tb2_status` will reflect it; `tb2_start_bridge` can restart it

### `tb2_status`

Returns a clear status object:

```json
{
  "bridge": "running" | "not running",
  "turbowarp": "connected" | "not connected",
  "editingTarget": "Sprite1" | null
}
```

Claude Code uses this to inform the user if something is wrong (bridge not started,
TurboWarp not loaded, etc.) rather than letting a cryptic error surface.

### `tb2_get_state`

Calls `GET /state` on the bridge. Returns full project IR and sprite list.
Claude Code uses this to understand the full project before proposing changes.

### `tb2_get_sprite`

Calls `GET /sprite/:name` on the bridge. Returns one sprite's IR.
Claude Code uses this to focus on the mutation target.

### `tb2_propose`

Calls `POST /propose` on the bridge with the provided IR string.

- On success: returns `{ ok: true, proposalId }` — proposal panel appears in TurboWarp
- On validation failure: returns `{ ok: false, error: "<validation message>" }`

Claude Code handles retry: it sees the validation error, reasons about what was wrong,
and calls `tb2_propose` again with corrected IR. It reports progress to the user
("The IR had an error — fixing and retrying..."). No retry logic lives in the server.

---

## IR Grammar Resource

The MCP server reads `IR_GRAMMAR.md` at startup and exposes it as an MCP resource
named `ir-grammar`. Claude Code sees this as part of its context — always authoritative,
never stale. This is what ensures only valid IR reaches the workspace. The bridge's
parser/validator is the final enforcement layer; the grammar resource is the upstream
contract Claude Code works from.

---

## Auto-Connect Change

In `blockify-turbowarp-2.js`, at the end of extension registration (inside the
`loadExtension` call, after `Scratch.extensions.register(new BlockifyPhase1())`), add:

```js
globalThis.__tb2Blockify.connectBridge({ URL: 'ws://localhost:7331' });
```

`BridgeClient` already retries every 3 seconds on close/failure — so if the bridge
isn't running yet when the extension loads, it keeps trying silently and connects
as soon as the bridge starts.

**The existing `connect to bridge [URL]`, `disconnect from bridge`, and `bridge connected?`
blocks are unchanged.** They remain useful as manual overrides — a user can disconnect
from the default bridge and connect to a custom URL if needed.

After this change: `npm run build:blockify2` must be run to regenerate the embedded file.

---

## Session Flow (After Phase 5B)

**One-time setup (per TurboWarp session):**
1. Load `blockify-turbowarp-2.embedded.js` and `textify-turbowarp-2.js` in TurboWarp Desktop
   — bridge connection begins retrying automatically

**Every working session:**
1. Open Claude Code in the repo
2. Tell Claude: *"start the bridge"*
3. Claude calls `tb2_start_bridge` → bridge starts → TurboWarp connects within 3 seconds
4. Claude calls `tb2_status` → confirms connected → reports to user
5. User describes what they want in plain English
6. Claude calls `tb2_get_state` + `tb2_get_sprite`, reasons about IR, calls `tb2_propose`
7. Proposal panel appears in TurboWarp — user clicks Approve
8. Blocks appear in workspace

No console. No terminal. No IR. No copy-paste.

---

## MCP Config

**`.claude/settings.json`** at the repo root (project-local, checked in):

```json
{
  "mcpServers": {
    "tb2": {
      "command": "node",
      "args": ["textify-and-blockify-2/agent/mcp-server.js"]
    }
  }
}
```

Claude Code reads this on startup. The MCP server is available in every session opened
in this repo without any additional setup.

---

## File Layout After Phase 5B

```
textify-and-blockify-2/
  agent/
    mcp-server.js                        ← NEW: MCP server (5 tools + ir-grammar resource)
    runner.js                            ← unchanged
    prompt-builder.js                    ← unchanged
    response-parser.js                   ← unchanged
    claude-client.js                     ← unchanged
  blockify-turbowarp-2.js                ← auto-connect line added
  blockify-turbowarp-2.embedded.js       ← rebuilt
  planning-documents/
    PLAN_PHASE5B_MCP_SERVER.md           ← this file

.claude/
  settings.json                          ← NEW: project-local MCP config
```

---

## Definition of Done

- [ ] `agent/mcp-server.js` exposes all 5 tools and the `ir-grammar` resource
- [ ] `tb2_start_bridge` spawns the bridge and bridge process is killed on server exit
- [ ] `tb2_status` accurately reflects bridge + TurboWarp connection state
- [ ] `tb2_propose` returns validation errors for Claude Code to handle
- [ ] Auto-connect fires on extension load; TurboWarp connects within 3s of bridge starting
- [ ] `.claude/settings.json` created and MCP server loads in Claude Code
- [ ] End-to-end: open Claude Code → "start the bridge" → describe change → approve in TurboWarp → blocks appear
- [ ] `npm test` still passes
- [ ] `PROJECT_STATUS.md` and `CLAUDE.md` updated
