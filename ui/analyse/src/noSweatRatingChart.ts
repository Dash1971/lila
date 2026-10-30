import { hl, type VNode } from 'lib/view';

import type { Candidate } from './noSweatCore';
import { reviewClick } from './noSweatEvents';

export const ratingSamples = Array.from({ length: 21 }, (_, i) => 600 + i * 100);
export const chartX = (rating: number) => 48 + ((rating - 600) / 2000) * 300;
export const chartY = (probability: number) => 200 - Math.max(0, Math.min(1, probability)) * 165;
const colors = ['#45b86b', '#9bdc96', '#2b9853'];

export function chartMoves(data: Map<number, Candidate[]>): string[] {
  const totals = new Map<string, number>();
  for (const values of data.values())
    for (const move of values) totals.set(move.uci, (totals.get(move.uci) ?? 0) + move.probability);
  return [...totals]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([uci]) => uci);
}

export function chartPath(data: Map<number, Candidate[]>, uci: string, x = chartX, y = chartY): string {
  let connected = false;
  return ratingSamples
    .map(rating => {
      const values = data.get(rating);
      if (!values) {
        connected = false;
        return '';
      }
      const probability = values.find(move => move.uci === uci)?.probability ?? 0;
      const segment = `${connected ? 'L' : 'M'}${x(rating)},${y(probability)}`;
      connected = true;
      return segment;
    })
    .join(' ');
}

export function ratingLegend(
  data: Map<number, Candidate[]>,
  name: (uci: string) => string,
  preview: (uci: string) => void,
): VNode {
  const moves = chartMoves(data);
  return hl(
    'div.nosweat-chart-legend',
    moves.map((uci, i) =>
      hl(
        'button.fbt',
        {
          attrs: { type: 'button', style: `color:${colors[i]}` },
          hook: reviewClick(() => preview(uci)),
        },
        name(uci),
      ),
    ),
  );
}

const chartObservers = new WeakMap<Element, ResizeObserver>();
export function ratingChart(
  data: Map<number, Candidate[]>,
  name: (uci: string) => string,
  select: (rating: number) => void,
  _preview: (uci: string) => void,
  redraw: Redraw = () => {},
): VNode {
  const moves = chartMoves(data);
  const width = document.querySelector<HTMLElement>('.nosweat-rating-chart')?.clientWidth || 300;
  const height = 149;
  const left = 41;
  const right = 38;
  const top = 7;
  const bottom = 23;
  const x = (rating: number) => left + ((rating - 600) / 2000) * (width - left - right);
  const y = (p: number) => height - bottom - Math.max(0, Math.min(1, p)) * (height - top - bottom);
  const endpoints = moves
    .map((uci, i) => ({ uci, i, y: y(data.get(2600)?.find(m => m.uci === uci)?.probability ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < endpoints.length; i++)
    endpoints[i].y = Math.max(endpoints[i].y, endpoints[i - 1].y + 12);
  if (endpoints.length) {
    const overflow = Math.max(0, endpoints[endpoints.length - 1].y - (height - bottom));
    endpoints.forEach(e => (e.y -= overflow));
  }
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
        destroy: vnode => chartObservers.get(vnode.elm as Element)?.disconnect(),
      },
    },
    [
      hl(
        'svg',
        {
          attrs: {
            viewBox: `0 0 ${width} ${height}`,
            role: 'img',
            'aria-label': 'Moves by rating: Maia probability from 600 to 2600',
          },
        },
        [
          ...[0, 0.25, 0.5, 0.75, 1].flatMap(p => [
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
              `${p * 100}%`,
            ),
          ]),
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
                transform: `translate(10 ${(top + height - bottom) / 2}) rotate(-90)`,
                'text-anchor': 'middle',
                fill: 'currentColor',
                'font-size': 11,
              },
            },
            'Maia probability',
          ),
          ...moves.flatMap((uci, index) => [
            hl('path', {
              attrs: {
                d: chartPath(data, uci, x, y),
                fill: 'none',
                stroke: colors[index],
                'stroke-width': 2,
                'stroke-linejoin': 'round',
              },
            }),
            ...ratingSamples.flatMap(rating => {
              const values = data.get(rating);
              if (!values) return [];
              const p = values.find(move => move.uci === uci)?.probability ?? 0;
              const title = `${name(uci)} · ${rating} · ${(p * 100).toFixed(1)}%`;
              return [
                hl(
                  'a',
                  {
                    attrs: { href: '#', role: 'button', 'aria-label': title },
                    hook: reviewClick(event => {
                      event.preventDefault();
                      select(rating);
                    }),
                  },
                  [
                    hl('title', title),
                    hl('circle', { attrs: { cx: x(rating), cy: y(p), r: 2.5, fill: colors[index] } }),
                  ],
                ),
              ];
            }),
          ]),
          ...(data.has(2600)
            ? endpoints.map(e =>
                hl(
                  'text',
                  { attrs: { x: width - right + 5, y: e.y + 4, fill: colors[e.i], 'font-size': 11 } },
                  name(e.uci),
                ),
              )
            : []),
        ],
      ),
    ],
  );
}
