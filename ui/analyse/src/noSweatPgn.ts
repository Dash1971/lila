import { INITIAL_FEN } from 'chessops/fen';
import { ChildNode, Node, makeComment, makeOutcome, makePgn, type PgnNodeData } from 'chessops/pgn';

import type { TreeNodeLite } from 'lib/tree/types';

import type AnalyseCtrl from './ctrl';
import { position } from './noSweatCore';

// Use the same Chessops PGN model as native import. Export the actual tree,
// including annotations and variations, rather than an unsubmitted import draft.
export function boardPgn(ctrl: AnalyseCtrl): string {
  const root = ctrl.tree.root;
  let end: TreeNodeLite = root;
  while (end.children[0]) end = end.children[0];
  const headers = new Map(
    ctrl.data.noSweatPgnHeaders ?? [
      ['Event', 'Analysis'],
      ['Site', 'https://mutechess.org'],
      ['Date', '????.??.??'],
      ['Round', '?'],
      ['White', '?'],
      ['Black', '?'],
      ['Result', makeOutcome(position(end.fen).outcome())],
    ],
  );
  const outcome = position(end.fen).outcome();
  if (outcome) headers.set('Result', makeOutcome(outcome));
  if (root.fen !== INITIAL_FEN) {
    headers.set('SetUp', '1');
    headers.set('FEN', root.fen);
  } else {
    headers.delete('SetUp');
    headers.delete('FEN');
  }
  const moves = new Node<PgnNodeData>();
  const append = (into: Node<PgnNodeData>, from: TreeNodeLite) => {
    for (const child of from.children) {
      if (!child.san) continue;
      const comments = child.comments?.map(c => c.text) ?? [];
      const score = child.eval ?? child.ceval;
      if (score?.mate !== undefined || score?.cp !== undefined)
        comments.push(
          makeComment({
            evaluation:
              score.mate !== undefined
                ? { mate: score.mate, depth: score.depth }
                : { pawns: score.cp! / 100, depth: score.depth },
          }),
        );
      const node = new ChildNode<PgnNodeData>({
        san: child.san,
        nags: [...new Set(child.glyphs?.map(g => g.id))],
        comments,
      });
      into.children.push(node);
      append(node, child);
    }
  };
  append(moves, root);
  return makePgn({ headers, moves, comments: root.comments?.map(c => c.text) });
}

export function downloadBoardPgn(ctrl: AnalyseCtrl): void {
  const url = URL.createObjectURL(
    new Blob([boardPgn(ctrl)], { type: 'application/x-chess-pgn;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mutechess-analysis.pgn';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
