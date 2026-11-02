import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isPrivateNostrInput, npubFromInput, publicIdentitySearch } from '../src/nosweat/identity';

const npub = 'npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg';

test('header search routes a full public npub and nostr URI without changing its case', () => {
  for (const value of [npub, `nostr:${npub}`, npub.toUpperCase()]) {
    assert.ok(publicIdentitySearch.test(value));
    assert.equal(npubFromInput(value), value.replace(/^nostr:/i, ''));
  }
  assert.equal(npubFromInput(`  ${npub}  `), npub);
});

test('display names remain flexible and public input never treats a private key as an npub', () => {
  for (const name of ['Dash', 'Alice Smith', '友だち']) assert.ok(publicIdentitySearch.test(name));
  for (const value of [
    'nsec' + npub.slice(4),
    'nostr:nsec' + npub.slice(4),
    'nprofile' + npub.slice(4),
    'x'.repeat(31),
    'Al\nBob',
  ]) {
    assert.equal(publicIdentitySearch.test(value), false);
    assert.equal(npubFromInput(value), undefined);
  }
  assert.equal(npubFromInput('Dash'), undefined);
});

test('private-key input is recognized locally before search navigation', () => {
  const secretFixture = 'nsec' + npub.slice(4);
  assert.equal(isPrivateNostrInput(secretFixture), true);
  assert.equal(isPrivateNostrInput(`nostr:${secretFixture}`), true);
  assert.equal(isPrivateNostrInput(npub), false);
  assert.equal(isPrivateNostrInput('nsec'), false);
  for (const value of ['nsec1partial', ' NOSTR:NSEC1partial']) {
    assert.equal(publicIdentitySearch.test(value), false);
    assert.equal(isPrivateNostrInput(value), true);
  }
});
