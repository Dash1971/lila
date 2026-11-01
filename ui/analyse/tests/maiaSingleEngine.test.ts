import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { attributesModule, init } from 'snabbdom';

import { policy } from 'lib/nosweat/core';
import { saveEnginePreferences } from 'lib/nosweat/engineSettings';
import { defaultEnginePreferences } from 'lib/nosweat/preferences';

import type AnalyseCtrl from '../src/ctrl';

mock.module('../src/noSweatFish.ts', {
  namedExports: {
    ReviewFish: class {
      destroy() {}
    },
  },
});
const { NoSweatAnalysis } = await import('../src/noSweatAnalysis');
const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('one Maia fills both card columns with eight raw moves and Others retains the full policy', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe() {}
      disconnect() {}
    },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'ResizeObserver', descriptor);
    else Reflect.deleteProperty(globalThis, 'ResizeObserver');
  });
  saveEnginePreferences({ ...defaultEnginePreferences });
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
  model.candidates = policy(fen, new Float32Array(4352));
  model.secondaryCandidates = model.candidates;
  const host = document.createElement('div');
  document.body.append(host);
  const patch = init([attributesModule]);
  let vnode = patch(host, (model as any).candidateView());
  let root = vnode.elm as HTMLElement;
  assert.equal(root.querySelectorAll('.nosweat-maia-card').length, 2);
  assert.equal(root.querySelectorAll('.nosweat-policy tbody button').length, 8);
  model.secondMaiaEnabled = false;
  vnode = patch(vnode, (model as any).candidateView());
  root = vnode.elm as HTMLElement;
  assert.equal(root.querySelectorAll('.nosweat-maia-card').length, 1);
  assert.equal(root.querySelectorAll('.nosweat-policy').length, 2);
  assert.equal(root.querySelectorAll('.nosweat-policy tbody button').length, 8);
  assert.equal(root.querySelector('.nosweat-others span:last-child')!.textContent, '60.0% +');
  assert.equal(
    new Set([...root.querySelectorAll('.nosweat-policy tbody button')].map(b => b.textContent)).size,
    8,
  );
  root.querySelector<HTMLButtonElement>('.nosweat-others')!.click();
  vnode = patch(vnode, (model as any).candidateView());
  assert.equal((vnode.elm as HTMLElement).querySelectorAll('.nosweat-policy tbody button').length, 20);
  assert.equal(
    (model as any).qualityCandidates().length,
    4,
    'Others does not enlarge the deepening selection',
  );
  model.release();
  root.remove();
});
