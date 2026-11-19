import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import type { VNode } from 'lib/view';

import type LobbyController from '../src/ctrl';
import type { GameType } from '../src/interfaces';
import SetupController from '../src/setupCtrl';
// Isolate clock rendering from unrelated native controls using package-self aliases.
for (const name of ['colorButtons', 'gameModeButtons', 'variantPicker'])
  mock.module(`../src/view/setup/components/${name}`, { namedExports: { [name]: () => null } });
const { default: setupModal } = await import('../src/view/setup/modal');
window.matchMedia = matchMedia;

const nodes = (node: VNode): VNode[] => [
  node,
  ...(node.children ?? []).flatMap(child => (child && typeof child === 'object' ? nodes(child) : [])),
];

const makeRoot = (focused: boolean, signedIn: boolean) =>
  ({
    opts: { noSweat: focused },
    me: signedIn ? { username: 'ClockTest' } : undefined,
    data: { ratingMap: null },
    pools: [],
    leavePool() {},
    redraw() {},
  }) as unknown as LobbyController;

for (const mode of ['correspondence', 'unlimited'] as const)
  for (const gameType of ['hook', 'friend'] as GameType[])
    for (const force of [false, true])
      test(`focused ${gameType} normalizes ${force ? 'forced' : 'stored'} ${mode}`, () => {
        localStorage.clear();
        const ctrl = new SetupController(makeRoot(true, gameType === 'friend'));
        ctrl.store[gameType]({ ...ctrl.store[gameType](), timeMode: mode, time: 5, increment: 3 });
        ctrl.openModal(
          gameType,
          force ? { timeMode: mode } : undefined,
          gameType === 'friend' ? 'Friend' : undefined,
        );
        assert.equal(ctrl.timeControl.mode(), 'realTime');
        assert.deepEqual(ctrl.timeControl.modes, ['realTime']);
        assert.equal(ctrl.timeControl.canSelectMode(), false);
        assert.equal(ctrl.timeControl.time(), 5);
        assert.equal(ctrl.timeControl.increment(), 3);
        assert.equal(ctrl.store[gameType]().timeMode, 'realTime');
      });

test('upstream setup retains its native time-control choices', () => {
  localStorage.clear();
  const ctrl = new SetupController(makeRoot(false, true));
  ctrl.openModal('friend');
  assert.equal(ctrl.timeControl.mode(), 'unlimited');
  assert.deepEqual(ctrl.timeControl.modes, ['unlimited', 'realTime', 'correspondence']);
  assert.equal(ctrl.timeControl.canSelectMode(), true);
});

for (const gameType of ['hook', 'friend'] as GameType[])
  for (const time of [0, 0.25, 0.5, 0.75])
    for (const forced of [false, true])
      test(`focused ${gameType} normalizes ${forced ? 'forced' : 'stored'} ${time}+5 to 1+5`, () => {
        localStorage.clear();
        const ctrl = new SetupController(makeRoot(true, true));
        ctrl.store[gameType]({ ...ctrl.store[gameType](), time: forced ? 3 : time, increment: 5 });
        ctrl.openModal(gameType, forced ? { time } : undefined, gameType === 'friend' ? 'Friend' : undefined);
        assert.equal(ctrl.timeControl.time(), 1);
        assert.equal(ctrl.timeControl.increment(), 5);
        assert.equal(ctrl.store[gameType]().time, 1);
        assert.equal(ctrl.valid(), true);
        const root = ctrl.root;
        root.setupCtrl = ctrl;
        const play = setupModal(root)!
          .flatMap(nodes)
          .find(n => n.sel?.includes('lobby__start__button'));
        assert.ok(play);
        assert.equal(play.data?.attrs?.disabled, false);
      });

test('focused setup rejects a tampered short clock even with a large increment', () => {
  localStorage.clear();
  const ctrl = new SetupController(makeRoot(true, true));
  ctrl.openModal('hook', { time: 1, increment: 0 });
  assert.equal(ctrl.valid(), true);
  ctrl.timeControl.timeV(1); // 15 seconds
  ctrl.timeControl.incrementV(30); // 180 seconds increment
  assert.equal(ctrl.valid(), false);
});

test('non-focused setup retains fractional-minute clocks', () => {
  localStorage.clear();
  const ctrl = new SetupController(makeRoot(false, true));
  ctrl.openModal('friend', { timeMode: 'realTime', time: 0.25, increment: 0 }, 'Friend');
  assert.equal(ctrl.timeControl.time(), 0.25);
  assert.equal(ctrl.minimumTimeIfReal(), 0);
});

for (const gameType of ['hook', 'friend'] as GameType[])
  test(`the focused ${gameType} modal removes sub-minute sliders, presets and accessible options`, () => {
    localStorage.clear();
    const root = makeRoot(true, true);
    const ctrl = new SetupController(root);
    root.setupCtrl = ctrl;
    ctrl.openModal(gameType, { time: 1, increment: 0 }, gameType === 'friend' ? 'Friend' : undefined);
    ctrl.timeControl.presets.push({ lim: 0.25, inc: 5 }, { lim: 1, inc: 0 });
    const before = site.blindMode;
    try {
      site.blindMode = false;
      const view = setupModal(root)!.flatMap(nodes);
      assert.equal(view.find(n => n.sel === 'input.range')?.data?.attrs?.min, 4);
      assert.equal(view.filter(n => n.sel === 'button.preset-btn').length, 1);
      site.blindMode = true;
      const select = setupModal(root)!
        .flatMap(nodes)
        .find(n => n.sel === 'select#sf_time');
      assert.ok(select);
      const options = nodes(select).filter(n => n.sel === 'option');
      assert.ok(options.length > 0);
      assert.ok(options.every(n => Number(n.data?.attrs?.value) >= 4));
    } finally {
      site.blindMode = before;
    }
  });

for (const gameType of ['hook', 'friend'] as GameType[])
  test(`normalizing a short ${gameType} link retains its other enforced constraints`, () => {
    localStorage.clear();
    const ctrl = new SetupController(makeRoot(true, true));
    const forced = { time: 0.25, increment: 5, mode: 'casual' as const, color: 'white' as const };
    ctrl.openModal(gameType, forced, gameType === 'friend' ? 'Friend' : undefined);
    assert.equal(ctrl.valid(), true);
    assert.equal(ctrl.forced?.time, 1);
    assert.equal(forced.time, 0.25); // Do not mutate the URL/options object supplied by the caller.
    ctrl.timeControl.incrementV(0);
    assert.equal(ctrl.valid(), false);
    ctrl.timeControl.incrementV(5);
    assert.equal(ctrl.valid(), true);
    ctrl.timeControl.timeV(5); // 1.5 minutes differs from the normalized one-minute constraint.
    assert.equal(ctrl.valid(), false);
  });
