import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const matches: unknown[] = [];
const posts: string[] = [];
mock.module('lib/pubsub', {
  namedExports: { pubsub: { after: () => Promise.resolve() } },
});
mock.module('lib/socket', { namedExports: { wsConnect: () => ({ send() {} }), wsPingInterval: () => 1000 } });
mock.module('lib/xhr', {
  namedExports: { url: (path: string) => path, text: (path: string) => posts.push(path) },
});
mock.module('../src/main.ts', {
  defaultExport: () => ({
    matchMaia: (opts: unknown) => matches.push(opts),
    setupCtrl: { makeSetupStore: () => () => ({ ratingMin: 0, ratingMax: 3000 }) },
    setTab() {},
  }),
});
const { initModule } = await import('../src/lobby');
Object.assign(globalThis, { location: window.location, history: window.history });

for (const noSweat of [true, false]) {
  test(`hook_like validates before either request branch (Mute=${noSweat})`, async () => {
    for (const invalid of [
      '',
      '../teams',
      'abcd/efg',
      'abcd?efg',
      'abcdefgh/../../team',
      'abcdefgh%2f..',
      'abcdefg',
      'abcdefghi',
      'abcdefgh\n',
    ]) {
      matches.length = posts.length = 0;
      history.replaceState(null, '', '/?hook_like=' + encodeURIComponent(invalid));
      initModule({ noSweat } as any);
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(matches, [], invalid);
      assert.deepEqual(posts, [], invalid);
    }
    for (const id of ['a1b2c3d4', 'Ab12Cd34', 'ab_Cd-12']) {
      matches.length = posts.length = 0;
      history.replaceState(null, '', '/?hook_like=' + id);
      initModule({ noSweat } as any);
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(matches, noSweat ? [{ like: id }] : []);
      assert.deepEqual(posts, noSweat ? [] : [`/setup/hook/_test_sri_/like/${id}`]);
      assert.equal(location.search, '');
    }
  });
}
