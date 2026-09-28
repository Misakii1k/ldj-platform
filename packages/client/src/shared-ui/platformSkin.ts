export type PlatformSkin = 'light' | 'dark';
export type StartTransitionKind = 'sheet' | 'curtain' | 'stripes'; // T1 / T2 / T3

export interface GamePlate {
  skin: PlatformSkin;
  icon: string;
  bars: readonly [string, string, string, string];
}

const DEFAULT_PLATE: GamePlate = {
  skin: 'light',
  icon: '🎲',
  bars: ['#f7c84b', '#08715d', '#c23616', '#7358a7'],
};

const GAME_PLATES: Record<string, GamePlate> = {
  werewolf: {
    skin: 'dark',
    icon: '🐺',
    bars: ['#7a1420', '#3b0a12', '#e9c874', '#241015'],
  },
  undercover: {
    skin: 'dark',
    icon: '🕵️',
    bars: ['#2b2f4a', '#151726', '#e9c874', '#3a1f3f'],
  },
  'wits-wagers': {
    skin: 'dark',
    icon: '🪙',
    bars: ['#1f5a3c', '#0f2e1f', '#e9c874', '#5a1620'],
  },
  'goose-relay': {
    skin: 'dark',
    icon: '🪿',
    bars: ['#6b4a2b', '#2a1d12', '#c0392b', '#1a130c'],
  },
  'cheese-thief': {
    skin: 'light',
    icon: '🧀',
    bars: ['#f7c84b', '#8f9bd6', '#e98f5a', '#6f7fc4'],
  },
  durian: {
    skin: 'light',
    icon: '🍈',
    bars: ['#f7c84b', '#7fb04a', '#e0a23b', '#4f7a2a'],
  },
  loveletter: {
    skin: 'light',
    icon: '💌',
    bars: ['#e8a0a8', '#b8324a', '#f3d9b1', '#7a2334'],
  },
  landlord: {
    skin: 'light',
    icon: '🀄',
    bars: ['#c23616', '#7a4a22', '#f7c84b', '#3f2a17'],
  },
  uno: {
    skin: 'light',
    icon: '🎴',
    bars: ['#e53935', '#1e88e5', '#fbc02d', '#43a047'],
  },
  'bell-clash': {
    skin: 'light',
    icon: '🔔',
    bars: ['#1f6b4a', '#f7c84b', '#e53935', '#0f4430'],
  },
  'echo-judge': {
    skin: 'light',
    icon: '⚖️',
    bars: ['#8a5a2b', '#d8b477', '#4a3320', '#b23a2a'],
  },
  'night-testimony': {
    skin: 'light',
    icon: '🗂️',
    bars: ['#c9a36b', '#b23a2a', '#8a6a3f', '#3f4a5a'],
  },
};

export function plateFor(gameId: string | null | undefined): GamePlate {
  if (!gameId) return DEFAULT_PLATE;
  return GAME_PLATES[gameId] ?? DEFAULT_PLATE;
}

export function pickStartTransition(rand: () => number = Math.random): StartTransitionKind {
  const kinds = ['sheet', 'curtain', 'stripes'] as const;
  const idx = Math.min(2, Math.max(0, Math.floor(rand() * 3))) as 0 | 1 | 2;
  return kinds[idx];
}
