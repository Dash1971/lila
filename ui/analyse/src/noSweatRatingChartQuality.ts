// Maia platform (GPL-3.0), revision a6e52f5c811ee18863cb2f0e81f2433a5b9905de.
// Chart-only adaptation of useAnalysisController/utils.ts and constants/analysis.ts.
import { qualityFromLoss, stockfishWinrate, type CandidateQuality } from './noSweatCandidateQuality';

const colors: Record<CandidateQuality, string[]> = {
  good: ['#238b45', '#41ab5d', '#74c476', '#90D289', '#AEDFA4'],
  ok: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#ec7014'],
  blunder: ['#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d'],
};

export interface RatingChartQuality {
  quality: CandidateQuality;
  color: string;
  loss: number;
}

export function ratingChartQualities(
  scores: ReadonlyMap<string, EvalScore>,
  white: boolean,
): Map<string, RatingChartQuality> {
  const known = [...scores].flatMap(([uci, score]) => {
    // Reject malformed mate evidence too: stockfishWinrate's normal callers only
    // receive finite engine values, while this map may be populated incrementally.
    if (score.mate !== undefined && !Number.isFinite(score.mate)) return [];
    const value = stockfishWinrate(score, white);
    return value === undefined ? [] : [{ uci, score, value }];
  });
  const best = Math.max(...known.map(move => move.value));
  const ranks = { good: 0, ok: 0, blunder: 0 };
  return new Map(
    known
      .sort(
        (a, b) =>
          b.value - a.value ||
          (white ? 1 : -1) * ((b.score.cp ?? 0) - (a.score.cp ?? 0)) ||
          a.uci.localeCompare(b.uci),
      )
      .map(({ uci, value }) => {
        const loss = Math.max(0, best - value);
        const quality = qualityFromLoss(loss);
        const rank = Math.min(ranks[quality]++, 4);
        return [uci, { quality, color: colors[quality][rank], loss }];
      }),
  );
}
