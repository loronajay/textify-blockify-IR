# Project Status

## Current State

This repo is now beyond simple export/render tooling. It currently supports:

- `Textify` export of custom blocks as `[procedure]` IR
- `Textify` export of any top-level stack as `[script]` IR
- direct clipboard-copy workflows for both custom blocks and top-level stacks
- `Blockify` parsing, validating, and rendering of `[procedure]` and `[script]` IR
- embedded `scratch-blocks` rendering through `dist/blockify-turbowarp.embedded.js`
- a dual-buffer patch workbench inside the Blockify editor
- a first internal patch engine with deterministic apply/serialize/validate behavior

## Canonical Workflow

The intended workflow right now is:

1. Use `Textify` to export a custom block or top-level stack to IR.
2. Use Blockify's **`copy rules with exported IR`** block to copy the AI mutation prompt (rules + IR) to clipboard in one step.
3. Paste into an AI model.
4. Have the model produce patch JSON or edited IR.
5. Open `Blockify`.
6. Paste source IR into `Source IR`.
7. Paste patch JSON into `Patch JSON`.
8. Apply patch and inspect the visual result.
9. Copy the patched IR or use it as the new source.

Step 2 replaces the previous manual step of copying IR and prepending mutation rules by hand.

## Implemented

### Textify

File: [textify-turbowarp.js](/Users/leoja/Desktop/Dad%20Games/turbowarp-extensions-js/canon/textify-turbowarp.js)

Implemented:

- export custom block from sprite/current sprite
- copy custom block IR to clipboard without popup
- export top-level stack by index from sprite
- copy top-level stack by index to clipboard
- top-level stack count by sprite
- explicit menu export support for `looks_backdrops` and `looks_costume`
- publishes last export to `globalThis.__TEXTIFY_SHARED__` for cross-extension reads

### Blockify

File: [blockify-turbowarp.js](/Users/leoja/Desktop/Dad%20Games/turbowarp-extensions-js/canon/blockify-turbowarp.js)

Implemented:

- parse and validate `[procedure]` roots
- parse and validate `[script]` roots
- visual render fallback renderer
- embedded `scratch-blocks` renderer path
- clipboard preview window
- IR editor with:
  - `Source IR`
  - `Patch JSON`
  - `Patched IR Result`
  - visual preview
- button row pinned at the bottom of the editor
- **`copy rules with exported IR`** command block: reads Textify's last export from shared state, prepends the canonical AI mutation rules header, and copies the merged payload to clipboard; copies `no copied IR` if no valid IR has been exported yet

Embedded build artifact:

- [dist/blockify-turbowarp.embedded.js](/Users/leoja/Desktop/Dad%20Games/turbowarp-extensions-js/canon/dist/blockify-turbowarp.embedded.js)

## Patch Surface

Current patch schema version:

- `version: 1`
- `target: "project"`

Current supported operations:

- `rename_variable`
- `detach_top_level_scripts`

## Canonical AI Mutation Samples

Canonical benchmark-style mutation samples are documented in:

- [AI_MUTATION_BENCHMARKS.md](/Users/leoja/Desktop/Dad%20Games/turbowarp-extensions-js/canon/AI_MUTATION_BENCHMARKS.md)
- [GOOGLE_AI_ROUNDTRIP_HISTORY.md](/Users/leoja/Desktop/Dad%20Games/turbowarp-extensions-js/canon/GOOGLE_AI_ROUNDTRIP_HISTORY.md)

These record nontrivial LLM mutation tasks that go beyond simple scalar edits, including:

- stack reordering
- nested control restructuring
- empty substacks
- promotion/demotion of commands across stack levels

A structured test ledger with 8 tests across two base IRs is available in `AI_MODEL_TEST_LEDGER.md` and `ai-model-test-ledger.html`.

Google AI round 2 (2026-03-24): **8/8 pass** across parse, validate, and structural correctness using the embedded renderer. Session context bleed observed on tests 4 and 5 — resolved by re-anchoring to the starting IR before each mutation request.

## Architecture Boundary

The current architectural boundary between structural core and Scratch/TurboWarp adapter detail is documented in:

- [ARCHITECTURE_BOUNDARIES.md](/Users/leoja/Desktop/Dad%20Games/turbowarp-extensions-js/canon/ARCHITECTURE_BOUNDARIES.md)

This file should be used as the canonical record for:

- what is currently core
- what is currently adapter-specific
- how to think about future abstraction without destabilizing the current system

Current behavior:

- patching is applied to parsed AST, not raw text directly
- patched output is serialized back to canonical IR
- patched output is re-parsed for validation before success is returned
- source IR is preserved
- failed patches do not overwrite previous successful patched IR
- changing source IR invalidates stale patched IR

## Internal Patch Runner

Internal helpers currently exist for:

- apply patch object to IR text
- apply patch JSON text to IR text

These return structured results:

- success: `{ ok: true, ir: "..." }`
- failure: `{ ok: false, error: "..." }`

## Known Limits

- no user-facing patch language help yet
- no natural-language-to-patch layer yet
- no project-wide wrapper IR root yet
- no sprite creation patch ops yet
- no logic-review/lint engine yet
- top-level stack export currently uses sprite + stack index, not visual selection
- patch editor does not yet surface patch errors inside the patched-result pane itself

## Testing Status

Current Jest status at this checkpoint:

- `18` test suites passing
- `116` tests passing

Coverage currently includes:

- camera/leaderboards regressions
- embedded `scratch-blocks` rendering regressions
- script root support
- textify top-level stack export
- patch engine operations
- patch workflow state behavior
- editor layout behavior
- Textify/Blockify shared state bridge (`__TEXTIFY_SHARED__`)
- `copyRulesWithExportedIR` block behavior (all cases)

## Next Likely Steps

Most likely next directions:

1. Grow the internal patch surface with more safe edit ops.
2. Improve patch workbench UX for faster testing.
3. Introduce project-level operations after script-level patching is mature.
4. Add diagnostics/linting as a separate layer from patching.
