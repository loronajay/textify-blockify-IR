# Phase 4 Manual Tests

Run these in TurboWarp Desktop to verify the bridge client works end-to-end.

**Environment:** TurboWarp Desktop (Electron). Use PowerShell for HTTP commands.
- GET requests: use `curl.exe` (not `curl`, which aliases to `Invoke-WebRequest`)
- POST requests: use `Invoke-RestMethod` — PowerShell intercepts curl.exe flags like `-X` and `-H` when combined with a JSON body

**Setup every test:**
1. Start the bridge: open a terminal and run `node bridge.js` from `textify-and-blockify-2/bridge/`
2. Load `blockify-turbowarp-2.embedded.js` AND `textify-turbowarp-2.js` as unsandboxed extensions
3. Open the DevTools console (F12)

---

## Test 1 — Bridge connects on load

After loading the extensions, the extension does NOT auto-connect (auto-connect is Phase 5). Use the block or the console.

**In console:**
```js
// TurboWarp Desktop: use globalThis.__tb2Blockify, not runtime.ext_blockify2
const blockify2 = globalThis.__tb2Blockify;
blockify2.connectBridge({ URL: 'ws://localhost:7331' });
```

**Expected:**
- No error in console
- Bridge terminal should print nothing new (it just gets a WS connection)
- Run this in console to confirm:
```js
blockify2.bridgeConnected()
// expect: true
```

**Also confirm via HTTP (PowerShell):**
```
curl.exe http://localhost:7331/status
```
Expected response:
```json
{"ok":true,"bridge":"running","turbowarp":"connected"}
```

---

## Test 2 — getState returns IR

With the extension connected (Test 1 done), add at least one block to a sprite (e.g. a `move 10 steps` block). Then in a new terminal:

```
curl.exe http://localhost:7331/state
```

**Expected:** JSON with `ir` field containing the IR of the current sprite's blocks, like:
```json
{"ok":true,"ir":"[script\n  body:[stack: ...]]"}
```

If the sprite is empty, `ir` will be `""`. Add a block first.

---

## Test 3 — getSprite returns IR for a named sprite

Add a block to `Sprite1`. Then:

```
curl.exe http://localhost:7331/sprite/Sprite1
```

**Expected:**
```json
{"ok":true,"sprite":"Sprite1","ir":"[script body:...]"}
```

Try a sprite that doesn't exist:
```
curl.exe http://localhost:7331/sprite/DoesNotExist
```
Expected:
```json
{"ok":false,"error":"Sprite not found: DoesNotExist"}
```

---

## Test 4 — propose shows the visual panel

```powershell
Invoke-RestMethod -Method POST -Uri http://localhost:7331/propose -ContentType "application/json" -Body '{"ir":"[script body:[stack: [opcode:motion_movesteps id:\"x1\" fields:{} inputs:{STEPS:[literal:number:10]} stacks:{}]]]"}'
```

**Expected:**
- Returns `{"ok":true,"proposalId":"p-1"}`
- **In TurboWarp Desktop:** the Blockify 2 proposal panel appears showing "Proposed Changes" with a visual preview of the move block and Approve / Reject buttons

---

## Test 5 — approve commits the blocks

After Test 4 (panel is showing):

1. Click **Approve** in the TurboWarp proposal panel
2. The `move 10 steps` block should appear in the workspace

**Verify via HTTP** (after clicking Approve):
```
curl.exe http://localhost:7331/proposal/p-1
```
Expected:
```json
{"ok":true,"proposalId":"p-1","status":"approved"}
```

---

## Test 6 — reject discards the proposal

Run Test 4 again (sends another propose, gets `p-2`):

```powershell
Invoke-RestMethod -Method POST -Uri http://localhost:7331/propose -ContentType "application/json" -Body '{"ir":"[script body:[stack: [opcode:motion_movesteps id:\"x2\" fields:{} inputs:{STEPS:[literal:number:99]} stacks:{}]]]"}'
```

Click **Reject** in the panel.

**Verify:**
```
curl.exe http://localhost:7331/proposal/p-2
```
Expected:
```json
{"ok":true,"proposalId":"p-2","status":"rejected"}
```

No new blocks should appear in the workspace.

---

## Test 7 — programmatic commit (no UI click needed)

Propose IR and immediately commit via HTTP without touching the TurboWarp UI:

```powershell
Invoke-RestMethod -Method POST -Uri http://localhost:7331/propose -ContentType "application/json" -Body '{"ir":"[script body:[stack: [opcode:motion_movesteps id:\"x3\" fields:{} inputs:{STEPS:[literal:number:42]} stacks:{}]]]"}'
```

Note the `proposalId` from the response (e.g. `p-3`). Then immediately:

```powershell
Invoke-RestMethod -Method POST -Uri http://localhost:7331/commit/p-3
```

**Expected:**
- `{"ok":true}`
- The `move 42 steps` block appears in the TurboWarp workspace
- Panel may or may not have been shown (it shows, but you committed before clicking)

---

## Test 8 — invalid IR returns error

```powershell
$ir = '[this is not valid IR}}}'
Invoke-RestMethod -Method POST -Uri http://localhost:7331/propose -ContentType "application/json" -Body (ConvertTo-Json @{ir=$ir})
```

Note: `Invoke-RestMethod` throws on non-2xx responses. The thrown error message will contain the parse error from the bridge.

**Expected:**
```json
{"ok":false,"error":"...parse error message..."}
```

No panel appears. No blocks added.

---

## Test 9 — bridge reconnects after restart

1. Stop the bridge (Ctrl+C in its terminal)
2. Wait 5 seconds
3. Restart it: `node bridge.js`
4. Wait 5 seconds
5. Check connection:

```
curl.exe http://localhost:7331/status
```

Expected:
```json
{"ok":true,"bridge":"running","turbowarp":"connected"}
```

TurboWarp reconnects automatically within 3 seconds of the bridge restarting. No manual action needed in TurboWarp.

---

## Test 10 — `bridge connected?` block reflects state

In the TurboWarp console:

```js
const blockify2 = globalThis.__tb2Blockify;

// Should be true if connected
blockify2.bridgeConnected()

// Disconnect
blockify2.disconnectBridge()
blockify2.bridgeConnected()  // expect: false

// Reconnect
blockify2.connectBridge({ URL: 'ws://localhost:7331' })
// wait a moment...
blockify2.bridgeConnected()  // expect: true
```

---

## Quick smoke test (all at once)

If the bridge is running and extension is loaded, paste this into the TurboWarp console:

```js
const blockify2 = globalThis.__tb2Blockify;
blockify2.connectBridge({ URL: 'ws://localhost:7331' });
setTimeout(async () => {
  console.log('connected:', blockify2.bridgeConnected());
  const r = await fetch('http://localhost:7331/status').then(r => r.json());
  console.log('bridge status:', r);
}, 200);
```

Expected output:
```
connected: true
bridge status: {ok: true, bridge: "running", turbowarp: "connected"}
```
