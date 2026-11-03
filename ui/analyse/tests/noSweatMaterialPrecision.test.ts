import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  classify,
  continuedOfferWhileInCheck,
  convertedMaterialOrEndgame,
  hasMatingAcceptance,
  hasPieceOffer,
  isSacrifice,
  muteAnnotation,
} from '../src/noSweatClassify';
import { after as afterMove, position } from '../src/noSweatCore';
import type { Snapshot } from '../src/noSweatSnapshots';

const knight = 'r2r2k1/pp1nppbp/1qn3p1/4P3/5Pb1/P2B1N2/1P4PP/RNB1QR1K b - - 4 14';
const snapshot = (cp: number): Snapshot => ({
  depth: 16,
  lines: [
    { cp, moves: ['d7e5'] },
    { cp: cp + 1, moves: ['c6e5'] },
  ],
});

test('Ndxe5 is a pawn-winning combination, not a brilliant sacrifice', () => {
  const after = afterMove(knight, 'd7e5');
  assert.equal(hasPieceOffer(knight, after), true, 'the local exchange sees an apparent offer');
  assert.equal(isSacrifice(knight, after), false, 'material is recovered on d3');
  const before = snapshot(-313);
  const next: Snapshot = { depth: 16, lines: [{ cp: -313, moves: [] }] };
  const result = classify({
    positions: [knight, after],
    move: 'd7e5',
    policy: 'mute-brilliant-v4',
    reviews: [
      { current: before, previous: before, quality: 'precision-unit' },
      { current: next, previous: next, quality: 'precision-unit' },
    ],
  });
  assert.notEqual(result.symbol, '!!');
  assert.notEqual(result.symbol, '!?');
});

test('material corroboration has a narrow winning-mate exception', () => {
  const before: Snapshot = {
    depth: 16,
    lines: [
      { cp: 50, moves: ['offer'] },
      { cp: 40, moves: ['other'] },
    ],
  };
  const label = (after: EvalScore, color: Color = 'white', ec = false, offered = true) =>
    muteAnnotation(undefined, before, after, color, 'offer', ec, move => offered && move === 'offer');
  assert.notEqual(label({ cp: 50 }), '!!', 'a legal offer alone is insufficient');
  assert.notEqual(label({ cp: 1000 }), '!!', 'a large finite score is not a mate proof');
  assert.notEqual(label({ mate: 0 }), '!!');
  assert.notEqual(label({ mate: -3 }), '!!');
  assert.equal(label({ mate: 3 }), '!!');
  assert.equal(label({ mate: -3 }, 'black'), '!!');
  assert.notEqual(label({ mate: 3 }, 'black'), '!!');
  assert.notEqual(label({ mate: 3 }, 'white', false, false), '!!', 'a mate still needs a legal offer');
  assert.equal(label({ cp: 50 }, 'white', true), '!!', 'a corroborated material offer still qualifies');
});

test('winning mate retains the raw legal-offer safe-alternative veto', () => {
  const before: Snapshot = {
    depth: 16,
    lines: [
      { mate: 3, moves: ['offer'] },
      { cp: 600, moves: ['other'] },
    ],
  };
  const label = (otherOffers: boolean) =>
    muteAnnotation(
      undefined,
      before,
      { mate: 3 },
      'white',
      'offer',
      false,
      move => move === 'offer' || otherOffers,
    );
  assert.notEqual(label(false), '!!', 'a safe +600 alternative still vetoes a mating offer');
  assert.equal(label(true), '!!', 'an alternative raw piece offer does not veto it');
});

test('a mate-only exception must agree across the whole decision window', () => {
  const after = afterMove(knight, 'd7e5');
  const before = snapshot(-313);
  const result = classify({
    positions: [knight, after],
    move: 'd7e5',
    policy: 'mute-brilliant-v4',
    reviews: [
      { current: before, previous: before, quality: 'precision-unit' },
      {
        current: { depth: 16, lines: [{ mate: -3, moves: [] }] },
        previous: { depth: 15, lines: [{ cp: -313, moves: [] }] },
        quality: 'precision-unit',
      },
    ],
  });
  assert.equal(result.provisional, '!!');
  assert.equal(result.symbol, '');
  assert.equal(result.withheld, true);
});

test('recorded capture, quiet-offer and mating cases replay their real completed windows', () => {
  const recorded = JSON.parse(
    readFileSync(new URL('./fixtures/noSweat/material-precision.json', import.meta.url), 'utf8'),
  );
  for (const sample of recorded.cases) {
    const result = classify({ ...sample, policy: 'mute-brilliant-v4' });
    assert.equal(result.symbol === '!!', sample.expected_brilliant, sample.game + ' ' + sample.san);
  }
});

test('the extra guard does not add material searches or change score metrics', () => {
  const after = afterMove(knight, 'd7e5');
  const before = snapshot(-313);
  const next: Snapshot = { depth: 16, lines: [{ cp: -313, moves: [] }] };
  const input = {
    positions: [knight, after],
    move: 'd7e5',
    reviews: [
      { current: before, previous: before, quality: 'precision-unit' },
      { current: next, previous: next, quality: 'precision-unit' },
    ],
  };
  const calls: string[] = [];
  const result = classify({ ...input, policy: 'mute-brilliant-v4' }, fen => {
    calls.push(fen);
    return 0;
  });
  assert.deepEqual(calls, [knight, after]);
  const ec = classify({ ...input, policy: 'en-croissant' }, () => 0);
  assert.equal(result.accuracy, ec.accuracy);
  assert.equal(result.cpLoss, ec.cpLoss);
});

const v4 = JSON.parse(readFileSync(new URL('./fixtures/noSweat/brilliant-v4.json', import.meta.url), 'utf8'));
const v4Case = (name: string) => v4.cases.find((sample: any) => sample.name === name);

test('v4 permits multiple middlegame winning options but protects converted material and endgames', () => {
  const middle = v4Case('middlegame-winning-options');
  assert.equal(convertedMaterialOrEndgame(middle.positions.at(-2)), false);
  assert.equal(classify({ ...middle, policy: 'mute-brilliant-v4' }).symbol, '!!');
  for (const name of ['converted-endgame-counterexample', 'converted-middlegame-counterexample']) {
    const sample = v4Case(name);
    assert.equal(convertedMaterialOrEndgame(sample.positions.at(-2)), true, name);
    assert.notEqual(classify({ ...sample, policy: 'mute-brilliant-v4' }).symbol, '!!', name);
  }
  const queens = '3qk3/8/8/8/8/8/8/3QK3 w - - 0 1';
  assert.equal(convertedMaterialOrEndgame(queens), true, 'equal-material queen ending has phase8');
  assert.equal(
    convertedMaterialOrEndgame('3qk2n/8/8/8/8/8/8/3QK3 w - - 0 1'),
    false,
    'phase9 with a material deficit does not trigger converted context',
  );
});

test('mating acceptance is a literal legal reply proof and works from both colors', () => {
  const sample = v4Case('literal-mating-acceptance');
  const before = sample.positions.at(-2);
  const after = sample.positions.at(-1);
  assert.equal(isSacrifice(before, after), false, 'this offer needs the new board witness');
  assert.equal(hasMatingAcceptance(before, after), true);
  const accepted = afterMove(after, 'g4d1');
  assert.equal(position(afterMove(accepted, 'c4f7')).isCheckmate(), true, 'Bxd1 Bxf7#');
  assert.equal(
    hasMatingAcceptance(v4.mirrored_mating_acceptance.before, v4.mirrored_mating_acceptance.after),
    true,
    'same legal witness for Black',
  );
  assert.equal(classify({ ...sample, policy: 'mute-brilliant-v4' }).symbol, '!!');
});

test('mating-acceptance evidence never replaces score quality or whole-window confirmation', () => {
  const sample = v4Case('literal-mating-acceptance');
  const missing = sample.reviews.map((review: any) => ({ ...review, previous: undefined }));
  const withheld = classify({ ...sample, reviews: missing, policy: 'mute-brilliant-v4' });
  assert.equal(withheld.provisional, '!!');
  assert.equal(withheld.withheld, true);
  const losing = sample.reviews.map((review: any) => ({ ...review }));
  losing[losing.length - 1] = {
    current: { depth: 18, lines: [{ cp: -500, moves: [] }] },
    previous: { depth: 17, lines: [{ cp: -500, moves: [] }] },
    quality: losing[0].quality,
  };
  assert.notEqual(classify({ ...sample, reviews: losing, policy: 'mute-brilliant-v4' }).symbol, '!!');
});

test('promotion credit and ordinary captures cannot manufacture a mating sacrifice', () => {
  const before = '7r/P3k3/8/8/8/8/8/4K3 w - - 0 1';
  for (const promotion of ['q', 'r', 'b', 'n']) {
    const after = afterMove(before, 'a7a8' + promotion);
    assert.equal(hasPieceOffer(before, after), false, promotion);
    assert.equal(hasMatingAcceptance(before, after), false, promotion);
  }
  assert.equal(hasMatingAcceptance(knight, afterMove(knight, 'd7e5')), false, 'Ndxe5 recoups material');
});

test('the checked-continuation veto requires complete history and a proven unchanged offer', () => {
  const sample = v4Case('checked-continuation');
  const [previous, before, after] = sample.positions;
  assert.equal(position(before).isCheck(), true);
  assert.equal(continuedOfferWhileInCheck(previous, before, after, sample.move), true);
  assert.equal(continuedOfferWhileInCheck(undefined, before, after, sample.move), false);
  assert.notEqual(classify({ ...sample, policy: 'mute-brilliant-v4' }).symbol, '!!');
  const fresh = v4Case('middlegame-winning-options');
  assert.equal(
    continuedOfferWhileInCheck(...(fresh.positions as [string, string, string]), fresh.move),
    false,
    'an unrelated completed history does not create a continuation veto',
  );
});

test('v4 recorded whole windows preserve known disagreements instead of banning positions', () => {
  for (const sample of v4.cases) {
    const result = classify({ ...sample, policy: 'mute-brilliant-v4' });
    assert.equal(result.symbol === '!!', sample.expected_brilliant, sample.name);
    const ec = classify({ ...sample, policy: 'en-croissant' });
    assert.equal(result.accuracy, ec.accuracy, sample.name);
    assert.equal(result.cpLoss, ec.cpLoss, sample.name);
  }
});
