import assert from 'node:assert/strict';
import { test } from 'node:test';

import OnlineFriends from '../src/friends';

const id = 'n066f8597b3952d996bc';
const painted = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

function friends() {
  document.body.innerHTML = `<div id="friend_box"><button class="friend_box_button"></button><span class="friend_box_count"></span><div class="nobody"></div><div class="list"></div></div>`;
  const root = document.getElementById('friend_box')!;
  return { root, controller: new OnlineFriends(root) };
}

test('initial online friends show public names while links, playing and leave use canonical IDs', async () => {
  const { root, controller } = friends();
  controller.receive([id], {
    playing: [id],
    patronColors: [4],
    displayNames: { [id]: 'Dash with spaces' },
  });
  await painted();
  const link = root.querySelector<HTMLAnchorElement>('.list .user-link')!;
  assert.equal(link.textContent, 'Dash with spaces');
  assert.equal(link.getAttribute('href'), `/@/${id}`);
  assert.equal(root.querySelector('.tv')?.getAttribute('href'), `/@/${id}/tv`);
  assert.ok(link.querySelector('.patron.paco4'));
  controller.stoppedPlaying(id);
  await painted();
  assert.equal(root.querySelector('.tv'), null);
  assert.equal(controller.users.get(id)?.displayName, 'Dash with spaces');
  controller.leaves(id);
  await painted();
  assert.equal(controller.users.size, 0);
  assert.equal(root.querySelector('.list')?.textContent, '');
});

test('live enter updates use the latest escaped public name without changing the presence key', async () => {
  const { root, controller } = friends();
  controller.receive([], { playing: [], patronColors: [] });
  controller.enters(id, { playing: false, displayName: 'Dash <img src=x onerror=alert(1)> & "friends"' });
  await painted();
  const link = root.querySelector<HTMLAnchorElement>('.list .user-link')!;
  assert.equal(link.textContent, 'Dash <img src=x onerror=alert(1)> & "friends"');
  assert.equal(link.getAttribute('href'), `/@/${id}`);
  assert.equal(link.querySelector('img'), null);
  assert.ok(link.innerHTML.includes('&lt;img'));
  controller.enters(id, { playing: true, displayName: 'Renamed Dash' });
  await painted();
  assert.equal(controller.users.size, 1);
  assert.equal(root.querySelector('.list .user-link')?.textContent, 'Renamed Dash');
  assert.equal(root.querySelector('.tv')?.getAttribute('href'), `/@/${id}/tv`);
});

test('canonical fallback and native BOT titles remain compatible with older payloads', async () => {
  const { root, controller } = friends();
  controller.receive([id, 'BOT NativeBot'], {
    playing: [],
    patronColors: [],
    displayNames: { nativebot: 'Public Bot Alias', [id]: '' },
  });
  await painted();
  const human = root.querySelector<HTMLAnchorElement>(`a[href="/@/${id}"]`)!;
  const bot = root.querySelector<HTMLAnchorElement>('a[href="/@/NativeBot"]')!;
  assert.equal(human.textContent, id);
  assert.equal(bot.querySelector('.utitle[data-bot]')?.textContent, 'BOT');
  assert.ok(bot.textContent?.endsWith('Public Bot Alias'));
  controller.enters(id, { playing: false });
  await painted();
  assert.equal(root.querySelector(`a[href="/@/${id}"]`)?.textContent, id);
  controller.playing('nativebot');
  await painted();
  assert.equal(controller.users.size, 2);
  assert.equal(root.querySelector('a.tv[href="/@/NativeBot/tv"]') !== null, true);
});
