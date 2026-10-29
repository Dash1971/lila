import { hl, type Hooks, type VNode } from 'lib/view/snabbdom';

import { whiteWinPercent } from './noSweatAccuracy';
import { scoreText } from './noSweatCore';
import type { GameReport } from './noSweatGameReview';

// Native bind() installs only once. Review actions change as the report progresses.
export const reviewClick = (action: (event: MouseEvent) => void): Hooks => {
  const attach = (vnode: VNode) => {
    (vnode.elm as HTMLElement | SVGElement).onclick = action;
  };
  return { insert: attach, update: (_, vnode) => attach(vnode) };
};

export const classificationLabels: Record<string, string> = {
  '!!': 'Brilliant',
  '!': 'Good',
  '!?': 'Interesting',
  '?!': 'Dubious',
  '?': 'Mistake',
  '??': 'Blunder',
};
export const classificationClasses: Record<string, string> = {
  '!!': 'brilliant',
  '!': 'good',
  '!?': 'interesting',
  '?!': 'dubious',
  '?': 'mistake',
  '??': 'blunder',
};
export function reviewView(
  report: GameReport | undefined,
  running: boolean,
  start: () => void,
  stop: () => void,
  jump: (path: string) => void,
  currentPath: string,
  available = true,
): VNode {
  const button = (text: string, action: () => void, disabled = false) =>
    hl(
      'button.button.button-empty',
      {
        attrs: { type: 'button', disabled },
        hook: reviewClick(action),
      },
      text,
    );
  const phase =
    report?.state === 'evaluating'
      ? 'Analysing positions'
      : report?.state === 'classifying'
        ? 'Classifying moves'
        : 'Verifying standout moves';
  const complete = report?.state === 'complete';
  return hl('section.nosweat-game-review', { attrs: { 'aria-label': 'Whole-game computer analysis' } }, [
    hl('div.nosweat-review-heading', [
      hl('h2', 'Computer analysis'),
      running
        ? button('Stop', stop)
        : button(
            report?.state === 'stopped' ? 'Resume analysis' : complete ? 'Analyse again' : 'Analyse game',
            start,
            !available,
          ),
    ]),
    running &&
      hl(
        'p',
        { attrs: { role: 'status' } },
        report?.state === 'confirming' ? phase : `${phase}: ${report?.completed} / ${report?.total}`,
      ),
    report?.state === 'stopped' &&
      hl('p', { attrs: { role: 'status' } }, 'Analysis stopped. Resume to finish this game.'),
    report?.error && hl('p.error', { attrs: { role: 'alert' } }, report.error),
    report?.accuracy &&
      hl('div', [
        hl('table.nosweat-accuracy', [
          hl('thead', [hl('tr', [hl('th', ''), hl('th', 'White'), hl('th', 'Black')])]),
          hl('tbody', [
            hl('tr', [
              hl('th', 'Accuracy'),
              ...(['white', 'black'] as const).map(color =>
                hl(
                  'td',
                  {
                    attrs: { 'data-color': color },
                  },
                  report.accuracy![color] === null ? '—' : report.accuracy![color].toFixed(1) + '%',
                ),
              ),
            ]),
          ]),
        ]),
        renderGraph(report, currentPath, jump),
        hl('table.nosweat-classifications', [
          hl('thead', [hl('tr', [hl('th', 'Classification'), hl('th', 'White'), hl('th', 'Black')])]),
          hl(
            'tbody',
            Object.entries(classificationLabels).map(([symbol, name]) => {
              const paths = (white: boolean) =>
                report.moves.flatMap((move, i) =>
                  move?.symbol === symbol && (report.nodes[i].fen.split(' ')[1] === 'w') === white
                    ? [report.nodes[i + 1].path]
                    : [],
                );
              return hl('tr', { attrs: { 'data-classification': classificationClasses[symbol] } }, [
                hl('th', `${symbol} ${name}`),
                ...[true, false].map(white => {
                  const matches = paths(white);
                  return hl('td', [
                    button(
                      String(matches.length),
                      () => {
                        const current = report.nodes.findIndex(node => node.path === currentPath);
                        const after = matches.find(
                          path => report.nodes.findIndex(node => node.path === path) > current,
                        );
                        const target = after ?? matches[0];
                        if (target !== undefined) jump(target);
                      },
                      !matches.length,
                    ),
                  ]);
                }),
              ]);
            }),
          ),
        ]),
        report.unavailable.length > 0 &&
          hl(
            'p',
            `${report.unavailable.length} move classifications unavailable. Accuracy uses the complete Stockfish review.`,
          ),
        !complete && !running && hl('small', 'This review is incomplete.'),
      ]),
  ]);
}
function renderGraph(report: GameReport, currentPath: string, jump: (path: string) => void): VNode {
  const points = report.reviews.map((r, i) => ({
    x: (i / (report.reviews.length - 1)) * 600,
    y: (100 - whiteWinPercent(r.current.lines[0])) * 1.2,
  }));
  return hl(
    'svg.nosweat-review-graph',
    {
      attrs: {
        viewBox: '0 0 600 120',
        role: 'group',
        'aria-label': 'Game evaluation: White winning chances. Select a move to navigate.',
      },
    },
    [
      hl('line', { attrs: { x1: 0, y1: 60, x2: 600, y2: 60, stroke: 'currentColor', opacity: 0.3 } }),
      hl('polyline', {
        attrs: {
          points: points.map(p => `${p.x},${p.y}`).join(' '),
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 2,
        },
      }),
      ...points.map((p, i) =>
        hl(
          'a',
          {
            attrs: {
              href: '#',
              'aria-label': `${report.nodes[i].san ?? 'Start position'}: ${scoreText(report.reviews[i].current.lines[0])}`,
            },
            hook: reviewClick(event => {
              event.preventDefault();
              jump(report.nodes[i].path);
            }),
          },
          [
            hl('circle', {
              attrs: {
                cx: p.x,
                cy: p.y,
                r: 4,
                fill: 'currentColor',
                opacity: report.nodes[i].path === currentPath ? 1 : 0.25,
              },
            }),
          ],
        ),
      ),
    ],
  );
}
