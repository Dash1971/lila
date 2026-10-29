import type { ChartGame } from 'chart';
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import type { Dialog } from 'lib/view';

import type AnalyseCtrl from '../src/ctrl';

let resolveDivision: (value: unknown) => void;
let searches = 0;
class DeferredEngine {
  busy = false;
  nodes = [];
  getDivision() {
    return new Promise(resolve => {
      resolveDivision = resolve;
    });
  }
  analyse() {
    searches++;
    throw new Error('a cancelled review must not start');
  }
  stop() {}
}
mock.module('../src/study/studyChapters.ts', { namedExports: { isFinished: () => false } });
mock.module('../src/local/localAnalysisEngine.ts', { namedExports: { LocalAnalysisEngine: DeferredEngine } });
document.documentElement.lang = 'en-US';
const { LocalAnalysisDialog } = await import('../src/local/localAnalysisDialog');

test('automatic review redraws immediately and cannot start work after closing during preparation', async () => {
  localStorage.clear();
  const ctrl = {
    noSweat: {},
    ceval: {
      rules: 'chess',
      engines: { supporting: () => [{ id: '__sf_19_smallnet', minThreads: 1, maxThreads: 2 }] },
    },
  } as unknown as AnalyseCtrl;
  const state = new LocalAnalysisDialog(ctrl, {} as ChartGame);
  let redraws = 0;
  const pending = state.analyse({ dialog: { open: true } } as Dialog, () => redraws++);
  assert.ok(redraws > 0, 'preparation must immediately replace the settings screen');
  state.close();
  resolveDivision({});
  await pending;
  assert.equal(searches, 0);
});
