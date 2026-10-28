// Adapted from Mobile Maia PremoveSequence (AGPL-3.0), see extension provenance.
// A visual plan only. Server-provided destinations authorize every execution.
import { read, write } from '@lichess-org/chessground/fen';
import type { Color, Key, Pieces, Role } from '@lichess-org/chessground/types';

export interface QueuedMove {
  orig: Key;
  dest: Key;
  promotion?: Role;
}

export class PremoveSequence {
  readonly moves: QueuedMove[] = [];
  generation = 0;
  clear(): void {
    this.moves.length = 0;
    this.generation++;
  }
  add(fen: string, color: Color, move: QueuedMove): boolean {
    if (this.moves.length >= 64) return false;
    const piece = read(this.project(fen, color)).get(move.orig);
    if (piece?.color !== color) return false;
    if (piece.role === 'king' && move.orig.startsWith('e') && move.orig[1] === move.dest[1]) {
      if (move.dest.startsWith('h')) move = { ...move, dest: ('g' + move.orig[1]) as Key };
      if (move.dest.startsWith('a')) move = { ...move, dest: ('c' + move.orig[1]) as Key };
    }
    if (piece.role === 'pawn' && ['1', '8'].includes(move.dest[1]))
      move = { ...move, promotion: move.promotion ?? 'queen' };
    this.moves.push(move);
    return true;
  }
  // Do not use this projection for legality, clocks, material or persistence.
  project(fen: string, color: Color): string {
    const pieces: Pieces = read(fen);
    for (const move of this.moves) {
      const piece = pieces.get(move.orig);
      if (piece?.color !== color) continue;
      if (
        piece.role === 'king' &&
        move.orig.startsWith('e') &&
        move.orig[1] === move.dest[1] &&
        ['c', 'g'].includes(move.dest[0])
      ) {
        const rookFrom = ((move.dest.startsWith('c') ? 'a' : 'h') + move.orig[1]) as Key;
        const rookTo = ((move.dest.startsWith('c') ? 'd' : 'f') + move.orig[1]) as Key;
        const rook = pieces.get(rookFrom);
        if (rook?.role === 'rook' && rook.color === color) {
          pieces.delete(rookFrom);
          pieces.set(rookTo, rook);
        }
      }
      if (piece.role === 'pawn' && !move.dest.startsWith(move.orig[0]) && !pieces.has(move.dest)) {
        const captured = (move.dest[0] + move.orig[1]) as Key;
        const enemy = pieces.get(captured);
        if (enemy?.role === 'pawn' && enemy.color !== color) pieces.delete(captured);
      }
      pieces.delete(move.orig);
      pieces.set(move.dest, { ...piece, role: move.promotion ?? piece.role });
    }
    return write(pieces);
  }
  get destinations(): Map<Key, boolean> {
    const squares = new Map<Key, boolean>();
    for (const move of this.moves) {
      squares.set(move.orig, false);
      squares.set(move.dest, true);
    }
    return squares;
  }
  take(fen: string, color: Color, dests: Map<Key, Key[]>): QueuedMove | undefined {
    const move = this.moves.shift();
    if (!move) return undefined;
    const piece = read(fen).get(move.orig);
    const allowed = dests.get(move.orig) ?? [];
    const castleRook =
      piece?.role === 'king' &&
      move.orig.startsWith('e') &&
      ['c', 'g'].includes(move.dest[0]) &&
      move.orig[1] === move.dest[1]
        ? (((move.dest.startsWith('c') ? 'a' : 'h') + move.orig[1]) as Key)
        : undefined;
    if (
      piece?.color !== color ||
      (!allowed.includes(move.dest) && !(castleRook && allowed.includes(castleRook))) ||
      (move.promotion && (piece.role !== 'pawn' || !['1', '8'].includes(move.dest[1])))
    ) {
      this.clear();
      return undefined;
    }
    return move;
  }
}
