const { loadExtension } = require('./helpers/load-extension');

describe('Factory Controls', () => {
  function makeWindowMock() {
    const handlers = new Map();
    return {
      addEventListener(type, handler) {
        handlers.set(type, handler);
      },
      emit(type, event = {}) {
        const handler = handlers.get(type);
        if (handler) handler(event);
      }
    };
  }

  test('supports keyboard input using the extension control labels', () => {
    const windowMock = makeWindowMock();
    const navigatorMock = {
      getGamepads: jest.fn(() => [])
    };

    const { extension } = loadExtension('factory-controls.js', {
      globals: {
        window: windowMock,
        navigator: navigatorMock
      }
    });
    const crossLabel = extension.getInfo().menus.controls.items[4];

    windowMock.emit('keydown', { code: 'KeyC' });

    expect(extension.pressed({ PLAYER: 'P1', CONTROL: crossLabel })).toBe(true);

    windowMock.emit('keyup', { code: 'KeyC' });

    expect(extension.pressed({ PLAYER: 'P1', CONTROL: crossLabel })).toBe(false);
  });

  test('falls back to keyboard controller type when no gamepad is connected', () => {
    const { extension } = loadExtension('factory-controls.js', {
      globals: {
        window: makeWindowMock(),
        navigator: {
          getGamepads: jest.fn(() => [])
        }
      }
    });

    expect(extension.controllerType({ PLAYER: 'P1' })).toBe('keyboard');
    expect(extension.controllerIs({ PLAYER: 'P1', TYPE: 'keyboard' })).toBe(true);
  });

  test('detects gamepad type and reads gamepad button state', () => {
    const pad = {
      id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
      buttons: [
        { pressed: true },
        { pressed: false },
        { pressed: false },
        { pressed: false }
      ]
    };

    const { extension } = loadExtension('factory-controls.js', {
      globals: {
        window: makeWindowMock(),
        navigator: {
          getGamepads: jest.fn(() => [pad, null])
        }
      }
    });
    const crossLabel = extension.getInfo().menus.controls.items[4];

    expect(extension.pressed({ PLAYER: 'P1', CONTROL: crossLabel })).toBe(true);
    expect(extension.controllerType({ PLAYER: 'P1' })).toBe('xbox');
    expect(extension.controllerIs({ PLAYER: 'P1', TYPE: 'xbox' })).toBe(true);
  });
});
