import { parseUci } from 'chessops/util';

import { winningChances } from 'lib/ceval';
import { fenColor } from 'lib/game';
import { licon } from 'lib/licon';
import { engineArrows, engineShapes } from 'lib/nosweat/arrows';
import { san, legalUcis, standardUci, position, type Candidate } from 'lib/nosweat/core';
import {
  loadEnginePreferences,
  saveEnginePreferences,
  showMaiaRating,
  showEngineSettings,
} from 'lib/nosweat/engineSettings';
import { muteText } from 'lib/nosweat/i18n';
import { MaiaLab } from 'lib/nosweat/maiaLab';
import { labText } from 'lib/nosweat/maiaLabI18n';
import type { LabScore } from 'lib/nosweat/maiaLabModel';
import { ReviewFish } from 'lib/nosweat/reviewFish';
import { loadBrowserMaia, ReviewMaia, reviewAllowed } from 'lib/nosweat/reviewMaia';
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
  chooseRating?: () => void;
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
  const { id, fen, rating, candidates, color, status, expanded, toggle, play, chooseRating } = channel;
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
        hl(
          'button.nosweat-maia-label',
          {
            attrs: {
              type: 'button',
              style: 'color:' + color,
              'aria-label': `Change Maia rating, ${rating}`,
              'aria-haspopup': 'dialog',
            },
            hook: bind('click', () => chooseRating?.()),
          },
          'M' + rating,
        ),
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
  private readonly lab: MaiaLab;
  private labFish?: ReviewFish;
  private labAbort = new AbortController();
  private readonly labScores = new Map<string, LabScore>();
  private labFailed = false;
  private labContext = '';
  private labHover?: { fen: string; uci: Uci };
  private expanded: [boolean, boolean] = [false, false];
  private displayKey = '';
  private readonly preferences = loadEnginePreferences;
  constructor(private readonly ctrl: PuzzleCtrl) {
    this.engine = new ReviewMaia(loadBrowserMaia, () => {
      ctrl.setAutoShapes();
      ctrl.redraw();
      this.lab?.redraw();
    });
    this.lab = new MaiaLab({
      snapshot: () =>
        this.allowed()
          ? {
              key: this.labKey(),
              fen: ctrl.node.fen,
              orientation: ctrl.flipped() ? (ctrl.pov === 'white' ? 'black' : 'white') : ctrl.pov,
              model: 'Maia-3 ' + this.preferences().model.toUpperCase(),
              history: this.preferences().history,
              rating: this.preferences().selfElo,
              byRating: this.engine.byRating,
              scores: this.labScores,
              busy: this.engine.byRating.size < 21,
              failed: this.labFailed || this.engine.status === 'Maia unavailable',
            }
          : undefined,
      start: () => this.startLab(),
      stop: () => this.stopLab(),
      hover: uci => this.hoverLab(uci),
      explore: uci => ctrl.sendMove(parseUci(uci)!),
    });
    window.addEventListener('pagehide', this.cancel);
    document.addEventListener('visibilitychange', this.sync);
  }
  cancel = (): void => {
    this.lab.close();
    this.stopLab();
    this.engine.cancel();
  };
  private labKey(): string {
    const prefs = this.preferences();
    return JSON.stringify([
      this.ctrl.data.puzzle.id,
      this.ctrl.nodeList.map(n => n.fen),
      prefs.model,
      prefs.history,
      prefs.selfElo,
      prefs.secondMaiaElo,
      prefs.secondMaiaEnabled,
    ]);
  }
  private hoverLab(uci?: string): void {
    if (uci && this.allowed()) {
      this.labHover = { fen: this.ctrl.node.fen, uci };
      this.ctrl.ceval.hovering(this.labHover);
      this.ctrl.setAutoShapes();
    } else if (this.labHover) {
      if (this.ctrl.ceval.hovering() === this.labHover) {
        this.ctrl.ceval.hovering(null);
        this.ctrl.setAutoShapes();
      }
      this.labHover = undefined;
    }
  }
  private stopLab(): void {
    this.labAbort.abort();
    this.labAbort = new AbortController();
    this.labFish?.destroy();
    this.labFish = undefined;
    this.engine.stopSampling();
    this.hoverLab();
  }
  private startLab(): void {
    if (!this.allowed()) return;
    this.engine.sampleRatings();
    const key = this.labKey();
    const signal = this.labAbort.signal;
    const fen = this.ctrl.node.fen;
    this.labFailed = false;
    const legal = new Set(legalUcis(fen));
    if (!legal.size) return;
    this.labFish ??= new ReviewFish(() => {});
    const publish = (review: Awaited<ReturnType<ReviewFish['search']>>) => {
      if (signal.aborted || key !== this.labKey() || !this.allowed() || review.current.depth < 12) return;
      const lines = review.current.lines.map(line => ({
        line,
        uci: standardUci(position(fen), parseUci(line.moves[0])!),
      }));
      if (
        lines.length !== legal.size ||
        new Set(lines.map(l => l.uci)).size !== legal.size ||
        lines.some(l => !legal.has(l.uci))
      )
        return;
      this.labScores.clear();
      lines.forEach(({ uci, line }) => this.labScores.set(uci, { score: line, depth: review.current.depth }));
      this.lab.redraw();
    };
    void this.labFish
      .search(fen, [], signal, 12, 0, Symbol('puzzle Maia Lab'), legal.size, {
        allRoots: true,
        maxMultiPv: 4,
        onUpdate: publish,
      })
      .then(publish)
      .catch(() => {
        if (!signal.aborted && key === this.labKey()) {
          this.labFailed = true;
          this.lab.redraw();
        }
      });
  }
  private readonly allowed = () =>
    reviewAllowed(this.ctrl.mode, this.ctrl.cevalEnabled(), document.hidden, this.ctrl.threatMode());
  sync = (): void => {
    const key = this.labKey();
    if (!this.allowed() || key !== this.labContext) {
      this.lab.close();
      this.stopLab();
      this.labScores.clear();
      this.labFailed = false;
      this.labContext = key;
    }
    const prefs = this.preferences();
    this.engine.set(
      this.allowed() && !this.ctrl.node.outcome()
        ? {
            id: this.ctrl.data.puzzle.id,
            fens: this.ctrl.nodeList.map(n => n.fen),
            preferences: prefs,
          }
        : undefined,
    );
  };
  private applyPreferences(prefs: ReturnType<typeof loadEnginePreferences>): void {
    saveEnginePreferences(prefs);
    this.sync();
    this.ctrl.setAutoShapes();
    this.ctrl.redraw();
  }
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
        prefs.arrowColors,
      ),
      this.ctrl.flipped() ? (this.ctrl.pov === 'white' ? 'black' : 'white') : this.ctrl.pov,
    );
  }
  view() {
    if (!this.allowed()) return undefined;
    const prefs = this.preferences();
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
        chooseRating: () =>
          showMaiaRating(rating, selected => {
            const next = this.preferences();
            if (index) next.secondMaiaElo = selected;
            else next.selfElo = next.opponentElo = selected;
            this.applyPreferences(next);
          }),
        toggle: () => {
          this.expanded[index] = !this.expanded[index];
          this.ctrl.redraw();
        },
        play: uci => this.ctrl.sendMove(parseUci(uci)!),
      });
    return hl('section.nosweat-engine-lines', { attrs: { 'aria-label': 'Maia analysis channels' } }, [
      hl('header.nosweat-puzzle-maia-heading', [
        hl('span', 'Maia Analysis'),
        hl(
          'button.fbt.nosweat-lab-open',
          {
            attrs: { type: 'button', 'aria-haspopup': 'dialog' },
            hook: bind('click', () => {
              void this.lab.open();
            }),
          },
          labText('LabOpen'),
        ),
        hl('button.fbt.nosweat-maia-settings', {
          attrs: {
            type: 'button',
            'aria-label': muteText('EngineAnalysis', 'Engine Analysis settings'),
            title: muteText('EngineAnalysis', 'Engine Analysis settings'),
            'data-icon': licon.Gear,
            'aria-haspopup': 'dialog',
          },
          hook: bind('click', () =>
            showEngineSettings(this.preferences(), next => this.applyPreferences(next)),
          ),
        }),
      ]),
      row(prefs.selfElo, this.engine.primary, prefs.arrowColors.maia, 0),
      prefs.secondMaiaEnabled &&
        row(prefs.secondMaiaElo, this.engine.secondary, prefs.arrowColors.maiaSecond, 1),
    ]);
  }
}
