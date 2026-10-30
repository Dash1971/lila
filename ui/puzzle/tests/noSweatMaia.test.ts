import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attributesModule, init, type VNode } from 'snabbdom';

import { hl } from 'lib/view';

import { puzzleMaiaChannel, fitPuzzleMaiaRow } from '../src/noSweatMaia';

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const primary = [
  { uci: 'e2e4', probability: 0.492 },
  { uci: 'd2d4', probability: 0.172 },
  { uci: 'g1f3', probability: 0.048 },
  { uci: 'c2c4', probability: 0.2876 },
  { uci: 'b1c3', probability: 0.0004 },
];

test('one-line fitting preserves raw probability mass and restores previews when width grows', () => {
  const channel = {
    id: 'fit',
    fen,
    rating: 1600,
    candidates: primary,
    color: 'orange',
    status: '',
    expanded: false,
    toggle: () => {},
    play: () => {},
  };
  const host = document.createElement('div');
  document.body.append(host);
  const vnode = init([attributesModule])(host, puzzleMaiaChannel(channel));
  const root = vnode.elm as HTMLElement;
  const row = root.querySelector<HTMLElement>('.nosweat-maia-line')!;
  let width = 240;
  Object.defineProperty(row, 'clientWidth', { get: () => width });
  Object.defineProperty(row, 'scrollWidth', {
    get: () =>
      140 + [...row.querySelectorAll<HTMLElement>('.nosweat-maia-move')].filter(e => !e.hidden).length * 60,
  });
  fitPuzzleMaiaRow(row, channel);
  assert.equal([...row.querySelectorAll<HTMLElement>('.nosweat-maia-move')].filter(e => !e.hidden).length, 1);
  assert.equal(row.querySelector('.nosweat-maia-other')!.textContent, 'Other 50.8%');
  assert.equal(root.querySelectorAll('.nosweat-puzzle-policy tbody tr').length, primary.length);
  width = 400;
  fitPuzzleMaiaRow(row, channel);
  assert.ok([...row.querySelectorAll<HTMLElement>('.nosweat-maia-move')].every(e => !e.hidden));
  assert.equal(row.querySelector('.nosweat-maia-other')!.textContent, 'Other 28.8%');
  root.remove();
});

test('compact channels preserve raw probabilities and independently expand all legal moves', () => {
  const patch = init([attributesModule]);
  const host = document.createElement('div');
  document.body.append(host);
  let vnode: VNode | Element = host;
  const expanded = [false, false];
  const played: string[] = [];
  const render = () => {
    vnode = patch(
      vnode,
      hl(
        'section',
        [primary, [...primary].reverse()].map((candidates, i) =>
          puzzleMaiaChannel({
            id: `maia-${i}`,
            fen,
            rating: i ? 2600 : 1600,
            candidates,
            color: 'orange',
            status: '',
            expanded: expanded[i],
            toggle: () => {
              expanded[i] = !expanded[i];
              render();
            },
            play: uci => played.push(uci),
          }),
        ),
      ),
    );
  };
  render();
  const root = () => vnode.elm as HTMLElement;
  const other = (index: number) => root().querySelectorAll<HTMLButtonElement>('.nosweat-maia-other')[index];
  const panels = () => [...root().querySelectorAll<HTMLElement>('.nosweat-puzzle-policy')];
  assert.equal(other(0).textContent, 'Other 28.8%');
  assert.equal(other(1).textContent, 'Other 66.4%');
  assert.equal(root().querySelector('.nosweat-maia-probability')!.textContent, '49.2%');
  assert.equal(root().querySelectorAll('.nosweat-maia-move').length, 6);
  assert.ok(!root().textContent.includes('·'));
  assert.ok(panels().every(panel => panel.hidden));
  other(0).click();
  assert.equal(other(0).getAttribute('aria-expanded'), 'true');
  assert.equal(other(0).getAttribute('aria-controls'), panels()[0].id);
  assert.deepEqual(
    panels().map(panel => panel.hidden),
    [false, true],
  );
  assert.equal(panels()[0].querySelectorAll('tbody tr').length, primary.length);
  assert.equal(panels()[0].querySelector('tbody tr:last-child td:last-child')!.textContent, '<0.1%');
  panels()[0].querySelector<HTMLButtonElement>('tbody tr:last-child button')!.click();
  assert.deepEqual(played, ['b1c3']);
  other(0).click();
  other(0).click();
  other(1).click();
  assert.deepEqual(
    panels().map(panel => panel.hidden),
    [false, false],
  );
  other(0).click();
  assert.deepEqual(
    panels().map(panel => panel.hidden),
    [true, false],
  );
  root().remove();
});

test('pending and terminal channels have no misleading Other control', () => {
  const patch = init([attributesModule]);
  for (const status of ['Analyzing…', 'No legal moves']) {
    const host = document.createElement('div');
    document.body.append(host);
    const vnode = patch(
      host,
      puzzleMaiaChannel({
        id: 'empty',
        fen,
        rating: 1600,
        candidates: [],
        color: 'orange',
        status,
        expanded: true,
        toggle: () => assert.fail('empty channel cannot expand'),
        play: () => {},
      }),
    );
    const root = vnode.elm as HTMLElement;
    assert.equal(root.querySelector('.nosweat-maia-status')!.textContent, status);
    assert.equal(root.querySelector('.nosweat-maia-other'), null);
    assert.ok(root.querySelector<HTMLElement>('.nosweat-puzzle-policy')!.hidden);
    root.remove();
  }
});
