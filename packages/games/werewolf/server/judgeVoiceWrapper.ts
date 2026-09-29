import { applyPublicSceneVoice, type VoiceState, type VoiceView } from './publicVoice.ts';
/** New games use server timelines and public announcements; legacy snapshots retain their hold fallback. */
import { getVoiceCueDurationMs, type GameContext, type GameEffect, type GameModule, type GameModuleV2 } from '@ldj/shared';

/** Legacy hold durations also come from the shared measured catalog. */
const NIGHT_CUE_DURATIONS_MS: readonly number[] = [
  ...['night_start','wolf_open_first','wolf_kill','wolf_close','witch_open','witch_poison_prompt',
    'witch_close','seer_open','seer_check','seer_close','guard_prompt','guard_close',
    'hunter_idiot_confirm','hunter_idiot_close'].map(getVoiceCueDurationMs),
  3000, // Legacy identity-confirmation action window, not an audio duration.
];
/** 每段播完后的间隔：取 2-5s 的中值并固定，保证服务端确定性（客户端实际随机 2-5s）。 */
const JUDGE_GAP_MS = 3500;
/** 夜晚最短时限 = 全部语音 + 每段后的间隔（约 85s）。 */
export const JUDGE_NIGHT_HOLD_MS =
  NIGHT_CUE_DURATIONS_MS.reduce((sum, dur) => sum + dur, 0) + NIGHT_CUE_DURATIONS_MS.length * JUDGE_GAP_MS;

/** 白天公告最短时限：仅作无语音公告旧局（无时间线 fixture）的兜底；
 *  正常对局由 publicVoice 按实际播报时长动态设定 deadlineAt，播报完即进发言。 */
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
      if (isRecord(state) && isRecord(state.announcement) && state.announcement.source === 'automatic'
        && typeof state.announcement.endsAt === 'number' && ctx.now < state.announcement.endsAt
        && isRecord(action) && ['confirm_announcement','finish_speech','finish_last_words','ready_vote','hunter_shoot'].includes(String(action.type))) {
        return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '请等待当前公开播报结束' };
      }
      let probe = inner.reduce(ctx, state, actor, action);
      if (!probe.ok) return probe;
      if (isRecord(probe.state) && probe.state.timelineState && isRecord(state)) {
        const voiced = applyPublicSceneVoice(state as unknown as VoiceState, probe.state as unknown as VoiceState, inner.getSpectatorView(state) as unknown as VoiceView,
          inner.getSpectatorView(probe.state) as unknown as VoiceView, ctx.now, probe.effects,
          state.phase === 'hunter_shot' && probe.state.phase !== 'hunter_shot' && ((isRecord(action) && action.type === 'hunter_shoot' && action.targetPlayerId === null) || (isRecord(action) && action.type === 'phase_timeout')));
        probe = { ...probe, state: voiced.state as unknown as S, effects: voiced.effects };
      }
      // 权威时间线新流程（timelineState.version === 1）旁路，不叠加旧整夜保底与随机间隔
      if (
        (isRecord(state) && isRecord(state.timelineState) && state.timelineState.version === 1) ||
        (isRecord(probe.state) && isRecord(probe.state.timelineState) && probe.state.timelineState.version === 1)
      ) {
        return probe;
      }
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
      if (isRecord(state) && isRecord(state.announcement) && state.announcement.source === 'automatic'
        && typeof state.announcement.endsAt === 'number' && ctx.now < state.announcement.endsAt
        && isRecord(action) && ['confirm_announcement','finish_speech','finish_last_words','ready_vote','hunter_shoot'].includes(String(action.type))) {
        return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '请等待当前公开播报结束' };
      }
      let probe = inner.reduce(ctx, state, actor, action);
      if (!probe.ok) return probe;
      if (isRecord(probe.nextState) && probe.nextState.timelineState && isRecord(state)) {
        const voiced = applyPublicSceneVoice(state as unknown as VoiceState, probe.nextState as unknown as VoiceState, inner.getSpectatorView(state) as unknown as VoiceView,
          inner.getSpectatorView(probe.nextState) as unknown as VoiceView, ctx.now, probe.effects,
          state.phase === 'hunter_shot' && probe.nextState.phase !== 'hunter_shot' && ((isRecord(action) && action.type === 'hunter_shoot' && action.targetPlayerId === null) || (isRecord(action) && action.type === 'phase_timeout')));
        probe = { ...probe, nextState: voiced.state as unknown as S, effects: voiced.effects };
      }
      // 权威时间线新流程（timelineState.version === 1）旁路，不叠加旧整夜保底与随机间隔
      if (
        (isRecord(state) && isRecord(state.timelineState) && state.timelineState.version === 1) ||
        (isRecord(probe.nextState) && isRecord(probe.nextState.timelineState) && probe.nextState.timelineState.version === 1)
      ) {
        return probe;
      }
      let effects: readonly GameEffect[] = applyPhaseHold('night', JUDGE_NIGHT_HOLD_MS, state, probe.nextState, ctx, probe.effects);
      if (effects.length === 0) effects = probe.effects;
      // 天亮公告：有语音公告时 deadlineAt 已按实际播报时长动态设定，跳过固定保底；
      // 仅无语音公告的旧局（无时间线）保留固定兜底
      const hasVoiceAnnouncement = isRecord(probe.nextState) && isRecord(probe.nextState.announcement)
        && typeof probe.nextState.announcement.endsAt === 'number';
      if (!hasVoiceAnnouncement) {
        const dayEffects = applyPhaseHold('day_announcement', JUDGE_DAY_ANNOUNCEMENT_HOLD_MS, state, probe.nextState, ctx, effects);
        if (dayEffects.length > 0) effects = dayEffects;
      }
      return { ...probe, effects };
    },
  };
}
