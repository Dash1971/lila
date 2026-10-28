import { read } from '@lichess-org/chessground/fen';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { PremoveSequence } from '../src/premoveSequence';

const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
describe('Mobile Maia stacked premoves', () => {
  test('same piece can move repeatedly on the projected board; original is unchanged', () => {
    const q = new PremoveSequence();
    assert.equal(q.add(start, 'white', { orig: 'e2', dest: 'e4' }), true);
    assert.equal(q.add(start, 'white', { orig: 'e4', dest: 'e5' }), true);
    assert.equal(read(q.project(start, 'white')).get('e5')?.role, 'pawn');
    assert.equal(read(start).get('e2')?.role, 'pawn');
    assert.equal(q.take(start, 'white', new Map([['e2', ['e3', 'e4']]]))?.dest, 'e4');
    assert.equal(q.moves.length, 1);
  });
  test('illegal head clears the complete plan, even if a later move is legal', () => {
    const q = new PremoveSequence();
    q.add(start, 'white', { orig: 'e2', dest: 'e4' });
    q.add(start, 'white', { orig: 'g1', dest: 'f3' });
    assert.equal(q.take(start, 'white', new Map([['g1', ['f3']]])), undefined);
    assert.equal(q.moves.length, 0);
  });
  test('capture of the planned piece invalidates the queue', () => {
    const q = new PremoveSequence();
    q.add(start, 'white', { orig: 'e2', dest: 'e4' });
    assert.equal(
      q.take(start.replace('PPPPPPPP', 'PPPPpPPP'), 'white', new Map([['e2', ['e4']]])),
      undefined,
    );
  });
  test('king-to-rook castling normalizes and projects both pieces', () => {
    const fen = '4k3/8/8/8/8/8/8/R3K2R';
    const q = new PremoveSequence();
    q.add(fen, 'white', { orig: 'e1', dest: 'h1' });
    const projected = read(q.project(fen, 'white'));
    assert.equal(projected.get('g1')?.role, 'king');
    assert.equal(projected.get('f1')?.role, 'rook');
    assert.equal(q.take(fen, 'white', new Map([['e1', ['h1']]]))?.dest, 'g1');
  });
  test('en passant projection removes only the opposing pawn; authoritative dests decide execution', () => {
    const fen = '4k3/8/8/3pP3/8/8/8/4K3';
    const q = new PremoveSequence();
    q.add(fen, 'white', { orig: 'e5', dest: 'd6' });
    const projected = read(q.project(fen, 'white'));
    assert.equal(projected.has('d5'), false);
    assert.equal(projected.get('d6')?.role, 'pawn');
    assert.equal(q.take(fen, 'white', new Map([['e5', ['e6']]])), undefined);
  });
  test('underpromotion is retained for a later move of the promoted piece', () => {
    const fen = '4k3/P7/8/8/8/8/8/4K3';
    const q = new PremoveSequence();
    q.add(fen, 'white', { orig: 'a7', dest: 'a8', promotion: 'knight' });
    q.add(fen, 'white', { orig: 'a8', dest: 'b6' });
    assert.equal(read(q.project(fen, 'white')).get('b6')?.role, 'knight');
    assert.equal(q.take(fen, 'white', new Map([['a7', ['a8']]]))?.promotion, 'knight');
  });
  test('black castling, capture projection and promotion work without orientation assumptions', () => {
    const q = new PremoveSequence();
    const fen = 'r3k2r/8/8/8/8/8/1p6/R3K3';
    q.add(fen, 'black', { orig: 'e8', dest: 'a8' });
    q.add(fen, 'black', { orig: 'b2', dest: 'a1', promotion: 'rook' });
    const p = read(q.project(fen, 'black'));
    assert.equal(p.get('c8')?.role, 'king');
    assert.equal(p.get('d8')?.role, 'rook');
    assert.deepEqual(p.get('a1'), { role: 'rook', color: 'black' });
  });
  test('cancellation invalidates scheduled execution generations; queue length is bounded', () => {
    const q = new PremoveSequence();
    for (let i = 0; i < 32; i++) {
      q.add(start, 'white', { orig: 'g1', dest: 'f3' });
      q.add(start, 'white', { orig: 'f3', dest: 'g1' });
    }
    assert.equal(q.moves.length, 64);
    assert.equal(q.add(start, 'white', { orig: 'e2', dest: 'e4' }), false);
    const generation = q.generation;
    q.clear();
    assert.ok(q.generation > generation);
    assert.equal(q.take(start, 'white', new Map([['e2', ['e4']]])), undefined);
  });
  test('Mobile Maia square tints keep only the last use of an intermediate square', () => {
    const q = new PremoveSequence();
    q.add(start, 'white', { orig: 'g1', dest: 'f3' });
    q.add(start, 'white', { orig: 'f3', dest: 'g5' });
    assert.deepEqual(
      [...q.destinations],
      [
        ['g1', false],
        ['f3', false],
        ['g5', true],
      ],
    );
  });
});
