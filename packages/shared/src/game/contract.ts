/**
 * GameModule 契约（SPEC §8.5）。
 * 纯函数边界：createInitialState / reduce / 视角 / 结果函数不得执行 I/O，
 * 不得使用 Date.now()、Math.random()、网络、数据库或全局可变状态；
 * 计时与系统消息一律以 effect 描述，由内核在同一事务中登记或执行。
 */

import type { BotDecisionInput, BotPromptContext } from './bot.ts';

export type Actor =
  | { kind: 'player'; playerId: string }
  | { kind: 'system'; source: 'timer' | 'recovery' | 'admin' };

export interface GameManifest {
  id: string;
  version: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  stateSchemaVersion: number;
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
  /** 由内核注入并写入命令记录的服务端时间 */
  now: number;
  /** 由持久化种子与游标驱动的随机源 */
  random: RandomSource;
}

export interface GameModule<C, S, A, PV, SV, E, R> {
  readonly manifest: GameManifest;
  parseConfig(input: unknown): C;
  parseAction(input: unknown): A;
  createInitialState(ctx: GameContext, players: string[], config: C): S;
  reduce(ctx: GameContext, state: S, actor: Actor, action: A): ReduceResult<S, E>;
  getPlayerView(state: S, playerId: string): PV;
  getSpectatorView(state: S): SV;
  getResult(state: S): R | null;
  migrateSnapshot?(fromVersion: number, snapshot: unknown): S;
  /**
   * 机器人策略（测试用陪练，可选）。同样是纯函数：只读玩家视角，返回动作或 null。
   * 未实现时该游戏不支持机器人，平台拒绝在此游戏的房间里添加。
   */
  pickBotAction?(input: BotDecisionInput<PV>): A | null;
  /**
   * LLM 决策材料（可选）：把玩家视角翻译成自然语言局势 + 候选动作清单。
   * 大模型只从候选项里挑 id，因此不可能产出非法动作。
   * 未实现时该游戏的 LLM 机器人退化为 pickBotAction。
   */
  buildBotPrompt?(input: BotDecisionInput<PV>): BotPromptContext<A> | null;
}
