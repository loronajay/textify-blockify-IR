# Phase 1 Plan: Blockify VM Writer

**Project:** Prompt-to-Blocks Engine
**Folder:** `textify-and-blockify-2/`
**Status:** Planning — not started

---

## Context

The goal of this project is to eliminate the manual copy-paste loop between an AI coding agent and TurboWarp. The end state is a game engine where a user prompts an agent, the agent generates block stacks, the user validates them, and the stacks appear live in the TurboWarp workspace — variables created, procedures registered, everything wired.

Textify and Blockify are not replaced by this system. They become the invisible infrastructure underneath it. Textify handles reading project state out as IR. Blockify handles parsing, validation, and — after Phase 1 — writing committed changes back into the workspace.

The full pipeline is:

```
Agent
  ↕ IR
Tool interface (HTTP / MCP)        ← Phase 3
  ↕ IR
Preview + validation UI            ← Phase 2
  ↕ IR
Blockify (parse → validate → commit)  ← Phase 1
  ↓ VM writes
TurboWarp workspace
  ↑ IR
Textify (export)
```

Phase 1 adds the commit path to Blockify. Nothing else in the pipeline exists yet — Phase 1 is the foundation everything else depends on.

---

## What Already Exists (no new code needed)

The XML generation path in `blockify-turbowarp.js` is already ~90% of what Phase 1 needs:

| Function | Role |
|---|---|
| `Parser.parseAll()` | IR text → validated AST |
| `astToScratchBlocksXmlMulti()` | AST → Scratch Blocks XML with variable declarations |
| `collectDeclaredVariables()` | Finds all variable / list / broadcast refs in AST |
| `variableIdFor(name, type)` | Stable deterministic IDs — `scalar:name`, `list:name`, `broadcast:name` |
| `fieldListXml()` | Embeds correct variable IDs in field XML, already aligned with `variableIdFor` |

---

## Phase 1 Deliverables

### 4 new functions in `blockify-turbowarp.js`

**`remintBlockIds(roots)`**
Walks every `id` field in the AST and replaces it with a fresh UUID. Returns the remapped roots. Prevents ID collisions with blocks already in the workspace — IR can reuse IDs like `"goto1"` across multiple commits without crashing.

**`declareVariablesInVM(roots, vm)`**
Uses `collectDeclaredVariables()` to find every variable / list / broadcast in the IR, then for each: checks whether it already exists on `vm.editingTarget.variables`, creates it if not. Scratch stores variables and lists in the same map, differentiated by `type: ''` vs `type: 'list'`. Broadcasts are created on the stage target.

**`injectRootsIntoWorkspace(roots, workspace)`**
Calls `astToScratchBlocksXmlMulti(roots)` → parses to DOM via `ScratchBlocks.Xml.textToDom()` → injects via `ScratchBlocks.Xml.domToWorkspace(dom, workspace)`. TurboWarp fires change events from this that sync the VM automatically — no manual VM block-write needed.

**`commitIRToWorkspace(irText)`**
Top-level entry point. Chains: parse → validate → remint IDs → declare variables → inject into workspace. Returns `{success: true, blockCount: N}` or `{success: false, error: '...'}`. This is the only function the extension block calls.

### 1 new extension block

A `commitIR` block added to Blockify's `getInfo()`. Reads IR from `__TEXTIFY_SHARED__.lastExportText` (the existing shared state bridge Textify already writes to) and calls `commitIRToWorkspace`. No new buffer management needed.

---

## Tests

| Test | What it proves |
|---|---|
| Roundtrip: write IR → commit → Textify export → parse | Structure survives the round trip |
| Variable creation: IR with `data_setvariableto` → commit → inspect `vm.editingTarget.variables` | Variables created correctly |
| List creation: IR with `data_addtolist` → commit | Lists created correctly |
| Procedure: IR with `[procedure]` → commit | Definition block and prototype appear |
| ID collision: commit same IR twice | No crash, second set gets fresh IDs |
| Invalid IR: commit with parse error | Returns error, workspace unchanged |
| Factory opcode passthrough: IR with e.g. `factoryanimation_playAnimation` | No crash — unknown opcodes pass through XML unchanged |

---

## Risk: Verify Workspace Injection API Before Writing Code

**Flag:** `ScratchBlocks.Xml.domToWorkspace()` is the assumed injection path based on Blockly's standard API and TurboWarp's documented globals. Before writing any Phase 1 code, confirm:

1. That `ScratchBlocks` is accessible from an unsandboxed extension at runtime in TurboWarp Desktop
2. That `ScratchBlocks.Xml.domToWorkspace(dom, workspace)` is the correct call (vs. a TurboWarp-specific override)
3. That the workspace reference is accessible — likely via `ScratchBlocks.getMainWorkspace()` or a TurboWarp global

This check takes ~10 minutes in TurboWarp Desktop's console before any code is written. Do not skip it.

---

## What Phase 1 Does NOT Include

- Preview vs. commit distinction — Phase 2
- Undo / rollback — Phase 2
- Multi-sprite targeting — Phase 1 writes to `vm.editingTarget` only
- Local bridge / HTTP server — Phase 3
- Agent hookup — Phase 4

---

## Subsequent Phases (high level)

| Phase | What it adds |
|---|---|
| **2** | Preview state manager — pending change queue, approve / reject UI, visual diff before commit |
| **3** | Local Node bridge — `/propose`, `/commit`, `/reject`, `/state` endpoints; WebSocket link to TurboWarp |
| **4** | TurboWarp Desktop `userscript.js` — editor adapter, command panel, undo |
| **5** | Agent protocol — tool contract, system prompt template with IR grammar + factory block catalog |
| **6 (future)** | TurboWarp fork — factory extensions as first-class built-ins, IR-native data model |
