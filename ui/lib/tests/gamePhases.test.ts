import assert from 'node:assert/strict';
import { test } from 'node:test';

import { detectGamePhases } from '../src/nosweat/phases';

const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
test('Mobile Maia phase detector keeps an undeveloped position in the opening', () => {
  assert.deepEqual(detectGamePhases([{ fen: start, ply: 0 }]), {});
});
test('material and sparse back-rank boundaries use actual plies, including imported endgames', () => {
  const middle = 'r3k2r/ppp2ppp/2n1bn2/3pp3/3PP3/2N1BN2/PPP2PPP/R3K2R w KQkq - 0 8';
  const end = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 20';
  assert.deepEqual(
    detectGamePhases([
      { fen: start, ply: 0 },
      { fen: middle, ply: 14 },
      { fen: end, ply: 38 },
    ]),
    { middle: 14, end: 38 },
  );
  assert.deepEqual(detectGamePhases([{ fen: end, ply: 38 }]), { middle: 38, end: 38 });
});
