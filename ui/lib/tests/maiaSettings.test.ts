import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  loadEnginePreferences,
  engineSettingsView,
  saveEnginePreferences,
} from '../src/nosweat/engineSettings';
import { defaultEnginePreferences } from '../src/nosweat/preferences';

const change = (input: HTMLInputElement | HTMLSelectElement) =>
  input.dispatchEvent(new window.Event('change', { bubbles: true }));

test('shared Maia settings default to two engines and retain the second rating across disabling and reload', () => {
  localStorage.clear();
  assert.equal(loadEnginePreferences().secondMaiaEnabled, true);
  const updates: boolean[] = [];
  const prefs = { ...defaultEnginePreferences, secondMaiaElo: 2600, fishArrows: false };
  saveEnginePreferences(prefs);
  const view = engineSettingsView(loadEnginePreferences(), next => updates.push(next.secondMaiaEnabled));
  const second = view.querySelector<HTMLInputElement>('[data-engine-pref="secondMaiaEnabled"]')!;
  const rating = view.querySelector<HTMLElement>('[data-maia-setting="secondMaiaElo"]')!;
  assert.equal(second.checked, true);
  assert.equal(rating.hidden, false);
  second.checked = false;
  change(second);
  assert.equal(rating.hidden, true);
  assert.equal(rating.querySelector('select')!.disabled, true);
  assert.equal(loadEnginePreferences().secondMaiaEnabled, false);
  assert.equal(loadEnginePreferences().secondMaiaElo, 2600);
  assert.equal(loadEnginePreferences().fishArrows, false);
  const reopened = engineSettingsView(loadEnginePreferences(), () => {});
  const toggle = reopened.querySelector<HTMLInputElement>('[data-engine-pref="secondMaiaEnabled"]')!;
  toggle.checked = true;
  change(toggle);
  assert.equal(
    reopened.querySelector<HTMLSelectElement>('[data-engine-pref="secondMaiaElo"]')!.value,
    '2600',
  );
  assert.equal(loadEnginePreferences().secondMaiaEnabled, true);
  assert.deepEqual(updates, [false]);
});

test('primary rating selection matches opponent input while the second rating remains independent', () => {
  const view = engineSettingsView({ ...defaultEnginePreferences }, () => {});
  assert.equal(view.querySelector('[data-engine-pref="opponentElo"]'), null);
  const primary = view.querySelector<HTMLSelectElement>('[data-engine-pref="selfElo"]')!;
  primary.value = '1800';
  change(primary);
  assert.equal(loadEnginePreferences().selfElo, 1800);
  assert.equal(loadEnginePreferences().opponentElo, 1800);
  const secondary = view.querySelector<HTMLSelectElement>('[data-engine-pref="secondMaiaElo"]')!;
  secondary.value = '2200';
  change(secondary);
  assert.equal(loadEnginePreferences().secondMaiaElo, 2200);
  assert.equal(loadEnginePreferences().selfElo, 1800);
});

test('arrow colors are saved independently, reset explicitly, and invalid SVG inputs fall back', () => {
  const view = engineSettingsView({ ...defaultEnginePreferences }, () => {});
  const color = view.querySelector<HTMLInputElement>('[data-arrow-color="stockfish"]')!;
  color.value = '#abcdef';
  change(color);
  assert.equal(loadEnginePreferences().arrowColors.stockfish, '#abcdef');
  assert.equal(loadEnginePreferences().arrowColors.maia, defaultEnginePreferences.arrowColors.maia);
  view.querySelector<HTMLButtonElement>('.nosweat-reset-arrow-colors')!.click();
  assert.deepEqual(loadEnginePreferences().arrowColors, defaultEnginePreferences.arrowColors);
  localStorage.setItem(
    'nosweat.enginePreferences.v2',
    JSON.stringify({ arrowColors: { maia: '"><script>', maiaSecond: '#AABBCC' } }),
  );
  const prefs = loadEnginePreferences();
  assert.equal(prefs.arrowColors.maia, defaultEnginePreferences.arrowColors.maia);
  assert.equal(prefs.arrowColors.maiaSecond, '#aabbcc');
});

test('computer-analysis quality shares the existing setting and Mobile Maia choices', () => {
  localStorage.removeItem('nosweat.gameReview.quality');
  const view = engineSettingsView({ ...defaultEnginePreferences }, () => {});
  const radios = [...view.querySelectorAll<HTMLInputElement>('[name="nosweat-review-quality"]')];
  assert.deepEqual(
    radios.map(r => r.value),
    ['Fast', 'Balanced', 'Thorough'],
  );
  assert.equal(radios.find(r => r.checked)!.value, 'Fast');
  radios[2].checked = true;
  change(radios[2]);
  assert.equal(localStorage.getItem('nosweat.gameReview.quality'), 'Thorough');
});

test('legacy mismatched opponent inputs always normalize to the selected Maia rating', () => {
  localStorage.setItem(
    'nosweat.enginePreferences.v2',
    JSON.stringify({ selfElo: 1800, opponentElo: 600, secondMaiaElo: 2600 }),
  );
  const prefs = loadEnginePreferences();
  assert.equal(prefs.selfElo, 1800);
  assert.equal(prefs.opponentElo, 1800);
  assert.equal(prefs.secondMaiaElo, 2600);
});

test('account engine settings use native sections and radio choices with the shared browser preferences', () => {
  localStorage.clear();
  const updates: boolean[] = [];
  const view = engineSettingsView(
    { ...defaultEnginePreferences, secondMaiaElo: 2600 },
    next => updates.push(next.secondMaiaEnabled),
    true,
  );
  assert.equal(view.className, 'nosweat-engine-settings-page');
  assert.ok(view.querySelectorAll('section > h2').length > 5);
  assert.equal(view.querySelector('dialog'), null);
  const no = view.querySelector<HTMLInputElement>('[data-engine-pref="secondMaiaEnabled"][value="0"]')!;
  no.checked = true;
  change(no);
  assert.equal(loadEnginePreferences().secondMaiaEnabled, false);
  assert.equal(loadEnginePreferences().secondMaiaElo, 2600);
  assert.equal(view.querySelector<HTMLElement>('[data-maia-setting="secondMaiaElo"]')!.hidden, true);
  const primary = view.querySelector<HTMLSelectElement>('[data-engine-pref="selfElo"]')!;
  primary.value = '1800';
  change(primary);
  assert.equal(loadEnginePreferences().selfElo, 1800);
  assert.equal(loadEnginePreferences().opponentElo, 1800);
  assert.deepEqual(updates, [false, false]);
});
