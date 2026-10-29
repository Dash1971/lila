export interface EnginePreferences {
  model: '5m' | '79m';
  selfElo: number;
  opponentElo: number;
  secondMaiaEnabled: boolean;
  secondMaiaElo: number;
  history: boolean;
  maiaArrows: boolean;
  fishArrows: boolean;
}
export const defaultEnginePreferences: EnginePreferences = {
  model: '5m',
  selfElo: 1500,
  opponentElo: 1500,
  secondMaiaEnabled: true,
  secondMaiaElo: 2400,
  history: true,
  maiaArrows: true,
  fishArrows: true,
};
export function readEnginePreferences(raw: string | null): EnginePreferences {
  let input: Partial<EnginePreferences> = {};
  try {
    input = JSON.parse(raw ?? '{}') ?? {};
  } catch {
    /* Invalid browser preference falls back safely. */
  }
  const rating = (n: unknown, fallback = 1500) =>
    typeof n === 'number' && Number.isInteger(n) && n >= 600 && n <= 2600 && n % 100 === 0 ? n : fallback;
  const boolean = (key: 'history' | 'maiaArrows' | 'fishArrows') =>
    typeof input[key] === 'boolean' ? input[key] : true;
  return {
    model: input.model === '79m' ? '79m' : '5m',
    selfElo: rating(input.selfElo),
    opponentElo: rating(input.opponentElo),
    secondMaiaEnabled: typeof input.secondMaiaEnabled === 'boolean' ? input.secondMaiaEnabled : true,
    secondMaiaElo: rating(input.secondMaiaElo, 2400),
    history: boolean('history'),
    maiaArrows: boolean('maiaArrows'),
    fishArrows: boolean('fishArrows'),
  };
}
