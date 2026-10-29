import { gameAccuracy, type GameAccuracy } from './noSweatAccuracy';
import type { ClassificationInput, ClassificationResult } from './noSweatClassify';
import type { Review } from './noSweatFish';

export const reviewQualities = {
  fast: { name: 'Fast', depth: 12, time: 500 },
  balanced: { name: 'Balanced', depth: 14, time: 1000 },
  thorough: { name: 'Thorough', depth: 16, time: 1500 },
} as const;
export type ReviewQuality = keyof typeof reviewQualities;
export interface ReviewNode {
  fen: string;
  uci?: string;
  san?: string;
  path: string;
}
export interface GameReport {
  key: string;
  quality: ReviewQuality;
  nodes: ReviewNode[];
  reviews: Review[];
  moves: (ClassificationResult | undefined)[];
  unavailable: number[];
  accuracy?: GameAccuracy;
  state: 'idle' | 'evaluating' | 'classifying' | 'confirming' | 'complete' | 'stopped' | 'failed';
  completed: number;
  total: number;
  error?: string;
}
interface Dependencies {
  search: (fen: string, signal: AbortSignal, depth: number, time: number) => Promise<Review>;
  classify: (input: ClassificationInput, signal: AbortSignal) => Promise<ClassificationResult>;
  changed: () => void;
}
export const gameReviewKey = (nodes: ReviewNode[], quality: ReviewQuality): string =>
  JSON.stringify(['sf19-small-mobilemaia-full-v1', quality, nodes.map(n => [n.path, n.fen, n.uci])]);
export class GameReview {
  report?: GameReport;
  private abort?: AbortController;
  private generation = 0;
  private readonly cache = new Map<string, Review>();
  constructor(private readonly deps: Dependencies) {}
  observe(nodes: ReviewNode[], quality: ReviewQuality): void {
    if (this.report && this.report.key !== gameReviewKey(nodes, quality)) {
      this.report = undefined;
      this.stop();
    }
  }
  resultAt(path: string, fen: string): ClassificationResult | undefined {
    const report = this.report;
    if (!report) return undefined;
    const index = report.nodes.findIndex(n => n.path === path && n.fen === fen);
    return index > 0 ? report.moves[index - 1] : undefined;
  }
  get running(): boolean {
    return !!this.abort;
  }
  stop(): void {
    this.generation++;
    this.abort?.abort();
    this.abort = undefined;
    if (this.report && ['evaluating', 'classifying', 'confirming'].includes(this.report.state))
      this.report.state = 'stopped';
    this.deps.changed();
  }
  async start(nodes: ReviewNode[], quality: ReviewQuality): Promise<void> {
    if (this.report?.state === 'complete') this.cache.clear();
    this.stop();
    if (nodes.length < 2) return;
    const generation = this.generation;
    const abort = (this.abort = new AbortController());
    const current = () => generation === this.generation && !abort.signal.aborted;
    const mode = reviewQualities[quality];
    const report: GameReport = (this.report = {
      key: gameReviewKey(nodes, quality),
      quality,
      nodes: nodes.map(n => ({ ...n })),
      reviews: [],
      moves: Array.from({ length: nodes.length - 1 }, () => undefined),
      unavailable: [],
      state: 'evaluating',
      completed: 0,
      total: nodes.length,
    });
    this.deps.changed();
    const search = async (fen: string, confirmation = false): Promise<Review> => {
      if (!current()) throw new Error('Cancelled');
      const depth = mode.depth + (confirmation ? 2 : 0);
      const key = JSON.stringify([fen, quality, depth, mode.time]);
      const cached = this.cache.get(key);
      if (cached) return cached;
      const result = await this.deps.search(fen, abort.signal, depth, mode.time);
      if (!current()) throw new Error('Cancelled');
      const review = { ...result, quality };
      this.cache.set(key, review);
      if (this.cache.size > 800) this.cache.delete(this.cache.keys().next().value!);
      return review;
    };
    try {
      for (const node of report.nodes) {
        report.reviews.push(await search(node.fen));
        if (!current()) return;
        report.completed++;
        this.deps.changed();
      }
      report.accuracy = gameAccuracy(
        report.reviews.map(r => r.current.lines[0]),
        report.nodes[0].fen.split(' ')[1] === 'w',
      );
      report.state = 'classifying';
      report.completed = 0;
      report.total = nodes.length - 1;
      this.deps.changed();
      for (let ply = 1; ply < nodes.length; ply++) {
        if (!current()) return;
        const first = Math.max(0, ply - 2);
        const input: ClassificationInput = {
          positions: nodes.slice(first, ply + 1).map(n => n.fen),
          reviews: report.reviews.slice(first, ply + 1),
          move: nodes[ply].uci!,
        };
        try {
          report.moves[ply - 1] = await this.deps.classify(input, abort.signal);
        } catch {
          if (!current()) return;
          report.unavailable.push(ply);
        }
        if (!current()) return;
        report.completed++;
        this.deps.changed();
      }
      // Match Mobile Maia's six-search budget for uncorroborated standout windows.
      report.state = 'confirming';
      let budget = 6;
      this.deps.changed();
      for (let ply = 1; ply < nodes.length; ply++) {
        const provisional = report.moves[ply - 1];
        if (!provisional?.withheld || !['!', '!!'].includes(provisional.provisional ?? '')) continue;
        const first = provisional.provisional === '!' ? Math.max(0, ply - 2) : ply - 1;
        const cost = ply - first + 1;
        if (cost > budget) continue;
        budget -= cost;
        const baselineFirst = Math.max(0, ply - 2);
        try {
          const confirmation = await Promise.all(nodes.slice(first, ply + 1).map(n => search(n.fen, true)));
          if (!current()) return;
          const input: ClassificationInput = {
            positions: nodes.slice(baselineFirst, ply + 1).map(n => n.fen),
            reviews: report.reviews.slice(baselineFirst, ply + 1),
            move: nodes[ply].uci!,
            confirmation,
          };
          report.moves[ply - 1] = await this.deps.classify(input, abort.signal);
          if (!current()) return;
        } catch {
          if (!current()) return; /* Unsupported standout stays withheld; baseline review is unchanged. */
        }
        this.deps.changed();
      }
      if (!current()) return;
      report.state = 'complete';
      this.abort = undefined;
      this.deps.changed();
    } catch (error) {
      if (!current()) return;
      report.state = 'failed';
      report.error = String(error instanceof Error ? error.message : error);
      this.abort = undefined;
      this.deps.changed();
    }
  }
}
