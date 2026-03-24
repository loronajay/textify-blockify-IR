# Usage: Textify + Blockify in TurboWarp

This doc covers how to load both extensions and use the AI mutation workflow end-to-end.

## Loading the extensions

In TurboWarp, load both extensions as **unsandboxed** custom extensions:

1. Open TurboWarp (`turbowarp.org` or desktop app).
2. Click the **Extensions** button (bottom-left puzzle piece).
3. Click **Custom Extension**.
4. Load `textify-turbowarp.js` — paste URL or upload file. Accept unsandboxed prompt.
5. Repeat for `blockify-turbowarp.js` (or `dist/blockify-turbowarp.embedded.js` for the bundled build that includes `scratch-blocks`).

**Order matters:** Textify must be loaded before Blockify if you want the shared state bridge to be initialized before Blockify reads it. In practice, loading Textify first then Blockify in the same session is sufficient.

## Exporting IR from Textify

### Export a custom block

Use one of these Textify blocks in a script:

| Block | What it does |
|---|---|
| `export custom block [PROCNAME] from [SPRITE]` | Shows IR in a popup |
| `copy custom block [PROCNAME] from [SPRITE] to clipboard` | Copies IR silently |
| `export custom block [PROCNAME] from current sprite` | Shows IR in a popup |
| `copy custom block [PROCNAME] from current sprite to clipboard` | Copies IR silently |

After any of these run, Textify stores the result in `__TEXTIFY_SHARED__` so Blockify can read it.

### Export a top-level stack

| Block | What it does |
|---|---|
| `export top-level stack [INDEX] from [SPRITE]` | Shows IR in a popup |
| `copy top-level stack [INDEX] from [SPRITE] to clipboard` | Copies IR silently |

`INDEX` is 1-based. Use `count top-level stacks in [SPRITE]` to find how many exist.

## Sending IR to an AI model

After exporting, use Blockify's **`copy rules with exported IR`** block:

```
when [key] pressed
  export custom block [my block] from current sprite    ← Textify
  copy rules with exported IR                            ← Blockify
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
- Reply with the mutated IR only, nothing more.

IR:
[procedure ...]
```

Paste this directly into your AI model's prompt. No manual rule-prepending needed.

If no valid IR has been exported yet, the block copies `no copied IR` instead.

## Applying a patch in Blockify

1. Click the **Blockify Clipboard IR** button to open the patch workbench, or use the IR/patch buffer blocks directly.
2. Paste the original IR into **Source IR**.
3. Paste the AI-returned patch JSON into **Patch JSON**.
4. Click **Apply Patch** to see the patched result and visual preview.
5. Use **`copy last Blockify patched IR to clipboard`** to grab the result.

### Patch JSON format (version 1)

```json
{
  "version": 1,
  "target": "project",
  "operations": [
    {
      "op": "rename_variable",
      "from": "score",
      "to": "points",
      "scope": "project"
    }
  ]
}
```

See `PATCH_SCHEMA.md` for the full spec and all supported operations.

## Recommended script layout

```
when [r] pressed                         ← export + copy rules in one keypress
  export custom block [my block] from current sprite
  copy rules with exported IR

when [p] pressed                         ← open patch workbench
  open Blockify IR editor
```

## Validation blocks

Use these to guard logic in your project scripts:

| Block | Returns |
|---|---|
| `validate Blockify IR [IR]` | `true` if the IR string parses without error |
| `validate Blockify IR buffer` | `true` if the current IR buffer is valid |
| `last Blockify error` | last parse/validation error message, or empty |
| `last Blockify patch error` | last patch apply error, or empty |
