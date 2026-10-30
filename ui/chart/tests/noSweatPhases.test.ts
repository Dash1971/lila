import assert from 'node:assert/strict';
import { test } from 'node:test';

document.body.dataset.theme = 'dark';
const { phaseLabels } = await import('../src/noSweatPhases');
const labels = (nodes: Parameters<typeof phaseLabels>[0]) =>
  phaseLabels(nodes).map(p => ({ ...p, label: String(p.label) }));

const initial = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const endgame = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 20';
test('phase annotations do not invent phases a short game never reached', () => {
  assert.deepEqual(labels([{ fen: initial, ply: 0 }]), [{ ply: 0, label: String(i18n.site.opening) }]);
});
test('an imported endgame starts with Endgame and has no fake opening or duplicate boundary', () => {
  assert.deepEqual(labels([{ fen: endgame, ply: 38 }]), [{ ply: 38, label: String(i18n.site.endgame) }]);
  assert.deepEqual(
    labels([
      { fen: initial, ply: 0 },
      { fen: endgame, ply: 38 },
    ]),
    [
      { ply: 0, label: String(i18n.site.opening) },
      { ply: 38, label: String(i18n.site.endgame) },
    ],
  );
});
