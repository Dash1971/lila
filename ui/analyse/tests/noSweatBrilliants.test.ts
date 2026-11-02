import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { TreeNodeLite } from 'lib/tree/types';

import { BrilliantVerifier, brilliantGlyph, mainlineKey } from '../src/noSweatBrilliants';
import { classify, isSacrifice } from '../src/noSweatClassify';
import { legalUcis, position } from '../src/noSweatCore';
import { SearchSnapshots } from '../src/noSweatSnapshots';
import { mergeReviewData } from '../src/util';
const game = JSON.parse(
  readFileSync(new URL('./fixtures/noSweat/stockfish18-fast.json', import.meta.url), 'utf8'),
).runs.find((g: any) => g.name === 'opera-1858');
const nodes = [
  { ply: 18, fen: game.positions[18], id: '', children: [] },
  { ply: 19, fen: game.positions[19], id: 'ab', uci: game.moves[18], children: [] },
];
const review = (fen: string) => {
  const index = game.positions.indexOf(fen);
  const snapshots = new SearchSnapshots(
    new Set(legalUcis(fen)),
    Math.min(2, legalUcis(fen).length),
    position(fen).turn === 'white',
  );
  game.scores[index].raw.forEach((line: string) => snapshots.add(line));
  return { current: snapshots.completed!, previous: snapshots.previous };
};
test('Opera Game Nb5 reference is published only after independent whole-window confirmation', async () => {
  const calls: number[] = [];
  const verifier = new BrilliantVerifier({
    sacrifice: async (a, b) => isSacrifice(a, b),
    search: async (fen, _signal, depth) => {
      calls.push(depth);
      return review(fen);
    },
    classify: async input => classify(input),
  });
  const found = await verifier.run(
    nodes,
    new AbortController().signal,
    () => true,
    () => {},
  );
  assert.equal(game.annotations[18], '!!');
  assert.deepEqual(found, [{ ply: 19, fen: game.positions[19], uci: 'c3b5' }]);
  assert.deepEqual(calls, [14, 14, 16, 16]);
});
test('a whole-window veto or native/imported quality annotation never produces a brilliant', async () => {
  const verifier = new BrilliantVerifier({
    sacrifice: async () => true,
    search: async fen => review(fen),
    classify: async input =>
      input.confirmation ? { ...classify(input), symbol: '', withheld: true } : classify(input),
  });
  assert.deepEqual(
    await verifier.run(
      nodes,
      new AbortController().signal,
      () => true,
      () => {},
    ),
    [],
  );
  let searched = false;
  const protectedVerifier = new BrilliantVerifier({
    sacrifice: async () => {
      searched = true;
      return true;
    },
    search: async fen => review(fen),
    classify: async input => classify(input),
  });
  for (const id of [1, 2, 3, 4, 5, 6]) {
    assert.deepEqual(
      await protectedVerifier.run(
        [nodes[0], { ...nodes[1], glyphs: [{ id, name: 'Imported', symbol: '?' }] }],
        new AbortController().signal,
        () => true,
        () => {},
      ),
      [],
    );
  }
  assert.equal(searched, false);
});
test('cancellation and changed mainline identity prevent late publication', async () => {
  const abort = new AbortController();
  let current = true;
  const verifier = new BrilliantVerifier({
    sacrifice: async () => {
      abort.abort();
      return true;
    },
    search: async fen => review(fen),
    classify: async input => classify(input),
  });
  await assert.rejects(
    verifier.run(
      nodes,
      abort.signal,
      () => true,
      () => {},
    ),
    /Cancelled/,
  );
  const stale = new BrilliantVerifier({
    sacrifice: async () => {
      current = false;
      return true;
    },
    search: async fen => review(fen),
    classify: async input => classify(input),
  });
  await assert.rejects(
    stale.run(
      nodes,
      new AbortController().signal,
      () => current,
      () => {},
    ),
    /Cancelled/,
  );
  assert.notEqual(mainlineKey(nodes), mainlineKey([{ ...nodes[0], fen: game.positions[17] }, nodes[1]]));
});
test('native tree merge preserves imported judgments instead of adding a conflicting computed brilliant', () => {
  const into = { ...nodes[1], glyphs: [{ id: 2, symbol: '?', name: 'Mistake' }] } as TreeNodeLite;
  const from = { ...nodes[1], glyphs: [brilliantGlyph()] } as TreeNodeLite;
  mergeReviewData(into, from);
  assert.equal(into.glyphs?.length, 1);
  assert.equal(into.glyphs?.[0].id, 2);
  const clean = { ...nodes[1] } as TreeNodeLite;
  mergeReviewData(clean, from);
  assert.equal(clean.glyphs?.[0].source, 'mute-chess-brilliant-v2');
});
