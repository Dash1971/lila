import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import type { BrowserEngineInfo, EngineNotifier } from 'lib/ceval';
import type { Protocol } from 'lib/ceval/protocol';

const engines: FakeEngine[] = [];
class FakeEngine {
  readonly commands: string[] = [];
  module?: { uci: (command: string) => void };
  constructor(
    _info: BrowserEngineInfo,
    _status: EngineNotifier,
    readonly protocol: Protocol,
  ) {
    engines.push(this);
    void this.boot();
  }
  async boot(): Promise<void> {
    this.module = { uci: command => this.commands.push(command) };
    this.protocol.connected(command => this.commands.push(command));
    this.protocol.received('uciok');
    this.protocol.received('readyok');
  }
}
mock.module('../../lib/src/ceval/engines/stockfishWebEngine.ts', {
  namedExports: { StockfishWebEngine: FakeEngine },
});
const { ReviewFish } = await import('../src/noSweatFish');
const { legalUcis } = await import('../src/noSweatCore');
const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const start = async (multiPv?: number, moves: string[] = []) => {
  const fish = new ReviewFish(() => {});
  const abort = new AbortController();
  const result = fish.search(fen, moves, abort.signal, 12, 500, undefined, multiPv);
  await new Promise(resolve => setImmediate(resolve));
  const engine = engines.at(-1)!;
  engine.protocol.received('readyok');
  return { fish, engine, result, abort };
};
const line = (rank: number, move: string, depth = 12) =>
  `info depth ${depth} multipv ${rank} score cp ${40 - rank * 10} pv ${move}`;

test('chart root requests three genuine SF PVs and rejects an incomplete three-PV window', async () => {
  const { fish, engine, result } = await start(3);
  assert.ok(engine.commands.includes('setoption name MultiPV value 3'));
  assert.ok(engine.commands.includes('go depth 12 movetime 500'));
  engine.protocol.received(line(1, 'e2e4'));
  engine.protocol.received(line(2, 'd2d4'));
  engine.protocol.received('bestmove e2e4');
  await assert.rejects(result, /complete MultiPV iteration/);
  fish.destroy();
});

test('chart three-PV evidence retains only complete depths and three distinct roots', async () => {
  const { fish, engine, result } = await start(3);
  for (const [rank, move] of ['e2e4', 'd2d4', 'g1f3'].entries())
    engine.protocol.received(line(rank + 1, move));
  engine.protocol.received(line(1, 'e2e4', 13));
  engine.protocol.received(line(2, 'd2d4', 13));
  engine.protocol.received('bestmove e2e4');
  const review = await result;
  assert.equal(review.current.depth, 12);
  assert.deepEqual(
    review.current.lines.map(value => value.moves[0]),
    ['e2e4', 'd2d4', 'g1f3'],
  );
  fish.destroy();
});

test('default remains two PVs and a one-move candidate cannot request extra PVs', async () => {
  const standard = await start();
  assert.ok(standard.engine.commands.includes('setoption name MultiPV value 2'));
  standard.engine.protocol.received(line(1, 'e2e4'));
  standard.engine.protocol.received(line(2, 'd2d4'));
  standard.engine.protocol.received('bestmove e2e4');
  assert.equal((await standard.result).current.lines.length, 2);
  standard.fish.destroy();
  const candidate = await start(3, ['e2e4']);
  assert.ok(candidate.engine.commands.includes('setoption name MultiPV value 1'));
  assert.ok(candidate.engine.commands.includes('go depth 12 movetime 500 searchmoves e2e4'));
  candidate.engine.protocol.received(line(1, 'e2e4'));
  candidate.engine.protocol.received('bestmove e2e4');
  assert.equal((await candidate.result).current.lines.length, 1);
  candidate.fish.destroy();
});

test('candidate root PV requests stay bounded even with malformed caller values', async () => {
  for (const [requested, expected] of [
    [20, 3],
    [0, 1],
    [NaN, 2],
  ]) {
    const { fish, engine, result } = await start(requested);
    assert.ok(engine.commands.includes('setoption name MultiPV value ' + expected));
    for (const [rank, move] of ['e2e4', 'd2d4', 'g1f3'].slice(0, expected).entries())
      engine.protocol.received(line(rank + 1, move));
    engine.protocol.received('bestmove e2e4');
    assert.equal((await result).current.lines.length, expected);
    fish.destroy();
  }
});

test('Maia candidate screening publishes only complete all-legal iterations and keeps them on a partial next depth', async () => {
  const currentFen = 'r1bnkb1r/pp2pppp/1n6/4P3/2B5/5N2/PP3PPP/RNB1K2R w KQkq - 0 10';
  const moves = legalUcis(currentFen);
  assert.equal(moves.length, 38);
  const fish = new ReviewFish(() => {});
  const updates: number[] = [];
  const result = fish.search(currentFen, [], new AbortController().signal, 10, 0, Symbol(), moves.length, {
    allRoots: true,
    onUpdate: review => updates.push(review.current.lines.length),
  });
  await new Promise(resolve => setImmediate(resolve));
  const engine = engines.at(-1)!;
  engine.protocol.received('readyok');
  assert.ok(engine.commands.includes('setoption name MultiPV value 38'));
  assert.ok(engine.commands.includes('go depth 10'));
  moves.slice(0, -1).forEach((move, i) => engine.protocol.received(line(i + 1, move, 9)));
  assert.deepEqual(updates, []);
  engine.protocol.received(line(moves.length, moves.at(-1)!, 9));
  assert.deepEqual(updates, [38]);
  engine.protocol.received(line(1, moves[0], 10));
  engine.protocol.received('bestmove ' + moves[0]);
  const review = await result;
  assert.equal(review.current.depth, 9);
  assert.equal(review.current.lines.length, 38);
  fish.destroy();
});

for (const aborted of [false, true])
  test(`a ${aborted ? 'cancelled ' : ''}timed-out search discards its worker before any late output can enter the next search`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const first = await start();
    const rejected = assert.rejects(first.result, /review timed out/);
    if (aborted) first.abort.abort();
    t.mock.timers.tick(15501);
    await rejected;
    assert.ok(first.engine.commands.includes('quit'));
    const next = first.fish.search(fen, [], new AbortController().signal, 12, 500);
    await new Promise(resolve => setImmediate(resolve));
    const replacement = engines.at(-1)!;
    assert.notEqual(replacement, first.engine);
    replacement.protocol.received('readyok');
    first.engine.protocol.received(line(1, 'a2a3', 99));
    first.engine.protocol.received('bestmove a2a3');
    replacement.protocol.received(line(1, 'e2e4'));
    replacement.protocol.received(line(2, 'd2d4'));
    replacement.protocol.received('bestmove e2e4');
    assert.equal((await next).current.lines[0].moves[0], 'e2e4');
    first.fish.destroy();
  });
