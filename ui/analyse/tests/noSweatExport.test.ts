import { INITIAL_FEN } from 'chessops/fen';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type AnalyseCtrl from '../src/ctrl';
import {
  analysisGifUrl,
  canExportAnalysisGif,
  positionImageUrl,
  positionShareUrl,
} from '../src/noSweatExport';
import pgnImport from '../src/pgnImport';
import { treeReconstruct } from '../src/util';

const ctrl = {
  data: {},
  tree: { root: { fen: INITIAL_FEN, children: [] } },
  node: { fen: INITIAL_FEN, uci: 'e2e4' },
  mainline: [{}],
  bottomColor: () => 'black',
} as unknown as AnalyseCtrl;

test('native image/share/embed links encode current position and orientation without a saved game', () => {
  document.body.dataset.board = 'brown';
  document.body.dataset.pieceSet = 'cburnett';
  const image = new URL(positionImageUrl(ctrl));
  assert.equal(image.pathname, '/export/fen.gif');
  assert.equal(image.searchParams.get('fen'), INITIAL_FEN);
  assert.equal(image.searchParams.get('lastMove'), 'e2e4');
  assert.equal(image.searchParams.get('color'), 'black');
  assert.equal(image.searchParams.get('theme'), 'brown');
  const share = new URL(positionShareUrl(ctrl));
  assert.equal(share.pathname, '/analysis/standard');
  assert.equal(share.searchParams.get('fen'), INITIAL_FEN);
  const embed = new URL(positionShareUrl(ctrl, true));
  assert.equal(embed.pathname, '/embed/analysis');
  assert.equal(embed.searchParams.get('color'), 'black');
  assert.equal(embed.searchParams.get('bg'), 'auto');
});

test('unsaved GIF links contain the actual raw mainline and respect native bounds', () => {
  const data = pgnImport('1. e4 *', true);
  const root = treeReconstruct(data.treeParts!, 'standard', data.sidelines);
  const line = { ...ctrl, data, tree: { root }, mainline: [root, root.children[0]] } as AnalyseCtrl;
  const gif = new URL(
    analysisGifUrl(line, 'white', { players: false, ratings: true }),
    window.location.origin,
  );
  assert.equal(gif.pathname, '/analysis/export.gif');
  assert.equal(gif.searchParams.get('color'), 'white');
  assert.equal(gif.searchParams.get('players'), 'false');
  assert.equal(gif.searchParams.get('glyphs'), 'false');
  assert.ok(gif.searchParams.get('pgn')?.includes('1. e4'));
  assert.equal(canExportAnalysisGif(ctrl), false, 'FEN-only positions use position-image export');
  assert.equal(canExportAnalysisGif(line), true);
  assert.equal(canExportAnalysisGif({ ...ctrl, mainline: Array(602) } as AnalyseCtrl), false);
});
