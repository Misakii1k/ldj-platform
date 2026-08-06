/**
 * D4-T：标准桌面视角契约（version 1）。
 *
 * 统一桌面只消费标准字段；游戏专属扩展字段继续放在冻结的 inner `view`。
 * 标准字段全部由模块（tabletopProjection）从权威状态白名单生成，
 * 平台绝不把 private event 交给投影器。
 *
 * 契约约束：
 * - phase.code / round.code / capability id / operation kind / result code 都是
 *   每 ruleset 封闭的版本化枚举，未知值按契约错误处理。
 * - publicLog 有界（最多 MAX_PUBLIC_LOG_ENTRIES 条）、服务端白名单构造。
 * - operations 描述已接受的异步任务（queued/processing/error），不用于同步按钮忙碌。
 * - 能力只描述"当前能做什么"，不暴露完整规则状态；客户端按能力启用控件，
 *   服务端仍做权威校验。
 */

export const TABLETOP_VIEW_VERSION = 1 as const;
export const MAX_PUBLIC_LOG_ENTRIES = 50 as const;

export type TabletopTurnMode = 'none' | 'single' | 'simultaneous' | 'system';
export type TabletopParticipation = 'active' | 'eliminated' | 'forfeited';
export type TabletopActivity = 'acting' | 'available' | 'submitted' | 'waiting' | 'none';
export type TabletopClockKind = 'phase' | 'turn' | 'response' | 'result';
export type TabletopOperationState = 'queued' | 'processing' | 'error';
export type TabletopResultState = 'provisional' | 'final' | 'aborted' | 'failed';
export type TabletopLogCategory = 'phase' | 'action' | 'system' | 'result';

export interface TabletopPhase {
  readonly code: string;
  readonly sequence: number;
}

export interface TabletopRound {
  readonly number: number;
  readonly code: string;
}

export interface TabletopTurn {
  readonly mode: TabletopTurnMode;
  readonly actorPlayerIds: readonly string[];
}

export interface TabletopSeat {
  readonly playerId: string;
  readonly seat: number;
  readonly participation: TabletopParticipation;
  readonly activity: TabletopActivity;
}

export interface TabletopClock {
  readonly id: string;
  readonly kind: TabletopClockKind;
  readonly deadlineAt: number;
}

export interface TabletopLogEntry {
  readonly id: string;
  readonly sequence: number;
  readonly occurredAt: number;
  readonly category: TabletopLogCategory;
  readonly summary: string;
  readonly actorPlayerId: string | null;
  readonly subjectPlayerIds: readonly string[];
}

export interface TabletopPublicLog {
  readonly revision: number;
  readonly entries: readonly TabletopLogEntry[];
}

export interface TabletopOperation {
  readonly id: string;
  readonly kind: string;
  readonly state: TabletopOperationState;
  readonly scope: 'table' | 'viewer';
  readonly recoverable: boolean;
  readonly errorCode: string | null;
  readonly retryCapabilityId: string | null;
}

export interface TabletopResult {
  readonly state: TabletopResultState;
  readonly outcomeCode: string;
  readonly summary: string;
}

/** 标准桌面视角 v1。任何游戏声明使用桌面契约时都必须严格通过 parseTabletopView。 */
export interface StandardTabletopViewV1 {
  readonly version: typeof TABLETOP_VIEW_VERSION;
  readonly phase: TabletopPhase;
  readonly round: TabletopRound | null;
  readonly turn: TabletopTurn;
  readonly seats: readonly TabletopSeat[];
  readonly clock: TabletopClock | null;
  readonly availableCapabilityIds: readonly string[];
  readonly publicLog: TabletopPublicLog;
  readonly operations: readonly TabletopOperation[];
  readonly result: TabletopResult | null;
}
