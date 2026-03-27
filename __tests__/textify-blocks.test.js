const { loadExtension } = require('./helpers/load-extension');

const IR_SPEC_HEADER = '# Textify Canon IR — spec: https://raw.githubusercontent.com/loronajay/textify-blockify-IR/main/IR_GRAMMAR.md';

function makeTextifyGlobals(writeText = jest.fn().mockResolvedValue(undefined), readText = jest.fn().mockResolvedValue('')) {
  return {
    document: {
      getElementById() { return null; },
      createElement() {
        return {
          style: {},
          appendChild() {},
          append() {},
          remove() {},
          set textContent(v) { this._t = v; },
          get textContent() { return this._t || ''; }
        };
      },
      body: { appendChild() {} }
    },
    navigator: { clipboard: { writeText, readText } }
  };
}

// Single hat + one body block
function makeScriptTarget() {
  return {
    sprite: { name: 'Sprite1' },
    getName() { return 'Sprite1'; },
    blocks: {
      _blocks: {
        hat1: {
          id: 'hat1', opcode: 'events_whenflagclicked',
          topLevel: true, parent: null, next: 'move1',
          x: 0, y: 0, fields: {}, inputs: {}
        },
        move1: {
          id: 'move1', opcode: 'motion_movesteps',
          topLevel: false, parent: 'hat1', next: null,
          fields: {},
          inputs: { STEPS: { block: 'num1', shadow: 'num1' } }
        },
        num1: {
          id: 'num1', opcode: 'math_number',
          shadow: true, fields: { NUM: { value: '10' } }, inputs: {}
        }
      }
    }
  };
}

// Two top-level stacks, sorted by x position
function makeMultiStackTarget() {
  return {
    sprite: { name: 'Sprite1' },
    getName() { return 'Sprite1'; },
    blocks: {
      _blocks: {
        hat1: {
          id: 'hat1', opcode: 'events_whenflagclicked',
          topLevel: true, parent: null, next: null,
          x: 0, y: 0, fields: {}, inputs: {}
        },
        hat2: {
          id: 'hat2', opcode: 'event_whenkeypressed',
          topLevel: true, parent: null, next: null,
          x: 200, y: 0,
          fields: { KEY_OPTION: { value: 'space' } }, inputs: {}
        }
      }
    }
  };
}

// One procedure definition + one regular script — proc should be excluded
function makeProcAndScriptTarget() {
  return {
    sprite: { name: 'Sprite1' },
    getName() { return 'Sprite1'; },
    blocks: {
      _blocks: {
        def1: {
          id: 'def1', opcode: 'procedures_definition',
          topLevel: true, parent: null, next: null,
          x: 0, y: 0, inputs: { custom_block: { block: 'proto1', shadow: null } }
        },
        proto1: {
          id: 'proto1', opcode: 'procedures_prototype',
          mutation: { proccode: 'my block', argumentnames: '[]', argumentdefaults: '[]', warp: 'false' }
        },
        hat1: {
          id: 'hat1', opcode: 'events_whenflagclicked',
          topLevel: true, parent: null, next: null,
          x: 200, y: 0, fields: {}, inputs: {}
        }
      }
    }
  };
}

// Control-if block with a reporter CONDITION and a SUBSTACK body
function makeControlTarget() {
  return {
    sprite: { name: 'Sprite1' },
    getName() { return 'Sprite1'; },
    blocks: {
      _blocks: {
        hat1: {
          id: 'hat1', opcode: 'events_whenflagclicked',
          topLevel: true, parent: null, next: 'if1',
          x: 0, y: 0, fields: {}, inputs: {}
        },
        if1: {
          id: 'if1', opcode: 'control_if',
          topLevel: false, parent: 'hat1', next: null,
          fields: {},
          inputs: {
            CONDITION: { block: 'reporter1', shadow: null },
            SUBSTACK:  { block: 'body1',    shadow: null }
          }
        },
        reporter1: {
          id: 'reporter1', opcode: 'operator_equals',
          topLevel: false, parent: 'if1', next: null,
          fields: {}, inputs: {}
        },
        body1: {
          id: 'body1', opcode: 'motion_movesteps',
          topLevel: false, parent: 'if1', next: null,
          fields: {}, inputs: {}
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Block registration
// ---------------------------------------------------------------------------

describe('Textify block registration', () => {
  let info;
  beforeAll(() => {
    const { extension } = loadExtension('textify-turbowarp.js', {
      globals: makeTextifyGlobals()
    });
    info = extension.getInfo();
  });

  function findBlock(opcode) {
    return info.blocks.find(b => b.opcode === opcode);
  }

  test('getExportedIR is a reporter with correct text', () => {
    const b = findBlock('getExportedIR');
    expect(b).toBeDefined();
    expect(b.blockType).toBe('reporter');
    expect(b.text).toBe('clipboard IR');
  });

  test('copyRulesWithClipboardIR is a command with correct text', () => {
    const b = findBlock('copyRulesWithClipboardIR');
    expect(b).toBeDefined();
    expect(b.blockType).toBe('command');
    expect(b.text).toBe('merge rules with clipboard IR');
  });

  test('textifyClickedBlock is a command with correct text', () => {
    const b = findBlock('textifyClickedBlock');
    expect(b).toBeDefined();
    expect(b.blockType).toBe('command');
    expect(b.text).toBe('Textify clicked block');
  });

  test('copyAllStacksToClipboard is a command with SPRITE argument', () => {
    const b = findBlock('copyAllStacksToClipboard');
    expect(b).toBeDefined();
    expect(b.blockType).toBe('command');
    expect(b.text).toBe('copy all stacks from sprite [SPRITE] to clipboard with rules');
    expect(b.arguments.SPRITE).toBeDefined();
  });

  test('copyAllStacksPlain is a command with SPRITE argument', () => {
    const b = findBlock('copyAllStacksPlain');
    expect(b).toBeDefined();
    expect(b.blockType).toBe('command');
    expect(b.text).toBe('copy all stacks from sprite [SPRITE] without rules');
    expect(b.arguments.SPRITE).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getExportedIR
// ---------------------------------------------------------------------------

describe('getExportedIR', () => {
  test('returns empty string before any export', () => {
    const { extension } = loadExtension('textify-turbowarp.js', {
      globals: makeTextifyGlobals()
    });
    expect(extension.getExportedIR()).toBe('');
  });

  test('returns the last exported IR after copyAllStacksToClipboard', async () => {
    const target = makeScriptTarget();
    const { extension } = loadExtension('textify-turbowarp.js', {
      targets: [target],
      globals: makeTextifyGlobals()
    });
    await extension.copyAllStacksToClipboard({ SPRITE: 'Sprite1' });
    expect(extension.getExportedIR()).toContain('[script');
  });

  test('returns the last exported IR after copyAllStacksPlain', async () => {
    const target = makeScriptTarget();
    const { extension } = loadExtension('textify-turbowarp.js', {
      targets: [target],
      globals: makeTextifyGlobals()
    });
    await extension.copyAllStacksPlain({ SPRITE: 'Sprite1' });
    expect(extension.getExportedIR()).toContain('[script');
  });
});

// ---------------------------------------------------------------------------
// getStackRoot
// ---------------------------------------------------------------------------

describe('getStackRoot', () => {
  let hooks;
  beforeAll(() => {
    const { context } = loadExtension('textify-turbowarp.js', {
      globals: makeTextifyGlobals()
    });
    hooks = context.__textifyTestHooks || context.globalThis.__textifyTestHooks;
  });

  test('returns the block id when the block is topLevel', () => {
    expect(hooks.getStackRoot(makeScriptTarget(), 'hat1')).toBe('hat1');
  });

  test('returns the topLevel root for a block at the end of a next chain', () => {
    expect(hooks.getStackRoot(makeScriptTarget(), 'move1')).toBe('hat1');
  });

  test('returns the topLevel root for a block in a SUBSTACK', () => {
    expect(hooks.getStackRoot(makeControlTarget(), 'body1')).toBe('hat1');
  });

  test('returns the topLevel root through a next link then a SUBSTACK link', () => {
    // if1 is reached from hat1 via next; body1 is reached from if1 via SUBSTACK
    // Walking body1 → if1 (SUBSTACK) → hat1 (next, topLevel) → return 'hat1'
    expect(hooks.getStackRoot(makeControlTarget(), 'body1')).toBe('hat1');
  });

  test('returns null for a reporter block used as an expression input', () => {
    expect(hooks.getStackRoot(makeControlTarget(), 'reporter1')).toBeNull();
  });

  test('returns null for an unknown block id', () => {
    expect(hooks.getStackRoot(makeScriptTarget(), 'nonexistent')).toBeNull();
  });

  test('returns the block id itself for a detached block with no parent', () => {
    const target = {
      sprite: { name: 'Sprite1' },
      getName() { return 'Sprite1'; },
      blocks: {
        _blocks: {
          detached: {
            id: 'detached', opcode: 'motion_movesteps',
            topLevel: false, parent: null, next: null,
            fields: {}, inputs: {}
          }
        }
      }
    };
    expect(hooks.getStackRoot(target, 'detached')).toBe('detached');
  });
});

// ---------------------------------------------------------------------------
// exportAllStacksText
// ---------------------------------------------------------------------------

describe('exportAllStacksText', () => {
  let hooks;
  beforeAll(() => {
    const { context } = loadExtension('textify-turbowarp.js', {
      globals: makeTextifyGlobals()
    });
    hooks = context.__textifyTestHooks || context.globalThis.__textifyTestHooks;
  });

  test('returns empty string for a target with no stacks', () => {
    const empty = {
      sprite: { name: 'Sprite1' },
      getName() { return 'Sprite1'; },
      blocks: { _blocks: {} }
    };
    expect(hooks.exportAllStacksText(empty)).toBe('');
  });

  test('returns a single [script] for a single-stack target', () => {
    const result = hooks.exportAllStacksText(makeScriptTarget());
    expect(result).toContain('[script');
    expect(result).toContain('events_whenflagclicked');
    expect(result.split('\n\n')).toHaveLength(1);
  });

  test('returns two [script] blocks separated by a blank line for a two-stack target', () => {
    const result = hooks.exportAllStacksText(makeMultiStackTarget());
    const parts = result.split('\n\n');
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts[0]).toContain('[script');
    expect(parts[0]).toContain('events_whenflagclicked');
    // second script contains the key-pressed hat
    expect(result).toContain('event_whenkeypressed');
  });

  test('excludes procedure definition blocks', () => {
    const result = hooks.exportAllStacksText(makeProcAndScriptTarget());
    expect(result).not.toContain('procedures_definition');
    expect(result).toContain('events_whenflagclicked');
  });

  test('excludes the stack with the given excludeId', () => {
    const result = hooks.exportAllStacksText(makeMultiStackTarget(), 'hat1');
    expect(result).not.toContain('events_whenflagclicked');
    expect(result).toContain('event_whenkeypressed');
  });

  test('returns empty string when the only stack is excluded', () => {
    const result = hooks.exportAllStacksText(makeScriptTarget(), 'hat1');
    expect(result).toBe('');
  });
});

// ---------------------------------------------------------------------------
// copyAllStacksToClipboard
// ---------------------------------------------------------------------------

describe('copyAllStacksToClipboard', () => {
  test('does not write to clipboard when sprite is not found', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const { extension } = loadExtension('textify-turbowarp.js', {
      globals: makeTextifyGlobals(writeText)
    });
    await extension.copyAllStacksToClipboard({ SPRITE: 'Ghost' });
    expect(writeText).not.toHaveBeenCalled();
  });

  test('writes plain IR to clipboard with no spec header', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const { extension } = loadExtension('textify-turbowarp.js', {
      targets: [makeScriptTarget()],
      globals: makeTextifyGlobals(writeText)
    });
    await extension.copyAllStacksToClipboard({ SPRITE: 'Sprite1' });
    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = writeText.mock.calls[0][0];
    expect(payload).toContain('[script');
    expect(payload).not.toContain(IR_SPEC_HEADER);
  });

  test('updates getExportedIR', async () => {
    const { extension } = loadExtension('textify-turbowarp.js', {
      targets: [makeScriptTarget()],
      globals: makeTextifyGlobals()
    });
    await extension.copyAllStacksToClipboard({ SPRITE: 'Sprite1' });
    const ir = extension.getExportedIR();
    expect(ir).toContain('[script');
    expect(ir).not.toContain(IR_SPEC_HEADER);
  });

  test('updates __TEXTIFY_SHARED__.lastExportText', async () => {
    const { extension, context } = loadExtension('textify-turbowarp.js', {
      targets: [makeScriptTarget()],
      globals: makeTextifyGlobals()
    });
    await extension.copyAllStacksToClipboard({ SPRITE: 'Sprite1' });
    const shared = context.__TEXTIFY_SHARED__ || context.globalThis.__TEXTIFY_SHARED__;
    expect(shared.lastExportText).toContain('[script');
  });

  test('excludes the stack identified by util.thread.topBlock', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const { extension } = loadExtension('textify-turbowarp.js', {
      targets: [makeMultiStackTarget()],
      globals: makeTextifyGlobals(writeText)
    });
    const util = { thread: { topBlock: 'hat1' } };
    await extension.copyAllStacksToClipboard({ SPRITE: 'Sprite1' }, util);
    const payload = writeText.mock.calls[0][0];
    expect(payload).not.toContain('events_whenflagclicked');
    expect(payload).toContain('event_whenkeypressed');
  });
});

// ---------------------------------------------------------------------------
// copyAllStacksPlain
// ---------------------------------------------------------------------------

describe('copyAllStacksPlain', () => {
  test('does not write to clipboard when sprite is not found', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const { extension } = loadExtension('textify-turbowarp.js', {
      globals: makeTextifyGlobals(writeText)
    });
    await extension.copyAllStacksPlain({ SPRITE: 'Ghost' });
    expect(writeText).not.toHaveBeenCalled();
  });

  test('writes raw IR to clipboard with no spec header', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const { extension } = loadExtension('textify-turbowarp.js', {
      targets: [makeScriptTarget()],
      globals: makeTextifyGlobals(writeText)
    });
    await extension.copyAllStacksPlain({ SPRITE: 'Sprite1' });
    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = writeText.mock.calls[0][0];
    expect(payload).toContain('[script');
    expect(payload).not.toContain(IR_SPEC_HEADER);
  });

  test('updates getExportedIR', async () => {
    const { extension } = loadExtension('textify-turbowarp.js', {
      targets: [makeScriptTarget()],
      globals: makeTextifyGlobals()
    });
    await extension.copyAllStacksPlain({ SPRITE: 'Sprite1' });
    expect(extension.getExportedIR()).toContain('[script');
  });

  test('updates __TEXTIFY_SHARED__.lastExportText', async () => {
    const { extension, context } = loadExtension('textify-turbowarp.js', {
      targets: [makeScriptTarget()],
      globals: makeTextifyGlobals()
    });
    await extension.copyAllStacksPlain({ SPRITE: 'Sprite1' });
    const shared = context.__TEXTIFY_SHARED__ || context.globalThis.__TEXTIFY_SHARED__;
    expect(shared.lastExportText).toContain('[script');
  });

  test('excludes the stack identified by util.thread.topBlock', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const { extension } = loadExtension('textify-turbowarp.js', {
      targets: [makeMultiStackTarget()],
      globals: makeTextifyGlobals(writeText)
    });
    const util = { thread: { topBlock: 'hat2' } };
    await extension.copyAllStacksPlain({ SPRITE: 'Sprite1' }, util);
    const payload = writeText.mock.calls[0][0];
    expect(payload).toContain('events_whenflagclicked');
    expect(payload).not.toContain('event_whenkeypressed');
  });
});

// ---------------------------------------------------------------------------
// textifyClickedBlock
// ---------------------------------------------------------------------------

describe('textifyClickedBlock', () => {
  test('resolves without throwing when ScratchBlocks is unavailable', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const { extension } = loadExtension('textify-turbowarp.js', {
      targets: [makeScriptTarget()],
      globals: makeTextifyGlobals(writeText)
    });
    // ScratchBlocks is not in the test context — waitForBlockClick rejects internally
    await expect(extension.textifyClickedBlock()).resolves.toBeUndefined();
    expect(writeText).not.toHaveBeenCalled();
  });
});
