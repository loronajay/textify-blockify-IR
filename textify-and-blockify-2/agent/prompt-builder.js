'use strict';

/**
 * Builds the Claude system prompt for a single-sprite mutation task.
 *
 * @param {object} opts
 * @param {string} opts.irGrammar     - Full contents of IR_GRAMMAR.md
 * @param {string} opts.fullStateIR   - Full project IR from GET /state
 * @param {string} opts.spriteName    - Name of the sprite being mutated
 * @param {string} opts.targetIR      - IR of the target sprite from GET /sprite/:name
 * @param {string} opts.userPrompt    - The user's natural language request
 * @returns {string}
 */
function buildPrompt({ irGrammar, fullStateIR, spriteName, targetIR, userPrompt }) {
  return `${irGrammar}

## Current Project State

The full project IR is:

<project_ir>
${fullStateIR}
</project_ir>

The sprite you are modifying is: ${spriteName}
Its current IR is:

<target_ir>
${targetIR}
</target_ir>

## Task

${userPrompt}

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
exactly one sprite: ${spriteName}.`;
}

module.exports = { buildPrompt };
