import { winningChances } from 'lib/ceval';
import { fenColor } from 'lib/game';
import { engineArrows, engineShapes } from 'lib/nosweat/arrows';
import { san } from 'lib/nosweat/core';
import { readEnginePreferences } from 'lib/nosweat/preferences';
import { loadBrowserMaia, ReviewMaia, reviewAllowed } from 'lib/nosweat/reviewMaia';
import { storage } from 'lib/storage';
import { hl } from 'lib/view';

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
    const move = (uci?: string) => (uci ? san(this.ctrl.node.fen, uci) : this.engine.status);
    return hl('div.pv_box', { attrs: { 'aria-label': 'Maia analysis channels', 'aria-live': 'polite' } }, [
      hl(
        'div',
        { attrs: { style: 'color:#e89b3c' } },
        `M${prefs.selfElo} ${move(this.engine.primary[0]?.uci)}`,
      ),
      prefs.secondMaiaEnabled &&
        hl(
          'div',
          { attrs: { style: 'color:#e85d68' } },
          `M${prefs.secondMaiaElo} ${move(this.engine.secondary[0]?.uci)}`,
        ),
    ]);
  }
}
