import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  classify,
  hasPieceOffer,
  muteAnnotation,
  muteBrilliantSource,
  isMuteSacrifice,
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
  return { positions: sample.positions, move: sample.move, reviews, policy: 'mute-brilliant-v1' as const };
};

test('five fresh-review examples pass Mute eligibility on both recorded budgets', () => {
  for (const sample of samples.filter((s: any) => s.freshBrilliant))
    for (const run of sample.runs) {
      const result = classify(inputFor(sample, run));
      assert.equal(result.symbol, '!!', sample.name);
      assert.equal(result.version, muteBrilliantSource);
    }
});

test('an apparent knight offer can qualify when EC sees only a 90-point net material change', () => {
  const sample = samples.find((s: any) => s.game === '183990510823' && s.ply === 61);
  assert.equal(hasPieceOffer(...(sample.positions as [string, string])), true);
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
    muteAnnotation(undefined, before, after, color, 'offer', false, move => offers.includes(move));
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

test('the actual worker selects Mute policy and broadens the legacy brilliant prefilter', async () => {
  const original = globalThis.self;
  const results: any[] = [];
  const worker: any = { postMessage: (value: unknown) => results.push(value) };
  (globalThis as any).self = worker;
  try {
    await import('../src/analyse.nosweatWorker');
    const sample = samples.find((s: any) => s.game === '183990510823' && s.ply === 61);
    worker.onmessage({ data: inputFor(sample, sample.runs[1]) });
    assert.equal(results[0].result.symbol, '!!');
    assert.equal(results[0].result.version, muteBrilliantSource);
    worker.onmessage({ data: { material: sample.positions } });
    assert.equal(results[1].result, true);
  } finally {
    (globalThis as any).self = original;
  }
});
