# AI Model Test Ledger

## Purpose

This file is the strict test ledger for evaluating AI model performance on Textify IR mutations.

Each test contains:

- a self-contained starting IR (copy this verbatim into the AI prompt via `copy rules with exported IR`)
- an exact mutation request
- a result log section per model run, with required fields

Unlike `AI_MUTATION_BENCHMARKS.md` (abstract cases) and `GOOGLE_AI_ROUNDTRIP_HISTORY.md` (historical reconstructions), this ledger uses the embedded Blockify renderer and requires block images for all passing results.

---

## How To Run A Test

1. In TurboWarp, load both `textify-turbowarp.js` and `dist/blockify-turbowarp.embedded.js`.
2. Set a Textify export buffer to the test's Starting IR using `set Blockify IR buffer [IR]` or paste directly into the Blockify editor's Source IR field.
3. Prepend the mutation rules header manually (or use `copy rules with exported IR` after setting the buffer) and paste to your model.
4. Paste the model's returned IR into the Blockify editor's Source IR field.
5. Record the Validation result from the `validate Blockify IR buffer` block.
6. Screenshot the rendered block from the Blockify visual preview.
7. Fill in all required Result Log fields below.

---

## Result Log Format

Each model run uses this exact format:

```
### [Model Name] — [YYYY-MM-DD]

**Output IR:**
\```
[paste model output here]
\```

**Parses:** pass / fail
**Validates:** pass / fail
**Requested change achieved:** yes / partial / no
**Unintended changes:** [description, or "none"]
**Block image:** ![render](images/test-N-modelname-YYYYMMDD.png)
**Notes:** [any observations]
```

If the model output fails to parse, skip the image field and note the parse error under Notes.

---

## Base IR: IR-A

Used by Tests 1–5. A procedure with a top-level repeat containing a nested if and a variable-change command.

```
[procedure
  proccode:"TEST BLOCK A"
  argumentnames:[]
  argumentdefaults:[]
  warp:false
  body:[stack:
    [opcode:control_repeat
      id:"repeat1"
      fields:{}
      inputs:{
        TIMES:[literal:number:10]
      }
      stacks:{
        SUBSTACK:[stack:
          [opcode:control_if
            id:"if1"
            fields:{}
            inputs:{
              CONDITION:[opcode:operator_equals
                id:"cond1"
                fields:{}
                inputs:{
                  OPERAND1:[opcode:motion_xposition
                    id:"xpos1"
                    fields:{}
                    inputs:{}
                    stacks:{}
                  ]
                  OPERAND2:[literal:number:50]
                }
                stacks:{}
              ]
            }
            stacks:{
              SUBSTACK:[stack:
                [opcode:data_changevariableby
                  id:"change1"
                  fields:{
                    VARIABLE:"x"
                  }
                  inputs:{
                    VALUE:[literal:number:1]
                  }
                  stacks:{}
                ]
              ]
            }
          ]
        ]
      }
    ]
  ]
]
```

---

## Base IR: IR-B

Used by Tests 6–8. A procedure with a sequence of a say block and a variable set, inside a repeat.

```
[procedure
  proccode:"ANNOUNCE SCORE"
  argumentnames:[]
  argumentdefaults:[]
  warp:false
  body:[stack:
    [opcode:control_repeat
      id:"outerRepeat"
      fields:{}
      inputs:{
        TIMES:[literal:number:3]
      }
      stacks:{
        SUBSTACK:[stack:
          [opcode:looks_say
            id:"say1"
            fields:{}
            inputs:{
              MESSAGE:[literal:string:"hello"]
            }
            stacks:{}
          ]
          [opcode:data_setvariableto
            id:"set1"
            fields:{
              VARIABLE:"score"
            }
            inputs:{
              VALUE:[literal:number:0]
            }
            stacks:{}
          ]
        ]
      }
    ]
  ]
]
```

---

## Test 1 — Rename Variable (IR-A)

### Mutation Request

```
Rename all references to the variable "x" to "score".
Do not change any opcodes, ids, inputs, or structure.
Only the VARIABLE field value should change.
```

### Success Criteria

- `VARIABLE:"score"` appears where `VARIABLE:"x"` was
- no other fields, inputs, or structure change
- IR parses and validates

### Result Log

<!-- Add a new section below for each model run using the format above -->

---

## Test 2 — Promote Change To Top Level (IR-A)

### Mutation Request

```
Move the data_changevariableby block out of the control_if block to the top level of the body stack.
Place it above the existing control_repeat block.
Remove it from the if block's SUBSTACK entirely — the if block's SUBSTACK should become empty.
Do not change the repeat block, the if block's CONDITION, the VARIABLE, or the VALUE.
```

### Success Criteria

- top-level order is: `data_changevariableby`, then `control_repeat`
- the `if` block's `SUBSTACK` is empty
- the `control_repeat` and its `control_if` remain structurally intact
- `VARIABLE` and `VALUE` are unchanged

### Result Log

<!-- Add a new section below for each model run using the format above -->

---

## Test 3 — Insert Block Into Existing Substack (IR-A)

### Mutation Request

```
Add a looks_say block at the very top of the control_repeat block's SUBSTACK, before the existing control_if block.
The looks_say block should say the string "looping".
Give it a new unique id.
Do not change the control_if block or anything inside it.
Do not change the repeat block's TIMES input.
```

### Success Criteria

- repeat's `SUBSTACK` now begins with a `looks_say` block
- `looks_say` has `MESSAGE:[literal:string:"looping"]`
- original `control_if` block follows immediately after in the same substack
- all other structure is unchanged

### Result Log

<!-- Add a new section below for each model run using the format above -->

---

## Test 4 — Swap Operator (IR-A)

### Mutation Request

```
Replace the operator_equals block inside the control_if's CONDITION with an operator_gt block.
Keep the same OPERAND1 (motion_xposition) and OPERAND2 ([literal:number:50]) in the new operator.
Give the new operator block a new unique id.
Do not change anything else.
```

### Success Criteria

- `control_if` condition is now `operator_gt`
- `OPERAND1` is still `motion_xposition` with id `"xpos1"`
- `OPERAND2` is still `[literal:number:50]`
- no other changes

### Result Log

<!-- Add a new section below for each model run using the format above -->

---

## Test 5 — Deep Nesting: Wrap Inner Change In Repeat (IR-A)

### Mutation Request

```
Inside the control_if block's SUBSTACK, wrap the existing data_changevariableby block inside a new control_repeat block.
The new control_repeat block should have TIMES:[literal:number:5].
The data_changevariableby should be the only block inside the new repeat's SUBSTACK.
The new repeat should be the only block inside the if's SUBSTACK.
Give the new repeat block a new unique id.
Do not change the outer repeat block, the if block's CONDITION, the VARIABLE, or the VALUE.
```

### Success Criteria

- outer `control_repeat` is unchanged
- `control_if` substack contains exactly one block: the new `control_repeat`
- new repeat has `TIMES:[literal:number:5]`
- new repeat's substack contains the original `data_changevariableby` (id `"change1"`)
- condition, variable, value unchanged

### Result Log

<!-- Add a new section below for each model run using the format above -->

---

## Test 6 — Change Literal Value (IR-B)

### Mutation Request

```
Change the TIMES input on the control_repeat block from [literal:number:3] to [literal:number:10].
Do not change anything else.
```

### Success Criteria

- `TIMES:[literal:number:10]` on the outer repeat
- all blocks inside the substack are unchanged
- no ids change

### Result Log

<!-- Add a new section below for each model run using the format above -->

---

## Test 7 — Append Block After Existing Sequence (IR-B)

### Mutation Request

```
Add a second looks_say block at the end of the control_repeat's SUBSTACK, after the existing data_setvariableto block.
The new looks_say should say the string "done".
Give it a new unique id.
Do not change any existing blocks.
```

### Success Criteria

- repeat substack order: `looks_say` ("hello"), `data_setvariableto`, `looks_say` ("done")
- existing block ids are unchanged
- new `looks_say` has `MESSAGE:[literal:string:"done"]`

### Result Log

<!-- Add a new section below for each model run using the format above -->

---

## Test 8 — Restructure: Lift Sequence Out Of Repeat (IR-B)

### Mutation Request

```
Move the entire contents of the control_repeat's SUBSTACK to the top level of the procedure body, after the repeat block.
The control_repeat block should remain but have an empty SUBSTACK.
The moved blocks should appear in the same order they had inside the repeat.
Do not change any block ids, fields, or inputs.
```

### Success Criteria

- top-level order: `control_repeat` (empty substack), `looks_say`, `data_setvariableto`
- repeat's substack is empty
- `looks_say` and `data_setvariableto` ids, fields, and inputs are unchanged

### Result Log

<!-- Add a new section below for each model run using the format above -->

---

## Scoring Summary Table

Fill this in as runs are completed.

| Test | Description | Model | Parses | Validates | Change Achieved | Unintended Changes |
|------|-------------|-------|--------|-----------|-----------------|-------------------|
| 1 | Rename variable | | | | | |
| 2 | Promote change to top level | | | | | |
| 3 | Insert block into substack | | | | | |
| 4 | Swap operator | | | | | |
| 5 | Wrap inner change in repeat | | | | | |
| 6 | Change literal value | | | | | |
| 7 | Append block after sequence | | | | | |
| 8 | Lift sequence out of repeat | | | | | |

Add additional rows for each model tested against the same case.
