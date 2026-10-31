import { parseComment, parsePgn } from 'chessops/pgn';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type AnalyseCtrl from '../src/ctrl';
import { boardPgn, downloadBoardPgn } from '../src/noSweatPgn';
import pgnImport from '../src/pgnImport';
import { treeReconstruct } from '../src/util';

function board(pgn: string): AnalyseCtrl {
  const data = pgnImport(pgn, true);
  return {
    data,
    tree: { root: treeReconstruct(data.treeParts!, 'standard', data.sidelines) },
    pgnInput: 'unsubmitted draft',
  } as unknown as AnalyseCtrl;
}

test('PGN export preserves the actual tree, variations, judgments, comments and evaluations instead of the import draft', () => {
  const ctrl = board('[White "Byrne"]\n[Black "Fischer"]\n\n1. e4 (1. d4 d5) e5 2. Nf3 *');
  const first = ctrl.tree.root.children[0];
  first.glyphs = [{ id: 3, symbol: '!!', name: 'Brilliant', comp: true }];
  first.comments = [{ id: 'a', by: 'lichess', text: 'A comment } with braces', comp: true }];
  first.eval = { cp: 43, depth: 14, fen: first.fen, knodes: 10, pvs: [] };
  const text = boardPgn(ctrl);
  const exported = parsePgn(text)[0];
  assert.equal(exported.moves.children[0].data.san, 'e4');
  assert.deepEqual(exported.moves.children[0].data.nags, [3]);
  assert.ok(exported.moves.children[0].data.comments?.some(c => c.includes('A comment')));
  assert.ok(exported.moves.children[0].data.comments?.some(c => parseComment(c).evaluation?.pawns === 0.43));
  assert.equal(exported.moves.children[1].data.san, 'd4');
  assert.equal(exported.moves.children[1].children[0].data.san, 'd5');
  assert.equal(text.includes('unsubmitted draft'), false);
  const roundtrip = board(text);
  assert.equal(new Map(roundtrip.data.noSweatPgnHeaders).get('Black'), 'Fischer');
  assert.equal(roundtrip.tree.root.children[0].glyphs?.[0].id, 3);
  assert.equal(
    roundtrip.tree.root.children[0].glyphs?.[0].comp,
    undefined,
    'imported judgments remain authoritative',
  );
});

test('PGN export preserves a nonzero black-to-move FEN and the actual checkmate result', () => {
  const fen = '6k1/5ppp/8/8/8/5q2/5PPP/6K1 b - - 0 35';
  const exported = parsePgn(boardPgn(board(`[SetUp "1"]\n[FEN "${fen}"]\n\n35... Qd1# *`)))[0];
  assert.equal(exported.headers.get('FEN'), fen);
  assert.equal(exported.headers.get('SetUp'), '1');
  assert.equal(exported.headers.get('Result'), '0-1');
  assert.equal(exported.moves.children[0].data.san, 'Qd1#');
});

test('download creates a real PGN file with the current board content', async t => {
  const ctrl = board('1. e4 e5 *');
  let href = '';
  let filename = '';
  t.mock.method(window.HTMLAnchorElement.prototype, 'click', function (this: HTMLAnchorElement) {
    href = this.href;
    filename = this.download;
  });
  downloadBoardPgn(ctrl);
  assert.equal(filename, 'mutechess-analysis.pgn');
  assert.equal(await (await fetch(href)).text(), boardPgn(ctrl));
});
