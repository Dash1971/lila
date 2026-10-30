import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderUserEntry } from '../src/view/userComplete';

test('autocomplete displays the escaped public name but links to the canonical account', () => {
  const result = renderUserEntry({ name: 'n0123456789abcdef', displayName: 'Alice <friend>' });
  assert.ok(result.includes('href="/@/n0123456789abcdef"'));
  assert.ok(result.includes('Alice &lt;friend&gt;'));
  assert.ok(!result.includes('Alice <friend>'));
});
