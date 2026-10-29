import { Chessground } from '@lichess-org/chessground';
import assert from 'node:assert/strict';
import { test, mock } from 'node:test';

mock.module('voice', {
  namedExports: { makeVoiceMove: () => undefined, renderVoiceBar: () => undefined },
});
mock.module('keyboard-move', { namedExports: { ctrl: () => undefined, render: () => undefined } });
const { default: RoundController } = await import('../src/ctrl');
const ground = await import('../src/ground');
import type { ApiMove, RoundOpts } from '../src/interfaces';

// Exercise the native controller and real Chessground, including every published FEN.
function fixture(t: any, color: Color) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  Object.assign(globalThis, {
    location: window.location,
    $: () => ({ toggleClass() {}, hasClass: () => false }),
  });
  Object.assign(site, {
    blindMode: false,
    sound: { move() {}, play() {}, saySan() {}, speech: () => false },
  });
  localStorage.clear();
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
  const e4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR';
  const sends: string[] = [];
  const ctrl = new RoundController(
    {
      noab: true,
      socketSend: (type: string, data: any) => {
        if (type === 'move') sends.push(data.u);
      },
      data: {
        game: {
          id: 'fixture',
          variant: { key: 'standard' },
          status: { id: 20, name: 'started' },
          turns: color === 'white' ? 1 : 0,
          player: color === 'white' ? 'black' : 'white',
        },
        player: { color, id: 'test', version: 0 },
        opponent: { color: color === 'white' ? 'black' : 'white' },
        pref: { enablePremove: true, animationDuration: 0, submitMove: false, coords: 0 },
        steps:
          color === 'white'
            ? [
                { ply: 0, fen: start },
                { ply: 1, fen: e4, uci: 'e2e4', san: 'e4' },
              ]
            : [{ ply: 0, fen: start }],
      },
    } as unknown as RoundOpts,
    () => {},
  );
  ctrl.setTitle = () => {};
  ctrl.chessground = Chessground(document.createElement('div'), ground.makeConfig(ctrl));
  const updates: string[] = [];
  for (const name of ['set', 'move', 'setPieces'] as const) {
    const original = ctrl.chessground[name].bind(ctrl.chessground) as (...args: any[]) => any;
    (ctrl.chessground[name] as any) = (...args: any[]) => {
      const result = original(...args);
      updates.push(ctrl.chessground.getFen());
      return result;
    };
  }
  const queue = (orig: Key, dest: Key) => ctrl.makeCgHooks().onPremove(orig, dest, {});
  const reply = (ply: number, uci: string, fen: string, dests?: Record<string, string>) =>
    ctrl.apiMove({ ply, uci, fen, san: uci, dests } as ApiMove);
  t.after(() => {
    ctrl.transientMove?.clear();
    ctrl.chessground.destroy();
    t.mock.timers.reset();
  });
  return { ctrl, updates, sends, queue, reply };
}
for (const color of ['white', 'black'] as const)
  test(`${color}: queued knight never leaves its final projected square during replies or acknowledgements`, t => {
    const { ctrl, updates, sends, queue, reply } = fixture(t, color);
    const white = color === 'white';
    queue(white ? 'g1' : 'g8', white ? 'f3' : 'f6');
    queue(white ? 'f3' : 'f6', white ? 'g5' : 'g4');
    updates.length = 0;
    reply(
      white ? 2 : 1,
      white ? 'e7e5' : 'e2e4',
      white
        ? 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR'
        : 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR',
      white ? { g1: 'f3h3' } : { g8: 'f6h6' },
    );
    t.mock.timers.tick(1);
    assert.ok(updates.length);
    const dest = white ? 'g5' : 'g4';
    for (const fen of updates) {
      assert.equal(read(fen).get(dest)?.role, 'knight', `Intermediate board lost projection: ${fen}`);
    }
    assert.deepEqual(sends, [white ? 'g1f3' : 'g8f6']);
    assert.equal(ctrl.premoveSequence.moves.length, 1);
    const assertProjected = () => {
      assert.ok(updates.length);
      for (const fen of updates) assert.equal(read(fen).get(dest)?.role, 'knight', `Projection lost: ${fen}`);
      updates.length = 0;
    };
    assertProjected();
    reply(
      white ? 3 : 2,
      white ? 'g1f3' : 'g8f6',
      white
        ? 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R'
        : 'rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR',
    );
    assertProjected();
    reply(
      white ? 4 : 3,
      white ? 'd7d5' : 'd2d4',
      white
        ? 'rnbqkbnr/ppp2ppp/8/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R'
        : 'rnbqkb1r/pppppppp/5n2/8/3PP3/8/PPP2PPP/RNBQKBNR',
      white ? { f3: 'g5h4e5d4d2e1h2' } : { f6: 'g4h5e4d5d7e8h7' },
    );
    t.mock.timers.tick(1);
    assertProjected();
    assert.deepEqual(sends, white ? ['g1f3', 'f3g5'] : ['g8f6', 'f6g4']);
    assert.equal(ctrl.premoveSequence.moves.length, 0);
    assert.equal(ctrl.chessground.state.highlight.custom?.size, 0);
    const committed = white
      ? 'rnbqkbnr/ppp2ppp/8/3pp1N1/4P3/8/PPPP1PPP/RNBQKB1R'
      : 'rnbqkb1r/pppppppp/8/8/3PP1n1/8/PPP2PPP/RNBQKBNR';
    reply(white ? 5 : 4, white ? 'f3g5' : 'f6g4', committed);
    assert.equal(ctrl.chessground.getFen(), committed);
    assert.deepEqual(
      ctrl.data.steps.slice(-4).map(n => n.uci),
      white ? ['e7e5', 'g1f3', 'd7d5', 'f3g5'] : ['e2e4', 'g8f6', 'd2d4', 'f6g4'],
    );
  });
import { read } from '@lichess-org/chessground/fen';
test('cancelling after execution reveals the accepted move, not the rest of the plan', t => {
  const { ctrl, queue, reply, sends } = fixture(t, 'white');
  queue('g1', 'f3');
  queue('f3', 'g5');
  const authoritative = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR';
  reply(2, 'e7e5', authoritative, { g1: 'f3h3' });
  ctrl.clearQueuedPremoves();
  assert.equal(ctrl.chessground.state.pieces.get('f3')?.role, 'knight');
  assert.equal(ctrl.chessground.state.pieces.has('g5'), false);
  assert.deepEqual(sends, ['g1f3']);
});
test('an illegal head reveals the authoritative board and never submits a later queued move', t => {
  const { ctrl, queue, reply, sends } = fixture(t, 'white');
  queue('g1', 'f3');
  queue('f3', 'g5');
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR';
  reply(2, 'e7e5', fen, { g1: 'h3' });
  t.mock.timers.tick(1);
  assert.equal(ctrl.chessground.getFen(), fen);
  assert.equal(ctrl.premoveSequence.moves.length, 0);
  assert.deepEqual(sends, []);
});
test('a terminal opponent reply immediately reveals the real position and discards projection', t => {
  const { ctrl, queue, sends } = fixture(t, 'white');
  queue('g1', 'f3');
  queue('f3', 'g5');
  const fen = 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/8/PPPP1PPP/RNBQKBNR';
  ctrl.apiMove({
    ply: 2,
    uci: 'd8h4',
    fen,
    san: 'Qh4#',
    status: { id: 30, name: 'mate' },
    winner: 'black',
  } as ApiMove);
  assert.equal(ctrl.chessground.getFen(), fen);
  assert.equal(ctrl.premoveSequence.moves.length, 0);
  assert.deepEqual(sends, []);
});
test('the opponent clock update precedes the premove hard stop, preserving native clock timing', t => {
  const { ctrl, queue } = fixture(t, 'white');
  queue('g1', 'f3');
  queue('f3', 'g5');
  const clocks: string[] = [];
  ctrl.clock = {
    setClock: () => clocks.push('server clock'),
    isRunning: () => true,
    hardStopClock: () => clocks.push('premove stop'),
  } as unknown as NonNullable<typeof ctrl.clock>;
  ctrl.apiMove({
    ply: 2,
    uci: 'e7e5',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR',
    san: 'e5',
    dests: { g1: 'f3h3' },
    clock: { white: 59, black: 59 },
  });
  assert.deepEqual(clocks, ['server clock', 'premove stop']);
});
