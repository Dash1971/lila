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
  const ctrl = board(`[SetUp "1"]\n[FEN "${fen}"]\n\n35... Qd1# *`);
  for (const mode of ['annotated', 'raw'] as const) {
    const exported = parsePgn(boardPgn(ctrl, mode))[0];
    assert.equal(exported.headers.get('FEN'), fen);
    assert.equal(exported.headers.get('SetUp'), '1');
    assert.equal(exported.headers.get('Result'), '0-1');
    assert.equal(exported.moves.children[0].data.san, 'Qd1#');
  }
});

test('raw matches native postgame SAN export, omitting imported and computed annotations and all sidelines', () => {
  const ctrl = board(
    '[White "Byrne"]\n[Black "Fischer"]\n[Result "1/2-1/2"]\n\n' +
      '1. e4 $1 { Original note [%eval 0.20] [%clk 0:05:00] } ' +
      '(1. d4 $2 { Sideline note } d5) e5 (1... c5) 2. Nf3 1/2-1/2',
  );
  ctrl.tree.root.comments = [{ id: 'r', by: 'PGN', text: 'Before the game' }];
  const first = ctrl.tree.root.children[0];
  first.comments!.push({ id: 'c', by: 'lichess', text: 'Generated review', comp: true });
  first.glyphs!.push({ id: 3, name: 'Brilliant', symbol: '!!', comp: true });
  first.eval = { cp: 43, depth: 14, fen: first.fen, knodes: 10, pvs: [] };
  first.clock = 12345;
  const annotated = boardPgn(ctrl);
  assert.equal(annotated, boardPgn(ctrl, 'annotated'), 'default stays annotated');
  const full = parsePgn(annotated)[0];
  assert.deepEqual(full.comments, ['Before the game']);
  assert.deepEqual(full.moves.children[0].data.nags, [1, 3]);
  assert.equal(full.moves.children.length, 2);
  assert.ok(full.moves.children[0].data.comments?.some(c => c.includes('Original note')));
  assert.ok(full.moves.children[0].data.comments?.some(c => c.includes('Generated review')));
  const rawText = boardPgn(ctrl, 'raw');
  const raw = parsePgn(rawText)[0];
  assert.deepEqual(raw.headers, full.headers);
  assert.equal(raw.headers.get('Result'), '1/2-1/2');
  assert.equal(raw.comments?.length ?? 0, 0);
  const sans: string[] = [];
  let node = raw.moves;
  while (node.children.length) {
    assert.equal(node.children.length, 1, 'raw contains only the current mainline');
    const child = node.children[0];
    sans.push(child.data.san);
    assert.equal(child.data.nags?.length ?? 0, 0);
    assert.equal(child.data.comments?.length ?? 0, 0);
    node = child;
  }
  assert.deepEqual(sans, ['e4', 'e5', 'Nf3']);
  assert.equal(rawText.includes('[%'), false);
  assert.equal(rawText.includes('unsubmitted draft'), false);
  assert.equal(boardPgn(ctrl), annotated, 'raw export must not mutate the annotated tree or headers');
});

test('annotated exports native centisecond clocks including zero and mate evaluations on variations', () => {
  const ctrl = board('1. e4 (1. d4 d5) e5 *');
  const [first, variation] = ctrl.tree.root.children;
  first.clock = 12345;
  variation.clock = 0;
  variation.eval = { mate: -3, depth: 20, fen: variation.fen, knodes: 10, pvs: [] };
  const exported = parsePgn(boardPgn(ctrl))[0];
  const comment = (index: number) =>
    exported.moves.children[index].data.comments?.map(parseComment).find(c => c.clock !== undefined);
  assert.equal(comment(0)?.clock, 123.45);
  assert.equal(comment(1)?.clock, 0);
  assert.deepEqual(comment(1)?.evaluation, { mate: -3, depth: 20 });
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
  downloadBoardPgn(ctrl, 'raw');
  assert.equal(filename, 'mutechess-analysis-raw.pgn');
  assert.equal(await (await fetch(href)).text(), boardPgn(ctrl, 'raw'));
});
