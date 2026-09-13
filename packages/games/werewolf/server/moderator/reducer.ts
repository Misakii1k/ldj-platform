import {
  calculateWerewolfDistribution,
  WEREWOLF_ROLE_DEFS,
  type Actor,
  type GameContext,
  type VersionedReduceResult,
} from '@ldj/shared';
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

  const state: ModeratorState = {
    schemaVersion: 1,
    moderatorPlayerId: modId,
    playerOrder: cardPlayers,
    assignedRoles,
    eliminatedPlayerIds: [],
    gameEnded: false,
    winner: null,
    history: [],
  };

  assertModeratorInvariants(state);
  return state;
}

export function assertModeratorInvariants(state: ModeratorState): void {
  if (state.schemaVersion !== 1) {
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

export function reduceModerator(
  ctx: GameContext,
  state: ModeratorState,
  actor: Actor,
  action: WerewolfModeratorAction,
): VersionedReduceResult<ModeratorState, ModeratorEvent, ModeratorResult> {
  const isMod =
    (actor.kind === 'player' && actor.playerId === state.moderatorPlayerId) ||
    actor.kind === 'system';

  if (!isMod) {
    return {
      ok: false,
      code: 'NOT_AUTHORIZED',
      message: '仅主持人有权限执行该操作',
    };
  }

  if (state.gameEnded) {
    return {
      ok: false,
      code: 'GAME_ALREADY_ENDED',
      message: '对局已结束',
    };
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
        seat: idx + 1,
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
    };
  }

  // 普通玩家视角：仅见自身底牌与全员存活状态，绝对禁止泄露他人身份直到终局
  const players: WerewolfModeratorPlayerSummary[] = state.playerOrder.map((pid, idx) => {
    const role = state.gameEnded ? state.assignedRoles[pid] : undefined;
    const roleInfo = state.gameEnded && role ? WEREWOLF_ROLE_DEFS[role] : undefined;
    return {
      playerId: pid,
      seat: idx + 1,
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
  };
}

export function buildModeratorSpectatorView(state: ModeratorState): WerewolfModeratorView {
  const stats = calculateStatistics(state);
  const players: WerewolfModeratorPlayerSummary[] = state.playerOrder.map((pid, idx) => {
    const role = state.gameEnded ? state.assignedRoles[pid] : undefined;
    const roleInfo = state.gameEnded && role ? WEREWOLF_ROLE_DEFS[role] : undefined;
    return {
      playerId: pid,
      seat: idx + 1,
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
  };
}
