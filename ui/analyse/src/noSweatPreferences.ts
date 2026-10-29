import type { ReviewQuality } from './noSweatGameReview';
export interface EnginePreferences {
  model: '5m' | '79m';
  selfElo: number;
  opponentElo: number;
  history: boolean;
  maiaArrows: boolean;
  fishArrows: boolean;
  quality: ReviewQuality;
}
export const defaultEnginePreferences: EnginePreferences = {
  model: '5m',
  selfElo: 1500,
  opponentElo: 1500,
  history: true,
  maiaArrows: true,
  fishArrows: true,
  quality: 'fast',
};
export function readEnginePreferences(raw: string | null): EnginePreferences {
  let input: Partial<EnginePreferences> = {};
  try {
    input = JSON.parse(raw ?? '{}') ?? {};
  } catch {
    /* Invalid browser preference falls back safely. */
  }
  const rating = (n: unknown) =>
    typeof n === 'number' && Number.isInteger(n) && n >= 600 && n <= 2600 && n % 100 === 0 ? n : 1500;
  const boolean = (key: 'history' | 'maiaArrows' | 'fishArrows') =>
    typeof input[key] === 'boolean' ? input[key] : true;
  return {
    model: input.model === '79m' ? '79m' : '5m',
    selfElo: rating(input.selfElo),
    opponentElo: rating(input.opponentElo),
    history: boolean('history'),
    maiaArrows: boolean('maiaArrows'),
    fishArrows: boolean('fishArrows'),
    quality: input.quality === 'balanced' || input.quality === 'thorough' ? input.quality : 'fast',
  };
}
