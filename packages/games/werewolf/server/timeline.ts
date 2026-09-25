import type {
  WerewolfTimeline,
  WerewolfTimelineRole,
  WerewolfTimelineSegment,
  WerewolfTimelineState,
} from '@ldj/shared';
import { getVoiceCueDurationMs } from '@ldj/shared';

export interface TimelineStep {
  readonly role: WerewolfTimelineRole | null;
  readonly segment: WerewolfTimelineSegment;
  readonly cue: string | null;
  readonly label: string;
  readonly durationMs: number;
  readonly isAction: boolean;
}

export interface ConfiguredRoles {
  readonly witch?: boolean;
  readonly seer?: boolean;
  readonly guard?: boolean;
  readonly hunter?: boolean;
  readonly idiot?: boolean;
}

export type WerewolfPace = 'fast' | 'standard' | 'relaxed';

const PACE_ACTION_DURATIONS: Record<WerewolfPace, { wolf: number; god: number }> = {
  fast: { wolf: 20000, god: 12000 },
  standard: { wolf: 30000, god: 20000 },
  relaxed: { wolf: 45000, god: 30000 },
};

/**
 * Builds the authoritative night timeline plan (Contract C).
 * Sequence: intro → wolf → witch → seer → guard (if configured) → hunter/idiot confirm (day 1 only).
 * Pure function: depends only on input parameters.
 */
export function buildNightPlan(
  roles: ConfiguredRoles,
  day: number,
  pace: WerewolfPace = 'standard',
): readonly TimelineStep[] {
  const durations = PACE_ACTION_DURATIONS[pace] ?? PACE_ACTION_DURATIONS.standard;
  const steps: TimelineStep[] = [];

  // 1. Intro
  const introCue = 'night_start';
  steps.push({
    role: null,
    segment: 'intro',
    cue: introCue,
    label: '天黑请闭眼',
    durationMs: getVoiceCueDurationMs(introCue),
    isAction: false,
  });

  // 2. Wolf (always present in werewolf games)
  const wolfOpenCue = day === 1 ? 'wolf_open_first' : 'wolf_open_normal';
  steps.push({
    role: 'wolf',
    segment: 'open',
    cue: wolfOpenCue,
    label: day === 1 ? '狼人请睁眼确认队友' : '狼人请睁眼选择目标',
    durationMs: getVoiceCueDurationMs(wolfOpenCue),
    isAction: false,
  });
  steps.push({
    role: 'wolf',
    segment: 'action',
    cue: 'wolf_kill',
    label: '狼人请选择袭击目标',
    durationMs: durations.wolf + getVoiceCueDurationMs('wolf_kill'),
    isAction: true,
  });
  steps.push({
    role: 'wolf',
    segment: 'close',
    cue: 'wolf_close',
    label: '狼人请闭眼',
    durationMs: getVoiceCueDurationMs('wolf_close'),
    isAction: false,
  });

  // 3. Witch (if configured, default true)
  if (roles.witch !== false) {
    steps.push({
      role: 'witch',
      segment: 'open',
      cue: 'witch_open',
      label: '女巫请睁眼',
      durationMs: getVoiceCueDurationMs('witch_open'),
      isAction: false,
    });
    steps.push({
      role: 'witch',
      segment: 'action',
      cue: 'witch_cure_prompt',
      label: '女巫请行动',
      durationMs: durations.god + getVoiceCueDurationMs('witch_cure_prompt') + getVoiceCueDurationMs('witch_poison_prompt'),
      isAction: true,
    });
    steps.push({
      role: 'witch',
      segment: 'close',
      cue: 'witch_close',
      label: '女巫请闭眼',
      durationMs: getVoiceCueDurationMs('witch_close'),
      isAction: false,
    });
  }

  // 4. Seer (if configured, default true)
  if (roles.seer !== false) {
    steps.push({
      role: 'seer',
      segment: 'open',
      cue: 'seer_open',
      label: '预言家请睁眼',
      durationMs: getVoiceCueDurationMs('seer_open'),
      isAction: false,
    });
    steps.push({
      role: 'seer',
      segment: 'action',
      cue: 'seer_check',
      label: '预言家请选择查验玩家',
      durationMs: durations.god + getVoiceCueDurationMs('seer_check'),
      isAction: true,
    });
    steps.push({
      role: 'seer',
      segment: 'close',
      cue: 'seer_close',
      label: '预言家请闭眼',
      durationMs: getVoiceCueDurationMs('seer_close'),
      isAction: false,
    });
  }

  // 5. Guard (only if configured)
  if (roles.guard === true) {
    steps.push({
      role: 'guard',
      segment: 'open',
      cue: 'guard_prompt',
      label: '守卫请睁眼，今晚你要守护谁',
      durationMs: getVoiceCueDurationMs('guard_prompt'),
      isAction: false,
    });
    steps.push({
      role: 'guard',
      segment: 'action',
      cue: null,
      label: '守卫请选择守护目标',
      durationMs: durations.god,
      isAction: true,
    });
    steps.push({
      role: 'guard',
      segment: 'close',
      cue: 'guard_close',
      label: '守卫请闭眼',
      durationMs: getVoiceCueDurationMs('guard_close'),
      isAction: false,
    });
  }

  // 6. Hunter / Idiot confirm on Day 1 only
  if (day === 1 && (roles.hunter === true || roles.idiot === true)) {
    if (roles.hunter === true && roles.idiot === true) {
      steps.push({
        role: 'hunter_idiot',
        segment: 'confirm',
        cue: 'hunter_idiot_confirm',
        label: '猎人白痴请睁眼确认身份',
        durationMs: getVoiceCueDurationMs('hunter_idiot_confirm'),
        isAction: false,
      });
      steps.push({
        role: 'hunter_idiot',
        segment: 'close',
        cue: 'hunter_idiot_close',
        label: '猎人白痴请闭眼',
        durationMs: getVoiceCueDurationMs('hunter_idiot_close'),
        isAction: false,
      });
    } else if (roles.hunter === true) {
      steps.push({
        role: 'hunter',
        segment: 'confirm',
        cue: null,
        label: '猎人请睁眼确认身份',
        durationMs: 3000,
        isAction: false,
      });
      steps.push({
        role: 'hunter',
        segment: 'close',
        cue: null,
        label: '猎人请闭眼',
        durationMs: 2000,
        isAction: false,
      });
    } else {
      steps.push({
        role: 'idiot',
        segment: 'confirm',
        cue: null,
        label: '白痴请睁眼确认身份',
        durationMs: 3000,
        isAction: false,
      });
      steps.push({
        role: 'idiot',
        segment: 'close',
        cue: null,
        label: '白痴请闭眼',
        durationMs: 2000,
        isAction: false,
      });
    }
  }

  return steps;
}

function makeTimelineId(day: number, stepIndex: number, revision: number): string {
  return `n${day}-s${stepIndex}-r${revision}`;
}

function makeTimerToken(stepIndex: number, revision: number): string {
  return `tkn-${stepIndex}-${revision}`;
}

/**
 * Creates the initial timeline state for a night plan.
 */
export function createInitialTimelineState(
  plan: readonly TimelineStep[],
  day: number,
  mode: 'manual' | 'auto',
  now: number,
): WerewolfTimelineState {
  const step = plan[0]!;
  const revision = 1;
  const isAuto = mode === 'auto';
  const endsAt = isAuto ? now + step.durationMs : null;
  const actionDeadlineAt = isAuto && step.isAction ? endsAt : null;
  const timerToken = isAuto ? makeTimerToken(0, revision) : null;

  const current: WerewolfTimeline = {
    version: 1,
    id: makeTimelineId(day, 0, revision),
    day,
    period: 'night',
    role: step.role,
    segment: step.segment,
    cue: step.cue,
    label: step.label,
    startedAt: now,
    endsAt,
    actionDeadlineAt,
    mode,
    paused: false,
    pauseRemainingMs: null,
  };

  const initialRolePlan: WerewolfTimelineRole[] = [];
  for (const s of plan) {
    if (s.role && !initialRolePlan.includes(s.role)) {
      initialRolePlan.push(s.role);
    }
  }

  return {
    version: 1,
    stepIndex: 0,
    revision,
    pausedRemainingMs: null,
    activeTimerToken: timerToken,
    initialRolePlan,
    current,
  };
}

export interface AdvanceResult {
  readonly state: WerewolfTimelineState;
  readonly advanced: boolean;
  readonly nightResolved?: boolean;
}

/**
 * Advances the timeline by one step if the token matches and time is satisfied.
 */
export function advanceTimelineStep(
  state: WerewolfTimelineState,
  plan: readonly TimelineStep[],
  now: number,
  token: string,
): AdvanceResult {
  if (state.current.paused) {
    return { state, advanced: false };
  }

  if (state.current.mode === 'auto') {
    if (state.activeTimerToken !== token) {
      return { state, advanced: false };
    }
    if (state.current.endsAt !== null && now < state.current.endsAt) {
      return { state, advanced: false };
    }
  }

  const nextIndex = state.stepIndex + 1;
  if (nextIndex >= plan.length) {
    return { state, advanced: true, nightResolved: true };
  }

  const nextStep = plan[nextIndex]!;
  const revision = state.revision + 1;
  const isAuto = state.current.mode === 'auto';
  const endsAt = isAuto ? now + nextStep.durationMs : null;
  const actionDeadlineAt = isAuto && nextStep.isAction ? endsAt : null;
  const timerToken = isAuto ? makeTimerToken(nextIndex, revision) : null;

  const current: WerewolfTimeline = {
    version: 1,
    id: makeTimelineId(state.current.day, nextIndex, revision),
    day: state.current.day,
    period: 'night',
    role: nextStep.role,
    segment: nextStep.segment,
    cue: nextStep.cue,
    label: nextStep.label,
    startedAt: now,
    endsAt,
    actionDeadlineAt,
    mode: state.current.mode,
    paused: false,
    pauseRemainingMs: null,
  };

  return {
    state: {
      ...state,
      stepIndex: nextIndex,
      revision,
      pausedRemainingMs: null,
      activeTimerToken: timerToken,
      current,
    },
    advanced: true,
  };
}

/**
 * Pauses the timeline, freezing remaining duration and invalidating timers.
 */
export function pauseTimeline(
  state: WerewolfTimelineState,
  now: number,
): WerewolfTimelineState {
  if (state.current.paused) return state;

  const remaining = state.current.endsAt !== null ? Math.max(0, state.current.endsAt - now) : null;
  const revision = state.revision + 1;

  const current: WerewolfTimeline = {
    ...state.current,
    id: makeTimelineId(state.current.day, state.stepIndex, revision),
    endsAt: null,
    actionDeadlineAt: null,
    paused: true,
    pauseRemainingMs: remaining,
  };

  return {
    ...state,
    revision,
    pausedRemainingMs: remaining,
    activeTimerToken: null,
    current,
  };
}

/**
 * Resumes a paused timeline, restoring remaining duration and scheduling a new timer.
 */
export function resumeTimeline(
  state: WerewolfTimelineState,
  now: number,
): WerewolfTimelineState {
  if (!state.current.paused) return state;

  const remaining = state.pausedRemainingMs ?? 0;
  const revision = state.revision + 1;
  const isAuto = state.current.mode === 'auto';
  const endsAt = isAuto ? now + remaining : null;
  const actionDeadlineAt = isAuto && state.current.segment === 'action' ? endsAt : null;
  const timerToken = isAuto ? makeTimerToken(state.stepIndex, revision) : null;

  const current: WerewolfTimeline = {
    ...state.current,
    id: makeTimelineId(state.current.day, state.stepIndex, revision),
    startedAt: now,
    endsAt,
    actionDeadlineAt,
    paused: false,
    pauseRemainingMs: null,
  };

  return {
    ...state,
    revision,
    pausedRemainingMs: null,
    activeTimerToken: timerToken,
    current,
  };
}

/**
 * Changes timeline mode between manual and auto.
 */
export function setTimelineMode(
  state: WerewolfTimelineState,
  mode: 'manual' | 'auto',
  now: number,
  plan?: readonly TimelineStep[],
): WerewolfTimelineState {
  if (state.current.mode === mode) return state;

  const revision = state.revision + 1;

  if (mode === 'manual') {
    const current: WerewolfTimeline = {
      ...state.current,
      id: makeTimelineId(state.current.day, state.stepIndex, revision),
      mode: 'manual',
      endsAt: null,
      actionDeadlineAt: null,
    };
    return {
      ...state,
      revision,
      activeTimerToken: null,
      current,
    };
  } else {
    // manual -> auto: restarts full duration of current step
    const stepDuration = plan ? (plan[state.stepIndex]?.durationMs ?? 20000) : 1700;
    const isAction = plan ? (plan[state.stepIndex]?.isAction ?? false) : false;
    const endsAt = now + stepDuration;
    const actionDeadlineAt = isAction ? endsAt : null;
    const timerToken = makeTimerToken(state.stepIndex, revision);

    const current: WerewolfTimeline = {
      ...state.current,
      id: makeTimelineId(state.current.day, state.stepIndex, revision),
      mode: 'auto',
      startedAt: now,
      endsAt,
      actionDeadlineAt,
      paused: false,
      pauseRemainingMs: null,
    };

    return {
      ...state,
      revision,
      pausedRemainingMs: null,
      activeTimerToken: timerToken,
      current,
    };
  }
}
