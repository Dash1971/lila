import assert from 'node:assert/strict';
import { test, mock } from 'node:test';

import { pubsub } from 'lib/pubsub';

test('socket events do not load disabled challenge or notification widgets', async () => {
  document.body.innerHTML = '<header id="top"><nav id="topnav"></nav></header>';
  window.matchMedia = globalThis.matchMedia;
  const empty: Record<string, unknown> = { length: 0 };
  for (const name of ['on', 'one', 'html', 'find', 'empty', 'removeAttr']) empty[name] = () => empty;
  Object.defineProperty(globalThis, '$', { value: () => empty, configurable: true });
  const load = mock.fn(async () => ({}));
  mock.module(new URL('../src/asset.ts', import.meta.url).href, {
    namedExports: { loadEsm: load, loadCssPath: () => {} },
  });
  mock.module(new URL('../src/clinput.ts', import.meta.url).href, {
    namedExports: { addClinputKeyHandler: () => {} },
  });
  const { default: initTopBar } = await import('../src/topBar');
  initTopBar();
  pubsub.emit('socket.in.challenges', {});
  pubsub.emit('socket.in.notifications', { notifications: {} as Paginator<never>, unread: 1 });
  pubsub.emit('notify-app.set-read', 'someone');
  await Promise.resolve();
  assert.equal(load.mock.callCount(), 0);
});
