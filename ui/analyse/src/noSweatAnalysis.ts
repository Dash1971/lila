import type { DrawShape } from '@lichess-org/chessground/draw';
import { parseUci } from 'chessops/util';
import { attributesModule, classModule, init } from 'snabbdom';

import { frag } from 'lib';
import { winningChances } from 'lib/ceval';
import { storage } from 'lib/storage';
import { hl, type VNode } from 'lib/view';

import type AnalyseCtrl from './ctrl';
import { engineArrows, engineShapes, engineColors } from './noSweatArrows';
import {
  encodeHistory,
  policy,
  san,
  scoreText,
  position,
  standardUci,
  legalUcis,
  leadingPolicy,
  type Candidate,
} from './noSweatCore';
import { reviewClick } from './noSweatEvents';
import { ReviewFish, type Review } from './noSweatFish';
import { readEnginePreferences, type EnginePreferences } from './noSweatPreferences';

interface MaiaClient {
  predict(input: {
    tokens: Float32Array;
    selfElo: number;
    opponentElo: number;
    includeValue: boolean;
  }): Promise<Float32Array>;
  release(): void;
  snapshot(): { phase: string };
}
interface Config {
  models: Record<string, { sha256: string }>;
  browserModel: string;
}
interface Scored {
  score: EvalScore;
  depth: number;
}
const ratings = Array.from({ length: 21 }, (_, i) => 600 + i * 100);
const samples = [600, 1100, 1600, 2100, 2600];
export class NoSweatAnalysis {
  enabled = false;
  model = '5m';
  selfElo = 1500;
  opponentElo = 1500;
  secondMaiaEnabled = true;
  secondMaiaElo = 2400;
  secondaryCandidates: Candidate[] = [];
  private sideRedraw?: () => void;
  history = true;
  maiaArrows = true;
  fishArrows = true;
  allMoves = false;
  ratingTable = false;
  status = '';
  error = '';
  candidates: Candidate[] = [];
  scores = new Map<string, Scored | undefined>();
  byRating = new Map<number, Candidate[]>();
  returnPath?: string;
  private context = '';
  private generation = 0;
  private abort = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private progress?: ReturnType<typeof setInterval>;
  private client?: MaiaClient;
  private config?: Config;
  private maiaTail: Promise<unknown> = Promise.resolve();
  private readonly cache = new Map<string, Candidate[]>();
  private readonly fish: ReviewFish;
  private readonly reviewCache = new Map<string, Review>();
  private fishBest?: string;
  private compareBusy = false;

  constructor(readonly ctrl: AnalyseCtrl) {
    Object.assign(this, readEnginePreferences(storage.make('nosweat.enginePreferences.v2').get()));
    this.enabled = !!ctrl.cevalEnabled();
    ctrl.ceval.storedPv(2);
    queueMicrotask(() => this.positionChanged());
    this.fish = new ReviewFish(s => {
      this.status = s;
      this.ctrl.redraw();
    });
    window.addEventListener('pagehide', this.shutdown);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.cancel();
        this.status = 'Paused while this tab is hidden';
        this.ctrl.redraw();
      } else if (this.enabled) this.positionChanged(true);
    });
  }
  private readonly refreshReview = (): void => {
    this.ctrl.setAutoShapes();
    this.ctrl.redraw();
  };
  private readonly shutdown = (): void => this.release();
  private enginePreferences(): EnginePreferences {
    return {
      model: this.model === '79m' ? '79m' : '5m',
      selfElo: this.selfElo,
      opponentElo: this.opponentElo,
      secondMaiaEnabled: this.secondMaiaEnabled,
      secondMaiaElo: this.secondMaiaElo,
      history: this.history,
      maiaArrows: this.maiaArrows,
      fishArrows: this.fishArrows,
    };
  }
  engineSettings(): HTMLElement {
    const select = (key: keyof EnginePreferences, name: string, options: [string, string][]) =>
      `<label class="setting"><span>${name}</span><select data-engine-pref="${key}" aria-label="${name}">${options
        .map(
          ([value, text]) =>
            `<option value="${value}" ${String(this[key]) === value ? 'selected' : ''}>${text}</option>`,
        )
        .join('')}</select></label>`;
    const toggle = (key: 'history' | 'maiaArrows' | 'fishArrows' | 'secondMaiaEnabled', name: string) =>
      `<label class="setting"><span>${name}</span><input type="checkbox" data-engine-pref="${key}" ${this[key] ? 'checked' : ''}></label>`;
    const options: [string, string][] = ratings.map(n => [String(n), String(n)]);
    const view = frag<HTMLElement>(`<fieldset class="nosweat-engine-settings"><legend>Engines</legend>
      ${select('model', 'Maia model', [
        ['5m', 'Maia3 5M · light'],
        ['79m', 'Maia3 79M'],
      ])}
      ${select('selfElo', 'Primary Maia rating', options)}${select('opponentElo', 'Primary opponent input', options)}
      ${toggle('secondMaiaEnabled', 'Second Maia')}${select('secondMaiaElo', 'Second Maia rating', options)}
      ${toggle('history', 'Use move history')}${toggle('maiaArrows', 'Show Maia arrows')}${toggle('fishArrows', 'Show Stockfish arrows')}
      <small>Maia downloads 36 MB for 5M or 331 MB for 79M on first use. Ratings are model inputs, not calibrated Elo.</small>
      </fieldset>`);
    view.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-engine-pref]').forEach(input => {
      input.addEventListener('change', () => {
        const key = input.dataset.enginePref as keyof EnginePreferences;
        const value =
          input instanceof HTMLInputElement
            ? input.checked
            : key === 'selfElo' || key === 'opponentElo' || key === 'secondMaiaElo'
              ? Number(input.value)
              : input.value;
        const next = readEnginePreferences(JSON.stringify({ ...this.enginePreferences(), [key]: value }));
        if (next.model !== this.model) this.release();
        Object.assign(this, next);
        storage.make('nosweat.enginePreferences.v2').set(JSON.stringify(next));
        this.positionChanged(true);
        this.ctrl.setAutoShapes();
        this.refreshReview();
      });
    });
    return view;
  }
  private readonly valid = (generation: number): boolean =>
    generation === this.generation &&
    !this.abort.signal.aborted &&
    this.enabled &&
    this.ctrl.isCevalAllowed() &&
    !document.hidden;
  private readonly historyFens = (): string[] => this.ctrl.nodeList.map(n => n.fen);
  private readonly key = (
    fens = this.historyFens(),
    rating = this.selfElo,
    opponent = this.opponentElo,
  ): string =>
    JSON.stringify([
      'maia3-policy-v1',
      this.model,
      this.config?.models[this.model].sha256,
      rating,
      opponent,
      this.history,
      this.history ? fens.slice(-8) : fens.slice(-1),
    ]);
  private cancel(): void {
    this.generation++;
    this.abort.abort();
    this.abort = new AbortController();
    clearTimeout(this.timer);
    clearInterval(this.progress);
    this.progress = undefined;
    this.compareBusy = false;
  }
  release = (): void => {
    this.cancel();
    this.client?.release();
    this.client = undefined;
    this.fish.destroy();
  };
  positionChanged(force = false): void {
    const context =
      this.key() + JSON.stringify([this.secondMaiaEnabled, this.secondMaiaElo]) + this.ctrl.path;
    if (!force && context === this.context) return;
    this.context = context;
    this.cancel();
    this.candidates = [];
    this.secondaryCandidates = [];
    this.scores.clear();
    this.byRating.clear();
    this.fishBest = undefined;
    this.ctrl.setAutoShapes();
    this.error = '';
    this.status = '';
    if (!this.enabled || !this.ctrl.isCevalAllowed() || document.hidden) return;
    if (position(this.ctrl.node.fen).isEnd()) {
      this.status = 'Terminal position — no moves to predict';
      return;
    }
    this.status = 'Analyzing Maia…';
    const generation = this.generation;
    this.timer = setTimeout(() => {
      this.refresh(generation).catch(e => this.failure(e, generation));
    }, 120);
  }
  private failure(error: unknown, generation: number): void {
    if (!this.valid(generation)) return;
    this.error = String(error instanceof Error ? error.message : error);
    this.status = '';
    this.compareBusy = false;
    this.ctrl.redraw();
  }
  private async prepare(): Promise<MaiaClient> {
    if (this.client) return this.client;
    const moduleUrl = '/assets/nosweat/analysis/maia-client.js?v=analysis1';
    const [module, response] = await Promise.all([
      import(moduleUrl),
      fetch('/assets/nosweat/analysis/config.json', {
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      }),
    ]);
    if (!response.ok) throw new Error('Maia configuration unavailable');
    this.config = await response.json();
    const config = { ...this.config!, browserModel: this.model };
    this.client = new module.MaiaClient({
      config: async () => config,
      worker: () => new Worker('/assets/nosweat/analysis/maia-worker.js?v=analysis1', { type: 'module' }),
    });
    return this.client!;
  }
  private predict(
    fens: string[],
    rating: number,
    generation: number,
    opponent = this.opponentElo,
  ): Promise<Candidate[]> {
    const task = this.maiaTail
      .catch(() => {})
      .then(async () => {
        if (!this.valid(generation)) throw new Error('Cancelled');
        const client = await this.prepare();
        if (!this.valid(generation)) throw new Error('Cancelled');
        const key = this.key(fens, rating, opponent);
        const cached = this.cache.get(key);
        if (cached) return cached;
        this.progress = setInterval(() => {
          if (this.valid(generation)) {
            this.status = 'Maia: ' + client.snapshot().phase;
            this.ctrl.redraw();
          }
        }, 400);
        try {
          const logits = await client.predict({
            tokens: encodeHistory(fens, this.history),
            selfElo: rating,
            opponentElo: opponent,
            includeValue: false,
          });
          if (!this.valid(generation)) throw new Error('Cancelled');
          const result = policy(fens[fens.length - 1], logits);
          this.cache.set(key, result);
          if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!);
          return result;
        } finally {
          clearInterval(this.progress);
          this.progress = undefined;
        }
      });
    this.maiaTail = task;
    return task;
  }
  private async refresh(generation: number): Promise<void> {
    this.status = 'Preparing local Maia…';
    this.ctrl.redraw();
    const fens = this.historyFens();
    const results = await Promise.allSettled([
      this.predict(fens, this.selfElo, generation),
      ...(this.secondMaiaEnabled
        ? [this.predict(fens, this.secondMaiaElo, generation, this.secondMaiaElo)]
        : []),
    ]);
    if (!this.valid(generation)) return;
    this.candidates = results[0].status === 'fulfilled' ? results[0].value : [];
    this.secondaryCandidates = results[1]?.status === 'fulfilled' ? results[1].value : [];
    this.error = results.some(r => r.status === 'rejected')
      ? 'A Maia channel is unavailable. Try pausing and enabling analysis again.'
      : '';
    this.status = '';
    this.ctrl.setAutoShapes();
    this.ctrl.redraw();
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.release();
    else this.ctrl.ceval.storedPv(2);
    this.positionChanged(true);
  }
  mountSide(element: HTMLElement): void {
    const root = document.createElement('div');
    element.prepend(root);
    const patch = init([classModule, attributesModule]);
    let vnode: VNode | HTMLElement = root;
    this.sideRedraw = () => {
      vnode = patch(vnode, this.candidateView());
    };
    this.sideRedraw();
  }
  redrawSide(): void {
    this.sideRedraw?.();
  }
  private nativeLines() {
    return this.ctrl.cevalEnabled() && !this.ctrl.threatMode()
      ? (this.ctrl.node.ceval?.pvs ?? []).slice(0, 2)
      : [];
  }
  private scoreFor(uci: string): Scored | undefined {
    const line = this.nativeLines().find(pv => this.normalUci(pv.moves[0]) === uci);
    return line ? { score: line, depth: this.ctrl.node.ceval!.depth } : this.scores.get(uci);
  }
  private currentFishBest(): string | undefined {
    return this.normalUci(this.nativeLines()[0]?.moves[0]) ?? this.fishBest;
  }
  private normalUci(uci?: string): string | undefined {
    if (!uci) return undefined;
    const move = parseUci(uci);
    return move ? standardUci(position(this.ctrl.node.fen), move) : undefined;
  }
  private readonly played = (): string | undefined => this.normalUci(this.ctrl.node.children[0]?.uci);
  private readonly rows = (): Candidate[] => {
    const chosen = new Set([
      ...(this.allMoves
        ? [...this.candidates, ...this.secondaryCandidates]
        : [...this.candidates.slice(0, 3), ...this.secondaryCandidates.slice(0, 3)]
      ).map(c => c.uci),
      ...this.nativeLines().flatMap(pv => {
        const uci = this.normalUci(pv.moves[0]);
        return uci ? [uci] : [];
      }),
    ]);
    const played = this.played();
    if (played) chosen.add(played);
    const best = this.currentFishBest();
    if (best) chosen.add(best);
    const legal = new Set(legalUcis(this.ctrl.node.fen));
    return [...chosen]
      .filter(uci => legal.has(uci))
      .map(uci => ({ uci, probability: this.candidates.find(c => c.uci === uci)?.probability ?? 0 }));
  };
  private readonly preview = (uci: string): void => {
    this.returnPath ??= this.ctrl.path;
    this.ctrl.playUci(uci);
    this.ctrl.redraw();
  };
  private async review(fen: string, generation: number, moves: string[] = [], time = 1200): Promise<Review> {
    const key = JSON.stringify(['sf19-small-depth14-v1', fen, moves]);
    const cached = this.reviewCache.get(key);
    if (cached) return cached;
    const result = await this.fish.search(fen, moves, this.abort.signal, 14, time);
    if (!this.valid(generation)) throw new Error('Cancelled');
    this.reviewCache.set(key, result);
    if (this.reviewCache.size > 400) this.reviewCache.delete(this.reviewCache.keys().next().value!);
    return result;
  }
  compare = (): void => {
    const generation = this.generation;
    if (this.compareBusy || (!this.candidates.length && !this.secondaryCandidates.length)) return;
    this.compareBusy = true;
    this.error = '';
    (async () => {
      const fen = this.ctrl.node.fen;
      this.status = 'Comparing candidates with Stockfish…';
      this.ctrl.redraw();
      const root = await this.review(fen, generation);
      if (!this.valid(generation)) return;
      this.fishBest = root.current.lines[0].moves[0];
      for (const line of root.current.lines)
        this.scores.set(line.moves[0], { score: line, depth: root.current.depth });
      // Bound this comparison to the compact set, even when all legal moves are displayed.
      const chosen = new Set(
        [...this.candidates.slice(0, 3), ...this.secondaryCandidates.slice(0, 3)].map(c => c.uci),
      );
      root.current.lines.forEach(line => chosen.add(line.moves[0]));
      const played = this.played();
      if (played) chosen.add(played);
      if (this.fishBest) chosen.add(this.fishBest);
      for (const move of chosen) {
        if (this.scores.has(move)) continue;
        this.scores.set(move, undefined);
        this.ctrl.redraw();
        try {
          const result = await this.review(fen, generation, [move], 700);
          if (!this.valid(generation)) return;
          this.scores.set(move, { score: result.current.lines[0], depth: result.current.depth });
        } catch (error) {
          if (!this.valid(generation)) return;
          this.error = 'Some Stockfish candidates are unavailable: ' + String(error);
        }
      }
      if (this.valid(generation)) {
        this.status = '';
        this.compareBusy = false;
        this.ctrl.setAutoShapes();
        this.ctrl.redraw();
      }
    })().catch(e => this.failure(e, generation));
  };
  sampleRatings = (): void => {
    if (this.compareBusy) return;
    this.compareBusy = true;
    const generation = this.generation;
    const fens = this.historyFens();
    this.ratingTable = true;
    this.error = '';
    (async () => {
      for (const rating of samples) {
        this.status = 'Sampling Maia ' + rating + '…';
        this.ctrl.redraw();
        const result = await this.predict(fens, rating, generation);
        if (!this.valid(generation)) return;
        this.byRating.set(rating, result);
        this.ctrl.redraw();
      }
      this.status = '';
      this.compareBusy = false;
      this.ctrl.redraw();
    })().catch(e => this.failure(e, generation));
  };
  shapes(): DrawShape[] {
    if (!this.enabled || !this.ctrl.isCevalAllowed() || document.hidden || this.ctrl.threatMode()) return [];
    const lines = this.nativeLines();
    const stockfish =
      this.fishArrows && this.ctrl.showBestMoveArrows()
        ? lines.map((line, i) => ({
            uci: this.normalUci(line.moves[0])!,
            width: i
              ? Math.max(
                  3.125,
                  ((12 -
                    Math.max(0, winningChances.povDiff(position(this.ctrl.node.fen).turn, lines[0], line)) *
                      50) *
                    100) /
                    64,
                )
              : 25,
          }))
        : [];
    return engineShapes(
      engineArrows(
        stockfish,
        this.maiaArrows ? this.candidates[0]?.uci : undefined,
        this.maiaArrows && this.secondMaiaEnabled ? this.secondaryCandidates[0]?.uci : undefined,
      ),
      this.ctrl.bottomColor(),
    );
  }
  view(): VNode | undefined {
    if (!this.ctrl.isCevalAllowed()) return undefined;
    const row = (rating: number, candidates: Candidate[], secondary: boolean) =>
      hl('div.nosweat-maia-line', [
        hl(
          'strong',
          { attrs: { style: 'color:' + (secondary ? engineColors.maiaSecond : engineColors.maia) } },
          'M' + rating,
        ),
        hl(
          'span',
          candidates.length
            ? leadingPolicy(this.ctrl.node.fen, candidates)
            : position(this.ctrl.node.fen).isEnd()
              ? 'No legal moves'
              : !this.enabled
                ? 'Paused'
                : this.status
                  ? 'Analyzing…'
                  : 'Unavailable',
        ),
      ]);
    return hl('section.nosweat-engine-lines', { attrs: { 'aria-label': 'Maia analysis channels' } }, [
      row(this.selfElo, this.candidates, false),
      this.secondMaiaEnabled && row(this.secondMaiaElo, this.secondaryCandidates, true),
    ]);
  }
  private candidateView(): VNode {
    const fen = this.ctrl.node.fen;
    const button = (text: string, action: () => void, disabled = false) =>
      hl(
        'button.fbt',
        {
          attrs: { type: 'button', disabled },
          hook: reviewClick(action),
        },
        text,
      );
    const likelihood = (values: Candidate[], uci: string) =>
      values.length ? ((values.find(c => c.uci === uci)?.probability ?? 0) * 100).toFixed(1) + '%' : '—';
    const rating = (secondary: boolean) => {
      const value = secondary ? this.secondMaiaElo : this.selfElo;
      return hl('label.nosweat-rating-picker', [
        hl(
          'span',
          { attrs: { style: 'color:' + (secondary ? engineColors.maiaSecond : engineColors.maia) } },
          secondary ? 'Maia 2' : 'Maia 1',
        ),
        hl(
          'select',
          {
            attrs: { 'aria-label': secondary ? 'Second Maia rating' : 'Primary Maia rating' },
            hook: {
              insert: vnode => {
                const input = vnode.elm as HTMLSelectElement;
                input.value = String(value);
                input.onchange = () => this.chooseRating(Number(input.value), secondary);
              },
              update: (_, vnode) => {
                (vnode.elm as HTMLSelectElement).value = String(value);
              },
            },
          },
          ratings.map(n => hl('option', { attrs: { value: n } }, String(n))),
        ),
      ]);
    };
    const played = this.played();
    return hl(
      'section.nosweat-candidate-panel',
      { attrs: { 'aria-label': 'Candidate moves and rating explorer' } },
      [
        hl('div.nosweat-panel-heading', [
          hl('h2', 'Candidate moves'),
          button(this.enabled ? 'Pause' : 'Enable analysis', () => this.ctrl.cevalEnabled(!this.enabled)),
        ]),
        hl('div.nosweat-rating-inputs', [rating(false), this.secondMaiaEnabled && rating(true)]),
        hl('small.nosweat-panel-note', 'Maia: move likelihood · SF: White’s evaluation'),
        this.returnPath !== undefined && hl('small', 'Selected: ' + (this.ctrl.node.san ?? 'position')),
        this.returnPath !== undefined &&
          button('Return to original position', () => {
            const path = this.returnPath!;
            this.returnPath = undefined;
            this.ctrl.userJump(path);
            this.ctrl.redraw();
          }),
        this.enabled &&
          hl('div', [
            this.rows().length > 0 &&
              hl('table.nosweat-candidates', [
                hl(
                  'thead',
                  hl('tr', [
                    hl('th', 'Move'),
                    hl('th', { attrs: { style: 'color:' + engineColors.maia } }, 'M' + this.selfElo),
                    this.secondMaiaEnabled &&
                      hl(
                        'th',
                        { attrs: { style: 'color:' + engineColors.maiaSecond } },
                        'M' + this.secondMaiaElo,
                      ),
                    hl('th', 'SF'),
                  ]),
                ),
                hl(
                  'tbody',
                  this.rows().map(c => {
                    const scored = this.scoreFor(c.uci);
                    return hl('tr', { key: fen + c.uci, attrs: { 'data-move': c.uci } }, [
                      hl('td', [
                        button(san(fen, c.uci), () => this.preview(c.uci)),
                        c.uci === played && hl('small', 'Played'),
                        c.uci === this.currentFishBest() && hl('small', 'SF choice'),
                      ]),
                      hl('td', likelihood(this.candidates, c.uci)),
                      this.secondMaiaEnabled && hl('td', likelihood(this.secondaryCandidates, c.uci)),
                      hl(
                        'td',
                        { attrs: { title: scored ? 'Stockfish depth ' + scored.depth : 'Not evaluated' } },
                        scored
                          ? scoreText(scored.score)
                          : this.scores.has(c.uci)
                            ? this.compareBusy
                              ? 'Pending…'
                              : 'Unavailable'
                            : '—',
                      ),
                    ]);
                  }),
                ),
              ]),
            hl('div.nosweat-panel-actions', [
              button(
                'Compare candidates',
                this.compare,
                this.compareBusy || (!this.candidates.length && !this.secondaryCandidates.length),
              ),
              button(this.allMoves ? 'Top candidates' : 'All legal moves', () => {
                this.allMoves = !this.allMoves;
                this.ctrl.redraw();
              }),
            ]),
            hl(
              'details.nosweat-rating-explorer',
              {
                hook: {
                  insert: vnode => {
                    (vnode.elm as HTMLDetailsElement).ontoggle = event => {
                      this.ratingTable = (event.target as HTMLDetailsElement).open;
                    };
                  },
                },
              },
              [
                hl('summary', 'Moves by rating'),
                hl(
                  'small',
                  'Mover input 600–2600; opponent stays ' +
                    this.opponentElo +
                    '. Model inputs are not calibrated Elo.',
                ),
                button(
                  this.byRating.size ? 'Refresh rating samples' : 'Sample ratings',
                  this.sampleRatings,
                  this.compareBusy || !this.candidates.length,
                ),
                this.byRating.size > 0 && this.renderRatingChart(),
                this.byRating.size > 0 && this.renderRatings(),
              ],
            ),
            this.status && hl('p', { attrs: { role: 'status' } }, this.status),
            this.error && hl('p.error', { attrs: { role: 'alert' } }, this.error),
          ]),
      ],
    );
  }
  private chooseRating(rating: number, secondary = false, keepOpponent = false): void {
    if (secondary) this.secondMaiaElo = rating;
    else {
      this.selfElo = rating;
      if (!keepOpponent) this.opponentElo = rating;
    }
    storage.make('nosweat.enginePreferences.v2').set(JSON.stringify(this.enginePreferences()));
    this.positionChanged(true);
    this.ctrl.redraw();
  }
  private renderRatingChart(): VNode {
    const moves = this.ratingMoves().slice(0, 5);
    const colors = ['#e89b3c', '#e85d68', '#3d9be9', '#8bc34a', '#b49be6'];
    const max = Math.max(
      0.1,
      ...[...this.byRating.values()].flatMap(values =>
        values.filter(c => moves.includes(c.uci)).map(c => c.probability),
      ),
    );
    return hl('div.nosweat-rating-chart', [
      hl(
        'svg',
        {
          attrs: {
            viewBox: '0 0 240 125',
            role: 'img',
            'aria-label': 'Maia move likelihood by rating; exact values in the table below',
          },
        },
        [
          hl('line', { attrs: { x1: 30, y1: 90, x2: 230, y2: 90, stroke: 'currentColor', opacity: 0.3 } }),
          ...moves.map((uci, index) =>
            hl('polyline', {
              attrs: {
                fill: 'none',
                stroke: colors[index],
                'stroke-width': 2,
                points: samples
                  .flatMap((n, i) => {
                    const p = this.byRating.get(n)?.find(c => c.uci === uci)?.probability;
                    return p === undefined ? [] : [`${30 + i * 50},${90 - (p / max) * 75}`];
                  })
                  .join(' '),
              },
            }),
          ),
          hl(
            'text',
            { attrs: { x: 0, y: 14, fill: 'currentColor', 'font-size': 9 } },
            (max * 100).toFixed(0) + '%',
          ),
          hl('text', { attrs: { x: 0, y: 93, fill: 'currentColor', 'font-size': 9 } }, '0%'),
          ...moves.flatMap((uci, index) =>
            samples.flatMap((rating, i) => {
              const probability = this.byRating.get(rating)?.find(c => c.uci === uci)?.probability;
              return probability === undefined
                ? []
                : [
                    hl(
                      'a',
                      {
                        attrs: {
                          href: '#',
                          'aria-label': `${san(this.ctrl.node.fen, uci)} at Maia ${rating}: ${(probability * 100).toFixed(1)}%`,
                        },
                        hook: reviewClick(event => {
                          event.preventDefault();
                          this.chooseRating(rating, false, true);
                        }),
                      },
                      [
                        hl('circle', {
                          attrs: {
                            cx: 30 + i * 50,
                            cy: 90 - (probability / max) * 75,
                            r: 3,
                            fill: colors[index],
                          },
                        }),
                      ],
                    ),
                  ];
            }),
          ),
          hl('text', { attrs: { x: 30, y: 106, fill: 'currentColor', 'font-size': 10 } }, '600'),
          hl('text', { attrs: { x: 205, y: 106, fill: 'currentColor', 'font-size': 10 } }, '2600'),
        ],
      ),
      hl(
        'div.nosweat-chart-legend',
        moves.map((uci, i) =>
          hl(
            'button.fbt',
            {
              attrs: { style: 'color:' + colors[i], type: 'button' },
              hook: reviewClick(() => this.preview(uci)),
            },
            san(this.ctrl.node.fen, uci),
          ),
        ),
      ),
    ]);
  }
  private ratingMoves(): string[] {
    const moves = new Set(this.rows().map(c => c.uci));
    for (const values of this.byRating.values()) for (const c of values.slice(0, 3)) moves.add(c.uci);
    return [...moves];
  }
  private renderRatings(): VNode {
    const moves = new Set(this.rows().map(c => c.uci));
    for (const values of this.byRating.values()) for (const c of values.slice(0, 3)) moves.add(c.uci);
    return hl('div.nosweat-rating-scroll', [
      hl('table.nosweat-ratings', [
        hl('caption', 'Moves by rating — opponent input stays ' + this.opponentElo),
        hl('thead', [
          hl('tr', [
            hl('th', 'Move'),
            ...samples.map(n =>
              hl('th', [
                hl(
                  'button.fbt',
                  {
                    attrs: { type: 'button', 'aria-label': 'Use Maia mover input ' + n },
                    hook: reviewClick(() => this.chooseRating(n, false, true)),
                  },
                  String(n),
                ),
              ]),
            ),
          ]),
        ]),
        hl(
          'tbody',
          [...moves].map(move =>
            hl('tr', [
              hl('td', [
                hl(
                  'button.fbt',
                  { hook: reviewClick(() => this.preview(move)) },
                  san(this.ctrl.node.fen, move),
                ),
              ]),
              ...samples.map(n => {
                const probability = this.byRating.get(n)?.find(c => c.uci === move)?.probability;
                return hl(
                  'td',
                  {
                    attrs: {
                      style:
                        probability === undefined
                          ? ''
                          : `background:linear-gradient(90deg,#c8a54033 ${probability * 100}%,transparent 0)`,
                    },
                  },
                  probability === undefined ? '—' : (probability * 100).toFixed(1) + '%',
                );
              }),
            ]),
          ),
        ),
      ]),
    ]);
  }
}
