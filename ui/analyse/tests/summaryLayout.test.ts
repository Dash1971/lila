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
    bottomColor: () => 'white',
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

test('short FEN-start reviews show unavailable native metrics without inventing scores', () => {
  const ctrl = {
    noSweat: {},
    bottomColor: () => 'white',
    mainline: [],
    mainlineAnalysis: { white: {}, black: { acpl: 0 } },
    settings: { showMainlineAnalysis: true },
    idbTree: { hasLocalAnalysis: true },
    data: { player: { color: 'white' }, opponent: { color: 'black' } },
  } as unknown as AnalyseCtrl;
  const host = document.createElement('div');
  document.body.append(host);
  const vnode = init([attributesModule, classModule])(host, render(ctrl));
  const root = vnode.elm as HTMLElement;
  assert.ok(!root.textContent?.includes('undefined'));
  const cells = [...root.querySelectorAll('.accuracy td')];
  assert.deepEqual([cells[0].textContent, cells[2].textContent], ['—', '—']);
  assert.equal(root.querySelector('tbody tr:last-child td:last-child')?.textContent, '0');
  root.remove();
});

test('separate summary glyphs keep category names and native count navigation', () => {
  const jumpToGlyphSymbol = mock.fn();
  const redraw = mock.fn();
  const ctrl = {
    noSweat: {},
    bottomColor: () => 'white',
    mainline: [
      { ply: 1, uci: 'e2e4', glyphs: [{ id: 3 }] },
      { ply: 2, uci: 'e7e5', glyphs: [{ id: 6 }] },
    ],
    mainlineAnalysis: { white: { accuracy: 80, acpl: 20 }, black: { accuracy: 70, acpl: 30 } },
    settings: { showMainlineAnalysis: true },
    idbTree: { hasLocalAnalysis: true },
    data: { player: { color: 'white' }, opponent: { color: 'black' } },
    jumpToGlyphSymbol,
    redraw,
  } as unknown as AnalyseCtrl;
  const host = document.createElement('div');
  document.body.append(host);
  const vnode = init([attributesModule, classModule])(host, render(ctrl));
  const root = vnode.elm as HTMLElement;
  const labels = [...root.querySelectorAll('.nosweat-summary-label')];
  assert.deepEqual(
    labels.map(label => label.lastElementChild?.textContent),
    ['Brilliant', 'Good', 'Interesting', 'Dubious', 'Mistake', 'Blunder'],
  );
  for (const label of labels) {
    assert.equal(label.querySelector('.nosweat-summary-symbol')?.getAttribute('aria-hidden'), 'true');
    assert.equal(label.closest('tr')?.children.length, 3, 'the two count columns retain their center label');
  }
  const white = root.querySelector<HTMLButtonElement>('button[aria-label="Brilliant: 1 for white"]')!;
  const black = root.querySelector<HTMLButtonElement>('button[aria-label="Dubious: 1 for black"]')!;
  assert.equal(white.disabled, false);
  assert.equal(black.disabled, false);
  assert.equal(
    root.querySelector<HTMLButtonElement>('button[aria-label="Brilliant: 0 for black"]')?.disabled,
    true,
  );
  white.click();
  black.click();
  assert.deepEqual(
    jumpToGlyphSymbol.mock.calls.map(call => call.arguments),
    [
      ['white', '!!'],
      ['black', '?!'],
    ],
  );
  assert.equal(redraw.mock.callCount(), 2);
  root.remove();
});
