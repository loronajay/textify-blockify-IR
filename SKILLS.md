# SKILLS.md

This file captures project-specific AI working requirements for this repository.

## Textify / Blockify IR Requirement

Knowledge of the Textify Canon IR grammar is required for any IR-related task in this project.

Before producing, mutating, or validating Textify IR / Blockify IR:

1. Read the local grammar spec in [IR_GRAMMAR.md](/C:/Users/leoja/Desktop/Dad%20Games/turbowarp-extensions-js/canon/IR_GRAMMAR.md).
2. Treat the grammar as the source of truth for node shapes, opcode names, input names, and constraints.
3. Produce canonical IR, not parser-tolerated shortcuts.
4. Use [IR_FULL_REFERENCE.md](/C:/Users/leoja/Desktop/Dad%20Games/turbowarp-extensions-js/canon/IR_FULL_REFERENCE.md) only as supporting context after checking the grammar.

Canonical grammar URL:

`https://raw.githubusercontent.com/loronajay/textify-blockify-IR/main/IR_GRAMMAR.md`

## Grammar-First Workflow

For any IR task, grammar-check first and only then generate or mutate IR.

1. Re-read [IR_GRAMMAR.md](/C:/Users/leoja/Desktop/Dad%20Games/turbowarp-extensions-js/canon/IR_GRAMMAR.md), even if the format looks familiar.
2. Prefer canonical syntax exactly as Textify emits it.
3. If there is any uncertainty, verify against the local parser behavior in `textify_and_blockify/blockify-turbowarp.js` after checking the grammar.
4. Avoid "close enough" IR. Parser tolerances are a recovery path, not an output target.

## Non-Negotiable IR Rules

- Roots must start with `[procedure`, `[script`, `[stack:`, or `[opcode:`.
- String literals must be double-quoted: `[literal:string:"hello"]`
- Number and boolean literals must be unquoted.
- Opcode names must match the grammar exactly.
- `fields`, `inputs`, and `stacks` are distinct and must not be mixed.
- Control substacks belong in `stacks:{}` only.
- Custom blocks must use top-level `[procedure]` roots and `procedures_call`.

## Grammar Details That Commonly Break IR

- This format is not JSON. Use bracket nodes like `[opcode:...]`, not `{...}` objects.
- Opcode property names are identifiers such as `id`, `fields`, `inputs`, `stacks`, `body`, `warp`, `proccode`.
- Map keys must be identifiers followed by `:`. Examples: `VARIABLE:`, `VALUE:`, `SUBSTACK:`, `OPERAND1:`.
- String field values must be quoted. Example: `fields:{VARIABLE:"score"}`.
- String literals must be quoted. Example: `[literal:string:"hello"]`.
- Number literals must be unquoted. Example: `[literal:number:0.1]`.
- Comparison operators use `OPERAND1` and `OPERAND2`.
- Arithmetic operators use `NUM1` and `NUM2`.
- `inputs:{}` may contain only value nodes such as `literal`, `menu`, or reporter `opcode` nodes.
- `stacks:{}` may contain only `[stack: ...]` nodes.
- Every opcode node within a root needs a unique `id`.

## IR Response Checklist

Before returning IR, verify all of the following:

1. The root is one of `[procedure]`, `[script]`, `[stack:]`, or bare `[opcode:]`.
2. All strings that should be quoted are double-quoted.
3. No number literal is quoted.
4. All opcode names exactly match the grammar.
5. Arithmetic and comparison input names are not mixed up.
6. No stack node appears inside `inputs:{}`.
7. No reporter/literal node appears inside `stacks:{}`.
8. All opcode `id` values are unique within the root.
9. The final output is canonical IR, not merely parser-tolerated IR.

## Renderability Rules

When the user wants IR they can paste into Blockify and visually inspect, optimize for **renderable IR**, not just parseable IR.

- If a full script would start with a nonstandard extension hat and therefore fall back to the HTML/fallback renderer, do **not** return the full script by default.
- In those cases, return the largest relevant **standard-block-only** `[stack:]` fragment instead.
- Only return a full `[script]` root when it is expected to render properly in Blockify or when the user explicitly asks for the whole script anyway.
- Prefer replacing only the changed inner block or stack rather than regenerating large full scripts.
- If a response includes unsupported extension opcodes, clearly separate the renderable standard-block fragment from any non-renderable wrapper.

## Validation Requirements

For any nontrivial IR response:

1. Validate the exact IR string against the local parser in [blockify-turbowarp.js](/C:/Users/leoja/Desktop/Dad%20Games/turbowarp-extensions-js/canon/textify_and_blockify/blockify-turbowarp.js) before sending it.
2. If the user asked for something renderable, sanity-check whether the chosen root/opcodes will trigger fallback rendering.
3. If full-script renderability is doubtful, downgrade the response to a `[stack:]` fragment before sending.

## Refactor Rules For Delta-Time Work

When converting frame-based logic to delta time:

- Distinguish between **per-frame motion** and **real-time waits**.
- `change x/y by N` inside `forever` or frame-driven loops usually becomes `N * 60 * delta time`.
- `repeat N { change ... by S }` should usually be refactored as a **target-distance** move, not a naive direct substitution inside the same repeat.
- `wait X seconds` is already real-time; only replace it when the user specifically wants wait-free/timer-driven logic.
- For block-by-block refactors, prefer:
  - one chart line
  - one parser-checked IR replacement
  - no extra variants unless the user asks

## Failure Pattern To Avoid

This repo's IR work frequently fails in the same few ways. Avoid all of them:

- Do not hand-wave bracket balancing in deep nested trees. Validate instead.
- Do not send full scripts with extension hats when the user needs Blockify-renderable output.
- Do not switch between delta reporters/variables once the user has specified one.
- Do not send "probably correct" IR that has not been checked against the parser.
- Do not expand scope from "refactor this block" into "here is an entire rewritten script" unless the user asked for that.

## Working Rule For This Repo

If an IR response fails to parse in Blockify, re-check the output against [IR_GRAMMAR.md](/C:/Users/leoja/Desktop/Dad%20Games/turbowarp-extensions-js/canon/IR_GRAMMAR.md) before proposing more IR.

If the failure is still unclear after re-checking the grammar, validate the exact IR string against the local parser in [blockify-turbowarp.js](/C:/Users/leoja/Desktop/Dad%20Games/turbowarp-extensions-js/canon/textify_and_blockify/blockify-turbowarp.js) before sending another answer.
