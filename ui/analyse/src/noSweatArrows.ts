import type { DrawShape } from '@lichess-org/chessground/draw';

import type { Candidate } from './noSweatCore';
// Match Lila's primary Stockfish arrow. Likelihood is a table value, not shaft width.
export const primaryArrowWidth = 15;
export const maiaShapes = (candidates: Candidate[]): DrawShape[] =>
  candidates.slice(0, 3).map(c => ({
    orig: c.uci.slice(0, 2) as Key,
    dest: c.uci.slice(2, 4) as Key,
    brush: 'yellow',
    modifiers: { lineWidth: primaryArrowWidth },
  }));
