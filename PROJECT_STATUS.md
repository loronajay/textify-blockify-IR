# Project Status

## LLM Optimization Update (2026-03-26)

The repository has been optimized for Large Language Model (LLM) discovery and integration:

### Discovery Infrastructure Added
- **llms.txt** - General LLM platform discovery
- **claude.txt** - Claude-specific discovery file  
- **.well-known/ai-models.json** - Standard AI model metadata registry
- **MODEL_PRIMER.md** - LLM-optimized quick-start guide

### Documentation Updates
- README.md enhanced with "For AI Models" section
- package.json updated with LLM-relevant keywords
- All references corrected to use "Intermediate Representation" terminology

### AI Model Access
- Direct grammar URL for AI models: `https://raw.githubusercontent.com/loronajay/turbowarp-extensions-canon/main/IR_GRAMMAR.md`
- See README.md "For AI Models" section for quick-start guidance

## Current State

This repo is a two-extension pipeline for exporting, visualising, and AI-assisted editing of Scratch/TurboWarp block programs via a canonical text IR.

- `Textify` — click-to-export or sprite-wide export of any top-level stack to `[script]` IR; clipboard copy with optional spec header and AI rules prepended
- `Blockify` — parse, validate, and visually render `[procedure]`, `[script]`, `[stack:]`, and bare `[opcode:]` IR; multi-stack clipboard rendering

## Canonical Workflow

1. Use Textify's **`textify clicked block to clipboard`** block — click any block in the editor to export its whole stack as IR.
2. Optionally use Textify's **`copy rules with clipboard IR`** block — reads IR from clipboard, prepends the canonical AI mutation rules and grammar URL, copies back.
3. Paste into an AI model.
4. The model fetches `IR_GRAMMAR.md`, echoes the IR, then performs the requested mutation.
5. Use Blockify's **`blockify clipboard contents`** block — renders the AI-returned IR visually.

## Implemented

### Textify

File: [textify-turbowarp.js](textify-turbowarp.js)

- **`textify clicked block to clipboard`** — waits for the user to click any block in the editor; serializes from the top of the stack (whole stack always); reporters/booleans export as bare `[opcode:]` nodes; cancels on right-click, Escape, or Cancel button.

`single blocks/variables`: click any single block to retrieve its IR.

`FOR CUSTOM BLOCKS/STACKS`: click on just the custom block header to textify just the header. click on the stack to retrieve the header + the stack.

- **`copy all stacks from sprite [SPRITE] to clipboard with rules`** — exports all top-level stacks from a named sprite as `[script]` IR with spec header; procedure definitions excluded; the running script excludes itself via `util.thread.topBlock`

- **`copy all stacks from sprite [SPRITE] plain`** — same as above, no spec header (for debugging); also self-excluding

- **`copy rules with clipboard IR`** — reads IR from clipboard, strips any spec header, prepends canonical AI mutation rules, copies merged payload back to clipboard; copies `no copied IR` if clipboard does not contain valid IR

- **`exported IR`** reporter — returns the last IR exported in this session
- explicit menu export support for `looks_backdrops` and `looks_costume`
- publishes last export to `globalThis.__TEXTIFY_SHARED__` for cross-extension reads

### Blockify

File: [blockify-turbowarp.js](blockify-turbowarp.js)

- parse and validate `[procedure]` roots
- parse and validate `[script]` roots
- parse and validate bare `[stack:]` and `[opcode:]` roots (wrapped into synthetic `[script]` internally)
- `OPERAND1`/`OPERAND2` → `NUM1`/`NUM2` normalization for arithmetic operators in both the visual renderer and the scratch-blocks XML path
- string literals render as orange variable-style reporter blocks in the visual renderer
- visual render fallback renderer
- embedded `scratch-blocks` renderer path
- clipboard preview window with IR editor (`Source IR` pane) and visual preview
- button row pinned at the bottom of the editor
- **`blockify clipboard contents`** command block: loads clipboard IR and renders all block stacks in it
- **`clipboard contents`** reporter block: reads the clipboard and returns its text
- `Parser.parseAll()` — parses multiple root nodes from one IR string (enables multi-stack clipboard rendering)
- multi-root rendering: all stacks loaded into a single scratch-blocks workspace via combined XML; stacks spread horizontally at 400px intervals to prevent overlap
- parser tolerates leading `# comment` lines (e.g. the spec header emitted by Textify)

Embedded build artifact: [dist/blockify-turbowarp.embedded.js](dist/blockify-turbowarp.embedded.js)

## Canonical AI Mutation Samples

Canonical benchmark-style mutation samples are documented in:

- [AI_MUTATION_BENCHMARKS.md](ai_model_testing/AI_MUTATION_BENCHMARKS.md)
- [GOOGLE_AI_ROUNDTRIP_HISTORY.md](ai_model_testing/GOOGLE_AI_ROUNDTRIP_HISTORY.md)
- [CHATGPT_ROUNDTRIP_HISTORY.md](ai_model_testing/CHATGPT_ROUNDTRIP_HISTORY.md)
- [CLAUDE_ROUNDTRIP_HISTORY.md](ai_model_testing/CLAUDE_ROUNDTRIP_HISTORY.md)

These record nontrivial LLM mutation tasks that go beyond simple scalar edits, including:

- stack reordering
- nested control restructuring
- empty substacks
- promotion/demotion of commands across stack levels

A structured test ledger with 8 tests across two base IRs is available in `AI_MODEL_TEST_LEDGER.md` and `ai-model-test-ledger.html` (V1 — inline rules). A behavioral variant is in `ai-model-test-ledger-v2.html` (V2). A post-rule-update ledger using the same direct-mutation tests as V1 but with URL-based rules is in `ai-model-test-ledger-v3.html` (V3).

**AI mutation rules update (2026-03-25):** `AI_MUTATION_RULES` was changed from an inline bullet-point list to a prompt instructing the model to fetch and follow `IR_GRAMMAR.md` from GitHub before responding. V1 and V2 ledger results used the old inline rules. V3 results use the new URL-based rules. Do not compare results across ledger versions.

**Pipeline update (2026-03-25):** `AI_MUTATION_RULES` and the `copy rules with clipboard IR` block moved from Blockify to Textify. `IR_GRAMMAR.md` was replaced with a machine-optimized formal grammar spec; the previous content moved to `IR_FULL_REFERENCE.md`. Textify clipboard exports now include a `# Textify Canon IR — spec:` header line. Blockify parser now tolerates and strips those header lines. Blockify now accepts bare `[stack:]` and `[opcode:]` roots.

Google Gemini (current) round 2 (2026-03-24): **8/8 pass** across parse, validate, and structural correctness using the embedded renderer. Session context bleed observed on tests 4 and 5 — resolved by re-anchoring to the starting IR before each mutation request.

ChatGPT round 1 (2026-03-24): **8/8 pass** across parse, validate, and structural correctness using the embedded renderer. Initial bleed observed and eliminated mid-session by combining two fixes: updated `AI_MUTATION_RULES` (require IR echo before mutation) and a between-test continuation prompt (`start from here, don't change anything: (provided IR)`). All 8 tests ran in the same session. See `CHATGPT_ROUNDTRIP_HISTORY.md`.

Claude Sonnet 4.6 round 1 (2026-03-24): **partial** — 2/4 pass before Poe credits ran out. Test 3 failed: Claude produced unquoted string literals (`[literal:string:looping]` instead of `[literal:string:"looping"]`), causing a parse error. Tests 5–8 not reached. Testing to resume. See `CLAUDE_ROUNDTRIP_HISTORY.md`.

Google Gemini 3 v2 behavioral round 1 (2026-03-24): **partial** — tests 1–2 clean pass from behavioral prompts alone. Test 3 parsed/validated but Blockify fell back to the fallback renderer (under investigation). Test 4 showed unintended threshold adjustment (50→49) on operator swap from behavioral description. Tests 5–8 not reached. See `GOOGLE_AI_ROUNDTRIP_HISTORY.md`.

## Known Limits

- custom block (`[procedure]`) rendering not yet implemented in Blockify
- no natural-language-to-patch layer yet
- no project-wide wrapper IR root yet
- no sprite creation ops yet
- no logic-review/lint engine yet

## Testing Status

Current Jest status at this checkpoint:

- `15` test suites passing
- `113` tests passing

Coverage currently includes:

- camera/leaderboards regressions
- embedded `scratch-blocks` rendering regressions
- script root support
- Textify block registration (all remaining blocks)
- `getStackRoot` helper (next-chain, SUBSTACK, reporter, detached, unknown)
- `exportAllStacksText` (empty target, single stack, multi-stack, procedure exclusion, self-exclusion)
- `copyAllStacksToClipboard` / `copyAllStacksPlain` (sprite lookup, clipboard payload, shared state, self-exclusion via util)
- `getExportedIR` reporter
- `textifyClickedBlock` (graceful no-op when ScratchBlocks unavailable)
- Textify/Blockify shared state bridge (`__TEXTIFY_SHARED__`)
- `copyRulesWithClipboardIR` block behavior (all cases)
- `readClipboard` / `loadClipboardIR` / `clipboardIRMatchesBuffer` block behavior
- clipboard preview workflow and editor layout

## Next Likely Steps

1. Grow IR coverage for more Scratch opcodes in the visual renderer.
2. Resume AI model roundtrip testing with the updated pipeline.
