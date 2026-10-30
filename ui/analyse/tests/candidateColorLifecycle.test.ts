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
