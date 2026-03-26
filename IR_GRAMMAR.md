# Textify Canon IR — Grammar Specification

**Version:** 1
**Canonical URL:** `https://raw.githubusercontent.com/loronajay/turbowarp-extensions-canon/main/IR_GRAMMAR.md`

Textify Canon IR is a bracket-delimited text format representing Scratch/TurboWarp block programs. This document is the complete formal specification. Follow it exactly when reading or producing IR.

---

## Root

A document is one or more root nodes. When producing IR, output one root per response unless explicitly asked for multiple. Blockify accepts multiple roots in one clipboard payload and renders each stack.

```
root := procedure | script | stack | opcode
```

`[stack:]` and `[opcode:...]` roots are accepted by Blockify and wrapped into a synthetic `[script]` before rendering.

---

## Node Types

### procedure

```
[procedure
  proccode:"STRING"
  argumentnames:STRING-ARRAY
  argumentdefaults:STRING-ARRAY
  warp:BOOL
  body:[stack: OPCODE* ]
]
```

| Key | Type | Required |
|---|---|---|
| `proccode` | string | yes |
| `argumentnames` | string array | yes |
| `argumentdefaults` | string array | yes |
| `warp` | bool | no — defaults to `false` |
| `body` | stack node | yes |

`proccode` encodes argument slots as `%s` (string/number), `%n` (number), or `%b` (boolean). Both `%s` and `%n` map to `argument_reporter_string_number`. The length of `argumentnames` and `argumentdefaults` must match the number of `%s`/`%n`/`%b` tokens in `proccode`.

---

### script

```
[script
  body:[stack: OPCODE* ]
]
```

---

### stack

```
[stack:
  [opcode:...] ...
]
```

A stack is an ordered sequence of opcode nodes. Empty stack: `[stack:]`

---

### opcode

```
[opcode:OPCODE_NAME
  id:"STRING"
  fields:{KEY:"VALUE" ...}
  inputs:{KEY:NODE ...}
  stacks:{KEY:[stack:...] ...}
]
```

| Key | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Must be unique within the root |
| `fields` | field map | no | Omit or use `{}` if empty |
| `inputs` | input map | no | Omit or use `{}` if empty |
| `stacks` | stack map | no | Omit or use `{}` if empty |

- **fields** hold scalar values: variable names, dropdown selections, field labels
- **inputs** hold value nodes: `literal`, `menu`, or reporter `opcode` nodes
- **stacks** hold substack slots for control blocks only

---

### literal

```
[literal:number:VALUE]        VALUE is unquoted — e.g. [literal:number:10]
[literal:number:-VALUE]       Negative — e.g. [literal:number:-108]
[literal:string:"VALUE"]      VALUE is double-quoted — e.g. [literal:string:"hello"]
[literal:boolean:true]
[literal:boolean:false]
```

**String values MUST be double-quoted. Number and boolean values are NEVER quoted.**

---

### menu

```
[menu:MENU_OPCODE:"VALUE"]
```

Example: `[menu:looks_costume:"costume1"]`

---

### argument_reporter

Used inside `procedure` bodies to reference argument values.

```
[opcode:argument_reporter_string_number
  id:"ID"
  fields:{VALUE:"ARG_NAME"}
  inputs:{}
  stacks:{}
]

[opcode:argument_reporter_boolean
  id:"ID"
  fields:{VALUE:"ARG_NAME"}
  inputs:{}
  stacks:{}
]
```

`ARG_NAME` must match an entry in the enclosing procedure's `argumentnames`.

---

### procedures_call

Invokes a custom block. Appears as a stack block (command) whenever a defined custom block is used.

```
[opcode:procedures_call
  id:"ID"
  fields:{PROCCODE:"MY BLOCK %s %n"}
  inputs:{ARG_ID_0:node ARG_ID_1:node ...}
  stacks:{}
]
```

- `PROCCODE` in `fields` must match the `proccode` of the target `[procedure]`.
- Input keys are the argument IDs assigned at definition time (e.g. `arg0`, `arg1`). The number of inputs must match the number of `%s`/`%n`/`%b` tokens in `proccode`.
- `PROCCODE` is used for mutation generation only and is filtered from the rendered field list.

---

## String Array Syntax

```
[]
["a"]
["a","b","c"]
```

Values are always double-quoted strings.

---

## Constraints

- All `id` values within a root must be unique
- `inputs` values may not be `stack` or `procedure` nodes
- `stacks` values must be `stack` nodes
- String literals must use double quotes — `[literal:string:"x"]` not `[literal:string:x]`
- Opcode names must be exact — `looks_say` not `look_say`
- `fields`, `inputs`, and `stacks` are distinct and not interchangeable

---

## Opcode Input and Field Reference

### Motion

| Opcode | inputs | fields |
|---|---|---|
| `motion_movesteps` | `STEPS` | |
| `motion_gotoxy` | `X`, `Y` | |
| `motion_turnright` | `DEGREES` | |
| `motion_turnleft` | `DEGREES` | |
| `motion_pointindirection` | `DIRECTION` | |
| `motion_changexby` | `DX` | |
| `motion_changeyby` | `DY` | |
| `motion_setx` | `X` | |
| `motion_sety` | `Y` | |
| `motion_xposition` | *(reporter, no inputs)* | |
| `motion_yposition` | *(reporter, no inputs)* | |
| `motion_direction` | *(reporter, no inputs)* | |

### Looks

| Opcode | inputs | fields |
|---|---|---|
| `looks_say` | `MESSAGE` | |
| `looks_sayforsecs` | `MESSAGE`, `SECS` | |
| `looks_think` | `MESSAGE` | |
| `looks_thinkforsecs` | `MESSAGE`, `SECS` | |
| `looks_show` | *(none)* | |
| `looks_hide` | *(none)* | |
| `looks_setsizeto` | `SIZE` | |
| `looks_changesizeby` | `CHANGE` | |
| `looks_switchcostumeto` | `COSTUME` (menu) | |
| `looks_nextcostume` | *(none)* | |
| `looks_size` | *(reporter)* | |

### Sound

| Opcode | inputs | fields |
|---|---|---|
| `sound_play` | `SOUND_MENU` (menu) | |
| `sound_playuntildone` | `SOUND_MENU` (menu) | |
| `sound_stopallsounds` | *(none)* | |
| `sound_setvolumeto` | `VOLUME` | |
| `sound_changevolumeby` | `VOLUME` | |

### Control

| Opcode | inputs | stacks | fields |
|---|---|---|---|
| `control_if` | `CONDITION` | `SUBSTACK` | |
| `control_if_else` | `CONDITION` | `SUBSTACK`, `SUBSTACK2` | |
| `control_repeat` | `TIMES` | `SUBSTACK` | |
| `control_forever` | *(none)* | `SUBSTACK` | |
| `control_repeat_until` | `CONDITION` | `SUBSTACK` | |
| `control_while` | `CONDITION` | `SUBSTACK` | |
| `control_wait` | `DURATION` | | |
| `control_wait_until` | `CONDITION` | | |
| `control_stop` | *(none)* | | `STOP_OPTION` |
| `control_create_clone_of` | `CLONE_OPTION` (menu) | | |
| `control_delete_this_clone` | *(none)* | | |
| `control_start_as_clone` | *(hat)* | | |

### Events

| Opcode | inputs | fields |
|---|---|---|
| `event_whenflagclicked` | *(hat, none)* | |
| `event_whenkeypressed` | *(hat)* | `KEY_OPTION` |
| `event_whenthisspriteclicked` | *(hat, none)* | |
| `event_broadcast` | `BROADCAST_INPUT` | |
| `event_broadcastandwait` | `BROADCAST_INPUT` | |

**`BROADCAST_INPUT` rule:** Use `[literal:string:"name"]` when the broadcast name is new or being renamed — this injects the name as a raw string and Scratch will register it. Use `[menu:event_broadcast_menu:"name"]` **only** when the broadcast already exists in the project with that exact registered name. When in doubt, use `[literal:string:...]` — it always works; the menu form fails silently for unregistered names.

### Sensing

| Opcode | inputs | fields |
|---|---|---|
| `sensing_touchingobject` | `TOUCHINGOBJECTMENU` (menu) | |
| `sensing_keypressed` | `KEY_OPTION` (menu) | |
| `sensing_mousedown` | *(reporter-boolean)* | |
| `sensing_mousex` | *(reporter)* | |
| `sensing_mousey` | *(reporter)* | |
| `sensing_answer` | *(reporter)* | |
| `sensing_timer` | *(reporter)* | |
| `sensing_resettimer` | *(none)* | |

### Operators

**Critical:** arithmetic operators use `NUM1`/`NUM2`, not `OPERAND1`/`OPERAND2`.

| Opcode | inputs |
|---|---|
| `operator_add` | `NUM1`, `NUM2` |
| `operator_subtract` | `NUM1`, `NUM2` |
| `operator_multiply` | `NUM1`, `NUM2` |
| `operator_divide` | `NUM1`, `NUM2` |
| `operator_mod` | `NUM1`, `NUM2` |
| `operator_random` | `FROM`, `TO` |
| `operator_round` | `NUM` |
| `operator_mathop` | `NUM` — field `OPERATOR` |
| `operator_equals` | `OPERAND1`, `OPERAND2` |
| `operator_gt` | `OPERAND1`, `OPERAND2` |
| `operator_lt` | `OPERAND1`, `OPERAND2` |
| `operator_and` | `OPERAND1`, `OPERAND2` |
| `operator_or` | `OPERAND1`, `OPERAND2` |
| `operator_not` | `OPERAND` |
| `operator_join` | `STRING1`, `STRING2` |
| `operator_letter_of` | `LETTER`, `STRING` |
| `operator_length` | `STRING` |
| `operator_contains` | `STRING1`, `STRING2` |

### Data (Variables and Lists)

| Opcode | inputs | fields |
|---|---|---|
| `data_setvariableto` | `VALUE` | `VARIABLE` |
| `data_changevariableby` | `VALUE` | `VARIABLE` |
| `data_showvariable` | *(none)* | `VARIABLE` |
| `data_hidevariable` | *(none)* | `VARIABLE` |
| `data_variable` | *(reporter)* | `VARIABLE` |
| `data_addtolist` | `ITEM` | `LIST` |
| `data_deleteoflist` | `INDEX` | `LIST` |
| `data_deletealloflist` | *(none)* | `LIST` |
| `data_insertatlist` | `ITEM`, `INDEX` | `LIST` |
| `data_replaceitemoflist` | `ITEM`, `INDEX` | `LIST` |
| `data_itemoflist` | `INDEX` | `LIST` |
| `data_itemnumoflist` | `ITEM` | `LIST` |
| `data_lengthoflist` | *(reporter)* | `LIST` |
| `data_listcontainsitem` | `ITEM` | `LIST` |
| `data_showlist` | *(none)* | `LIST` |
| `data_hidelist` | *(none)* | `LIST` |

---

## Complete Example

```
[procedure
  proccode:"Move To Grid %n %n"
  argumentnames:["col","row"]
  argumentdefaults:["0","0"]
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
                NUM1:[opcode:argument_reporter_string_number
                  id:"arg_col"
                  fields:{VALUE:"col"}
                  inputs:{}
                  stacks:{}
                ]
                NUM2:[literal:number:24]
              }
              stacks:{}
            ]
          }
          stacks:{}
        ]
        Y:[opcode:operator_add
          id:"calc_y"
          fields:{}
          inputs:{
            NUM1:[literal:number:-108]
            NUM2:[opcode:operator_multiply
              id:"scale_y"
              fields:{}
              inputs:{
                NUM1:[opcode:argument_reporter_string_number
                  id:"arg_row"
                  fields:{VALUE:"row"}
                  inputs:{}
                  stacks:{}
                ]
                NUM2:[literal:number:24]
              }
              stacks:{}
            ]
          }
          stacks:{}
        ]
      }
      stacks:{}
    ]
  ]
]
```
