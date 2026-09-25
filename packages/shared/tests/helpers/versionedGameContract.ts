/**
 * D3 Task 10：版本化模块通用契约校验器。
 * 由 UNO/卧底 contract 测试复用；全部为纯断言，不产生写入。
 * D4-TOOLS：扩展为完整契约套件——
 * identity/initial/pure/被拒动作不推进/同种子确定性/视角 Schema/无秘密泄漏/
 * 结果 only-once/快照可重放/机器人合法候选。
 */
import { createSeededRandom } from '../../src/game/random.ts';
import type { Actor, GameContext } from '../../src/game/contract.ts';
import type { AnyGameModuleV2 } from '../../src/game/versionedContract.ts';

/** 可重放的动作步：actor + 待解析动作 */
export interface ReplayStep {
  /** Captured server clock for time-authoritative games; old fixtures retain 1s increments. */
  now?: number;
  actor: Actor;
  action: unknown;
}

export interface NoSecretLeakOptions {
  /** (owner, other) 返回 true 时允许 owner 的秘密出现在 other 的视角（如同阵营共词） */
  allowedLeakPairs?: (owner: string, other: string) => boolean;
  /** (secret, owner, other) 返回 true 时允许该特定值出现在 other / 观战视角（如公开阶段名碰巧与角色名重合） */
  allowedLeakValues?: (secret: unknown, owner: string, other: string | 'spectator') => boolean;
  /** 终局揭示判定：为 true 时允许秘密出现在观战视角（如终局 reveal） */
  isRevealed?: (state: unknown) => boolean;
}

export interface VersionedContractAssertions {
  /** 身份必须是 engineContractVersion 2 + 非空 ruleset + 正 viewVersion */
  identity(module: AnyGameModuleV2): void;
  /** 初始状态确定且通过 state schema/invariants；parsePlayer/SpectatorView 可解析 */
  initial(module: AnyGameModuleV2, ctx: GameContext, players: string[], config: unknown): void;
  /** reduce 纯函数：不修改传入状态；同一输入两次产出一致 */
  pure(module: AnyGameModuleV2, ctx: GameContext, state: unknown, actor: unknown, action: unknown): void;
  /** 被拒动作不推进：reduce 返回 ok:false，且不改输入状态、两次结果一致 */
  rejectedDoesNotAdvance(module: AnyGameModuleV2, ctx: GameContext, state: unknown, actor: unknown, action: unknown): void;
  /** 同种子确定性：两份独立同种子 ctx 对同一输入产出字节一致 */
  deterministic(module: AnyGameModuleV2, ctx: GameContext, state: unknown, actor: unknown, action: unknown): void;
  /** 视角 Schema：逐玩家 + 观战视角可 parse、round-trip 稳定、me.playerId 与请求者一致 */
  viewSchemas(module: AnyGameModuleV2, state: unknown, playerIds: readonly string[]): void;
  /** 无秘密泄漏：某玩家秘密不得出现在其他玩家或观战视角（除非 allowedLeakPairs / 终局揭示） */
  noSecretLeak(
    module: AnyGameModuleV2,
    state: unknown,
    playerIds: readonly string[],
    getSecrets: (state: unknown, playerId: string) => unknown[],
    options?: NoSecretLeakOptions,
  ): void;
  /** 结果 only-once：沿动作序列推进，结果候选恰好一次从空变为非空，且后续一致 */
  resultOnlyOnce(
    module: AnyGameModuleV2,
    seed: string,
    players: readonly string[],
    config: unknown,
    actions: readonly ReplayStep[],
  ): void;
  /** 快照可重放：同一 seed 重放两次，状态序列字节一致，末态过 parse/invariants */
  snapshotReplayable(
    module: AnyGameModuleV2,
    seed: string,
    players: readonly string[],
    config: unknown,
    actions: readonly ReplayStep[],
  ): void;
  /** 机器人合法候选：pickBotAction 返回的动作必须被同一状态上的 reduce 接受 */
  botLegalCandidates(module: AnyGameModuleV2, ctx: GameContext, state: unknown, playerIds: readonly string[], seed?: string): void;
}

/** 判断 value 是否作为某个子树 deep-equal 出现在 root 中 */
function containsValue(root: unknown, value: unknown): boolean {
  if (JSON.stringify(root) === JSON.stringify(value)) return true;
  if (Array.isArray(root)) return root.some((entry) => containsValue(entry, value));
  if (root !== null && typeof root === 'object') {
    return Object.values(root as Record<string, unknown>).some((entry) => containsValue(entry, value));
  }
  return false;
}

interface ReplayOutcome {
  states: unknown[];
  resultCandidates: (unknown | null)[];
}

/**
 * 用单一连续随机流重放：createInitialState 与各 reduce 共用同一 seed 的 ctx，
 * 保证随机消费顺序与原轨迹一致（快照可重放的前提）。
 */
function replayWithSeed(
  module: AnyGameModuleV2,
  seed: string,
  players: readonly string[],
  config: unknown,
  actions: readonly ReplayStep[],
): ReplayOutcome {
  const random = createSeededRandom(seed);
  const ctx: GameContext = { now: 1_700_000_000_000, random };
  const states: unknown[] = [];
  const resultCandidates: (unknown | null)[] = [];
  let state = module.createInitialState(ctx, [...players], module.parseConfig(config));
  states.push(structuredClone(state));
  resultCandidates.push(null);
  for (const step of actions) {
    ctx.now = step.now ?? ctx.now + 1_000;
    const reduced = module.reduce(ctx, structuredClone(state), step.actor as never, step.action as never);
    if (!reduced.ok) {
      throw new Error(`快照重放动作被拒: actor=${JSON.stringify(step.actor)} action=${JSON.stringify(step.action)}`);
    }
    state = reduced.nextState;
    states.push(structuredClone(state));
    resultCandidates.push(reduced.resultCandidate ?? null);
  }
  return { states, resultCandidates };
}

export const versionedContractAssertions: VersionedContractAssertions = {
  identity(module) {
    if (module.identity.engineContractVersion !== 2) {
      throw new Error('engineContractVersion 必须为 2');
    }
    if (module.identity.rulesetId.length === 0) {
      throw new Error('rulesetId 不得为空');
    }
    if (!Number.isSafeInteger(module.identity.viewVersion) || module.identity.viewVersion < 1) {
      throw new Error('viewVersion 必须是正整数');
    }
  },

  initial(module, ctx, players, config) {
    const state = module.createInitialState(ctx, [...players], module.parseConfig(config));
    module.parseState(state);
    module.assertInvariants(state);
    for (const playerId of players) {
      module.parsePlayerView(module.getPlayerView(state, playerId));
    }
    module.parseSpectatorView(module.getSpectatorView(state));
  },

  pure(module, ctx, state, actor, action) {
    const frozen = structuredClone(state);
    const first = module.reduce(ctx, structuredClone(state), actor as never, action as never);
    const second = module.reduce(ctx, structuredClone(state), actor as never, action as never);
    if (JSON.stringify(state) !== JSON.stringify(frozen)) {
      throw new Error('reduce 修改了传入状态');
    }
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error('reduce 对同一输入产出不一致');
    }
  },

  rejectedDoesNotAdvance(module, ctx, state, actor, action) {
    const frozen = structuredClone(state);
    const first = module.reduce(ctx, structuredClone(state), actor as never, action as never);
    if (first.ok) throw new Error('rejectedDoesNotAdvance 期望动作被拒绝，但 reduce 返回 ok');
    const second = module.reduce(ctx, structuredClone(state), actor as never, action as never);
    if (JSON.stringify(state) !== JSON.stringify(frozen)) {
      throw new Error('被拒动作修改了传入状态');
    }
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error('被拒动作两次结果不一致');
    }
  },

  deterministic(module, ctx, state, actor, action) {
    const ctxA: GameContext = { now: ctx.now, random: createSeededRandom('d4-determinism-a') };
    const ctxB: GameContext = { now: ctx.now, random: createSeededRandom('d4-determinism-a') };
    const first = module.reduce(ctxA, structuredClone(state), actor as never, action as never);
    const second = module.reduce(ctxB, structuredClone(state), actor as never, action as never);
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error('同种子 reduce 产出不一致');
    }
  },

  viewSchemas(module, state, playerIds) {
    for (const playerId of playerIds) {
      const view = module.getPlayerView(state, playerId);
      const parsed = module.parsePlayerView(view);
      if (JSON.stringify(parsed) !== JSON.stringify(view)) {
        throw new Error(`玩家视角 ${playerId} round-trip 不一致`);
      }
      const me = (view as { me?: unknown }).me as { playerId?: unknown } | null | undefined;
      if (me !== null && me !== undefined && typeof me === 'object') {
        if (me.playerId !== playerId) {
          throw new Error(`玩家视角 ${playerId} 的 me.playerId 与请求者不一致`);
        }
      }
    }
    const spectator = module.getSpectatorView(state);
    const parsedSpectator = module.parseSpectatorView(spectator);
    if (JSON.stringify(parsedSpectator) !== JSON.stringify(spectator)) {
      throw new Error('观战视角 round-trip 不一致');
    }
  },

  noSecretLeak(module, state, playerIds, getSecrets, options = {}) {
    const { allowedLeakPairs = () => false, isRevealed = () => false } = options;
    const views = new Map<string, unknown>();
    for (const playerId of playerIds) views.set(playerId, module.getPlayerView(state, playerId));
    const spectator = module.getSpectatorView(state);
    for (const owner of playerIds) {
      const ownView = views.get(owner)!;
      for (const secret of getSecrets(state, owner)) {
        if (!containsValue(ownView, secret)) {
          throw new Error(`${owner} 的秘密未出现在自己的视角`);
        }
        for (const other of playerIds) {
          if (other === owner) continue;
          if (allowedLeakPairs(owner, other)) continue;
          if (options.allowedLeakValues?.(secret, owner, other)) continue;
          if (containsValue(views.get(other), secret)) {
            throw new Error(`${owner} 的秘密泄漏到 ${other} 的视角`);
          }
        }
        if (!isRevealed(state) && !options.allowedLeakValues?.(secret, owner, 'spectator') && containsValue(spectator, secret)) {
          throw new Error(`${owner} 的秘密泄漏到观战视角`);
        }
      }
    }
  },

  resultOnlyOnce(module, seed, players, config, actions) {
    const { resultCandidates } = replayWithSeed(module, seed, players, config, actions);
    let produced = false;
    let seenResult: unknown = null;
    for (const candidate of resultCandidates) {
      if (candidate !== null) {
        if (!produced) {
          produced = true;
          seenResult = candidate;
        } else if (JSON.stringify(seenResult) !== JSON.stringify(candidate)) {
          throw new Error('结果 only-once 违反：多次产出不同结果');
        }
      }
    }
    if (!produced) throw new Error('resultOnlyOnce 未产出正式结果');
  },

  snapshotReplayable(module, seed, players, config, actions) {
    const first = replayWithSeed(module, seed, players, config, actions).states;
    const second = replayWithSeed(module, seed, players, config, actions).states;
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error('快照重放两次不一致');
    }
    const finalState = first[first.length - 1]!;
    module.parseState(finalState);
    module.assertInvariants(finalState);
  },

  botLegalCandidates(module, ctx, state, playerIds, seed = 'd4-bot-legality') {
    if (!module.pickBotAction) return;
    for (const playerId of playerIds) {
      const view = module.getPlayerView(state, playerId);
      const random = createSeededRandom(`${seed}:${playerId}`);
      const action = module.pickBotAction({ view, playerId, random });
      if (action === null || action === undefined) continue;
      const parsed = module.parseAction(action);
      const reduced = module.reduce(
        ctx,
        structuredClone(state),
        { kind: 'player', playerId },
        parsed,
      );
      if (!reduced.ok) {
        throw new Error(`机器人动作被 reducer 拒绝: player=${playerId} action=${JSON.stringify(parsed)} ${reduced.message}`);
      }
    }
  },
};

/** 用固定种子构造一个确定性上下文（供 contract 测试统一使用） */
export function deterministicContext(seed = 'd3-contract'): GameContext {
  const random = createSeededRandom(seed);
  return { now: 1_700_000_000_000, random };
}
