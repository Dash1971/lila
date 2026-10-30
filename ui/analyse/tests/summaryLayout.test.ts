import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { init, attributesModule, classModule } from 'snabbdom';

import type AnalyseCtrl from '../src/ctrl';

mock.module('../src/study/studyChapters.ts', { namedExports: { findTag: () => undefined } });
document.documentElement.lang = 'en-US';
const { render } = await import('../src/view/roundTraining');

test('cached summary keeps its layout class on the actual DOM with long player names', () => {
  const ctrl = {
    noSweat: {},
    mainline: [],
    mainlineAnalysis: { white: { accuracy: 80, acpl: 20 }, black: { accuracy: 70, acpl: 30 } },
    settings: { showMainlineAnalysis: true },
    idbTree: { hasLocalAnalysis: true },
    data: {
      player: { color: 'white', name: 'W'.repeat(30) },
      opponent: { color: 'black', name: 'M'.repeat(30) },
    },
  } as unknown as AnalyseCtrl;
  const host = document.createElement('div');
  document.body.append(host);
  const vnode = init([attributesModule, classModule])(host, render(ctrl));
  const root = vnode.elm as HTMLElement;
  assert.ok(
    root.querySelector('.nosweat-summary table'),
    'the cached root must retain the class that bounds the columns',
  );
  assert.equal(root.querySelectorAll('.nosweat-summary-player').length, 2);
  assert.ok(
    root.textContent?.includes('W'.repeat(30)),
    'full labels remain accessible despite CSS truncation',
  );
  root.remove();
});
