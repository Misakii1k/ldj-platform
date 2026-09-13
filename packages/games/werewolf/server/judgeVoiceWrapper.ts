/**
 * 法官语音包装器：给狼人杀（legacy 与 open-kill v2 两套模块）叠加"夜晚语音最短时限"。
 *
 * 需求：夜晚法官语音必须完整播放——哪怕玩家很快点完、哪怕对应神职已阵亡；
 * 每段播完后有间隔（客户端随机 2-5s）；未阵亡角色以玩家正常操作完成为准。
 *
 * 实现：不缓冲、不改任何游戏语义，只在【进入夜晚】的那次提交里，把夜晚的
 * phase_timeout 时限补齐到"语音脚本总长"（取 max(节奏时限, 脚本总长)）。
 * 这样快速/标准节奏下，夜晚不会在语音播完前被超时强制收尾，慢节奏保持原样。
 * 语音文件与播放排程全部由客户端本地负责（见 client werewolf/ui/judgeVoice.ts）：
 * 即使全部玩家秒操作导致夜晚提前结算，客户端也会把整段脚本播完，
 * 白天播报（死亡/投票/出局）自动排在脚本之后，保持法官的主持节奏。
 *
 * 时长表来自 assets 实测（packages/client/public/werewolf-voice）。
 */
import type { GameContext, GameEffect, GameModule, GameModuleV2 } from '@ldj/shared';

/** 夜晚固定脚本各段时长（ms），与客户端 CUE_FILES 顺序一一对应。 */
const NIGHT_CUE_DURATIONS_MS: readonly number[] = [
  1700, // 天黑请闭眼
  4500, // 狼人请睁眼确认队友
  2000, // 狼人请杀人
  1500, // 狼人请闭眼
  1280, // 女巫请睁眼
  4500, // 女巫请选择毒杀目标
  1500, // 女巫请闭眼
  1780, // 预言家请睁眼
  2700, // 预言家请选择查验玩家
  1880, // 预言家请闭眼
  3080, // 守卫请睁眼守护谁
  1500, // 守卫请闭眼
  2000, // 猎人白痴请睁眼确认身份
  3000, // 确认间隔
  1500, // 猎人白痴请闭眼
];
/** 每段播完后的间隔：取 2-5s 的中值并固定，保证服务端确定性（客户端实际随机 2-5s）。 */
const JUDGE_GAP_MS = 3500;
/** 夜晚最短时限 = 全部语音 + 每段后的间隔（约 85s）。 */
export const JUDGE_NIGHT_HOLD_MS =
  NIGHT_CUE_DURATIONS_MS.reduce((sum, dur) => sum + dur, 0) + NIGHT_CUE_DURATIONS_MS.length * JUDGE_GAP_MS;

/** 白天公告最短时限（天亮了+导语+最多 12 个报号+遗言提示，约 20s）。 */
export const JUDGE_DAY_ANNOUNCEMENT_HOLD_MS = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function innerPhase(inner: unknown): string {
  return isRecord(inner) && typeof inner.phase === 'string' ? inner.phase : '';
}

/**
 * 通用阶段时长保底：进入特定阶段的那次提交，把 state.deadlineAt 与对应阶段的
 * phase_timeout 定时器补齐到 max(原时限, now + holdMs)。
 */
function applyPhaseHold(
  phaseName: string,
  holdMs: number,
  prevInner: unknown,
  nextInner: unknown,
  ctx: GameContext,
  effects: readonly GameEffect[],
): GameEffect[] {
  if (innerPhase(prevInner) === phaseName || innerPhase(nextInner) !== phaseName) return [];
  const minDeadline = ctx.now + holdMs;
  if (!isRecord(nextInner) || typeof nextInner.deadlineAt !== 'number' || nextInner.deadlineAt >= minDeadline) return [];
  const patched = minDeadline;
  nextInner.deadlineAt = patched;
  let patchedEffects = false;
  const next = effects.map((effect) => {
    if (patchedEffects || effect.type !== 'schedule_timer') return effect;
    const action = (effect as { action?: unknown }).action;
    if (!isRecord(action) || action.phase !== phaseName) return effect;
    patchedEffects = true;
    return { ...effect, deadlineAt: patched };
  });
  return patchedEffects ? next : [...effects];
}

/**
 * legacy 模块包装：入参/出参与原模块同形，仅拦截 reduce 的结果做夜晚时限补齐。
 */
export function wrapLegacyWithJudgeVoice<C, S, A, PV, SV, E, R>(
  inner: GameModule<C, S, A, PV, SV, E, R>,
): GameModule<C, S, A, PV, SV, E, R> {
  return {
    ...inner,
    reduce(ctx, state, actor, action) {
      const probe = inner.reduce(ctx, state, actor, action);
      if (!probe.ok) return probe;
      const effects = applyPhaseHold('night', JUDGE_NIGHT_HOLD_MS, state, probe.state, ctx, probe.effects);
      return { ...probe, effects: effects.length > 0 ? effects : probe.effects };
    },
  };
}

/** v2 模块包装：拦截 reduce 结果做夜晚及天亮公告时限保底，其余字段原样透传。 */
export function wrapV2WithJudgeVoice<C, S, A, PV, SV, E, R>(
  inner: GameModuleV2<C, S, A, PV, SV, E, R>,
): GameModuleV2<C, S, A, PV, SV, E, R> {
  return {
    ...inner,
    reduce(ctx, state, actor, action) {
      const probe = inner.reduce(ctx, state, actor, action);
      if (!probe.ok) return probe;
      let effects: readonly GameEffect[] = applyPhaseHold('night', JUDGE_NIGHT_HOLD_MS, state, probe.nextState, ctx, probe.effects);
      if (effects.length === 0) effects = probe.effects;
      const dayEffects = applyPhaseHold('day_announcement', JUDGE_DAY_ANNOUNCEMENT_HOLD_MS, state, probe.nextState, ctx, effects);
      if (dayEffects.length > 0) effects = dayEffects;
      return { ...probe, effects };
    },
  };
}
