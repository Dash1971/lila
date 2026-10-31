import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { attributesModule, classModule, init } from 'snabbdom';

import { hl } from 'lib/view';

import type { Candidate } from '../src/noSweatCore';
import {
  chartDomain,
  chartMoves,
  chartPath,
  chartX,
  chartY,
  ratingChart,
  ratingLegend,
  ratingSamples,
  type RatingChartOptions,
} from '../src/noSweatRatingChart';

const move = (uci: string, probability: number): Candidate => ({ uci, probability });
const names: Record<string, string> = {
  e2e4: 'e4',
  d2d4: 'd4',
  c2c4: 'c4',
  g2g3: 'g3',
  g1f3: 'Nf3',
};
const name = (uci: string) => names[uci] ?? uci;

function mount(t: TestContext) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
  let disconnected = false;
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const patch = init([attributesModule, classModule]);
  let vnode = patch(host, hl('section'));
  const root = vnode.elm as HTMLElement;
  t.after(() => {
    patch(vnode, hl('div'));
    root.remove();
    assert.equal(disconnected, true, 'the chart observer is released with the native view');
    if (descriptor) Object.defineProperty(globalThis, 'ResizeObserver', descriptor);
    else Reflect.deleteProperty(globalThis, 'ResizeObserver');
  });
  return {
    root,
    render(
      data: Map<number, Candidate[]>,
      options: RatingChartOptions,
      select = (_rating: number) => {},
      preview = (_uci: string) => {},
    ) {
      vnode = patch(
        vnode,
        hl('section', [
          ratingLegend(data, name, preview, options),
          ratingChart(data, name, select, preview, () => {}, options),
        ]),
      );
    },
  };
}

test('the complete 600–2600 rating range retains raw probabilities and real gaps', () => {
  assert.equal(ratingSamples.length, 21);
  assert.equal(chartX(600), 48);
  assert.equal(chartX(2600), 348);
  assert.equal(chartY(0), 200);
  assert.equal(chartY(1), 35);
  const values = new Map([
    [600, [move('e2e4', 0.5), move('d2d4', 0.1)]],
    [800, []],
    [900, [move('e2e4', NaN)]],
    [1000, [move('e2e4', 0.2)]],
  ]);
  assert.equal(chartPath(values, 'e2e4').trim(), 'M48,117.5  M78,200  M108,167');
  assert.equal(chartDomain(values, ['e2e4']), 0.6);
});

test('Maia candidate union retains human leaders, rare engine choices and low-rating-only moves', () => {
  const primary = [move('e2e4', 0.5), move('d2d4', 0.3), move('c2c4', 0.1), move('ignored', 0.1)];
  // Insertion order is deliberately reversed; rating leaders follow the actual rating axis.
  const values = new Map([
    [2600, [move('expert', 0.6), move('e2e4', 0.2)]],
    [600, [move('tempting', 0.4), move('e2e4', 0.3)]],
    [700, [move('e2e4', 0.5)]],
  ]);
  assert.deepEqual(chartMoves(values, primary, ['d2d4', 'rare-engine', 'third-engine', 'ignored-sf']), [
    'e2e4',
    'd2d4',
    'c2c4',
    'rare-engine',
    'third-engine',
    'tempting',
    'expert',
  ]);
});

test('adaptive scale matches Maia at the exact 60% boundary without considering unplotted moves', () => {
  assert.equal(chartDomain(new Map(), ['a']), 1);
  assert.equal(chartDomain(new Map([[600, [move('a', 0.6), move('not-plotted', 0.9)]]]), ['a']), 0.6);
  assert.equal(chartDomain(new Map([[600, [move('a', 0.60001)]]]), ['a']), 1);
  assert.equal(chartDomain(new Map([[600, [move('a', 1)]]]), ['a']), 1);
});

test('compact chart keeps every series and shared quality colors, without invented endpoints', t => {
  const chart = mount(t);
  const primary = [move('e2e4', 0.35), move('d2d4', 0.25), move('c2c4', 0.15)];
  const palette: Record<string, string> = { e2e4: '#238b45', d2d4: '#ffffcc', c2c4: '#ef3b2c' };
  const options: RatingChartOptions = {
    primary,
    stockfish: ['g2g3', 'g1f3', 'e2e4'],
    color: uci => palette[uci] ?? 'var(--c-font-dim)',
  };
  const values = new Map([[600, [...primary, move('g2g3', 0.05), move('g1f3', 0.05)]]]);
  chart.render(values, options);
  assert.equal(chart.root.querySelectorAll('.nosweat-chart-legend button').length, 5);
  assert.equal(chart.root.querySelectorAll('.nosweat-rating-series').length, 5);
  assert.equal(chart.root.querySelector('svg')!.getAttribute('viewBox'), '0 0 300 149');
  assert.equal(chart.root.querySelector('svg')!.getAttribute('data-domain'), '0.6');
  assert.ok(chart.root.querySelector('svg')!.textContent.includes('60%'));
  assert.equal(chart.root.querySelectorAll('.nosweat-rating-endpoint').length, 0);
  for (const uci of chartMoves(values, primary, options.stockfish)) {
    const color = options.color!(uci);
    const series = chart.root.querySelector(`.nosweat-rating-series[data-move="${uci}"]`)!;
    assert.equal(series.querySelector('.nosweat-rating-line')!.getAttribute('stroke'), color);
    const fill = series.querySelector('.nosweat-rating-area')!.getAttribute('fill')!;
    const gradient = chart.root.querySelector(`[id="${fill.slice(5, -1)}"]`)!;
    assert.equal(gradient.querySelector('stop')!.getAttribute('stop-color'), color);
    assert.equal(series.querySelector('circle')!.getAttribute('fill'), color);
    assert.ok(chart.root.querySelector(`button[data-move="${uci}"]`)!.getAttribute('style')!.includes(color));
  }
  values.set(2600, [move('g1f3', 0.65), ...primary]);
  chart.render(values, options);
  assert.equal(chart.root.querySelector('svg')!.getAttribute('data-domain'), '1');
  assert.equal(chart.root.querySelectorAll('.nosweat-rating-endpoint').length, 5);
});

test('hover and keyboard focus explain one rating without playing, with fresh native actions after redraw', t => {
  const chart = mount(t);
  let values = new Map([[600, [move('e2e4', 0.35), move('d2d4', 0.25)]]]);
  const primary = [move('e2e4', 0.35), move('d2d4', 0.25)];
  const hovers: (string | undefined)[] = [];
  const oldSelections: number[] = [];
  const newSelections: number[] = [];
  const oldPreviews: string[] = [];
  const newPreviews: string[] = [];
  const options: RatingChartOptions = {
    primary,
    hover: uci => hovers.push(uci),
    describe: (uci, rating, p) => `${name(uci)} · Maia ${rating} · ${(p * 100).toFixed(1)}% · Good move`,
  };
  chart.render(
    values,
    options,
    rating => oldSelections.push(rating),
    uci => oldPreviews.push(uci),
  );
  const legend = chart.root.querySelector<HTMLButtonElement>('button[data-move="e2e4"]')!;
  legend.focus();
  assert.equal(hovers[hovers.length - 1], 'e2e4');
  assert.equal(oldSelections.length + oldPreviews.length, 0);
  legend.blur();
  assert.equal(hovers[hovers.length - 1], undefined);
  const point = chart.root.querySelector<SVGElement>('.nosweat-rating-series[data-move="e2e4"] a')!;
  point.dispatchEvent(new window.FocusEvent('focus'));
  const tooltip = chart.root.querySelector<HTMLElement>('.nosweat-rating-tooltip')!;
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.querySelector('strong')!.textContent, 'Maia 600');
  assert.deepEqual(
    [...tooltip.querySelectorAll('.nosweat-rating-tooltip-row')].map(row => row.textContent),
    ['e435.0%', 'd425.0%'],
  );
  assert.ok(point.getAttribute('aria-label')!.includes('Good move'));
  assert.equal(oldSelections.length + oldPreviews.length, 0);
  values = new Map([[600, [move('e2e4', 0.19), move('d2d4', 0.25)]]]);
  chart.render(
    values,
    { ...options, color: () => '#ef3b2c' },
    rating => newSelections.push(rating),
    uci => newPreviews.push(uci),
  );
  assert.equal(chart.root.querySelector('button[data-move="e2e4"]'), legend);
  assert.equal(chart.root.querySelector('.nosweat-rating-series[data-move="e2e4"] a'), point);
  assert.ok(tooltip.textContent.includes('19.0%'));
  legend.click();
  point.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.deepEqual(newSelections, [600]);
  assert.deepEqual(newPreviews, ['e2e4']);
  assert.equal(oldSelections.length + oldPreviews.length, 0);
  values = new Map();
  chart.render(values, options);
  assert.equal(tooltip.hidden, true);
  assert.equal(tooltip.textContent, '');
});

test('dense endpoint labels stay inside the compact plot while every series remains available', t => {
  const chart = mount(t);
  const values = new Map<number, Candidate[]>();
  for (let i = 0; i < 15; i++) values.set(600 + i * 100, [move(`move${i}`, 0.4)]);
  values.set(
    2600,
    Array.from({ length: 15 }, (_, i) => move(`move${i}`, 0.01)),
  );
  chart.render(values, {});
  const count = chartMoves(values).length;
  assert.equal(count, 15);
  assert.equal(chart.root.querySelectorAll('.nosweat-rating-series').length, count);
  assert.equal(chart.root.querySelectorAll('.nosweat-chart-legend button').length, count);
  const ys = [...chart.root.querySelectorAll('.nosweat-rating-endpoint')].map(
    el => Number(el.getAttribute('y')) - 4,
  );
  assert.ok(ys.length < count);
  assert.ok(ys.every(y => y >= 7 && y <= 126));
  assert.ok(ys.every((y, i) => i === 0 || y - ys[i - 1] >= 12));
});

test('shared tooltip follows rating columns with raw probabilities and no invented missing sample', t => {
  const chart = mount(t);
  const primary = [move('e2e4', 0.35), move('d2d4', 0.25)];
  const values = new Map([
    [600, primary],
    [1600, [move('e2e4', 0.25), move('d2d4', 0.1)]],
  ]);
  const selections: number[] = [];
  const previews: string[] = [];
  const hovers: (string | undefined)[] = [];
  chart.render(
    values,
    { primary, stockfish: ['g2g3'], hover: uci => hovers.push(uci) },
    rating => selections.push(rating),
    uci => previews.push(uci),
  );
  const svg = chart.root.querySelector<SVGSVGElement>('svg')!;
  t.mock.method(svg, 'getBoundingClientRect', () => new window.DOMRect(0, 0, 300, 149));
  const tooltip = chart.root.querySelector<HTMLElement>('.nosweat-rating-tooltip')!;
  svg.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 151, clientY: 40 }));
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.querySelector('strong')!.textContent, 'Maia 1600');
  assert.deepEqual(
    [...tooltip.querySelectorAll('.nosweat-rating-tooltip-row')].map(row => row.textContent),
    ['e425.0%', 'd410.0%', 'g30.0%'],
  );
  svg.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 52, clientY: 40 }));
  assert.equal(tooltip.hidden, true, 'an unfinished 700 sample must not be displayed as zero');
  svg.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 41, clientY: 40 }));
  assert.equal(tooltip.hidden, false);
  svg.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 1, clientY: 40 }));
  assert.equal(tooltip.hidden, true, 'axis/margin hover clears the previous rating');
  assert.deepEqual(selections, []);
  assert.deepEqual(previews, []);
  assert.deepEqual(hovers, [], 'a shared column does not invent a selected move');
});

test('one keyboard entry explores series and available ratings without triggering board shortcuts or selecting', t => {
  const chart = mount(t);
  const primary = [move('e2e4', 0.35), move('d2d4', 0.25)];
  const values = new Map([
    [600, primary],
    [800, primary],
    [2600, primary],
  ]);
  const selections: number[] = [];
  const previews: string[] = [];
  chart.render(
    values,
    { primary },
    rating => selections.push(rating),
    uci => previews.push(uci),
  );
  const points = () => chart.root.querySelectorAll('.nosweat-rating-point[tabindex="0"]');
  assert.equal(points().length, 1);
  const entry = points()[0] as SVGElement;
  entry.focus();
  assert.equal(document.activeElement, entry);
  let boardShortcuts = 0;
  const boardKeydown = () => boardShortcuts++;
  document.addEventListener('keydown', boardKeydown);
  t.after(() => document.removeEventListener('keydown', boardKeydown));
  const press = (key: string) => {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(points().length, 1);
    return document.activeElement!;
  };
  let current = press('ArrowRight');
  assert.equal(current.getAttribute('data-rating'), '800', 'skip the unfinished 700 sample');
  assert.equal(current.closest('.nosweat-rating-series')!.getAttribute('data-move'), 'e2e4');
  current = press('ArrowDown');
  assert.equal(current.getAttribute('data-rating'), '800');
  assert.equal(current.closest('.nosweat-rating-series')!.getAttribute('data-move'), 'd2d4');
  current = press('End');
  assert.equal(current.getAttribute('data-rating'), '2600');
  current = press('ArrowUp');
  assert.equal(current.closest('.nosweat-rating-series')!.getAttribute('data-move'), 'e2e4');
  current = press('Home');
  assert.equal(current.getAttribute('data-rating'), '600');
  assert.deepEqual(selections, []);
  assert.deepEqual(previews, []);
  press('Enter');
  assert.deepEqual(selections, [600]);
  press(' ');
  assert.deepEqual(selections, [600, 600]);
  assert.deepEqual(previews, [], 'point activation chooses the rating, not a variation');
  assert.equal(boardShortcuts, 0);
  const beforeBrowserShortcut = document.activeElement;
  const browserShortcut = new window.KeyboardEvent('keydown', {
    key: 'ArrowLeft',
    altKey: true,
    bubbles: true,
    cancelable: true,
  });
  assert.ok(beforeBrowserShortcut);
  beforeBrowserShortcut.dispatchEvent(browserShortcut);
  assert.equal(browserShortcut.defaultPrevented, false, 'browser navigation modifiers remain available');
  assert.equal(document.activeElement, beforeBrowserShortcut);
});
