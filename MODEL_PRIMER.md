# Textify Canon IR — AI Model Primer

**Quick Start for LLMs:** Fetch and follow [IR_GRAMMAR.md](https://raw.githubusercontent.com/loronajay/textify-blockify-IR/main/IR_GRAMMAR.md) before responding to any IR-related task.

## What This Format Is

Textify Canon IR is a **machine-optimized bracket-delimited text format** for representing Scratch/TurboWarp block programs. It enables:

- ✅ Unambiguous parsing of visual block code into text
- ✅ Reliable mutation of programs by AI without breaking structure
- ✅ Round-trip conversion: blocks ↔ text ↔ AI ↔ blocks
- ✅ Deterministic validation (all constraints are checkable)

## Task Types

### Mutation Tasks
"Take this IR and change X to Y"
→ Parse the IR, find the target, apply the change, validate output

### Generation Tasks
"Create IR for blocks that do X"
→ Synthesize IR from the description, validate against grammar

### Analysis Tasks
"What does this IR do?"
→ Walk the tree, describe each block's purpose

### Transformation Tasks
"Refactor this IR by X"
→ Restructure the block tree while preserving semantics

## Critical Rules

1. **ALWAYS fetch the grammar first**
   - Your knowledge may be stale
   - The grammar is the source of truth
   - URL: https://raw.githubusercontent.com/loronajay/textify-blockify-IR/main/IR_GRAMMAR.md

2. **String literals MUST use double quotes**
   ```
   ✅ [literal:string:"hello"]
   ❌ [literal:string:hello]      (Blockify recovers this, but always use canonical form)
   ❌ [literal:string:'hello']    (not recovered — single quotes are not valid)
   ```

3. **Numbers are NEVER quoted**
   ```
   ✅ [literal:number:42]
   ✅ [literal:number:-108]
   ❌ [literal:number:"42"]
   ```

4. **Opcode names must match the reference exactly**
   ```
   ✅ looks_say
   ❌ look_say (missing 's')
   ❌ looks_says (wrong verb)
   ```

5. **Input names matter** (e.g., arithmetic operators)
   ```
   ✅ inputs:{NUM1:..., NUM2:...}
   ❌ inputs:{OPERAND1:..., OPERAND2:...}
   ```

6. **All IDs within a root must be unique**
   ```
   ✅ [script body:[stack: [opcode:looks_say id:"say1" ...] [opcode:looks_say id:"say2" ...] ]]
   ❌ [script body:[stack: [opcode:looks_say id:"say1" ...] [opcode:looks_say id:"say1" ...] ]]
   ```

7. **Validate constraints before returning**
   - No circular references
   - No stack nodes in `inputs`
   - No opcode nodes in `stacks`
   - No fields outside `fields:{}`

## IR Node Types (Quick Reference)

| Node | Purpose | Example |
|------|---------|---------|
| `[procedure ...]` | Custom block definition | Stores proccode, args, body |
| `[script ...]` | Top-level stack | Hat block + commands |
| `[stack: ...]` | Sequence of commands | Used in substacks or standalone |
| `[opcode: ...]` | Individual block | motion_say, control_if, etc. |
| `[literal:number:...]` | Number value | [literal:number:42] |
| `[literal:string:"..."]` | String value | [literal:string:"hello"] |
| `[menu:...]` | Dropdown selection | [menu:looks_costume:"c1"] |

## Example: From Specification to Output

**Task:** "Add a 'say hello' block to the start of this IR"

**Input:**
```
[script
  body:[stack:
    [opcode:motion_movesteps
      id:"move1"
      fields:{}
      inputs:{STEPS:[literal:number:10]}
      stacks:{}
    ]
  ]
]
```

**Output (with new say block first):**
```
[script
  body:[stack:
    [opcode:looks_say
      id:"say1"
      fields:{}
      inputs:{MESSAGE:[literal:string:"hello"]}
      stacks:{}
    ]
    [opcode:motion_movesteps
      id:"move1"
      fields:{}
      inputs:{STEPS:[literal:number:10]}
      stacks:{}
    ]
  ]
]
```

**Validation checklist:**
- ✅ All `id` values unique (`say1`, `move1`)
- ✅ `inputs` contains only `literal` nodes
- ✅ `fields` is empty (no fields for these blocks)
- ✅ String is double-quoted: `[literal:string:"hello"]`
- ✅ Number is unquoted: `[literal:number:10]`
- ✅ Stack structure preserved

## Common Mistakes & Fixes

| Mistake | Fix |
|---------|-----|
| Using single quotes for strings | Use double quotes always — `[literal:string:"x"]` |
| Unquoted string literal | Use double quotes — `[literal:string:"hello"]` not `[literal:string:hello]` (Blockify recovers bare words, but canonical form is required) |
| Forgetting `id:` in opcode nodes | Every opcode needs a unique `id` |
| Using wrong input names (e.g., OPERAND1 for arithmetic) | Reference the grammar table for each opcode |
| Putting stack nodes in `inputs` | Stacks only go in `stacks:{}` |
| Duplicating IDs | Generate new IDs with a prefix or number |
| Adding JSON-style commas between properties | Canonical IR has no commas between properties or map entries (Blockify recovers them, but omit for canonical output) |

## When to Fetch the Grammar

- 📖 First time seeing Textify IR
- 🔄 Before each mutation task (grammar may have updated)
- ❓ Any time you're unsure about syntax
- 🚀 Before processing user-provided IR

## Testing Your Output

Before returning IR:

1. **Parse Check**: Can the IR be bracket-parsed?
2. **Syntax Check**: Do all opcodes match the reference?
3. **Constraint Check**: Unique IDs? Correct field/input/stack structure?
4. **Semantic Check**: Do the blocks make logical sense?

## Support & Questions

For issues or clarifications:
- Grammar spec: https://raw.githubusercontent.com/loronajay/textify-blockify-IR/main/IR_GRAMMAR.md
- Full reference: https://raw.githubusercontent.com/loronajay/textify-blockify-IR/main/IR_FULL_REFERENCE.md
- Examples: See PROJECT_STATUS.md for AI roundtrip testing