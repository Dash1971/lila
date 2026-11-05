import assert from 'node:assert/strict';
import { test } from 'node:test';

import type LobbyController from '../src/ctrl';
import type { GameType } from '../src/interfaces';
import SetupController from '../src/setupCtrl';

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
