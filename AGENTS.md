# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

This is the Codex equivalent of `CLAUDE.md`. If repo-level AI working rules change, keep this file aligned with `CLAUDE.md`.

## AI Working Requirements

- Read `SKILLS.md` for project-specific AI requirements.
- For any Textify IR / Blockify IR task, treat `IR_GRAMMAR.md` as mandatory source-of-truth context before generating or mutating IR.
- In this repo, if a user asks about the "bridge" without qualifying v1 vs v2, default to `textify-and-blockify-2` unless they explicitly mean the legacy Textify/Blockify 1 shared-state bridge.

## Commands

```bash
npm test
npm run build:blockify
```

No lint command is configured. For focused Jest runs, invoke Jest directly, for example:

```bash
npx jest __tests__/textify-blocks.test.js
npx jest --testNamePattern="rename"
```

## Architecture

This repo is a deterministic IR transformation engine for Scratch/TurboWarp block programs.

Pipeline:

```text
Scratch project -> Textify -> IR text -> AI/User -> edited IR -> Blockify -> Scratch blocks
```

- `textify_and_blockify/textify-turbowarp.js`: exports clicked stacks or all sprite stacks to canonical IR.
- `textify_and_blockify/blockify-turbowarp.js`: parses IR, validates it, and renders Scratch blocks visually.

## Canonical IR

`IR_GRAMMAR.md` is the authoritative grammar.

Supported roots:

- `[procedure ...]`
- `[script ...]`
- `[stack: ...]`
- bare `[opcode: ...]`

## Testing Approach

Tests run under Jest. Extensions expose internals through global test hooks such as `__blockifyTestHooks` and `__textifyTestHooks`. Mock Scratch environments are built inline in tests; no browser is required.

Key docs:

- `README.md`
- `USAGE.md`
- `PROJECT_STATUS.md`
- `IR_GRAMMAR.md`
- `IR_FULL_REFERENCE.md`
