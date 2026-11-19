import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VNode } from 'snabbdom';

import { toggle } from 'lib';

import type PuzzleCtrl from '../src/ctrl';
import boardMenu from '../src/view/boardMenu';

Object.assign(globalThis, { location: window.location, $: () => ({ hasClass: () => false }) });
const nodes = (node: VNode): VNode[] => [
  node,
  ...(node.children ?? []).flatMap(c => (c && typeof c === 'object' ? nodes(c) : [])),
];

for (const branded of [true, false])
  for (const mode of ['view', 'play'] as const)
    test(`${branded ? 'Mute' : 'native'} puzzle ${mode} menu keeps supported controls and scopes Study visibility`, () => {
      document.documentElement.dataset.brand = branded ? 'mutechess' : 'lichess';
      const ctrl = {
        mode,
        menu: toggle(true),
        redraw() {},
        flipped: () => false,
        flip() {},
        blindfold: toggle(false),
        pov: 'white',
        data: { puzzle: { id: '12345' } },
        initialNode: { ply: 0, fen: '8/8/8/8/8/8/8/K6k w - - 0 1', children: [] },
      } as unknown as PuzzleCtrl;
      const view = boardMenu(ctrl);
      assert.ok(view);
      const all = nodes(view);
      assert.equal(
        all.some(n => n.data?.attrs?.action === '/study/as'),
        !branded && mode === 'view',
      );
      assert.ok(all.some(n => n.data?.attrs?.href === '/account/preferences/display'));
      assert.ok(all.some(n => n.sel?.includes('board-menu__links')));
    });
