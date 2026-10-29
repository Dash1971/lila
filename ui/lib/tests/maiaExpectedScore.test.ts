import assert from 'node:assert/strict';
import { test } from 'node:test';

import { maiaExpectedScore } from '../src/nosweat/expectedScore';
test('Maia L/D/W value logits produce side-to-move expected score, including half credit for draws', () => {
  assert.ok(Math.abs(maiaExpectedScore([Math.log(0.1), Math.log(0.2), Math.log(0.7)]) - 0.8) < 1e-12);
  assert.equal(maiaExpectedScore([0, 0, 0]), 0.5);
  assert.equal(maiaExpectedScore([1000, 0, 0]), 0);
  assert.equal(maiaExpectedScore([0, 1000, 0]), 0.5);
  assert.equal(maiaExpectedScore([0, 0, 1000]), 1);
  assert.equal(maiaExpectedScore([10000, 10000, 10000]), 0.5);
  for (const invalid of [[], [1, 2], [1, 2, NaN], [Infinity, 0, 0]])
    assert.throws(() => maiaExpectedScore(invalid));
});
