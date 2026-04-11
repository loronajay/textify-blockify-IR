# Phase 5D Plan: Targeted Mutation + Multi-Sprite Targeting

**Project:** Prompt-to-Blocks Engine
**Status:** Planning
**Depends on:** Phase 5C complete (unified panel, in-extension agent loop, Railway hosting all verified)

---

## Goal

Improve write-side precision. The system already reads the full project (all sprites, all stacks).
The ceiling is now on the write side.

Today, every commit is additive only: new blocks are injected on top of whatever is already in the
workspace. The agent cannot replace an existing event handler, delete a script, or target a specific
sprite without the user manually switching to it first. Variables created by a commit are not cleaned
up if the user undoes.

Phase 5D fixes all of this without changing the IR grammar or breaking any existing path.

---

## What This Phase Is Not

- **Not** a change to the IR bracket grammar (parser and validator are untouched)
- **Not** a change to the bridge, MCP, or Railway proxy
- **Not** a change to the panel UI or conversation flow
- **Not** multi-file proposals — one commit per `approveIR()` call (coordinated multi-sprite is a single commit that touches several sprites in sequence, still one Approve)
- **Not** Phase 6 (no TurboWarp fork)

---

## Deliverables

1. **Header comment protocol** — `# target:`, `# action:`, `# script-id:` comment lines parsed
   by Blockify 2 before each group of IR roots. Zero grammar changes.
2. **Variable cleanup on undo** — `declareVariablesInVM` returns a list of newly-created variable
   IDs; `undoCommit` removes them from the VM after restoring the workspace XML.
3. **Sprite-targeted commits** — `commitIRToSprite(irText, spriteName)` that switches
   `editingTarget` if needed before injecting blocks.
4. **Replace-all action** — `# action: replace-all` clears all scripts from the target sprite
   before injecting the new IR. Existing additive behavior is unchanged when no action header
   is present.
5. **Replace-script action** — `# action: replace-script` + `# script-id: uid` finds the script
   whose hat-block UID matches, removes it, then injects the replacement. Surgical single-script edits.
6. **Multi-sprite IR parsing** — the parser splits an IR document at `# target:` section
   boundaries and processes each section independently.
7. **Proposal metadata in panel** — Proposal view shows target sprite(s), action type (add /
   replace-script / replace-all), and script count. Foundation laid in Phase 5C (spriteName
   already threaded through); 5D populates it from header metadata.
8. **Updated system prompt** — `buildTB2Prompt` updated to teach the agent the header comment
   protocol so it can produce targeted IR without being asked.
9. **Tests** — new test file `__tests__/blockify2-targeted-mutation.test.js`.
10. **Build + docs** — `npm run build:blockify2`, `PROJECT_STATUS.md`, `CLAUDE.md` file listing.

---

## Risks — Verify Before Writing Code

### R1 — Can we switch editingTarget via VM API?

In TurboWarp Desktop DevTools console:

```js
const vm = Scratch.vm;
const target = vm.runtime.targets.find(t => t.sprite && t.sprite.name === 'Sprite2');
vm.setEditingTarget(target.id);
console.log('editing target:', vm.editingTarget.sprite.name);
```

Expected: console prints `Sprite2` and the workspace updates to show Sprite2's blocks.
Failure mode: `setEditingTarget` doesn't exist or doesn't update the workspace — would need to
find the correct API call or use a different approach.

### R2 — Does workspace.clear() sync the VM target's blocks on replace-all?

```js
const ScratchBlocks = globalThis['ScratchBlocks'];
const workspace = ScratchBlocks.getMainWorkspace();
workspace.clear();
// Then check:
console.log('blocks remaining:', Object.keys(Scratch.vm.editingTarget.blocks._blocks).length);
```

Expected: 0 (or only shadow blocks). If blocks remain in the VM after `workspace.clear()`,
replace-all will leave ghost data in the VM — need to manually clear `target.blocks._blocks` too.

### R3 — Can we remove a specific script by UID from the workspace?

```js
// Assume we know the hat-block UID 'abc123'
const ScratchBlocks = globalThis['ScratchBlocks'];
const workspace = ScratchBlocks.getMainWorkspace();
const block = workspace.getBlockById('abc123');
if (block) {
  // Walk up to the top block of this stack
  let top = block;
  while (top.getParent()) top = top.getParent();
  top.dispose(false);
  console.log('disposed:', top.type);
}
```

Expected: block and its entire stack are removed from workspace and VM.
Failure mode: `getBlockById` returns null or dispose doesn't sync — would need to work at
`target.blocks` VM level instead.

### R4 — Variable cleanup: can we delete a VM variable by ID after undo?

```js
const stage = Scratch.vm.runtime.targets.find(t => t.isStage);
const varId = Object.keys(stage.variables)[0]; // pick any variable
delete stage.variables[varId];
// Check it's gone from the variable monitor list:
console.log(varId in stage.variables); // should print false
```

Expected: `false`. Variable monitor should no longer show the deleted variable after the next
workspace render cycle.

---

## Header Comment Protocol

The parser already has `stripHeaderComments()` which discards `#`-prefixed lines. Phase 5D
extends this to also *parse* those lines for metadata before stripping them.

### Single-sprite example

```
# target: Sprite1
# action: replace-all
[script body:[stack:
  [opcode:event_whenflagclicked]
  [opcode:motion_gotoxy inputs:{X:[literal:number:0] Y:[literal:number:0]}]
]]
[procedure proccode:"init" body:[stack:...]]
```

The two blocks above are committed to `Sprite1`, replacing all of its existing scripts.

### Script-level replace example

```
# target: Sprite1
# action: replace-script
# script-id: abc123-existing-hat-uid
[script body:[stack:
  [opcode:event_whenflagclicked id:"abc123-existing-hat-uid"]
  [opcode:motion_setx inputs:{X:[literal:number:100]}]
]]
```

The existing script whose hat block has `id:"abc123-existing-hat-uid"` is removed.
The new version is injected in its place (same UID is re-used, so block references remain valid).

### Multi-sprite example

```
# target: Sprite1
# action: add
[script body:[stack:
  [opcode:event_whenflagclicked]
  [opcode:data_setvariableto fields:{VARIABLE:"score"} inputs:{VALUE:[literal:number:0]}]
]]

# target: Sprite2
# action: replace-script
# script-id: def456-hat-uid
[script body:[stack:
  [opcode:event_whenflagclicked id:"def456-hat-uid"]
  [opcode:looks_sayforsecs inputs:{MESSAGE:[literal:string:"Game over!"] SECS:[literal:number:2]}]
]]
```

Two separate commits in one proposal. Blockify 2 processes them left-to-right. One `approveIR()`.

### Backward compatibility

If no `# target:` or `# action:` headers are present, behavior is identical to today:
additive inject into `editingTarget`. All existing tests continue to pass without changes.

---

## Implementation Plan

### Step 1: `parseIRDocument(irText)` — new function

Splits the IR text on `# target:` boundaries and returns an array of commit sections:

```js
function parseIRDocument(irText) {
  // Returns: [{ target, action, scriptId, irText }]
  // - target: string | null (null = use editingTarget)
  // - action: 'add' | 'replace-all' | 'replace-script' (default: 'add')
  // - scriptId: string | null (required for replace-script)
  // - irText: the IR body (without comment headers)
}
```

### Step 2: `declareVariablesInVM` returns new variables

```js
function declareVariablesInVM(roots, vm) {
  // Returns: string[] — IDs of variables that were newly created (not pre-existing)
  // Callers that don't care ignore the return value — backward compatible
}
```

### Step 3: `undoCommit` — variable rollback

```js
// New instance state:
this.preCommitWorkspaceXml = '';
this.preCommitVariableIds = [];  // ← NEW: IDs of variables to remove on undo

// undoCommit:
undoCommit() {
  if (!this.preCommitWorkspaceXml) return;
  restoreWorkspaceXml(this.preCommitWorkspaceXml);
  for (const id of this.preCommitVariableIds) {
    const stage = Scratch.vm.runtime.targets.find(t => t.isStage);
    if (stage && id in stage.variables) delete stage.variables[id];
    // also check all sprites (for sprite-local variables)
    for (const t of Scratch.vm.runtime.targets) {
      if (id in (t.variables || {})) delete t.variables[id];
    }
  }
  this.preCommitWorkspaceXml = '';
  this.preCommitVariableIds = [];
}
```

### Step 4: `commitIRToSprite(irText, spriteName, action, scriptId)`

```js
function commitIRToSprite(irText, spriteName, action = 'add', scriptId = null) {
  // 1. Resolve target: find sprite by name, or use editingTarget if spriteName is null
  // 2. Switch editingTarget if needed (verify R1)
  // 3. Based on action:
  //    'replace-all': workspace.clear() then inject
  //    'replace-script': remove specific script by scriptId (verify R3), then inject
  //    'add': inject as today
  // 4. Parse, remint, declare vars, inject
  // Returns: { success, blockCount, newVariableIds } | { success: false, error }
}
```

### Step 5: `commitIRDocument(irText)` — top-level entry

```js
function commitIRDocument(irText) {
  const sections = parseIRDocument(irText);
  const allNewVarIds = [];
  for (const section of sections) {
    const result = commitIRToSprite(section.irText, section.target, section.action, section.scriptId);
    if (!result.success) return result;
    allNewVarIds.push(...result.newVariableIds);
  }
  return { success: true, newVariableIds: allNewVarIds };
}
```

`commitIRToWorkspace` becomes a thin wrapper over `commitIRDocument` for backward compatibility.

### Step 6: Proposal metadata

`proposeIRDirect(irText, spriteName)` — when `spriteName` is not provided, derive it from the
`# target:` header in the IR. Pass the parsed sections to the panel so it can display:

```
Target: Sprite1 (replace-all), Sprite2 (replace-script)
3 scripts total
```

This is shown in the Proposal view header, above the block preview.

### Step 7: System prompt update

Add to `buildTB2Prompt()` — after the IR grammar section, add a "Commit Protocol" section:

```
## Commit Protocol

Use header comments before IR sections to control how blocks are committed:

  # target: <sprite name>   — commit to this sprite (default: currently selected sprite)
  # action: add             — additive inject (default)
  # action: replace-all     — clear all scripts from target sprite, then inject
  # action: replace-script  — remove and replace one script
  # script-id: <uid>        — required with replace-script; the hat-block UID to replace

For multi-sprite proposals, repeat # target: / # action: headers before each IR section.
Header comments must appear before any IR bracket nodes in their section.
```

---

## TDD Plan

### New test file: `__tests__/blockify2-targeted-mutation.test.js`

| Test | What it covers |
|---|---|
| `parseIRDocument` with no headers returns single add section | Backward compat |
| `parseIRDocument` with `# target:` parses target name | Header parsing |
| `parseIRDocument` with `# action: replace-all` parses action | Header parsing |
| `parseIRDocument` with `# action: replace-script` + `# script-id:` parses both | Header parsing |
| `parseIRDocument` splits multi-sprite IR at `# target:` boundaries | Multi-sprite |
| `declareVariablesInVM` returns IDs of newly created variables | Variable tracking |
| `declareVariablesInVM` returns empty for pre-existing variables | Idempotency |
| `undoCommit` removes variables created in commit | Variable cleanup |
| `undoCommit` does not remove pre-existing variables | Variable cleanup |
| `commitIRToSprite` with action:add injects blocks additively | Add action |
| `commitIRToSprite` with action:replace-all clears first | Replace-all action |
| `commitIRToSprite` with action:replace-script removes hat and injects | Replace-script action |
| `commitIRDocument` processes two sections targeting different sprites | Multi-sprite commit |
| `commitIRDocument` fails on first bad section, returns error | Error handling |
| Proposal metadata shows correct sprite(s) and action type | Panel metadata |
| Proposal metadata defaults to editingTarget when no target header | Backward compat |

### Regression requirement

All 135 existing TB2 tests must still pass after Phase 5D. The core parser/validator is not touched.

---

## Variable Cleanup: Edge Cases

1. **Variables used by pre-existing scripts** — if a variable was declared before the commit and
   a pre-existing script uses it, undo must NOT delete it. Solution: `declareVariablesInVM` only
   returns IDs of variables it *created* (not ones that already existed before the call).

2. **Variables used by other committed scripts in the same session** — each commit gets its own
   `preCommitVariableIds`. Undo only rolls back the most recent commit. This is the existing
   single-level undo contract and remains unchanged.

3. **Stage vs sprite-local variables** — `declareVariablesInVM` currently creates everything on
   the stage. Phase 5D continues this convention. Sprite-local variables are out of scope.

---

## Sprite Switching: editingTarget vs VM-level writes

Two paths depending on R1 and R2 results:

**Path A (preferred): workspace-mediated writes**
- Call `vm.setEditingTarget(targetId)` to switch active sprite
- Workspace updates to show that sprite's blocks
- Proceed with existing `injectRootsIntoWorkspace` / `workspace.clear()` as today
- After commit, switch back to the original editing target
- Pro: uses the same proven injection path; workspace and VM stay in sync automatically

**Path B (fallback): VM-level block writes**
- Keep editingTarget unchanged
- Write directly to `target.blocks._blocks` via the VM's block API
- Use `vm.runtime.emit('PROJECT_CHANGED')` to trigger a sync
- Pro: no workspace switch; no visual flicker for the user
- Con: bypasses `domToWorkspace` and its automatic sync; riskier

Verify R1 before choosing. If `vm.setEditingTarget` works cleanly and can switch back without
side effects, Path A is the implementation.

---

## File Layout After Phase 5D

```
textify-and-blockify-2/
  blockify-turbowarp-2.js               ← parseIRDocument, commitIRDocument, commitIRToSprite,
                                            variable cleanup, proposal metadata added
  blockify-turbowarp-2.embedded.js      ← rebuilt
  __tests__/
    blockify2-vm-writer.test.js         ← unchanged
    blockify2-preview-ui.test.js        ← unchanged
    blockify2-bridge-client.test.js     ← unchanged
    blockify2-provider-clients.test.js  ← unchanged
    blockify2-agent-logic.test.js       ← unchanged
    blockify2-prompt-ui.test.js         ← unchanged
    blockify2-targeted-mutation.test.js ← NEW: header parsing, targeted commits, variable cleanup
  planning-documents/
    PLAN_PHASE5D_TARGETED_MUTATION.md   ← this file
```

---

## Definition of Done

- [ ] R1–R4 risks verified in TurboWarp Desktop console
- [ ] `parseIRDocument` correctly splits and parses all header combinations
- [ ] `declareVariablesInVM` returns newly-created variable IDs
- [ ] `undoCommit` removes created variables alongside restoring workspace XML
- [ ] `commitIRToSprite` with `add` passes all existing commit tests
- [ ] `commitIRToSprite` with `replace-all` clears and resets correctly
- [ ] `commitIRToSprite` with `replace-script` surgically replaces one script
- [ ] Multi-sprite commit processes each section and commits to the correct sprite
- [ ] Proposal panel shows target sprite(s) and action type
- [ ] System prompt teaches the header comment protocol
- [ ] All 15+ new targeted mutation tests passing
- [ ] All 135+ existing TB2 tests still passing (zero regressions)
- [ ] `npm run build:blockify2` completes without errors
- [ ] `PROJECT_STATUS.md` and `CLAUDE.md` updated
- [ ] Manual verification: end-to-end prompt → replace-script → approve → correct script replaced
