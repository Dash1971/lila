import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { h } from 'snabbdom';

document.documentElement.lang = 'en-US';
// Keep the real lobby controller, pool view and Snabbdom bootstrap. The unrelated
// sidebar and carousel are not needed to exercise automatic pool entry.
mock.module('../src/view/setup/modal', { defaultExport: async () => ({ redraw() {}, close() {} }) });
mock.module('../src/view/table', { defaultExport: () => h('div.lobby__table') });
mock.module('../src/view/carousel', { namedExports: { makeCarousel: () => {} } });
mock.module('../src/view/playing', { defaultExport: () => h('div.now-playing') });
mock.module('../src/view/realTime/main', { defaultExport: () => h('div.real-time') });
mock.module('../src/view/correspondence', { defaultExport: () => h('div.seeks') });
const { default: main } = await import('../src/main');
import type { LobbyOpts } from '../src/interfaces';

for (const state of ['signed-in', 'anonymous', 'now-playing', 'custom'] as const)
  test(`Maia pairing preserves native bootstrap and game-start sound: ${state}`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
    Object.assign(globalThis, { location: window.location, history: window.history });
    localStorage.clear();
    window.history.replaceState(null, '', state === 'custom' ? '/' : '/#pool/15+10/previousBot');
    document.body.innerHTML = '<div class="lobby__app"></div><div class="lobby__table"></div>';
    let respond!: (response: Response) => void;
    const request = t.mock.method(
      globalThis,
      'fetch',
      () => new Promise<Response>(resolve => (respond = resolve)),
    );
    Object.assign(site, { redirect: () => {} });
    const redirect = t.mock.method(site, 'redirect', () => {});
    const ctrl = main({
      appElement: document.querySelector('.lobby__app')!,
      tableElement: document.querySelector('.lobby__table')!,
      socketSend: () => {},
      pools: [{ id: '15+10', lim: 15, inc: 10 }],
      hasUnreadLichessMessage: false,
      playban: false,
      showRatings: true,
      noSweat: true,
      data: {
        hooks: [],
        seeks: [],
        me: state === 'anonymous' ? undefined : { username: 'Player', isBot: false },
        nbNowPlaying: state === 'now-playing' ? 1 : 0,
        nbMyTurn: 0,
        nowPlaying:
          state === 'now-playing' ? [{ gameId: 'previous', speed: 'rapid', opponent: { id: 'bot' } }] : [],
        ratingMap: null,
        counters: { members: 1, rounds: 0 },
      },
    } as LobbyOpts);
    assert.ok(document.querySelector('.lobby__app__content'));
    // Pool entry must not redraw while main() is still constructing its VNodes.
    assert.equal(request.mock.callCount(), 0);
    if (state === 'custom') void ctrl.matchMaia({ minutes: 7, increment: 2, rated: true }, 'custom');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(request.mock.callCount(), 1);
    assert.equal(ctrl.tab, 'pools');
    assert.equal(ctrl.poolMember?.id, state === 'custom' ? 'custom' : '15+10');
    if (state !== 'custom') assert.ok(document.querySelector('.lpool.active[data-id="15+10"] .spinner'));
    const [url, options] = request.mock.calls[0].arguments as unknown as [string, RequestInit];
    assert.equal(url, '/club/play');
    assert.deepEqual(JSON.parse(options.body as string), {
      minutes: state === 'custom' ? 7 : 15,
      increment: state === 'custom' ? 2 : 10,
      rated: state !== 'anonymous',
    });
    respond(Response.json({ url: '/abcd1234wxyz' }));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(redirect.mock.calls[0].arguments, ['/abcd1234wxyz', true]);
    assert.equal(ctrl.poolMember, undefined);
    t.mock.timers.reset();
  });
