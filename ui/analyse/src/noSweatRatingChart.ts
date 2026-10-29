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

export function chartPath(data: Map<number, Candidate[]>, uci: string): string {
  let connected = false;
  return ratingSamples
    .map(rating => {
      const values = data.get(rating);
      if (!values) {
        connected = false;
        return '';
      }
      const probability = values.find(move => move.uci === uci)?.probability ?? 0;
      const segment = `${connected ? 'L' : 'M'}${chartX(rating)},${chartY(probability)}`;
      connected = true;
      return segment;
    })
    .join(' ');
}

export function ratingChart(
  data: Map<number, Candidate[]>,
  name: (uci: string) => string,
  select: (rating: number) => void,
  preview: (uci: string) => void,
): VNode {
  const moves = chartMoves(data);
  return hl('div.nosweat-rating-chart', [
    hl(
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
    ),
    hl(
      'svg',
      {
        attrs: {
          viewBox: '0 0 402 246',
          role: 'img',
          'aria-label': 'Moves by rating: Maia probability from 600 to 2600',
        },
      },
      [
        ...[0, 0.25, 0.5, 0.75, 1].flatMap(p => [
          hl('line', {
            attrs: {
              x1: 48,
              x2: 348,
              y1: chartY(p),
              y2: chartY(p),
              stroke: 'currentColor',
              opacity: 0.18,
              'stroke-dasharray': '3 3',
            },
          }),
          hl(
            'text',
            {
              attrs: { x: 40, y: chartY(p) + 4, 'text-anchor': 'end', fill: 'currentColor', 'font-size': 10 },
            },
            `${p * 100}%`,
          ),
        ]),
        ...[600, 1000, 1400, 1800, 2200, 2600].flatMap(rating => [
          hl('line', {
            attrs: {
              x1: chartX(rating),
              x2: chartX(rating),
              y1: 35,
              y2: 200,
              stroke: 'currentColor',
              opacity: 0.12,
              'stroke-dasharray': '3 3',
            },
          }),
          hl(
            'text',
            {
              attrs: {
                x: chartX(rating),
                y: 220,
                'text-anchor': 'middle',
                fill: 'currentColor',
                'font-size': 10,
              },
            },
            String(rating),
          ),
        ]),
        hl(
          'text',
          {
            attrs: {
              transform: 'translate(12 118) rotate(-90)',
              'text-anchor': 'middle',
              fill: 'currentColor',
              'font-size': 10,
            },
          },
          'Maia probability',
        ),
        ...moves.flatMap((uci, index) => [
          hl('path', {
            attrs: {
              d: chartPath(data, uci),
              fill: 'none',
              stroke: colors[index],
              'stroke-width': 2.5,
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
                  hl('circle', { attrs: { cx: chartX(rating), cy: chartY(p), r: 3.5, fill: colors[index] } }),
                ],
              ),
            ];
          }),
          data.has(2600) &&
            hl(
              'text',
              {
                attrs: {
                  x: 358,
                  y: chartY(data.get(2600)!.find(m => m.uci === uci)?.probability ?? 0) + 4,
                  fill: colors[index],
                  'font-size': 11,
                },
              },
              name(uci),
            ),
        ]),
      ],
    ),
  ]);
}
