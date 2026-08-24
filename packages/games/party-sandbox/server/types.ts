import type { GameEffect } from '@ldj/shared';

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
  chambers: number; // 6 or 8
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
  diceCount: number; // 1 to 6
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

export interface ResolvedPartySandboxConfig {
  rulesetId?: 'party_sandbox_v1';
}

export interface PartySandboxState {
  schemaVersion: 1;
  phase: 'sandbox';
  players: string[];
  config: ResolvedPartySandboxConfig;
  props: Record<string, SandboxProp>;
  propOrder: string[];
  hands: Record<string, SandboxCard[]>;
  activityLogs: ActivityLogItem[];
  assistantMessage: {
    text: string;
    timestamp: number;
    prompt?: string;
  } | null;
}

export type PartySandboxAction =
  | { type: 'begin' }
  | { type: 'spawn_prop'; playerId: string; prop: SandboxProp }
  | { type: 'remove_prop'; playerId: string; propId: string }
  | {
      type: 'operate_revolver';
      playerId: string;
      propId: string;
      subAction: 'spin' | 'shoot' | 'load';
      targetPlayerId?: string;
      chambers?: number;
      liveCount?: number;
    }
  | {
      type: 'operate_dice';
      playerId: string;
      propId: string;
      subAction: 'roll' | 'toggle_cup' | 'set_count' | 'set_type';
      count?: number;
      diceType?: 'd6' | 'd20';
    }
  | {
      type: 'operate_bell';
      playerId: string;
      propId: string;
      subAction: 'ring' | 'reset';
    }
  | {
      type: 'operate_deck';
      playerId: string;
      propId: string;
      subAction:
        | 'draw'
        | 'deal_all'
        | 'play_hand'
        | 'discard_table'
        | 'shuffle'
        | 'load_cards'
        | 'add_card'
        | 'remove_card';
      cardId?: string;
      isPublic?: boolean;
      cards?: SandboxCard[];
      card?: SandboxCard;
      title?: string;
    }
  | {
      type: 'operate_timer';
      playerId: string;
      propId: string;
      subAction: 'start' | 'pause' | 'reset' | 'set_duration' | 'tick';
      seconds?: number;
    }
  | {
      type: 'operate_coin';
      playerId: string;
      propId: string;
      subAction: 'flip';
    }
  | {
      type: 'operate_wheel';
      playerId: string;
      propId: string;
      subAction: 'spin' | 'set_segments';
      segments?: Array<{ label: string; color?: string }>;
      targetAngle?: number;
      result?: string;
    }
  | {
      type: 'operate_scoreboard';
      playerId: string;
      propId: string;
      subAction: 'modify_score' | 'reset_scores' | 'set_currency';
      targetPlayerId?: string;
      delta?: number;
      initialScore?: number;
      currencyName?: string;
    }
  | {
      type: 'ai_setup_table';
      playerId: string;
      prompt: string;
      reply: string;
      newProps?: SandboxProp[];
      replaceDeckCards?: { deckId?: string; title: string; cards: SandboxCard[] };
    }
  | {
      type: 'reset_table';
      playerId: string;
    }
  | {
      type: 'player_forfeited';
      playerIds: string[];
    };

export type PartySandboxEvent =
  | { type: 'prop_spawned'; propId: string; kind: string }
  | { type: 'prop_removed'; propId: string }
  | { type: 'prop_operated'; propId: string; subAction: string; playerId: string }
  | { type: 'table_reset'; playerId: string };

export interface PartySandboxReduceResult {
  ok: boolean;
  nextState?: PartySandboxState;
  events?: PartySandboxEvent[];
  effects?: GameEffect[];
  error?: string;
}

export interface PartySandboxPlayerView {
  schemaVersion: 1;
  phase: 'sandbox';
  players: string[];
  config: ResolvedPartySandboxConfig;
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

export interface PartySandboxPublicView {
  schemaVersion: 1;
  phase: 'sandbox';
  players: string[];
  config: ResolvedPartySandboxConfig;
  props: Record<string, SandboxProp>;
  propOrder: string[];
  playerHandCounts: Record<string, number>;
  activityLogs: ActivityLogItem[];
  assistantMessage: {
    text: string;
    timestamp: number;
    prompt?: string;
  } | null;
}
