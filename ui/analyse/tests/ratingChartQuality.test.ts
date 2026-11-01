import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ratingChartQualities } from '../src/noSweatRatingChartQuality';

test('chart colors use Stockfish quality groups and ranks across all evaluated moves', () => {
  const scores = new Map<string, EvalScore>([
    ['blunder', { cp: -500 }],
    ['good', { cp: -30 }],
    ['best', { cp: 0 }],
    ['ok', { cp: -100 }],
    ['worse', { cp: -700 }],
  ]);
  const colors = ratingChartQualities(scores, true);
  assert.equal(colors.get('best')?.color, '#238b45');
  assert.equal(colors.get('good')?.color, '#41ab5d');
  assert.equal(colors.get('ok')?.color, '#ffffcc');
  assert.equal(colors.get('blunder')?.color, '#fcbba1');
  assert.equal(colors.get('worse')?.color, '#fc9272');
  assert.deepEqual(
    ['best', 'good', 'ok', 'blunder', 'worse'].map(move => colors.get(move)?.quality),
    ['good', 'good', 'ok', 'blunder', 'blunder'],
  );
  assert.ok(colors.get('ok')!.loss > 0.05 && colors.get('ok')!.loss <= 0.1);
  assert.ok(colors.get('blunder')!.loss > 0.1);

  // An evaluated move outside a plotted subset still participates in shade rank.
  const subset = ratingChartQualities(
    new Map([
      ['best', scores.get('best')!],
      ['good', scores.get('good')!],
    ]),
    true,
  );
  scores.set('unplotted', { cp: -10 });
  assert.equal(subset.get('good')?.color, '#41ab5d');
  assert.equal(ratingChartQualities(scores, true).get('good')?.color, '#74c476');
});

test('chart shade caps and exact ties are deterministic, independent of input order', () => {
  const rows = ['f', 'd', 'b', 'e', 'a', 'c'].map(uci => [uci, { cp: 0 }] as const);
  const forward = ratingChartQualities(new Map(rows), true);
  const reverse = ratingChartQualities(new Map(rows.toReversed()), true);
  assert.deepEqual([...forward], [...reverse]);
  assert.deepEqual(
    [...forward.values()].map(value => value.color),
    ['#238b45', '#41ab5d', '#74c476', '#90D289', '#AEDFA4', '#AEDFA4'],
  );
});

test('chart quality uses mover perspective while tied shades use Maia raw White CP ordering', () => {
  const white = new Map<string, EvalScore>([
    ['best', { cp: 0 }],
    ['good', { cp: -30 }],
    ['ok', { cp: -100 }],
    ['blunder', { cp: -500 }],
  ]);
  const black = new Map([...white].map(([uci, score]) => [uci, { cp: -score.cp! }]));
  assert.deepEqual([...ratingChartQualities(white, true)], [...ratingChartQualities(black, false)]);
  const ties = ratingChartQualities(
    new Map([
      ['less', { cp: -1300 }],
      ['more', { cp: -1500 }],
    ]),
    false,
  );
  assert.deepEqual([...ties.keys()], ['less', 'more']);
});

test('mate evidence remains valid while unknown or malformed evidence stays unmapped', () => {
  const quality = ratingChartQualities(
    new Map<string, EvalScore>([
      ['winning', { mate: 2 }],
      ['also-winning', { mate: 4 }],
      ['losing', { mate: -2 }],
      ['unknown', {}],
      ['nan-cp', { cp: NaN }],
      ['nan-mate', { mate: NaN }],
    ]),
    true,
  );
  assert.equal(quality.get('winning')?.quality, 'good');
  assert.equal(quality.get('also-winning')?.quality, 'good');
  assert.equal(quality.get('losing')?.quality, 'blunder');
  assert.equal(quality.size, 3);
  assert.equal(ratingChartQualities(new Map(), true).size, 0);
});
