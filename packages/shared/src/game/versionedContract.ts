/**
 * 版本化游戏模块契约（共享引擎设计 D3）。
 *
 * 与 legacy GameModule 并行存在：只有明确声明 engineContractVersion: 2 的模块
 * 才走新执行链，尚未迁移的模块继续使用旧契约。
 */
import type { BotDecisionInput, BotPromptContext } from './bot.ts';
import type {
  Actor,
  GameContext,
  GameEffect,
  GameManifest,
  ReduceResult,
} from './contract.ts';
import type { StandardTabletopViewV1 } from './tabletop/contract.ts';

export const ENGINE_CONTRACT_VERSION = 2 as const;

export interface VersionedGameIdentity {
  readonly engineContractVersion: typeof ENGINE_CONTRACT_VERSION;
  readonly rulesetId: string;
  readonly viewVersion: number;
}

export interface PrivateGameEvent<E = unknown> {
  readonly recipients: readonly string[];
  readonly event: E;
}

export type VersionedReduceResult<S, E, R> =
  | { readonly ok: false; readonly code: string; readonly message: string }
  | {
      readonly ok: true;
      readonly nextState: S;
      readonly publicEvents: readonly E[];
      readonly privateEvents: readonly PrivateGameEvent[];
      readonly effects: readonly GameEffect[];
      readonly resultCandidate: R | null;
      /** 仅供服务端开发与测试记录；不得进入玩家或观战视角。 */
      readonly diagnostics?: unknown;
    };

export type SnapshotMigration = (snapshot: unknown) => unknown;

/** key 为来源 schema 版本；函数必须只迁移到相邻的 fromVersion + 1。 */
export type SnapshotMigrationRegistry = Readonly<Record<number, SnapshotMigration>>;

/**
 * D4-T：标准桌面投影（可选）。
 * 模块从权威状态白名单生成标准桌面视角，并为公开事件生成有界 public log 摘要。
 * 平台只把 public event journal 交给投影器，绝不交 private event。
 * 未实现时该规则集不声明桌面契约，沿用 legacy 渲染路径。
 */
export interface TabletopProjection<S> {
  getPlayerTabletopView(state: S, playerId: string): StandardTabletopViewV1;
  getSpectatorTabletopView(state: S): StandardTabletopViewV1;
  /** 把一条公开事件映射为 log 摘要；返回 null 表示该事件不进入公开 log。 */
  summarizePublicEvent?(event: unknown, state: S): StandardTabletopViewV1['publicLog']['entries'][number] | null;
}

export interface GameModuleV2<C, S, A, PV, SV, E, R> {
  readonly manifest: GameManifest;
  readonly identity: VersionedGameIdentity;
  /** 该模块声明支持的规则集 ID（含兼容基线），用于开局时归一化 config.rulesetId。 */
  readonly registeredRulesets: readonly string[];
  /** 该游戏目录中的默认规则集 ID。 */
  readonly defaultRulesetId: string;
  parseConfig(input: unknown): C;
  parseAction(input: unknown): A;
  parseState(input: unknown): S;
  parsePlayerView(input: unknown): PV;
  parseSpectatorView(input: unknown): SV;
  assertInvariants(state: S): void;
  readonly snapshotMigrations: SnapshotMigrationRegistry;
  createInitialState(ctx: GameContext, players: string[], config: C): S;
  reduce(
    ctx: GameContext,
    state: S,
    actor: Actor,
    action: A,
  ): VersionedReduceResult<S, E, R>;
  getPlayerView(state: S, playerId: string): PV;
  getSpectatorView(state: S): SV;
  /** D4-T：可选标准桌面投影；未实现时不声明桌面契约。 */
  tabletopProjection?: TabletopProjection<S>;
  pickBotAction?(input: BotDecisionInput<PV>): A | null;
  buildBotPrompt?(input: BotDecisionInput<PV>): BotPromptContext<A> | null;
}

export type AnyGameModuleV2 = GameModuleV2<
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown
>;

export function isVersionedGameModule(value: unknown): value is AnyGameModuleV2 {
  if (typeof value !== 'object' || value === null) return false;
  const identity = (value as { identity?: unknown }).identity;
  if (typeof identity !== 'object' || identity === null) return false;
  const candidate = identity as Partial<VersionedGameIdentity>;
  return candidate.engineContractVersion === ENGINE_CONTRACT_VERSION
    && typeof candidate.rulesetId === 'string'
    && candidate.rulesetId.length > 0
    && Number.isSafeInteger(candidate.viewVersion)
    && (candidate.viewVersion ?? 0) > 0;
}

/**
 * 验证私有事件的接收者边界。模块成功返回后、任何持久化或广播前调用。
 */
export function assertPrivateGameEvents(
  events: readonly PrivateGameEvent[],
  playerIds: readonly string[],
): void {
  const players = new Set(playerIds);
  for (const entry of events) {
    if (entry.recipients.length === 0) {
      throw new Error('私有事件必须至少声明一名接收者');
    }
    const recipients = new Set<string>();
    for (const recipient of entry.recipients) {
      if (recipients.has(recipient)) {
        throw new Error(`私有事件包含重复接收者：${recipient}`);
      }
      if (!players.has(recipient)) {
        throw new Error(`私有事件包含未知接收者：${recipient}`);
      }
      recipients.add(recipient);
    }
  }
}

export function normalizeLegacyReduceResult<S, E, R>(
  result: ReduceResult<S, E>,
  options: {
    readonly resultCandidate?: R | null;
    readonly diagnostics?: unknown;
  } = {},
): VersionedReduceResult<S, E, R> {
  if (!result.ok) return result;
  return {
    ok: true,
    nextState: result.state,
    publicEvents: result.events,
    privateEvents: [],
    effects: result.effects,
    resultCandidate: options.resultCandidate ?? null,
    ...(options.diagnostics === undefined
      ? {}
      : { diagnostics: options.diagnostics }),
  };
}

/**
 * D4-A1：外部裁判任务 effect。
 * reduce 只声明任务参数与资格/输入摘要，绝不发起网络或写库；
 * 平台在房间事务提交后（post-commit）把任务落库到 adjudication_tasks。
 */
export interface AdjudicationTaskEffect {
  readonly type: 'enqueue_adjudication';
  readonly taskId: string;
  readonly sessionId: string;
  readonly rulesetId: string;
  readonly taskType: string;
  /** 提交该任务的动作在事件流水中的序号（结果回灌时的期望序号） */
  readonly submittedAtSeq: number;
  readonly eligibilityDigest: string;
  readonly inputDigest: string;
  readonly inputPlaintextJson: string | null;
}

export function isAdjudicationTaskEffect(value: unknown): value is AdjudicationTaskEffect {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return e.type === 'enqueue_adjudication'
    && typeof e.taskId === 'string'
    && typeof e.sessionId === 'string'
    && typeof e.rulesetId === 'string'
    && typeof e.taskType === 'string'
    && Number.isSafeInteger(e.submittedAtSeq)
    && typeof e.eligibilityDigest === 'string'
    && typeof e.inputDigest === 'string';
}

/**
 * D4-A1：外部裁判结果系统动作。
 * 结果以 system 动作经房间串行事务链重新进入，由游戏模块 reducer 应用；
 * 平台层 exactly-once 由 adjudication_tasks 行状态保证（done/discarded 后丢弃）。
 */
export interface ExternalTaskResultAction {
  readonly type: 'external_task_result';
  readonly taskId: string;
  /** 任务提交时的 submittedAtSeq；reducer 校验防止乱序/迟到结果覆盖 */
  readonly expectedSequence: number;
  readonly result: unknown;
}
