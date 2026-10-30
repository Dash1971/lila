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
  const observed: Element[] = [];
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe(element: Element) {
        observed.push(element);
      }
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
  const analyse = document.createElement('main');
  analyse.className = 'analyse';
  const strip = document.createElement('div');
  strip.className = 'analyse__player_strip bottom';
  let stripWidth = 36.7;
  strip.getBoundingClientRect = () => ({ width: stripWidth }) as DOMRect;
  analyse.append(strip, underboard);
  document.body.append(analyse);
  const opening = new OpeningLabel(ctrl, underboard);
  await new Promise(resolve => setTimeout(resolve, 0));
  const row = underboard.firstElementChild!;
  const label = underboard.querySelector('button')!;
  assert.ok(observed.includes(strip));
  assert.equal((row as HTMLElement).style.getPropertyValue('--nosweat-opening-clearance'), '45px');
  stripWidth = 120;
  measure();
  assert.equal((row as HTMLElement).style.getPropertyValue('--nosweat-opening-clearance'), '128px');
  stripWidth = 1;
  measure();
  assert.equal((row as HTMLElement).style.getPropertyValue('--nosweat-opening-clearance'), '0px');
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
  analyse.remove();
});
