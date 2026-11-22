import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  evaluateBrilliantExchange,
  exchangeFeatures,
  exchangeModel,
  exchangeScore,
} from '../src/noSweatBrilliantExchange';
import {
  classify,
  muteBrilliantSource,
  selectiveBrilliantSource,
  type ClassificationInput,
} from '../src/noSweatClassify';

interface Case {
  key: string;
  san: string;
  expected: boolean;
  score: number;
  fenPrev: string | null;
  evidence: {
    before: { uci: string; cp: number }[];
    after: { cp: number; reply?: string };
  };
  features: Record<string, number>;
  input: ClassificationInput;
}
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/noSweat/brilliant-v8.json', import.meta.url), 'utf8'),
);
const cases: Case[] = fixture.cases;

test('the installed model is the published artifact and reproduces the reference features and scores', () => {
  assert.equal(
    createHash('sha256')
      .update(readFileSync(new URL('../src/noSweatBrilliantExchangeModel.json', import.meta.url)))
      .digest('hex'),
    fixture.model_sha256,
  );
  assert.equal(exchangeModel.cutoff, fixture.cutoff);
  for (const c of cases) {
    const before = c.input.positions[c.input.positions.length - 2];
    const features = exchangeFeatures(c.fenPrev ?? undefined, before, c.input.move, c.evidence);
    assert.ok(features, `${c.key} ${c.san} is a sacrifice candidate`);
    for (const name of exchangeModel.features)
      assert.ok(
        Math.abs(features[name] - c.features[name]) < 1e-6,
        `${c.key} ${c.san} ${name}: ${features[name]} vs ${c.features[name]}`,
      );
    assert.ok(Math.abs(exchangeScore(features) - c.score) < 1e-9, `${c.key} score`);
  }
});

test('the review window decides Brilliant from one completed window and leaves other judgments alone', () => {
  for (const c of cases) {
    const result = classify(c.input);
    const ec = classify({ ...c.input, policy: 'en-croissant' });
    assert.equal(result.symbol === '!!', c.expected, `${c.key} ${c.san}`);
    assert.equal(result.version, muteBrilliantSource);
    assert.equal(
      result.accuracy,
      ec.accuracy,
      'native score meaning is independent of Brilliant eligibility',
    );
    assert.equal(result.cpLoss, ec.cpLoss);
    if (c.expected) assert.equal(result.withheld, false, 'no second window is required');
    else if (ec.symbol === '??' || ec.symbol === '?' || ec.symbol === '?!')
      assert.equal(result.symbol, ec.symbol, 'ordinary error judgments keep their meaning');
    const reviews = c.input.reviews;
    const decision = evaluateBrilliantExchange(
      c.input.positions,
      reviews[reviews.length - 2].current.lines,
      reviews[reviews.length - 1].current.lines,
      c.input.move,
    );
    assert.equal(decision.brilliant, c.expected);
  }
  assert.ok(cases.filter(c => c.expected).length >= 30 && cases.filter(c => !c.expected).length >= 30);
});

test('the owner examples are recorded honestly', () => {
  const legal = cases.find(c => c.key === 'owner:tjxdTRho:11')!;
  assert.equal(legal.san, 'Ne5');
  assert.equal(classify(legal.input).symbol, '!!', "the Legal's Mate queen offer is now awarded");
  const gift = cases.find(c => c.key === 'owner:bJPg3bse:24')!;
  assert.equal(gift.san, 'Bxh2+');
  assert.notEqual(classify(gift.input).symbol, '!!', 'the Greek Gift remains a disclosed miss');
});

test('moves that leave nothing capturable are never candidates, and bad input cannot award', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const after = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const quiet = evaluateBrilliantExchange(
    [start, after],
    [
      { cp: 30, moves: ['e2e4'] },
      { cp: 25, moves: ['d2d4'] },
    ],
    [{ cp: 30, moves: ['e7e5'] }],
    'e2e4',
  );
  assert.deepEqual(quiet, { candidate: false, score: 0, brilliant: false });
  assert.equal(
    evaluateBrilliantExchange([start, after], [], [{ cp: 0, moves: [] }], 'e2e4').brilliant,
    false,
  );
  const broken = {
    ...cases.find(c => c.expected)!.input,
    positions: ['not a fen', 'still not a fen'],
  };
  assert.throws(() => classify({ ...broken, reviews: broken.reviews.slice(-2) }));
});

test('earlier policies are unchanged', () => {
  const selective = JSON.parse(
    readFileSync(new URL('./fixtures/noSweat/brilliant-v5.json', import.meta.url), 'utf8'),
  ).cases;
  for (const c of selective) {
    const result = classify(c.input);
    assert.equal(result.symbol === '!!', c.expected_forest, `${c.key} ${c.san}`);
    assert.equal(result.version, selectiveBrilliantSource);
  }
});
