import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { gameAccuracy, moveAccuracy, whiteWinPercent } from '../src/noSweatAccuracy';
import { maiaShapes, primaryArrowWidth } from '../src/noSweatArrows';
import { ClassifierClient } from '../src/noSweatClassifierClient';
import { classify, type ClassificationResult } from '../src/noSweatClassify';
import { after } from '../src/noSweatCore';
import type { Review } from '../src/noSweatFish';
import { GameReview, gameReviewKey, reviewQualities, type ReviewNode } from '../src/noSweatGameReview';
import { readEnginePreferences } from '../src/noSweatPreferences';
import { reviewClick } from '../src/noSweatReviewView';
const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const line = (): ReviewNode[] => {
  const nodes: ReviewNode[] = [{ fen: start, path: '' }];
  for (const [i, uci] of ['e2e4', 'e7e5', 'g1f3', 'b8c6'].entries())
    nodes.push({ fen: after(nodes.at(-1)!.fen, uci), uci, path: 'x'.repeat(i + 1) });
  return nodes;
};
const result = (overrides: Partial<ClassificationResult> = {}): ClassificationResult => ({
  symbol: '',
  accuracy: 100,
  cpLoss: 0,
  withheld: false,
  version: 'test',
  ...overrides,
});
const review = (depth = 12): Review => ({
  current: {
    depth,
    lines: [
      { cp: 20, moves: ['e2e4'] },
      { cp: 0, moves: ['d2d4'] },
    ],
  },
  previous: {
    depth: depth - 1,
    lines: [
      { cp: 20, moves: ['e2e4'] },
      { cp: 0, moves: ['d2d4'] },
    ],
  },
});
const near = (actual: number | null, expected: number) =>
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
describe('Mobile Maia whole-game review', () => {
  test('review controls replace stale start, stop and navigation actions on redraw', () => {
    let action = '';
    const element = { onclick: undefined as (() => void) | undefined };
    const vnode = { elm: element } as unknown as Parameters<
      NonNullable<ReturnType<typeof reviewClick>['insert']>
    >[0];
    reviewClick(() => {
      action = 'start';
    }).insert!(vnode);
    element.onclick!();
    assert.equal(action, 'start');
    reviewClick(() => {
      action = 'stop';
    }).update!(vnode, vnode);
    element.onclick!();
    assert.equal(action, 'stop');
    reviewClick(() => {
      action = 'g4';
    }).update!(vnode, vnode);
    element.onclick!();
    assert.equal(action, 'g4');
  });
  test('accuracy matches independent Mobile Maia numeric references, including volatility windows and mates', () => {
    const samples = [20, -40, -10, -180, -120, -260, -220, -500, -450].map(cp => ({ cp }));
    const score = gameAccuracy(samples);
    near(score.white, 56.109833517752875);
    near(score.black, 86.48031060445908);
    const long = gameAccuracy(Array.from({ length: 61 }, (_, i) => ({ cp: -300 + i * 10 })));
    near(long.white, 100);
    near(long.black, 97.2948770298707);
    const mate = gameAccuracy([3, 2, 1, -1, -2].map(mate => ({ mate })));
    near(mate.white, 2);
    near(mate.black, 100);
    const mobile = gameAccuracy([0, 0, 300, 300].map(cp => ({ cp })));
    near(mobile.white, 100);
    near(mobile.black, 32.39810425271999);
    assert.equal(moveAccuracy(50, 50), 100);
    assert.equal(moveAccuracy(40, 60), 100);
    assert.deepEqual(gameAccuracy([]), { white: null, black: null });
    assert.equal(gameAccuracy([{ cp: 0 }, { cp: -10 }], false).white, null);
    near(gameAccuracy([{ cp: 0 }, { cp: -10 }], false).black, 100);
    assert.throws(() => whiteWinPercent({}), /Missing/);
  });
  test('Maia arrows have the primary SF width even for very unlikely moves', () => {
    const shapes = maiaShapes([
      { uci: 'e2e4', probability: 0.99 },
      { uci: 'd2d4', probability: 0.009 },
      { uci: 'g1f3', probability: 0.001 },
    ]);
    assert.equal(primaryArrowWidth, 15);
    assert.deepEqual(
      shapes.map(s => s.modifiers?.lineWidth),
      [15, 15, 15],
    );
  });
  test('engine settings validate persisted input instead of trusting browser JSON', () => {
    assert.equal(readEnginePreferences('{').selfElo, 1500);
    assert.deepEqual(
      readEnginePreferences(
        JSON.stringify({
          model: '79m',
          quality: 'thorough',
          selfElo: 2600,
          opponentElo: 600,
          history: false,
          maiaArrows: false,
        }),
      ),
      {
        model: '79m',
        quality: 'thorough',
        selfElo: 2600,
        opponentElo: 600,
        history: false,
        maiaArrows: false,
        fishArrows: true,
      },
    );
    const invalid = readEnginePreferences(
      JSON.stringify({
        model: 'remote',
        quality: 'unbounded',
        selfElo: 999999,
        opponentElo: '1500',
        history: 'false',
      }),
    );
    assert.equal(invalid.model, '5m');
    assert.equal(invalid.quality, 'fast');
    assert.equal(invalid.selfElo, 1500);
    assert.equal(invalid.history, true);
  });
  test('evaluates every position, publishes whole-game accuracy, then classifies every move', async () => {
    const nodes = line();
    const calls: string[] = [];
    const phases: string[] = [];
    const runner = new GameReview({
      search: async (fen, _signal, depth, time) => {
        assert.equal(depth, 12);
        assert.equal(time, 500);
        calls.push(fen);
        return review();
      },
      classify: async input => {
        assert.ok(runner.report?.accuracy);
        assert.equal(input.reviews.length, input.positions.length);
        return result();
      },
      changed: () => {
        if (runner?.report) phases.push(runner.report.state);
      },
    });
    await runner.start(nodes, 'fast');
    assert.deepEqual(
      calls,
      nodes.map(n => n.fen),
    );
    assert.equal(runner.report?.state, 'complete');
    assert.equal(runner.report?.moves.length, 4);
    assert.ok(phases.includes('classifying'));
    assert.equal(runner.running, false);
    const original = runner.report;
    runner.observe(
      nodes.map(n => ({ ...n })),
      'fast',
    );
    assert.equal(runner.report, original);
    // Browsing to another path does not change the immutable game key.
    assert.equal(gameReviewKey(nodes, 'fast'), gameReviewKey(nodes, 'fast'));
    assert.notEqual(gameReviewKey(nodes, 'balanced'), gameReviewKey(nodes, 'fast'));
  });
  test('stop and a changed PGN prevent late searches from publishing stale results; resume reuses completed work', async () => {
    const nodes = line();
    let resolve!: (r: Review) => void;
    let first = true;
    const runner = new GameReview({
      search: async () => {
        if (first) {
          first = false;
          return new Promise<Review>(r => (resolve = r));
        }
        return review();
      },
      classify: async () => result(),
      changed: () => {},
    });
    const pending = runner.start(nodes, 'fast');
    runner.stop();
    resolve(review());
    await pending;
    assert.equal(runner.report?.state, 'stopped');
    assert.equal(runner.report?.reviews.length, 0);
    await runner.start(nodes, 'fast');
    assert.equal(runner.report?.state, 'complete');
    runner.observe(nodes.slice(0, 2), 'fast');
    assert.equal(runner.report, undefined);
    assert.equal(runner.running, false);
  });
  test('an unfinished evaluation is never counted as a full-game accuracy score', async () => {
    let count = 0;
    const runner = new GameReview({
      search: async () => {
        if (++count === 3) throw new Error('engine unavailable');
        return review();
      },
      classify: async () => result(),
      changed: () => {},
    });
    await runner.start(line(), 'balanced');
    assert.equal(runner.report?.state, 'failed');
    assert.equal(runner.report?.accuracy, undefined);
    assert.equal(runner.report?.reviews.length, 2);
  });
  test('classification failures retain accuracy and explicitly mark the affected moves unavailable', async () => {
    const runner = new GameReview({
      search: async () => review(),
      classify: async () => {
        throw new Error('worker stopped');
      },
      changed: () => {},
    });
    await runner.start(line(), 'thorough');
    assert.equal(runner.report?.state, 'complete');
    assert.ok(runner.report?.accuracy);
    assert.deepEqual(runner.report?.unavailable, [1, 2, 3, 4]);
  });
  test('standout confirmation has a six-search budget and leaves baseline graph scores unchanged', async () => {
    let confirmations = 0;
    const runner = new GameReview({
      search: async (_fen, _signal, depth, time) => {
        assert.equal(time, 500);
        if (depth === 14) confirmations++;
        return review(depth);
      },
      classify: async input =>
        input.confirmation ? result({ symbol: '!!' }) : result({ withheld: true, provisional: '!!' }),
      changed: () => {},
    });
    await runner.start(line(), 'fast');
    assert.ok(confirmations <= 6);
    assert.ok(confirmations > 0);
    assert.ok(runner.report?.reviews.every(r => r.current.depth === 12));
    assert.equal(runner.report?.state, 'complete');
    assert.deepEqual(reviewQualities, {
      fast: { name: 'Fast', depth: 12, time: 500 },
      balanced: { name: 'Balanced', depth: 14, time: 1000 },
      thorough: { name: 'Thorough', depth: 16, time: 1500 },
    });
  });
  test('explicit whole-window confirmation can veto an apparently stable standout', () => {
    const before = {
      depth: 12,
      lines: [
        { cp: 200, moves: ['e2e4'] },
        { cp: -500, moves: ['d2d4'] },
      ],
    };
    const next = { depth: 12, lines: [{ cp: 200, moves: ['e7e5'] }] };
    const reviews: Review[] = [
      { current: before, previous: before, quality: 'fast' },
      { current: next, previous: next, quality: 'fast' },
    ];
    const base = { positions: [start, after(start, 'e2e4')], reviews, move: 'e2e4' };
    assert.equal(classify(base).symbol, '!');
    assert.equal(
      classify({
        ...base,
        confirmation: [
          reviews[0],
          { ...reviews[1], current: { depth: 14, lines: [{ cp: -600, moves: ['e7e5'] }] } },
        ],
      }).symbol,
      '',
    );
    assert.equal(
      classify({ ...base, confirmation: reviews.map(r => ({ ...r, quality: 'thorough' })) }).withheld,
      true,
    );
  });
  test('classifier ownership rejects cancellation and isolates a stale worker from the next job', async () => {
    class FakeWorker {
      onmessage: any;
      onerror: any;
      terminated = false;
      postMessage() {}
      terminate() {
        this.terminated = true;
      }
    }
    const workers: FakeWorker[] = [];
    const client = new ClassifierClient(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w as unknown as Worker;
    });
    const signal = new AbortController();
    const first = client
      .classify({ positions: [], reviews: [], move: '' }, signal.signal)
      .catch(e => e.message);
    const stale = workers[0].onmessage;
    signal.abort();
    assert.equal(await first, 'Cancelled');
    assert.equal(workers[0].terminated, true);
    const second = client.classify({ positions: [], reviews: [], move: '' }, new AbortController().signal);
    stale({ data: { result: result({ symbol: '??' }) } });
    workers[1].onmessage({ data: { result: result({ symbol: '!' }) } });
    assert.equal((await second).symbol, '!');
    const third = client.classify({ positions: [], reviews: [], move: '' }, new AbortController().signal);
    workers[1].onmessage({ data: { result: result() } });
    await third;
    assert.equal(workers.length, 2);
    client.release();
  });
});
