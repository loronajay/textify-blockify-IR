const { loadExtension } = require('./helpers/load-extension');

describe('Factory Text', () => {
  function makeTextGlobals() {
    const ctx = {
      clearRect: jest.fn(),
      fillRect: jest.fn(),
      fillStyle: '#fff'
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => ctx)
    };
    const renderer = {
      createBitmapSkin: jest.fn(() => 1),
      createDrawable: jest.fn(() => 2),
      updateDrawableSkinId: jest.fn(),
      updateDrawablePosition: jest.fn(),
      updateDrawableVisible: jest.fn(),
      setDrawableOrder: jest.fn(),
      updateBitmapSkin: jest.fn()
    };

    return {
      document: {
        createElement: jest.fn(tag => {
          if (tag === 'canvas') return canvas;
          return { style: {} };
        })
      },
      runtimeRenderer: renderer,
      ctx
    };
  }

  test('writes text, updates properties, and clears on stop all', () => {
    const { document, runtimeRenderer } = makeTextGlobals();
    const { extension, runtime } = loadExtension('factory-text.js', {
      globals: {
        document
      }
    });

    runtime.renderer = runtimeRenderer;

    extension.writeText({ ID: 'score', TEXT: 'Score: 0', X: 10, Y: 20 });
    extension.setScale({ ID: 'score', SCALE: 2 });
    extension.setLetterSpacing({ ID: 'score', SPACING: 1 });
    extension.setColor({ ID: 'score', COLOR: '#ff0000' });

    expect(extension.textExists({ ID: 'score' })).toBe(true);
    expect(extension.getTextValue({ ID: 'score' })).toBe('Score: 0');
    expect(extension.getTextX({ ID: 'score' })).toBe(10);
    expect(extension.getTextY({ ID: 'score' })).toBe(20);
    expect(extension.getTextScale({ ID: 'score' })).toBe(2);
    expect(extension.getTextLetterSpacing({ ID: 'score' })).toBe(1);
    expect(extension.getTextColor({ ID: 'score' })).toBe('#ff0000');

    runtime.emit('PROJECT_STOP_ALL');

    expect(extension.textExists({ ID: 'score' })).toBe(false);
  });

  test('alignment, visibility, and width reporters reflect current text state', () => {
    const { document, runtimeRenderer } = makeTextGlobals();
    const { extension, runtime } = loadExtension('factory-text.js', {
      globals: {
        document
      }
    });

    runtime.renderer = runtimeRenderer;

    extension.writeText({ ID: 'label', TEXT: 'AB', X: 0, Y: 0 });
    extension.setAlignment({ ID: 'label', ALIGNMENT: 'center' });
    extension.hideText({ ID: 'label' });

    expect(extension.getTextAlignment({ ID: 'label' })).toBe('center');
    expect(extension.isTextVisible({ ID: 'label' })).toBe(false);
    expect(extension.getTextWidth({ ID: 'label' })).toBeGreaterThan(0);
    expect(extension.getTextHeight({ ID: 'label' })).toBeGreaterThan(0);
  });
});
