import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { TreeNodeBase } from 'lib/tree/types';

import { classify } from '../src/noSweatClassify';
import { legalUcis, position } from '../src/noSweatCore';
import {
  classificationCounts,
  FullGameClassifier,
  gameReviewQuality,
  nativeReview,
  qualityGlyph,
  reviewSource,
} from '../src/noSweatFullReview';
import { SearchSnapshots } from '../src/noSweatSnapshots';

const game = JSON.parse(
  readFileSync(new URL('./fixtures/noSweat/stockfish18-fast.json', import.meta.url), 'utf8'),
).runs.find((g: any) => g.name === 'opera-1858');
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
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.depth >= 14 && c.time === 1000));
  assert.equal(qualityGlyph(result.get(19)!)?.source, reviewSource);
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
      throw new Error('must not search after cancellation');
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
test('imported annotations are protected and missing/duplicate roots are not classified', async () => {
  let classified = 0;
  const classifier = new FullGameClassifier({
    classify: async input => {
      classified++;
      return classify(input);
    },
    search: async () => {
      throw new Error('no search expected');
    },
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
    ).size,
    0,
  );
  assert.equal(classified, 0);
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
