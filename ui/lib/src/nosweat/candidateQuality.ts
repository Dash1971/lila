// Maia platform (GPL-3.0), revision 325b85c3b6427f2e8e691e1dcf4ab9d4dbf94ec3; win-rate fix 538e1af2612bce0c61d7b8264223304497f109f3.
// Source: src/lib/analysis.ts, src/hooks/useAnalysisController/utils.ts and constants/analysis.ts.
// Empirical CP lookup and 5/10 percentage-point boundaries; never use Maia likelihood.
const cpLookup: Record<string, number> = {
  '-10.0': 0.169027,
  '-9.9': 0.169615,
  '-9.8': 0.170127,
  '-9.7': 0.170812,
  '-9.6': 0.171694,
  '-9.5': 0.17279,
  '-9.4': 0.174102,
  '-9.3': 0.175605,
  '-9.2': 0.177273,
  '-9.1': 0.179091,
  '-9.0': 0.180987,
  '-8.9': 0.182915,
  '-8.8': 0.184838,
  '-8.7': 0.186695,
  '-8.6': 0.188491,
  '-8.5': 0.190232,
  '-8.4': 0.192085,
  '-8.3': 0.194233,
  '-8.2': 0.196698,
  '-8.1': 0.199508,
  '-8.0': 0.202669,
  '-7.9': 0.206015,
  '-7.8': 0.209427,
  '-7.7': 0.212738,
  '-7.6': 0.21571,
  '-7.5': 0.218239,
  '-7.4': 0.220391,
  '-7.3': 0.22225,
  '-7.2': 0.223864,
  '-7.1': 0.22545,
  '-7.0': 0.227423,
  '-6.9': 0.230135,
  '-6.8': 0.233548,
  '-6.7': 0.237376,
  '-6.6': 0.241443,
  '-6.5': 0.245492,
  '-6.4': 0.249239,
  '-6.3': 0.252591,
  '-6.2': 0.255566,
  '-6.1': 0.258311,
  '-6.0': 0.260979,
  '-5.9': 0.263692,
  '-5.8': 0.266537,
  '-5.7': 0.269398,
  '-5.6': 0.272247,
  '-5.5': 0.275167,
  '-5.4': 0.278241,
  '-5.3': 0.281449,
  '-5.2': 0.284771,
  '-5.1': 0.288211,
  '-5.0': 0.29177,
  '-4.9': 0.295276,
  '-4.8': 0.298701,
  '-4.7': 0.302064,
  '-4.6': 0.305381,
  '-4.5': 0.308626,
  '-4.4': 0.311808,
  '-4.3': 0.315021,
  '-4.2': 0.318286,
  '-4.1': 0.321486,
  '-4.0': 0.324617,
  '-3.9': 0.327755,
  '-3.8': 0.330924,
  '-3.7': 0.334034,
  '-3.6': 0.33702,
  '-3.5': 0.339992,
  '-3.4': 0.343028,
  '-3.3': 0.346046,
  '-3.2': 0.349082,
  '-3.1': 0.352207,
  '-3.0': 0.355469,
  '-2.9': 0.358842,
  '-2.8': 0.362344,
  '-2.7': 0.365978,
  '-2.6': 0.369675,
  '-2.5': 0.373361,
  '-2.4': 0.377075,
  '-2.3': 0.380806,
  '-2.2': 0.384567,
  '-2.1': 0.3884,
  '-2.0': 0.392429,
  '-1.9': 0.396756,
  '-1.8': 0.401419,
  '-1.7': 0.40643,
  '-1.6': 0.411854,
  '-1.5': 0.417668,
  '-1.4': 0.423703,
  '-1.3': 0.429697,
  '-1.2': 0.435622,
  '-1.1': 0.44157,
  '-1.0': 0.447671,
  '-0.9': 0.454063,
  '-0.8': 0.460912,
  '-0.7': 0.468495,
  '-0.6': 0.476866,
  '-0.5': 0.485788,
  '-0.4': 0.495066,
  '-0.3': 0.504569,
  '-0.2': 0.515055,
  '-0.1': 0.527259,
  '0.0': 0.539177,
  '0.1': 0.550862,
  '0.2': 0.562709,
  '0.3': 0.574687,
  '0.4': 0.584243,
  '0.5': 0.592467,
  '0.6': 0.600274,
  '0.7': 0.607572,
  '0.8': 0.614349,
  '0.9': 0.620765,
  '1.0': 0.626833,
  '1.1': 0.632615,
  '1.2': 0.638199,
  '1.3': 0.643635,
  '1.4': 0.648925,
  '1.5': 0.654003,
  '1.6': 0.658792,
  '1.7': 0.663246,
  '1.8': 0.667361,
  '1.9': 0.671125,
  '2.0': 0.674604,
  '2.1': 0.677867,
  '2.2': 0.681003,
  '2.3': 0.684023,
  '2.4': 0.687004,
  '2.5': 0.690018,
  '2.6': 0.693001,
  '2.7': 0.695909,
  '2.8': 0.698803,
  '2.9': 0.70169,
  '3.0': 0.704491,
  '3.1': 0.707166,
  '3.2': 0.709695,
  '3.3': 0.712124,
  '3.4': 0.714496,
  '3.5': 0.716921,
  '3.6': 0.719419,
  '3.7': 0.722059,
  '3.8': 0.724834,
  '3.9': 0.727701,
  '4.0': 0.730514,
  '4.1': 0.733293,
  '4.2': 0.736143,
  '4.3': 0.738967,
  '4.4': 0.741685,
  '4.5': 0.744433,
  '4.6': 0.747352,
  '4.7': 0.750344,
  '4.8': 0.753255,
  '4.9': 0.756102,
  '5.0': 0.758987,
  '5.1': 0.7618,
  '5.2': 0.764479,
  '5.3': 0.76705,
  '5.4': 0.769554,
  '5.5': 0.771989,
  '5.6': 0.774346,
  '5.7': 0.776559,
  '5.8': 0.778666,
  '5.9': 0.780761,
  '6.0': 0.78284,
  '6.1': 0.784938,
  '6.2': 0.787238,
  '6.3': 0.789898,
  '6.4': 0.793022,
  '6.5': 0.796334,
  '6.6': 0.799572,
  '6.7': 0.802667,
  '6.8': 0.805434,
  '6.9': 0.807435,
  '7.0': 0.808643,
  '7.1': 0.809427,
  '7.2': 0.810281,
  '7.3': 0.811421,
  '7.4': 0.812938,
  '7.5': 0.814961,
  '7.6': 0.817454,
  '7.7': 0.820154,
  '7.8': 0.822807,
  '7.9': 0.825223,
  '8.0': 0.827366,
  '8.1': 0.829315,
  '8.2': 0.831118,
  '8.3': 0.832804,
  '8.4': 0.834355,
  '8.5': 0.835916,
  '8.6': 0.837593,
  '8.7': 0.839237,
  '8.8': 0.840791,
  '8.9': 0.84219,
  '9.0': 0.843336,
  '9.1': 0.844304,
  '9.2': 0.845199,
  '9.3': 0.846138,
  '9.4': 0.847095,
  '9.5': 0.847994,
  '9.6': 0.848954,
  '9.7': 0.849956,
  '9.8': 0.850761,
  '9.9': 0.851281,
  '10.0': 0.851931,
};

const cpLookupBins = Array.from({ length: 201 }, (_, i) => cpLookup[((i - 100) / 10).toFixed(1)]);

export type CandidateQuality = 'good' | 'ok' | 'blunder';
export const qualityFromLoss = (loss: number): CandidateQuality =>
  loss <= 0.05 ? 'good' : loss <= 0.1 ? 'ok' : 'blunder';

// Maia converts mate evidence to CP before its empirical win-rate lookup.
export const candidateWhiteCp = (score: EvalScore, white: boolean): number | undefined => {
  if (score.mate !== undefined) {
    if (!Number.isFinite(score.mate)) return undefined;
    return score.mate === 0 ? (white ? -10000 : 10000) : score.mate > 0 ? 10000 : -10000;
  }
  return score.cp !== undefined && Number.isFinite(score.cp) ? score.cp : undefined;
};

export const stockfishWinrate = (score: EvalScore, white: boolean): number | undefined => {
  const whiteCp = candidateWhiteCp(score, white);
  if (whiteCp === undefined) return undefined;
  const cp = Math.max(-10, Math.min(10, (white ? whiteCp : -whiteCp) / 100));
  // Interpolate between upstream's smoothed 0.1-pawn bins so 1 cp cannot jump a full bin.
  const pos = (cp + 10) * 10;
  const i = Math.min(199, Math.floor(pos));
  const t = pos - i;
  return cpLookupBins[i] + (cpLookupBins[i + 1] - cpLookupBins[i]) * t;
};

export function candidateQuality(
  best: EvalScore | undefined,
  move: EvalScore | undefined,
  white: boolean,
): CandidateQuality | undefined {
  if (!best || !move) return undefined;
  const before = stockfishWinrate(best, white);
  const after = stockfishWinrate(move, white);
  return before === undefined || after === undefined
    ? undefined
    : qualityFromLoss(Math.max(0, before - after));
}

export const qualityLabels = { good: 'Good move', ok: 'Acceptable move', blunder: 'Blunder' };

// Maia's shades are ranks within the evaluated blunder group, not probability
// buckets or additional loss thresholds. Unknown scores never receive a shade.
export function blunderRanks(scores: ReadonlyMap<string, EvalScore>, white: boolean): Map<string, number> {
  const known = [...scores].flatMap(([uci, score]) => {
    const value = stockfishWinrate(score, white);
    return value === undefined ? [] : [{ uci, score, value }];
  });
  const best = Math.max(...known.map(s => s.value));
  return new Map(
    known
      .filter(s => qualityFromLoss(best - s.value) === 'blunder')
      .sort(
        (a, b) =>
          b.value - a.value ||
          candidateWhiteCp(b.score, white)! - candidateWhiteCp(a.score, white)! ||
          a.uci.localeCompare(b.uci),
      )
      .map((s, i) => [s.uci, Math.min(i, 4)]),
  );
}
