import { createWerewolfAnnouncement, getModeratorVoiceError } from '@ldj/shared';
import {
  calculateWerewolfDistribution,
  getVoiceCueDurationMs,
  WEREWOLF_ROLE_DEFS,
  type Actor,
  type GameContext,
  type GameEffect,
  type VersionedReduceResult,
  type WerewolfTimeline,
  type WerewolfTimelineRole,
  type WerewolfTimelineState,
} from '@ldj/shared';
import {
  buildNightPlan,
  pauseTimeline,
  resumeTimeline,
  type ConfiguredRoles,
} from '../timeline.ts';
import type {
  ModeratorEvent,
  ModeratorResult,
  ModeratorState,
  WerewolfModeratorAction,
  WerewolfModeratorConfig,
  WerewolfModeratorPlayerSummary,
  WerewolfModeratorStatistics,
  WerewolfModeratorView,
  WerewolfRole,
} from './types.ts';

const GOD_ROLES = new Set<WerewolfRole>(['seer', 'witch', 'hunter', 'guard', 'idiot']);

export function calculateStatistics(state: ModeratorState): WerewolfModeratorStatistics {
  const totalPlayers = state.playerOrder.length;
  const totalEliminated = state.eliminatedPlayerIds.length;
  const totalAlive = totalPlayers - totalEliminated;
  const eliminatedSet = new Set(state.eliminatedPlayerIds);

  let aliveWolves = 0;
  let aliveGods = 0;
  let aliveVillagers = 0;

  for (const pid of state.playerOrder) {
    if (eliminatedSet.has(pid)) continue;
    const role = state.assignedRoles[pid];
    if (role === 'wolf') {
      aliveWolves += 1;
    } else if (role === 'villager') {
      aliveVillagers += 1;
    } else if (role && GOD_ROLES.has(role)) {
      aliveGods += 1;
    }
  }

  return {
    aliveWolves,
    aliveGods,
    aliveVillagers,
    totalAlive,
    totalEliminated,
    totalPlayers,
  };
}

export function getSuggestedOutcome(stats: WerewolfModeratorStatistics): {
  suggestedOutcome: 'village_win' | 'wolves_win' | null;
  suggestedOutcomeReason: string | null;
} {
  if (stats.aliveWolves === 0 && stats.totalPlayers > 0) {
    return {
      suggestedOutcome: 'village_win',
      suggestedOutcomeReason: '所有狼人均已出局，好人阵营获胜！',
    };
  }
  if (stats.aliveVillagers === 0 && stats.totalPlayers > 0) {
    return {
      suggestedOutcome: 'wolves_win',
      suggestedOutcomeReason: '所有平民均已出局，狼人达成屠民获胜！',
    };
  }
  if (stats.aliveGods === 0 && stats.totalPlayers > 0) {
    return {
      suggestedOutcome: 'wolves_win',
      suggestedOutcomeReason: '所有神职均已出局，狼人达成屠神获胜！',
    };
  }
  if (stats.aliveWolves >= stats.totalAlive - stats.aliveWolves && stats.totalAlive > 0) {
    return {
      suggestedOutcome: 'wolves_win',
      suggestedOutcomeReason: '存活狼人数已达到或超过好人总数，狼人掌控局势！',
    };
  }
  return {
    suggestedOutcome: null,
    suggestedOutcomeReason: null,
  };
}

export function createModeratorInitialState(
  ctx: GameContext,
  players: string[],
  config: WerewolfModeratorConfig,
): ModeratorState {
  if (players.length < 5 || players.length > 13) {
    throw new Error(`参与人数需为 5-13 人（当前 ${players.length} 人）`);
  }
  if (new Set(players).size !== players.length) {
    throw new Error('玩家列表存在重复');
  }

  let modId: string;
  let cardPlayers: string[];

  const requestedMod = config.moderatorPlayerId ?? config.hostPlayerId;
  if (requestedMod) {
    if (players.includes(requestedMod)) {
      modId = requestedMod;
      cardPlayers = players.filter((p) => p !== modId);
    } else {
      modId = requestedMod;
      cardPlayers = [...players];
    }
  } else if (players.length >= 6) {
    modId = players[0]!;
    cardPlayers = players.slice(1);
  } else {
    // 恰好 5 人且未指定主持人（例如直接对 5 人卡牌进行测试）
    modId = 'moderator';
    cardPlayers = [...players];
  }

  if (cardPlayers.length < 5 || cardPlayers.length > 12) {
    throw new Error(`参与抽卡的玩家需为 5-12 人（当前 ${cardPlayers.length} 人）`);
  }

  const dist = calculateWerewolfDistribution({
    playerCount: cardPlayers.length,
    wolfDelta: config.wolfDelta,
    guard: config.roles?.guard ?? config.guard,
    hunter: config.roles?.hunter ?? config.hunter,
    idiot: config.roles?.idiot ?? config.idiot,
  });

  if (!dist.isValid) {
    throw new Error(dist.error ?? '阵营分配不合法');
  }

  const roles: WerewolfRole[] = [
    ...Array<WerewolfRole>(dist.wolfCount).fill('wolf'),
    ...dist.specials,
    ...Array<WerewolfRole>(dist.villagerCount).fill('villager'),
  ];

  const shuffled = ctx.random.shuffle(roles);
  const assignedRoles: Record<string, WerewolfRole> = {};
  cardPlayers.forEach((pid, idx) => {
    assignedRoles[pid] = shuffled[idx]!;
  });

  const pace = config.pace ?? 'standard';
  const configuredRoles: ConfiguredRoles = {
    guard: config.roles?.guard ?? config.guard,
    hunter: config.roles?.hunter ?? config.hunter,
    idiot: config.roles?.idiot ?? config.idiot,
  };
  const initialRolePlan: WerewolfTimelineRole[] = ['wolf', 'witch', 'seer'];
  if (configuredRoles.guard) initialRolePlan.push('guard');
  if (configuredRoles.hunter && configuredRoles.idiot) {
    initialRolePlan.push('hunter_idiot');
  } else if (configuredRoles.hunter) {
    initialRolePlan.push('hunter');
  } else if (configuredRoles.idiot) {
    initialRolePlan.push('idiot');
  }

  const initialTimeline: WerewolfTimeline = {
    version: 1,
    id: 'd0-s0-r1',
    day: 0,
    period: 'day',
    role: null,
    segment: 'confirm',
    cue: null,
    label: '等待主持人开始首夜',
    startedAt: ctx.now,
    endsAt: null,
    actionDeadlineAt: null,
    mode: 'manual',
    paused: false,
    pauseRemainingMs: null,
  };

  const timelineState: WerewolfTimelineState = {
    version: 1,
    stepIndex: 0,
    revision: 1,
    pausedRemainingMs: null,
    activeTimerToken: null,
    initialRolePlan,
    current: initialTimeline,
  };

  const state: ModeratorState = {
    schemaVersion: 2,
    moderatorPlayerId: modId,
    playerOrder: cardPlayers,
    assignedRoles,
    eliminatedPlayerIds: [],
    gameEnded: false,
    winner: null,
    history: [],
    timelineState,
    config: {
      ...config,
      pace,
    },
  };

  assertModeratorInvariants(state);
  return state;
}

export function assertModeratorInvariants(state: ModeratorState): void {
  if (state.schemaVersion !== 2) {
    throw new Error(`状态版本不合法: ${state.schemaVersion}`);
  }
  if (typeof state.moderatorPlayerId !== 'string' || state.moderatorPlayerId.length === 0) {
    throw new Error('缺少主持人玩家 ID');
  }
  if (!Array.isArray(state.playerOrder) || state.playerOrder.length < 5 || state.playerOrder.length > 12) {
    throw new Error(`参与抽卡人数非法: ${state.playerOrder?.length}`);
  }
  if (state.playerOrder.includes(state.moderatorPlayerId)) {
    throw new Error('主持人不可作为抽卡参与者');
  }
  for (const pid of state.playerOrder) {
    if (!state.assignedRoles[pid]) {
      throw new Error(`玩家 ${pid} 缺少分配的角色`);
    }
  }
  const elimSet = new Set(state.eliminatedPlayerIds);
  if (elimSet.size !== state.eliminatedPlayerIds.length) {
    throw new Error('已出局玩家列表包含重复项');
  }
  for (const pid of state.eliminatedPlayerIds) {
    if (!state.playerOrder.includes(pid)) {
      throw new Error(`出局玩家 ${pid} 不在对局玩家列表中`);
    }
  }
}

function advanceModeratorTimeline(
  state: ModeratorState,
  ctx: GameContext,
  modeOverride?: 'manual' | 'auto',
): { nextTimelineState: WerewolfTimelineState; effects: GameEffect[] } {
  if (!state.timelineState) throw new Error('No timeline state');
  const cur = state.timelineState.current;
  const mode = modeOverride ?? cur.mode;
  const isAuto = mode === 'auto';
  const pace = state.config?.pace ?? 'standard';
  const configuredRoles: ConfiguredRoles = {
    guard: state.config?.roles?.guard ?? state.config?.guard,
    hunter: state.config?.roles?.hunter ?? state.config?.hunter,
    idiot: state.config?.roles?.idiot ?? state.config?.idiot,
  };
  const revision = state.timelineState.revision + 1;
  const effects: GameEffect[] = [];

  if (state.timelineState.activeTimerToken) {
    effects.push({
      type: 'cancel_timer',
      timerId: `werewolf:moderator:timeline:${state.timelineState.activeTimerToken}`,
    });
  }

  // 1. Day 0 Confirm (game start) -> Day 1 Night Intro
  if (cur.day === 0 && cur.segment === 'confirm') {
    const plan = buildNightPlan(configuredRoles, 1, pace);
    const step = plan[0]!;
    const endsAt = isAuto ? ctx.now + step.durationMs : null;
    const timerToken = isAuto ? `tkn-n1-0-r${revision}` : null;
    const current: WerewolfTimeline = {
      version: 1,
      id: `n1-s0-r${revision}`,
      day: 1,
      period: 'night',
      role: step.role,
      segment: step.segment,
      cue: step.cue,
      label: step.label,
      startedAt: ctx.now,
      endsAt,
      actionDeadlineAt: isAuto && step.isAction ? endsAt : null,
      mode,
      paused: false,
      pauseRemainingMs: null,
    };
    if (timerToken && endsAt !== null) {
      effects.push({
        type: 'schedule_timer',
        timerId: `werewolf:moderator:timeline:${timerToken}`,
        deadlineAt: endsAt,
        action: {
          type: 'timeline_timeout',
          timelineId: current.id,
          token: timerToken,
        },
      });
    }
    return {
      nextTimelineState: {
        ...state.timelineState,
        revision,
        stepIndex: 0,
        activeTimerToken: timerToken,
        pausedRemainingMs: null,
        current,
      },
      effects,
    };
  }

  // 2. In Night -> advance next step in plan
  if (cur.period === 'night') {
    const plan = buildNightPlan(configuredRoles, cur.day, pace);
    const nextIndex = state.timelineState.stepIndex + 1;
    if (nextIndex < plan.length) {
      const step = plan[nextIndex]!;
      const endsAt = isAuto ? ctx.now + step.durationMs : null;
      const timerToken = isAuto ? `tkn-n${cur.day}-${nextIndex}-r${revision}` : null;
      const current: WerewolfTimeline = {
        version: 1,
        id: `n${cur.day}-s${nextIndex}-r${revision}`,
        day: cur.day,
        period: 'night',
        role: step.role,
        segment: step.segment,
        cue: step.cue,
        label: step.label,
        startedAt: ctx.now,
        endsAt,
        actionDeadlineAt: isAuto && step.isAction ? endsAt : null,
        mode,
        paused: false,
        pauseRemainingMs: null,
      };
      if (timerToken && endsAt !== null) {
        effects.push({
          type: 'schedule_timer',
          timerId: `werewolf:moderator:timeline:${timerToken}`,
          deadlineAt: endsAt,
          action: {
            type: 'timeline_timeout',
            timelineId: current.id,
            token: timerToken,
          },
        });
      }
      return {
        nextTimelineState: {
          ...state.timelineState,
          revision,
          stepIndex: nextIndex,
          activeTimerToken: timerToken,
          pausedRemainingMs: null,
          current,
        },
        effects,
      };
    }

    // Night complete -> Dawn
    const dawnDuration = getVoiceCueDurationMs('dawn');
    const endsAt = isAuto ? ctx.now + dawnDuration : null;
    const timerToken = isAuto ? `tkn-d${cur.day}-dawn-r${revision}` : null;
    const current: WerewolfTimeline = {
      version: 1,
      id: `d${cur.day}-dawn-r${revision}`,
      day: cur.day,
      period: 'day',
      role: null,
      segment: 'dawn',
      cue: 'dawn',
      label: '天亮了',
      startedAt: ctx.now,
      endsAt,
      actionDeadlineAt: null,
      mode,
      paused: false,
      pauseRemainingMs: null,
    };
    if (timerToken && endsAt !== null) {
      effects.push({
        type: 'schedule_timer',
        timerId: `werewolf:moderator:timeline:${timerToken}`,
        deadlineAt: endsAt,
        action: {
          type: 'timeline_timeout',
          timelineId: current.id,
          token: timerToken,
        },
      });
    }
    return {
      nextTimelineState: {
        ...state.timelineState,
        revision,
        stepIndex: 0,
        activeTimerToken: timerToken,
        pausedRemainingMs: null,
        current,
      },
      effects,
    };
  }

  // 3. Dawn -> Confirm (ALWAYS pauses/stops, no timer)
  if (cur.period === 'day' && cur.segment === 'dawn') {
    const current: WerewolfTimeline = {
      version: 1,
      id: `d${cur.day}-confirm-r${revision}`,
      day: cur.day,
      period: 'day',
      role: null,
      segment: 'confirm',
      cue: null,
      label: '等待主持人确认伤亡与信息',
      startedAt: ctx.now,
      endsAt: null,
      actionDeadlineAt: null,
      mode,
      paused: false,
      pauseRemainingMs: null,
    };
    return {
      nextTimelineState: {
        ...state.timelineState,
        revision,
        stepIndex: 0,
        activeTimerToken: null,
        pausedRemainingMs: null,
        current,
      },
      effects,
    };
  }

  // 4. Confirm -> Day (discussion) (no timer)
  if (cur.period === 'day' && cur.segment === 'confirm') {
    const current: WerewolfTimeline = {
      version: 1,
      id: `d${cur.day}-day-r${revision}`,
      day: cur.day,
      period: 'day',
      role: null,
      segment: 'day',
      cue: null,
      label: '白天自由发言与放逐讨论',
      startedAt: ctx.now,
      endsAt: null,
      actionDeadlineAt: null,
      mode,
      paused: false,
      pauseRemainingMs: null,
    };
    return {
      nextTimelineState: {
        ...state.timelineState,
        revision,
        stepIndex: 0,
        activeTimerToken: null,
        pausedRemainingMs: null,
        current,
      },
      effects,
    };
  }

  // 5. Day -> Next Night Intro
  if (cur.period === 'day' && cur.segment === 'day') {
    const nextDay = cur.day + 1;
    const plan = buildNightPlan(configuredRoles, nextDay, pace);
    const step = plan[0]!;
    const endsAt = isAuto ? ctx.now + step.durationMs : null;
    const timerToken = isAuto ? `tkn-n${nextDay}-0-r${revision}` : null;
    const current: WerewolfTimeline = {
      version: 1,
      id: `n${nextDay}-s0-r${revision}`,
      day: nextDay,
      period: 'night',
      role: step.role,
      segment: step.segment,
      cue: step.cue,
      label: step.label,
      startedAt: ctx.now,
      endsAt,
      actionDeadlineAt: isAuto && step.isAction ? endsAt : null,
      mode,
      paused: false,
      pauseRemainingMs: null,
    };
    if (timerToken && endsAt !== null) {
      effects.push({
        type: 'schedule_timer',
        timerId: `werewolf:moderator:timeline:${timerToken}`,
        deadlineAt: endsAt,
        action: {
          type: 'timeline_timeout',
          timelineId: current.id,
          token: timerToken,
        },
      });
    }
    return {
      nextTimelineState: {
        ...state.timelineState,
        revision,
        stepIndex: 0,
        activeTimerToken: timerToken,
        pausedRemainingMs: null,
        current,
      },
      effects,
    };
  }

  return { nextTimelineState: state.timelineState, effects };
}

export function reduceModerator(
  ctx: GameContext,
  state: ModeratorState,
  actor: Actor,
  action: WerewolfModeratorAction,
): VersionedReduceResult<ModeratorState, ModeratorEvent, ModeratorResult> {
  // 1. 系统专用命令拦截
  if (action.type === 'timeline_timeout') {
    if (actor.kind !== 'system') {
      return {
        ok: false,
        code: 'SYSTEM_ONLY',
        message: '只有系统可触发时间线超时',
      };
    }
    if (!state.timelineState) {
      return {
        ok: false,
        code: 'NO_TIMELINE',
        message: '当前对局无时间线状态',
      };
    }
    if (state.timelineState.current.paused) {
      return { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
    }
    if (action.timelineId !== state.timelineState.current.id || action.token !== state.timelineState.activeTimerToken) {
      return { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
    }
    if (state.timelineState.current.endsAt !== null && ctx.now < state.timelineState.current.endsAt) {
      return { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
    }

    const { nextTimelineState, effects } = advanceModeratorTimeline(state, ctx);
    return {
      ok: true,
      nextState: { ...state, announcement: null, timelineState: nextTimelineState },
      publicEvents: [],
      privateEvents: [],
      effects,
      resultCandidate: null,
    };
  }

  if (action.type === 'moderator_disconnected') {
    if (actor.kind !== 'system') {
      return {
        ok: false,
        code: 'SYSTEM_ONLY',
        message: '只有系统可触发主持人断线',
      };
    }
    if (action.moderatorPlayerId !== state.moderatorPlayerId) {
      return {
        ok: false,
        code: 'NOT_MODERATOR',
        message: '目标不是主持人',
      };
    }
    if (!state.timelineState || state.timelineState.current.paused) {
      return { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
    }
    const nextTimelineState = pauseTimeline(state.timelineState, ctx.now);
    const effects: GameEffect[] = [];
    if (state.timelineState.activeTimerToken) {
      effects.push({
        type: 'cancel_timer',
        timerId: `werewolf:moderator:timeline:${state.timelineState.activeTimerToken}`,
      });
    }
    return {
      ok: true,
      nextState: { ...state, announcement: null, timelineState: nextTimelineState },
      publicEvents: [],
      privateEvents: [],
      effects,
      resultCandidate: null,
    };
  }

  // 2. 主持人权限校验（begin/end_game 允许 system）
  const isMod =
    (actor.kind === 'player' && actor.playerId === state.moderatorPlayerId) ||
    (actor.kind === 'system' && (action.type === 'begin' || action.type === 'end_game'));

  if (!isMod) {
    return {
      ok: false,
      code: 'NOT_AUTHORIZED',
      message: '仅主持人有权限执行该操作',
    };
  }

  if (action.type === 'moderator_voice_play' || action.type === 'moderator_voice_stop') {
    if (action.type === 'moderator_voice_stop') {
      if (state.announcement?.id !== action.announcementId) return { ok: false, code: 'STALE_VOICE', message: '播报已改变，请重试' };
      const effects: GameEffect[] = [];
      let timelineState = state.timelineState;
      if (timelineState?.current.mode === 'auto' && !timelineState.current.paused) {
        if (timelineState.activeTimerToken) effects.push({ type: 'cancel_timer', timerId: `werewolf:moderator:timeline:${timelineState.activeTimerToken}` });
        timelineState = pauseTimeline(timelineState, ctx.now);
      }
      return { ok: true, nextState: { ...state, timelineState, announcement: null }, publicEvents: [], privateEvents: [], effects, resultCandidate: null };
    }
    if (action.timelineId !== (state.timelineState?.current.id ?? null)) return { ok: false, code: 'STALE_TIMELINE', message: '环节已改变，请重试' };
    const error = getModeratorVoiceError(action.cues, {
      period: state.gameEnded ? 'day' : state.timelineState?.current.period ?? 'night',
      seats: state.playerOrder.flatMap(pid => state.config?.seatNumbers?.[pid] ? [state.config.seatNumbers[pid]!] : []), roles: [...new Set(Object.values(state.assignedRoles))],
      confirmed: action.confirmed, gameEnded: state.gameEnded, winner: state.winner,
    });
    if (error) return { ok: false, code: 'VOICE_NOT_ALLOWED', message: error };
    const effects: GameEffect[] = [];
    let timelineState = state.timelineState;
    if (timelineState?.current.mode === 'auto' && !timelineState.current.paused) {
      if (timelineState.activeTimerToken) effects.push({ type: 'cancel_timer', timerId: `werewolf:moderator:timeline:${timelineState.activeTimerToken}` });
      timelineState = pauseTimeline(timelineState, ctx.now);
    }
    const revision = (state.voiceRevision ?? 0) + 1;
    const announcement = createWerewolfAnnouncement(`moderator:${revision}:${ctx.now}`, action.cues, ctx.now, 'moderator', action.output);
    return { ok: true, nextState: { ...state, timelineState, announcement, voiceRevision: revision }, publicEvents: [], privateEvents: [], effects, resultCandidate: null };
  }

  if (state.gameEnded) {
    return {
      ok: false,
      code: 'GAME_ALREADY_ENDED',
      message: '对局已结束',
    };
  }

  // 3. 时间线控场动作
  if (
    action.type === 'moderator_set_mode' ||
    action.type === 'moderator_next' ||
    action.type === 'moderator_pause' ||
    action.type === 'moderator_resume' ||
    action.type === 'moderator_skip'
  ) {
    if (!state.timelineState) {
      return {
        ok: false,
        code: 'NO_TIMELINE',
        message: '当前对局无时间线',
      };
    }
    if (action.timelineId !== state.timelineState.current.id) {
      return {
        ok: false,
        code: 'TIMELINE_ID_MISMATCH',
        message: '时间线版本不匹配',
      };
    }

    if (action.type === 'moderator_set_mode') {
      if (state.timelineState.current.mode === action.mode) {
        return { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
      }
      if (action.mode === 'manual') {
        const revision = state.timelineState.revision + 1;
        const prefix = state.timelineState.current.period === 'night' ? 'n' : 'd';
        const current: WerewolfTimeline = {
          ...state.timelineState.current,
          id: `${prefix}${state.timelineState.current.day}-s${state.timelineState.stepIndex}-r${revision}`,
          mode: 'manual',
          endsAt: null,
          actionDeadlineAt: null,
        };
        const nextTimelineState: WerewolfTimelineState = {
          ...state.timelineState,
          revision,
          activeTimerToken: null,
          pausedRemainingMs: null,
          current,
        };
        const effects: GameEffect[] = [];
        if (state.timelineState.activeTimerToken) {
          effects.push({
            type: 'cancel_timer',
            timerId: `werewolf:moderator:timeline:${state.timelineState.activeTimerToken}`,
          });
        }
        return {
          ok: true,
          nextState: { ...state, announcement: null, timelineState: nextTimelineState },
          publicEvents: [],
          privateEvents: [],
          effects,
          resultCandidate: null,
        };
      } else {
        // manual -> auto
        const revision = state.timelineState.revision + 1;
        const cur = state.timelineState.current;
        let stepDuration: number | null = null;
        let isAction = false;
        if (cur.period === 'night') {
          const pace = state.config?.pace ?? 'standard';
          const configuredRoles: ConfiguredRoles = {
            guard: state.config?.roles?.guard ?? state.config?.guard,
            hunter: state.config?.roles?.hunter ?? state.config?.hunter,
            idiot: state.config?.roles?.idiot ?? state.config?.idiot,
          };
          const plan = buildNightPlan(configuredRoles, cur.day, pace);
          const step = plan[state.timelineState.stepIndex];
          stepDuration = step?.durationMs ?? 20000;
          isAction = step?.isAction ?? false;
        } else if (cur.segment === 'dawn') {
          stepDuration = getVoiceCueDurationMs('dawn');
        }
        const endsAt = stepDuration !== null ? ctx.now + stepDuration : null;
        const timerToken = endsAt !== null ? `tkn-auto-r${revision}` : null;
        const prefix = state.timelineState.current.period === 'night' ? 'n' : 'd';
        const current: WerewolfTimeline = {
          ...state.timelineState.current,
          id: `${prefix}${state.timelineState.current.day}-s${state.timelineState.stepIndex}-r${revision}`,
          mode: 'auto',
          startedAt: ctx.now,
          endsAt,
          actionDeadlineAt: isAction ? endsAt : null,
          paused: false,
          pauseRemainingMs: null,
        };
        const effects: GameEffect[] = [];
        if (timerToken && endsAt !== null) {
          effects.push({
            type: 'schedule_timer',
            timerId: `werewolf:moderator:timeline:${timerToken}`,
            deadlineAt: endsAt,
            action: {
              type: 'timeline_timeout',
              timelineId: current.id,
              token: timerToken,
            },
          });
        }
        return {
          ok: true,
          nextState: {
            ...state,
            announcement: null,
            timelineState: {
              ...state.timelineState,
              revision,
              activeTimerToken: timerToken,
              pausedRemainingMs: null,
              current,
            },
          },
          publicEvents: [],
          privateEvents: [],
          effects,
          resultCandidate: null,
        };
      }
    }

    if (action.type === 'moderator_pause') {
      if (state.timelineState.current.paused) {
        return { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
      }
      const nextTimelineState = pauseTimeline(state.timelineState, ctx.now);
      const effects: GameEffect[] = [];
      if (state.timelineState.activeTimerToken) {
        effects.push({
          type: 'cancel_timer',
          timerId: `werewolf:moderator:timeline:${state.timelineState.activeTimerToken}`,
        });
      }
      return {
        ok: true,
        nextState: { ...state, announcement: null, timelineState: nextTimelineState },
        publicEvents: [],
        privateEvents: [],
        effects,
        resultCandidate: null,
      };
    }

    if (action.type === 'moderator_resume') {
      if (!state.timelineState.current.paused) {
        return { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
      }
      const nextTimelineState = resumeTimeline(state.timelineState, ctx.now);
      const effects: GameEffect[] = [];
      if (nextTimelineState.activeTimerToken && nextTimelineState.current.endsAt !== null) {
        effects.push({
          type: 'schedule_timer',
          timerId: `werewolf:moderator:timeline:${nextTimelineState.activeTimerToken}`,
          deadlineAt: nextTimelineState.current.endsAt,
          action: {
            type: 'timeline_timeout',
            timelineId: nextTimelineState.current.id,
            token: nextTimelineState.activeTimerToken,
          },
        });
      }
      return {
        ok: true,
        nextState: { ...state, announcement: null, timelineState: nextTimelineState },
        publicEvents: [],
        privateEvents: [],
        effects,
        resultCandidate: null,
      };
    }

    if (action.type === 'moderator_skip') {
      if (state.timelineState.current.mode !== 'auto') {
        return {
          ok: false,
          code: 'INVALID_MODE',
          message: '仅自动模式下可以使用跳过',
        };
      }
      if (state.timelineState.current.paused) {
        return {
          ok: false,
          code: 'IS_PAUSED',
          message: '暂停状态下不可跳过',
        };
      }
      const { nextTimelineState, effects } = advanceModeratorTimeline(state, ctx);
      return {
        ok: true,
        nextState: { ...state, announcement: null, timelineState: nextTimelineState },
        publicEvents: [],
        privateEvents: [],
        effects,
        resultCandidate: null,
      };
    }

    if (action.type === 'moderator_next') {
      const cur = state.timelineState.current;
      if (cur.mode === 'auto' && cur.period === 'night') {
        return {
          ok: false,
          code: 'INVALID_MODE',
          message: '自动模式下夜间仅可跳过，天亮及确认阶段可手动推进',
        };
      }
      const { nextTimelineState, effects } = advanceModeratorTimeline(state, ctx);
      return {
        ok: true,
        nextState: { ...state, announcement: null, timelineState: nextTimelineState },
        publicEvents: [],
        privateEvents: [],
        effects,
        resultCandidate: null,
      };
    }
  }

  switch (action.type) {
    case 'begin': {
      return {
        ok: true,
        nextState: state,
        publicEvents: [],
        privateEvents: [],
        effects: [],
        resultCandidate: null,
      };
    }

    case 'eliminate_player': {
      const targetId = action.targetPlayerId;
      if (!state.playerOrder.includes(targetId)) {
        return {
          ok: false,
          code: 'PLAYER_NOT_FOUND',
          message: '目标玩家不存在于当前对局中',
        };
      }
      if (state.eliminatedPlayerIds.includes(targetId)) {
        return {
          ok: false,
          code: 'ALREADY_ELIMINATED',
          message: '该玩家已被标记出局',
        };
      }

      const nextState: ModeratorState = {
        ...state,
        eliminatedPlayerIds: [...state.eliminatedPlayerIds, targetId],
        history: [
          ...state.history,
          { action: 'eliminate', targetPlayerId: targetId, timestamp: ctx.now },
        ],
      };

      return {
        ok: true,
        nextState,
        publicEvents: [{ type: 'player_eliminated', targetPlayerId: targetId }],
        privateEvents: [],
        effects: [],
        resultCandidate: null,
      };
    }

    case 'revive_player': {
      const targetId = action.targetPlayerId;
      if (!state.eliminatedPlayerIds.includes(targetId)) {
        return {
          ok: false,
          code: 'NOT_ELIMINATED',
          message: '该玩家未处于出局状态',
        };
      }

      const nextState: ModeratorState = {
        ...state,
        eliminatedPlayerIds: state.eliminatedPlayerIds.filter((id) => id !== targetId),
        history: [
          ...state.history,
          { action: 'revive', targetPlayerId: targetId, timestamp: ctx.now },
        ],
      };

      return {
        ok: true,
        nextState,
        publicEvents: [{ type: 'player_revived', targetPlayerId: targetId }],
        privateEvents: [],
        effects: [],
        resultCandidate: null,
      };
    }

    case 'end_game': {
      const stats = calculateStatistics(state);
      const outcome = getSuggestedOutcome(stats);
      let winner: 'werewolf' | 'good' | null = null;
      if (outcome.suggestedOutcome === 'village_win') {
        winner = 'good';
      } else if (outcome.suggestedOutcome === 'wolves_win') {
        winner = 'werewolf';
      } else if (stats.aliveWolves === 0 && stats.totalPlayers > 0) {
        winner = 'good';
      } else if ((stats.aliveGods === 0 || stats.aliveVillagers === 0) && stats.totalPlayers > 0) {
        winner = 'werewolf';
      } else {
        winner = null;
      }

      const nextState: ModeratorState = {
        ...state,
        gameEnded: true,
        winner,
        timelineState: state.timelineState ? { ...state.timelineState, activeTimerToken: null, pausedRemainingMs: null,
          current: { ...state.timelineState.current, id: 'ended:' + ctx.now, period: 'day', role: null,
            segment: 'day', cue: null, label: '对局结束', startedAt: ctx.now, endsAt: null, actionDeadlineAt: null,
            paused: false, pauseRemainingMs: null } } : null,
        announcement: winner && state.timelineState?.current.mode === 'auto'
          ? createWerewolfAnnouncement('end:' + ctx.now, [winner === 'good' ? 'game_over_good' : 'game_over_wolf'], ctx.now) : null,
      };

      return {
        ok: true,
        nextState,
        publicEvents: [{ type: 'game_ended', winner }],
        privateEvents: [],
        effects: [],
        resultCandidate: {
          winner,
          endedAt: ctx.now,
        },
      };
    }

    default:
      return {
        ok: false,
        code: 'UNKNOWN_ACTION',
        message: '不支持的动作类型',
      };
  }
}

export function buildModeratorPlayerView(
  state: ModeratorState,
  playerId: string,
): WerewolfModeratorView {
  const isMod = playerId === state.moderatorPlayerId;
  const stats = calculateStatistics(state);
  const outcome = getSuggestedOutcome(stats);

  if (isMod) {
    const players: WerewolfModeratorPlayerSummary[] = state.playerOrder.map((pid, idx) => {
      const role = state.assignedRoles[pid]!;
      return {
        playerId: pid,
        seat: state.config?.seatNumbers?.[pid] ?? idx + 1,
        isEliminated: state.eliminatedPlayerIds.includes(pid),
        role,
        roleInfo: WEREWOLF_ROLE_DEFS[role],
      };
    });

    return {
      rulesetId: 'werewolf_moderator_v1',
      isModerator: true,
      moderatorPlayerId: state.moderatorPlayerId,
      gameEnded: state.gameEnded,
      winner: state.winner,
      players,
      statistics: stats,
      suggestedOutcome: outcome.suggestedOutcome,
      suggestedOutcomeReason: outcome.suggestedOutcomeReason,
      myRole: null,
      isMeEliminated: false,
      timeline: state.timelineState ? state.timelineState.current : null,
      announcement: state.announcement ?? null,
    };
  }

  // 普通玩家视角：仅见自身底牌与全员存活状态，绝对禁止泄露他人身份直到终局
  const players: WerewolfModeratorPlayerSummary[] = state.playerOrder.map((pid, idx) => {
    const role = state.gameEnded ? state.assignedRoles[pid] : undefined;
    const roleInfo = state.gameEnded && role ? WEREWOLF_ROLE_DEFS[role] : undefined;
    return {
      playerId: pid,
      seat: state.config?.seatNumbers?.[pid] ?? idx + 1,
      isEliminated: state.eliminatedPlayerIds.includes(pid),
      role,
      roleInfo,
    };
  });

  const myRole = state.assignedRoles[playerId] ? WEREWOLF_ROLE_DEFS[state.assignedRoles[playerId]!] : null;
  const isMeEliminated = state.eliminatedPlayerIds.includes(playerId);

  return {
    rulesetId: 'werewolf_moderator_v1',
    isModerator: false,
    moderatorPlayerId: state.moderatorPlayerId,
    gameEnded: state.gameEnded,
    winner: state.winner,
    players,
    statistics: state.gameEnded ? stats : undefined,
    myRole,
    isMeEliminated,
    timeline: state.timelineState ? state.timelineState.current : null,
      announcement: state.announcement?.output === 'room' ? state.announcement : null,
  };
}

export function buildModeratorSpectatorView(state: ModeratorState): WerewolfModeratorView {
  const stats = calculateStatistics(state);
  const players: WerewolfModeratorPlayerSummary[] = state.playerOrder.map((pid, idx) => {
    const role = state.gameEnded ? state.assignedRoles[pid] : undefined;
    const roleInfo = state.gameEnded && role ? WEREWOLF_ROLE_DEFS[role] : undefined;
    return {
      playerId: pid,
      seat: state.config?.seatNumbers?.[pid] ?? idx + 1,
      isEliminated: state.eliminatedPlayerIds.includes(pid),
      role,
      roleInfo,
    };
  });

  return {
    rulesetId: 'werewolf_moderator_v1',
    isModerator: false,
    moderatorPlayerId: state.moderatorPlayerId,
    gameEnded: state.gameEnded,
    winner: state.winner,
    players,
    statistics: state.gameEnded ? stats : undefined,
    myRole: null,
    isMeEliminated: false,
    timeline: state.timelineState ? state.timelineState.current : null,
      announcement: state.announcement?.output === 'room' ? state.announcement : null,
  };
}
