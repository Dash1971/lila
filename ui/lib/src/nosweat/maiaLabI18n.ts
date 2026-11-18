// All product copy is supplied by the existing native site catalogs. Fallbacks
// are for embedded/test views; every key ships in all ten supported locales.
export const labEnglish = {
  LabTitle: 'Maia Lab',
  LabOpen: 'Moves by rating · Open Maia Lab',
  LabClose: 'Close Maia Lab',
  LabRating: 'Maia rating',
  LabRatingChart: 'Moves by rating',
  LabMoveMap: 'Move map',
  LabMoveCount: '%s moves',
  LabShow: 'Show candidates',
  LabProbability: 'Maia probability',
  LabEvaluation: 'Stockfish evaluation',
  LabWinrate: 'Empirical Stockfish win rate (side to move)',
  LabEvalLoss: 'Evaluation loss (pawns)',
  LabDepth: 'Depth %s',
  LabMove: 'Move',
  LabCandidates: 'Candidate comparison',
  LabSelected: 'Selected move: %s',
  LabExplore: 'Explore selected move',
  LabBoard: 'Current position with the selected move highlighted',
  LabWhite: 'White to move',
  LabBlack: 'Black to move',
  LabModel: 'Model: %1$s · History: %2$s',
  LabOn: 'on',
  LabOff: 'off',
  LabPending: 'Waiting for analysis…',
  LabUnavailable: 'Analysis is unavailable. Close this dialog and retry with the engine enabled.',
  LabProgress: 'Rating samples: %1$s / %2$s',
  LabDescriptionPending:
    'The position description needs the full rating sweep and Stockfish evaluations for every legal move.',
  LabTerminal: 'This position has no legal moves.',
  LabMissing: 'Not yet available',
  LabExplain:
    'Maia probabilities predict model choices, not measured human solve rates. Stockfish evaluations use White’s perspective. Descriptions summarize this position; they do not change game classifications.',
  LabMapAxis: 'Stockfish win-rate loss (percentage points)',
  LabMapHelp:
    'Left: stronger moves. Up: more likely Maia choices. Moves without an engine evaluation are omitted.',
  LabPreview: 'Preview %s',
  LabSelectRating: 'Select Maia %s',
  LabChartHelp: 'Maia probability from 600 to 2600. Arrow keys explore the chart; Enter selects a rating.',
  LabGood: 'Good move',
  LabAcceptable: 'Acceptable move',
  LabBlunder: 'Blunder',
  LabQuality: 'Stockfish quality',
  LabTreacherous:
    'Tread carefully: this position is highly treacherous! It is easy to go astray with a tempting move like %s.',
  LabTempting: 'Stay alert: %s is a tempting but weaker choice.',
  LabOverwhelming: 'Moves with an overwhelming winning advantage: %s.',
  LabWinning: 'Winning continuations: %s.',
  LabAdvantage: 'Moves that keep an advantage: %s.',
  LabBalanced: 'Moves that keep the position balanced: %s.',
  LabDefending: 'Defensive resources: %s.',
  LabResistance: 'Moves that offer the best resistance: %s.',
  LabHard: 'These moves are rarely Maia’s first choice across the rating range.',
  LabMixed: 'How intuitive these moves appear varies across Maia rating levels.',
  LabIntuitive: 'These moves are Maia’s first choice at most rating levels.',
  LabPair: '%1$s and %2$s',
  LabTriple: '%1$s, %2$s and %3$s',
} as const;
export type LabTextKey = keyof typeof labEnglish;
export function labText(key: LabTextKey, ...args: (string | number)[]): string {
  const value =
    typeof i18n !== 'undefined' ? (i18n.site as unknown as Record<string, unknown>)['mute' + key] : undefined;
  if (typeof value === 'function') return value(...args);
  let n = 0;
  return (typeof value === 'string' ? value : labEnglish[key]).replace(/%(?:(\d+)\$)?s/g, (_, index) =>
    String(args[index ? Number(index) - 1 : n++] ?? ''),
  );
}
