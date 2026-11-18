import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import type { MaiaLabSnapshot } from '../src/nosweat/maiaLabModel';

let destroyed = 0;
let boardConfig: any;
mock.module('@lichess-org/chessground', {
  namedExports: {
    Chessground: (_host: HTMLElement, config: any) => {
      boardConfig = config;
      return { set: (next: any) => Object.assign(boardConfig, next), destroy: () => destroyed++ };
    },
  },
});
mock.module('../src/view/dialog.ts', {
  namedExports: {
    domDialog: async (opts: any) => {
      const view = document.createElement('div');
      view.innerHTML = opts.htmlText;
      document.body.append(view);
      const dialog = {
        view,
        close: () => {
          opts.onClose();
          view.remove();
        },
        show: async () => dialog,
      };
      return dialog;
    },
  },
});
const { MaiaLab } = await import('../src/nosweat/maiaLab');
const { labEnglish } = await import('../src/nosweat/maiaLabI18n');
(globalThis as any).ResizeObserver = class {
  observe() {}
  disconnect() {}
};
(globalThis as any).SVGElement = window.SVGElement;
(globalThis as any).HTMLInputElement = window.HTMLInputElement;
(globalThis as any).i18n = {
  site: Object.fromEntries(Object.entries(labEnglish).map(([k, v]) => ['mute' + k, v])),
};
function data(): MaiaLabSnapshot {
  return {
    key: 'one',
    fen: '5rk1/3Q1p2/6p1/P5r1/R1q1n3/7B/7P/5R1K b - - 0 1',
    orientation: 'black',
    model: 'Maia-3 5M',
    history: true,
    rating: 2600,
    busy: true,
    failed: false,
    byRating: new Map([
      [
        2600,
        [
          { uci: 'c4e2', probability: 0.544 },
          { uci: 'c4f1', probability: 0.022 },
          { uci: 'c4c2', probability: 0.144 },
        ],
      ],
    ]),
    scores: new Map([
      ['c4f1', { depth: 18, score: { mate: -2 } }],
      ['c4e2', { depth: 18, score: { cp: -86 } }],
      ['c4c2', { depth: 18, score: { cp: -568 } }],
    ]),
  };
}
test('shared dialog updates live data, selected rating/move, map, mini-board and native explore', async () => {
  let snapshot: MaiaLabSnapshot | undefined = data();
  let started = 0,
    stopped = 0;
  const hovered: (string | undefined)[] = [];
  const explored: string[] = [];
  const lab = new MaiaLab({
    snapshot: () => snapshot,
    start: () => started++,
    stop: () => stopped++,
    hover: uci => hovered.push(uci),
    explore: uci => explored.push(uci),
  });
  await lab.open();
  assert.equal(started, 1);
  assert.equal(boardConfig.orientation, 'black');
  assert.equal(document.body.classList.contains('is2d'), false);
  assert.ok(
    document.querySelector('[data-lab-board]')!.classList.contains('is2d'),
    'the body-mounted dialog supplies its own native board and piece theme scope',
  );
  assert.ok(
    !document.querySelector('[data-lab-details]')!.textContent!.includes('Evaluation loss'),
    'forced mates do not invent pawn losses',
  );
  const view = document.body;
  assert.ok(view.textContent?.includes('54.4%'));
  assert.ok(view.textContent?.includes('full rating sweep'));
  const move = view.querySelector<HTMLButtonElement>('tbody [data-lab-move="c4e2"]')!;
  move.click();
  assert.deepEqual(boardConfig.lastMove, ['c4', 'e2']);
  const slider = view.querySelector<HTMLInputElement>('[data-lab-rating]')!;
  let escapedKeys = 0;
  const boardShortcut = () => escapedKeys++;
  document.addEventListener('keydown', boardShortcut);
  slider.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  document.removeEventListener('keydown', boardShortcut);
  assert.equal(escapedKeys, 0, 'dialog controls cannot trigger native board shortcuts');
  slider.value = '600';
  slider.dispatchEvent(new window.Event('input'));
  assert.equal(view.querySelector('[data-lab-rating-value]')!.textContent, '600');
  view.querySelector<HTMLButtonElement>('[data-lab-tab="map"]')!.click();
  assert.ok(view.querySelector('[data-lab-map] svg'));
  view.querySelector<HTMLButtonElement>('[data-lab-tab="rating"]')!.click();
  assert.equal(view.querySelectorAll('[data-lab-plot] svg').length, 1);
  snapshot = data();
  snapshot.key = 'two';
  snapshot.fen = '8/8/8/8/8/5K2/7k/8 w - - 0 1';
  snapshot.byRating.clear();
  snapshot.scores.clear();
  lab.redraw();
  assert.ok(!view.querySelector('tbody [data-lab-move="c4e2"]'));
  assert.equal(boardConfig.fen, snapshot.fen);
  snapshot = undefined;
  lab.redraw();
  assert.equal(stopped, 1);
  assert.equal(destroyed, 1);
  assert.equal(document.querySelector('[data-lab-rating]'), null);
  assert.equal(hovered.at(-1), undefined);
  assert.deepEqual(explored, []);
});
test('opening is gated and explore closes before changing the native tree', async () => {
  let snapshot: MaiaLabSnapshot | undefined;
  const events: string[] = [];
  const lab = new MaiaLab({
    snapshot: () => snapshot,
    start: () => events.push('start'),
    stop: () => events.push('stop'),
    hover: () => {},
    explore: uci => events.push(uci),
  });
  await lab.open();
  assert.deepEqual(events, []);
  snapshot = data();
  await lab.open();
  await lab.open();
  assert.deepEqual(events, ['start']);
  document.querySelector<HTMLButtonElement>('[data-lab-explore]')!.click();
  assert.deepEqual(events, ['start', 'stop', 'c4f1']);
});
