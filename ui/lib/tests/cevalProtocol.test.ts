import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Protocol } from '../src/ceval/protocol';
import type { BrowserEngineInfo, Work } from '../src/ceval/types';
import type { LocalEval } from '../src/tree/types';
const info: BrowserEngineInfo = {
  id: 'fixture',
  name: 'fixture',
  short: 'SF',
  tech: 'NNUE',
  minThreads: 1,
  maxThreads: 1,
  requires: [],
  assets: {},
};
const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
function fixture() {
  const emitted: LocalEval[] = [];
  const protocol = new Protocol(info);
  protocol.connected(() => {});
  protocol.received('uciok');
  const work: Work = {
    variant: 'chess',
    threads: 1,
    stopRequested: false,
    search: { depth: 18 },
    multiPv: 2,
    initialFen: fen,
    currentFen: fen,
    moves: [],
    path: '',
    ply: 0,
    threatMode: false,
    emit: ev => {
      if (ev) emitted.push(ev);
    },
  };
  protocol.compute(work);
  protocol.received('readyok');
  const line = (depth: number, rank: number, move: string) =>
    protocol.received(`info depth ${depth} multipv ${rank} score cp 20 nodes 100 time 1 pv ${move}`);
  return { emitted, line, finish: (move: string) => protocol.received('bestmove ' + move) };
}
test('Stockfish skipped-depth and same-depth rank changes keep two distinct current choices', () => {
  const { emitted, line } = fixture();
  line(1, 1, 'e2e4');
  line(1, 2, 'd2d4');
  line(3, 1, 'd2d4');
  line(3, 2, 'e2e4');
  assert.deepEqual(
    emitted.at(-1)!.pvs.map(pv => pv.moves[0]),
    ['d2d4', 'e2e4'],
  );
  assert.equal(emitted.at(-1)!.depth, 3);
  line(3, 1, 'g1f3');
  line(3, 2, 'd2d4');
  assert.deepEqual(
    emitted.at(-1)!.pvs.map(pv => pv.moves[0]),
    ['g1f3', 'd2d4'],
  );
});
test('Stockfish does not publish mixed-depth or duplicate-rank candidates', () => {
  const { emitted, line } = fixture();
  line(1, 1, 'e2e4');
  line(1, 2, 'd2d4');
  const count = emitted.length;
  line(3, 2, 'e2e4');
  assert.equal(emitted.length, count);
  line(3, 1, 'e2e4');
  line(3, 2, 'e2e4');
  assert.equal(emitted.length, count);
  line(3, 1, 'd2d4');
  line(3, 2, 'e2e4');
  assert.equal(emitted.length, count + 1);
});
test('native search sends both depth and time bounds for fast whole-game review', () => {
  const sent: string[] = [];
  const protocol = new Protocol(info);
  protocol.connected(command => sent.push(command));
  protocol.received('uciok');
  protocol.compute({
    variant: 'chess',
    threads: 1,
    stopRequested: false,
    search: { depth: 12, movetime: 500 },
    multiPv: 2,
    initialFen: fen,
    currentFen: fen,
    moves: [],
    path: '',
    ply: 0,
    threatMode: false,
    emit: () => {},
  });
  protocol.received('readyok');
  assert.ok(sent.includes('go depth 12 movetime 500'));
});

test('a timed stop retains the last complete MultiPV iteration instead of a partial deeper root', () => {
  const { emitted, line, finish } = fixture();
  line(12, 1, 'e2e4');
  line(12, 2, 'd2d4');
  line(13, 1, 'g1f3');
  finish('g1f3');
  assert.equal(emitted.at(-1)!.depth, 12);
  assert.deepEqual(
    emitted.at(-1)!.pvs.map(pv => pv.moves[0]),
    ['e2e4', 'd2d4'],
  );
});
