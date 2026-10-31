import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { annotation, naiveMaterial, classify, accuracy } from '../src/noSweatClassify';
import {
  encodeHistory,
  policy,
  policyIndex,
  legalUcis,
  after,
  position,
  terminalScore,
} from '../src/noSweatCore';
import type { Review } from '../src/noSweatFish';
import { SearchSnapshots } from '../src/noSweatSnapshots';
const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL('./fixtures/noSweat/' + name, import.meta.url), 'utf8'));
const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
describe('Mute Chess native analysis extensions', () => {
  test('all 3075 independent EC scoring boundary cases are unchanged', () => {
    const data = fixture('annotation-boundaries.json');
    data.contexts.forEach((context: any, i: number) =>
      data.vectors.forEach((v: any[], j: number) => {
        const [pp, prev, next, best, second, played, count] = v;
        const score = (packed: number | string): EvalScore => {
          const value =
            (typeof packed === 'string' ? Number(packed.slice(1)) : packed) *
            (context.color === 'black' ? -1 : 1);
          return typeof packed === 'string' ? { mate: value } : { cp: value };
        };
        const move = context.moves.at(-1);
        const roots = played ? [move, context.alternative] : [context.alternative, move];
        const result = annotation(
          context.moves.length > 1 ? score(pp) : undefined,
          {
            depth: 12,
            lines: [best, second].slice(0, count).map((s, k) => ({ ...score(s), moves: [roots[k]] })),
          },
          score(next),
          context.color,
          move,
          context.sacrifice,
          score(prev),
        );
        assert.equal(result, data.expected[i][j], context.name + ' vector ' + j);
      }),
    );
  });
  test('full legal-root material/capture search matches the independent Rust fixtures', () => {
    const data = fixture('stockfish18-fast.json');
    for (const game of data.runs)
      for (let i = 0; i < game.positions.length; i++)
        assert.equal(
          naiveMaterial(game.positions[i]),
          game.material[i] === -2147483648
            ? position(game.positions[i]).isCheckmate()
              ? -10000
              : 0
            : game.material[i],
          game.name + ' ply ' + i,
        );
  });
  for (const file of [
    'stockfish18-fast.json',
    'stockfish18-balanced-thorough.json',
    'stockfish-light-fast.json',
    'stockfish-light-balanced-thorough.json',
  ]) {
    test(`${file}: every Mobile Maia mode retains exact complete PVs and independent EC labels`, () => {
      for (const game of fixture(file).runs) {
        const reviews = game.positions.map((fen: string, i: number) => {
          const parser = new SearchSnapshots(
            new Set(legalUcis(fen)),
            Math.min(2, legalUcis(fen).length),
            position(fen).turn === 'white',
          );
          game.scores[i].raw.forEach((line: string) => parser.add(line));
          if (parser.completed) {
            assert.deepEqual(
              parser.completed.lines.map(line => [line.cp || 0, line.mate ?? null, line.moves]),
              game.scores[i].lines.map((line: any) => [line.cp, line.mate ?? null, line.moves]),
              `${game.name} ${game.quality} ply ${i}`,
            );
            return parser.completed;
          }
          return { depth: 99, lines: [{ ...terminalScore(fen), moves: [] }] };
        });
        for (let i = 1; i < game.positions.length; i++) {
          const symbol = annotation(
            i > 1 ? reviews[i - 2].lines[0] : undefined,
            reviews[i - 1],
            reviews[i].lines[0],
            position(game.positions[i - 1]).turn,
            game.moves[i - 1],
            !position(game.positions[i]).isEnd() && game.material[i - 1] > -game.material[i] + 100,
          );
          assert.equal(symbol, game.annotations[i - 1], `${game.name} ${game.quality} ply ${i}`);
        }
      }
    });
  }
  test('history tensor bytes match all independent native Maia fixtures', () => {
    for (const f of fixture('maia-5m.json')) {
      const tokens = encodeHistory(f.historyFens, f.history);
      assert.equal(
        createHash('sha256').update(new Uint8Array(tokens.buffer)).digest('hex'),
        f.tokensSha256,
        f.name,
      );
    }
  });
  test('raw policy is normalized only over legal moves, including black orientation and every promotion', () => {
    for (const fen of [
      start,
      after(start, 'e2e4'),
      '4k3/P7/8/8/8/8/8/4K3 w - - 0 1',
      '4k3/8/8/8/8/8/p7/4K3 b - - 0 1',
    ]) {
      const logits = new Float32Array(4352);
      logits.fill(-1000);
      const legal = legalUcis(fen);
      const black = position(fen).turn === 'black';
      for (const uci of legal) logits[policyIndex(uci, black)] = 1;
      const out = policy(fen, logits);
      assert.equal(out.length, legal.length);
      assert.ok(Math.abs(out.reduce((n, c) => n + c.probability, 0) - 1) < 1e-10);
      assert.ok(out.every(c => legal.includes(c.uci)));
    }
    assert.equal(policyIndex('a2b1n', true), 4096 + 7);
    assert.throws(() => policy(start, new Float32Array(5)));
    assert.ok(legalUcis('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1').includes('e1g1'));
    assert.ok(legalUcis('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1').includes('e5d6'));
  });
  test('snapshots reject mixed-depth, bound, duplicate or illegal ranks; reorder is accepted', () => {
    const s = new SearchSnapshots(new Set(['e2e4', 'd2d4']), 2, true);
    const line = (depth: number, rank: number, uci: string, extra = '') =>
      `info depth ${depth} multipv ${rank} score cp 10${extra} pv ${uci}`;
    s.add(line(10, 1, 'e2e4'));
    s.add(line(11, 2, 'd2d4'));
    assert.equal(s.completed, undefined);
    s.add(line(11, 1, 'e2e4'));
    assert.equal(s.completed?.depth, 11);
    s.add(line(12, 1, 'e2e4', ' lowerbound'));
    s.add(line(12, 2, 'd2d4'));
    assert.equal(s.completed?.depth, 11);
    s.add(line(13, 1, 'e2e4'));
    s.add(line(13, 2, 'e2e4'));
    assert.equal(s.completed?.depth, 11);
    s.add(line(14, 1, 'a1a8'));
    s.add(line(14, 2, 'd2d4'));
    assert.equal(s.completed?.depth, 11);
    s.add(line(15, 2, 'd2d4'));
    s.add(line(15, 1, 'e2e4'));
    assert.equal(s.completed?.depth, 15);
    assert.equal(s.previous?.depth, 11);
    const black = new SearchSnapshots(new Set(['e7e5']), 1, false);
    black.add('info depth 8 score mate 2 pv e7e5');
    assert.equal(black.completed?.lines[0].mate, -2);
  });
  test('standout labels need corroboration of the whole decision window', () => {
    const before = {
      depth: 12,
      lines: [
        { cp: 200, moves: ['e2e4'] },
        { cp: -500, moves: ['d2d4'] },
      ],
    };
    const afterScore = { depth: 12, lines: [{ cp: 200, moves: ['e7e5'] }] };
    const reviews: Review[] = [{ current: before }, { current: afterScore }];
    const input = { positions: [start, after(start, 'e2e4')], reviews, move: 'e2e4' };
    assert.equal(classify(input).symbol, '');
    assert.equal(classify(input).withheld, true);
    reviews[0].previous = before;
    reviews[1].previous = { depth: 11, lines: [{ cp: -600, moves: ['e7e5'] }] };
    assert.equal(classify(input).symbol, '');
    reviews[1].previous = afterScore;
    assert.equal(classify(input).symbol, '!');
    assert.equal(accuracy({ mate: 1 }, { mate: 1 }, 'white'), 100);
    assert.deepEqual(terminalScore('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1'), { mate: 1 });
  });
  test('every mode rejects wrong-quality, shallow, contradictory and unstable-predecessor standout evidence', () => {
    for (const depth of [12, 14, 16]) {
      const snapshot = (cp: number, move: string, second?: number) => ({
        depth,
        lines: [{ cp, moves: [move] }, ...(second === undefined ? [] : [{ cp: second, moves: ['d7d5'] }])],
      });
      const prior = snapshot(0, 'e2e4');
      const before = snapshot(-300, 'e7e5', 10);
      const next = snapshot(-300, 'g1f3');
      const quality = String(depth);
      const reviews: Review[] = [
        { current: prior, previous: snapshot(-300, 'e2e4'), quality },
        { current: before, previous: before, quality },
        { current: next, previous: next, quality },
      ];
      const positions = [start, after(start, 'e2e4'), after(after(start, 'e2e4'), 'e7e5')];
      const input = { positions, reviews, move: 'e7e5' };
      assert.equal(classify(input).provisional, '!');
      assert.equal(classify(input).withheld, true, 'Good also depends on the predecessor');
      reviews[0].previous = prior;
      assert.equal(classify(input).symbol, '!');
      reviews[2].quality = 'other';
      assert.equal(classify(input).withheld, true);
      reviews[2].quality = quality;
      const confirmation = reviews.map(r => ({ ...r }));
      confirmation[1] = { ...confirmation[1], current: { ...before, depth: depth - 1 } };
      assert.equal(classify({ ...input, confirmation }).withheld, true);
      confirmation[1] = { ...reviews[1], quality: 'other' };
      assert.equal(classify({ ...input, confirmation }).withheld, true);
      confirmation[1] = reviews[1];
      confirmation[2] = { ...reviews[2], current: snapshot(300, 'g1f3') };
      assert.equal(
        classify({ ...input, confirmation }).withheld,
        true,
        'explicit whole-window counterevidence vetoes iterative stability',
      );
    }
  });
});
