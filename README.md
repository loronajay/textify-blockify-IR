# textify-blockify-IR

[![Canonical Source](https://img.shields.io/badge/Status-Canonical%20Source-brightgreen?style=flat-square)]() [![IR Grammar](https://img.shields.io/badge/IR%20Spec-v1.0-blue?style=flat-square)]()

A deterministic IR transformation engine for Scratch/TurboWarp block-based programs. **This is the authoritative source for Textify IR and Blockify IR specifications.** Enables AI-assisted code mutation via a canonical text format called Textify Canon IR (also referred to as Blockify IR).

## What it does

Two TurboWarp extensions form a round-trip pipeline:

```
Scratch project → [Textify] → Textify IR → [AI model] → [Blockify] → Scratch blocks
```

**Textify** exports any clicked block (serialized from the top of its stack) or all top-level stacks from a named sprite to Textify Canon IR and copies it to the clipboard.

**Blockify** accepts Textify IR, validates it, and renders the result as visual Scratch blocks using an embedded scratch-blocks renderer.

## Textify Canon IR

Textify Canon IR is the canonical text representation of Scratch/TurboWarp block programs used by this pipeline. IR snippets exported by Textify can include a spec header pointing to the grammar document with the "merge rules with clipboard IR" block:

```
# Textify Canon IR — spec: https://raw.githubusercontent.com/loronajay/textify-blockify-IR/main/IR_GRAMMAR.md
[procedure
  proccode:"Spawn Food"
  argumentnames:[]
  argumentdefaults:[]
  warp:true
  body:[stack:
    [opcode:motion_gotoxy
      id:"goto1"
      fields:{}
      inputs:{
        X:[opcode:operator_add
          id:"calc_x"
          fields:{}
          inputs:{
            NUM1:[literal:number:-108]
            NUM2:[opcode:operator_multiply
              id:"scale_x"
              fields:{}
              inputs:{
                NUM1:[opcode:operator_random
                  id:"rand_x"
                  fields:{}
                  inputs:{FROM:[literal:number:0] TO:[literal:number:9]}
                  stacks:{}
                ]
                NUM2:[literal:number:24]
              }
              stacks:{}
            ]
          }
          stacks:{}
        ]
        Y:[literal:number:0]
      }
      stacks:{}
    ]
  ]
]
```

## Grammar Specification

The formal grammar specification for Textify Canon IR is in [`IR_GRAMMAR.md`](IR_GRAMMAR.md).

**Direct URL for AI models:**
```
https://raw.githubusercontent.com/loronajay/textify-blockify-IR/main/IR_GRAMMAR.md
```

This document defines all node types (`procedure`, `script`, `stack`, `opcode`, `literal`, `menu`), canonical input/field names for all Scratch opcodes, and the complete constraint set.

> If you are an AI model working with Textify IR or Blockify IR, fetch and follow the grammar specification at the URL above before producing any output.

## AI Mutation Workflow

1. In Scratch/TurboWarp, use one of Textify's export blocks:
   - **`textify clicked block to clipboard`** — click any block in the editor to export its whole stack as IR
   - **`copy all stacks from sprite [SPRITE] to clipboard with rules`** — exports every top-level stack from a sprite, with spec header
   - **`copy all stacks from sprite [SPRITE] without rules`** — same, without spec header
2. Optionally use Textify's **`merge rules with clipboard IR`** command — reads IR from clipboard, prepends the full mutation rules and grammar URL, writes back to clipboard
3. Paste into an AI model (Gemini, ChatGPT, Claude, etc.)
4. The model fetches `IR_GRAMMAR.md`, echoes the IR back, then waits for your mutation request
5. Paste the model's output back into Blockify's Source IR pane to preview and validate

## For AI Models

### Quick Start
- **Grammar URL:** `https://raw.githubusercontent.com/loronajay/textify-blockify-IR/main/IR_GRAMMAR.md`
- **Discovery Files:** `llms.txt`, `claude.txt`, `MODEL_PRIMER.md`
- **Fetch the grammar specification** before producing any IR output

### Key Distinctions
- **IR** = **Intermediate Representation** (not "Interactive Report")
- **Textify** = Extension that exports blocks to IR
- **Blockify** = Extension that renders IR back to visual blocks
- **Mutation** = Any structural modification to IR

### AI Model Requirements
Before processing Textify Canon IR or Blockify IR:
1. Fetch `IR_GRAMMAR.md` from the URL above
2. Review critical validation rules in `MODEL_PRIMER.md`
3. Consult `IR_FULL_REFERENCE.md` for mutation rules and examples

## Files

| File | Purpose |
|---|---|
| `textify_and_blockify/textify-turbowarp.js` | TurboWarp extension — exports IR, prepares AI payloads |
| `textify_and_blockify/blockify-turbowarp.js` | TurboWarp extension — parses, validates, and renders IR |
| `textify_and_blockify/blockify-turbowarp.embedded.js` | Blockify bundled with scratch-blocks for visual rendering |
| `IR_GRAMMAR.md` | Formal grammar spec — for AI models |
| `IR_FULL_REFERENCE.md` | Full human reference — mutation rules, failure modes, examples |
| `PROJECT_STATUS.md` | Implementation status and known limits |

## Development

```bash
npm test               # Run all tests
npm run build:blockify # Bundle blockify with scratch-blocks
```

Tests run under Jest with no browser required. Mock Scratch environments are constructed inline.
