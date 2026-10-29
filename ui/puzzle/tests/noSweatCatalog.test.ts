import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pgnToTree } from '../src/moveTree';

test('catalog puzzles retain absolute ply and the pre-opponent FEN', () => {
  const fen = 'q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17';
  const root = pgnToTree(['Kd7'], fen);
  assert.equal(root.ply, 33);
  assert.equal(root.fen, fen);
  assert.equal(root.children[0].ply, 34);
  assert.equal(root.children[0].san, 'Kd7');
  assert.equal(root.children[0].fen.split(' ')[1], 'w');
});
