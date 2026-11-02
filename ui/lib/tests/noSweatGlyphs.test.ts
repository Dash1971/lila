import * as cgGlyphs from '@lichess-org/chessground/glyph';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { annotationShapes } from '../src/game/glyphs';
import { moveClasses } from '../src/nosweat/moveClasses';
import type { TreeNode } from '../src/tree/types';

const nativeGlyphs = cgGlyphs.glyphToSvg(4);

function badge(symbol: string, stackedNumber: number): string {
  const node = { uci: 'e2e4', san: 'e4', glyphs: [{ id: 1, symbol, name: 'Test glyph' }] } as TreeNode;
  const existing = Array.from({ length: stackedNumber }, () => ({
    orig: 'e4' as Key,
    customSvg: { html: '<path/>' },
  }));
  return annotationShapes(node, existing)[0].customSvg!.html;
}

function withBrand(brand: string | undefined, action: () => void): void {
  const original = document.documentElement.dataset.brand;
  if (brand === undefined) delete document.documentElement.dataset.brand;
  else document.documentElement.dataset.brand = brand;
  try {
    action();
  } finally {
    if (original === undefined) delete document.documentElement.dataset.brand;
    else document.documentElement.dataset.brand = original;
  }
}

function svg(html: string): SVGSVGElement {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  element.innerHTML = html;
  return element;
}

test('Mute Chess board badges match every summary color at each native stack position', () => {
  withBrand('mutechess', () => {
    for (const category of moveClasses) {
      for (let stack = 0; stack < 4; stack++) {
        const actual = svg(badge(category.symbol, stack));
        const native = svg(nativeGlyphs[category.symbol](stack));
        const background = actual.querySelector('circle')!;
        assert.equal(background.getAttribute('fill'), category.color, `${category.symbol} stack ${stack}`);
        assert.ok([...actual.querySelectorAll('path')].every(path => path.getAttribute('fill') === '#fff'));
        // Restore only the original background color: every other SVG byte after
        // DOM parsing must retain native geometry, stacking, white paths and shadow.
        background.setAttribute('fill', native.querySelector('circle')!.getAttribute('fill')!);
        assert.equal(actual.outerHTML, native.outerHTML);
      }
    }
  });
});

test('unbranded and non-Mute boards retain the exact upstream classification SVGs', () => {
  for (const brand of [undefined, '', 'lichess']) {
    withBrand(brand, () => {
      for (const category of moveClasses)
        for (let stack = 0; stack < 4; stack++)
          assert.equal(badge(category.symbol, stack), nativeGlyphs[category.symbol](stack));
    });
  }
});

test('Mute Chess preserves other native badges and unknown glyph labels', () => {
  withBrand('mutechess', () => {
    for (const symbol of ['∞', '✓', '✗', '①', '□'])
      for (let stack = 0; stack < 4; stack++) assert.equal(badge(symbol, stack), nativeGlyphs[symbol](stack));
    const unknown = annotationShapes({
      uci: 'e2e4',
      san: 'e4',
      glyphs: [{ id: 999, symbol: 'unknown', name: 'Unknown' }],
    } as TreeNode)[0];
    assert.equal(unknown.customSvg, undefined);
    assert.deepEqual(unknown.label, { text: 'unknown', fill: 'purple' });
  });
});

test('glyph rendering without a document retains upstream SVGs', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document')!;
  try {
    Reflect.deleteProperty(globalThis, 'document');
    for (const category of moveClasses)
      assert.equal(badge(category.symbol, 0), nativeGlyphs[category.symbol](0));
  } finally {
    Object.defineProperty(globalThis, 'document', original);
  }
});
