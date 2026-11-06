import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { TreeNodeBase } from 'lib/tree/types';

import { classify, muteBrilliantSource } from '../src/noSweatClassify';
import { legalUcis, position } from '../src/noSweatCore';
import {
  classificationCounts,
  FullGameClassifier,
  gameReviewQuality,
  nativeReview,
  qualityGlyph,
} from '../src/noSweatFullReview';
import { SearchSnapshots } from '../src/noSweatSnapshots';

const game = JSON.parse(
  readFileSync(new URL('./fixtures/noSweat/stockfish18-fast.json', import.meta.url), 'utf8'),
).runs.find((g: any) => g.name === 'opera-1858');

test('the full Byrne–Fischer review uses isolated Mobile Maia evidence, including earlier complete iterations', async () => {
  const reference = JSON.parse(
    readFileSync(new URL('./fixtures/noSweat/stockfish18-fast.json', import.meta.url), 'utf8'),
  ).runs.find((g: any) => g.name === 'byrne-fischer-1956');
  const nodes = reference.positions.map((fen: string, ply: number) => ({
    ply,
    fen,
    uci: reference.moves[ply - 1],
    // Native chart evaluations are independent and must not be overwritten.
    eval: { cp: 42, pvs: [] },
  })) as TreeNodeBase[];
  const calls: { fen: string; session?: symbol }[] = [];
  const classifier = new FullGameClassifier({
    classify: async input => classify(input),
    search: async (fen, _signal, _depth, _time, session) => {
      calls.push({ fen, session });
      const snapshots = new SearchSnapshots(
        new Set(legalUcis(fen)),
        Math.min(2, legalUcis(fen).length),
        position(fen).turn === 'white',
      );
      reference.scores[reference.positions.indexOf(fen)].raw.forEach((line: string) => snapshots.add(line));
      return snapshots.completed
        ? { current: snapshots.completed, previous: snapshots.previous }
        : nativeReview({ fen } as TreeNodeBase)!;
    },
  });
  const results = await classifier.run(
    nodes,
    new AbortController().signal,
    () => true,
    () => {},
  );
  assert.deepEqual(
    [...results].filter(([, symbol]) => symbol === '!!').map(([ply]) => ply),
    [22, 34, 38],
  );
  assert.notEqual(results.get(23), '!!', '12.Qa3 must never receive the sacrificed knight’s award');
  assert.deepEqual(
    calls.slice(0, nodes.length).map(c => c.fen),
    reference.positions,
  );
  assert.ok(calls[0].session && calls.slice(0, nodes.length).every(c => c.session === calls[0].session));
  assert.ok(calls.length <= nodes.length + 6, 'Mobile Maia bounds additional confirmation to six searches');
  assert.ok(nodes.every(n => n.eval?.cp === 42 && n.eval.pvs.length === 0));
});
function node(index: number): TreeNodeBase {
  const snapshots = new SearchSnapshots(
    new Set(legalUcis(game.positions[index])),
    Math.min(2, legalUcis(game.positions[index]).length),
    position(game.positions[index]).turn === 'white',
  );
  game.scores[index].raw.forEach((line: string) => snapshots.add(line));
  const review = snapshots.completed!;
  return {
    ply: index,
    fen: game.positions[index],
    uci: index ? game.moves[index - 1] : undefined,
    eval: {
      ...review.lines[0],
      depth: review.depth,
      pvs: review.lines.map(pv => ({ ...pv, moves: pv.moves.join(' ') })),
    },
  } as TreeNodeBase;
}
test('Fast is bounded and old/invalid quality values fall back to the lightweight preset', () => {
  assert.deepEqual(gameReviewQuality(null), { name: 'Fast', depth: 12, movetime: 500 });
  assert.equal(gameReviewQuality('bad').name, 'Fast');
  assert.equal(gameReviewQuality('Balanced').depth, 14);
  assert.equal(gameReviewQuality('Thorough').movetime, 1500);
});
test('native complete two-PV data produces the independently confirmed Opera brilliant', async () => {
  const nodes = [node(18), node(19)];
  const calls: { depth: number; time: number }[] = [];
  const classifier = new FullGameClassifier({
    classify: async input => classify(input),
    search: async (fen, _signal, depth, time) => {
      calls.push({ depth, time });
      return nativeReview(nodes.find(n => n.fen === fen)!)!;
    },
  });
  const result = await classifier.run(
    nodes,
    new AbortController().signal,
    () => true,
    () => {},
  );
  assert.equal(result.get(19), '!!');
  assert.deepEqual(calls, [
    { depth: 12, time: 500 },
    { depth: 12, time: 500 },
    { depth: 14, time: 500 },
    { depth: 14, time: 500 },
  ]);
  assert.equal(qualityGlyph(result.get(19)!)?.source, muteBrilliantSource);
});
test('a stronger-window veto withholds a standout; cancellation prevents publication', async () => {
  const nodes = [node(18), node(19)];
  const classifier = new FullGameClassifier({
    classify: async input =>
      input.confirmation ? { ...classify(input), symbol: '', withheld: true } : classify(input),
    search: async fen => nativeReview(nodes.find(n => n.fen === fen)!)!,
  });
  assert.equal(
    (
      await classifier.run(
        nodes,
        new AbortController().signal,
        () => true,
        () => {},
      )
    ).has(19),
    false,
  );
  const aborted = new AbortController();
  const cancelling = new FullGameClassifier({
    classify: async input => {
      aborted.abort();
      return classify(input);
    },
    search: async () => {
      assert.equal(aborted.signal.aborted, false, 'must not search after cancellation');
      return nativeReview(nodes[0])!;
    },
  });
  await assert.rejects(
    cancelling.run(
      nodes,
      aborted.signal,
      () => true,
      () => {},
    ),
    /Cancelled/,
  );
});
test('imported annotations are protected and incomplete native chart roots never substitute for isolated evidence', async () => {
  let classified = 0;
  const classifier = new FullGameClassifier({
    classify: async input => {
      classified++;
      return classify(input);
    },
    search: async fen => nativeReview([node(18), node(19)].find(n => n.fen === fen)!)!,
  });
  const imported = { ...node(19), glyphs: [{ id: 5, symbol: '!?', name: 'Imported' }] };
  assert.equal(
    (
      await classifier.run(
        [node(18), imported],
        new AbortController().signal,
        () => true,
        () => {},
      )
    ).size,
    0,
  );
  const incomplete = node(18);
  incomplete.eval!.pvs = incomplete.eval!.pvs.slice(0, 1);
  assert.equal(nativeReview(incomplete), undefined);
  assert.equal(
    (
      await classifier.run(
        [incomplete, node(19)],
        new AbortController().signal,
        () => true,
        () => {},
      )
    ).get(19),
    '!!',
  );
  assert.ok(classified > 0);
});
test('summary counts the actual moving side, including games from a nonzero initial ply', () => {
  const nodes = [
    { ply: 18, fen: '', glyphs: [qualityGlyph('??')!] },
    { ply: 19, fen: '', uci: 'c3b5', glyphs: [qualityGlyph('!!')!] },
    { ply: 20, fen: '', uci: 'a6b5', glyphs: [qualityGlyph('?!')!] },
    { ply: 21, fen: '', uci: 'd1d2', glyphs: [{ id: 5, name: 'Imported', symbol: '!?' }] },
  ] as TreeNodeBase[];
  assert.deepEqual(classificationCounts(nodes, 'white'), [1, 0, 1, 0, 0, 0]);
  assert.deepEqual(classificationCounts(nodes, 'black'), [0, 0, 0, 1, 0, 0]);
});

test('Brilliant confirmation retains the prior position and spends at most six searches', async () => {
  const nodes = [node(16), node(17), node(18), node(19), node(20)];
  const calls: { fen: string; depth: number; session?: symbol }[] = [];
  const confirmed: number[] = [];
  const classifier = new FullGameClassifier({
    search: async (fen, _signal, depth, _time, session) => {
      calls.push({ fen, depth, session });
      return nativeReview(nodes.find(n => n.fen === fen)!)!;
    },
    classify: async input => {
      const base = { symbol: '', accuracy: 100, cpLoss: 0, withheld: false, version: 'test' } as const;
      if (input.positions.length < 3) return base;
      if (!input.confirmation) return { ...base, provisional: '!!', withheld: true };
      assert.equal(input.confirmation.length, input.positions.length);
      assert.equal(input.confirmation.length, 3);
      assert.deepEqual(input.confirmation[0].current, input.reviews[0].current);
      assert.equal(input.confirmation[0].quality, input.reviews[0].quality);
      confirmed.push(input.positions.length);
      return { ...base, symbol: '!!' };
    },
  });
  const results = await classifier.run(nodes, new AbortController().signal, () => true, () => {});
  assert.deepEqual(confirmed, [3, 3]);
  assert.equal(results.get(18), '!!');
  assert.equal(results.get(19), '!!');
  assert.equal(results.has(20), false, 'a third confirmation cannot exceed the six-search cap');
  assert.equal(calls.length, nodes.length + 6);
  for (let n = 0; n < 2; n++) {
    const batch = calls.slice(nodes.length + n * 3, nodes.length + n * 3 + 3);
    assert.deepEqual(batch.map(c => c.fen), nodes.slice(n, n + 3).map(n => n.fen));
    assert.ok(batch.every(c => c.depth === 14 && c.session === batch[0].session));
    assert.notEqual(batch[0].session, calls[0].session);
  }
  assert.notEqual(calls[nodes.length].session, calls[nodes.length + 3].session);
});

test('cancellation during the prior-position Brilliant confirmation publishes no result', async () => {
  const nodes = [node(17), node(18), node(19)];
  const controller = new AbortController();
  let calls = 0;
  const classifier = new FullGameClassifier({
    search: async fen => {
      if (++calls === nodes.length + 1) controller.abort();
      return nativeReview(nodes.find(n => n.fen === fen)!)!;
    },
    classify: async input => ({
      symbol: '', accuracy: 100, cpLoss: 0, withheld: input.positions.length === 3,
      provisional: input.positions.length === 3 ? '!!' : undefined, version: 'test',
    }),
  });
  await assert.rejects(classifier.run(nodes, controller.signal, () => true, () => {}), /Cancelled/);
  assert.equal(calls, nodes.length + 1);
});
