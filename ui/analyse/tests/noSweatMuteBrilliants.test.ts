import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  classify,
  hasPieceOffer,
  muteAnnotation,
  muteBrilliantSource,
  legacyMuteBrilliantSource,
  isMuteSacrifice,
  isSacrifice,
  naiveMaterial,
} from '../src/noSweatClassify';
import { after as afterMove } from '../src/noSweatCore';
import type { Review } from '../src/noSweatFish';
import type { Snapshot } from '../src/noSweatSnapshots';

const samples = JSON.parse(
  readFileSync(new URL('./fixtures/noSweat/chesscom-brilliants.json', import.meta.url), 'utf8'),
);
const score = (s: { type: string; value: number }): EvalScore =>
  s.type === 'mate' ? { mate: s.value } : { cp: s.value };
const inputFor = (sample: any, run: any) => {
  const before: Snapshot = {
    depth: 16,
    lines: run.prevMoves.map((line: any) => ({ ...score(line.score.value), moves: line.sanMoves })),
  };
  const after: Snapshot = { depth: 16, lines: [{ ...score(run.next), moves: [] }] };
  const reviews: Review[] = [
    { current: before, previous: before, quality: 'test' },
    { current: after, previous: after, quality: 'test' },
  ];
  return { positions: sample.positions, move: sample.move, reviews, policy: 'mute-brilliant-v4' as const };
};

test('Qf5+ does not sacrifice the optional promotion gain from the previous position', () => {
  const before = '6r1/p1P3pk/1q1B1b1p/3Q4/8/7P/P4PP1/2R3K1 w - - 9 41';
  const after = afterMove(before, 'd5f5');
  assert.equal(naiveMaterial(before), 590, 'the EC root probe includes c8=Q Rxc8 Rxc8');
  assert.equal(naiveMaterial(after), -180, 'White still holds its original +180 material');
  assert.equal(isSacrifice(before, after), true, 'retain the independent EC behavior');
  assert.equal(hasPieceOffer(before, after), false, 'check permits only Kh8 or g6');
  assert.equal(isMuteSacrifice(before, after), false);
  const current: Snapshot = {
    depth: 16,
    lines: [
      { cp: 1560, moves: ['d5f5'] },
      { cp: 1100, moves: ['d5e4'] },
    ],
  };
  const next: Snapshot = { depth: 16, lines: [{ cp: 1560, moves: [] }] };
  const input = {
    positions: [before, after],
    move: 'd5f5',
    policy: 'mute-brilliant-v4' as const,
    reviews: [
      { current, previous: current, quality: 'regression' },
      { current: next, previous: next, quality: 'regression' },
    ],
  };
  const result = classify(input);
  assert.equal(result.provisional, '');
  assert.equal(result.symbol, '', 'do not downgrade the same false sacrifice to Interesting');
  assert.equal(classify({ ...input, policy: 'en-croissant' }).symbol, '!?');

  const black = '2r3k1/p4pp1/7p/8/3q4/1Q1b1B1P/P1p3PK/6R1 b - - 9 41';
  const blackAfter = afterMove(black, 'd4f4');
  assert.equal(isSacrifice(black, blackAfter), true);
  assert.equal(isMuteSacrifice(black, blackAfter), false, 'same rule from Black’s perspective');
});

test('four recorded sacrifices retain eligibility at both budgets; Nd7 is an explicit conservative loss', () => {
  for (const sample of samples.filter((s: any) => s.freshBrilliant && s.game !== '183990510823'))
    for (const run of sample.runs) {
      const result = classify(inputFor(sample, run));
      assert.equal(result.symbol, '!!', sample.name);
      assert.equal(result.version, legacyMuteBrilliantSource);
    }
});

test('Bf5 is defended, while Ndxe5 passes only the preliminary legal-offer test', () => {
  const before = 'r5k1/pp2ppbp/1q4p1/4P3/4Q1b1/P2r4/1P4PP/RNB2R1K b - - 1 17';
  const after = afterMove(before, 'g4f5');
  assert.equal(isSacrifice(before, after), true, 'the capture-only EC probe misses quiet Rd1+');
  assert.equal(hasPieceOffer(before, after), false, 'ordinary recaptures defend the offered pieces');
  assert.equal(isMuteSacrifice(before, after), false);
  assert.equal(
    muteAnnotation(
      undefined,
      {
        depth: 16,
        lines: [
          { cp: -560, moves: ['g4f5'] },
          { cp: -540, moves: ['a8d8'] },
        ],
      },
      { cp: -560 },
      'black',
      'g4f5',
      true,
      () => isMuteSacrifice(before, after),
    ),
    '',
  );
  const mirror = 'rnb2r1k/1p4pp/p2R4/4q1B1/4p3/1Q4P1/PP2PPBP/R5K1 w - - 1 17';
  assert.equal(isMuteSacrifice(mirror, afterMove(mirror, 'g5f4')), false);
  const knight = 'r2r2k1/pp1nppbp/1qn3p1/4P3/5Pb1/P2B1N2/1P4PP/RNB1QR1K b - - 4 14';
  assert.equal(isMuteSacrifice(knight, afterMove(knight, 'd7e5')), true);
});

test('an apparent knight offer without material corroboration no longer receives Brilliant', () => {
  const sample = samples.find((s: any) => s.game === '183990510823' && s.ply === 61);
  assert.equal(hasPieceOffer(...(sample.positions as [string, string])), true);
  for (const run of sample.runs) assert.notEqual(classify(inputFor(sample, run)).symbol, '!!');
  assert.equal(classify({ ...inputFor(sample, sample.runs[1]), policy: 'en-croissant' }).symbol, '');
});

test('legal exchange search excludes ordinary trades, pinned attackers, and captures with greater immediate gain', () => {
  const trade = '3rk3/8/8/8/8/8/8/3RK1B1 w - - 0 1';
  assert.equal(hasPieceOffer(trade, afterMove(trade, 'd1d4')), false, 'equal rook exchange');
  const pinned = '4k3/4n3/1R6/8/8/8/8/K3R3 w - - 0 1';
  assert.equal(hasPieceOffer(pinned, afterMove(pinned, 'b6c6')), false, 'pinned knight cannot capture');
  const gain = '4k3/8/8/8/8/2b5/1N5r/6KR w - - 0 1';
  assert.equal(hasPieceOffer(gain, afterMove(gain, 'h1h2')), false, 'rook gain exceeds offered knight');
});

test('Black, capture/promotion credit, pawn-only offers and terminal positions have explicit material semantics', () => {
  const black = '2rn4/p2qprkp/1p1p2p1/4R1N1/8/2P3P1/PP3PbP/R1BQ2K1 b - - 0 19';
  assert.equal(hasPieceOffer(black, afterMove(black, 'g2b7')), true, 'mirrored Bb2 exchange offer');
  const pawn = '4k3/8/8/8/1p6/P7/8/4K3 w - - 0 1';
  assert.equal(hasPieceOffer(pawn, afterMove(pawn, 'a3a4')), false);
  const promo = '7r/P3k3/8/8/8/8/8/4K3 w - - 0 1';
  assert.equal(hasPieceOffer(promo, afterMove(promo, 'a7a8q')), false, 'promotion is credited');
  const mate = '7k/5Q2/5K2/8/8/8/8/8 w - - 0 1';
  assert.equal(isMuteSacrifice(mate, afterMove(mate, 'f7g7')), false, 'mate is terminal');
});

const snapshot = (best: number, second: number, playedFirst = true): Snapshot => ({
  depth: 16,
  lines: [
    { cp: best, moves: [playedFirst ? 'offer' : 'other'] },
    { cp: second, moves: [playedFirst ? 'other' : 'offer'] },
  ],
});
test('soundness, near-best tolerance and a clearly winning safe alternative gate the award', () => {
  const label = (before: Snapshot, after: EvalScore, offers: string[] = ['offer'], color: Color = 'white') =>
    muteAnnotation(undefined, before, after, color, 'offer', true, move => offers.includes(move));
  assert.equal(label(snapshot(50, 40), { cp: 45 }), '!!');
  assert.equal(label(snapshot(50, 40, false), { cp: 40 }), '!!', 'near-best second choice');
  assert.notEqual(label(snapshot(-150, -160), { cp: -150 }), '!!', 'losing position');
  assert.notEqual(label(snapshot(50, 40), { cp: -50 }), '!!', 'too much score loss');
  assert.notEqual(label(snapshot(800, 600), { cp: 800 }), '!!', 'safe alternative at +6');
  assert.equal(label(snapshot(800, 599), { cp: 800 }), '!!', 'strictly below the routine-win cutoff');
  assert.equal(label(snapshot(800, 700), { cp: 800 }, ['offer', 'other']), '!!', 'two winning sacrifices');
  assert.notEqual(label(snapshot(800, 700), { mate: -2 }), '!!', 'forced loss');
  assert.equal(label(snapshot(-50, -60), { cp: -50 }, ['offer'], 'black'), '!!', 'Black perspective');
  assert.notEqual(label({ depth: 16, lines: [{ cp: 50, moves: ['offer'] }] }, { cp: 50 }), '!!');
});

test('a current award still needs whole-window corroboration, and a contradictory window vetoes it', () => {
  const sample = samples.find((s: any) => s.game === '172016241890');
  const input = inputFor(sample, sample.runs[1]);
  const bare = { ...input, reviews: input.reviews.map(r => ({ ...r, previous: undefined })) };
  assert.equal(classify(bare).withheld, true);
  const contradiction = input.reviews.map(r => ({ ...r, current: { ...r.current, depth: 18 } }));
  contradiction[1].current = { depth: 18, lines: [{ cp: -200, moves: [] }] };
  assert.equal(classify({ ...input, confirmation: contradiction }).withheld, true);
  const wrongQuality = input.reviews.map(r => ({ ...r, quality: 'wrong' }));
  assert.equal(classify({ ...input, confirmation: wrongQuality }).withheld, true);
});

test('the historical Rxd5 gallery label is withheld when the two recorded score windows disagree', () => {
  const sample = samples.find((s: any) => s.game === '119215241095' && s.ply === 37);
  const baseline = inputFor(sample, sample.runs[0]);
  const confirmation = inputFor(sample, sample.runs[1]).reviews;
  const result = classify({ ...baseline, confirmation });
  assert.equal(result.provisional, '!!');
  assert.equal(result.symbol, '');
  assert.equal(result.withheld, true);
});

test('the worker applies the full precision policy after its preliminary legal-offer filter', async () => {
  const original = globalThis.self;
  const results: any[] = [];
  const worker: any = { postMessage: (value: unknown) => results.push(value) };
  (globalThis as any).self = worker;
  try {
    await import('../src/analyse.nosweatWorker');
    const forestSamples = JSON.parse(
      readFileSync(new URL('./fixtures/noSweat/brilliant-v5.json', import.meta.url), 'utf8'),
    ).cases;
    const exchangeSamples = JSON.parse(
      readFileSync(new URL('./fixtures/noSweat/brilliant-v8.json', import.meta.url), 'utf8'),
    ).cases;
    // The worker fixes the active policy itself; a caller cannot select another.
    const awarded = exchangeSamples.find((s: any) => s.expected);
    worker.onmessage({ data: { ...awarded.input, policy: 'en-croissant' } });
    assert.equal(results[0].result.symbol, '!!');
    assert.equal(results[0].result.version, muteBrilliantSource);
    const sample = forestSamples.find((s: any) => s.key === '167741829524:33');
    worker.onmessage({ data: { material: sample.input.positions.slice(-2) } });
    assert.equal(results[1].result, true);
    const rejected = exchangeSamples.find((s: any) => !s.expected && s.score < 0.2);
    worker.onmessage({ data: rejected.input });
    assert.notEqual(results[2].result.symbol, '!!', 'the prefilter cannot bypass the fixed model');
  } finally {
    (globalThis as any).self = original;
  }
});
