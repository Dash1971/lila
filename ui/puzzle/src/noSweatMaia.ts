import { parseUci } from 'chessops/util';

import { winningChances } from 'lib/ceval';
import { fenColor } from 'lib/game';
import { engineArrows, engineShapes, engineColors } from 'lib/nosweat/arrows';
import { san, type Candidate } from 'lib/nosweat/core';
import { readEnginePreferences } from 'lib/nosweat/preferences';
import { loadBrowserMaia, ReviewMaia, reviewAllowed } from 'lib/nosweat/reviewMaia';
import { storage } from 'lib/storage';
import { hl, bind } from 'lib/view';

import type PuzzleCtrl from './ctrl';

interface PolicyChannel {
  id: string;
  fen: string;
  rating: number;
  candidates: Candidate[];
  color: string;
  status: string;
  expanded: boolean;
  toggle: () => void;
  play: (uci: string) => void;
}

const probability = (value: number) =>
  value > 0 && value < 0.001 ? '<0.1%' : `${(100 * value).toFixed(1)}%`;

const rowObservers = new WeakMap<Element, ResizeObserver>();

export function fitPuzzleMaiaRow(row: HTMLElement, channel: PolicyChannel): void {
  if (!row.clientWidth || !channel.candidates.length) return;
  const pairs = [...row.querySelectorAll<HTMLElement>('.nosweat-maia-move')];
  const other = row.querySelector<HTMLButtonElement>('.nosweat-maia-other')!;
  let shown = pairs.length;
  pairs.forEach(p => (p.hidden = false));
  const update = () => {
    const rest = channel.candidates.slice(shown).reduce((sum, c) => sum + c.probability, 0);
    other.textContent = 'Other ' + probability(rest);
    other.setAttribute(
      'aria-label',
      `${channel.expanded ? 'Hide' : 'Show'} all legal moves for Maia ${channel.rating}, other ${probability(rest)}`,
    );
  };
  update();
  while (row.scrollWidth > row.clientWidth + 1 && shown > 1) {
    pairs[--shown].hidden = true;
    update();
  }
}

export function puzzleMaiaChannel(channel: PolicyChannel) {
  const { id, fen, rating, candidates, color, status, expanded, toggle, play } = channel;
  const others = candidates.slice(3).reduce((sum, candidate) => sum + candidate.probability, 0);
  const panel = id + '-moves';
  return hl('div.nosweat-maia-channel', { key: id + fen + rating }, [
    hl(
      'div.nosweat-maia-line',
      {
        hook: {
          insert: vnode => {
            const row = vnode.elm as HTMLElement;
            if (typeof ResizeObserver === 'undefined') {
              fitPuzzleMaiaRow(row, channel);
              return;
            }
            const observer = new ResizeObserver(() => fitPuzzleMaiaRow(row, channel));
            rowObservers.set(row, observer);
            observer.observe(row);
            fitPuzzleMaiaRow(row, channel);
          },
          postpatch: (_old, vnode) => {
            const row = vnode.elm as HTMLElement;
            rowObservers.get(row)?.disconnect();
            if (typeof ResizeObserver === 'undefined') {
              fitPuzzleMaiaRow(row, channel);
              return;
            }
            const observer = new ResizeObserver(() => fitPuzzleMaiaRow(row, channel));
            rowObservers.set(row, observer);
            observer.observe(row);
            fitPuzzleMaiaRow(row, channel);
          },
          destroy: vnode => rowObservers.get(vnode.elm as Element)?.disconnect(),
        },
      },
      [
        hl('strong.nosweat-maia-label', { attrs: { style: 'color:' + color } }, 'M' + rating),
        candidates.length
          ? hl('div.nosweat-maia-moves', [
              candidates
                .slice(0, 3)
                .map(candidate =>
                  hl('span.nosweat-maia-move', { key: candidate.uci }, [
                    hl('span.nosweat-maia-san', san(fen, candidate.uci)),
                    ' ',
                    hl(
                      'span.nosweat-maia-probability',
                      { attrs: { title: `${(100 * candidate.probability).toPrecision(6)}%` } },
                      probability(candidate.probability),
                    ),
                  ]),
                ),
              hl(
                'button.fbt.nosweat-maia-other',
                {
                  attrs: {
                    type: 'button',
                    'aria-expanded': String(expanded),
                    'aria-controls': panel,
                    'aria-label': `${expanded ? 'Hide' : 'Show'} all legal moves for Maia ${rating}, other ${probability(others)}`,
                    title: expanded ? 'Hide all legal moves' : 'Show all legal moves',
                  },
                  hook: bind('click', toggle),
                },
                'Other ' + probability(others),
              ),
            ])
          : hl('span.nosweat-maia-status', status),
      ],
    ),
    hl('div.nosweat-puzzle-policy', { attrs: { id: panel, hidden: !expanded || !candidates.length } }, [
      hl('div.nosweat-puzzle-policy__scroll', [
        hl('table', { attrs: { 'aria-label': `All legal moves for Maia ${rating}` } }, [
          hl(
            'thead',
            hl('tr', [
              hl('th', { attrs: { scope: 'col' } }, 'Move'),
              hl('th', { attrs: { scope: 'col', style: 'color:' + color } }, 'M' + rating),
            ]),
          ),
          hl(
            'tbody',
            candidates.map(candidate =>
              hl('tr', { key: candidate.uci }, [
                hl(
                  'td',
                  hl(
                    'button.fbt',
                    {
                      attrs: { type: 'button', title: 'Explore ' + san(fen, candidate.uci) },
                      hook: bind('click', () => play(candidate.uci)),
                    },
                    san(fen, candidate.uci),
                  ),
                ),
                hl(
                  'td',
                  { attrs: { title: `${(100 * candidate.probability).toPrecision(6)}%` } },
                  probability(candidate.probability),
                ),
              ]),
            ),
          ),
        ]),
      ]),
    ]),
  ]);
}

export class PuzzleMaia {
  private readonly engine: ReviewMaia;
  private expanded: [boolean, boolean] = [false, false];
  private displayKey = '';
  private readonly preferences = () =>
    readEnginePreferences(storage.make('nosweat.enginePreferences.v2').get());
  constructor(private readonly ctrl: PuzzleCtrl) {
    this.engine = new ReviewMaia(loadBrowserMaia, () => {
      ctrl.setAutoShapes();
      ctrl.redraw();
    });
    window.addEventListener('pagehide', this.cancel);
    document.addEventListener('visibilitychange', this.sync);
  }
  cancel = (): void => this.engine.cancel();
  private readonly allowed = () =>
    reviewAllowed(this.ctrl.mode, this.ctrl.cevalEnabled(), document.hidden, this.ctrl.threatMode());
  sync = (): void => {
    const prefs = this.preferences();
    this.engine.set(
      this.allowed() && prefs.maiaArrows && !this.ctrl.node.outcome()
        ? {
            id: this.ctrl.data.puzzle.id,
            fens: this.ctrl.nodeList.map(n => n.fen),
            preferences: prefs,
          }
        : undefined,
    );
  };
  shapes() {
    if (!this.allowed()) return [];
    const prefs = this.preferences();
    const pvs = prefs.fishArrows ? (this.ctrl.node.ceval?.pvs ?? []).slice(0, 2) : [];
    const color = fenColor(this.ctrl.node.fen);
    const fish = pvs.map((pv, i) => ({
      uci: pv.moves[0],
      width: i
        ? Math.max(3.125, ((12 - Math.max(0, winningChances.povDiff(color, pvs[0], pv)) * 50) * 100) / 64)
        : 25,
    }));
    return engineShapes(
      engineArrows(
        fish,
        prefs.maiaArrows ? this.engine.primary[0]?.uci : undefined,
        prefs.maiaArrows ? this.engine.secondary[0]?.uci : undefined,
      ),
      this.ctrl.flipped() ? (this.ctrl.pov === 'white' ? 'black' : 'white') : this.ctrl.pov,
    );
  }
  view() {
    if (!this.allowed()) return undefined;
    const prefs = this.preferences();
    if (!prefs.maiaArrows) return undefined;
    const fen = this.ctrl.node.fen;
    const status = this.ctrl.node.outcome() ? 'No legal moves' : this.engine.status || 'Analyzing…';
    const key = `${this.ctrl.data.puzzle.id}:${fen}:${prefs.selfElo}:${prefs.secondMaiaElo}:${prefs.secondMaiaEnabled}`;
    if (key !== this.displayKey) {
      this.displayKey = key;
      this.expanded = [false, false];
    }
    const row = (rating: number, candidates: Candidate[], color: string, index: 0 | 1) =>
      puzzleMaiaChannel({
        id: `puzzle-maia-${index}`,
        fen,
        rating,
        candidates,
        color,
        status,
        expanded: this.expanded[index],
        toggle: () => {
          this.expanded[index] = !this.expanded[index];
          this.ctrl.redraw();
        },
        play: uci => this.ctrl.sendMove(parseUci(uci)!),
      });
    return hl('section.nosweat-engine-lines', { attrs: { 'aria-label': 'Maia analysis channels' } }, [
      row(prefs.selfElo, this.engine.primary, engineColors.maia, 0),
      prefs.secondMaiaEnabled && row(prefs.secondMaiaElo, this.engine.secondary, engineColors.maiaSecond, 1),
    ]);
  }
}
