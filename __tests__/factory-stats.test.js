const { loadExtension } = require('./helpers/load-extension');

describe('Factory Stats', () => {
  test('sets, changes, clears, and resets stats on project start', () => {
    const { extension, runtime } = loadExtension('factory-stats.js');

    extension.setStat({ STAT: 'HP', TARGET: 'Player', VALUE: 10 });
    extension.changeStat({ STAT: 'HP', TARGET: 'Player', AMOUNT: 5 });

    expect(extension.getStat({ STAT: 'HP', TARGET: 'Player' })).toBe(15);
    expect(extension.hasStat({ STAT: 'HP', TARGET: 'Player' })).toBe(true);
    expect(extension.hasAnyStats({ TARGET: 'Player' })).toBe(true);

    extension.clearStat({ STAT: 'HP', TARGET: 'Player' });

    expect(extension.getStat({ STAT: 'HP', TARGET: 'Player' })).toBe(0);
    expect(extension.hasAnyStats({ TARGET: 'Player' })).toBe(false);

    extension.setStat({ STAT: 'Score', TARGET: 'Player', VALUE: 42 });
    runtime.emit('PROJECT_START');

    expect(extension.getStat({ STAT: 'Score', TARGET: 'Player' })).toBe(0);
  });

  test('getStatElse returns fallback without creating data', () => {
    const { extension } = loadExtension('factory-stats.js');

    expect(
      extension.getStatElse({ STAT: 'HP', TARGET: 'Missing', DEFAULT: 9 })
    ).toBe(9);
    expect(extension.hasAnyStats({ TARGET: 'Missing' })).toBe(false);
  });
});
