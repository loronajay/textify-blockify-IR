const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('TurboWarp Game Factory bundle', () => {
  function loadBundle() {
    const filePath = path.resolve(__dirname, '..', 'turbowarp-game-factory.js');
    const source = fs.readFileSync(filePath, 'utf8');
    const registered = [];
    const Scratch = {
      extensions: {
        unsandboxed: true,
        register(instance) {
          registered.push(instance);
        }
      },
      vm: {
        runtime: {
          targets: [],
          getEditingTarget() {
            return null;
          }
        }
      },
      BlockType: {
        COMMAND: 'command',
        BOOLEAN: 'boolean',
        REPORTER: 'reporter'
      },
      ArgumentType: {
        STRING: 'string',
        NUMBER: 'number'
      }
    };

    const context = vm.createContext({
      Scratch,
      console,
      window: {
        addEventListener() {}
      },
      navigator: {
        getGamepads() {
          return [];
        }
      },
      document: {
        getElementById() {
          return null;
        },
        createElement() {
          return {
            style: {},
            appendChild() {},
            append() {},
            remove() {}
          };
        },
        body: {
          appendChild() {}
        }
      },
      globalThis: {}
    });

    context.globalThis = context;
    new vm.Script(source, { filename: filePath }).runInContext(context);

    return registered;
  }

  test('registers exactly the bundled input and textify extensions', () => {
    const registered = loadBundle();

    expect(registered).toHaveLength(2);
    expect(registered.map(ext => ext.getInfo().id)).toEqual([
      'factoryinput',
      'textifyturbowarp'
    ]);
  });

  test('bundle textify surface is older than standalone textify surface', () => {
    const [ , bundledTextify ] = loadBundle();
    const bundledOpcodes = bundledTextify.getInfo().blocks.map(block => block.opcode);

    expect(bundledOpcodes).toEqual([
      'exportCustomBlock',
      'exportFromEditingTarget'
    ]);
    expect(bundledOpcodes).not.toContain('copyTopLevelStackToClipboard');
    expect(bundledOpcodes).not.toContain('exportTopLevelStack');
  });
});
