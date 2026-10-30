import type { DrawShape } from '@lichess-org/chessground/draw';
import { parseUci } from 'chessops/util';
import { attributesModule, classModule, init } from 'snabbdom';

import { frag } from 'lib';
import { winningChances } from 'lib/ceval';
import { maiaExpectedScore } from 'lib/nosweat/expectedScore';
import { storage } from 'lib/storage';
import { domDialog, hl, type VNode } from 'lib/view';

import type AnalyseCtrl from './ctrl';
import { engineArrows, engineShapes, engineColors } from './noSweatArrows';
import { candidateQuality, qualityLabels, stockfishWinrate } from './noSweatCandidateQuality';
import { encodeHistory, policy, san, position, standardUci, legalUcis, type Candidate } from './noSweatCore';
import { reviewClick } from './noSweatEvents';
import { ReviewFish, type Review } from './noSweatFish';
import { gameReviewQualities, gameReviewQuality } from './noSweatFullReview';
import { readEnginePreferences, type EnginePreferences } from './noSweatPreferences';
import { ratingSamples as samples, ratingChart } from './noSweatRatingChart';

interface MaiaClient {
  predict(input: {
    tokens: Float32Array;
    selfElo: number;
    opponentElo: number;
    includeValue: boolean;
  }): Promise<{ move_logits: Float32Array; value_logits: Float32Array }>;
  release(): void;
  snapshot(): { phase: string };
}
interface Config {
  models: Record<string, { sha256: string }>;
  browserModel: string;
}
interface Prediction {
  candidates: Candidate[];
  score: number;
}
interface Scored {
  score: EvalScore;
  depth: number;
}
const ratings = Array.from({ length: 21 }, (_, i) => 600 + i * 100);
export class NoSweatAnalysis {
  enabled = false;
  model = '5m';
  selfElo = 1500;
  opponentElo = 1500;
  secondMaiaEnabled = true;
  secondMaiaElo = 2400;
  secondaryCandidates: Candidate[] = [];
  expectedScore?: number;
  secondaryExpectedScore?: number;
  private sideRedraw?: () => void;
  history = true;
  maiaArrows = true;
  fishArrows = true;
  allMoves = false;
  ratingTable = true;
  private ratingContext = '';
  private ratingKey(): string {
    return JSON.stringify([
      this.model,
      this.config?.models[this.model].sha256,
      this.opponentElo,
      this.history,
      this.history ? this.historyFens().slice(-8) : this.historyFens().slice(-1),
      this.ctrl.path,
    ]);
  }
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
  private readonly cache = new Map<string, Prediction>();
  private readonly fish: ReviewFish;
  private readonly reviewCache = new Map<string, Review>();
  private fishBest?: string;
  private compareBusy = false;
  private qualityBusy = false;
  private qualityRoot?: Review;
  private readonly qualityFailed = new Set<string>();

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
    const view = frag<HTMLElement>(`<div><fieldset class="nosweat-engine-settings"><legend>Engines</legend>
      ${select('model', 'Maia model', [
        ['5m', 'Maia3 5M · light'],
        ['79m', 'Maia3 79M'],
      ])}
      ${select('selfElo', 'Primary Maia rating', options)}${select('opponentElo', 'Primary opponent input', options)}
      ${toggle('secondMaiaEnabled', 'Second Maia')}${select('secondMaiaElo', 'Second Maia rating', options)}
      ${toggle('history', 'Use move history')}${toggle('maiaArrows', 'Show Maia arrows')}${toggle('fishArrows', 'Show Stockfish arrows')}
      <small>Maia downloads 36 MB for 5M or 331 MB for 79M on first use. Ratings are model inputs, not calibrated Elo.</small>
      </fieldset><fieldset class="nosweat-review-settings"><legend>Whole-game analysis</legend>
      <div class="nosweat-review-quality">${gameReviewQualities.map(q => `<label><input type="radio" name="nosweat-review-quality" value="${q.name}" ${q.name === gameReviewQuality(storage.get('nosweat.gameReview.quality')).name ? 'checked' : ''}><span>${q.name}</span></label>`).join('')}</div>
      <button type="button" class="button button-empty nosweat-review-engine">Engine settings</button></fieldset></div>`);
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
    view.querySelectorAll<HTMLInputElement>('input[name="nosweat-review-quality"]').forEach(input => {
      input.onchange = () => storage.set('nosweat.gameReview.quality', input.value);
    });
    view.querySelector<HTMLButtonElement>('.nosweat-review-engine')!.onclick = () =>
      site.asset.loadEsm('analyse.local', { init: this.ctrl });
    return view;
  }
  private readonly analysisAllowed = (): boolean =>
    this.ctrl.isCevalAllowed() && !this.ctrl.opts.practice && !this.ctrl.study?.data.chapter.practice;

  private readonly valid = (generation: number): boolean =>
    generation === this.generation &&
    !this.abort.signal.aborted &&
    this.enabled &&
    this.analysisAllowed() &&
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
    this.qualityBusy = false;
  }
  release = (): void => {
    this.cancel();
    this.client?.release();
    this.client = undefined;
    this.fish.destroy();
  };
  positionChanged(force = false): void {
    const context =
      this.key() +
      JSON.stringify([this.secondMaiaEnabled, this.secondMaiaElo]) +
      this.ctrl.path +
      JSON.stringify([this.ctrl.study?.data.chapter.id, !!this.ctrl.study?.data.chapter.practice]);
    if (!force && context === this.context) return;
    this.context = context;
    this.cancel();
    this.candidates = [];
    this.secondaryCandidates = [];
    this.expectedScore = this.secondaryExpectedScore = undefined;
    this.scores.clear();
    this.fishBest = undefined;
    this.qualityRoot = undefined;
    this.qualityFailed.clear();
    const ratingContext = this.ratingKey();
    if (ratingContext !== this.ratingContext) this.byRating.clear();
    this.ratingContext = ratingContext;
    this.ctrl.setAutoShapes();
    this.error = '';
    this.status = '';
    if (!this.enabled || !this.analysisAllowed() || document.hidden) return;
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
  ): Promise<Prediction> {
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
            includeValue: true,
          });
          if (!this.valid(generation)) throw new Error('Cancelled');
          const result = {
            candidates: policy(fens[fens.length - 1], logits.move_logits),
            score: maiaExpectedScore(logits.value_logits),
          };
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
    this.candidates = results[0].status === 'fulfilled' ? results[0].value.candidates : [];
    this.expectedScore = results[0].status === 'fulfilled' ? results[0].value.score : undefined;
    this.secondaryCandidates = results[1]?.status === 'fulfilled' ? results[1].value.candidates : [];
    this.secondaryExpectedScore = results[1]?.status === 'fulfilled' ? results[1].value.score : undefined;
    this.error = results.some(r => r.status === 'rejected')
      ? 'Maia is unavailable. Turn analysis off and on to retry.'
      : '';
    this.status = '';
    this.ctrl.setAutoShapes();
    this.ctrl.redraw();
    this.colorCandidates();
    if (this.ratingTable && this.candidates.length && this.sideRedraw) this.sampleRatings();
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
    const key = JSON.stringify(['sf19-candidate-depth12-v1', fen, moves, time]);
    const cached = this.reviewCache.get(key);
    if (cached) return cached;
    const result = await this.fish.search(fen, moves, this.abort.signal, 12, time);
    if (!this.valid(generation)) throw new Error('Cancelled');
    this.reviewCache.set(key, result);
    if (this.reviewCache.size > 400) this.reviewCache.delete(this.reviewCache.keys().next().value!);
    return result;
  }
  private visibleCandidates(): string[] {
    return [
      ...new Set(
        [
          ...this.candidates.slice(0, this.expanded[0] ? undefined : 4),
          ...this.secondaryCandidates.slice(0, this.expanded[1] ? undefined : 4),
        ].map(c => c.uci),
      ),
    ];
  }
  private colorCandidates(): void {
    const generation = this.generation;
    if (!this.valid(generation) || this.qualityBusy || !this.visibleCandidates().length) return;
    this.qualityBusy = true;
    (async () => {
      const fen = this.ctrl.node.fen;
      if (!this.qualityRoot) {
        const root = await this.review(fen, generation, [], 500);
        if (!this.valid(generation)) return;
        if (root.current.depth < 8) return;
        this.qualityRoot = root;
        this.fishBest = this.normalUci(root.current.lines[0]?.moves[0]);
        for (const line of root.current.lines) {
          const move = this.normalUci(line.moves[0]);
          if (move) this.scores.set(move, { score: line, depth: root.current.depth });
        }
        this.ctrl.redraw();
      }
      // Re-read the visible set so opening Others during a search joins this queue.
      for (;;) {
        const move = this.visibleCandidates().find(m => !this.scores.has(m) && !this.qualityFailed.has(m));
        if (!move || !this.valid(generation)) break;
        try {
          const result = await this.review(fen, generation, [move], 300);
          if (!this.valid(generation)) return;
          if (result.current.depth >= 8)
            this.scores.set(move, { score: result.current.lines[0], depth: result.current.depth });
          else this.qualityFailed.add(move);
        } catch {
          if (!this.valid(generation)) return;
          this.qualityFailed.add(move);
        }
        this.ctrl.redraw();
      }
    })()
      .catch(() => {
        // Color evidence is optional; Maia probabilities remain usable on failure.
      })
      .finally(() => {
        if (this.valid(generation)) {
          this.qualityBusy = false;
          if (this.status === 'Loading Stockfish review…') this.status = '';
          this.ctrl.redraw();
        }
      });
  }
  private moveQuality(uci: string) {
    if (!this.enabled || !this.analysisAllowed() || this.ctrl.threatMode()) return undefined;
    const white = position(this.ctrl.node.fen).turn === 'white';
    const scores = [...this.scores.values()].flatMap(s => (s ? [s.score] : []));
    const value = (s: EvalScore) => stockfishWinrate(s, white) ?? -1;
    const best = scores.reduce<EvalScore | undefined>(
      (a, b) => (!a || value(b) > value(a) ? b : a),
      undefined,
    );
    return candidateQuality(best, this.scores.get(uci)?.score, white);
  }
  sampleRatings = (): void => {
    if (this.compareBusy || !this.enabled || !this.analysisAllowed()) return;
    const context = this.ratingKey();
    if (context !== this.ratingContext) this.byRating.clear();
    this.ratingContext = context;
    if (this.byRating.size === samples.length) return;
    this.compareBusy = true;
    const generation = this.generation;
    const fens = this.historyFens();
    this.ratingTable = true;
    this.error = '';
    (async () => {
      for (const rating of samples) {
        if (!this.valid(generation) || !this.ratingTable) break;
        if (this.byRating.has(rating)) continue;
        this.status = 'Loading rating chart…';
        this.ctrl.redraw();
        const result = await this.predict(fens, rating, generation);
        if (!this.valid(generation)) return;
        this.byRating.set(rating, result.candidates);
        this.ctrl.redraw();
      }
      if (!this.valid(generation)) return;
      this.status = '';
      this.compareBusy = false;
      this.ctrl.redraw();
    })().catch(e => this.failure(e, generation));
  };
  shapes(): DrawShape[] {
    if (!this.enabled || !this.analysisAllowed() || document.hidden || this.ctrl.threatMode()) return [];
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
  private readonly expanded = [false, false];

  private openRating(secondary: boolean): void {
    const value = secondary ? this.secondMaiaElo : this.selfElo;
    domDialog({
      class: 'nosweat-rating-dialog',
      modal: true,
      show: true,
      easyClose: 'clickOutside',
      focus: '[aria-pressed="true"]',
      htmlText: `<h2>Maia rating</h2><div class="nosweat-rating-grid">${ratings
        .map(
          n =>
            `<button type="button" class="fbt" data-rating="${n}" aria-pressed="${n === value}">${n}</button>`,
        )
        .join('')}</div>`,
      actions: [
        {
          selector: '[data-rating]',
          listener: (event, dialog) => {
            this.chooseRating(Number((event.currentTarget as HTMLElement).dataset.rating), secondary);
            dialog.close();
          },
        },
      ],
    });
  }

  private maiaCard(secondary: boolean): VNode {
    const rating = secondary ? this.secondMaiaElo : this.selfElo;
    const candidates = secondary ? this.secondaryCandidates : this.candidates;
    const score = secondary ? this.secondaryExpectedScore : this.expectedScore;
    const color = secondary ? engineColors.maiaSecond : engineColors.maia;
    const side = position(this.ctrl.node.fen).turn === 'white' ? 'White' : 'Black';
    const expanded = this.expanded[Number(secondary)];
    const rest = candidates.slice(4).reduce((sum, c) => sum + c.probability, 0);
    return hl('section.nosweat-maia-card', { attrs: { 'aria-label': `Maia ${rating}` } }, [
      hl('header', [
        hl(
          'button.nosweat-maia-label',
          {
            attrs: {
              type: 'button',
              style: 'color:' + color,
              'aria-label': `Change ${secondary ? 'second' : 'primary'} Maia rating, ${rating}`,
              'aria-haspopup': 'dialog',
            },
            hook: reviewClick(() => this.openRating(secondary)),
          },
          'Maia ' + rating,
        ),
        hl(
          'span.nosweat-score',
          {
            attrs: {
              title: `${side} expected score: win probability plus half draw probability`,
              'aria-label': `${side} expected score ${score === undefined ? 'unavailable' : (score * 100).toFixed(1) + '%'}`,
            },
          },
          [
            hl('i.nosweat-score-side.' + side.toLowerCase(), { attrs: { 'aria-hidden': 'true' } }),
            score === undefined ? '—' : (score * 100).toFixed(1) + '%',
          ],
        ),
      ]),
      candidates.length
        ? hl('div.nosweat-policy-scroll', [
            hl('table.nosweat-policy', [
              hl('thead', hl('tr', [hl('th', 'Move'), hl('th', 'Probability')])),
              hl(
                'tbody',
                candidates.slice(0, expanded ? undefined : 4).map(c =>
                  hl('tr', { key: this.ctrl.node.fen + c.uci }, [
                    hl(
                      'td',
                      hl(
                        'button.fbt',
                        {
                          attrs: {
                            type: 'button',
                            'data-quality': this.moveQuality(c.uci) ?? 'pending',
                            title: this.moveQuality(c.uci)
                              ? qualityLabels[this.moveQuality(c.uci)!] + ' · Stockfish estimate'
                              : 'Move quality not yet available',
                            'aria-label':
                              san(this.ctrl.node.fen, c.uci) +
                              ': ' +
                              (this.moveQuality(c.uci)
                                ? qualityLabels[this.moveQuality(c.uci)!]
                                : 'quality not yet available'),
                          },
                          hook: reviewClick(() => this.preview(c.uci)),
                        },
                        san(this.ctrl.node.fen, c.uci),
                      ),
                    ),
                    hl('td', (c.probability * 100).toFixed(1) + '%'),
                  ]),
                ),
              ),
            ]),
          ])
        : hl(
            'p.nosweat-maia-empty',
            !this.enabled
              ? 'Analysis off'
              : position(this.ctrl.node.fen).isEnd()
                ? 'No legal moves'
                : this.error
                  ? 'Unavailable'
                  : 'Analyzing…',
          ),
      candidates.length > 4 &&
        hl(
          'button.nosweat-others',
          {
            attrs: { type: 'button', 'aria-expanded': expanded },
            hook: reviewClick(() => {
              this.expanded[Number(secondary)] = !expanded;
              this.colorCandidates();
              this.ctrl.redraw();
            }),
          },
          [
            hl('span', expanded ? 'Leading moves' : 'Others'),
            hl('span', expanded ? '−' : (rest * 100).toFixed(1) + '% +'),
          ],
        ),
    ]);
  }

  private candidateView(): VNode {
    return hl('section.nosweat-candidate-panel', { attrs: { 'aria-label': 'Maia analysis' } }, [
      hl('h2', 'Maia'),
      hl('div.nosweat-maia-cards', [this.maiaCard(false), this.secondMaiaEnabled && this.maiaCard(true)]),
      this.returnPath !== undefined &&
        hl(
          'button.fbt.nosweat-return',
          {
            attrs: { type: 'button' },
            hook: reviewClick(() => {
              const path = this.returnPath!;
              this.returnPath = undefined;
              this.ctrl.userJump(path);
              this.ctrl.redraw();
            }),
          },
          'Return to game position',
        ),
      this.enabled &&
        hl('section.nosweat-rating-explorer', [
          hl('h3', 'Moves by Rating'),
          this.renderRatingChart(),
          hl('details', [hl('summary', 'Move probabilities'), this.renderRatings()]),
        ]),
      this.error && hl('p.error', { attrs: { role: 'alert' } }, this.error),
      !this.error && this.status && hl('p', { attrs: { role: 'status' } }, this.status),
    ]);
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
    return ratingChart(
      this.byRating,
      uci => san(this.ctrl.node.fen, uci),
      rating => this.chooseRating(rating, false, true),
      uci => this.preview(uci),
    );
  }
  private renderRatings(): VNode {
    const moves = new Set(this.rows().map(c => c.uci));
    for (const values of this.byRating.values()) for (const c of values.slice(0, 3)) moves.add(c.uci);
    return hl('div.nosweat-rating-scroll', [
      hl('table.nosweat-ratings', [
        hl('caption', 'Move probabilities'),
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
