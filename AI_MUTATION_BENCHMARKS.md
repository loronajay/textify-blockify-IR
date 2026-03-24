# AI Mutation Benchmarks

## Purpose

This file records canonical AI mutation tasks for the current Textify -> AI -> Blockify workflow.

These are not yet a full scored evaluation harness. They are benchmark-style sample cases that:

- describe real mutation requests already tested against model output
- preserve the intended structural change
- define what counts as success
- provide reusable examples for future testing across models

## Interpretation

A mutation case is stronger evidence when all of the following are true:

1. the model returns valid IR text
2. the IR parses successfully
3. the IR passes Blockify validation
4. the IR renders successfully in Blockify
5. the requested structural change is actually present
6. unrelated structure is preserved unless the prompt explicitly changes it

These cases are primarily about structural mutation survival and correctness, not runtime semantics.

## Canonical Base Scenario

The benchmark cases below are based on a single control-heavy source IR shape:

- a top-level `control_repeat`
- an inner `control_if`
- a `data_changevariableby` command inside the inner `if`

Shared invariants across many cases:

- keep the same `CONDITION` structure used by the source `control_if`
- keep the same `VARIABLE` and `VALUE` used by the source `data_changevariableby`
- preserve structure not mentioned by the request

## Case 1: Move Existing If Into Repeat Substack

### Request

Move the existing `control_if` block inside the repeat block's `SUBSTACK`.

### Success Criteria

- resulting top-level stack remains valid
- `control_if` becomes a child of the repeat block
- no duplicate `control_if` is introduced
- the `CONDITION`, `VARIABLE`, and `VALUE` remain intact

## Case 2: Add Second If Below Repeat

### Request

Add a second `control_if` block directly below the existing `control_repeat` block in the top-level stack.

### Success Criteria

- top-level order becomes:
  - existing `control_repeat`
  - new `control_if`
- both control blocks remain structurally valid
- the new `if` has a valid `CONDITION`

## Case 3: Replace Top-Level Stack With If / Empty If / Empty Repeat

### Request

Replace the top-level stack with three control blocks in this exact order:

1. `control_if` with one `data_changevariableby` command inside
2. `control_if` with an empty `SUBSTACK`
3. `control_repeat` with an empty `SUBSTACK`

For the non-empty `if` block, use the same `CONDITION` structure, `VARIABLE`, and `VALUE` found in the provided IR.

### Success Criteria

- top-level order matches exactly
- first `if` contains exactly one variable-change command
- second `if` has an empty `SUBSTACK`
- repeat has an empty `SUBSTACK`
- reused condition/value structures remain valid

## Case 4: Empty Repeat, Change, If-With-Change, Change

### Request

Create this exact top-level order:

1. empty `control_repeat` block
2. one `data_changevariableby` command
3. one `control_if` block containing one `data_changevariableby` command
4. one `data_changevariableby` command

All variable-change commands must use the same `VARIABLE` and `VALUE` as the original command.
The `control_if` block must use the same `CONDITION` structure as the original inner `if` block.

### Success Criteria

- top-level order matches exactly
- empty repeat remains empty
- both variable-change commands use the expected `VARIABLE` and `VALUE`
- `if` contains exactly one variable-change command

## Case 5: Nested Repeat Inside If, Plus Parent-Level Change

### Request

Modify the top-level stack so it contains:

1. one `control_if` block
   - inside its `SUBSTACK`:
     - first, one `data_changevariableby` command
     - second, one `control_repeat` block containing one `data_changevariableby` command
2. immediately after the `if` block, add one `data_changevariableby` command at the parent stack level

Use the same `CONDITION` structure, `VARIABLE`, and `VALUE` found in the provided IR.

### Success Criteria

- outer `if` is first at the top level
- outer `if` substack contains:
  - one direct variable-change command
  - then one repeat containing one variable-change command
- one additional parent-level variable-change command exists after the `if`

## Case 6: Empty If Then Empty Repeat

### Request

Replace the top-level stack with:

1. `control_if` with an empty `SUBSTACK`
2. `control_repeat` with an empty `SUBSTACK`

Keep the `CONDITION` valid for the `if` block by using the same `CONDITION` structure found in the provided IR.

### Success Criteria

- top-level order matches exactly
- `if` condition remains valid
- both substacks are empty

## Case 7: Wrap Existing Inner Change In Repeat

### Request

Modify only the inside of the existing inner `control_if` block:

Wrap the `data_changevariableby` command inside a `control_repeat` block.

The repeat block should be the only child of that `control_if` block's `SUBSTACK`.
The `data_changevariableby` command should be inside the repeat block’s `SUBSTACK`.

Do not change the existing top-level `control_repeat` block.
Do not change the `CONDITION`, `VARIABLE`, or `VALUE`.

### Success Criteria

- top-level repeat remains in place
- inner `if` remains in place
- inner `if` substack now contains exactly one repeat block
- that repeat contains exactly one variable-change command
- no unrelated structural changes occur

## Case 8: If-With-Change / Repeat-With-Change / Empty If

### Request

Replace the top-level stack with three control blocks in this exact order:

1. `control_if` with one `data_changevariableby` command inside
2. `control_repeat` with one `data_changevariableby` command inside
3. `control_if` with an empty `SUBSTACK`

All variable-change commands must use the same `VARIABLE` and `VALUE`.
All `control_if` blocks must use the same `CONDITION` structure found in the provided IR.

### Success Criteria

- exact top-level order is preserved
- first `if` contains one variable-change command
- repeat contains one variable-change command
- final `if` has an empty `SUBSTACK`

## Case 9: Deep Nested Repeat/If Ladder

### Request

Transform the IR so the only top-level block is a `control_repeat` block.

Inside that repeat:
- place a `control_if`
- inside that `if`, place another `control_repeat`
- inside that repeat, place another `control_if`
- inside that final `if`, place one `data_changevariableby` command

Use the same `CONDITION` structure for all `control_if` blocks.
Use the same `VARIABLE` and `VALUE` for the `data_changevariableby` command.

### Success Criteria

- only one top-level repeat remains
- the nested ladder shape matches exactly
- both `if` conditions are valid
- deepest `if` contains exactly one variable-change command

## Case 10: Promote Change, Add If, Add Empty Repeat

### Request

Perform all of the following:

- move the `data_changevariableby` command out of the inner `control_if` block to the top level
- place it above everything
- add a new `control_if` block below it containing one `data_changevariableby` command
- add an empty `control_repeat` block at the bottom

All `data_changevariableby` commands must use the same `VARIABLE` and `VALUE`.
All `control_if` blocks must use the same `CONDITION` structure found in the provided IR.

### Success Criteria

- first top-level block is the promoted variable-change command
- a new `if` with one variable-change command appears below it
- an empty repeat appears at the bottom
- condition/value invariants are preserved

## Recommended Benchmark Recording Format

For each future model run, record:

- model name
- source IR identifier
- prompt text
- raw model output
- parse pass or fail
- validate pass or fail
- render pass or fail
- correctness notes
- unintended changes, if any

## Suggested Scoring Columns

Use these columns when turning the sample cases into a spreadsheet or test ledger:

- `Case`
- `Model`
- `Valid IR`
- `Parses`
- `Validates`
- `Renders`
- `Requested Structure Achieved`
- `Unintended Changes`
- `Notes`

## Prompt Sensitivity Findings

### Finding 1: "Reply with the mutated IR only, nothing more" breaks Google AI output (2026-03-24)

Adding the rule `Reply with the mutated IR only, nothing more.` to the AI mutation prompt caused Google AI to fail IR output that was previously passing on every test.

The existing rule `Do not include explanation outside the IR.` was already sufficient for Google AI to produce clean, parseable IR without preamble or commentary.

**Conclusion:** Do not add that rule back. If a model other than Google AI requires stronger output constraints, handle it with a model-specific prompt variation rather than modifying the shared rules constant.

### Finding 2: Google AI session context bleed on structurally similar tests (2026-03-24)

When running multiple mutation tests against Google AI in a single conversation session, the model can carry structural context from earlier mutations into later outputs. Observed on tests 4 and 5 of the AI Model Test Ledger round 2 run — a `looks_say` block introduced in test 3 appeared in the test 4 output, which should have been a clean operator swap with no say block present.

Both cases were resolved by explicitly prompting the model to return to the correct starting IR before proceeding with the mutation request.

**Implication for test methodology:** Each test should either be run in a fresh session, or the starting IR should be explicitly re-stated as a reminder before each mutation request. Do not assume the model is working from the correct base after multiple mutations in the same session.

## Current Significance

These benchmark cases matter because they go beyond scalar edits. They test:

- reordering
- nesting
- empty substacks
- structural promotion/demotion across stack levels
- repeated reuse of shared condition/value structures

Successful model outputs on these cases are strong early evidence that the current IR is LLM-readable and LLM-editable in a nontrivial way.
