// Mobile Maia / En Croissant annotations over native Lichess analysis.
// Accuracy, ACPL, best lines and Learn from your mistakes stay native.
import { parseUci } from 'chessops/util';

import type { Glyph, TreeNodeBase } from 'lib/tree/types';

import { type Annotation, type ClassificationInput, type ClassificationResult } from './noSweatClassify';
import { legalUcis, position, standardUci, terminalScore } from './noSweatCore';
import type { Review } from './noSweatFish';

export const reviewSource = 'mobile-maia-full-review-v1';
export const moveClasses = [
  { symbol: '!!', id: 3, name: 'Brilliant', color: '#15aabf' },
  { symbol: '!', id: 1, name: 'Good', color: '#12b886' },
  { symbol: '!?', id: 5, name: 'Interesting', color: '#82c91e' },
  { symbol: '?!', id: 6, name: 'Dubious', color: '#fab005' },
  { symbol: '?', id: 2, name: 'Mistake', color: '#fd7e14' },
  { symbol: '??', id: 4, name: 'Blunder', color: '#fa5252' },
] as const;
export const qualityGlyph = (symbol: Annotation): Glyph | undefined => {
  const c = moveClasses.find(c => c.symbol === symbol);
  return c && { id: c.id, name: c.name, symbol, comp: true, source: reviewSource };
};

export const gameReviewQualities = [
  { name: 'Fast', depth: 12, movetime: 500 },
  { name: 'Balanced', depth: 14, movetime: 1000 },
  { name: 'Thorough', depth: 16, movetime: 1500 },
] as const;
export const gameReviewQuality = (name: string | null) =>
  gameReviewQualities.find(q => q.name === name) ?? gameReviewQualities[0];

export function nativeReview(node: TreeNodeBase): Review | undefined {
  const terminal = terminalScore(node.fen);
  if (terminal)
    return {
      current: { depth: 99, lines: [{ ...terminal, moves: [] }] },
      terminal: true,
      quality: reviewSource,
    };
  const evals = node.eval?.pvs;
  if (!evals || evals.length < Math.min(2, legalUcis(node.fen).length)) return undefined;
  const pos = position(node.fen);
  const lines = evals.slice(0, 2).map(pv => ({
    ...pv,
    moves: pv.moves.split(' ').map((uci, i) => {
      const move = parseUci(uci);
      return i === 0 && move ? standardUci(pos, move) : uci;
    }),
  }));
  if (new Set(lines.map(l => l.moves[0])).size !== lines.length) return undefined;
  return { current: { depth: node.eval?.depth ?? 0, lines }, quality: reviewSource };
}

interface Dependencies {
  classify(input: ClassificationInput, signal: AbortSignal): Promise<ClassificationResult>;
  search(fen: string, signal: AbortSignal, depth: number, time: number): Promise<Review>;
}
export class FullGameClassifier {
  constructor(private readonly deps: Dependencies) {}
  async run(
    nodes: TreeNodeBase[],
    signal: AbortSignal,
    current: () => boolean,
    progress: (done: number, total: number) => void,
    quality: { depth: number; movetime: number } = gameReviewQualities[0],
  ): Promise<Map<number, Annotation>> {
    const valid = () => {
      if (signal.aborted || !current()) throw new Error('Cancelled');
    };
    const results = new Map<number, Annotation>();
    const confirmations = new Map<string, Review>();
    for (let i = 1; i < nodes.length; i++) {
      valid();
      progress(i - 1, nodes.length - 1);
      if (!nodes[i].uci || nodes[i].glyphs?.some(g => !g.comp && g.id >= 1 && g.id <= 6)) continue;
      const window = nodes.slice(Math.max(0, i - 2), i + 1);
      const reviews = window.map(nativeReview);
      if (reviews.some(r => !r)) continue;
      const before = window[window.length - 2];
      const move = parseUci(nodes[i].uci!);
      if (!move) continue;
      const input = {
        positions: window.map(n => n.fen),
        reviews: reviews as Review[],
        move: standardUci(position(before.fen), move),
      };
      let result = await this.deps.classify(input, signal);
      valid();
      const provisional = result.provisional ?? result.symbol;
      if (provisional === '!!' || provisional === '!') {
        const confirmation: Review[] = [];
        for (const [n, node] of window.entries()) {
          valid();
          const depth = Math.max(quality.depth + 2, input.reviews[n].current.depth + 2);
          const key = node.fen + ':' + depth;
          if (!confirmations.has(key))
            confirmations.set(key, {
              ...(await this.deps.search(node.fen, signal, depth, quality.movetime * 2)),
              quality: reviewSource,
            });
          confirmation.push(confirmations.get(key)!);
        }
        result = await this.deps.classify({ ...input, confirmation }, signal);
        valid();
      }
      if (!result.withheld) results.set(nodes[i].ply, result.symbol);
    }
    valid();
    progress(nodes.length - 1, nodes.length - 1);
    return results;
  }
}

export function classificationCounts(nodes: TreeNodeBase[], color: Color): number[] {
  const counts = moveClasses.map(() => 0);
  for (const node of nodes) {
    if (!node.uci || (node.ply % 2 === 1 ? 'white' : 'black') !== color) continue;
    const category = moveClasses.findIndex(c => node.glyphs?.some(g => g.id === c.id));
    if (category !== -1) counts[category]++;
  }
  return counts;
}
