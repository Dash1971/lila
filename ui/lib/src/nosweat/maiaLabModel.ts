import { candidateWhiteCp, stockfishWinrate } from './candidateQuality';
import { legalUcis, position, type Candidate } from './core';
import { ratingSamples } from './ratingChart';
import { ratingChartQualities, type RatingChartQuality } from './ratingChartQuality';

export interface LabScore {
  score: EvalScore;
  depth: number;
}
export interface MaiaLabSnapshot {
  key: string;
  fen: string;
  orientation: Color;
  model: string;
  history: boolean;
  rating: number;
  byRating: Map<number, Candidate[]>;
  scores: Map<string, LabScore>;
  busy: boolean;
  failed: boolean;
}
export interface DescriptionPart {
  key: string;
  moves?: string[];
}
export const labProbability = (data: MaiaLabSnapshot, rating: number, uci: string): number | undefined => {
  const policy = data.byRating.get(rating);
  if (!policy) return undefined;
  const p = policy.find(c => c.uci === uci)?.probability ?? 0;
  return Number.isFinite(p) && p >= 0 && p <= 1 ? p : undefined;
};
export const labScores = (data: MaiaLabSnapshot): Map<string, EvalScore> => {
  const legal = new Set(legalUcis(data.fen));
  return new Map(
    [...data.scores].flatMap(([uci, result]) =>
      legal.has(uci) &&
      result.depth >= 10 &&
      candidateWhiteCp(result.score, position(data.fen).turn === 'white') !== undefined
        ? [[uci, result.score] as const]
        : [],
    ),
  );
};
export const labQualities = (data: MaiaLabSnapshot): Map<string, RatingChartQuality> =>
  ratingChartQualities(labScores(data), position(data.fen).turn === 'white');

// Finite mover-relative ordering, including shortest wins / longest resistance.
export function labMoveValue(score: EvalScore, white: boolean): number {
  const cp = candidateWhiteCp(score, white)! * (white ? 1 : -1);
  return score.mate === undefined
    ? cp
    : cp > 0
      ? cp - Math.abs(score.mate) / 1000
      : cp + Math.abs(score.mate) / 1000;
}

// Actual best roots precede the policy leaders, so the engine's answer cannot
// disappear when a rare but important candidate is outside Maia's top moves.
export function labMoves(data: MaiaLabSnapshot, rating: number, count: number): string[] {
  const legal = new Set(legalUcis(data.fen));
  const scores = labScores(data);
  const white = position(data.fen).turn === 'white';
  const cp = (uci: string) => labMoveValue(scores.get(uci)!, white);
  const best = [...scores.keys()].sort((a, b) => cp(b) - cp(a) || a.localeCompare(b));
  const union = new Set<string>([
    ...best.slice(0, 3),
    ...(data.byRating.get(rating) ?? []).map(c => c.uci),
    ...ratingSamples.flatMap(r => data.byRating.get(r)?.[0]?.uci ?? []),
  ]);
  return [...union].filter(uci => legal.has(uci)).slice(0, count);
}

// Adapted from CSSLab/maia-platform-frontend (GPL-3.0), 15cef70619bbd7d70c5b0575af3bcf907aeed62c:
// useDescriptionGenerator.ts. Keep its W/D/L proximity, 5.56% temptation,
// 10-point blunder loss, 40% danger and 2/9, 6/9 findability thresholds.
// Mute requires complete real rating samples and legal root evidence; it never
// interprets an unanswered level as zero or calls a partial vector exhaustive.
export function describeLabPosition(data: MaiaLabSnapshot): DescriptionPart[] {
  const legal = legalUcis(data.fen);
  if (!legal.length) return [{ key: 'LabTerminal' }];
  const scores = labScores(data);
  if (
    ratingSamples.some(r => !data.byRating.has(r)) ||
    legal.some(uci => !scores.has(uci) || data.scores.get(uci)!.depth < 12)
  )
    return [{ key: data.failed ? 'LabUnavailable' : 'LabDescriptionPending' }];
  const white = position(data.fen).turn === 'white';
  const cp = (uci: string) => labMoveValue(scores.get(uci)!, white);
  const ordered = [...legal].sort((a, b) => cp(b) - cp(a) || a.localeCompare(b));
  const wdl = (p: number) => {
    const win = (x: number) => 1 / (1 + Math.exp(-(x - 1) / 0.8));
    return [win(p), 1 - win(p) - win(-p)];
  };
  const bestWdl = wdl(cp(ordered[0]) / 100);
  const good = ordered.filter(uci => wdl(cp(uci) / 100).every((v, i) => Math.abs(v - bestWdl[i]) <= 0.08));
  let leaders = 0;
  const aggregate = new Map<string, number>();
  for (const rating of ratingSamples) {
    const policy = [...data.byRating.get(rating)!]
      .filter(c => legal.includes(c.uci))
      .sort((a, b) => b.probability - a.probability);
    if (good.includes(policy[0]?.uci)) leaders++;
    for (const c of policy.slice(0, 4)) aggregate.set(c.uci, (aggregate.get(c.uci) ?? 0) + c.probability);
  }
  const bestWr = stockfishWinrate(scores.get(ordered[0])!, white)!;
  const blunder = (uci: string) => bestWr - stockfishWinrate(scores.get(uci)!, white)! >= 0.1;
  const tempting = [...aggregate]
    .filter(([uci, p]) => p / ratingSamples.length > 0.5 / 9 && blunder(uci))
    .sort((a, b) => b[1] - a[1])[0];
  const total = [...aggregate.values()].reduce((a, b) => a + b, 0);
  const bad = [...aggregate].reduce((sum, [uci, p]) => sum + (blunder(uci) ? p : 0), 0);
  const mean = good.reduce((sum, uci) => sum + cp(uci) / 100, 0) / good.length;
  const outcome =
    mean > 3
      ? 'Overwhelming'
      : mean > 1.5
        ? 'Winning'
        : mean > 0.35
          ? 'Advantage'
          : mean >= -0.35
            ? 'Balanced'
            : mean >= -1.5
              ? 'Defending'
              : 'Resistance';
  return [
    ...(tempting
      ? [{ key: total > 0 && bad / total > 0.4 ? 'LabTreacherous' : 'LabTempting', moves: [tempting[0]] }]
      : []),
    { key: 'Lab' + outcome, moves: good.slice(0, 3) },
    {
      key:
        leaders / ratingSamples.length <= 2 / 9
          ? 'LabHard'
          : leaders / ratingSamples.length <= 6 / 9
            ? 'LabMixed'
            : 'LabIntuitive',
    },
  ];
}
