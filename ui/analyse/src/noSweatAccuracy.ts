// Mobile Maia GameAccuracy / StockfishReview.whiteWinPercent, AGPL-3.0.
// Exact constants and volatility-weighted/harmonic aggregation are intentional.
export interface GameAccuracy {
  white: number | null;
  black: number | null;
}
export function whiteWinPercent(score: EvalScore): number {
  if (score.cp === undefined && score.mate === undefined) throw new Error('Missing evaluation');
  const value =
    score.mate === undefined
      ? Math.max(-1000, Math.min(1000, score.cp!))
      : (21 - Math.min(10, Math.abs(score.mate))) * 100 * (score.mate > 0 ? 1 : -1);
  return 100 / (1 + Math.exp(-0.00368208 * value));
}
export function moveAccuracy(before: number, after: number): number {
  if (after >= before) return 100;
  return Math.max(
    0,
    Math.min(
      100,
      103.1668100711649 * Math.exp(-0.04354415386753951 * (before - after)) - 3.166924740191411 + 1,
    ),
  );
}
function deviation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sum, n) => sum + (n - mean) ** 2, 0) / values.length);
}
function mean(moves: [number, number][]): number | null {
  if (!moves.length) return null;
  const weight = moves.reduce((sum, m) => sum + m[1], 0);
  const weighted = moves.reduce((sum, m) => sum + m[0] * m[1], 0) / weight;
  const harmonic = moves.some(m => m[0] === 0)
    ? 0
    : moves.length / moves.reduce((sum, m) => sum + 1 / m[0], 0);
  return (weighted + harmonic) / 2;
}
export function gameAccuracy(scores: EvalScore[], startsWithWhite = true): GameAccuracy {
  if (scores.length < 2) return { white: null, black: null };
  const percents = scores.map(whiteWinPercent);
  const size = Math.max(2, Math.min(8, Math.floor(scores.length / 10)));
  const windows: number[][] = [];
  for (let i = 0; i < Math.min(size, percents.length) - 2; i++) windows.push(percents.slice(0, size));
  for (let start = 0; start + size <= percents.length; start++)
    windows.push(percents.slice(start, start + size));
  const white: [number, number][] = [];
  const black: [number, number][] = [];
  for (let ply = 0; ply + 1 < scores.length; ply++) {
    const whiteMoved = (ply % 2 === 0) === startsWithWhite;
    const before = whiteMoved ? percents[ply] : 100 - percents[ply];
    const after = whiteMoved ? percents[ply + 1] : 100 - percents[ply + 1];
    const weight = Math.max(0.5, Math.min(12, deviation(windows[ply])));
    (whiteMoved ? white : black).push([moveAccuracy(before, after), weight]);
  }
  return { white: mean(white), black: mean(black) };
}
