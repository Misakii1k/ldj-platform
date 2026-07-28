/**
 * 机器人驱动器（测试用陪练与 AI 玩家）。
 *
 * 纯函数 reduce 不能主动通知"轮到你了"，所以每次对局状态变化之后，
 * 由这里检查一遍：有没有机器人此刻该动？有就投递动作。
 *
 * 四条硬约束：
 * 1. 每个动作独立入队（executeInternal），绝不在别人的事务里递归调用 reduce。
 *    否则狼人杀夜晚多个机器人连续行动会让单个事务无限膨胀。
 * 2. 每一轮只投递一个动作，投完重新读状态再决定下一个。机器人的动作会改变
 *    别的机器人该做什么（比如狼人杀完成击杀后女巫才知道要不要救）。
 * 3. LLM 调用必须在事务之外。executeInternal 的 handler 是同步的，
 *    而问模型要等好几秒——所以先在事务外拿到"选哪个动作"，
 *    再进事务落库，落库前重新校验状态没变。
 * 4. 有步数上限。策略写错导致"投了动作但状态没推进"时，必须能停下来报错，
 *    而不是把房间队列占满。
 */
import type { Actor, BotPromptContext } from '@ldj/shared';
import type { Logger } from '../../boot/logger.ts';
import type { Db } from '../../persistence/db.ts';
import type { RoomCommandExecutor, TxContext } from '../executor.ts';
import { CommandError } from '../executor.ts';
import { createSeededRandom } from '@ldj/shared';
import { listBotMembers, type BotMemberRow } from '../commands/bots.ts';
import { getGameModule, type ErasedGameModule } from './registry.ts';
import { applySessionAction, getActiveSession, type GameActionOutcome } from './session.ts';
import type { LlmClient } from './llmClient.ts';

/**
 * 单次触发内最多连续投递多少个机器人动作。
 * 一局狼人杀最长的连续机器人链约为：夜晚 3 狼 + 预言家 + 女巫两步 + 白天全员发言 12 +
 * 全员投票 12，取 64 足够宽裕，又能在策略写死循环时及时刹车。
 */
const MAX_BOT_STEPS_PER_TRIGGER = 64;

/** 机器人思考延迟：让真人看得清发生了什么，也避免瞬间打完一整局 */
const BOT_THINK_DELAY_MS = 700;

export interface BotRunnerDeps {
  db: Db;
  executor: RoomCommandExecutor;
  logger: Logger;
  /** 一个机器人动作落库后的对外同步（接 WsGateway.applyGameOutcome） */
  onOutcome: (roomId: string, outcome: GameActionOutcome) => void;
  /** 大模型客户端；未配置时 llm 机器人自动退化为规则策略 */
  llm?: LlmClient | null;
  /** 每步之间的延迟；测试传 0 以同步跑完 */
  thinkDelayMs?: number;
}

/** 事务外读到的一份状态切片，用来在事务外做决策 */
interface SessionPeek {
  sessionId: string;
  lastSeq: number;
  moduleId: string;
  module: ErasedGameModule;
  state: unknown;
}

/** 事务外决出的一个待投递动作 */
interface PlannedAction {
  botId: string;
  action: unknown;
  /** 决策来源，只用于日志 */
  via: 'rule' | 'llm';
}

/** 事务外读一眼当前对局；返回 null 表示没有可推进的对局 */
function peekSession(db: Db, roomId: string): SessionPeek | null {
  const session = getActiveSession(db, roomId);
  if (!session || session.status !== 'ACTIVE') return null;
  const module = getGameModule(session.module_id);
  if (!module?.pickBotAction) return null;
  return {
    sessionId: session.id,
    lastSeq: session.last_seq,
    moduleId: session.module_id,
    module,
    state: JSON.parse(session.snapshot_json),
  };
}

/**
 * 事务外为一批机器人决出下一个动作。
 *
 * 决策用的随机源与对局 RNG 分开：机器人的选择不消耗对局随机游标，
 * 否则同一局的发牌结果会随机器人行为漂移，破坏可重放性。
 *
 * llm 机器人先问模型；模型不可用、超时或返回垃圾时回落规则策略——
 * 一次 API 抖动不该把整局卡死。
 */
async function planNextAction(
  peek: SessionPeek,
  bots: readonly BotMemberRow[],
  deps: BotRunnerDeps,
  roomId: string,
): Promise<PlannedAction | null> {
  const { logger, llm } = deps;
  const { module } = peek;

  for (const bot of bots) {
    const random = createSeededRandom(`bot:${peek.sessionId}:${peek.lastSeq}:${bot.playerId}`);
    const view = module.getPlayerView(peek.state, bot.playerId);
    const input = { view, playerId: bot.playerId, random };

    // —— LLM 决策：拿候选项问模型，只接受它回的 id ——
    if (bot.kind === 'llm' && llm && module.buildBotPrompt) {
      let prompt: BotPromptContext<unknown> | null = null;
      try {
        prompt = module.buildBotPrompt(input);
      } catch (err) {
        logger.error('bot_prompt_threw', {
          roomId,
          botId: bot.playerId,
          moduleId: peek.moduleId,
          message: (err as Error).message,
        });
      }
      // prompt 为 null 表示此刻不该它动，继续问下一个机器人
      if (prompt === null) continue;
      if (prompt.options.length > 0) {
        const decision = await llm.decide(prompt, {
          roomId,
          botId: bot.playerId,
          moduleId: peek.moduleId,
        });
        if (decision) {
          return { botId: bot.playerId, action: decision.option.action, via: 'llm' };
        }
        // 模型没给出可用选择：落到规则策略，别让它干等
        logger.info('bot_llm_fallback', { roomId, botId: bot.playerId, moduleId: peek.moduleId });
      }
    }

    // —— 规则策略：rule 机器人的正途，也是 llm 机器人的兜底 ——
    let action: unknown;
    try {
      action = module.pickBotAction!(input);
    } catch (err) {
      logger.error('bot_strategy_threw', {
        roomId,
        botId: bot.playerId,
        moduleId: peek.moduleId,
        message: (err as Error).message,
      });
      continue;
    }
    if (action === null || action === undefined) continue;
    return { botId: bot.playerId, action, via: 'rule' };
  }
  return null;
}

/**
 * 在事务内落库一个已决出的动作。
 *
 * 决策发生在事务外，期间真人可能已经动过——所以这里用 last_seq 复核：
 * 状态变了就放弃这一步，返回 null 让外层重新读状态再决策。
 */
function commitAction(
  roomId: string,
  planned: PlannedAction,
  expectedSeq: number,
  logger: Logger,
): (tx: TxContext) => GameActionOutcome | null {
  return (tx) => {
    const session = getActiveSession(tx.db, roomId);
    if (!session || session.status !== 'ACTIVE') return null;
    if (session.last_seq !== expectedSeq) {
      // 决策期间局势已变，这个动作可能已经不合法了，重新来
      logger.debug('bot_plan_stale', {
        roomId,
        botId: planned.botId,
        expectedSeq,
        actualSeq: session.last_seq,
      });
      return null;
    }

    try {
      const actor: Actor = { kind: 'player', playerId: planned.botId };
      return applySessionAction(tx, session, actor, planned.action, null);
    } catch (err) {
      // 策略给了个不合法的动作：记下来，让外层继续往下走。
      // 不抛出——一个笨机器人不该让整个房间的队列崩掉。
      if (err instanceof CommandError) {
        logger.warn('bot_action_rejected', {
          roomId,
          botId: planned.botId,
          via: planned.via,
          action: JSON.stringify(planned.action),
          message: err.message,
        });
        return null;
      }
      throw err;
    }
  };
}

export class BotRunner {
  readonly #deps: BotRunnerDeps;
  /** 正在驱动的房间：避免同一房间并发触发导致动作交错 */
  readonly #running = new Set<string>();
  #stopped = false;

  constructor(deps: BotRunnerDeps) {
    this.#deps = deps;
  }

  stop(): void {
    this.#stopped = true;
  }

  /**
   * 房间对局状态变化后触发一次机器人推进。
   * 同一房间已在推进时直接返回：正在跑的那次循环会读到最新状态，不会漏。
   */
  trigger(roomId: string): void {
    if (this.#stopped) return;
    if (this.#running.has(roomId)) return;
    if (listBotMembers(this.#deps.db, roomId).length === 0) return;
    this.#running.add(roomId);
    void this.#drive(roomId).finally(() => {
      this.#running.delete(roomId);
    });
  }

  /** 供测试使用：跑完当前这一轮驱动再返回 */
  async triggerAndWait(roomId: string): Promise<void> {
    if (this.#stopped) return;
    if (this.#running.has(roomId)) return;
    if (listBotMembers(this.#deps.db, roomId).length === 0) return;
    this.#running.add(roomId);
    try {
      await this.#drive(roomId);
    } finally {
      this.#running.delete(roomId);
    }
  }

  async #drive(roomId: string): Promise<void> {
    const { db, executor, logger, onOutcome } = this.#deps;
    const delay = this.#deps.thinkDelayMs ?? BOT_THINK_DELAY_MS;

    for (let step = 0; step < MAX_BOT_STEPS_PER_TRIGGER; step++) {
      if (this.#stopped) return;

      // 每步重新读机器人名单：房主可能在对局中把机器人踢了
      const bots = listBotMembers(db, roomId);
      if (bots.length === 0) return;

      const peek = peekSession(db, roomId);
      if (!peek) return;

      let planned: PlannedAction | null;
      try {
        planned = await planNextAction(peek, bots, this.#deps, roomId);
      } catch (err) {
        logger.error('bot_plan_failed', { roomId, message: (err as Error).message });
        return;
      }
      // 没有机器人该动了：正常收束
      if (!planned) return;
      if (this.#stopped) return;

      let result: { roomSeq: number; outcome: GameActionOutcome } | null;
      try {
        result = await executor.executeInternal({
          roomId,
          handler: commitAction(roomId, planned, peek.lastSeq, logger),
        });
      } catch (err) {
        logger.error('bot_step_failed', { roomId, message: (err as Error).message });
        return;
      }

      // 动作没落库（状态已变 / 被规则拒绝）：重新读状态再试，不算一次有效推进
      if (!result) continue;

      try {
        onOutcome(roomId, result.outcome);
      } catch (err) {
        logger.error('bot_outcome_broadcast_failed', { roomId, message: (err as Error).message });
      }

      // 对局结束，不必再推
      if (result.outcome.finished || result.outcome.aborted) return;

      if (delay > 0) {
        await new Promise<void>((resolvePromise) => {
          const timer = setTimeout(resolvePromise, delay);
          timer.unref?.();
        });
      }
    }

    // 走到上限说明策略在原地打转：留证据，别静默
    this.#deps.logger.warn('bot_steps_exhausted', { roomId, limit: MAX_BOT_STEPS_PER_TRIGGER });
  }
}
