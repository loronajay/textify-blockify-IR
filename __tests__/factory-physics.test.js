const { loadExtension } = require('./helpers/load-extension');

describe('Factory Physics', () => {
  function makeTarget(id, name) {
    return {
      id,
      isStage: false,
      isOriginal: true,
      x: 0,
      y: 0,
      sprite: { name },
      getName() {
        return name;
      },
      setXY(x, y) {
        this.x = x;
        this.y = y;
      },
      isTouchingObject() {
        return false;
      }
    };
  }

  test('creates bodies, applies gravity, and updates sprite position through setXY', () => {
    const hero = makeTarget('hero', 'Hero');
    const ground = makeTarget('ground', 'Ground');
    const { extension } = loadExtension('factory-physics.js', {
      targets: [hero, ground]
    });

    extension.createGravityBody({ NAME: 'Hero' });
    extension.setupGravityBody({ NAME: 'Hero', SOLID: 'Ground' });
    extension.setGravity({ NAME: 'Hero', VALUE: -1 });
    extension.setMaxFallSpeed({ NAME: 'Hero', VALUE: 5 });
    extension.setXVelocity({ NAME: 'Hero', VALUE: 2 });

    extension.updateGravityBody({ NAME: 'Hero' });

    expect(extension.doesGravityBodyExist({ NAME: 'Hero' })).toBe(true);
    expect(hero.x).toBe(2);
    expect(hero.y).toBe(-1);
    expect(extension.getYVelocity({ NAME: 'Hero' })).toBe(-1);
    expect(extension.isFalling({ NAME: 'Hero' })).toBe(true);
  });

  test('jump uses grounded state and jump power', () => {
    const hero = makeTarget('hero', 'Hero');
    const ground = makeTarget('ground', 'Ground');
    const { extension } = loadExtension('factory-physics.js', {
      targets: [hero, ground]
    });

    extension.createGravityBody({ NAME: 'Hero' });
    extension.setupGravityBody({ NAME: 'Hero', SOLID: 'Ground' });

    const body = extension._getBody('Hero');
    body.grounded = true;
    body.jumpPower = 7;

    extension.makeJump({ NAME: 'Hero' });

    expect(extension.getYVelocity({ NAME: 'Hero' })).toBe(7);
    expect(extension.isGrounded({ NAME: 'Hero' })).toBe(false);
  });

  test('sprite menus reflect original non-stage targets', () => {
    const hero = makeTarget('hero', 'Hero');
    const enemy = makeTarget('enemy', 'Enemy');
    const stage = {
      id: 'stage',
      isStage: true,
      isOriginal: true,
      getName() {
        return 'Stage';
      }
    };

    const { extension } = loadExtension('factory-physics.js', {
      targets: [stage, hero, enemy]
    });

    expect(extension._getSpriteMenu()).toEqual(['Hero', 'Enemy']);
  });

  test('gravity bodies currently persist across project lifecycle events', () => {
    const hero = makeTarget('hero', 'Hero');
    const ground = makeTarget('ground', 'Ground');
    const { extension, runtime } = loadExtension('factory-physics.js', {
      targets: [hero, ground]
    });

    extension.createGravityBody({ NAME: 'Hero' });

    runtime.emit('PROJECT_START');
    expect(extension.doesGravityBodyExist({ NAME: 'Hero' })).toBe(true);

    runtime.emit('PROJECT_STOP_ALL');
    expect(extension.doesGravityBodyExist({ NAME: 'Hero' })).toBe(true);
  });
});
