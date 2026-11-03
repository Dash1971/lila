import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { classify, muteBrilliantSource, type ClassificationInput } from '../src/noSweatClassify';

interface Case {
  key: string;
  san: string;
  observed_label: string;
  expected_forest: boolean;
  expected_ec?: string | null;
  input: ClassificationInput;
}
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/noSweat/brilliant-v5.json', import.meta.url), 'utf8'),
);
const cases: Case[] = fixture.cases;
const positive = cases.find(c => c.key === '167741829524:33')!;
const copy = <T>(value: T): T => structuredClone(value);

test('the fixed model reproduces saved sacrifices, rejections and disclosed disagreements', () => {
  assert.equal(
    createHash('sha256')
      .update(readFileSync(new URL('../src/noSweatBrilliantForestModel.json', import.meta.url)))
      .digest('hex'),
    fixture.model_sha256,
    'the published model is the same one frozen before the fresh labels',
  );
  for (const c of cases) {
    const actual = classify(c.input);
    const ec = classify({ ...c.input, policy: 'en-croissant' });
    assert.equal(actual.symbol === '!!', c.expected_forest, `${c.key} ${c.san}`);
    assert.equal(actual.version, muteBrilliantSource);
    assert.equal(
      actual.accuracy,
      ec.accuracy,
      'native score meaning is independent of Brilliant eligibility',
    );
    assert.equal(actual.cpLoss, ec.cpLoss);
    if (c.expected_ec !== undefined && c.expected_ec !== null) assert.equal(ec.symbol, c.expected_ec);
  }
  assert.equal(cases.find(c => c.san === 'Ndxe5')!.expected_forest, false);
  assert.equal(
    cases.find(c => c.san === 'Nxd5')!.expected_forest,
    false,
    'the real Brilliant miss is disclosed',
  );
  assert.equal(
    cases.find(c => c.san === 'Rxd7+')!.observed_label,
    'excellent',
    'the remaining extra award is retained',
  );
});

test('one completed model window cannot publish a Brilliant without corroboration', () => {
  const bare = copy(positive.input);
  for (const r of bare.reviews) delete r.previous;
  const result = classify(bare);
  assert.equal(result.provisional, '!!');
  assert.equal(result.symbol, '');
  assert.equal(result.withheld, true);
  const confirmation = positive.input.reviews.map(r => ({ current: copy(r.current), quality: r.quality }));
  assert.equal(classify({ ...bare, confirmation }).symbol, '!!');
  const contradiction = copy(confirmation);
  contradiction.at(-1)!.current.lines[0] = { cp: -500, moves: [] };
  assert.equal(classify({ ...bare, confirmation: contradiction }).withheld, true);
  assert.equal(
    classify({ ...bare, confirmation: confirmation.map(r => ({ ...r, quality: 'different' })) }).withheld,
    true,
  );
  assert.equal(
    classify({
      ...bare,
      confirmation: confirmation.map(r => ({ ...r, current: { ...r.current, depth: r.current.depth - 1 } })),
    }).withheld,
    true,
  );
});

test('a declined model badge preserves stable other annotations and explicit evidence provenance', () => {
  const great = cases.find(c => c.expected_ec === '!')!;
  const poor = cases.find(c => c.expected_ec === '?!')!;
  assert.equal(classify(great.input).symbol, '!');
  assert.equal(classify(poor.input).symbol, '?!');
  const missing = copy(positive.input);
  for (const r of missing.reviews) delete (r as Partial<typeof r>).quality;
  assert.equal(classify(missing).symbol, '');
  assert.equal(classify(missing).withheld, true);
  const malformed = copy(positive.input);
  malformed.reviews[0].current.lines[0].cp = Number.NaN;
  assert.throws(() => classify(malformed), /finite/i);
});

test('a browser physical-probe timeout cannot publish or request confirmation of a Brilliant', t => {
  let clock = 0;
  t.mock.method(performance, 'now', () => (clock += 2000));
  const result = classify(positive.input);
  assert.notEqual(result.symbol, '!!');
  assert.notEqual(result.provisional, '!!');
  assert.equal(
    result.withheld,
    false,
    'incomplete board evidence must not consume engine confirmation searches',
  );
});
