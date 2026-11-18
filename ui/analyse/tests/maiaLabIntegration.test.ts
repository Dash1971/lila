import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { attributesModule, init } from 'snabbdom';

import type { MaiaLabSource } from 'lib/nosweat/maiaLab';

import type AnalyseCtrl from '../src/ctrl';

mock.module('../src/noSweatFish.ts', {
  namedExports: {
    ReviewFish: class {
      destroy() {}
    },
  },
});
const { NoSweatAnalysis } = await import('../src/noSweatAnalysis');
const fen = '5rk1/3Q1p2/6p1/P5r1/R1q1n3/7B/7P/5R1K b - - 0 1';
Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: class {
    observe() {}
    disconnect() {}
  },
});

test('standalone and post-game share the same popup, evidence and native preview contracts', async () => {
  for (const synthetic of [true, false]) {
    let threat = false,
      allowed = true,
      hover: any = null;
    const played: string[] = [];
    const ctrl = {
      synthetic,
      cevalEnabled: () => false,
      ceval: { storedPv: () => {}, hovering: (...args: any[]) => (args.length ? (hover = args[0]) : hover) },
      opts: {},
      node: { fen, children: [] },
      nodeList: [{ fen }],
      path: '',
      isCevalAllowed: () => allowed,
      setAutoShapes: () => {},
      redraw: () => {},
      threatMode: () => threat,
      bottomColor: () => 'black',
      playUci: (uci: string) => played.push(uci),
    } as unknown as AnalyseCtrl;
    const model = new NoSweatAnalysis(ctrl);
    await Promise.resolve();
    const source = (model as any).lab.source as MaiaLabSource;
    assert.equal(source.snapshot(), undefined);
    model.enabled = true;
    model.byRating.set(2600, [{ uci: 'c4f1', probability: 0.022 }]);
    model.scores.set('c4f1', { depth: 18, score: { mate: -2 } });
    const data = source.snapshot()!;
    assert.equal(data.byRating, model.byRating);
    assert.equal(data.orientation, 'black');
    assert.equal(data.scores.get('c4f1')?.score.mate, -2);
    source.hover('c4f1');
    assert.equal(hover.uci, 'c4f1');
    source.hover();
    assert.equal(hover, null);
    source.explore('c4f1');
    assert.deepEqual(played, ['c4f1']);
    threat = true;
    assert.equal(source.snapshot(), undefined);
    threat = false;
    allowed = false;
    assert.equal(source.snapshot(), undefined);
    const host = document.body.appendChild(document.createElement('div'));
    const vnode = init([attributesModule])(host, (model as any).candidateView());
    assert.ok((vnode.elm as HTMLElement).querySelector<HTMLButtonElement>('.nosweat-lab-open')!.disabled);
    (vnode.elm as HTMLElement).remove();
    model.release();
  }
});
