export interface SandboxCard {
  id: string;
  title: string;
  content: string;
  category?: string;
  tags?: string[];
}

export interface RevolverProp {
  id: string;
  kind: 'revolver';
  title: string;
  chambers: number;
  currentChamber: number;
  cylinder: ('live' | 'blank')[];
  lastAction: {
    playerId: string;
    targetPlayerId?: string;
    result: 'live' | 'blank' | 'spin';
    timestamp: number;
  } | null;
}

export interface DiceProp {
  id: string;
  kind: 'dice';
  title: string;
  diceCount: number;
  diceType: 'd6' | 'd20';
  values: number[];
  isCupCovered: boolean;
  lastRollBy: string | null;
  lastRollTimestamp: number | null;
}

export interface BellProp {
  id: string;
  kind: 'bell';
  title: string;
  rungBy: string | null;
  rungTimestamp: number | null;
  ringCount: number;
}

export interface DeckProp {
  id: string;
  kind: 'deck';
  title: string;
  drawPile: SandboxCard[];
  discardPile: SandboxCard[];
  tableCards: { card: SandboxCard; playedBy: string; isPublic: boolean }[];
}

export interface TimerProp {
  id: string;
  kind: 'timer';
  title: string;
  durationSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  isExploded: boolean;
  startedBy: string | null;
  startedAt: number | null;
}

export interface CoinProp {
  id: string;
  kind: 'coin';
  title: string;
  lastFlipResult: 'heads' | 'tails' | null;
  flippedBy: string | null;
  flipTimestamp: number | null;
}

export interface WheelProp {
  id: string;
  kind: 'wheel';
  title: string;
  segments: Array<{ label: string; color?: string }>;
  rotationAngle: number;
  isSpinning: boolean;
  lastResult: string | null;
  spunBy: string | null;
  spinTimestamp: number | null;
}

export interface ScoreboardProp {
  id: string;
  kind: 'scoreboard';
  title: string;
  currencyName: string;
  scores: Record<string, number>;
}

export type SandboxProp =
  | RevolverProp
  | DiceProp
  | BellProp
  | DeckProp
  | TimerProp
  | CoinProp
  | WheelProp
  | ScoreboardProp;

export interface ActivityLogItem {
  id: string;
  timestamp: number;
  playerId: string;
  kind:
    | 'revolver'
    | 'dice'
    | 'bell'
    | 'deck'
    | 'timer'
    | 'coin'
    | 'wheel'
    | 'scoreboard'
    | 'ai'
    | 'table';
  text: string;
}

export interface PartySandboxConfig {
  rulesetId?: 'party_sandbox_v1';
}

export interface PartySandboxPlayerView {
  schemaVersion: 1;
  phase: 'sandbox';
  players: string[];
  config: PartySandboxConfig;
  props: Record<string, SandboxProp>;
  propOrder: string[];
  myHand: SandboxCard[];
  playerHandCounts: Record<string, number>;
  activityLogs: ActivityLogItem[];
  assistantMessage: {
    text: string;
    timestamp: number;
    prompt?: string;
  } | null;
  me: {
    playerId: string;
  } | null;
}

export function parsePartySandboxView(
  raw: unknown,
  _role: 'player' | 'spectator',
): PartySandboxPlayerView | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const view = raw as Record<string, unknown>;
  if (view.schemaVersion !== 1) return null;
  return view as unknown as PartySandboxPlayerView;
}
