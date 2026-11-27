import { hl, type Hooks, type VNode } from 'lib/view';

import type { Candidate } from './core';
import { chartLabels, chartTicks, standardDomains } from './ratingChartLayout';
import { reviewMove } from './reviewEvents';

// Maia platform (GPL-3.0), 50083f295d7043b54eeaa2f53f459b1c5aee9937:
// natural-move selection, standard axes and lighter nested lines. Raw policy/gaps stay native.
export const ratingSamples: number[] = Array.from({ length: 21 }, (_, i) => 600 + i * 100);
export const chartX = (rating: number): number => 48 + ((rating - 600) / 2000) * 300;
export const chartY = (probability: number): number => 200 - Math.max(0, Math.min(1, probability)) * 165;

export interface RatingChartOptions {
  ariaLabel?: string;
  probabilityLabel?: string;
  selectLabel?: (rating: number) => string;
  moves?: string[];
  width?: number;
  height?: number;
  selectedRating?: number;
  primary?: Candidate[];
  stockfish?: string[];
  color?: (uci: string) => string;
  isBlunder?: (uci: string) => boolean;
  previewLabel?: (move: string) => string;
  describe?: (uci: string, rating: number, probability: number) => string;
  hover?: (uci?: string) => void;
}

export function chartMoves(
  data: Map<number, Candidate[]>,
  _primary: Candidate[] = [],
  stockfish: string[] = [],
  isBlunder: (uci: string) => boolean = () => false,
): string[] {
  const peak = new Map<string, number>();
  for (const rating of ratingSamples)
    for (const move of data.get(rating) ?? []) {
      const p = move.probability;
      if (Number.isFinite(p) && p > 0 && p <= 1 && p > (peak.get(move.uci) ?? 0)) peak.set(move.uci, p);
    }
  const ranked = [...peak.keys()].sort((a, b) => peak.get(b)! - peak.get(a)! || a.localeCompare(b));
  const natural = ranked.filter((uci, i) => i === 0 || peak.get(uci)! >= 0.15);
  const moves = [...new Set([...(stockfish[0] ? [stockfish[0]] : []), ...natural])].slice(0, 6);
  if (moves.length < 6 && !moves.some(isBlunder)) {
    const tempting = ranked.find(uci => peak.get(uci)! >= 0.05 && isBlunder(uci));
    if (tempting) moves.push(tempting);
  }
  return moves;
}

function probabilityAt(data: Map<number, Candidate[]>, rating: number, uci: string): number | undefined {
  const sample = data.get(rating);
  if (!sample) return undefined;
  const probability = sample.find(move => move.uci === uci)?.probability ?? 0;
  return Number.isFinite(probability) && probability >= 0 && probability <= 1 ? probability : undefined;
}

export function chartDomain(data: Map<number, Candidate[]>, moves: string[]): number {
  if (!ratingSamples.some(rating => data.has(rating))) return 1;
  const peak = Math.max(
    0,
    ...ratingSamples.flatMap(rating => moves.map(uci => probabilityAt(data, rating, uci) ?? 0)),
  );
  return standardDomains.find(top => peak <= top) ?? 1;
}

export function chartPath(
  data: Map<number, Candidate[]>,
  uci: string,
  x: (rating: number) => number = chartX,
  y: (probability: number) => number = chartY,
): string {
  let connected = false;
  return ratingSamples
    .map(rating => {
      const probability = probabilityAt(data, rating, uci);
      if (probability === undefined) {
        connected = false;
        return '';
      }
      const segment = `${connected ? 'L' : 'M'}${x(rating)},${y(probability)}`;
      connected = true;
      return segment;
    })
    .join(' ');
}

function chartArea(
  data: Map<number, Candidate[]>,
  uci: string,
  x: (rating: number) => number,
  y: (probability: number) => number,
): string {
  const segments: { rating: number; probability: number }[][] = [];
  let segment: { rating: number; probability: number }[] = [];
  for (const rating of ratingSamples) {
    const probability = probabilityAt(data, rating, uci);
    if (probability === undefined) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push({ rating, probability });
  }
  if (segment.length) segments.push(segment);
  return segments
    .map(points => {
      const first = points[0];
      const last = points[points.length - 1];
      return `M${x(first.rating)},${y(0)} ${points
        .map(point => `L${x(point.rating)},${y(point.probability)}`)
        .join(' ')} L${x(last.rating)},${y(0)} Z`;
    })
    .join(' ');
}

const moveColor = (uci: string, options: RatingChartOptions) => options.color?.(uci) ?? 'var(--c-font-dim)';
const describe = (
  uci: string,
  rating: number,
  probability: number,
  name: (uci: string) => string,
  options: RatingChartOptions,
) =>
  options.describe?.(uci, rating, probability) ??
  `${name(uci)} · Maia ${rating} · ${(probability * 100).toFixed(1)}% · Stockfish quality unavailable`;

export function ratingLegend(
  data: Map<number, Candidate[]>,
  name: (uci: string) => string,
  preview: (uci: string) => void,
  options: RatingChartOptions = {},
): VNode {
  return hl(
    'div.nosweat-chart-legend',
    (options.moves ?? chartMoves(data, options.primary, options.stockfish, options.isBlunder)).map(uci =>
      hl(
        'button.fbt',
        {
          key: uci,
          attrs: {
            type: 'button',
            style: `color:${moveColor(uci, options)}`,
            'data-move': uci,
            title: options.previewLabel?.(name(uci)) ?? `Preview ${name(uci)}`,
          },
          hook: reviewMove(
            () => preview(uci),
            active => options.hover?.(active ? uci : undefined),
          ),
        },
        name(uci),
      ),
    ),
  );
}

const chartObservers = new WeakMap<Element, ResizeObserver>();
const tooltipRatings = new WeakMap<Element, number>();
let chartSerial = 0;

function hideTooltip(host: Element): void {
  tooltipRatings.delete(host);
  const tooltip = host.querySelector<HTMLElement>('.nosweat-rating-tooltip');
  if (tooltip) {
    tooltip.hidden = true;
    tooltip.replaceChildren();
  }
}

function showTooltip(
  host: Element,
  rating: number,
  data: Map<number, Candidate[]>,
  moves: string[],
  name: (uci: string) => string,
  options: RatingChartOptions,
): void {
  const tooltip = host.querySelector<HTMLElement>('.nosweat-rating-tooltip');
  if (!tooltip) return;
  if (!data.has(rating)) {
    hideTooltip(host);
    return;
  }
  tooltipRatings.set(host, rating);
  const heading = document.createElement('strong');
  heading.textContent = `Maia ${rating}`;
  const rows = [...moves]
    .sort((a, b) => (probabilityAt(data, rating, b) ?? 0) - (probabilityAt(data, rating, a) ?? 0))
    .flatMap(uci => {
      const probability = probabilityAt(data, rating, uci);
      if (probability === undefined) return [];
      const row = document.createElement('div');
      row.className = 'nosweat-rating-tooltip-row';
      row.style.color = moveColor(uci, options);
      row.title = describe(uci, rating, probability, name, options);
      const label = document.createElement('span');
      label.textContent = name(uci);
      const value = document.createElement('span');
      value.textContent = `${(probability * 100).toFixed(1)}%`;
      row.append(label, value);
      return [row];
    });
  tooltip.replaceChildren(heading, ...rows);
  tooltip.hidden = false;
}

// Like the shared tooltip, the highlight layer owns only its local DOM children.
// A <use> raises the hovered curve without moving Snabbdom's keyed series.
function highlightMove(host: Element, uci?: string): void {
  if (uci) host.setAttribute('data-hover-move', uci);
  else host.removeAttribute('data-hover-move');
  const groups = [...host.querySelectorAll<SVGGElement>('.nosweat-rating-series')];
  const active = groups.find(group => group.getAttribute('data-move') === uci);
  if (!active) host.removeAttribute('data-hover-move');
  for (const group of groups) group.style.opacity = !active || group === active ? '1' : '0.18';
  for (const label of host.querySelectorAll<SVGGElement>('[data-label-move]'))
    label.style.opacity = !active || label.getAttribute('data-label-move') === uci ? '1' : '0.18';
  const layer = host.querySelector('.nosweat-rating-highlight');
  if (!layer) return;
  layer.replaceChildren();
  if (active) {
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + active.id);
    layer.append(use);
  }
}

function pointHooks(
  action: (event: MouseEvent) => void,
  uci: string,
  rating: number,
  data: Map<number, Candidate[]>,
  moves: string[],
  name: (uci: string) => string,
  options: RatingChartOptions,
): Hooks {
  let element: Element | undefined;
  const hooks = reviewMove(action, active => {
    options.hover?.(active ? uci : undefined);
    element
      ?.querySelector('circle')
      ?.setAttribute('opacity', active || options.selectedRating === rating ? '1' : '0');
    const host = element?.closest('.nosweat-rating-chart');
    if (host) {
      highlightMove(host, active ? uci : undefined);
      if (active) showTooltip(host, rating, data, moves, name, options);
      else hideTooltip(host);
    }
  });
  const attachKeyboard = (vnode: VNode) => {
    element = vnode.elm as SVGElement;
    const point = element as SVGElement;
    point.onkeydown = event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const navigation = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
      if (!navigation.includes(event.key) && event.key !== 'Enter' && event.key !== ' ') return;
      // These keys explore the chart, never Lichess's board/move shortcuts.
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Enter' || event.key === ' ') {
        if (!event.repeat)
          point.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
        return;
      }
      const ratings = ratingSamples.filter(sample => probabilityAt(data, sample, uci) !== undefined);
      const series = moves.filter(move => probabilityAt(data, rating, move) !== undefined);
      let targetRating = rating;
      let targetMove = uci;
      if (event.key === 'ArrowLeft') targetRating = ratings[Math.max(0, ratings.indexOf(rating) - 1)];
      if (event.key === 'ArrowRight')
        targetRating = ratings[Math.min(ratings.length - 1, ratings.indexOf(rating) + 1)];
      if (event.key === 'Home') targetRating = ratings[0];
      if (event.key === 'End') targetRating = ratings[ratings.length - 1];
      if (event.key === 'ArrowUp') targetMove = series[Math.max(0, series.indexOf(uci) - 1)];
      if (event.key === 'ArrowDown')
        targetMove = series[Math.min(series.length - 1, series.indexOf(uci) + 1)];
      const host = point.closest('.nosweat-rating-chart');
      const targetSeries = [...(host?.querySelectorAll('.nosweat-rating-series') ?? [])].find(
        group => group.getAttribute('data-move') === targetMove,
      );
      const target = targetSeries?.querySelector<SVGElement>(`a[data-rating="${targetRating}"]`);
      if (host && target) {
        host
          .querySelectorAll('.nosweat-rating-point[tabindex="0"]')
          .forEach(el => el.setAttribute('tabindex', '-1'));
        target.setAttribute('tabindex', '0');
        target.focus();
      }
    };
  };
  return {
    ...hooks,
    insert: vnode => {
      hooks.insert?.(vnode);
      attachKeyboard(vnode);
    },
    update: (old, vnode) => {
      hooks.update?.(old, vnode);
      attachKeyboard(vnode);
    },
  };
}

export function ratingChart(
  data: Map<number, Candidate[]>,
  name: (uci: string) => string,
  select: (rating: number) => void,
  _preview: (uci: string) => void,
  redraw: Redraw = () => {},
  options: RatingChartOptions = {},
): VNode {
  const moves = options.moves ?? chartMoves(data, options.primary, options.stockfish, options.isBlunder);
  const width =
    options.width ?? (document.querySelector<HTMLElement>('.nosweat-rating-chart')?.clientWidth || 300);
  const height = options.height ?? 149;
  const left = 41;
  const right = height < 200 ? 50 : 68;
  const top = height < 200 ? 19 : 25;
  const bottom = 23;
  const domain = chartDomain(data, moves);
  const gradientPrefix = `nosweat-rating-${chartSerial++}`;
  const firstRating = ratingSamples.find(rating =>
    moves.some(uci => probabilityAt(data, rating, uci) !== undefined),
  );
  const firstMove =
    firstRating === undefined
      ? undefined
      : moves.find(uci => probabilityAt(data, firstRating, uci) !== undefined);
  const x = (rating: number) => left + ((rating - 600) / 2000) * (width - left - right);
  const y = (p: number) =>
    height - bottom - (Math.max(0, Math.min(domain, p)) / domain) * (height - top - bottom);
  const selected =
    options.selectedRating === undefined
      ? undefined
      : Math.max(0, Math.min(20, Math.round((options.selectedRating - 600) / 100)));
  const selectedRating = selected === undefined ? undefined : ratingSamples[selected];
  const rankRating = selectedRating ?? 1600;
  const ordered = [...moves].sort(
    (a, b) =>
      (probabilityAt(data, rankRating, b) ?? 0) - (probabilityAt(data, rankRating, a) ?? 0) ||
      moves.indexOf(a) - moves.indexOf(b),
  );
  const main = new Set([...ordered.slice(0, 3), ...(options.stockfish?.slice(0, 1) ?? [])]);
  const lines = ordered.map(uci => ({
    uci,
    name: name(uci),
    values: ratingSamples.map(r => probabilityAt(data, r, uci)),
  }));
  const locale = document.documentElement.lang || 'en-US';
  const share = (p: number) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: p < 0.1 ? 1 : 0 }).format(p);
  const labels = chartLabels(lines, selected, width, height, i => x(ratingSamples[i]), y, share);
  const lineWidths = [3.5, 2.8, 2.25, 1.75, 1.4, 1.15];
  const attachSurface = (vnode: VNode) => {
    const svg = vnode.elm as SVGSVGElement;
    svg.onmousemove = event => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      const mouseX = ((event.clientX - rect.left) / rect.width) * width;
      if (mouseX < left || mouseX > width - right) {
        const host = svg.closest('.nosweat-rating-chart');
        if (host) {
          hideTooltip(host);
          highlightMove(host);
        }
        return;
      }
      const rating = 600 + Math.round(((mouseX - left) / (width - left - right)) * 20) * 100;
      const host = svg.closest('.nosweat-rating-chart');
      if (host) {
        showTooltip(host, rating, data, moves, name, options);
        const sample = Math.max(0, Math.min(19, Math.floor(((mouseX - left) / (width - left - right)) * 20)));
        const ratio = Math.max(
          0,
          Math.min(
            1,
            (600 + ((mouseX - left) / (width - left - right)) * 2000 - ratingSamples[sample]) / 100,
          ),
        );
        let nearest: string | undefined;
        let distance = 12;
        const mouseY = ((event.clientY - rect.top) / rect.height) * height;
        for (const uci of moves) {
          const a = probabilityAt(data, ratingSamples[sample], uci);
          const b = probabilityAt(data, ratingSamples[sample + 1], uci);
          if (a === undefined || b === undefined) continue;
          const d = Math.abs(y(a + ratio * (b - a)) - mouseY);
          if (d < distance) {
            distance = d;
            nearest = uci;
          }
        }
        highlightMove(
          host,
          (event.target as Element).closest('.nosweat-rating-series')?.getAttribute('data-move') ?? nearest,
        );
      }
    };
    svg.onmouseleave = () => {
      const host = svg.closest('.nosweat-rating-chart');
      if (host && !svg.contains(document.activeElement)) {
        hideTooltip(host);
        highlightMove(host);
      }
    };
  };
  return hl(
    'div.nosweat-rating-chart',
    {
      hook: {
        insert: vnode => {
          const el = vnode.elm as HTMLElement;
          let previous = width;
          const observer = new ResizeObserver(() => {
            const next = el.clientWidth;
            if (next && next !== previous) {
              previous = next;
              redraw();
            }
          });
          chartObservers.set(el, observer);
          observer.observe(el);
        },
        postpatch: (_, vnode) => {
          const host = vnode.elm as Element;
          highlightMove(host, host.getAttribute('data-hover-move') ?? undefined);
          const rating = tooltipRatings.get(host);
          if (rating !== undefined) showTooltip(host, rating, data, moves, name, options);
          const active = document.activeElement;
          if (active?.matches('.nosweat-rating-point') && active.closest('.nosweat-rating-chart') === host) {
            host
              .querySelectorAll('.nosweat-rating-point[tabindex="0"]')
              .forEach(el => el.setAttribute('tabindex', '-1'));
            active.setAttribute('tabindex', '0');
          }
        },
        destroy: vnode => {
          chartObservers.get(vnode.elm as Element)?.disconnect();
          tooltipRatings.delete(vnode.elm as Element);
        },
      },
    },
    [
      hl(
        'svg',
        {
          attrs: {
            viewBox: `0 0 ${width} ${height}`,
            role: 'group',
            'aria-label':
              options.ariaLabel ??
              'Moves by rating: Maia probability from 600 to 2600. Arrow keys explore; Enter selects a rating.',
            'data-domain': domain,
          },
          hook: { insert: attachSurface, update: (_, vnode) => attachSurface(vnode) },
        },
        [
          ...chartTicks(domain, height).flatMap(p => {
            return [
              hl('line', {
                attrs: {
                  x1: left,
                  x2: width - right,
                  y1: y(p),
                  y2: y(p),
                  stroke: 'currentColor',
                  opacity: 0.18,
                  'stroke-dasharray': '3 3',
                },
              }),
              hl(
                'text',
                {
                  attrs: {
                    x: left - 6,
                    y: y(p) + 4,
                    'text-anchor': 'end',
                    fill: 'currentColor',
                    'font-size': 11,
                  },
                },
                `${Math.round(p * 100)}%`,
              ),
            ];
          }),
          ...(width < 360 ? [600, 1600, 2600] : [600, 1000, 1400, 1800, 2200, 2600]).flatMap(rating => [
            hl('line', {
              attrs: {
                x1: x(rating),
                x2: x(rating),
                y1: top,
                y2: height - bottom,
                stroke: 'currentColor',
                opacity: 0.12,
                'stroke-dasharray': '3 3',
              },
            }),
            hl(
              'text',
              {
                attrs: {
                  x: x(rating),
                  y: height - 5,
                  'text-anchor': 'middle',
                  fill: 'currentColor',
                  'font-size': 11,
                },
              },
              String(rating),
            ),
          ]),
          hl(
            'text',
            {
              attrs: {
                transform: `translate(13 ${(top + height - bottom) / 2}) rotate(-90)`,
                'text-anchor': 'middle',
                fill: 'currentColor',
                'font-size': Math.min(
                  11,
                  (height - top - bottom) / ((options.probabilityLabel ?? 'Maia probability').length * 0.6),
                ),
              },
            },
            options.probabilityLabel ?? 'Maia probability',
          ),
          hl(
            'defs',
            moves.map(uci =>
              hl(
                'linearGradient',
                {
                  key: uci,
                  attrs: { id: `${gradientPrefix}-${uci}`, x1: '0', y1: '0', x2: '0', y2: '1' },
                },
                [
                  hl('stop', {
                    attrs: {
                      offset: '5%',
                      'stop-color': moveColor(uci, options),
                      'stop-opacity': main.has(uci) ? 0.18 : 0.07,
                    },
                  }),
                  hl('stop', {
                    attrs: { offset: '95%', 'stop-color': moveColor(uci, options), 'stop-opacity': 0 },
                  }),
                ],
              ),
            ),
          ),
          ...(selectedRating === undefined
            ? []
            : [
                hl(
                  'text',
                  {
                    attrs: {
                      x: Math.max(left + 14, Math.min(width - right - 14, x(selectedRating))),
                      y: 13,
                      'text-anchor': 'middle',
                      fill: 'currentColor',
                      'font-size': 10,
                    },
                  },
                  String(selectedRating),
                ),
                hl('line', {
                  attrs: {
                    x1: x(selectedRating),
                    x2: x(selectedRating),
                    y1: top,
                    y2: height - bottom,
                    stroke: 'currentColor',
                    opacity: 0.5,
                    'stroke-dasharray': '3 4',
                  },
                }),
              ]),
          ...ordered.map((uci, rank) => {
            const color = moveColor(uci, options);
            return hl(
              'g.nosweat-rating-series',
              { key: uci, attrs: { 'data-move': uci, id: `${gradientPrefix}-series-${uci}` } },
              [
                hl('path.nosweat-rating-area', {
                  attrs: {
                    d: chartArea(data, uci, x, y),
                    fill: `url(#${gradientPrefix}-${uci})`,
                    'pointer-events': 'none',
                  },
                }),
                hl('path.nosweat-rating-line', {
                  attrs: {
                    d: chartPath(data, uci, x, y),
                    fill: 'none',
                    stroke: color,
                    'stroke-width': main.has(uci)
                      ? Math.max(2, lineWidths[Math.min(rank, 5)])
                      : lineWidths[Math.min(rank, 5)],
                    opacity: main.has(uci) ? 1 : 0.65,
                    'stroke-linejoin': 'round',
                    'pointer-events': 'none',
                  },
                }),
                ...ratingSamples.flatMap(rating => {
                  const p = probabilityAt(data, rating, uci);
                  if (p === undefined) return [];
                  const title = describe(uci, rating, p, name, options);
                  return [
                    hl(
                      'a.nosweat-rating-point',
                      {
                        key: rating,
                        attrs: {
                          href: '#',
                          role: 'button',
                          'aria-label': `${title} · ${options.selectLabel?.(rating) ?? `Select Maia ${rating}`}`,
                          'data-rating': rating,
                          tabindex: uci === firstMove && rating === firstRating ? 0 : -1,
                        },
                        hook: pointHooks(
                          event => {
                            event.preventDefault();
                            select(rating);
                          },
                          uci,
                          rating,
                          data,
                          moves,
                          name,
                          options,
                        ),
                      },
                      [
                        hl('title', title),
                        hl('circle', {
                          attrs: {
                            cx: x(rating),
                            cy: y(p),
                            r: selectedRating === rating ? 3 : 5,
                            opacity: selectedRating === rating ? 1 : 0,
                            fill: color,
                          },
                        }),
                      ],
                    ),
                  ];
                }),
              ],
            );
          }),
          hl('g.nosweat-rating-highlight', { attrs: { 'aria-hidden': 'true', 'pointer-events': 'none' } }),
          ...[...labels.endpoints, ...labels.peaks, ...labels.shares].map((label, index) =>
            hl(
              'g',
              {
                key: `label-${index}-${label.uci}`,
                attrs: { 'pointer-events': 'none', 'data-label-move': label.uci },
              },
              [
                hl('line', {
                  attrs: {
                    x1: label.px,
                    y1: label.py,
                    x2: label.x - (label.anchor === 'start' ? 3 : 0),
                    y2: label.y,
                    stroke: moveColor(label.uci, options),
                    opacity: 0.55,
                    'stroke-width': 0.7,
                  },
                }),
                hl(
                  'text.' +
                    (index < labels.endpoints.length
                      ? 'nosweat-rating-endpoint'
                      : index < labels.endpoints.length + labels.peaks.length
                        ? 'nosweat-rating-peak'
                        : 'nosweat-rating-share'),
                  {
                    attrs: {
                      x: label.x,
                      y: label.y,
                      'dominant-baseline': 'central',
                      'text-anchor': label.anchor,
                      fill: moveColor(label.uci, options),
                      'font-size': label.size,
                      'font-weight': 600,
                      'data-move': label.uci,
                      stroke: 'var(--c-bg-box)',
                      'stroke-width': 2.5,
                      'paint-order': 'stroke',
                    },
                  },
                  label.text,
                ),
              ],
            ),
          ),
        ],
      ),
      // This small tooltip owns its DOM children so pointer/focus updates do not
      // redraw the board or mutate the native analysis tree.
      hl('div.nosweat-rating-tooltip', { attrs: { role: 'tooltip', hidden: true } }),
    ],
  );
}
