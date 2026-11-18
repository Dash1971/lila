import assert from 'node:assert/strict';
import { test } from 'node:test';

import { legalUcis } from '../src/nosweat/core';
import { labEnglish, labText } from '../src/nosweat/maiaLabI18n';
import {
  describeLabPosition,
  labMoves,
  labProbability,
  labQualities,
  type MaiaLabSnapshot,
} from '../src/nosweat/maiaLabModel';
import { ratingSamples } from '../src/nosweat/ratingChart';

const fen = '5rk1/3Q1p2/6p1/P5r1/R1q1n3/7B/7P/5R1K b - - 0 1';
function fixture(): MaiaLabSnapshot {
  const legal = legalUcis(fen);
  return {
    key: 'position-and-model-context',
    fen,
    orientation: 'black',
    model: 'Maia-3 5M',
    history: true,
    rating: 2600,
    busy: false,
    failed: false,
    byRating: new Map(
      ratingSamples.map(rating => [
        rating,
        legal.map(uci => ({
          uci,
          probability:
            uci === 'c4e2'
              ? 0.544
              : uci === 'c4f1'
                ? 0.022
                : uci === 'c4c2'
                  ? 0.144
                  : 0.29 / (legal.length - 3),
        })),
      ]),
    ),
    scores: new Map(
      legal.map(uci => [
        uci,
        {
          depth: 12,
          score: uci === 'c4f1' ? { mate: -2 } : { cp: uci === 'c4c2' ? -568 : uci === 'c4e2' ? -86 : 100 },
        },
      ]),
    ),
  };
}
test('six/eight candidates retain the engine answer, legal moves and raw probabilities', () => {
  const data = fixture();
  for (const count of [6, 8]) {
    const moves = labMoves(data, 2600, count);
    assert.equal(moves.length, count);
    assert.equal(new Set(moves).size, count);
    assert.ok(moves.includes('c4f1'));
    assert.ok(moves.includes('c4e2'));
    assert.ok(moves.every(uci => legalUcis(fen).includes(uci)));
  }
  assert.equal(labProbability(data, 2600, 'c4f1'), 0.022);
  data.byRating.delete(1200);
  assert.equal(labProbability(data, 1200, 'c4f1'), undefined);
  assert.equal(labProbability(data, 2600, 'a1a2'), 0);
});
test('descriptions require every sampled rating, complete legal scores, and depth 12', () => {
  const data = fixture();
  assert.ok(describeLabPosition(data).some(p => p.key === 'LabTreacherous'));
  assert.ok(
    describeLabPosition(data)
      .find(p => p.key === 'LabOverwhelming')
      ?.moves?.includes('c4f1'),
  );
  data.byRating.delete(2600);
  assert.equal(describeLabPosition(data)[0].key, 'LabDescriptionPending');
  const partial = fixture();
  partial.scores.delete('c4f1');
  assert.equal(describeLabPosition(partial)[0].key, 'LabDescriptionPending');
  const shallow = fixture();
  shallow.scores.get('c4f1')!.depth = 10;
  assert.equal(describeLabPosition(shallow)[0].key, 'LabDescriptionPending');
  shallow.failed = true;
  assert.equal(describeLabPosition(shallow)[0].key, 'LabUnavailable');
});
test('upper rating levels change findability; missing samples cannot become zero', () => {
  const data = fixture();
  for (const rating of ratingSamples)
    if (rating >= 1500)
      data.byRating.set(rating, [
        { uci: 'c4f1', probability: 0.95 },
        { uci: 'c4e2', probability: 0.05 },
      ]);
  assert.equal(describeLabPosition(data).at(-1)?.key, 'LabMixed');
  for (const rating of ratingSamples) data.byRating.set(rating, [{ uci: 'c4f1', probability: 1 }]);
  assert.equal(describeLabPosition(data).at(-1)?.key, 'LabIntuitive');
});
test('malformed and illegal scores remain unknown and cannot yield a narrative', () => {
  const data = fixture();
  data.scores.set('a1a2', { depth: 99, score: { cp: -99999 } });
  data.scores.set('c4f1', { depth: 12, score: { mate: NaN } });
  assert.ok(!labQualities(data).has('a1a2'));
  assert.ok(!labQualities(data).has('c4f1'));
  assert.equal(describeLabPosition(data)[0].key, 'LabDescriptionPending');
});
test('terminal positions do not request a move or invent an outcome', () => {
  const data = fixture();
  data.fen = '7k/6Q1/5K2/8/8/8/8/8 b - - 0 1';
  assert.deepEqual(labMoves(data, 2600, 8), []);
  assert.deepEqual(describeLabPosition(data), [{ key: 'LabTerminal' }]);
});
test('catalog formatting supports native functions, argument reordering and escaped text as text', () => {
  const old = globalThis.i18n;
  Object.defineProperty(globalThis, 'i18n', {
    configurable: true,
    value: { site: { muteLabPair: (a: string, b: string) => `${b} / ${a}`, muteLabSelected: '選択：%s' } },
  });
  assert.equal(labText('LabPair', 'Qe2', 'Qc2'), 'Qc2 / Qe2');
  assert.equal(labText('LabSelected', '<img>'), '選択：<img>');
  assert.equal(labText('LabProgress', 5, 21), 'Rating samples: 5 / 21');
  Object.defineProperty(globalThis, 'i18n', { configurable: true, value: old });
  assert.ok(Object.keys(labEnglish).length > 40);
});
