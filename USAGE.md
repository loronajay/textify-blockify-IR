# Usage: Textify + Blockify in TurboWarp

This doc covers how to load both extensions and use the AI mutation workflow end-to-end.

## Starting a new project

You don't need existing blocks to use the AI workflow. In TurboWarp, place a green flag hat block (`when flag clicked`) by itself, use Textify's **`copy all stacks from sprite [SPRITE] to clipboard with rules`** block to export it, then paste the clipboard into your AI chat and describe the game or feature you want to build. Copy the model's IR output to your clipboard, then click Blockify's **`Blockify clipboard contents`** block to render it as Scratch blocks.

## Loading the extensions

In TurboWarp, load both extensions as **unsandboxed** custom extensions:

1. Open TurboWarp (`turbowarp.org` or desktop app).
2. Click the **Extensions** button (bottom-left puzzle piece).
3. Click **Custom Extension**.
4. Load `textify_and_blockify/textify-turbowarp.js` — paste URL or upload file. Accept unsandboxed prompt.
5. Repeat for `textify_and_blockify/blockify-turbowarp.js` (or `textify_and_blockify/blockify-turbowarp.embedded.js` for the bundled build that includes `scratch-blocks`).

**Order matters:** Textify must be loaded before Blockify if you want the shared state bridge to be initialized before Blockify reads it. In practice, loading Textify first then Blockify in the same session is sufficient.

## Exporting IR from Textify

### Click-to-export any block

Use **`textify clicked block to clipboard`** in a script. When it runs, it waits for you to click any block in the editor. The whole stack is serialized from the top (so clicking a block in the middle of a script still exports the complete script). Reporters and boolean blocks clicked directly export as a bare `[opcode:]` node. The result is copied to clipboard with the spec header and stored in `__TEXTIFY_SHARED__`.

Cancel the click by right-clicking, pressing Escape, or clicking the Cancel button that appears.

### Export all stacks from a sprite

| Block | What it does |
|---|---|
| `copy all stacks from sprite [SPRITE] to clipboard with rules` | Copies IR for every top-level stack, with spec header |
| `copy all stacks from sprite [SPRITE] without rules` | Same IR, no spec header (useful for debugging) |

Procedure definition blocks are excluded from both. All exported IR is stored in `__TEXTIFY_SHARED__` so Blockify can read it.

## Sending IR to an AI model

**`copy all stacks with rules`** already includes the mutation rules — paste directly into your AI chat. No extra step needed.

**`textify clicked block`** and **`copy all stacks without rules`** do not include rules. Follow them with **`merge rules with clipboard IR`** before pasting:

```
when [key] pressed
  textify clicked block to clipboard                    ← Textify (click a block)
  merge rules with clipboard IR                          ← Textify (prepends rules)
```

`merge rules` produces a merged payload:

```
You are modifying Textify canon IR.

Requirements:
- Mutate only the IR provided below.
- Preserve all unrelated structure.
- Preserve opcode ids unless new nodes are required.
- Keep fields, inputs, and stacks distinct.
- Do not invent unsupported structure.
- Return only valid Textify canon IR.
- Do not include explanation outside the IR.

IR:
[procedure ...]
```

Paste this directly into your AI model's prompt. No manual rule-prepending needed.

If no valid IR has been exported yet, the block copies `no copied IR` instead.

## Visualising AI output in Blockify

After the AI returns edited IR, use Blockify's **`Blockify clipboard contents`** block to render it visually. Paste the AI output to clipboard first, then run the block — it opens a floating panel with the scratch-blocks visual render of all stacks in the clipboard.

## Correcting IR errors

If Blockify fails to parse or render the AI's output, it displays an error message in the panel. Copy that error and paste it back into the AI chat — the model will correct the IR. Multiple attempts are sometimes needed, but LLMs generally fix grammar issues when given the exact error message.

The **`last Blockify error`** block returns the most recent error string if you need it from a script rather than copying from the panel directly.

## Recommended script layout

```
when [r] pressed                         ← click-to-export + copy rules in one keypress
  textify clicked block to clipboard
  merge rules with clipboard IR

when [p] pressed                         ← render clipboard IR visually
  Blockify clipboard contents
```

## Utility blocks

| Block | Returns |
|---|---|
| `clipboard contents` | the current clipboard text |
| `clipboard IR matches buffer?` | `true` if clipboard IR matches the loaded buffer |
| `last Blockify error` | last parse/validation error message, or empty |
| `clipboard IR` (Textify) | the last IR exported in this session |
