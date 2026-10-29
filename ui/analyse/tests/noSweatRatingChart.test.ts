import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chartMoves, chartPath, chartX, chartY, ratingSamples } from '../src/noSweatRatingChart';

test('fixed probability/rating axes cover the complete 600–2600 range', () => {
  assert.equal(ratingSamples.length, 21);
  assert.equal(chartX(600), 48);
  assert.equal(chartX(2600), 348);
  assert.equal(chartY(0), 200);
  assert.equal(chartY(1), 35);
  assert.equal(chartY(0.5), 117.5);
});
test('missing samples break lines and legal zero probabilities remain explicit', () => {
  const values = new Map([
    [600, [{ uci: 'e2e4', probability: 0.5 }]],
    [800, []],
  ]);
  assert.equal(chartPath(values, 'e2e4').trim(), 'M48,117.5  M78,200');
});
test('the three leading moves reflect all sampled ratings', () => {
  const values = new Map([
    [
      600,
      [
        { uci: 'e2e4', probability: 0.6 },
        { uci: 'd2d4', probability: 0.3 },
        { uci: 'a2a3', probability: 0.1 },
      ],
    ],
    [
      2600,
      [
        { uci: 'g1f3', probability: 0.8 },
        { uci: 'd2d4', probability: 0.2 },
      ],
    ],
  ]);
  assert.deepEqual(chartMoves(values), ['g1f3', 'e2e4', 'd2d4']);
});
