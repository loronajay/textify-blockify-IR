const { loadExtension } = require('./helpers/load-extension');

// Minimal document/navigator stubs required by Textify
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
          select() {},
          set textContent(v) { this._t = v; },
          get textContent() { return this._t || ''; }
        };
      },
      body: { appendChild() {} }
    },
    navigator: { clipboard: { writeText, readText } }
  };
}

function makeBlockifyGlobals(writeText = jest.fn().mockResolvedValue(undefined), readText = jest.fn().mockResolvedValue('')) {
  return {
    document: {
      getElementById() { return null; },
      createElement() {
        return {
          style: {},
          dataset: {},
          appendChild() {},
          append() {},
          remove() {},
          select() {},
          setAttribute() {},
          insertBefore() {},
          set textContent(v) { this._t = v; },
          get textContent() { return this._t || ''; },
          set value(v) { this._v = v; },
          get value() { return this._v || ''; }
        };
      },
      head: { appendChild() {} },
      body: { appendChild() {} }
    },
    navigator: { clipboard: { writeText, readText } }
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
// copyRulesWithClipboardIR block method tests
// ---------------------------------------------------------------------------

describe('Textify copyRulesWithClipboardIR', () => {
  test('copies "no copied IR" when clipboard is empty', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const readText = jest.fn().mockResolvedValue('');
    const { extension } = loadExtension('textify-turbowarp.js', {
      globals: makeTextifyGlobals(writeText, readText)
    });

    await extension.copyRulesWithClipboardIR();

    expect(writeText).toHaveBeenCalledWith('no copied IR');
  });

  test('copies "no copied IR" when clipboard contains non-IR text', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const readText = jest.fn().mockResolvedValue('some random text');
    const { extension } = loadExtension('textify-turbowarp.js', {
      globals: makeTextifyGlobals(writeText, readText)
    });

    await extension.copyRulesWithClipboardIR();

    expect(writeText).toHaveBeenCalledWith('no copied IR');
  });

  test('copies rules + IR when clipboard contains valid [procedure IR', async () => {
    const ir = '[procedure proccode:"my block" argumentnames:[] argumentdefaults:[] warp:false body:[stack:]]';
    const writeText = jest.fn().mockResolvedValue(undefined);
    const readText = jest.fn().mockResolvedValue(ir);
    const { extension } = loadExtension('textify-turbowarp.js', {
      globals: makeTextifyGlobals(writeText, readText)
    });

    await extension.copyRulesWithClipboardIR();

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain('You are modifying Textify canon IR.');
    expect(copied).toContain('IR:');
    expect(copied).toContain(ir);
    expect(copied.indexOf('IR:')).toBeLessThan(copied.indexOf('[procedure'));
  });

  test('copies rules + IR when clipboard contains valid [script IR', async () => {
    const ir = '[script body:[stack:]]';
    const writeText = jest.fn().mockResolvedValue(undefined);
    const readText = jest.fn().mockResolvedValue(ir);
    const { extension } = loadExtension('textify-turbowarp.js', {
      globals: makeTextifyGlobals(writeText, readText)
    });

    await extension.copyRulesWithClipboardIR();

    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain('You are modifying Textify canon IR.');
    expect(copied).toContain(ir);
  });

  test('copyRulesWithClipboardIR is exposed as a command block in getInfo()', () => {
    const { extension } = loadExtension('textify-turbowarp.js', {
      globals: makeTextifyGlobals()
    });
    const info = extension.getInfo();
    const block = info.blocks.find(b => b.opcode === 'copyRulesWithClipboardIR');
    expect(block).toBeDefined();
    expect(block.blockType).toBe('command');
    expect(block.text).toBe('merge rules with clipboard IR');
  });
});

// ---------------------------------------------------------------------------
// readClipboard reporter block tests
// ---------------------------------------------------------------------------

describe('Blockify readClipboard', () => {
  test('returns empty string when clipboard is empty', async () => {
    const readText = jest.fn().mockResolvedValue('');
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: makeBlockifyGlobals(jest.fn().mockResolvedValue(undefined), readText)
    });

    const result = await extension.readClipboard();

    expect(result).toBe('');
  });

  test('returns clipboard text when clipboard has content', async () => {
    const readText = jest.fn().mockResolvedValue('hello from clipboard');
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: makeBlockifyGlobals(jest.fn().mockResolvedValue(undefined), readText)
    });

    const result = await extension.readClipboard();

    expect(result).toBe('hello from clipboard');
  });

  test('readClipboard is exposed as a reporter block in getInfo()', () => {
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: makeBlockifyGlobals()
    });
    const info = extension.getInfo();
    const block = info.blocks.find(b => b.opcode === 'readClipboard');
    expect(block).toBeDefined();
    expect(block.blockType).toBe('reporter');
    expect(block.text).toBe('clipboard contents');
  });
});

// ---------------------------------------------------------------------------
// loadClipboardIR block method tests
// ---------------------------------------------------------------------------

describe('Blockify loadClipboardIR', () => {
  const VALID_IR = '[procedure proccode:"TEST" argumentnames:[] argumentdefaults:[] warp:false body:[stack:]]';

  test('sets irBuffer from clipboard on valid IR', async () => {
    const readText = jest.fn().mockResolvedValue(VALID_IR);
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: makeBlockifyGlobals(jest.fn(), readText)
    });

    await extension.loadClipboardIR();

    expect(extension.irBuffer).toBe(VALID_IR);
  });

  test('sets lastError when clipboard is empty', async () => {
    const readText = jest.fn().mockResolvedValue('');
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: makeBlockifyGlobals(jest.fn(), readText)
    });

    await extension.loadClipboardIR();

    expect(extension.lastError).toBe('Clipboard is empty');
  });

  test('does not overwrite irBuffer when clipboard is empty', async () => {
    const readText = jest.fn().mockResolvedValue('');
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: makeBlockifyGlobals(jest.fn(), readText)
    });
    extension.setIRBuffer({ IR: VALID_IR });

    await extension.loadClipboardIR();

    expect(extension.irBuffer).toBe(VALID_IR);
  });

  test('loadClipboardIR is exposed as a command block in getInfo()', () => {
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: makeBlockifyGlobals()
    });
    const info = extension.getInfo();
    const block = info.blocks.find(b => b.opcode === 'loadClipboardIR');
    expect(block).toBeDefined();
    expect(block.blockType).toBe('command');
    expect(block.text).toBe('Blockify clipboard contents');
  });
});

// ---------------------------------------------------------------------------
// clipboardIRMatchesBuffer block method tests
// ---------------------------------------------------------------------------

describe('Blockify clipboardIRMatchesBuffer', () => {
  const IR_A = '[procedure proccode:"TEST" argumentnames:[] argumentdefaults:[] warp:false body:[stack:]]';
  const IR_B = '[script body:[stack:]]';

  test('returns true when clipboard IR matches irBuffer', async () => {
    const readText = jest.fn().mockResolvedValue(IR_A);
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: makeBlockifyGlobals(jest.fn(), readText)
    });
    extension.setIRBuffer({ IR: IR_A });

    const result = await extension.clipboardIRMatchesBuffer();

    expect(result).toBe(true);
  });

  test('returns false when clipboard IR differs from irBuffer', async () => {
    const readText = jest.fn().mockResolvedValue(IR_B);
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: makeBlockifyGlobals(jest.fn(), readText)
    });
    extension.setIRBuffer({ IR: IR_A });

    const result = await extension.clipboardIRMatchesBuffer();

    expect(result).toBe(false);
  });

  test('returns false when clipboard is empty', async () => {
    const readText = jest.fn().mockResolvedValue('');
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: makeBlockifyGlobals(jest.fn(), readText)
    });
    extension.setIRBuffer({ IR: IR_A });

    const result = await extension.clipboardIRMatchesBuffer();

    expect(result).toBe(false);
  });

  test('does NOT overwrite irBuffer', async () => {
    const readText = jest.fn().mockResolvedValue(IR_B);
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: makeBlockifyGlobals(jest.fn(), readText)
    });
    extension.setIRBuffer({ IR: IR_A });

    await extension.clipboardIRMatchesBuffer();

    expect(extension.irBuffer).toBe(IR_A);
  });

  test('clipboardIRMatchesBuffer is exposed as a boolean block in getInfo()', () => {
    const { extension } = loadExtension('blockify-turbowarp.js', {
      globals: makeBlockifyGlobals()
    });
    const info = extension.getInfo();
    const block = info.blocks.find(b => b.opcode === 'clipboardIRMatchesBuffer');
    expect(block).toBeDefined();
    expect(block.blockType).toBe('boolean');
    expect(block.text).toBe('clipboard IR matches buffer?');
  });
});
