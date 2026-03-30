# Textify Canon IR — Full Reference

This document is the human-readable reference for the Textify IR format. It covers AI mutation rules, opcode tables, known model failure modes, and worked examples.

For the machine-optimized grammar specification (what AI models fetch), see [`IR_GRAMMAR.md`](IR_GRAMMAR.md).

---

## AI Mutation Rules

These rules apply to every mutation task. Follow them exactly.

- Start from the IR provided by the user. Repeat it back exactly before applying any mutation.
- Preserve all unrelated structure.
- Preserve opcode `id` values unless new nodes are required (new nodes require new unique ids).
- Keep `fields`, `inputs`, and `stacks` distinct — they are not interchangeable.
- Do not invent unsupported structure.
- Copy opcode names exactly as they appear in the IR. Do not abbreviate or misspell them.
  - Example of a known failure: `look_say` — the correct opcode is `looks_say`.
- String literal values must be enclosed in double quotes: `[literal:string:"hello"]` not `[literal:string:hello]`.
- Number and boolean literal values are never quoted: `[literal:number:10]` `[literal:boolean:true]`.
- Return only valid Textify canon IR.
- Do not include explanation outside the IR.

---

## IR Grammar

### Root Types

A document is one or more root nodes. The root must be `[procedure]`, `[script]`, `[stack:]`, or a bare `[opcode:...]`. Blockify accepts multiple roots in one clipboard payload and renders each stack.

Bare `[stack:]` and `[opcode:...]` roots are accepted by Blockify as a convenience for AI-produced fragments. They are wrapped into a synthetic `[script]` internally before validation and rendering. Textify produces `[procedure]` or `[script]` roots for stack blocks; clicking a reporter or boolean expression directly produces a bare `[opcode:]`, `[literal:]`, or `[menu:]` node.

#### `[procedure]`

Represents a custom block definition.

```
[procedure
  proccode:"MY BLOCK %s %n"
  argumentnames:["label","count"]
  argumentdefaults:["hello","0"]
  warp:false
  body:[stack:
    ...
  ]
]
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `proccode` | string | yes | Exact proccode including `%s`, `%n`, `%b` tokens |
| `argumentnames` | string array | yes | One entry per argument slot |
| `argumentdefaults` | string array | yes | One entry per argument slot |
| `warp` | boolean | no | Defaults to `false` if omitted |
| `body` | stack node | yes | The block body |

#### `[script]`

Represents a top-level stack (e.g. a when-flag-clicked script).

```
[script
  body:[stack:
    ...
  ]
]
```

| Field | Type | Required |
|---|---|---|
| `body` | stack node | yes |

---

### Node Types

#### `[stack:]`

An ordered list of opcode nodes. Represents execution order — first child executes first.

```
[stack:
  [opcode:motion_movesteps ...]
  [opcode:motion_movesteps ...]
]
```

An empty stack is valid:

```
[stack:]
```

#### `[opcode:OPCODE_NAME]`

Represents a single Scratch block.

```
[opcode:data_changevariableby
  id:"some-unique-id"
  fields:{VARIABLE:"score"}
  inputs:{VALUE:[literal:number:1]}
  stacks:{}
]
```

| Property | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Must be unique within the root |
| `fields` | field map | no | Omit or use `{}` if empty |
| `inputs` | input map | no | Omit or use `{}` if empty |
| `stacks` | stack map | no | Omit or use `{}` if empty |

**Fields** hold scalar values like variable names, field dropdown values:

```
fields:{VARIABLE:"score"}
fields:{EFFECT:"COLOR"}
fields:{}
```

**Inputs** hold value nodes (literals, reporters, operator blocks):

```
inputs:{VALUE:[literal:number:10]}
inputs:{CONDITION:[opcode:operator_equals ...]}
inputs:{}
```

**Stacks** hold substack slots (control block mouths):

```
stacks:{SUBSTACK:[stack:
  [opcode:data_changevariableby ...]
]}
stacks:{SUBSTACK:[stack:] SUBSTACK2:[stack:]}
stacks:{}
```

#### Control block stack slots

These opcodes automatically initialize missing substack slots to empty stacks. You must still include them explicitly when writing IR:

| Opcode | Stack slots |
|---|---|
| `control_if` | `SUBSTACK` |
| `control_if_else` | `SUBSTACK`, `SUBSTACK2` |
| `control_repeat` | `SUBSTACK` |
| `control_repeat_until` | `SUBSTACK` |
| `control_forever` | `SUBSTACK` |
| `control_while` | `SUBSTACK` |

#### `[literal:TYPE:VALUE]`

Represents a literal value in an input slot.

| Type | Format | Example |
|---|---|---|
| number | unquoted | `[literal:number:10]` |
| string | double-quoted | `[literal:string:"hello"]` |
| boolean | unquoted | `[literal:boolean:true]` |

**String literals must always be quoted.** This is the most common model failure mode.

#### `[menu:OPCODE:"VALUE"]`

Represents a dropdown menu input.

```
[menu:looks_costume:"costume1"]
[menu:motion_goto_menu:"_mouse_"]
```

---

### Argument Reporters

Used inside procedure bodies to reference argument values.

```
[opcode:argument_reporter_string_number
  id:"arg0"
  fields:{VALUE:"label"}
  inputs:{}
  stacks:{}
]

[opcode:argument_reporter_boolean
  id:"arg1"
  fields:{VALUE:"flag"}
  inputs:{}
  stacks:{}
]
```

---

### procedures_call

Invokes a custom block. Produced by textify whenever a sprite uses a defined custom block.

```
[opcode:procedures_call
  id:"call1"
  fields:{PROCCODE:"My Block %s %n"}
  inputs:{arg0:[literal:string:"hello"] arg1:[literal:number:42]}
  stacks:{}
]
```

- `PROCCODE` in `fields` must exactly match the `proccode` of the target `[procedure]`.
- Input keys are the argument IDs from the procedure definition (e.g. `arg0`, `arg1`). Count must match the `%s`/`%n`/`%b` tokens in `proccode`.
- `PROCCODE` is used for mutation generation only; it does not appear as a rendered field on the block.

---

## Common Opcode Reference

### Motion
| Opcode | Key inputs/fields |
|---|---|
| `motion_movesteps` | `STEPS` |
| `motion_gotoxy` | `X`, `Y` |
| `motion_turnright` | `DEGREES` |
| `motion_turnleft` | `DEGREES` |
| `motion_pointindirection` | `DIRECTION` |
| `motion_changexby` | `DX` |
| `motion_changeyby` | `DY` |
| `motion_setx` | `X` |
| `motion_sety` | `Y` |
| `motion_xposition` | *(reporter, no inputs)* |
| `motion_yposition` | *(reporter, no inputs)* |
| `motion_direction` | *(reporter, no inputs)* |

### Looks
| Opcode | Key inputs/fields |
|---|---|
| `looks_say` | `MESSAGE` |
| `looks_sayforsecs` | `MESSAGE`, `SECS` |
| `looks_think` | `MESSAGE` |
| `looks_thinkforsecs` | `MESSAGE`, `SECS` |
| `looks_show` | *(no inputs)* |
| `looks_hide` | *(no inputs)* |
| `looks_setsizeto` | `SIZE` |
| `looks_changesizeby` | `CHANGE` |
| `looks_switchcostumeto` | `COSTUME` (menu) |
| `looks_nextcostume` | *(no inputs)* |
| `looks_size` | *(reporter)* |

### Control
| Opcode | Key inputs | Stack slots |
|---|---|---|
| `control_if` | `CONDITION` | `SUBSTACK` |
| `control_if_else` | `CONDITION` | `SUBSTACK`, `SUBSTACK2` |
| `control_repeat` | `TIMES` | `SUBSTACK` |
| `control_forever` | *(none)* | `SUBSTACK` |
| `control_repeat_until` | `CONDITION` | `SUBSTACK` |
| `control_while` | `CONDITION` | `SUBSTACK` |
| `control_wait` | `DURATION` | *(none)* |
| `control_wait_until` | `CONDITION` | *(none)* |
| `control_stop` | field `STOP_OPTION` | *(none)* |
| `control_create_clone_of` | `CLONE_OPTION` (menu) | *(none)* |
| `control_delete_this_clone` | *(none)* | *(none)* |
| `control_start_as_clone` | *(hat)* | *(none)* |

### Operators
| Opcode | Inputs | Notes |
|---|---|---|
| `operator_equals` | `OPERAND1`, `OPERAND2` | |
| `operator_gt` | `OPERAND1`, `OPERAND2` | |
| `operator_lt` | `OPERAND1`, `OPERAND2` | |
| `operator_and` | `OPERAND1`, `OPERAND2` | |
| `operator_or` | `OPERAND1`, `OPERAND2` | |
| `operator_not` | `OPERAND` | |
| `operator_add` | `NUM1`, `NUM2` | Blockify also accepts `OPERAND1`/`OPERAND2` |
| `operator_subtract` | `NUM1`, `NUM2` | Blockify also accepts `OPERAND1`/`OPERAND2` |
| `operator_multiply` | `NUM1`, `NUM2` | Blockify also accepts `OPERAND1`/`OPERAND2` |
| `operator_divide` | `NUM1`, `NUM2` | Blockify also accepts `OPERAND1`/`OPERAND2` |
| `operator_mod` | `NUM1`, `NUM2` | |
| `operator_random` | `FROM`, `TO` | |
| `operator_round` | `NUM` | |
| `operator_mathop` | `NUM` | field `OPERATOR` |
| `operator_join` | `STRING1`, `STRING2` | |
| `operator_letter_of` | `LETTER`, `STRING` | |
| `operator_length` | `STRING` | |
| `operator_contains` | `STRING1`, `STRING2` | |

### Data (Variables and Lists)
| Opcode | Fields | Inputs |
|---|---|---|
| `data_setvariableto` | `VARIABLE` | `VALUE` |
| `data_changevariableby` | `VARIABLE` | `VALUE` |
| `data_showvariable` | `VARIABLE` | *(none)* |
| `data_hidevariable` | `VARIABLE` | *(none)* |
| `data_variable` | `VARIABLE` | *(reporter)* |
| `data_addtolist` | `LIST` | `ITEM` |
| `data_deleteoflist` | `LIST` | `INDEX` |
| `data_deletealloflist` | `LIST` | *(none)* |
| `data_insertatlist` | `LIST` | `ITEM`, `INDEX` |
| `data_replaceitemoflist` | `LIST` | `ITEM`, `INDEX` |
| `data_itemoflist` | `LIST` | `INDEX` |
| `data_itemnumoflist` | `LIST` | `ITEM` |
| `data_lengthoflist` | `LIST` | *(reporter)* |
| `data_listcontainsitem` | `LIST` | `ITEM` |
| `data_showlist` | `LIST` | *(none)* |
| `data_hidelist` | `LIST` | *(none)* |

### Events
| Opcode | Notes |
|---|---|
| `events_whenflagclicked` | hat block, no inputs |
| `events_whenkeypressed` | field `KEY_OPTION` |
| `events_whenthisspriteclicked` | no inputs |
| `events_broadcast` | input `BROADCAST_INPUT` |
| `events_broadcastandwait` | input `BROADCAST_INPUT` |

### Sensing
| Opcode | Key inputs |
|---|---|
| `sensing_touchingobject` | `TOUCHINGOBJECTMENU` (menu) |
| `sensing_keypressed` | `KEY_OPTION` (menu) |
| `sensing_mousedown` | *(reporter-boolean)* |
| `sensing_mousex` | *(reporter)* |
| `sensing_mousey` | *(reporter)* |
| `sensing_answer` | *(reporter)* |
| `sensing_timer` | *(reporter)* |
| `sensing_resettimer` | *(no inputs)* |

---

## Known Model Failure Modes

These failure modes have been observed across multiple models and are worth checking before accepting output as valid.

**String literal quoting** — the most common failure. Models produce `[literal:string:hello]` instead of `[literal:string:"hello"]`. Blockify now recovers from this silently (the value is treated as a bare string), but canonical IR must always use double quotes. Always write `[literal:string:"hello"]`.

**Opcode misspelling** — models occasionally abbreviate or misspell opcodes (e.g. `look_say` instead of `looks_say`). The IR will parse and validate but the block will render in fallback mode. There is no recovery for misspelled opcode names — they must be exact.

**Session context bleed** — when running multiple mutations in the same session, models can carry structure from an earlier mutation into a later one. To prevent this, re-state the starting IR explicitly before each new mutation request using a continuation prompt: `start from here, don't change anything: (IR)`.

**Threshold drift on behavioral prompts** — when asked to change a comparison direction (e.g. "pass when the sprite goes past the target"), models may adjust the comparison value as well as the operator. If the literal value should not change, state it explicitly: "adjust the comparison direction only — keep the threshold value the same."

**Arithmetic operator input names** — models frequently use `OPERAND1`/`OPERAND2` for `operator_add`, `operator_subtract`, `operator_multiply`, and `operator_divide`, confusing them with the comparison operators. The canonical names are `NUM1` and `NUM2`. Blockify normalizes this automatically, but the canonical names should be used when writing new IR.

**Unintended structural changes** — models may add or remove blocks not mentioned in the mutation request. The mutation rules require preserving all unrelated structure, but this should be verified in Blockify after applying any AI-produced IR.

**Recovering from parse or render errors** — if Blockify shows an error, copy the error message and paste it back into the AI chat. LLMs will generally correct the IR when given the exact error text. Multiple attempts are sometimes needed.

---

## Parser Tolerances

Blockify's parser recovers silently from certain grammar deviations that models produce. These are safety nets — **always produce canonical IR**. Canonical IR exported by Textify never uses these forms.

| Deviation | Canonical form | Also accepted |
|---|---|---|
| Unquoted string literal | `[literal:string:"hello"]` | `[literal:string:hello]` |
| Commas between opcode properties | `id:"x" fields:{}` | `id:"x", fields:{}` |
| Commas between map entries | `{A:"1" B:"2"}` | `{A:"1", B:"2"}` |
| Trailing comma in map | `{A:"1"}` | `{A:"1",}` |
| Trailing comma in string array | `["a","b"]` | `["a","b",]` |
| Commas between procedure properties | `proccode:"x" argumentnames:[]` | `proccode:"x", argumentnames:[]` |

Opcode name misspellings are not in this table because they are not recovered — a misspelled opcode name passes the parser but silently falls back in the renderer.

---

## Complete Example

A procedure with a conditional repeat, an if/else inside, and a second top-level if:

```
[procedure
  proccode:"ANNOUNCE SCORE %s"
  argumentnames:["label"]
  argumentdefaults:["score"]
  warp:false
  body:[stack:
    [opcode:control_if
      id:"outer_if"
      fields:{}
      inputs:{
        CONDITION:[opcode:operator_gt
          id:"gt1"
          fields:{}
          inputs:{
            OPERAND1:[opcode:data_variable
              id:"var_score"
              fields:{VARIABLE:"score"}
              inputs:{}
              stacks:{}
            ]
            OPERAND2:[literal:number:0]
          }
          stacks:{}
        ]
      }
      stacks:{
        SUBSTACK:[stack:
          [opcode:looks_say
            id:"say1"
            fields:{}
            inputs:{
              MESSAGE:[opcode:argument_reporter_string_number
                id:"arg_label"
                fields:{VALUE:"label"}
                inputs:{}
                stacks:{}
              ]
            }
            stacks:{}
          ]
        ]
      }
    ]
    [opcode:data_setvariableto
      id:"reset1"
      fields:{VARIABLE:"score"}
      inputs:{VALUE:[literal:number:0]}
      stacks:{}
    ]
  ]
]
```
