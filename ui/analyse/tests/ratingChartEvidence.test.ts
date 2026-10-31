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
const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const start = async (multiPv?: number, moves: string[] = []) => {
  const fish = new ReviewFish(() => {});
  const result = fish.search(fen, moves, new AbortController().signal, 12, 500, undefined, multiPv);
  await new Promise(resolve => setImmediate(resolve));
  const engine = engines.at(-1)!;
  engine.protocol.received('readyok');
  return { fish, engine, result };
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
