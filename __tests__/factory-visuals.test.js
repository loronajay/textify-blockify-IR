const { loadExtension } = require('./helpers/load-extension');

describe('Factory Visuals', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function makeTarget(id, name) {
    return {
      id,
      isStage: false,
      isOriginal: true,
      visible: true,
      size: 100,
      direction: 90,
      x: 0,
      y: 0,
      effects: {
        ghost: 0,
        brightness: 0
      },
      sprite: { name },
      getName() {
        return name;
      },
      _getRenderedDirectionAndScale() {
        return { direction: this.direction, scale: [1, 1] };
      },
      setVisible(value) {
        this.visible = value;
      },
      setSize(value) {
        this.size = value;
      },
      setEffect(name, value) {
        this.effects[name] = value;
      },
      setDirection(value) {
        this.direction = value;
      },
      setXY(x, y) {
        this.x = x;
        this.y = y;
      },
      emitVisualChange() {}
    };
  }

  test('flips active target and resets on project lifecycle events', () => {
    const hero = makeTarget('hero', 'Hero');
    const { extension, runtime } = loadExtension('factory-visuals.js', {
      targets: [hero]
    });

    extension.flipHorizontally({}, { target: hero });
    extension.flipVertically({}, { target: hero });

    expect(extension.isFlippedHorizontally({}, { target: hero })).toBe(true);
    expect(extension.isFlippedVertically({}, { target: hero })).toBe(true);

    runtime.emit('PROJECT_START');

    expect(extension.isFlippedHorizontally({}, { target: hero })).toBe(false);
    expect(extension.isFlippedVertically({}, { target: hero })).toBe(false);
  });

  test('temporary sprite visibility restores after waiting', async () => {
    const hero = makeTarget('hero', 'Hero');
    const { extension } = loadExtension('factory-visuals.js', {
      targets: [hero]
    });

    const promise = extension.hideSpriteForSecondsAndWait({
      SPRITE: 'Hero',
      SECONDS: 0.5
    });

    expect(extension.isSpriteVisible({ SPRITE: 'Hero' })).toBe(false);

    jest.advanceTimersByTime(500);
    await promise;

    expect(extension.isSpriteVisible({ SPRITE: 'Hero' })).toBe(true);
  });

  test('sprite-targeted flip methods affect the named sprite', () => {
    const hero = makeTarget('hero', 'Hero');
    const enemy = makeTarget('enemy', 'Enemy');
    const { extension } = loadExtension('factory-visuals.js', {
      targets: [hero, enemy]
    });

    extension.setSpriteHorizontalFlip({ SPRITE: 'Enemy', STATE: 'on' });

    expect(extension.isSpriteFlippedHorizontally({ SPRITE: 'Enemy' })).toBe(true);
    expect(extension.isSpriteFlippedHorizontally({ SPRITE: 'Hero' })).toBe(false);
  });

  test('blink effect toggles ghost effect and restores the original ghost value', async () => {
    const hero = makeTarget('hero', 'Hero');
    hero.effects.ghost = 25;
    const { extension } = loadExtension('factory-visuals.js', {
      targets: [hero]
    });

    const promise = extension.playVisualEffectForSecondsAtSpeedAndWait(
      { TYPE: 'blink', SECONDS: 0.3, SPEED: 1 },
      { target: hero }
    );

    expect(extension.currentVisualEffect({}, { target: hero })).toBe('blink');
    expect(hero.visible).toBe(true);
    expect(hero.effects.ghost).toBe(25);

    jest.advanceTimersByTime(100);
    expect(hero.effects.ghost).toBe(100);

    jest.advanceTimersByTime(100);
    expect(hero.effects.ghost).toBe(25);

    jest.advanceTimersByTime(100);
    await promise;

    expect(extension.currentVisualEffect({}, { target: hero })).toBe('none');
    expect(hero.visible).toBe(true);
    expect(hero.effects.ghost).toBe(25);
  });

  test('blink no longer changes sprite visible state when the sprite starts hidden', async () => {
    const hero = makeTarget('hero', 'Hero');
    hero.visible = false;
    hero.effects.ghost = 10;
    const { extension } = loadExtension('factory-visuals.js', {
      targets: [hero]
    });

    const promise = extension.playVisualEffectForSecondsAtSpeedAndWait(
      { TYPE: 'blink', SECONDS: 0.25, SPEED: 1 },
      { target: hero }
    );

    jest.advanceTimersByTime(300);
    await promise;

    expect(hero.visible).toBe(false);
    expect(hero.effects.ghost).toBe(10);
  });

  test('starting a second visual effect stops blink and restores visibility before switching effects', () => {
    const hero = makeTarget('hero', 'Hero');
    const { extension } = loadExtension('factory-visuals.js', {
      targets: [hero]
    });

    extension.playVisualEffectForSecondsAtSpeed(
      { TYPE: 'blink', SECONDS: 1, SPEED: 1 },
      { target: hero }
    );

    jest.advanceTimersByTime(100);
    expect(hero.effects.ghost).toBe(100);
    expect(extension.currentVisualEffect({}, { target: hero })).toBe('blink');

    extension.playVisualEffectForSecondsAtSpeed(
      { TYPE: 'shake', SECONDS: 1, SPEED: 1 },
      { target: hero }
    );

    expect(hero.effects.ghost).toBe(0);
    expect(extension.currentVisualEffect({}, { target: hero })).toBe('shake');
  });

  test('temporary hide during blink no longer shares the same visibility channel', async () => {
    const hero = makeTarget('hero', 'Hero');
    const { extension } = loadExtension('factory-visuals.js', {
      targets: [hero]
    });

    extension.playVisualEffectForSecondsAtSpeed(
      { TYPE: 'blink', SECONDS: 0.5, SPEED: 1 },
      { target: hero }
    );

    jest.advanceTimersByTime(100);
    expect(hero.effects.ghost).toBe(100);

    const hidePromise = extension.hideForSecondsAndWait(
      { SECONDS: 0.3 },
      { target: hero }
    );

    expect(hero.visible).toBe(false);

    jest.advanceTimersByTime(100);
    expect(hero.effects.ghost).toBe(0);

    jest.advanceTimersByTime(300);
    await hidePromise;

    expect(extension.currentVisualEffect({}, { target: hero })).toBe('none');
    expect(hero.visible).toBe(true);
    expect(hero.effects.ghost).toBe(0);
  });

  test('resetVisuals stops blink and restores the original ghost value immediately', () => {
    const hero = makeTarget('hero', 'Hero');
    hero.effects.ghost = 40;
    const { extension } = loadExtension('factory-visuals.js', {
      targets: [hero]
    });

    extension.playVisualEffectForSecondsAtSpeed(
      { TYPE: 'blink', SECONDS: 1, SPEED: 1 },
      { target: hero }
    );

    jest.advanceTimersByTime(100);
    expect(hero.effects.ghost).toBe(100);

    extension.resetVisuals({}, { target: hero });

    expect(extension.currentVisualEffect({}, { target: hero })).toBe('none');
    expect(hero.visible).toBe(true);
    expect(hero.effects.ghost).toBe(40);
  });

  test('project lifecycle cleanup forces previously managed hidden sprites visible', () => {
    const hero = makeTarget('hero', 'Hero');
    const { extension, runtime } = loadExtension('factory-visuals.js', {
      targets: [hero]
    });

    extension.flipHorizontally({}, { target: hero });
    hero.visible = false;

    runtime.emit('PROJECT_STOP_ALL');
    expect(hero.visible).toBe(true);

    hero.visible = false;
    runtime.emit('PROJECT_START');
    expect(hero.visible).toBe(true);
  });
});
