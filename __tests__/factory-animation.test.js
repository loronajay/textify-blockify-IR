const { loadExtension } = require('./helpers/load-extension');

describe('Factory Animation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function makeAnimatedTarget() {
    return {
      id: 'sprite-1',
      isStage: false,
      sprite: {
        costumes: [{}, {}, {}, {}]
      },
      costumeIndex: -1,
      setCostume(index) {
        this.costumeIndex = index;
      }
    };
  }

  test('defines and plays an animation using costume indices', () => {
    const target = makeAnimatedTarget();
    const { extension } = loadExtension('factory-animation.js', {
      targets: [target]
    });

    extension.defineAnimation(
      { NAME: 'idle', START: 1, END: 2, FPS: 10, MODE: 'loop' },
      { target }
    );
    extension.playAnimation({ NAME: 'idle' }, { target });

    expect(extension.animationExists({ NAME: 'idle' }, { target })).toBe(true);
    expect(extension.currentAnimation({}, { target })).toBe('idle');
    expect(extension.animationIsPlaying({}, { target })).toBe(true);
    expect(target.costumeIndex).toBe(0);

    jest.advanceTimersByTime(200);

    expect(extension.currentAnimationFrame({}, { target })).toBeGreaterThanOrEqual(1);
  });

  test('project start resets active playback state', () => {
    const target = makeAnimatedTarget();
    const { extension, runtime } = loadExtension('factory-animation.js', {
      targets: [target]
    });

    extension.defineAnimation(
      { NAME: 'explode', START: 1, END: 2, FPS: 20, MODE: 'once' },
      { target }
    );
    extension.playAnimation({ NAME: 'explode' }, { target });

    expect(extension.currentAnimation({}, { target })).toBe('explode');
    expect(extension.animationIsPlaying({}, { target })).toBe(true);

    runtime.emit('PROJECT_START');

    expect(extension.currentAnimation({}, { target })).toBe('');
    expect(extension.currentAnimationFrame({}, { target })).toBe(0);
    expect(extension.animationIsFinished({}, { target })).toBe(false);
  });

  test('pause and resume preserve current animation state', () => {
    const target = makeAnimatedTarget();
    const { extension } = loadExtension('factory-animation.js', {
      targets: [target]
    });

    extension.defineAnimation(
      { NAME: 'run', START: 1, END: 3, FPS: 12, MODE: 'loop' },
      { target }
    );
    extension.playAnimation({ NAME: 'run' }, { target });
    extension.pauseAnimation({}, { target });

    expect(extension.animationIsPaused({}, { target })).toBe(true);

    extension.resumeAnimation({}, { target });

    expect(extension.animationIsPaused({}, { target })).toBe(false);
    expect(extension.animationIsPlaying({}, { target })).toBe(true);
  });
});
