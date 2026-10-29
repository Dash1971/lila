import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classificationPoint } from '../src/moveClassifications';
const node = (ids: number[]) => ({ ply: 21, fen: '', glyphs: ids.map(id => ({ id, symbol: '', name: '' })) });
test('classification markers reproduce all six Mobile Maia / En Croissant circle colors', () => {
  for (const [id, symbol, color] of [
    [3, '!!', '#15aabf'],
    [1, '!', '#12b886'],
    [5, '!?', '#82c91e'],
    [6, '?!', '#fab005'],
    [2, '?', '#fd7e14'],
    [4, '??', '#fa5252'],
  ] as const) {
    const point = classificationPoint(node([id]), '#888');
    assert.equal(point.classification?.symbol, symbol);
    assert.deepEqual(
      [point.radius, point.color, point.border, point.borderWidth, point.style],
      [4, color, '#eeeeee', 1, 'circle'],
    );
  }
});
test('native negative judgments take precedence over positive/imported glyphs; ordinary points stay quiet', () => {
  assert.equal(classificationPoint(node([3, 4]), '#888').classification?.symbol, '??');
  assert.equal(classificationPoint(node([3, 6]), '#888').classification?.symbol, '?!');
  assert.equal(classificationPoint(node([10]), '#888').radius, 0);
  assert.equal(classificationPoint(node([]), '#888', 'black').style, 'rect');
  assert.equal(classificationPoint(node([4]), '#888', 'black').style, 'circle');
});
