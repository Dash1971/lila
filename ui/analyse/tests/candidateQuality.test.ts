import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  candidateQuality,
  qualityFromLoss,
  blunderRanks,
  stockfishWinrate,
} from '../src/noSweatCandidateQuality';

test('Maia-platform boundaries use five and ten percentage points of SF winrate loss', () => {
  assert.equal(qualityFromLoss(0.05), 'good');
  assert.equal(qualityFromLoss(0.05 + 1e-12), 'ok');
  assert.equal(qualityFromLoss(0.05001), 'ok');
  assert.equal(qualityFromLoss(0.1), 'ok');
  assert.equal(qualityFromLoss(0.1 + 1e-12), 'blunder');
  assert.equal(qualityFromLoss(0.10001), 'blunder');
  assert.equal(candidateQuality({ cp: 0 }, { cp: 0 }, true), 'good');
  assert.equal(candidateQuality({ cp: 0 }, { cp: -100 }, true), 'ok');
  assert.equal(candidateQuality({ cp: 0 }, { cp: -500 }, true), 'blunder');
});

test('Maia mate evidence uses empirical CP endpoints, including a losing mate-zero for either mover', () => {
  const winning = stockfishWinrate({ cp: 10000 }, true);
  const losing = stockfishWinrate({ cp: -10000 }, true);
  assert.equal(winning, 0.8518353443061348);
  assert.equal(losing, 0.16874792794783955);
  assert.equal(stockfishWinrate({ mate: 2 }, true), winning);
  assert.equal(stockfishWinrate({ mate: -2 }, false), winning);
  assert.equal(stockfishWinrate({ mate: 0 }, true), losing);
  assert.equal(stockfishWinrate({ mate: 0 }, false), losing);
  assert.equal(stockfishWinrate({ mate: NaN }, true), undefined);
});

test('blunder shades follow Stockfish loss order, cap at five and ignore missing evidence', () => {
  const scores = new Map<string, EvalScore>([
    ['best', { cp: 0 }],
    ['mild', { cp: -500 }],
    ['worse', { cp: -700 }],
    ['worst', { mate: -2 }],
    ['unknown', { cp: NaN }],
  ]);
  assert.deepEqual(
    [...blunderRanks(scores, true)],
    [
      ['mild', 0],
      ['worse', 1],
      ['worst', 2],
    ],
  );
  assert.deepEqual(
    [
      ...blunderRanks(
        new Map(
          [...scores].map(([uci, score]) => [
            uci,
            score.mate !== undefined ? { mate: -score.mate } : { cp: -(score.cp ?? 0) },
          ]),
        ),
        false,
      ),
    ],
    [
      ['mild', 0],
      ['worse', 1],
      ['worst', 2],
    ],
  );
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
