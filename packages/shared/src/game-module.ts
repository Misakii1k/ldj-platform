import type { PlayerId } from './ids.js';

export type Actor =
  | { kind: 'player'; playerId: PlayerId }
  | { kind: 'system'; source: 'timer' | 'recovery' | 'admin' };

export interface GameManifest {
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly stateSchemaVersion: number;
}

export type GameEffect =
  | { type: 'schedule_timer'; timerId: string; deadlineAt: number; action: unknown }
  | { type: 'cancel_timer'; timerId: string }
  | { type: 'system_message'; text: string };

export type ReduceResult<S, E> =
  | { ok: false; code: string; message: string }
  | { ok: true; state: S; events: E[]; effects: GameEffect[] };

export interface RandomSource {
  nextInt(minInclusive: number, maxExclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

export interface GameContext {
  readonly now: number;
  readonly random: RandomSource;
}

export interface GameModule<C, S, A, PV, SV, E, R> {
  readonly manifest: GameManifest;
  parseConfig(input: unknown): C;
  parseAction(input: unknown): A;
  createInitialState(ctx: GameContext, players: PlayerId[], config: C): S;
  reduce(ctx: GameContext, state: S, actor: Actor, action: A): ReduceResult<S, E>;
  getPlayerView(state: S, playerId: PlayerId): PV;
  getSpectatorView(state: S): SV;
  getResult(state: S): R | null;
  migrateSnapshot?(fromVersion: number, snapshot: unknown): S;
}
