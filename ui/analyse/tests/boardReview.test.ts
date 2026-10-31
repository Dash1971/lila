import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { attributesModule, classModule, init } from 'snabbdom';

import { pubsub } from 'lib/pubsub';
import { hl } from 'lib/view';

import type AnalyseCtrl from '../src/ctrl';
import { IdbTree } from '../src/idbTree';
import { LocalAnalysisEngine, type LocalAnalysisResult } from '../src/local/localAnalysisEngine';
import { BoardReview } from '../src/noSweatBoardReview';
import { FullGameClassifier } from '../src/noSweatFullReview';

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const makeLine = () => {
  const child = {
    id: 'ab',
    ply: 1,
    uci: 'e2e4',
    fen: fen.replace(' w ', ' b '),
    children: [],
    glyphs: [
      { id: 4, symbol: '??', name: 'Blunder', comp: true },
      { id: 1, symbol: '!', name: 'Good' },
    ],
  };
  return [{ id: '', ply: 0, fen, children: [child] }, child];
};

test('board review stays in memory, is specific to the analyzed line, and clearing retains moves and imported glyphs', async () => {
  const nodes = makeLine();
  const ctrl = {
    noSweat: {},
    synthetic: true,
    mainline: nodes,
    tree: { root: nodes[0] },
    opts: {},
    data: { game: { id: 'synthetic' } },
    redraw() {},
  } as unknown as AnalyseCtrl;
  const idb = new IdbTree(ctrl);
  const analysis = { id: 'synthetic', white: { accuracy: 90 }, black: { accuracy: 80 } };
  await idb.saveAnalysis({ localUpdate: { analysis, tree: nodes[0] } } as LocalAnalysisResult);
  assert.equal(idb.localAnalysis, analysis);
  ctrl.mainline = [...nodes, { ...nodes[1], ply: 2 }] as any;
  assert.equal(idb.hasLocalAnalysis, false);
  ctrl.mainline = nodes as any;
  assert.equal(idb.hasLocalAnalysis, true);
  await idb.clear('analysis');
  assert.equal(idb.hasLocalAnalysis, false);
  assert.equal(nodes[0].children[0], nodes[1]);
  assert.deepEqual(
    nodes[1].glyphs?.map(g => g.symbol),
    ['!'],
  );
});

test('a board line needs no saved-game export and detects replacement while preparing review', async () => {
  const nodes = makeLine();
  const ctrl = {
    noSweat: {},
    synthetic: true,
    mainline: nodes,
    tree: { root: nodes[0] },
  } as unknown as AnalyseCtrl;
  const fetch = mock.method(globalThis, 'fetch', async () => {
    throw new Error('no game export exists');
  });
  const engine = new LocalAnalysisEngine(ctrl);
  assert.deepEqual(await engine.getDivision(), {});
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(engine.isCurrent, true);
  ctrl.mainline = [nodes[0]] as any;
  assert.equal(engine.isCurrent, false);
  fetch.mock.restore();
});

test('study review retains its native chapter division request', async () => {
  const nodes = makeLine();
  const ctrl = {
    noSweat: {},
    synthetic: true,
    mainline: nodes,
    tree: { root: nodes[0] },
    study: { chapterConfigUrl: () => '/study/config/chapter' },
  } as unknown as AnalyseCtrl;
  const fetch = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ middle: 20 })));
  const engine = new LocalAnalysisEngine(ctrl);
  assert.deepEqual(await engine.getDivision(), { middle: 20 });
  assert.equal(fetch.mock.calls[0].arguments[0], '/study/config/chapter?divisionOnly=1');
  fetch.mock.restore();
});

test('switching tabs cannot silently cancel whole-game classifications; leaving the page still cancels', async () => {
  const nodes = makeLine();
  const ctrl = {
    noSweat: {},
    synthetic: true,
    mainline: nodes,
    tree: { root: nodes[0] },
    isCevalAllowed: () => true,
    ceval: { engines: { getEngine: () => ({ tech: 'NNUE', assets: {} }) } },
  } as unknown as AnalyseCtrl;
  const engine = new LocalAnalysisEngine(ctrl);
  const result = { localUpdate: { tree: structuredClone(nodes[0]), analysis: {} } } as LocalAnalysisResult;
  const hidden = Object.getOwnPropertyDescriptor(document, 'hidden');
  const run = mock.method(FullGameClassifier.prototype, 'run', async (_nodes, signal, current) => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new window.Event('visibilitychange'));
    assert.equal(signal.aborted, false, 'background native review also needs its classifications');
    assert.equal(current(), true);
    window.dispatchEvent(new window.Event('pagehide'));
    assert.equal(signal.aborted, true, 'page navigation must discard the temporary job');
    return new Map();
  });
  try {
    assert.equal(await engine.verifyBrilliants(result, () => {}), false);
  } finally {
    run.mock.restore();
    if (hidden) Object.defineProperty(document, 'hidden', hidden);
    else delete (document as any).hidden;
  }
});

test('board uses native review entry point and chart, preserving editable inputs when analysis is cleared', async () => {
  document.documentElement.lang = 'en-US';
  let moves = false;
  const chart = { updateData: mock.fn(), resize() {}, destroy: mock.fn(), selectPly() {} };
  const acpl = mock.fn(async () => chart);
  const load = mock.fn(async (name: string) => (name === 'chart.game' ? { acpl } : {}));
  (site as any).asset = { loadEsm: load };
  const ctrl = {
    noSweat: { mountOpening() {} },
    data: {},
    mainline: [],
    settings: { set() {} },
    canAnalyseMainline: () => moves,
    mainlineAnalysis: undefined,
  } as unknown as AnalyseCtrl;
  const board = new BoardReview(ctrl);
  const host = document.createElement('div');
  document.body.append(host);
  const patch = init([attributesModule, classModule]);
  let vnode = patch(host, board.view(hl('textarea', { attrs: { 'aria-label': 'PGN' } })));
  ctrl.redraw = () => {
    vnode = patch(vnode, board.view(hl('textarea', { attrs: { 'aria-label': 'PGN' } })));
  };
  const root = vnode.elm as HTMLElement;
  const input = root.querySelector('textarea')!;
  input.value = '1. e4 e5';
  assert.equal(root.querySelector<HTMLButtonElement>('.computer-analysis button')!.disabled, true);
  moves = true;
  ctrl.redraw();
  root.querySelector<HTMLButtonElement>('.computer-analysis button')!.click();
  assert.equal(load.mock.calls[0].arguments[0], 'analyse.local');
  assert.deepEqual((load.mock.calls[0].arguments as any)[1].init, { ctrl, start: true });
  (ctrl as any).mainlineAnalysis = {};
  ctrl.redraw();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(acpl.mock.callCount(), 1);
  assert.ok(root.querySelector('.analysis-chart-actions + .analysis-chart-plot canvas'));
  pubsub.emit('analysis.server.progress', ctrl.data);
  ctrl.redraw();
  assert.ok(chart.updateData.mock.callCount() > 0);
  (ctrl as any).mainlineAnalysis = undefined;
  ctrl.redraw();
  assert.equal(chart.destroy.mock.callCount(), 1);
  assert.equal(root.querySelector('textarea'), input);
  assert.equal(input.value, '1. e4 e5');
  patch(vnode, hl('div'));
  root.remove();
});
