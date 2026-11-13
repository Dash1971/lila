import assert from 'node:assert/strict';
import { test } from 'node:test';

import { watcherLink } from '../src/view/watchers';

test('spectator labels use chosen names while links retain canonical account IDs', () => {
  const link = watcherLink('n066f8597b3952d996bc', 'Dash');
  assert.equal(link.textContent, 'Dash');
  assert.equal(link.getAttribute('href'), '/@/n066f8597b3952d996bc');
});

test('spectator display names render as text and cannot inject markup', () => {
  const link = watcherLink('canonical', '<img src=x onerror=alert(1)>');
  assert.equal(link.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(link.querySelector('img'), null);
  assert.equal(link.getAttribute('href'), '/@/canonical');
});

test('anonymous name lookups leave titles and canonical fallback intact', () => {
  assert.equal(watcherLink('BOT Wintermute').textContent, 'BOT Wintermute');
  assert.equal(watcherLink('BOT Wintermute', 'Wintermute').getAttribute('href'), '/@/Wintermute');
  assert.equal(watcherLink('n123', '').textContent, 'n123');
});
