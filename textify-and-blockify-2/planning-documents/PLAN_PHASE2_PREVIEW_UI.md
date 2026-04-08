# Phase 2 Plan: Preview & Validation UI

**Project:** Prompt-to-Blocks Engine
**Folder:** `textify-and-blockify-2/`
**Status:** Planning

---

## Context

Phase 1 gave Blockify 2 the ability to write IR directly into the live TurboWarp workspace. The current "commit IR from clipboard" block does this immediately with no confirmation step.

Phase 2 adds the approve/reject layer that the CLAUDE.md vision requires:

> Every proposed change is previewed before it is committed. Users always have approve/reject.

The user experience becomes:
1. Run "propose IR from clipboard" block
2. A preview panel appears showing the proposed blocks (visual render)
3. User clicks **Approve** → blocks appear in workspace
4. Or clicks **Reject** → nothing changes

This is also the shape of the Phase 3 agent flow — the bridge calls propose, the user approves or rejects, the VM writer commits only on approval.

---

## What Phase 1 Left in Place

The commit path is complete and tested. Phase 2 does not modify it:

| Function | Role |
|---|---|
| `commitIRToWorkspace(irText)` | Parse → validate → remint → declare vars → inject. Already works. |
| `declareVariablesInVM` | Already handles scalars, lists, broadcasts |
| `injectRootsIntoWorkspace` | Already injects via `ScratchBlocks.Xml.domToWorkspace` |

Phase 2 wraps this path behind a preview gate. The commit function itself is untouched.

---

## Phase 2 Deliverables

### Pending change state (on extension instance)

Two new instance properties:

```js
this.pendingIR = null;           // IR text waiting for approval, or null
this.preCommitWorkspaceXml = ''; // workspace snapshot captured just before last commit, for undo
```

### 3 new functions in `blockify-turbowarp-2.js`

**`captureWorkspaceXml()`**
Captures the current workspace as an XML string before a commit. Used for undo. Returns empty string on failure (non-fatal).

```js
// Pseudocode
const twScratchBlocks = globalThis['ScratchBlocks'];
const workspace = twScratchBlocks.getMainWorkspace();
const dom = twScratchBlocks.Xml.workspaceToDom(workspace);
return twScratchBlocks.Xml.domToText(dom);
```

**`restoreWorkspaceXml(xmlText)`**
Clears the workspace and restores from a saved XML string. Used for undo.

```js
const twScratchBlocks = globalThis['ScratchBlocks'];
const workspace = twScratchBlocks.getMainWorkspace();
workspace.clear();
const dom = twScratchBlocks.Xml.textToDom(xmlText);
twScratchBlocks.Xml.domToWorkspace(dom, workspace);
```

**`showProposalPanel(instance, irText)`**
Renders a preview panel (extending the existing clipboard preview infrastructure) showing the proposed blocks with Approve and Reject buttons. On Approve: calls `captureWorkspaceXml`, then `commitIRToWorkspace`, then closes panel. On Reject: clears `pendingIR`, closes panel.

### 4 new extension blocks

| Block text | Opcode | Type | What it does |
|---|---|---|---|
| `propose IR from clipboard` | `proposeIR` | command | Read clipboard → validate → store as pendingIR → show preview panel |
| `approve pending IR` | `approveIR` | command | Snapshot workspace, commit pendingIR, clear pending state |
| `reject pending IR` | `rejectIR` | command | Clear pendingIR, no workspace change |
| `undo last Blockify commit` | `undoCommit` | command | Restore pre-commit workspace snapshot |
| `IR pending?` | `hasPendingIR` | boolean reporter | True if a proposal is waiting for approval |

Note: "commit IR from clipboard" (`commitIR`) stays as-is — it's the direct path used for testing and power-user scripting.

### Preview panel UI

Extends the existing `showClipboardPreview` infrastructure. New panel shows:
- Visual block render of the proposed IR (using existing `renderProcedureWithScratchBlocks`)
- IR text in a read-only area (collapsible)
- **Approve** button (green) and **Reject** button (red)
- Error state if validation failed (Approve disabled, only Reject available)

The panel appears as an overlay within TurboWarp's editor — same approach as the existing clipboard preview.

---

## Tests

| Test | What it proves |
|---|---|
| `proposeIR` with valid IR sets `pendingIR` on instance | State is stored correctly |
| `proposeIR` with invalid IR does not set `pendingIR` | Validation gate works |
| `approveIR` calls `commitIRToWorkspace` and clears pending | Approve path commits and resets |
| `approveIR` when nothing pending is a no-op | No crash on spurious approve |
| `rejectIR` clears `pendingIR` without touching workspace | Reject path is clean |
| `hasPendingIR` returns true when pending, false when clear | Reporter correct in both states |
| `captureWorkspaceXml` returns non-empty string when workspace has blocks | Snapshot works |
| `undoCommit` with saved snapshot restores workspace | Undo path works |
| `undoCommit` with no snapshot is a no-op | No crash on first undo |

---

## Risk: Verify Workspace Snapshot API Before Writing Code

Phase 1 confirmed `domToWorkspace` and `textToDom`. Phase 2 needs two additional calls that have not been verified:

1. `ScratchBlocks.Xml.workspaceToDom(workspace)` — standard Blockly, very likely present
2. `ScratchBlocks.Xml.domToText(dom)` — standard Blockly, very likely present
3. `workspace.clear()` — standard Blockly, very likely present

Confirm in TurboWarp Desktop console before writing any Phase 2 code:

```js
// Confirm workspaceToDom
const ws = ScratchBlocks.getMainWorkspace();
const dom = ScratchBlocks.Xml.workspaceToDom(ws);
typeof ScratchBlocks.Xml.domToText(dom); // expect "string"

// Confirm workspace.clear exists
typeof ws.clear; // expect "function"
```

If `domToText` is missing, fallback is `new XMLSerializer().serializeToString(dom)`.

---

## What Phase 2 Does NOT Include

- Multiple pending changes / queue — Phase 3 (bridge introduces this)
- Variable-level undo (only full workspace restore) — future
- Multi-sprite targeting — Phase 1 limitation carried forward
- Agent integration — Phase 3

---

## Block Flow After Phase 2

```
User copies IR to clipboard
  ↓
"propose IR from clipboard" block runs
  ↓
Validation passes → preview panel opens (visual render + Approve/Reject)
  ↓
User clicks Approve
  ↓
Workspace snapshot captured
commitIRToWorkspace() called
Blocks appear
  ↓
(optional) User clicks "undo last Blockify commit" → workspace restored
```
