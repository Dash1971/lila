import { parseUci } from 'chessops/util';

import { winningChances } from 'lib/ceval';
import { fenColor } from 'lib/game';
import { engineArrows, engineShapes, engineColors } from 'lib/nosweat/arrows';
import { san, leadingPolicy, type Candidate } from 'lib/nosweat/core';
import { readEnginePreferences } from 'lib/nosweat/preferences';
import { loadBrowserMaia, ReviewMaia, reviewAllowed } from 'lib/nosweat/reviewMaia';
import { storage } from 'lib/storage';
import { hl, bind } from 'lib/view';

import type PuzzleCtrl from './ctrl';

export class PuzzleMaia {
  private readonly engine: ReviewMaia;
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
    const row = (rating: number, candidates: Candidate[], color: string) =>
      hl('div.nosweat-maia-line', [
        hl('strong', { attrs: { style: 'color:' + color } }, 'M' + rating),
        hl('span', candidates.length ? leadingPolicy(fen, candidates) : status),
      ]);
    const probability = (value?: number) =>
      hl(
        'td',
        {
          attrs: value === undefined ? {} : { title: `${(100 * value).toPrecision(6)}%` },
        },
        value === undefined ? '—' : value > 0 && value < 0.001 ? '<0.1%' : `${(100 * value).toFixed(1)}%`,
      );
    const secondary = new Map(this.engine.secondary.map(c => [c.uci, c.probability]));
    return hl('section.nosweat-engine-lines', { attrs: { 'aria-label': 'Maia analysis channels' } }, [
      row(prefs.selfElo, this.engine.primary, engineColors.maia),
      prefs.secondMaiaEnabled && row(prefs.secondMaiaElo, this.engine.secondary, engineColors.maiaSecond),
      hl('details.nosweat-puzzle-policy', [
        hl('summary', 'All legal moves'),
        hl('div.nosweat-puzzle-policy__scroll', [
          hl('table', { attrs: { 'aria-label': 'Maia move probabilities' } }, [
            hl(
              'thead',
              hl('tr', [
                hl('th', { attrs: { scope: 'col' } }, 'Move'),
                hl(
                  'th',
                  { attrs: { scope: 'col', style: 'color:' + engineColors.maia } },
                  'M' + prefs.selfElo,
                ),
                prefs.secondMaiaEnabled &&
                  hl(
                    'th',
                    { attrs: { scope: 'col', style: 'color:' + engineColors.maiaSecond } },
                    'M' + prefs.secondMaiaElo,
                  ),
              ]),
            ),
            hl(
              'tbody',
              this.engine.primary.map(candidate =>
                hl('tr', { key: candidate.uci }, [
                  hl(
                    'td',
                    hl(
                      'button.fbt',
                      {
                        attrs: { type: 'button', title: 'Explore ' + san(fen, candidate.uci) },
                        hook: bind('click', () => this.ctrl.sendMove(parseUci(candidate.uci)!)),
                      },
                      san(fen, candidate.uci),
                    ),
                  ),
                  probability(candidate.probability),
                  prefs.secondMaiaEnabled && probability(secondary.get(candidate.uci)),
                ]),
              ),
            ),
          ]),
        ]),
      ]),
    ]);
  }
}
