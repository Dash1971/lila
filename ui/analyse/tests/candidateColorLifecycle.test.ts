import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import type AnalyseCtrl from '../src/ctrl';
import type { Review } from '../src/noSweatFish';

const jobs: { signal: AbortSignal; resolve: (r: Review) => void }[] = [];
class FakeFish {
  search(_fen: string, _moves: string[], signal: AbortSignal) {
    return new Promise<Review>(resolve => jobs.push({ signal, resolve }));
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

test('a rating leader arriving at quality-queue completion is still evaluated', async () => {
  const { ctrl, model } = chartModel();
  await Promise.resolve();
  model.enabled = true;
  model.candidates = [{ uci: 'a2a3', probability: 1 }];
  const roots = ['e2e4', 'd2d4', 'g1f3'].map(uci => ({ cp: 0, moves: [uci] }));
  (model as any).qualityRoot = { current: { depth: 12, lines: roots } };
  roots.forEach(line => model.scores.set(line.moves[0], { score: line, depth: 12 }));
  let inject = true;
  ctrl.redraw = () => {
    if (inject && model.scores.has('a2a3')) {
      inject = false;
      queueMicrotask(() => {
        model.byRating.set(2600, [{ uci: 'b2b3', probability: 0.5 }]);
        (model as any).colorCandidates();
      });
    }
  };
  const start = jobs.length;
  (model as any).colorCandidates();
  jobs[start].resolve({ current: { depth: 12, lines: [{ cp: -500, moves: ['a2a3'] }] } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(jobs.length, start + 2, 'the final sample must wake the completed queue');
  jobs[start + 1].resolve({ current: { depth: 12, lines: [{ cp: -100, moves: ['b2b3'] }] } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(model.scores.get('b2b3')?.depth, 12);
  assert.notEqual((model as any).chartOptions().color('b2b3'), 'var(--c-font-dim)');
  model.release();
});
