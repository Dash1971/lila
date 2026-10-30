import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ChatOpts } from '../src/chat/interfaces';

document.documentElement.lang = 'en-US';
const { ChatCtrl } = await import('../src/chat/chatCtrl');

test('notes-only replay retains native notes without a discussion tab or public moderation', () => {
  const opts = {
    data: { id: 'abcd1234', resourceType: 'watcher', resourceId: 'watcher:abcd1234', lines: [] },
    notesOnly: true,
    noteId: 'abcd1234',
    noteText: 'Private note',
    writeable: false,
    kidMode: false,
  } as unknown as ChatOpts;
  const ctrl = new ChatCtrl(opts, () => {});
  assert.deepEqual(
    ctrl.visibleTabs.map(t => t.key),
    ['note'],
  );
  assert.equal(ctrl.getTab().key, 'note');
  assert.equal(ctrl.note?.text(), 'Private note');
  assert.equal(ctrl.moderation, undefined);
  assert.equal(ctrl.canPostArbitraryText(), false);
});
