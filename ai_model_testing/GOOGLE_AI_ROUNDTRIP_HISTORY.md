# Google Gemini (current) Round-Trip History

## Purpose

This file records the historical Google Gemini (current) mutation tests that were run against the Textify/Blockify IR workflow.

Each case includes:

- the shared starting IR used for the test set
- the exact prompt given to the model
- a normalized description of the intended mutation
- the observed result recorded from historical Blockify screenshots

## Important Notes

### 1. Starting IR Is Canonicalized

The shared starting IR below is a canonicalized reconstruction of the historical test setup.

It preserves the important structural invariants from the original test run:

- `[procedure]` root
- `proccode:"TEST BLOCK A"`
- top-level `control_repeat`
- nested `control_if`
- nested `data_changevariableby`
- `operator_equals` condition using `motion_xposition` and `50`
- `VARIABLE:"x"`
- `VALUE:[literal:number:1]`

Exact historical IDs may differ.

### 2. Historical Renderer Limits

These screenshots were taken before full Blockify visual support existed for several opcodes.

As a result, successful historical results may still display placeholders like:

- `[unsupported opcode: control_repeat]`
- `[unsupported opcode: operator_equals]`

That does **not** mean the mutation failed.

The key historical signal is that the screenshots show:

- `ERROR: [none]`
- successful visual survival through Blockify

### 3. Mutation Section

The `Mutation` section below is a normalized structural summary of what Google was asked to produce.

It should not be treated as a verbatim copy of Google’s returned IR.

## Shared Starting IR

```text
[procedure
  proccode:"TEST BLOCK A"
  argumentnames:[]
  argumentdefaults:[]
  warp:true
  body:[stack:
    [opcode:control_repeat
      id:"repeat1"
      fields:{}
      inputs:{
        TIMES:[literal:number:10]
      }
      stacks:{
        SUBSTACK:[stack:
          [opcode:control_if
            id:"if1"
            fields:{}
            inputs:{
              CONDITION:[opcode:operator_equals
                id:"cond1"
                fields:{}
                inputs:{
                  OPERAND1:[opcode:motion_xposition
                    id:"xpos1"
                    fields:{}
                    inputs:{}
                    stacks:{}
                  ]
                  OPERAND2:[literal:number:50]
                }
                stacks:{}
              ]
            }
            stacks:{
              SUBSTACK:[stack:
                [opcode:data_changevariableby
                  id:"change1"
                  fields:{
                    VARIABLE:"x"
                  }
                  inputs:{
                    VALUE:[literal:number:1]
                  }
                  stacks:{}
                ]
              ]
            }
          ]
        ]
      }
    ]
  ]
]
```

## Test 1

### Starting IR

Use the shared starting IR above.

### Prompt

```text
Move the existing control_if block inside the repeat block’s SUBSTACK.
```

### Mutation

- result should center on a top-level `control_repeat`
- the `control_if` should live under that repeat’s `SUBSTACK`
- the nested variable-change command should remain preserved

### Results

Observed historical screenshot behavior:

- `ERROR: [none]`
- visual output showed only a top-level `[unsupported opcode: control_repeat]`

Interpretation:

- the mutation survived Blockify
- the repeat wrapper remained valid
- the historical renderer did not expose the nested internal structure clearly in this screenshot because `control_repeat` was not yet visually supported

## Test 2

### Starting IR

Use the shared starting IR above.

### Prompt

```text
Add a second control_if block directly below the existing control_repeat block in the top-level stack.
```

### Mutation

- keep the existing top-level repeat
- add another `control_if` below it
- preserve the same condition/value structures where reused

### Results

Observed historical screenshot behavior:

- `ERROR: [none]`
- visible render showed:
  - one `[unsupported opcode: control_repeat]`
  - one `if` block containing `change x by 1`

Interpretation:

- the result survived Blockify
- at least one `if` branch remained valid after the edit
- the repeat stayed structurally present at the top level

## Test 3

### Starting IR

Use the shared starting IR above.

### Prompt

```text
Replace the top-level stack with three control blocks in this exact order:

1. control_if with one data_changevariableby command inside
2. control_if with an empty SUBSTACK
3. control_repeat with an empty SUBSTACK

For the non-empty if block, use the same CONDITION structure, VARIABLE, and VALUE found in the provided IR.
```

### Mutation

- top-level order:
  - `control_if` with one `data_changevariableby`
  - `control_if` with empty `SUBSTACK`
  - `control_repeat` with empty `SUBSTACK`

### Results

Observed historical screenshot behavior:

- `ERROR: [none]`
- visible render showed:
  - `if` with `change x by 1`
  - `if` with `[empty stack]`
  - `[unsupported opcode: control_repeat]`

Interpretation:

- the requested order survived
- the empty-stack case survived
- Blockify accepted the mutation structurally

## Test 4

### Starting IR

Use the shared starting IR above.

### Prompt

```text
Create this exact top-level order:

1. empty control_repeat block
2. one data_changevariableby command
3. one control_if block containing one data_changevariableby command
4. one data_changevariableby command

All variable-change commands must use the same VARIABLE and VALUE as the original command.
The control_if block must use the same CONDITION structure as the original inner if block.
```

### Mutation

- top-level order:
  - empty `control_repeat`
  - `data_changevariableby`
  - `control_if` containing `data_changevariableby`
  - `data_changevariableby`

### Results

Observed historical screenshot behavior:

- `ERROR: [none]`
- visible render showed:
  - `[unsupported opcode: control_repeat]`
  - `change x by 1`
  - `if` containing `change x by 1`
  - `change x by 1`

Interpretation:

- the requested top-level order survived
- repeated variable-change commands remained valid
- the mixed empty/non-empty structure survived

## Test 5

### Starting IR

Use the shared starting IR above.

### Prompt

```text
Modify the top-level stack so it contains:

1. one control_if block
   - inside its SUBSTACK:
     - first, one data_changevariableby command
     - second, one control_repeat block containing one data_changevariableby command
2. immediately after the if block, add one data_changevariableby command at the parent stack level

Use the same CONDITION structure, VARIABLE, and VALUE found in the provided IR.
```

### Mutation

- top-level:
  - `control_if`
  - `data_changevariableby`
- inside the `if`:
  - one direct `data_changevariableby`
  - one nested `control_repeat` containing another `data_changevariableby`

### Results

Observed historical screenshot behavior:

- `ERROR: [none]`
- visible render showed:
  - `if` containing `change x by 1`
  - a nested `[unsupported opcode: control_repeat]` inside the `if`
  - one additional top-level `change x by 1` below the `if`

Interpretation:

- the parent-level promotion/addition survived
- nested repeat-within-if survived
- the shape matched the requested mixed nesting

## Test 6

### Starting IR

Use the shared starting IR above.

### Prompt

```text
Replace the top-level stack with:

1. control_if with an empty SUBSTACK
2. control_repeat with an empty SUBSTACK

Keep the CONDITION valid for the if block by using the same CONDITION structure found in the provided IR.
```

### Mutation

- top-level order:
  - empty `control_if`
  - empty `control_repeat`

### Results

Observed historical screenshot behavior:

- `ERROR: [none]`
- visible render showed:
  - `if` with `[empty stack]`
  - `[unsupported opcode: control_repeat]`

Interpretation:

- both empty-control cases survived
- the empty `if` remained valid
- the empty repeat remained structurally present

## Test 7

### Starting IR

Use the shared starting IR above.

### Prompt

```text
Modify only the inside of the existing inner control_if block:

Wrap the data_changevariableby command inside a control_repeat block.

The repeat block should be the only child of that control_if block's SUBSTACK.
The data_changevariableby command should be inside the repeat block’s SUBSTACK.

Do not change the existing top-level control_repeat block.
Do not change the CONDITION, VARIABLE, or VALUE.
```

### Mutation

- keep the outer repeat in place
- keep the inner `if` in place
- replace the inner `if` substack contents with:
  - one `control_repeat`
    - containing one `data_changevariableby`

### Results

Observed historical screenshot behavior:

- `ERROR: [none]`
- visual output showed only a top-level `[unsupported opcode: control_repeat]`

Interpretation:

- the mutation survived Blockify
- the outer repeat remained valid
- the inner nesting was not clearly visible in the fallback render because `control_repeat` was unsupported

## Test 8

### Starting IR

Use the shared starting IR above.

### Prompt

```text
Replace the top-level stack with three control blocks in this exact order:

1. control_if with one data_changevariableby command inside
2. control_repeat with one data_changevariableby command inside
3. control_if with an empty SUBSTACK

All variable-change commands must use the same VARIABLE and VALUE.
All control_if blocks must use the same CONDITION structure found in the provided IR.
```

### Mutation

- top-level order:
  - `control_if` with one `data_changevariableby`
  - `control_repeat` with one `data_changevariableby`
  - `control_if` with empty `SUBSTACK`

### Results

Observed historical screenshot behavior:

- `ERROR: [none]`
- visible render showed:
  - `if` containing `change x by 1`
  - `[unsupported opcode: control_repeat]`
  - `if` with `[empty stack]`

Interpretation:

- the requested control-block order survived
- both non-empty and empty control mouths survived

## Test 9

### Starting IR

Use the shared starting IR above.

### Prompt

```text
Transform the IR so the only top-level block is a control_repeat block.

Inside that repeat:
- place a control_if
- inside that if, place another control_repeat
- inside that repeat, place another control_if
- inside that final if, place one data_changevariableby command

Use the same CONDITION structure for all control_if blocks.
Use the same VARIABLE and VALUE for the data_changevariableby command.
```

### Mutation

- only one top-level `control_repeat`
- nested inside:
  - `control_if`
    - `control_repeat`
      - `control_if`
        - `data_changevariableby`

### Results

Observed historical screenshot behavior:

- `ERROR: [none]`
- visual output showed only a top-level `[unsupported opcode: control_repeat]`

Interpretation:

- the deep nesting survived structurally
- the historical renderer collapsed the visible output because the top-level repeat remained unsupported at that point in development

## Test 10

### Starting IR

Use the shared starting IR above.

### Prompt

```text
Perform all of the following:

- move the data_changevariableby command out of the inner control_if block to the top level
- place it above everything
- add a new control_if block below it containing one data_changevariableby command
- add an empty control_repeat block at the bottom

All data_changevariableby commands must use the same VARIABLE and VALUE.
All control_if blocks must use the same CONDITION structure found in the provided IR.
```

### Mutation

- top-level order:
  - `data_changevariableby`
  - existing or remaining control structure
  - new `control_if` containing one `data_changevariableby`
  - empty `control_repeat` at the bottom

### Results

Observed historical screenshot behavior:

- `ERROR: [none]`
- visible render showed:
  - `change x by 1`
  - `[unsupported opcode: control_repeat]`
  - `if` containing `change x by 1`
  - `[unsupported opcode: control_repeat]`

Interpretation:

- the promoted top-level change survived
- the new `if` survived
- the added empty repeat survived
- the overall structure remained valid through Blockify

---

## Round 2 — 2026-03-24 (AI Model Test Ledger)

### Setup

- **Model:** Google Gemini (current)
- **Date:** 2026-03-24
- **Tooling:** `copy rules with IR buffer` block in Blockify embedded renderer
- **Renderer:** full embedded scratch-blocks (real block images, not fallback)
- **Test source:** `AI_MODEL_TEST_LEDGER.md` — 8 structured tests across IR-A and IR-B
- **Session structure:** all 8 tests run in succession in the same chat session; re-anchoring to the starting IR was required before tests 4 and 5

### Results Summary

| Test | Description | Parses | Validates | Achieved | Notes |
|------|-------------|--------|-----------|----------|-------|
| 1 | Rename variable | pass | pass | yes | — |
| 2 | Promote change to top level | pass | pass | yes | — |
| 3 | Insert block into substack | pass | pass | yes | — |
| 4 | Swap operator | pass | pass | yes | Required re-anchoring to starting IR — see below |
| 5 | Wrap inner change in repeat | pass | pass | yes | Required re-anchoring to starting IR — see below |
| 6 | Change literal value | pass | pass | yes | — |
| 7 | Append block after sequence | pass | pass | yes | — |
| 8 | Lift sequence out of repeat | pass | pass | yes | — |

All 8 tests passed. No unintended changes on any test.

### Session Context Bleed (Tests 4 and 5)

On tests 4 and 5, Google Gemini (current) carried state from prior mutations in the same conversation session. It introduced structure from a previous mutation (test 3 introduced a `looks_say` block; this bled into the test 4 output) rather than working from the clean starting IR.

Both tests required explicitly prompting the model to return to the correct starting IR before producing the mutation. Once re-anchored, the correct output was produced on the next attempt.

**Implication:** When running multiple tests against Google Gemini (current) in a single session, structural context from earlier mutations can bleed into later outputs. Tests 4 and 5 are structurally downstream of 3 in terms of nesting complexity, which may have amplified the drift. Re-anchoring the model to the starting IR before each test (the continuation prompt approach formalized in the ChatGPT round) is the standard mitigation.

### Round 2 Significance

Round 2 is stronger evidence than Round 1 because:

- the embedded scratch-blocks renderer was used (real block images, not fallback placeholders)
- two distinct base IRs were tested (IR-A and IR-B), covering different opcode families
- mutations covered a broader range: rename, promotion, insertion, operator swap, deep nesting, literal change, append, and substack lift
- all 8 passed parse, validation, and structural correctness

The session context bleed finding is the only meaningful limitation observed.

---

## Round 3 — 2026-03-24 (AI Model Test Ledger v2 — Behavioral Prompts, Partial)

### Setup

- **Model:** Google Gemini 3
- **Date:** 2026-03-24
- **Tooling:** `copy rules with IR buffer` block in Blockify embedded renderer
- **Test source:** `ai-model-test-ledger-v2.html` — 8 behavioral prompt tests across IR-A and IR-B
- **Session structure:** tests run in succession in the same chat session; testing stopped at test 4
- **Note:** Prompts describe intended behavior rather than direct structural operations.

### Results Summary

| Test | Description | Parses | Validates | Achieved | Notes |
|------|-------------|--------|-----------|----------|-------|
| 1 | Rename tracked variable | pass | pass | yes | — |
| 2 | Make counter unconditional | pass | pass | yes | — |
| 3 | Add visual signal on condition | pass | pass | yes | Blockify fell back to fallback renderer — under investigation |
| 4 | Make position check less strict | — | — | — | Unintended change: literal value changed 50→49 — see below |
| 5–8 | — | — | — | — | Not reached |

### Test 3 — Fallback Renderer (Misspelled Opcode)

The IR parsed and validated successfully, but the Blockify embedded scratch-blocks renderer fell back to the plain-text fallback renderer. Root cause identified: the model produced `look_say` instead of `looks_say` — a one-character typo in the opcode name. Because the IR parser accepts any opcode string, the IR passed parse and validation. The embedded renderer could not find a matching block for `look_say` and silently fell back.

The structural mutation was otherwise correct — the block was placed in the right position with the right input. The failure was purely an opcode spelling error.

This is the first recorded case of an opcode misspelling causing a silent renderer fallback.

### Test 4 — Threshold Adjustment

When asked to make the position check "pass when the sprite has gone past the target", the model correctly switched from `operator_equals` to `operator_gt` but also changed `OPERAND2` from `[literal:number:50]` to `[literal:number:49]`. The reasoning is interpretable — `> 49` is mathematically equivalent to `>= 50` for integers — but it violates the structural invariant that the literal value should remain unchanged. Verdicts were left blank pending further review.

This is the first recorded case of a model making a semantically reasonable but structurally unintended change in response to a behavioral prompt.

### Round 3 Significance

Round 3 is the first behavioral prompt test run. Tests 1 and 2 passing cleanly is meaningful — the model correctly inferred the required structural operations from natural language descriptions of desired behavior without any opcode-level guidance. The fallback renderer on test 3 and the threshold adjustment on test 4 are the first friction points observed with behavioral prompts.

---

## Historical Takeaway

These Google Gemini (current) tests matter because they were not limited to simple renames or scalar edits.

They included:

- reordering
- empty substacks
- stack promotion/demotion
- nested control restructuring
- repeated reuse of the same condition/value structure

The historically important signal is:

- Google could produce nontrivial structural mutations
- Blockify accepted them without error in these recorded cases
- even when historical visual coverage was incomplete, the resulting IR still survived the round-trip validation/render path
