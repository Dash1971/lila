import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import type AnalyseCtrl from '../src/ctrl';
import { legalUcis } from '../src/noSweatCore';
import type { Review, CandidateSearchOptions } from '../src/noSweatFish';

const jobs: { signal: AbortSignal; resolve: (r: Review) => void; options?: CandidateSearchOptions }[] = [];
class FakeFish {
  search(
    _fen: string,
    _moves: string[],
    signal: AbortSignal,
    _depth?: number,
    _time?: number,
    _session?: symbol,
    _multiPv?: number,
    options?: CandidateSearchOptions,
  ) {
    return new Promise<Review>(resolve => jobs.push({ signal, resolve, options }));
  }
  destroy() {}
}
mock.module('../src/noSweatFish.ts', { namedExports: { ReviewFish: FakeFish } });
const { NoSweatAnalysis } = await import('../src/noSweatAnalysis');
const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function chartModel() {
  let hovering: { fen: string; uci: string } | null = null;
  const ctrl = {
    cevalEnabled: () => false,
    ceval: {
      storedPv: () => {},
      hovering: (value?: typeof hovering) => {
        if (value !== undefined) hovering = value;
        return hovering;
      },
    },
    opts: {},
    node: { fen, children: [] },
    nodeList: [{ fen }],
    path: '',
    isCevalAllowed: () => true,
    setAutoShapes: mock.fn(),
    redraw: () => {},
    playUci: mock.fn(),
    threatMode: () => false,
  } as unknown as AnalyseCtrl;
  return { ctrl, model: new NoSweatAnalysis(ctrl) };
}

test('turning analysis off invalidates an in-flight candidate color result', async () => {
  const ctrl = {
    cevalEnabled: () => false,
    ceval: { storedPv: () => {} },
    opts: {},
    node: { fen, children: [] },
    nodeList: [{ fen }],
    path: '',
    isCevalAllowed: () => true,
    setAutoShapes: () => {},
    redraw: () => {},
    threatMode: () => false,
  } as unknown as AnalyseCtrl;
  const model = new NoSweatAnalysis(ctrl);
  await Promise.resolve();
  model.enabled = true;
  model.candidates = [{ uci: 'e2e4', probability: 1 }];
  (model as any).colorCandidates();
  assert.equal(jobs.length, 1);
  model.setEnabled(false);
  assert.equal(jobs[0].signal.aborted, true);
  jobs[0].options?.onUpdate?.({
    current: { depth: 10, lines: legalUcis(fen).map(move => ({ cp: 0, moves: [move] })) },
  });
  jobs[0].resolve({ current: { depth: 12, lines: [{ cp: 0, moves: ['e2e4'] }] } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(model.scores.size, 0);
  assert.equal((model as any).moveQuality('e2e4'), undefined);
  model.release();
});

test('reusing the native sidebar after an import keeps one current Maia panel', async t => {
  const resizeObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe() {}
      disconnect() {}
    },
  });
  t.after(() => {
    if (resizeObserver) Object.defineProperty(globalThis, 'ResizeObserver', resizeObserver);
    else Reflect.deleteProperty(globalThis, 'ResizeObserver');
  });
  const ctrl = {
    cevalEnabled: () => false,
    ceval: { storedPv: () => {} },
    opts: {},
    node: { fen, children: [] },
    nodeList: [{ fen }],
    path: '',
    isCevalAllowed: () => true,
    setAutoShapes: () => {},
    redraw: () => {},
    threatMode: () => false,
  } as unknown as AnalyseCtrl;
  const model = new NoSweatAnalysis(ctrl);
  await Promise.resolve();
  const side = document.createElement('aside');
  const native = document.createElement('div');
  native.textContent = 'Native sidebar';
  side.append(native);
  document.body.append(side);
  model.mountSide(side);
  const panel = side.querySelector('[aria-label="Maia analysis"]');
  assert.ok(panel);
  side.remove();
  document.body.append(side);
  model.selfElo = 1700;
  model.mountSide(side);
  model.redrawSide();
  assert.equal(side.querySelectorAll('[aria-label="Maia analysis"]').length, 1);
  assert.equal(side.querySelector('[aria-label="Maia analysis"]'), panel);
  assert.ok(side.querySelector('[aria-label="Change primary Maia rating, 1700"]'));
  assert.equal(native.parentElement, side);
  model.release();
  side.remove();
});

test('rating sweep matches both Maia inputs without changing card settings or resampling for card opponent changes', async t => {
  const { ctrl, model } = chartModel();
  await Promise.resolve();
  model.enabled = true;
  model.selfElo = 1600;
  model.opponentElo = 2300;
  const inputs: { selfElo: number; opponentElo: number }[] = [];
  t.mock.method(model as any, 'prepare', async () => ({
    predict: async (input: { selfElo: number; opponentElo: number }) => {
      inputs.push({ selfElo: input.selfElo, opponentElo: input.opponentElo });
      return { move_logits: new Float32Array(4352), value_logits: new Float32Array([0, 0, 0]) };
    },
    snapshot: () => ({ phase: 'ready' }),
  }));
  t.mock.method(model as any, 'colorCandidates', () => {});
  model.sampleRatings();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(
    inputs,
    Array.from({ length: 21 }, (_, i) => ({ selfElo: 600 + i * 100, opponentElo: 600 + i * 100 })),
  );
  assert.equal(model.byRating.size, 21);
  assert.equal(model.selfElo, 1600);
  assert.equal(model.opponentElo, 2300);
  model.opponentElo = 2400;
  model.sampleRatings();
  await Promise.resolve();
  assert.equal(inputs.length, 21, 'the matched-rating sweep is independent of the card opponent input');
  const nextFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  ctrl.node = { ...ctrl.node, fen: nextFen };
  ctrl.nodeList = [ctrl.node];
  ctrl.path = 'ab';
  model.positionChanged(true);
  assert.equal(model.byRating.size, 0, 'a different position cannot retain the old chart');
  model.release();
});

test('chart uses its matched sample and native hover without playing or clearing another native hover', async () => {
  const { ctrl, model } = chartModel();
  await Promise.resolve();
  model.enabled = true;
  model.selfElo = 1600;
  model.opponentElo = 2300;
  model.candidates = [{ uci: 'a2a3', probability: 0.9 }];
  const matched = [{ uci: 'e2e4', probability: 0.4 }];
  model.byRating.set(1600, matched);
  model.scores.set('e2e4', { score: { cp: 50 }, depth: 12 });
  const options = (model as any).chartOptions();
  assert.equal(options.primary, matched);
  assert.equal(options.color('e2e4'), '#238b45');
  assert.equal(options.color('a2a3'), 'var(--c-font-dim)');
  options.hover('e2e4');
  assert.deepEqual(ctrl.ceval.hovering(), { fen, uci: 'e2e4' });
  assert.equal((ctrl.playUci as any).mock.callCount(), 0);
  assert.equal(model.selfElo, 1600);
  assert.equal(ctrl.path, '');
  ctrl.ceval.hovering({ fen, uci: 'd2d4' });
  options.hover();
  assert.deepEqual(ctrl.ceval.hovering(), { fen, uci: 'd2d4' }, 'native PV hover keeps its ownership');
  options.hover('e2e4');
  const sameMove = { fen, uci: 'e2e4' };
  ctrl.ceval.hovering(sameMove);
  options.hover();
  assert.equal(ctrl.ceval.hovering(), sameMove, 'a newer native hover owns even the same move');
  options.hover('e2e4');
  model.setEnabled(false);
  assert.equal(ctrl.ceval.hovering(), null, 'disabling analysis clears the chart-owned hover');
  model.release();
});

test('late rating inference is discarded when analysis is disabled', async t => {
  const { model } = chartModel();
  await Promise.resolve();
  model.enabled = true;
  let resolveInference!: (result: { move_logits: Float32Array; value_logits: Float32Array }) => void;
  let started!: () => void;
  const pending = new Promise(resolve => (started = () => resolve(undefined)));
  t.mock.method(model as any, 'prepare', async () => ({
    predict: () => {
      started();
      return new Promise(resolve => (resolveInference = resolve));
    },
    snapshot: () => ({ phase: 'ready' }),
  }));
  t.mock.method(model as any, 'colorCandidates', () => {});
  model.sampleRatings();
  await pending;
  model.setEnabled(false);
  resolveInference({ move_logits: new Float32Array(4352), value_logits: new Float32Array([0, 0, 0]) });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(model.byRating.size, 0);
  assert.equal(model.error, '');
  model.release();
});

test('all legal roots are screened before ranked shading and Others only changes presentation', async t => {
  const { model } = chartModel();
  await Promise.resolve();
  model.enabled = true;
  model.candidates = [
    { uci: 'e2e4', probability: 0.98 },
    { uci: 'a2a3', probability: 0.02 },
  ];
  const legal = legalUcis(fen);
  model.secondaryCandidates = [
    { uci: 'd2d4', probability: 1 },
    ...legal.filter(uci => uci !== 'd2d4').map(uci => ({ uci, probability: 0 })),
  ];
  assert.equal(legal.length, 20);
  const lines = legal.map((uci, i) => ({ cp: uci === 'e2e4' ? 0 : -500 - i * 10, moves: [uci] }));
  const calls: { moves: string[]; depth: number; allRoots: boolean }[] = [];
  t.mock.method(
    model as any,
    'review',
    async (
      _fen: string,
      _gen: number,
      moves: string[],
      _time: number,
      multiPv: number,
      depth: number,
      options: CandidateSearchOptions,
    ) => {
      calls.push({ moves, depth, allRoots: !!options.allRoots });
      if (options.allRoots) {
        options.onUpdate?.({ current: { depth: 1, lines: lines.slice(0, -1) } });
        assert.equal(model.scores.size, 0, 'an incomplete screening cannot publish a partial color pool');
        options.onUpdate?.({ current: { depth: 2, lines } });
        assert.equal(model.scores.size, 20);
      }
      return {
        current: {
          depth,
          lines: moves.length
            ? lines.filter(line => moves.includes(line.moves[0]))
            : options.allRoots
              ? lines
              : lines.slice(0, multiPv),
        },
      };
    },
  );
  (model as any).colorCandidates();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal((model as any).qualityBusy, false);
  assert.deepEqual(calls[0], { moves: [], depth: 10, allRoots: true });
  assert.ok(calls.some(call => call.depth === 18 && !call.moves.length));
  assert.equal(model.scores.size, 20);
  const before = [...(model as any).candidateQualities()];
  const total = calls.length;
  const card = (model as any).maiaCard(true);
  const others = card.children.find((child: any) => child.sel === 'button.nosweat-others');
  others.elm = document.createElement('button');
  others.data.hook.insert(others);
  others.elm.click();
  await Promise.resolve();
  assert.equal(calls.length, total, 'expanding Others does not schedule any engine search');
  assert.deepEqual([...(model as any).candidateQualities()], before);
  model.byRating.set(600, [{ uci: 'b2b3', probability: 1 }]);
  (model as any).colorCandidates();
  await Promise.resolve();
  assert.equal(calls.length, total, 'a chart leader already has the position-wide screened evidence');
  model.release();
});

test('move popup follows Maia White eval, mover winrate and a separate CP-loss baseline', async () => {
  const { model } = chartModel();
  await Promise.resolve();
  model.enabled = true;
  model.scores.set('e2e4', { score: { cp: 25 }, depth: 18 });
  model.scores.set('f1b5', { score: { cp: -337 }, depth: 18 });
  const details = (model as any).moveTooltip('f1b5', 0.125);
  assert.equal(details.stockfishEval, '-3.37');
  assert.equal(details.stockfishEvalLoss, '-3.62');
  assert.equal(details.maiaProbability, 0.125);
  assert.equal(details.color, (model as any).chartOptions().color('f1b5'));
  model.release();
});

test('castling continuations normalize to standard UCI and chart roots follow the current merged ranking', async () => {
  const { ctrl, model } = chartModel();
  await Promise.resolve();
  const currentFen = 'r1bnkb1r/pp2pppp/1n6/4P3/2B5/5N2/PP3PPP/RNB1K2R w KQkq - 0 10';
  ctrl.node = { fen: currentFen, children: [{ uci: 'e1h1' }] } as any;
  assert.deepEqual((model as any).qualityCandidates(), ['e1g1']);
  model.enabled = true;
  (model as any).qualityScreened = true;
  (model as any).qualityRoot = { current: { depth: 18, lines: [{ cp: 0, moves: ['c4b3'] }] } };
  model.scores.set('c4b3', { score: { cp: 0 }, depth: 18 });
  model.scores.set('c4b5', { score: { cp: 10 }, depth: 18 });
  model.scores.set('c4e2', { score: { cp: 20 }, depth: 18 });
  model.scores.set('c4d3', { score: { cp: 30 }, depth: 18 });
  assert.deepEqual((model as any).chartStockfishMoves(), ['c4d3', 'c4e2', 'c4b5']);
  model.release();
});

test('analysis card inference ignores a legacy opponent mismatch for both channels', async t => {
  const { model } = chartModel();
  await Promise.resolve();
  model.enabled = true;
  model.selfElo = 1600;
  model.opponentElo = 600;
  const inputs: [number, number][] = [];
  t.mock.method(model as any, 'prepare', async () => ({
    predict: async (input: { selfElo: number; opponentElo: number }) => {
      inputs.push([input.selfElo, input.opponentElo]);
      return { move_logits: new Float32Array(4352), value_logits: new Float32Array([0, 0, 0]) };
    },
    snapshot: () => ({ phase: 'ready' }),
  }));
  const generation = (model as any).generation;
  await (model as any).predict([fen], 1600, generation);
  await (model as any).predict([fen], 2600, generation);
  assert.deepEqual(inputs, [
    [1600, 1600],
    [2600, 2600],
  ]);
  model.release();
});
