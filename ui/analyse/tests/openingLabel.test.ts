import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import type AnalyseCtrl from '../src/ctrl';

let dialogHtml = '';
mock.module('../../lib/src/view/index.ts', {
  namedExports: {
    domDialog: (options: { htmlText: string }) => {
      dialogHtml = options.htmlText;
    },
  },
});
const { OpeningLabel, openingEpd } = await import('../src/noSweatOpening');

test('font completion rechecks long ECO names and exposes escaped full details without changing the row', async () => {
  let measure = () => {};
  let disconnected = false;
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
  });
  let fontsReady!: () => void;
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      ready: new Promise<void>(resolve => {
        fontsReady = resolve;
      }),
    },
  });
  (site as any).asset = { url: (path: string) => path };
  (globalThis as any).i18n = { site: { opening: 'Opening', close: 'Close' } };
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const name = 'French Defense: a long variation name <img src=x onerror=alert(1)>';
  mock.method(
    globalThis,
    'fetch',
    async () => new Response(JSON.stringify([[openingEpd(fen), 'C00', name]])),
  );
  const node = { fen, ply: 0 };
  const ctrl = {
    path: '',
    node,
    nodeList: [node],
    mainline: [node],
    data: { game: {} },
  } as unknown as AnalyseCtrl;
  const underboard = document.createElement('div');
  document.body.append(underboard);
  const opening = new OpeningLabel(ctrl, underboard);
  await new Promise(resolve => setTimeout(resolve, 0));
  const row = underboard.firstElementChild!;
  const label = underboard.querySelector('button')!;
  let textWidth = 200;
  Object.defineProperty(label, 'clientWidth', { get: () => 400 });
  Object.defineProperty(label, 'scrollWidth', { get: () => textWidth });
  measure();
  assert.equal(label.disabled, true);
  textWidth = 700;
  fontsReady();
  await Promise.resolve();
  assert.equal(label.disabled, false);
  assert.equal(label.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(label.textContent, 'C00 · ' + name);
  label.click();
  assert.ok(dialogHtml.includes('C00 · French Defense:'));
  assert.ok(dialogHtml.includes('&lt;img'));
  assert.ok(!dialogHtml.includes('<img'));
  assert.equal(underboard.firstElementChild, row);
  opening.destroy();
  assert.equal(disconnected, true);
  assert.equal(underboard.children.length, 0);
});
