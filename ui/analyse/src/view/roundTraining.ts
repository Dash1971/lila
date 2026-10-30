import { h, thunk, type VNode } from 'snabbdom';

import { getPlayer } from 'lib/game';
import { licon } from 'lib/licon';
import { bind, dataIcon, onInsert } from 'lib/view';
import { userLink } from 'lib/view/userLink';

import type AnalyseCtrl from '@/ctrl';

import type { AnalysisMetaSide, GamePhase } from '../interfaces';
import { classificationCounts, moveClasses } from '../noSweatFullReview';
import { findTag } from '../study/studyChapters';

type AdviceKind = 'inaccuracy' | 'mistake' | 'blunder';

interface Advice {
  kind: AdviceKind;
  i18n: I18nPlural;
  symbol: string;
}

const renderPlayer = ({ data, study }: AnalyseCtrl, color: Color): VNode => {
  const { user, ratingDiff, name, ai } = getPlayer(data, color);
  return user
    ? userLink({ ...user, name: user.username, ratingDiff, line: false })
    : h(
        'span',
        { attrs: { title: name || '' } },
        name ||
          (ai && 'Stockfish level ' + ai) ||
          (study && findTag(study.data.chapter.tags, color)) ||
          'Anonymous',
      );
};

const advices: Advice[] = [
  { kind: 'inaccuracy', i18n: i18n.site.numberInaccuracies, symbol: '?!' },
  { kind: 'mistake', i18n: i18n.site.numberMistakes, symbol: '?' },
  { kind: 'blunder', i18n: i18n.site.numberBlunders, symbol: '??' },
];

const phaseOrder: GamePhase[] = ['opening', 'middlegame', 'endgame'];

function playerTable(ctrl: AnalyseCtrl, color: Color): VNode {
  const sideData = ctrl.mainlineAnalysis![color];

  return h('div.advice-summary__side', [
    h('div.advice-summary__player', [h(`icon.is.color-icon.${color}.text`), renderPlayer(ctrl, color)]),
    h('div.advice-summary__sections', [
      h('div.advice-summary__acpl', [
        ...advices.map(a => error(sideData[a.kind], color, a)),
        h('div', [h('strong', sideData.acpl), h('span', ` ${i18n.site.averageCentipawnLoss}`)]),
      ]),
      h('div.advice-summary__accuracy', [...renderPhases(sideData)]),
    ]),
  ]);
}

const accuracyClass = (accuracy: number): string =>
  accuracy >= 85 ? 'good' : accuracy >= 70 ? 'inaccuracy' : accuracy >= 55 ? 'mistake' : 'blunder';

const renderPhases = (side: AnalysisMetaSide): VNode[] => {
  return [
    h(`div.advice-summary__phase`, [h('strong', [side.accuracy, '%']), h('span', i18n.site.accuracy)]),
    ...phaseOrder
      .filter(phase => side.phases?.[phase] !== undefined)
      .map(phase =>
        h(`div.advice-summary__phase.${accuracyClass(side.phases![phase]!)}`, [
          h('strong', `${side.phases![phase]}%`),
          h('span', i18n.site[phase]),
        ]),
      ),
  ];
};

const error = (nb: number, color: Color, advice: Advice) =>
  h(
    'div.advice-summary__error' + (nb ? `.symbol.${advice.kind}` : '.no-error'),
    { attrs: nb ? { 'data-color': color, 'data-symbol': advice.symbol } : {} },
    advice.i18n.asArray(nb, h('strong', nb)),
  );

const doRender = (ctrl: AnalyseCtrl): VNode => {
  if (ctrl.noSweat) {
    const counts = {
      white: classificationCounts(ctrl.mainline, 'white'),
      black: classificationCounts(ctrl.mainline, 'black'),
    };
    return h('div.advice-summary.nosweat-summary', [
      h('table', [
        h(
          'thead',
          h('tr', [
            h('th', h('div.nosweat-summary-player', renderPlayer(ctrl, 'white'))),
            h('th'),
            h('th', h('div.nosweat-summary-player', renderPlayer(ctrl, 'black'))),
          ]),
        ),
        h('tbody', [
          ...moveClasses.map((category, i) => {
            const count = (c: Color) =>
              h(
                'td',
                h(
                  'button.fbt',
                  {
                    attrs: {
                      type: 'button',
                      disabled: !counts[c][i],
                      'aria-label': `${category.name}: ${counts[c][i]} for ${c}`,
                    },
                    hook: bind('click', () => ctrl.jumpToGlyphSymbol(c, category.symbol), ctrl.redraw),
                  },
                  String(counts[c][i]),
                ),
              );
            return h('tr', [
              count('white'),
              h('td', { attrs: { style: 'color:' + category.color } }, category.symbol + ' ' + category.name),
              count('black'),
            ]);
          }),
          h('tr.accuracy', [
            h('td', `${ctrl.mainlineAnalysis!.white.accuracy}%`),
            h('td', i18n.site.accuracy),
            h('td', `${ctrl.mainlineAnalysis!.black.accuracy}%`),
          ]),
          h('tr', [
            h('td', String(ctrl.mainlineAnalysis!.white.acpl)),
            h('td', 'Avg. centipawn loss'),
            h('td', String(ctrl.mainlineAnalysis!.black.acpl)),
          ]),
        ]),
      ]),
      !ctrl.study &&
        h(
          'a.button.text',
          {
            class: { active: !!ctrl.retro },
            attrs: dataIcon(licon.PlayTriangle),
            hook: bind('click', ctrl.toggleRetro, ctrl.redraw),
          },
          i18n.site.learnFromYourMistakes,
        ),
    ]);
  }
  return h(
    'div.advice-summary',
    {
      hook: onInsert(elem => {
        $(elem).on('click', 'div.symbol', function (this: HTMLElement) {
          ctrl.jumpToGlyphSymbol(this.dataset.color as Color, this.dataset.symbol!);
        });
      }),
    },
    [
      playerTable(ctrl, 'white'),
      ctrl.study
        ? null
        : h(
            'a.button.text',
            {
              class: { active: !!ctrl.retro },
              attrs: dataIcon(licon.PlayTriangle),
              hook: bind('click', ctrl.toggleRetro, ctrl.redraw),
            },
            i18n.site.learnFromYourMistakes,
          ),
      playerTable(ctrl, 'black'),
    ],
  );
};

export function puzzleLink(ctrl: AnalyseCtrl): VNode | undefined {
  const puzzle = ctrl.data.puzzle;
  if (!puzzle) return undefined;
  return h(
    'div.analyse__puzzle',
    h(
      'a.button-link.text',
      {
        attrs: {
          ...dataIcon(licon.ArcheryTarget),
          href: `/training/${puzzle.key}/${ctrl.bottomColor()}`,
        },
      },
      ['Recommended puzzle training', h('br'), puzzle.name],
    ),
  );
}

export function render(ctrl: AnalyseCtrl): VNode | undefined {
  if (ctrl.study?.practice) return undefined;

  if (
    !ctrl.mainlineAnalysis ||
    !ctrl.settings.showMainlineAnalysis ||
    (ctrl.study && ctrl.study.vm.toolTab() !== 'serverEval')
  ) {
    if (!ctrl.data.puzzle) return h('div.analyse__round-training');
    return h('div.analyse__round-training', puzzleLink(ctrl));
  }

  // don't cache until the analysis is complete!
  const buster = ctrl.mainlineAnalysis.partial ? Math.random() : '';
  let cacheKey = String(buster) + !!ctrl.retro + Boolean(ctrl.idbTree.hasLocalAnalysis);
  if (ctrl.noSweat) cacheKey += JSON.stringify(ctrl.mainline.map(n => n.glyphs));
  if (ctrl.study) cacheKey += ctrl.study.data.chapter.id;

  return h('div.analyse__round-training', [
    h(
      'div.analyse__acpl',
      thunk(ctrl.noSweat ? 'div.advice-summary.nosweat-summary' : 'div.advice-summary', doRender, [
        ctrl,
        cacheKey,
      ]),
    ),
    puzzleLink(ctrl),
  ]);
}
