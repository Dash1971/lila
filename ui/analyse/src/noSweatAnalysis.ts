import type { DrawShape } from '@lichess-org/chessground/draw';
import { parseUci } from 'chessops/util';

import { bind, hl, type VNode } from 'lib/view';

import type AnalyseCtrl from './ctrl';
import type { ClassificationInput, ClassificationResult } from './noSweatClassify';
import { encodeHistory, policy, san, scoreText, position, standardUci, type Candidate } from './noSweatCore';
import { ReviewFish, type Review } from './noSweatFish';

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
const label: Record<string, string> = {
  '!!': 'Brilliant',
  '!': 'Good',
  '!?': 'Interesting',
  '?!': 'Dubious',
  '?': 'Mistake',
  '??': 'Blunder',
};

export class NoSweatAnalysis {
  enabled = false;
  model = '5m';
  selfElo = 1500;
  opponentElo = 1500;
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
  private classifier?: Worker;
  private classifierTimer?: ReturnType<typeof setTimeout>;
  private classifierCancel?: () => void;
  private readonly annotations = new Map<string, ClassificationResult>();
  private fishBest?: string;
  private compareBusy = false;

  constructor(readonly ctrl: AnalyseCtrl) {
    this.fish = new ReviewFish(s => {
      this.status = s;
      this.ctrl.redraw();
    });
    window.addEventListener('pagehide', this.release);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.cancel();
        this.status = 'Paused while this tab is hidden';
        this.ctrl.redraw();
      } else if (this.enabled) this.positionChanged(true);
    });
  }
  private readonly valid = (generation: number): boolean =>
    generation === this.generation &&
    !this.abort.signal.aborted &&
    this.enabled &&
    this.ctrl.isCevalAllowed() &&
    !document.hidden;
  private readonly historyFens = (): string[] => this.ctrl.nodeList.map(n => n.fen);
  private readonly key = (fens = this.historyFens(), rating = this.selfElo): string =>
    JSON.stringify([
      'maia3-policy-v1',
      this.model,
      this.config?.models[this.model].sha256,
      rating,
      this.opponentElo,
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
    this.classifierCancel?.();
    this.classifierCancel = undefined;
    this.classifier?.terminate();
    this.classifier = undefined;
    clearTimeout(this.classifierTimer);
    this.compareBusy = false;
  }
  release = (): void => {
    this.cancel();
    this.client?.release();
    this.client = undefined;
    this.fish.destroy();
  };
  positionChanged(force = false): void {
    const context = this.key() + this.ctrl.path;
    if (!force && context === this.context) return;
    this.context = context;
    this.cancel();
    this.candidates = [];
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
  private predict(fens: string[], rating: number, generation: number): Promise<Candidate[]> {
    const task = this.maiaTail
      .catch(() => {})
      .then(async () => {
        if (!this.valid(generation)) throw new Error('Cancelled');
        const client = await this.prepare();
        if (!this.valid(generation)) throw new Error('Cancelled');
        const key = this.key(fens, rating);
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
            opponentElo: this.opponentElo,
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
    const candidates = await this.predict(this.historyFens(), this.selfElo, generation);
    if (!this.valid(generation)) return;
    this.candidates = candidates;
    this.status = '';
    this.ctrl.setAutoShapes();
    this.ctrl.redraw();
  }
  private normalUci(uci?: string): string | undefined {
    if (!uci) return undefined;
    const move = parseUci(uci);
    return move ? standardUci(position(this.ctrl.node.fen), move) : undefined;
  }
  private readonly played = (): string | undefined => this.normalUci(this.ctrl.node.children[0]?.uci);
  private readonly rows = (): Candidate[] => {
    const chosen = new Set(
      this.allMoves ? this.candidates.map(c => c.uci) : this.candidates.slice(0, 5).map(c => c.uci),
    );
    const played = this.played();
    if (played) chosen.add(played);
    if (this.fishBest) chosen.add(this.fishBest);
    return this.candidates.filter(c => chosen.has(c.uci));
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
    if (this.compareBusy || !this.candidates.length) return;
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
      const chosen = new Set(this.candidates.slice(0, 5).map(c => c.uci));
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
  private readonly annotationKey = (fens = this.historyFens()): string => JSON.stringify(fens.slice(-3));
  private runClassifier(input: ClassificationInput, generation: number): Promise<ClassificationResult> {
    return new Promise((resolve, reject) => {
      const worker = (this.classifier = new Worker(
        site.asset.url(site.asset.jsModule('analyse.nosweatWorker')),
        { type: 'module' },
      ));
      const stop = (error?: Error, result?: ClassificationResult) => {
        worker.terminate();
        if (this.classifier === worker) this.classifier = undefined;
        clearTimeout(this.classifierTimer);
        this.classifierCancel = undefined;
        if (error) reject(error);
        else resolve(result!);
      };
      this.classifierCancel = () => stop(new Error('Cancelled'));
      this.classifierTimer = setTimeout(
        () => stop(new Error('Capture search timed out; annotation unavailable')),
        10000,
      );
      worker.onerror = () => stop(new Error('Classification worker failed'));
      worker.onmessage = ({ data }) => {
        if (!this.valid(generation)) {
          stop(new Error('Cancelled'));
          return;
        }
        stop(data.error ? new Error(data.error) : undefined, data.result);
      };
      worker.postMessage(input);
    });
  }
  classifyMove = (): void => {
    if (this.compareBusy) return;
    const generation = this.generation;
    const nodes = this.ctrl.nodeList.slice(-3);
    if (nodes.length < 2) return;
    this.compareBusy = true;
    this.error = '';
    this.status = 'Reviewing the move with Stockfish…';
    this.ctrl.redraw();
    (async () => {
      const positions = nodes.map(n => n.fen);
      const reviews: Review[] = [];
      for (const fen of positions) reviews.push(await this.review(fen, generation));
      const parent = position(positions[positions.length - 2]);
      const move = parseUci(nodes[nodes.length - 1].uci!);
      if (!move) throw new Error('Move unavailable');
      this.status = 'Checking material and annotation evidence…';
      this.ctrl.redraw();
      const result = await this.runClassifier(
        { positions, reviews, move: standardUci(parent, move) },
        generation,
      );
      if (!this.valid(generation)) return;
      this.annotations.set(this.annotationKey(positions), result);
      this.compareBusy = false;
      this.status = '';
      this.ctrl.redraw();
    })().catch(e => this.failure(e, generation));
  };
  shapes(): DrawShape[] {
    if (!this.enabled || !this.ctrl.isCevalAllowed() || document.hidden || !this.candidates.length) return [];
    const shapes: DrawShape[] = [];
    if (this.maiaArrows)
      for (const c of this.candidates.slice(0, 3))
        shapes.push({
          orig: c.uci.slice(0, 2) as Key,
          dest: c.uci.slice(2, 4) as Key,
          brush: 'yellow',
          modifiers: { lineWidth: Math.max(2, Math.round(10 * c.probability)) },
        });
    if (this.fishArrows && this.fishBest)
      shapes.push({
        orig: this.fishBest.slice(0, 2) as Key,
        dest: this.fishBest.slice(2, 4) as Key,
        brush: 'paleBlue',
      });
    return shapes;
  }
  private control(labelText: string, value: number, change: (n: number) => void): VNode {
    return hl('label', [
      labelText,
      hl(
        'select',
        {
          attrs: { 'aria-label': labelText },
          hook: bind('change', e => {
            change(Number((e.target as HTMLSelectElement).value));
            this.positionChanged(true);
            this.ctrl.redraw();
          }),
        },
        ratings.map(n => hl('option', { attrs: { value: n, selected: n === value } }, String(n))),
      ),
    ]);
  }
  view(): VNode | undefined {
    if (!this.ctrl.isCevalAllowed() || this.ctrl.data.game.variant.key !== 'standard') return undefined;
    const fen = this.ctrl.node.fen;
    const played = this.played();
    const annotation = this.annotations.get(this.annotationKey());
    const button = (text: string, action: () => void, disabled = false) =>
      hl(
        'button.fbt',
        {
          attrs: { type: 'button', disabled },
          hook: bind('click', action),
        },
        text,
      );
    const check = (name: string, value: boolean, change: () => void) =>
      hl('label', [
        hl('input', {
          attrs: { type: 'checkbox', checked: value },
          hook: bind('change', () => {
            change();
            this.ctrl.setAutoShapes();
            this.ctrl.redraw();
          }),
        }),
        name,
      ]);
    return hl('section.nosweat-analysis', { attrs: { 'aria-label': 'Maia and Stockfish analysis' } }, [
      hl('div.nosweat-analysis__heading', [
        hl('strong', 'Maia + Stockfish'),
        button(this.enabled ? 'Pause' : 'Enable local analysis', () => {
          this.enabled = !this.enabled;
          if (!this.enabled) this.release();
          this.positionChanged(true);
          this.ctrl.setAutoShapes();
          this.ctrl.redraw();
        }),
      ]),
      hl(
        'p.nosweat-analysis__note',
        this.enabled
          ? 'Maia likelihood · Stockfish quality (White’s perspective)'
          : 'Runs in your browser. First download: 36 MB for 5M, 331 MB for 79M.',
      ),
      hl('div.nosweat-analysis__settings', [
        hl('label', [
          'Model',
          hl(
            'select',
            {
              attrs: { 'aria-label': 'Maia analysis model' },
              hook: bind('change', e => {
                this.release();
                this.model = (e.target as HTMLSelectElement).value;
                this.positionChanged(true);
                this.ctrl.redraw();
              }),
            },
            ['5m', '79m'].map(m =>
              hl(
                'option',
                { attrs: { value: m, selected: this.model === m } },
                m === '5m' ? 'Maia3 5M · light' : 'Maia3 79M · live-bot model',
              ),
            ),
          ),
        ]),
        this.control('Mover input', this.selfElo, n => (this.selfElo = n)),
        this.control('Opponent input', this.opponentElo, n => (this.opponentElo = n)),
        check('8-position history', this.history, () => {
          this.history = !this.history;
          this.positionChanged(true);
        }),
      ]),
      this.enabled &&
        hl('div', [
          hl('div.nosweat-analysis__options', [
            check('Maia arrows (amber)', this.maiaArrows, () => (this.maiaArrows = !this.maiaArrows)),
            check('Comparison arrow (blue)', this.fishArrows, () => (this.fishArrows = !this.fishArrows)),
          ]),
          this.returnPath !== undefined &&
            button('Return to original position', () => {
              const path = this.returnPath!;
              this.returnPath = undefined;
              this.ctrl.userJump(path);
              this.ctrl.redraw();
            }),
          this.candidates.length > 0 &&
            hl('table.nosweat-candidates', [
              hl('thead', [hl('tr', [hl('th', 'Move'), hl('th', 'Maia'), hl('th', 'Stockfish')])]),
              hl(
                'tbody',
                this.rows().map(c => {
                  const scored = this.scores.get(c.uci);
                  return hl('tr', { key: c.uci }, [
                    hl('td', [
                      button(san(fen, c.uci), () => this.preview(c.uci)),
                      c.uci === played && hl('small', 'Played'),
                      c.uci === this.fishBest && hl('small', 'SF choice'),
                    ]),
                    hl('td', (100 * c.probability).toFixed(1) + '%'),
                    hl(
                      'td',
                      {
                        attrs: {
                          title: scored ? 'Depth ' + scored.depth : 'This move has not been evaluated',
                        },
                      },
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
          hl('div.nosweat-analysis__actions', [
            button('Compare candidates', this.compare, this.compareBusy || !this.candidates.length),
            button(this.allMoves ? 'Top candidates' : 'All legal moves', () => {
              this.allMoves = !this.allMoves;
              this.ctrl.redraw();
            }),
            button('Moves by rating', this.sampleRatings, this.compareBusy || !this.candidates.length),
            button('Review this move', this.classifyMove, this.compareBusy || this.ctrl.nodeList.length < 2),
          ]),
          annotation &&
            hl('p.nosweat-annotation', [
              `${this.ctrl.node.san ?? 'Move'}: ${annotation.symbol ? label[annotation.symbol] + ' (' + annotation.symbol + ')' : 'No special annotation'}. ` +
                `Accuracy ${annotation.accuracy.toFixed(1)}%; CP loss ${annotation.cpLoss.toFixed(0)}.`,
              annotation.withheld &&
                hl('small', 'Standout label withheld: the complete decision was not corroborated.'),
              hl('small', 'En Croissant / Mobile Maia · computed separately from PGN annotations'),
            ]),
          this.ratingTable && this.renderRatings(),
          this.status && hl('p', { attrs: { role: 'status' } }, this.status),
          this.error && hl('p.error', { attrs: { role: 'alert' } }, this.error),
          hl(
            'small',
            'Ratings are Maia conditioning inputs, not calibrated Elo. Raw legal-move probabilities; no Temperature/Top-P filtering.',
          ),
        ]),
    ]);
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
                    hook: bind('click', () => {
                      this.selfElo = n;
                      this.positionChanged(true);
                      this.ctrl.redraw();
                    }),
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
                  { hook: bind('click', () => this.preview(move)) },
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
