# Usage: Textify + Blockify in TurboWarp

This doc covers how to load both extensions and use the AI mutation workflow end-to-end.

## Loading the extensions

In TurboWarp, load both extensions as **unsandboxed** custom extensions:

1. Open TurboWarp (`turbowarp.org` or desktop app).
2. Click the **Extensions** button (bottom-left puzzle piece).
3. Click **Custom Extension**.
4. Load `textify-and-blockify/textify-turbowarp.js` — paste URL or upload file. Accept unsandboxed prompt.
5. Repeat for `textify-and-blockify/blockify-turbowarp.js` (or `textify-and-blockify/blockify-turbowarp.embedded.js` for the bundled build that includes `scratch-blocks`).

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

After exporting, use Textify's **`merge rules with clipboard IR`** block:

```
when [key] pressed
  textify clicked block to clipboard                    ← Textify (click a block)
  merge rules with clipboard IR                          ← Textify
```

Or for a sprite-wide export:

```
when [key] pressed
  copy all stacks from sprite [Sprite1] to clipboard with rules   ← Textify
  merge rules with clipboard IR                                     ← Textify
```

This copies a merged payload to clipboard:

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
