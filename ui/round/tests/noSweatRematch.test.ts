import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { attributesModule, init } from 'snabbdom';

import type RoundController from '../src/ctrl';
import { followUp } from '../src/view/button';

const patch = init([attributesModule]);
function render(seconds: number | undefined, branded = true, rematch?: string, increment = 0) {
  document.documentElement.dataset.brand = branded ? 'mutechess' : 'lichess';
  document.body.innerHTML = '<div id="fixture"></div>';
  const sent: string[] = [];
  const ctrl = {
    ply: 0,
    data: {
      game: { id: 'clockold', source: 'friend', status: { id: 31 }, variant: { key: 'standard' }, rematch },
      player: { color: 'white', id: 'aaaa', user: { id: 'white' } },
      opponent: { color: 'black', onGame: true, user: { id: 'black' } },
      clock: seconds === undefined ? undefined : { initial: seconds, increment, white: 15, black: 15 },
    },
    socket: {
      send(type: string) {
        sent.push(type);
      },
    },
    challengeRematch() {
      sent.push('challenge');
    },
    redraw() {},
  } as unknown as RoundController;
  patch(document.getElementById('fixture')!, followUp(ctrl));
  const button = document.querySelector<HTMLButtonElement>('button.rematch')!;
  assert.ok(button);
  return { button, sent, explanation: document.getElementById('rematch-minimum-clock'), ctrl };
}

test('legacy sub-minute rematches have a disabled button and send no request, regardless of increment', () => {
  for (const seconds of [0, 15, 30, 45, 59])
    for (const increment of [0, 180]) {
      const f = render(seconds, true, undefined, increment);
      assert.equal(f.button.disabled, true);
      assert.ok(f.explanation?.textContent);
      assert.equal(f.button.getAttribute('aria-describedby'), f.explanation.id);
      f.button.click();
      assert.deepEqual(f.sent, []);
      assert.equal(f.ctrl.data.player.offeringRematch, undefined);
    }
});

test('supported clocks, upstream views and existing rematch links retain native controls', () => {
  for (const seconds of [60, 90, 300]) {
    const f = render(seconds); // A low remaining clock does not change its original starting time.
    assert.equal(f.button.disabled, false);
    assert.equal(f.explanation, null);
    f.button.click();
    assert.deepEqual(f.sent, ['rematch-yes']);
  }
  for (const f of [render(15, false), render(15, true, 'existing'), render(undefined)]) {
    assert.equal(f.button.disabled, false);
    assert.equal(f.explanation, null);
  }
});

test('the disabled rematch explanation renders from all ten native catalogs', () => {
  const original = i18n;
  try {
    for (const locale of [
      'en-GB',
      'de-DE',
      'es-ES',
      'fr-FR',
      'hi-IN',
      'ja-JP',
      'ko-KR',
      'pt-BR',
      'ru-RU',
      'zh-CN',
    ]) {
      const path = locale === 'en-GB' ? 'source/site.xml' : `dest/site/${locale}.xml`;
      const catalog = readFileSync(new URL(`../../../translation/${path}`, import.meta.url), 'utf8');
      const message = catalog.match(/<string name="muteMinimumClock">([^<]+)<\/string>/)?.[1];
      assert.ok(message);
      Object.assign(globalThis, {
        i18n: { site: { muteMinimumClock: message, rematch: 'Rematch', analysis: 'Analysis' } },
      });
      const f = render(15);
      assert.equal(f.explanation?.textContent, message);
      assert.equal(f.button.title, message);
      assert.equal(f.button.disabled, true);
    }
  } finally {
    Object.assign(globalThis, { i18n: original });
  }
});
