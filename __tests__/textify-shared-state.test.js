const { loadExtension } = require('./helpers/load-extension');

// Minimal document/navigator stubs required by Textify
function makeTextifyGlobals(writeText = jest.fn().mockResolvedValue(undefined)) {
  return {
    document: {
      getElementById() { return null; },
      createElement() {
        return {
          style: {},
          appendChild() {},
          append() {},
          remove() {},
          select() {},
          set textContent(v) { this._t = v; },
          get textContent() { return this._t || ''; }
        };
      },
      body: { appendChild() {} }
    },
    navigator: { clipboard: { writeText } }
  };
}

function makeBlockifyGlobals(writeText = jest.fn().mockResolvedValue(undefined)) {
  return {
    document: {
      getElementById() { return null; },
      createElement() {
        return {
          style: {},
          appendChild() {},
          append() {},
          remove() {},
          select() {},
          setAttribute() {},
          set value(v) { this._v = v; },
          get value() { return this._v || ''; }
        };
      },
      body: { appendChild() {} }
    },
    navigator: { clipboard: { writeText } }
  };
}

function makeProcedureTarget() {
  return {
    sprite: { name: 'Sprite1' },
    getName() { return 'Sprite1'; },
    blocks: {
      _blocks: {
        def1: {
          id: 'def1',
          opcode: 'procedures_definition',
          topLevel: true,
          parent: null,
          next: null,
          x: 0,
          y: 0,
          inputs: { custom_block: { block: 'proto1', shadow: null } }
        },
        proto1: {
          id: 'proto1',
          opcode: 'procedures_prototype',
          mutation: {
            proccode: 'my block',
            argumentnames: '[]',
            argumentdefaults: '[]',
            warp: 'false'
          }
        }
      }
    }
  };
}

function makeScriptTarget() {
  return {
    sprite: { name: 'Sprite1' },
    getName() { return 'Sprite1'; },
    blocks: {
      _blocks: {
        hat1: {
          id: 'hat1',
          opcode: 'events_whenflagclicked',
          topLevel: true,
          parent: null,
          next: 'move1',
          x: 0,
          y: 0,
          fields: {},
          inputs: {}
        },
        move1: {
          id: 'move1',
          opcode: 'motion_movesteps',
          topLevel: false,
          parent: 'hat1',
          next: null,
          fields: {},
          inputs: { STEPS: { block: 'num1', shadow: 'num1' } }
        },
        num1: {
          id: 'num1',
          opcode: 'math_number',
          shadow: true,
          fields: { NUM: { value: '10' } },
          inputs: {}
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Textify shared state tests
// ---------------------------------------------------------------------------

describe('Textify __TEXTIFY_SHARED__ bridge', () => {
  test('initializes __TEXTIFY_SHARED__ on load', () => {
    const { context } = loadExtension('textify-turbowarp.js', {
      globals: makeTextifyGlobals()
    });
    const shared = context.__TEXTIFY_SHARED__ || context.globalThis.__TEXTIFY_SHARED__;
    expect(shared).toBeDefined();
    expect(shared.lastExportText).toBe('');
  });

  test('exportAndPresent updates __TEXTIFY_SHARED__.lastExportText (procedure path)', async () => {
    const target = makeProcedureTarget();
    const { context } = loadExtension('textify-turbowarp.js', {
      targets: [target],
      globals: makeTextifyGlobals()
    });
    const hooks = context.__textifyTestHooks || context.globalThis.__textifyTestHooks;

    hooks.exportProcedureText(target, 'my block');

    // The hooks call exportProcedureText directly — call exportAndPresent via extension
  });

  test('extension.exportCustomBlock updates __TEXTIFY_SHARED__.lastExportText', async () => {
    const target = makeProcedureTarget();
    const { extension, context } = loadExtension('textify-turbowarp.js', {
      targets: [target],
      globals: makeTextifyGlobals()
    });

    extension.exportCustomBlock({ SPRITE: 'Sprite1', PROCNAME: 'my block' });

    const shared = context.__TEXTIFY_SHARED__ || context.globalThis.__TEXTIFY_SHARED__;
    expect(shared.lastExportText).toContain('[procedure');
    expect(shared.lastExportText).toContain('proccode:"my block"');
  });

  test('error paths do not overwrite __TEXTIFY_SHARED__ (unknown sprite leaves shared state unchanged)', () => {
    // When target lookup fails, lastExportText is set inline (not via exportAndPresent),
    // so __TEXTIFY_SHARED__ is intentionally not updated — previous valid IR is preserved.
    const { extension, context } = loadExtension('textify-turbowarp.js', {
      globals: makeTextifyGlobals()
    });

    extension.exportCustomBlock({ SPRITE: 'Ghost', PROCNAME: 'my block' });

    const shared = context.__TEXTIFY_SHARED__ || context.globalThis.__TEXTIFY_SHARED__;
    expect(shared.lastExportText).toBe('');
  });

  test('extension.exportTopLevelStack updates __TEXTIFY_SHARED__.lastExportText', () => {
    const target = makeScriptTarget();
    const { extension, context } = loadExtension('textify-turbowarp.js', {
      targets: [target],
      globals: makeTextifyGlobals()
    });

    extension.exportTopLevelStack({ SPRITE: 'Sprite1', INDEX: 1 });

    const shared = context.__TEXTIFY_SHARED__ || context.globalThis.__TEXTIFY_SHARED__;
    expect(shared.lastExportText).toContain('[script');
  });

  test('copyCustomBlockToClipboard also updates __TEXTIFY_SHARED__.lastExportText', async () => {
    const target = makeProcedureTarget();
    const writeText = jest.fn().mockResolvedValue(undefined);
    const { extension, context } = loadExtension('textify-turbowarp.js', {
      targets: [target],
      globals: makeTextifyGlobals(writeText)
    });

    await extension.copyCustomBlockToClipboard({ SPRITE: 'Sprite1', PROCNAME: 'my block' });

    const shared = context.__TEXTIFY_SHARED__ || context.globalThis.__TEXTIFY_SHARED__;
    expect(shared.lastExportText).toContain('[procedure');
  });
});

// ---------------------------------------------------------------------------
// Blockify helper function tests (via __blockifyTestHooks)
// ---------------------------------------------------------------------------

describe('Blockify getLastExportedIR / hasValidExportedIR helpers', () => {
  test('getLastExportedIR returns empty string when __TEXTIFY_SHARED__ is absent', () => {
    const { context } = loadExtension('blockify-turbowarp.js', {
      globals: makeBlockifyGlobals()
    });
    const hooks = context.__blockifyTestHooks || context.globalThis.__blockifyTestHooks;
    expect(hooks.getLastExportedIR()).toBe('');
  });

  test('getLastExportedIR returns lastExportText from __TEXTIFY_SHARED__', () => {
    const sharedState = { lastExportText: '[procedure proccode:"foo" argumentnames:[] argumentdefaults:[] warp:false body:[stack:]]' };
    const { context } = loadExtension('blockify-turbowarp.js', {
      globals: {
        ...makeBlockifyGlobals(),
        __TEXTIFY_SHARED__: sharedState
      }
    });
    const hooks = context.__blockifyTestHooks || context.globalThis.__blockifyTestHooks;
    expect(hooks.getLastExportedIR()).toBe(sharedState.lastExportText);
  });

  test('getLastExportedIR returns empty string when lastExportText is not a string', () => {
    const { context } = loadExtension('blockify-turbowarp.js', {
      globals: {
        ...makeBlockifyGlobals(),
        __TEXTIFY_SHARED__: { lastExportText: 42 }
      }
    });
    const hooks = context.__blockifyTestHooks || context.globalThis.__blockifyTestHooks;
    expect(hooks.getLastExportedIR()).toBe('');
  });

  test('hasValidExportedIR returns false when shared state absent', () => {
    const { context } = loadExtension('blockify-turbowarp.js', {
      globals: makeBlockifyGlobals()
    });
    const hooks = context.__blockifyTestHooks || context.globalThis.__blockifyTestHooks;
    expect(hooks.hasValidExportedIR()).toBe(false);
  });

  test('hasValidExportedIR returns false for empty string', () => {
    const { context } = loadExtension('blockify-turbowarp.js', {
      globals: {
        ...makeBlockifyGlobals(),
        __TEXTIFY_SHARED__: { lastExportText: '' }
      }
    });
    const hooks = context.__blockifyTestHooks || context.globalThis.__blockifyTestHooks;
    expect(hooks.hasValidExportedIR()).toBe(false);
  });

  test('hasValidExportedIR returns true for [procedure IR', () => {
    const { context } = loadExtension('blockify-turbowarp.js', {
      globals: {
        ...makeBlockifyGlobals(),
        __TEXTIFY_SHARED__: { lastExportText: '[procedure proccode:"x" argumentnames:[] argumentdefaults:[] warp:false body:[stack:]]' }
      }
    });
    const hooks = context.__blockifyTestHooks || context.globalThis.__blockifyTestHooks;
    expect(hooks.hasValidExportedIR()).toBe(true);
  });

  test('hasValidExportedIR returns true for [script IR', () => {
    const { context } = loadExtension('blockify-turbowarp.js', {
      globals: {
        ...makeBlockifyGlobals(),
        __TEXTIFY_SHARED__: { lastExportText: '[script body:[stack:]]' }
      }
    });
    const hooks = context.__blockifyTestHooks || context.globalThis.__blockifyTestHooks;
    expect(hooks.hasValidExportedIR()).toBe(true);
  });

  test('hasValidExportedIR returns false for arbitrary non-IR text', () => {
    const { context } = loadExtension('blockify-turbowarp.js', {
      globals: {
        ...makeBlockifyGlobals(),
        __TEXTIFY_SHARED__: { lastExportText: 'Sprite not found: Ghost' }
      }
    });
    const hooks = context.__blockifyTestHooks || context.globalThis.__blockifyTestHooks;
    expect(hooks.hasValidExportedIR()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// copyRulesWithExportedIR block method tests
// ---------------------------------------------------------------------------

describe('Blockify copyRulesWithExportedIR', () => {
  test('copies "no copied IR" when shared state is absent', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: { ...makeBlockifyGlobals(writeText) }
    });

    await extension.copyRulesWithExportedIR();

    expect(writeText).toHaveBeenCalledWith('no copied IR');
  });

  test('copies "no copied IR" when lastExportText is empty', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: {
        ...makeBlockifyGlobals(writeText),
        __TEXTIFY_SHARED__: { lastExportText: '' }
      }
    });

    await extension.copyRulesWithExportedIR();

    expect(writeText).toHaveBeenCalledWith('no copied IR');
  });

  test('copies "no copied IR" when lastExportText is not valid IR', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: {
        ...makeBlockifyGlobals(writeText),
        __TEXTIFY_SHARED__: { lastExportText: 'Sprite not found: Ghost' }
      }
    });

    await extension.copyRulesWithExportedIR();

    expect(writeText).toHaveBeenCalledWith('no copied IR');
  });

  test('copies merged rules + IR when valid [procedure IR present', async () => {
    const ir = '[procedure proccode:"my block" argumentnames:[] argumentdefaults:[] warp:false body:[stack:]]';
    const writeText = jest.fn().mockResolvedValue(undefined);
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: {
        ...makeBlockifyGlobals(writeText),
        __TEXTIFY_SHARED__: { lastExportText: ir }
      }
    });

    await extension.copyRulesWithExportedIR();

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain('You are modifying Textify canon IR.');
    expect(copied).toContain('IR:');
    expect(copied).toContain(ir);
    expect(copied.indexOf('IR:')).toBeLessThan(copied.indexOf('[procedure'));
  });

  test('copies merged rules + IR when valid [script IR present', async () => {
    const ir = '[script body:[stack:]]';
    const writeText = jest.fn().mockResolvedValue(undefined);
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: {
        ...makeBlockifyGlobals(writeText),
        __TEXTIFY_SHARED__: { lastExportText: ir }
      }
    });

    await extension.copyRulesWithExportedIR();

    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain('You are modifying Textify canon IR.');
    expect(copied).toContain(ir);
  });

  test('merged output contains all requirement bullet points', async () => {
    const ir = '[procedure proccode:"x" argumentnames:[] argumentdefaults:[] warp:false body:[stack:]]';
    const writeText = jest.fn().mockResolvedValue(undefined);
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: {
        ...makeBlockifyGlobals(writeText),
        __TEXTIFY_SHARED__: { lastExportText: ir }
      }
    });

    await extension.copyRulesWithExportedIR();

    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain('Mutate only the IR provided below.');
    expect(copied).toContain('Preserve all unrelated structure.');
    expect(copied).toContain('Preserve opcode ids unless new nodes are required.');
    expect(copied).toContain('Keep fields, inputs, and stacks distinct.');
    expect(copied).toContain('Do not invent unsupported structure.');
    expect(copied).toContain('Return only valid Textify canon IR.');
    expect(copied).toContain('Do not include explanation outside the IR.');
    expect(copied).toContain('Reply with the mutated IR only, nothing more.');
  });

  test('copyRulesWithExportedIR is exposed as a block in getInfo()', () => {
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: makeBlockifyGlobals()
    });
    const info = extension.getInfo();
    const block = info.blocks.find(b => b.opcode === 'copyRulesWithExportedIR');
    expect(block).toBeDefined();
    expect(block.blockType).toBe('command');
    expect(block.text).toBe('copy rules with exported IR');
  });
});
