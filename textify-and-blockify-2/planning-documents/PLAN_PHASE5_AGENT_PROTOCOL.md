# Phase 5 Plan: Agent Protocol

**Project:** Prompt-to-Blocks Engine
**Status:** Planning
**Depends on:** Phase 4 complete (bridge + bridge client fully verified)

---

## Goal

Eliminate the copy-paste cycle. A user types a natural language prompt. A local runner gathers project context, calls Claude, and submits the resulting IR to the bridge. TurboWarp shows the proposal panel. The user approves. Blocks appear.

No clipboard. No IR editing. No manual bridge calls.

---

## What This Phase Is Not

To be explicit about scope:

- **Not** a new bridge endpoint or transport layer — the bridge is frozen
- **Not** MCP tooling (that comes next, as a thin wrapper on what Phase 5 builds)
- **Not** multi-sprite commit — the executor is still single-sprite; Phase 5 respects that
- **Not** factory extension catalog — that comes after Phase 5 when the loop is proven
- **Not** full project mutation — the agent reads wide, proposes narrow (one sprite at a time)

Multi-sprite commit and full project scope are **not blocked** by these decisions. Phase 5 designs its scope contract to be extensible: the read scope (what state the agent sees) is already full-project via `/state`. The write scope (what it can propose) is one sprite, which is the current executor limit. When the executor gains multi-sprite support, the runner gains a `--multi` flag without architectural changes.

---

## Deliverables

1. **`agent/runner.js`** — CLI entry point. The only file the user (or later, a CI script) invokes.
2. **`agent/prompt-builder.js`** — Constructs the Claude system prompt from IR grammar + project state + constraints.
3. **`agent/response-parser.js`** — Parses Claude's structured output (`IR_ONLY` / `NO_CHANGE` / `ERROR:<reason>`).
4. **`agent/__tests__/runner.test.js`** — Full round-trip integration tests (real bridge, mock WS client, real Claude API or seeded fixture responses).
5. Updated **`PROJECT_STATUS.md`** and **`CLAUDE.md`** file listing.

---

## Runner Design

### Invocation

```bash
# Mutate the current editing target (most common)
node agent/runner.js "add a score counter that increases when the player touches a coin"

# Target a named sprite explicitly
node agent/runner.js --sprite Sprite1 "add player movement with arrow keys"

# Read-only analysis (no propose — prints what Claude would do)
node agent/runner.js --dry-run "explain what this sprite does"
```

### Runner flow

```
1. Parse args (prompt, optional --sprite, optional --dry-run)
2. GET /state                          ← full project IR for context
3. If --sprite: GET /sprite/:name      ← targeted IR as mutation substrate
   Else: GET /sprite/[editingTarget]   ← or derive editing target from state
4. Build system prompt (see below)
5. Call Claude API → raw response string
6. Parse response → IR_ONLY | NO_CHANGE | ERROR
7. If NO_CHANGE: print "No changes needed." Exit 0.
8. If ERROR: print error reason. Exit 1.
9. If IR_ONLY and not --dry-run:
   POST /propose with IR
   If 200: print proposalId. "Waiting for approval in TurboWarp." Exit 0.
   If 400 (validation error): retry once with error fed back (see Retry section)
   If retry fails: print final error. Exit 1.
10. If IR_ONLY and --dry-run: print the IR. Exit 0.
```

### Scope model

| What | Source | Purpose |
|---|---|---|
| Full project state | `GET /state` | Context — Claude understands the whole project |
| Mutation target IR | `GET /sprite/:name` or editing target | What Claude actually edits |
| Proposal | `POST /propose` | One sprite's IR only |

The agent is told explicitly in the system prompt: "You may read the full project state for context. You must propose changes to exactly one sprite."

---

## System Prompt Template

`prompt-builder.js` constructs a prompt from three parts:

### Part 1 — IR Grammar (fixed)

Inline the full contents of `IR_GRAMMAR.md`. This is the source of truth for valid IR. No summary — the full spec.

### Part 2 — Project context (dynamic)

```
## Current Project State

The full project IR is:

<project_ir>
{fullStateIR}
</project_ir>

The sprite you are modifying is: {spriteName}
Its current IR is:

<target_ir>
{targetIR}
</target_ir>
```

### Part 3 — Task and constraints (dynamic + fixed rules)

```
## Task

{userPrompt}

## Rules

You must return exactly one of these three responses:

1. IR_ONLY
   The literal text "IR_ONLY" on the first line, followed by the complete IR for the
   modified sprite. No explanation. No commentary. The IR must be the full replacement
   for the target sprite, not a fragment.

2. NO_CHANGE
   The literal text "NO_CHANGE" if the requested change is already present, not
   applicable, or cannot be safely expressed in IR.

3. ERROR:<reason>
   The literal text "ERROR:" followed by a one-line reason if the task is
   ambiguous, contradictory, or requires capabilities not present in the IR grammar.

Do not mix formats. Do not add commentary before or after your chosen response.
Do not return partial IR. Do not return multiple proposals.

Prefer the smallest valid mutation that satisfies the request. Do not rewrite
blocks that are unrelated to the task. Do not remove existing behavior unless
explicitly asked to.

You may read the full project state for context. You must propose changes to
exactly one sprite: {spriteName}.
```

---

## Response Parser

`response-parser.js` exports one function: `parseAgentResponse(rawText)`.

Returns one of:
```js
{ type: 'IR_ONLY', ir: '...' }
{ type: 'NO_CHANGE' }
{ type: 'ERROR', reason: '...' }
{ type: 'PARSE_FAILURE', raw: '...' }  // Claude ignored the protocol
```

`PARSE_FAILURE` is treated as a non-retryable hard error — it means the system prompt isn't working, not that the IR is wrong.

---

## Retry and Failure Handling

When `POST /propose` returns a 400 validation error:

```
1. Extract the error message from the bridge response
2. Append to the conversation as a user turn:
   "Your IR was rejected by the validator with this error: {errorMessage}
    Return a corrected IR_ONLY response. Same rules apply."
3. Call Claude again (same conversation thread, error message appended)
4. Parse and POST again
5. If this also fails: print final error, exit 1. No further retries.
```

Max attempts: **2 total** (1 original + 1 retry). This is sufficient to recover from minor IR mistakes. Beyond two attempts the issue is likely a prompt or grammar problem, not a fixable runtime error.

---

## Integration Tests

Tests live in `agent/__tests__/runner.test.js`. They use the real `createBridge()` from Phase 3 and a mock WS client (same pattern as `bridge.test.js`).

Claude API calls are **seeded with fixture responses** in tests — no live API calls, no flakiness, no cost. A thin `callClaude(prompt)` function is injected/mocked in tests.

### Test cases

| # | Name | What it tests |
|---|---|---|
| 1 | Happy path — mutate current sprite | Prompt → IR_ONLY → propose → 200 → proposalId printed |
| 2 | Happy path — named sprite | `--sprite Sprite1` routes to correct GET endpoint |
| 3 | NO_CHANGE response | Runner exits 0, no propose call made |
| 4 | ERROR response from Claude | Runner exits 1, error reason printed, no propose call |
| 5 | Validation failure → retry → success | Bridge rejects first IR, runner retries with error, second IR accepted |
| 6 | Validation failure → retry → failure | Both attempts fail, runner exits 1 with final error |
| 7 | PARSE_FAILURE (Claude ignores protocol) | Treated as hard error, no retry, no propose |
| 8 | Bridge not running | Runner exits 1 with "TurboWarp not connected" |
| 9 | Dry run | IR printed, no propose call regardless of bridge state |
| 10 | Full state included in prompt | Prompt builder includes both /state and /sprite/:name |

10 tests, all passing before Phase 5 is considered done.

---

## MCP Path (Post Phase 5)

The runner is designed so MCP is a thin wrapper, not a rewrite.

The runner's core logic (`buildPrompt → callClaude → parseResponse → postPropose`) becomes a function. The MCP server calls that function with the same arguments the CLI passes today. The bridge stays unchanged. The system prompt stays unchanged.

When that wrapper is built (Phase 5 follow-on), users can drive TurboWarp from Claude Desktop or Claude Code with natural language tool calls instead of terminal commands.

---

## File Layout After Phase 5

```
textify-and-blockify-2/
  agent/
    runner.js              ← CLI entry point
    prompt-builder.js      ← system prompt construction
    response-parser.js     ← IR_ONLY / NO_CHANGE / ERROR parsing
    __tests__/
      runner.test.js       ← 10 integration tests
  bridge/
    bridge.js              ← unchanged
    bridge.test.js         ← unchanged
  __tests__/               ← TB2 Blockify/Textify tests (unchanged)
  planning-documents/
    PLAN_PHASE5_AGENT_PROTOCOL.md  ← this file
```

No changes to `blockify-turbowarp-2.js`, `textify-turbowarp-2.js`, or any Phase 1–4 code.

---

## Definition of Done

- [ ] `node agent/runner.js "add move 10 steps on green flag"` produces a proposal in TurboWarp
- [ ] User approves in TurboWarp → block appears in workspace
- [ ] All 10 runner integration tests pass
- [ ] `npm test` still passes (TB1 + TB2 tests unaffected)
- [ ] `PROJECT_STATUS.md` updated
