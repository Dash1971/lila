import assert from 'node:assert/strict';
import { test } from 'node:test';
import { h, init } from 'snabbdom';

import { attachMoveTooltip, withMoveTooltip } from '../src/noSweatMoveTooltip';

const event = (element: HTMLElement, name: string) => {
  const value = document.createEvent('Event');
  value.initEvent(name, false, false);
  element.dispatchEvent(value);
};

test('move details render outside the clipped card with source formatting and safe text', () => {
  const card = document.createElement('div');
  card.style.overflow = 'hidden';
  const move = document.createElement('button');
  card.append(move);
  document.body.append(card);
  const dispose = attachMoveTooltip(move, () => ({
    san: '<Bxf7+>',
    color: '#cb181d',
    maiaProbability: 0.125,
    stockfishEval: '-3.37',
    stockfishWinrate: 0.343,
    stockfishEvalLoss: '-3.62',
  }));
  event(move, 'mouseenter');
  const popup = document.querySelector<HTMLElement>('.nosweat-move-tooltip')!;
  assert.equal(popup.parentElement, document.body);
  assert.equal(popup.getAttribute('role'), 'tooltip');
  assert.equal(popup.querySelector('.nosweat-move-tooltip__header')?.textContent, '<Bxf7+>');
  assert.equal(popup.querySelector('bxf7'), null);
  assert.equal(
    popup.querySelector('.nosweat-move-tooltip__rows')?.textContent,
    'Maia:12.5%SF Eval:-3.37SF Winrate:34.3%SF Eval Loss:-3.62',
  );
  assert.equal(move.getAttribute('aria-describedby'), popup.id);
  event(move, 'mouseleave');
  assert.equal(document.querySelector('.nosweat-move-tooltip'), null);
  assert.equal(move.hasAttribute('aria-describedby'), false);
  dispose();
  card.remove();
});

test('focus, Escape and disposal clean up the popup and omit unavailable evidence', () => {
  const move = document.createElement('button');
  document.body.append(move);
  move.setAttribute('aria-describedby', 'existing-help');
  const dispose = attachMoveTooltip(move, () => ({ san: 'e4', color: '#238b45', maiaProbability: 0 }));
  move.focus();
  const popup = document.querySelector<HTMLElement>('.nosweat-move-tooltip')!;
  assert.ok(popup);
  assert.equal(popup.querySelector('.nosweat-move-tooltip__rows')?.textContent, 'Maia:0.0%');
  assert.ok(move.getAttribute('aria-describedby')?.startsWith('existing-help '));
  const escape = document.createEvent('KeyboardEvent');
  escape.initEvent('keydown', true, false);
  Object.defineProperty(escape, 'key', { value: 'Escape' });
  move.dispatchEvent(escape);
  assert.equal(document.querySelector('.nosweat-move-tooltip'), null);
  assert.equal(move.getAttribute('aria-describedby'), 'existing-help');
  move.blur();
  event(move, 'mouseenter');
  assert.ok(document.querySelector('.nosweat-move-tooltip'));
  dispose();
  assert.equal(document.querySelector('.nosweat-move-tooltip'), null);
  event(move, 'mouseenter');
  assert.equal(document.querySelector('.nosweat-move-tooltip'), null);
  move.remove();
});

test('fresh VNode hooks replace one DOM attachment and destroy removes it', () => {
  const patch = init([]);
  const host = document.createElement('div');
  document.body.append(host);
  let reads = 0;
  const view = (san: string) =>
    h('div', [
      h(
        'button',
        {
          key: 'move',
          hook: withMoveTooltip({}, () => {
            reads++;
            return { san, color: '#cb181d' };
          }),
        },
        san,
      ),
    ]);
  let tree = patch(host, view('e4'));
  const move = (tree.elm as HTMLElement).querySelector('button')!;
  tree = patch(tree, view('d4'));
  tree = patch(tree, view('Nf3'));
  event(move, 'mouseenter');
  assert.equal(reads, 1, 'redraws must not accumulate tooltip listeners');
  assert.equal(document.querySelector('.nosweat-move-tooltip__header')?.textContent, 'Nf3');
  tree = patch(tree, h('div'));
  assert.equal(document.querySelector('.nosweat-move-tooltip'), null);
  document.body.append(move);
  event(move, 'mouseenter');
  assert.equal(reads, 1, 'destroy removes the final attachment');
  move.remove();
  (tree.elm as HTMLElement).remove();
});

test('Escape stays dismissed through same-node redraws until a new focus or hover', () => {
  const patch = init([]);
  const host = document.createElement('div');
  document.body.append(host);
  const view = (san: string) =>
    h('div', [
      h(
        'button',
        {
          key: 'move',
          hook: withMoveTooltip({}, () => ({ san, color: '#cb181d' })),
        },
        san,
      ),
    ]);
  let tree = patch(host, view('e4'));
  const move = (tree.elm as HTMLElement).querySelector('button')!;
  move.focus();
  assert.ok(document.querySelector('.nosweat-move-tooltip'));
  const escape = document.createEvent('KeyboardEvent');
  escape.initEvent('keydown', true, false);
  Object.defineProperty(escape, 'key', { value: 'Escape' });
  move.dispatchEvent(escape);
  tree = patch(tree, view('d4'));
  assert.equal(document.activeElement, move);
  assert.equal(document.querySelector('.nosweat-move-tooltip'), null);
  move.blur();
  move.focus();
  assert.equal(document.querySelector('.nosweat-move-tooltip__header')?.textContent, 'd4');
  move.dispatchEvent(escape);
  tree = patch(tree, view('Nf3'));
  assert.equal(document.querySelector('.nosweat-move-tooltip'), null);
  event(move, 'mouseenter');
  assert.equal(document.querySelector('.nosweat-move-tooltip__header')?.textContent, 'Nf3');
  tree = patch(tree, h('div'));
  assert.equal(document.querySelector('.nosweat-move-tooltip'), null);
  (tree.elm as HTMLElement).remove();
});
