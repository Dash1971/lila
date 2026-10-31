import { frag } from '../index';
import { storage } from '../storage';
import { domDialog } from '../view';
import { engineColors, type EngineColors } from './arrows';
import { readEnginePreferences, type EnginePreferences } from './preferences';
import { gameReviewQualities, gameReviewQuality } from './reviewQuality';

const preferenceKey = 'nosweat.enginePreferences.v2';
export const maiaRatings: number[] = Array.from({ length: 21 }, (_, i) => 600 + i * 100);
export const loadEnginePreferences = (): EnginePreferences =>
  readEnginePreferences(storage.make(preferenceKey).get());
export const saveEnginePreferences = (prefs: EnginePreferences): void =>
  storage.make(preferenceKey).set(JSON.stringify(prefs));

export function showMaiaRating(rating: number, choose: (rating: number) => void): void {
  domDialog({
    class: 'nosweat-rating-dialog',
    modal: true,
    show: true,
    easyClose: 'clickOutside',
    focus: '[aria-pressed="true"]',
    htmlText: `<h2>Maia rating</h2><div class="nosweat-rating-grid">${maiaRatings
      .map(
        n =>
          `<button type="button" class="fbt" data-rating="${n}" aria-pressed="${n === rating}">${n}</button>`,
      )
      .join('')}</div>`,
    actions: [
      {
        selector: '[data-rating]',
        listener: (event, dialog) => {
          choose(Number((event.currentTarget as HTMLElement).dataset.rating));
          dialog.close();
        },
      },
    ],
  });
}

// Shared by game analysis and puzzle review; this never changes puzzle solving permissions.
export function engineSettingsView(
  initial: EnginePreferences,
  changed: (prefs: EnginePreferences) => void,
): HTMLElement {
  let prefs = initial;
  const select = (key: keyof EnginePreferences, name: string, options: [string, string][]) =>
    `<label class="setting" data-maia-setting="${key}"><span>${name}</span><select data-engine-pref="${key}" aria-label="${name}">${options
      .map(
        ([value, text]) =>
          `<option value="${value}" ${String(prefs[key]) === value ? 'selected' : ''}>${text}</option>`,
      )
      .join('')}</select></label>`;
  const toggle = (key: 'history' | 'maiaArrows' | 'fishArrows' | 'secondMaiaEnabled', name: string) =>
    `<span class="setting"><span>${name}</span><span class="form-check__input"><input id="maia-${key}" type="checkbox" aria-label="${name}" data-engine-pref="${key}" ${prefs[key] ? 'checked' : ''}><label class="form-check__label" for="maia-${key}"></label></span></span>`;
  const ratings: [string, string][] = maiaRatings.map(n => [String(n), String(n)]);
  const view = frag<HTMLElement>(`<div class="nosweat-maia-settings-view">
    <fieldset><legend>Analysis engines</legend>
      ${toggle('secondMaiaEnabled', 'Enable a second Maia for analysis')}
      <p>Compare two ratings, or turn this off to show more moves from one Maia. Puzzle review shows one row when this is off.</p>
      ${select('selfElo', 'Primary Maia rating', ratings)}
      ${select('secondMaiaElo', 'Second Maia rating', ratings)}
    </fieldset>
    <details><summary>Advanced Maia settings</summary><fieldset><legend>Maia preferences</legend>
      ${select('model', 'Maia model', [
        ['5m', 'Maia3 5M · light'],
        ['79m', 'Maia3 79M'],
      ])}
      ${select('opponentElo', 'Primary opponent input', ratings)}
      ${toggle('history', 'Use move history')}
      <small>Maia downloads 36 MB for 5M or 331 MB for 79M on first use. Ratings are model inputs, not calibrated Elo. Settings are saved in this browser.</small>
    </fieldset></details>
    <fieldset><legend>Board arrows</legend>
      ${toggle('maiaArrows', 'Show Maia arrows')}${toggle('fishArrows', 'Show Stockfish arrows')}
      <div class="nosweat-arrow-palette">${(Object.keys(engineColors) as (keyof EngineColors)[])
        .map(key => {
          const name = {
            maia: 'Primary Maia',
            maiaSecond: 'Second Maia',
            stockfish: 'Stockfish best move',
            stockfishSecond: 'Stockfish second move',
          }[key];
          return `<label class="setting" ${key === 'maiaSecond' ? 'data-second-maia' : ''}><span>${name}</span><input type="color" data-arrow-color="${key}" value="${prefs.arrowColors[key]}" aria-label="${name} arrow color"></label>`;
        })
        .join('')}</div>
      <button type="button" class="button button-empty nosweat-reset-arrow-colors">Reset arrow colors</button>
    </fieldset>
    <fieldset><legend>Computer analysis</legend>
      <div class="nosweat-review-quality">${gameReviewQualities.map(q => `<label><input type="radio" name="nosweat-review-quality" value="${q.name}" ${q.name === gameReviewQuality(storage.get('nosweat.gameReview.quality')).name ? 'checked' : ''}><span>${q.name}</span></label>`).join('')}</div>
      <p>Choose faster review or deeper analysis. Applies the next time you analyze a game or line.</p><details><summary>About analysis quality</summary><p>Fast: depth 12, up to 0.5 seconds per position.<br>Balanced: depth 14, up to 1 second per position.<br>Thorough: depth 16, up to 1.5 seconds per position.</p></details>
    </fieldset>
  </div>`);
  const secondary = view.querySelector<HTMLElement>('[data-maia-setting="secondMaiaElo"]')!;
  const updateSecondary = () => {
    secondary.hidden = !prefs.secondMaiaEnabled;
    secondary.querySelector('select')!.disabled = !prefs.secondMaiaEnabled;
    view.querySelector<HTMLElement>('[data-second-maia]')!.hidden = !prefs.secondMaiaEnabled;
  };
  updateSecondary();
  view.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-engine-pref]').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.enginePref as keyof EnginePreferences;
      const value =
        input.tagName === 'INPUT'
          ? (input as HTMLInputElement).checked
          : key === 'selfElo' || key === 'opponentElo' || key === 'secondMaiaElo'
            ? Number(input.value)
            : input.value;
      // A primary rating selection matches both inputs, just like the card's rating picker.
      const opponent = key === 'selfElo' ? { opponentElo: value } : {};
      prefs = readEnginePreferences(JSON.stringify({ ...prefs, ...opponent, [key]: value }));
      view.querySelector<HTMLSelectElement>('[data-engine-pref="opponentElo"]')!.value = String(
        prefs.opponentElo,
      );
      updateSecondary();
      saveEnginePreferences(prefs);
      changed(prefs);
    });
  });
  view.querySelectorAll<HTMLInputElement>('[data-arrow-color]').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.arrowColor as keyof EngineColors;
      prefs = readEnginePreferences(
        JSON.stringify({ ...prefs, arrowColors: { ...prefs.arrowColors, [key]: input.value } }),
      );
      saveEnginePreferences(prefs);
      changed(prefs);
    });
  });
  view.querySelector<HTMLButtonElement>('.nosweat-reset-arrow-colors')!.onclick = () => {
    prefs = { ...prefs, arrowColors: { ...engineColors } };
    view
      .querySelectorAll<HTMLInputElement>('[data-arrow-color]')
      .forEach(input => (input.value = prefs.arrowColors[input.dataset.arrowColor as keyof EngineColors]));
    saveEnginePreferences(prefs);
    changed(prefs);
  };
  view.querySelectorAll<HTMLInputElement>('input[name="nosweat-review-quality"]').forEach(input => {
    input.onchange = () => storage.set('nosweat.gameReview.quality', gameReviewQuality(input.value).name);
  });
  return view;
}

export function showEngineSettings(
  prefs: EnginePreferences,
  changed: (prefs: EnginePreferences) => void,
  advanced?: () => void,
): void {
  const view = engineSettingsView(prefs, changed);
  if (advanced)
    view.append(
      frag(
        '<button type="button" class="button button-empty nosweat-advanced-stockfish">Advanced Stockfish settings</button>',
      ),
    );
  domDialog({
    class: 'nosweat-maia-settings-dialog',
    modal: true,
    show: true,
    easyClose: 'clickOutside',
    htmlText: '<h2>Engine Analysis</h2>',
    insert: [{ nodes: view }],
    actions: advanced
      ? [
          {
            selector: '.nosweat-advanced-stockfish',
            listener: (_event, dialog) => {
              dialog.close();
              advanced();
            },
          },
        ]
      : [],
  });
}
