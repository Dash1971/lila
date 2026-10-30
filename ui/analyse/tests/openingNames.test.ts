import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { identifyOpening, openingEpd, type OpeningEntry } from '../src/noSweatOpening';

const rows: OpeningEntry[] = JSON.parse(
  readFileSync(new URL('../../../public/nosweat/openings.json', import.meta.url), 'utf8'),
);
const table = new Map(rows.map(([epd, eco, name]) => [epd, `${eco} · ${name}`]));
const initial = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const e4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

test('Mobile Maia opening table includes ECO codes and legal en-passant normalization', () => {
  assert.equal(rows.length, 3810);
  assert.equal(openingEpd(e4), e4.replace('e3 0 1', '-').split(' ').slice(0, 4).join(' '));
  assert.match(identifyOpening([initial, e4], table)!, /^[A-E][0-9]{2} · /);
  assert.equal(identifyOpening([initial], table), undefined);
  assert.equal(openingEpd('not a fen'), undefined);
});

test('latest recognized position on the viewed path wins, independent of move order and counters', () => {
  const first = openingEpd(e4)!;
  const e5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  const labels = new Map([
    [first, 'B00 · First'],
    [openingEpd(e5)!, 'C20 · Later'],
  ]);
  assert.equal(identifyOpening([initial, e4, e5], labels), 'C20 · Later');
  assert.equal(identifyOpening([initial, e4], labels), 'B00 · First');
  assert.equal(identifyOpening([e5.replace('0 2', '17 42')], labels), 'C20 · Later');
});
