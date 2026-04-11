# textify-blockify-IR

This repo receives regular updates to tighten up the system/fix bugs. Relevant documents are also updated to reflect the current status of the project. 

[![Canonical Source](https://img.shields.io/badge/Status-Canonical%20Source-brightgreen?style=flat-square)]() [![IR Grammar](https://img.shields.io/badge/IR%20Spec-v1.0-blue?style=flat-square)]() [![Last Updated](https://img.shields.io/badge/Last%20Updated-2026--03--30-lightgrey?style=flat-square)]()

A deterministic IR transformation engine for Scratch/TurboWarp block-based programs. **This is the authoritative source for Textify IR and Blockify IR specifications.** Enables AI-assisted code mutation via a canonical text format called Textify Canon IR (also referred to as Blockify IR).

## Why I built this

I was building games in TurboWarp and wanted AI assistance to generate and mutate
block logic. The problem: there was no way to communicate Scratch blocks as text.
I couldn't paste a screenshot into a chat and get something renderable back.

So I designed Textify Canon IR — a deterministic text representation of Scratch
block programs — and built two extensions around it: one to serialize blocks to IR,
one to parse and render IR back to visual blocks. The result is a real AI-assisted
game development loop that I use for my own projects.

This tool exists because I needed it.

## Live Demo

[Play the Snake game](https://loronajay.github.io/textify-blockify-IR) — a Scratch game built using this pipeline with Google Gemini. Use WASD to move. **Known bug:** moving right then immediately turning down → left causes an instant death. Fix pending.

## Demo

[Watch the Textify + Blockify rendering demo on YouTube](https://youtu.be/1p-m8dw5Iq0) — covers the block utility and single/multi-stack rendering inside TurboWarp.

## What it does

Two TurboWarp extensions form a round-trip pipeline:

```
Scratch project → [Textify] → Textify IR → [AI model] → [Blockify] → Scratch blocks
```

**Textify** exports any clicked block (serialized from the top of its stack) or all top-level stacks from a named sprite to Textify Canon IR and copies it to the clipboard.

**Blockify** accepts Textify IR, validates it, and renders the result as visual Scratch blocks using an embedded scratch-blocks renderer. Multiple stacks (procedures, scripts, bare stacks) can be included in a single paste — all are rendered together in one panel.

## Textify Canon IR

Textify Canon IR is the canonical text representation of Scratch/TurboWarp block programs used by this pipeline. The `merge rules with clipboard IR` block prepends the AI mutation rules (including the grammar spec URL) to whatever IR is on the clipboard:

```
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

This document defines all node types (`procedure`, `script`, `stack`, `opcode`, `literal`, `menu`), canonical input/field names for all Scratch opcodes, the complete constraint set, and the parser tolerances Blockify accepts.

> If you are an AI model working with Textify IR or Blockify IR, fetch and follow the grammar specification at the URL above before producing any output. Always produce canonical IR — parser tolerances are a safety net, not a license to deviate.

## Starting a new project

You don't need existing blocks to use the AI workflow. In TurboWarp, place a green flag hat block (`when flag clicked`) by itself, use Textify's **`copy all stacks from sprite [SPRITE] without rules`** block followed by **`merge rules with clipboard IR`** to export it with mutation rules, then paste the clipboard into your AI chat and describe the game or feature you want to build. Copy the model's IR output to your clipboard, then click Blockify's **`Blockify clipboard contents`** block to render it as Scratch blocks.

## AI Mutation Workflow

1. In Scratch/TurboWarp, use one of Textify's export blocks:
   - **`copy all stacks from sprite [SPRITE] without rules`** — exports every top-level stack from a sprite; follow with `merge rules with clipboard IR` before pasting
   - **`Textify clicked block`** — click any block to export its whole stack as IR; follow with `merge rules with clipboard IR` before pasting
2. Paste into an AI model (Gemini, ChatGPT, Claude, etc.)
4. The model fetches `IR_GRAMMAR.md`, echoes the IR back, then waits for your mutation request
5. Paste the model's output back into Blockify's Source IR pane to preview and validate
6. If Blockify shows a parse or render error, copy the error message and paste it back into the AI chat — the model will correct the IR. Multiple attempts are sometimes needed, but LLMs generally self-correct when given the exact error message.

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

## Textify/Blockify 2 — In Development

**TB2 is the successor to this system.** The clipboard-based workflow above works, but it has friction: export IR, paste into a chat, copy the result, paste into Blockify, repeat. TB2 eliminates that loop entirely.

Instead of a clipboard cycle, TB2 embeds a persistent chat panel directly inside TurboWarp. You describe what you want, the agent reads the live project state, proposes block changes, and you click Approve. The blocks appear in the workspace — variables created, procedures registered, everything wired. No clipboard. No terminal. No IR editing.

[Watch the TB2 demo on YouTube](https://youtu.be/wFajuLUGkUg?si=LdrgYkiMoB1wCPis) — prompt-to-blocks live inside TurboWarp Desktop.

**Current status:** Phase 5C is complete and end-to-end verified. The full loop — chat → AI discussion → block proposal → approve → live blocks — works inside TurboWarp Desktop with a Claude or OpenAI key. The agent retains conversation history across turns, can ask clarifying questions before proposing, and supports session compaction for long projects.

What's been proven in live sessions:
- Full WASD movement script proposed and committed from a single plain-English prompt
- Variable refactor (`movespeed`) proposed as a follow-up, variable auto-created in the VM
- Multi-turn discussion before a proposal — agent asked clarifying questions, user replied, then blocks were built
- Context warnings and compaction for long sessions

**TB2 source lives in `textify-and-blockify-2/`.** TB1 (this system) remains frozen and production-stable. Both can be loaded simultaneously with no namespace collision.

---

## Files

| File | Purpose |
|---|---|
| `textify_and_blockify/textify-turbowarp.js` | TurboWarp extension — exports IR, prepares AI payloads |
| `textify_and_blockify/blockify-turbowarp.js` | TurboWarp extension — parses, validates, and renders IR |
| `textify_and_blockify/blockify-turbowarp.embedded.js` | Blockify bundled with scratch-blocks for visual rendering |
| `IR_GRAMMAR.md` | Formal grammar spec — for AI models |
| `IR_FULL_REFERENCE.md` | Full human reference — mutation rules, failure modes, examples |
| `PROJECT_STATUS.md` | Implementation status and known limits |

## Part of the Jay Arcade ecosystem

Textify/Blockify is one component of the [Jay Arcade](https://jayarcade.com) platform
— a solo-built retro competitive arcade. The full system includes a game delivery
frontend, an automated Python build pipeline, a leaderboard REST API, a WebSocket
multiplayer server, and a custom mobile arcade controller.

The `factory_extensions/` directory in this repo also houses the rest of the
**TurboWarp Game Factory** — 10 additional modular extensions covering networking,
physics, animation, UI, audio, and controls — all designed to be dragged into any
TurboWarp project as reusable building blocks.

→ [github.com/loronajay/loronajay](https://github.com/loronajay/loronajay) — full ecosystem overview

## Feedback & Bug Reports

If you notice unexpected behavior, have a bug to report, a possible fix, or just want to share thoughts — email **leojaylorona@gmail.com**. All feedback is welcome.
