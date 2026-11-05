import assert from 'node:assert/strict';
import { test } from 'node:test';
import { init, attributesModule, classModule, type VNode } from 'snabbdom';

document.documentElement.lang = 'en-US';
const { default: discussion } = await import('../src/chat/discussion');
import type { ChatCtrl, Line } from '../src/chat/interfaces';

const canonical = 'n066f8597b3952d996bc';
const patch = init([attributesModule, classModule]);
function author(line: Line, previous?: VNode) {
  const ctrl = {
    chatEnabled: () => true,
    canPostArbitraryText: () => false,
    data: { lines: [line], userId: canonical, resourceId: 'game/abcdefgh' },
    vm: { domVersion: 0, writeable: false },
    opts: {},
    preset: { group: () => undefined },
  } as unknown as ChatCtrl;
  const message = discussion(ctrl)[0]!.children![0] as VNode;
  assert.equal(message.data!.class!.me, line.u?.toLowerCase() === canonical);
  const link = (message.children as VNode[]).find(node => node.sel === 'a')!;
  const mount = previous || document.body.appendChild(document.createElement('div'));
  return patch(mount, link);
}

test('loaded and updated author labels retain canonical links and safely render names', () => {
  document.body.innerHTML = '';
  let node = author({ u: canonical, displayName: 'Dash', t: 'Good game', d: false });
  assert.equal(node.elm!.textContent, 'Dash');
  node = author({ u: canonical, displayName: 'Dash <img src=x>', t: 'Good game', d: false }, node);
  const link = node.elm as HTMLAnchorElement;
  assert.equal(link.textContent, 'Dash <img src=x>');
  assert.equal(link.getAttribute('href'), '/@/' + canonical);
  assert.equal(link.querySelector('img'), null);
});

test('old and empty-label packets fall back without altering BOT badges', () => {
  document.body.innerHTML = '';
  for (const displayName of [undefined, '']) {
    const node = author({ u: canonical, displayName, t: 'Good game', d: false });
    assert.equal(node.elm!.textContent, canonical);
  }
  const bot = author({ u: 'lynxsocket', title: 'BOT', displayName: 'Lynx Socket', t: 'ty, gg', d: false });
  const link = bot.elm as HTMLAnchorElement;
  assert.equal(link.getAttribute('href'), '/@/lynxsocket');
  assert.equal(link.querySelector('[data-bot]')?.textContent?.trim(), 'BOT');
  assert.ok(link.textContent!.includes('Lynx Socket'));
});
