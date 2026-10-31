import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { engineArrows, engineShapes, engineColors } from '../src/noSweatArrows';
import { ClassifierClient } from '../src/noSweatClassifierClient';
import { classify, type ClassificationResult } from '../src/noSweatClassify';
import { after } from '../src/noSweatCore';
import { reviewClick } from '../src/noSweatEvents';
import type { Review } from '../src/noSweatFish';
import { readEnginePreferences } from '../src/noSweatPreferences';
import pgnImport from '../src/pgnImport';
const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const result = (overrides: Partial<ClassificationResult> = {}): ClassificationResult => ({
  symbol: '',
  accuracy: 100,
  cpLoss: 0,
  withheld: false,
  version: 'test',
  ...overrides,
});
describe('Native analysis extensions', () => {
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
  test('two separate Maia channels draw only their top moves at full width', () => {
    const arrows = engineArrows([{ uci: 'e2e4' }, { uci: 'd2d4', width: 12 }], 'c2c4', 'g1f3');
    assert.equal(arrows.length, 4);
    assert.deepEqual(
      arrows.map(a => a.head),
      [
        [engineColors.stockfish],
        [engineColors.stockfishSecond],
        [engineColors.maia],
        [engineColors.maiaSecond],
      ],
    );
    assert.deepEqual(
      arrows.map(a => a.width),
      [25, 12, 25, 25],
    );
    const shapes = engineShapes(arrows, 'white');
    assert.equal(shapes.length, 4);
    assert.ok(shapes.every(s => s.customSvg?.html.includes('nosweat-engine-arrow')));
  });
  test('Mobile Maia agreement fixtures retain the SF shaft and merge Maia heads', () => {
    const sf = [{ uci: 'e2e4' }, { uci: 'd2d4' }];
    const both = engineArrows(sf, 'e2e4', 'e2e4');
    assert.equal(both.length, 2);
    assert.deepEqual(both[0].tail, [engineColors.stockfish]);
    assert.deepEqual(both[0].head, [engineColors.maia, engineColors.maiaSecond]);
    const withoutSf = engineArrows(sf, 'c2c4', 'c2c4');
    assert.deepEqual(withoutSf[2].tail, [engineColors.maia, engineColors.maiaSecond]);
    assert.deepEqual(withoutSf[2].head, withoutSf[2].tail);
    const second = engineArrows(sf, 'd2d4');
    assert.deepEqual(second[1].tail, [engineColors.stockfishSecond]);
    assert.deepEqual(second[1].head, [engineColors.maia]);
    assert.equal(second[1].width, 25);
    assert.equal(engineArrows([{ uci: '(none)' }], undefined, 'bad').length, 0);
    assert.match(engineShapes(both, 'white')[0].customSvg!.html, /rotate\(-90\)/);
    assert.match(engineShapes(both, 'black')[0].customSvg!.html, /rotate\(90\)/);
  });
  test('arrow origins and tips align with native square centers at every orientation and scale', () => {
    // Independent Chessground renderer contract: outer viewBox -3.5 -3.5 8 8;
    // nested custom SVG is 100x100 inside a single square, anchored at its corner.
    const moves = ['e2e4', 'd2d4', 'g1f3', 'b1c3', 'a1h8', 'h8a1', 'a1a8', 'h1a1', 'e7e8q'];
    for (const orientation of ['white', 'black'] as const) {
      for (const size of [256, 480, 768, 1224]) {
        for (const uci of moves) {
          const shape = engineShapes(engineArrows([], uci, uci), orientation)[0];
          const html = shape.customSvg!.html;
          const translation = html.match(/translate\(([-.\d]+),([-.\d]+)\)/);
          const tx = Number(translation?.[1] ?? 0);
          const ty = Number(translation?.[2] ?? 0);
          const angle = (Number(html.match(/rotate\(([-.\d]+)\)/)![1]) * Math.PI) / 180;
          const distance = Number(html.match(/ L([-.\d]+) 0/)![1]);
          const square = (key: string) => {
            const file = key.charCodeAt(0) - 97;
            const rank = Number(key[1]) - 1;
            return orientation === 'white' ? [file, 7 - rank] : [7 - file, rank];
          };
          const from = square(uci.slice(0, 2));
          const to = square(uci.slice(2, 4));
          const pixel = (x: number, y: number) => [
            ((from[0] + x / 100) * size) / 8,
            ((from[1] + y / 100) * size) / 8,
          ];
          const origin = pixel(tx, ty);
          const tip = pixel(tx + Math.cos(angle) * distance, ty + Math.sin(angle) * distance);
          const close = (actual: number[], square: number[]) =>
            actual.forEach((n, axis) =>
              assert.ok(
                Math.abs(n - ((square[axis] + 0.5) * size) / 8) < 1e-8,
                `${uci} ${orientation} ${size}: ${actual} vs ${square}`,
              ),
            );
          close(origin, from);
          close(tip, to);
        }
      }
    }
  });
  test('standard-only analysis rejects variant PGNs while retaining standard FEN positions', () => {
    for (const variant of [
      'Atomic',
      'Chess960',
      'Crazyhouse',
      'Antichess',
      'Three-check',
      'Horde',
      'King of the Hill',
      'Racing Kings',
    ])
      assert.throws(() => pgnImport(`[Variant "${variant}"]\n\n*`, true), /Only standard chess/);
    assert.equal(pgnImport('1. e4 e5 *', true).game!.variant.key, 'standard');
    assert.equal(
      pgnImport('[SetUp "1"]\n[FEN "8/8/8/8/8/2k5/5p2/7K b - - 0 1"]\n\n1... f1=Q# *', true).game!.variant
        .key,
      'standard',
    );
    assert.equal(pgnImport('[Variant "Atomic"]\n\n*').game!.variant.key, 'atomic');
  });
  test('engine settings validate persisted input instead of trusting browser JSON', () => {
    assert.equal(readEnginePreferences('{').selfElo, 1500);
    assert.deepEqual(
      readEnginePreferences(
        JSON.stringify({
          model: '79m',
          selfElo: 2600,
          opponentElo: 600,
          history: false,
          maiaArrows: false,
        }),
      ),
      {
        model: '79m',
        selfElo: 2600,
        opponentElo: 600,
        secondMaiaEnabled: true,
        secondMaiaElo: 2400,
        history: false,
        maiaArrows: false,
        fishArrows: true,
        arrowColors: { ...engineColors },
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
    assert.equal(invalid.selfElo, 1500);
    assert.equal(invalid.history, true);
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

test('custom arrow palettes retain split agreement and native move geometry', () => {
  const colors = { stockfish: '#112233', stockfishSecond: '#445566', maia: '#778899', maiaSecond: '#aabbcc' };
  const arrows = engineArrows([{ uci: 'e2e4' }, { uci: 'd2d4' }], 'e2e4', 'e2e4', colors);
  assert.deepEqual(arrows[0].tail, [colors.stockfish]);
  assert.deepEqual(arrows[0].head, [colors.maia, colors.maiaSecond]);
  assert.deepEqual(arrows[1].head, [colors.stockfishSecond]);
  const shapes = engineShapes(arrows, 'white');
  assert.equal(shapes[0].orig, 'e2');
  assert.equal(shapes[0].dest, 'e4');
  assert.ok(shapes[0].customSvg!.html.includes('#778899'));
  assert.ok(shapes[0].customSvg!.html.includes('#aabbcc'));
});
