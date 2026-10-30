import assert from 'node:assert/strict';
import { test } from 'node:test';

import { candidateQuality, qualityFromLoss } from '../src/noSweatCandidateQuality';

test('Maia-platform boundaries use five and ten percentage points of SF winrate loss', () => {
  assert.equal(qualityFromLoss(0.05), 'good');
  assert.equal(qualityFromLoss(0.05001), 'ok');
  assert.equal(qualityFromLoss(0.1), 'ok');
  assert.equal(qualityFromLoss(0.10001), 'blunder');
  assert.equal(candidateQuality({ cp: 0 }, { cp: 0 }, true), 'good');
  assert.equal(candidateQuality({ cp: 0 }, { cp: -100 }, true), 'ok');
  assert.equal(candidateQuality({ cp: 0 }, { cp: -500 }, true), 'blunder');
});
test('quality has the same mover perspective for Black and White, with honest missing evidence', () => {
  assert.equal(candidateQuality({ cp: 0 }, { cp: 500 }, false), 'blunder');
  assert.equal(candidateQuality({ cp: 0 }, { cp: -500 }, false), 'good');
  assert.equal(candidateQuality(undefined, { cp: 0 }, true), undefined);
  assert.equal(candidateQuality({ cp: 0 }, undefined, true), undefined);
  assert.equal(candidateQuality({ cp: 0 }, { cp: NaN }, true), undefined);
  assert.equal(candidateQuality({ mate: 2 }, { mate: -2 }, true), 'blunder');
  assert.equal(candidateQuality({ mate: -2 }, { mate: 2 }, false), 'blunder');
  assert.equal(candidateQuality({ mate: 2 }, { mate: 4 }, true), 'good');
});
