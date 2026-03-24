'use strict';

// __tests__/replace-body-patch.test.js
//
// Tests for the replace_body patch operation.
// Covers: targeting (procedure by proccode, script by index, no-target fallback),
// validation errors, body parse errors, and structural correctness after apply.

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Bootstrap — load the embedded bundle to register test hooks
// ---------------------------------------------------------------------------

const embeddedPath = path.resolve(__dirname, '../dist/blockify-turbowarp.embedded.js');
const src = fs.readFileSync(embeddedPath, 'utf8');

const Scratch = {
  extensions: {
    unsandboxed: true,
    register: () => {}
  },
  BlockType: { COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'boolean', BUTTON: 'button' },
  ArgumentType: { STRING: 'string', NUMBER: 'number' }
};

globalThis.Scratch = Scratch;
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({
    style: {},
    dataset: {},
    appendChild: () => {},
    insertBefore: () => {},
    firstChild: null,
    children: [],
    head: { appendChild: () => {} }
  }),
  head: { appendChild: () => {} },
  body: { appendChild: () => {} }
};
globalThis.navigator = {};
globalThis.requestAnimationFrame = () => {};

eval(src); // eslint-disable-line no-eval

const {
  Parser,
  serializeAst,
  applyProjectPatch,
  applyPatchToIR,
  applyPatchJsonToIR
} = globalThis.__blockifyTestHooks;

// ---------------------------------------------------------------------------
// Shared IR fixtures
// ---------------------------------------------------------------------------

// A [procedure] root with a single data_changevariableby in the body.
const PROCEDURE_IR = `[procedure
  proccode:"TEST BLOCK A"
  argumentnames:[]
  argumentdefaults:[]
  warp:true
  body:[stack:
    [opcode:data_changevariableby
      id:"change1"
      fields:{VARIABLE:"x"}
      inputs:{VALUE:[literal:number:1]}
      stacks:{}
    ]
  ]
]`;

// A [script] root — simulates a when-flag-clicked hat + move block.
const SCRIPT_IR = `[script
  body:[stack:
    [opcode:events_whenflagclicked
      id:"hat1"
      fields:{}
      inputs:{}
      stacks:{}
    ]
    [opcode:motion_movesteps
      id:"move1"
      fields:{}
      inputs:{STEPS:[literal:number:10]}
      stacks:{}
    ]
  ]
]`;

// A minimal replacement body — just one changevariableby.
const REPLACEMENT_BODY = `[stack:
  [opcode:data_changevariableby
    id:"new1"
    fields:{VARIABLE:"score"}
    inputs:{VALUE:[literal:number:5]}
    stacks:{}
  ]
]`;

// A body with a control_if wrapping a changevariableby — structural depth test.
const REPLACEMENT_BODY_WITH_IF = `[stack:
  [opcode:control_if
    id:"if1"
    fields:{}
    inputs:{CONDITION:[opcode:operator_equals
      id:"cond1"
      fields:{}
      inputs:{
        OPERAND1:[opcode:motion_xposition
          id:"xpos1"
          fields:{}
          inputs:{}
          stacks:{}
        ]
        OPERAND2:[literal:number:0]
      }
      stacks:{}
    ]}
    stacks:{SUBSTACK:[stack:
      [opcode:data_changevariableby
        id:"inner1"
        fields:{VARIABLE:"x"}
        inputs:{VALUE:[literal:number:1]}
        stacks:{}
      ]
    ]}
  ]
]`;

// An empty body — valid, just an empty stack.
const EMPTY_BODY = `[stack:]`;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function parseIR(irText) {
  return new Parser(irText).parse();
}

function makePatch(operations) {
  return { version: 1, target: 'project', operations };
}

// ---------------------------------------------------------------------------
// Section 1: No-target fallback (single-root compatibility)
// ---------------------------------------------------------------------------

describe('replace_body — no target (single-root fallback)', () => {
  test('replaces body of the only root when target is omitted', () => {
    const patch = makePatch([
      { op: 'replace_body', body: REPLACEMENT_BODY }
    ]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(true);

    const root = parseIR(result.ir);
    expect(root.body.children).toHaveLength(1);
    expect(root.body.children[0].opcode).toBe('data_changevariableby');
    expect(root.body.children[0].fields.VARIABLE).toBe('score');
    expect(root.body.children[0].id).toBe('new1');
  });

  test('replaces body with an empty stack when target is omitted', () => {
    const patch = makePatch([
      { op: 'replace_body', body: EMPTY_BODY }
    ]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(true);

    const root = parseIR(result.ir);
    expect(root.body.children).toHaveLength(0);
  });

  test('preserves procedure metadata (proccode, warp, argumentnames) after replace', () => {
    const patch = makePatch([
      { op: 'replace_body', body: REPLACEMENT_BODY }
    ]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(true);

    const root = parseIR(result.ir);
    expect(root.proccode).toBe('TEST BLOCK A');
    expect(root.warp).toBe(true);
    expect(root.argumentnames).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Section 2: Procedure targeting by proccode
// ---------------------------------------------------------------------------

describe('replace_body — target: procedure by proccode', () => {
  test('replaces procedure body when proccode matches', () => {
    const patch = makePatch([{
      op: 'replace_body',
      target: { type: 'procedure', proccode: 'TEST BLOCK A' },
      body: REPLACEMENT_BODY
    }]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(true);

    const root = parseIR(result.ir);
    expect(root.body.children[0].fields.VARIABLE).toBe('score');
  });

  test('fails when proccode does not match any root', () => {
    const patch = makePatch([{
      op: 'replace_body',
      target: { type: 'procedure', proccode: 'NONEXISTENT BLOCK' },
      body: REPLACEMENT_BODY
    }]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no procedure root found/i);
  });

  test('fails when proccode is empty string', () => {
    const patch = makePatch([{
      op: 'replace_body',
      target: { type: 'procedure', proccode: '' },
      body: REPLACEMENT_BODY
    }]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/proccode/i);
  });

  test('fails when proccode is missing from target', () => {
    const patch = makePatch([{
      op: 'replace_body',
      target: { type: 'procedure' },
      body: REPLACEMENT_BODY
    }]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/proccode/i);
  });
});

// ---------------------------------------------------------------------------
// Section 3: Script targeting by index
// ---------------------------------------------------------------------------

describe('replace_body — target: script by index', () => {
  test('replaces script body at index 0', () => {
    const patch = makePatch([{
      op: 'replace_body',
      target: { type: 'script', index: 0 },
      body: REPLACEMENT_BODY
    }]);
    const result = applyPatchToIR(SCRIPT_IR, patch);
    expect(result.ok).toBe(true);

    const root = parseIR(result.ir);
    expect(root.type).toBe('script');
    expect(root.body.children).toHaveLength(1);
    expect(root.body.children[0].opcode).toBe('data_changevariableby');
  });

  test('fails when script index is out of range', () => {
    const patch = makePatch([{
      op: 'replace_body',
      target: { type: 'script', index: 5 },
      body: REPLACEMENT_BODY
    }]);
    const result = applyPatchToIR(SCRIPT_IR, patch);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/out of range/i);
  });

  test('fails when script index is negative', () => {
    const patch = makePatch([{
      op: 'replace_body',
      target: { type: 'script', index: -1 },
      body: REPLACEMENT_BODY
    }]);
    const result = applyPatchToIR(SCRIPT_IR, patch);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/non-negative/i);
  });

  test('fails when script index is missing', () => {
    const patch = makePatch([{
      op: 'replace_body',
      target: { type: 'script' },
      body: REPLACEMENT_BODY
    }]);
    const result = applyPatchToIR(SCRIPT_IR, patch);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/index/i);
  });

  test('fails when targeting a script root but source is a procedure', () => {
    const patch = makePatch([{
      op: 'replace_body',
      target: { type: 'script', index: 0 },
      body: REPLACEMENT_BODY
    }]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/out of range/i);
  });
});

// ---------------------------------------------------------------------------
// Section 4: Unknown target type
// ---------------------------------------------------------------------------

describe('replace_body — invalid target.type', () => {
  test('fails on unknown target type', () => {
    const patch = makePatch([{
      op: 'replace_body',
      target: { type: 'sprite' },
      body: REPLACEMENT_BODY
    }]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown target\.type/i);
  });
});

// ---------------------------------------------------------------------------
// Section 5: Body validation
// ---------------------------------------------------------------------------

describe('replace_body — body validation', () => {
  test('fails when body is empty string', () => {
    const patch = makePatch([
      { op: 'replace_body', body: '' }
    ]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/non-empty/i);
  });

  test('fails when body is missing from operation', () => {
    const patch = makePatch([
      { op: 'replace_body' }
    ]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/non-empty/i);
  });

  test('fails when body is not a valid stack IR', () => {
    const patch = makePatch([
      { op: 'replace_body', body: '[procedure proccode:"bad"]' }
    ]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/body IR failed to parse/i);
  });

  test('fails when body IR is syntactically invalid', () => {
    const patch = makePatch([
      { op: 'replace_body', body: '[stack: !!GARBAGE!!' }
    ]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/body IR failed to parse/i);
  });
});

// ---------------------------------------------------------------------------
// Section 6: Structural correctness — deeper shapes
// ---------------------------------------------------------------------------

describe('replace_body — structural correctness', () => {
  test('correctly installs a body with nested control_if + changevariableby', () => {
    const patch = makePatch([
      { op: 'replace_body', body: REPLACEMENT_BODY_WITH_IF }
    ]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(true);

    const root = parseIR(result.ir);
    expect(root.body.children).toHaveLength(1);
    const ifBlock = root.body.children[0];
    expect(ifBlock.opcode).toBe('control_if');
    expect(ifBlock.stacks.SUBSTACK.children).toHaveLength(1);
    expect(ifBlock.stacks.SUBSTACK.children[0].opcode).toBe('data_changevariableby');
  });

  test('replaced IR round-trips through Parser without error', () => {
    const patch = makePatch([
      { op: 'replace_body', body: REPLACEMENT_BODY_WITH_IF }
    ]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(true);
    // If the round-trip re-parse failed, result.ok would already be false.
    // This is an explicit belt-and-suspenders check.
    expect(() => parseIR(result.ir)).not.toThrow();
  });

  test('does not mutate source IR — original root is unchanged after patch', () => {
    const originalRoot = parseIR(PROCEDURE_IR);
    const originalChildOpcode = originalRoot.body.children[0].opcode;

    const patch = makePatch([
      { op: 'replace_body', body: REPLACEMENT_BODY }
    ]);
    applyPatchToIR(PROCEDURE_IR, patch);

    // Re-parse original to confirm no mutation
    const recheck = parseIR(PROCEDURE_IR);
    expect(recheck.body.children[0].opcode).toBe(originalChildOpcode);
  });

  test('can chain replace_body after rename_variable in same patch', () => {
    const patch = makePatch([
      {
        op: 'rename_variable',
        from: 'x',
        to: 'renamed_x',
        scope: 'project'
      },
      {
        op: 'replace_body',
        body: REPLACEMENT_BODY
      }
    ]);
    const result = applyPatchToIR(PROCEDURE_IR, patch);
    expect(result.ok).toBe(true);

    const root = parseIR(result.ir);
    // replace_body runs after rename, so the new body (score var) is what survives
    expect(root.body.children[0].fields.VARIABLE).toBe('score');
  });
});

// ---------------------------------------------------------------------------
// Section 7: applyPatchJsonToIR integration (JSON string input path)
// ---------------------------------------------------------------------------

describe('replace_body — applyPatchJsonToIR integration', () => {
  test('works correctly when patch is provided as a JSON string', () => {
    const patchJson = JSON.stringify(makePatch([
      {
        op: 'replace_body',
        target: { type: 'procedure', proccode: 'TEST BLOCK A' },
        body: REPLACEMENT_BODY
      }
    ]));
    const result = applyPatchJsonToIR(PROCEDURE_IR, patchJson);
    expect(result.ok).toBe(true);

    const root = parseIR(result.ir);
    expect(root.body.children[0].fields.VARIABLE).toBe('score');
  });

  test('returns structured error when patch JSON is malformed', () => {
    const result = applyPatchJsonToIR(PROCEDURE_IR, '{ bad json !!');
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);
  });
});
