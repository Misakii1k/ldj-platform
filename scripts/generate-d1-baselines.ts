import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createSeededRandom, type Actor, type GameContext } from '@ldj/shared';
import {
  unoModule,
  type UnoAction,
  type UnoPlayerView,
  type UnoPublicView,
  type UnoResult,
  type UnoState,
} from '../packages/games/uno/server/module.ts';
import {
  undercoverModule,
  type UndercoverAction,
  type UndercoverPlayerView,
  type UndercoverResult,
  type UndercoverSpectatorView,
  type UndercoverState,
} from '../packages/games/undercover/server/index.ts';

const START_TIME = 1_700_000_000_000;
const STEP_TIME_MS = 1_000;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface ViewTimelineEntry<PV, SV> {
  step: number;
  now: number;
  playerViews: Record<string, PV>;
  spectatorView: SV;
}

export interface UnoBaseline {
  rulesetId: 'uno_legacy_platform_v1';
  seed: 'd1:uno:legacy:v1';
  players: string[];
  actions: Array<{ actor: string; action: UnoAction; now: number }>;
  viewTimeline: Array<ViewTimelineEntry<UnoPlayerView, UnoPublicView>>;
  views: Record<string, UnoPlayerView>;
  spectatorView: UnoPublicView;
  finalState: UnoState;
  result: UnoResult;
  randomCursor: number;
}

export interface UndercoverBaseline {
  rulesetId: 'undercover_classic_v1';
  seed: 'd1:undercover:classic:v1';
  players: string[];
  actions: Array<{ actor: Actor; action: UndercoverAction; now: number }>;
  viewTimeline: Array<ViewTimelineEntry<UndercoverPlayerView, UndercoverSpectatorView>>;
  views: Record<string, UndercoverPlayerView>;
  spectatorView: UndercoverSpectatorView;
  finalState: UndercoverState;
  result: UndercoverResult;
  randomCursor: number;
}

function playerViews<S, PV>(
  players: readonly string[],
  state: S,
  getPlayerView: (state: S, playerId: string) => PV,
): Record<string, PV> {
  return Object.fromEntries(players.map((playerId) => [playerId, getPlayerView(state, playerId)]));
}

function unoViewEntry(
  state: UnoState,
  players: readonly string[],
  step: number,
  now: number,
): ViewTimelineEntry<UnoPlayerView, UnoPublicView> {
  return {
    step,
    now,
    playerViews: playerViews(players, state, (current, playerId) => unoModule.getPlayerView(current, playerId)),
    spectatorView: unoModule.getSpectatorView(state),
  };
}

function undercoverViewEntry(
  state: UndercoverState,
  players: readonly string[],
  step: number,
  now: number,
): ViewTimelineEntry<UndercoverPlayerView, UndercoverSpectatorView> {
  return {
    step,
    now,
    playerViews: playerViews(players, state, (current, playerId) => undercoverModule.getPlayerView(current, playerId)),
    spectatorView: undercoverModule.getSpectatorView(state),
  };
}

export function generateUnoBaseline(): UnoBaseline {
  const seed = 'd1:uno:legacy:v1' as const;
  const players = ['uno-p1', 'uno-p2', 'uno-p3', 'uno-p4'];
  const random = createSeededRandom(seed);
  const ctx: GameContext = { now: START_TIME, random };
  let state = unoModule.createInitialState(ctx, players, unoModule.parseConfig({ variant: 'standard' }));
  const actions: UnoBaseline['actions'] = [];
  const viewTimeline: UnoBaseline['viewTimeline'] = [unoViewEntry(state, players, 0, ctx.now)];

  for (let step = 0; step < 2_000 && unoModule.getResult(state) === null; step++) {
    const playerId = state.currentPlayerId;
    const action = unoModule.pickBotAction?.({
      view: unoModule.getPlayerView(state, playerId),
      playerId,
      random,
    });
    if (!action) throw new Error(`UNO 基线在步骤 ${step} 无合法机器人动作`);

    ctx.now += STEP_TIME_MS;
    const parsedAction = unoModule.parseAction(action);
    const reduced = unoModule.reduce(ctx, state, { kind: 'player', playerId }, parsedAction);
    if (!reduced.ok) {
      throw new Error(`UNO 基线动作被拒绝: ${JSON.stringify({ playerId, action: parsedAction, reduced })}`);
    }

    actions.push({ actor: playerId, action: parsedAction, now: ctx.now });
    state = reduced.state;
    viewTimeline.push(unoViewEntry(state, players, actions.length, ctx.now));
  }

  const result = unoModule.getResult(state);
  if (result === null) throw new Error('UNO 基线超过 2000 步仍未结束');
  const views = playerViews(players, state, (current, playerId) => unoModule.getPlayerView(current, playerId));
  const spectatorView = unoModule.getSpectatorView(state);

  return {
    rulesetId: 'uno_legacy_platform_v1',
    seed,
    players,
    actions,
    viewTimeline,
    views,
    spectatorView,
    finalState: state,
    result,
    randomCursor: random.getCursor(),
  };
}

function aliveUndercoverPlayers(state: UndercoverState): string[] {
  return Object.entries(state.players)
    .filter(([, player]) => player.alive)
    .sort(([, left], [, right]) => left.seat - right.seat)
    .map(([playerId]) => playerId);
}

function nextUndercoverStep(state: UndercoverState): { actor: Actor; action: UndercoverAction } {
  if (state.phase === 'word_reveal') {
    const playerId = Object.entries(state.players)
      .sort(([, left], [, right]) => left.seat - right.seat)
      .map(([id]) => id)
      .find((id) => !state.confirmedPlayerIds.includes(id));
    return playerId
      ? { actor: { kind: 'player', playerId }, action: { type: 'confirm_word' } }
      : { actor: { kind: 'system', source: 'timer' }, action: { type: 'reveal_timeout' } };
  }

  if (state.phase === 'speaking') {
    const playerId = state.speakingOrder[state.currentSpeakerIndex];
    if (!playerId) throw new Error(`谁是卧底基线没有当前发言者: ${state.currentSpeakerIndex}`);
    return { actor: { kind: 'player', playerId }, action: { type: 'finish_speech' } };
  }

  if (state.phase === 'voting' || state.phase === 'runoff_voting') {
    const alive = aliveUndercoverPlayers(state);
    const voter = alive.find((id) => !(id in state.votes));
    const kind = state.phase === 'voting' ? 'normal' : 'runoff';
    if (!voter) {
      return {
        actor: { kind: 'system', source: 'timer' },
        action: { type: 'vote_timeout', round: state.round, kind },
      };
    }
    const candidates = state.phase === 'runoff_voting' ? state.runoffCandidates : alive;
    const targetPlayerId = candidates.find((id) => id !== voter);
    if (!targetPlayerId) throw new Error(`谁是卧底基线没有合法投票目标: ${voter}`);
    return {
      actor: { kind: 'player', playerId: voter },
      action: { type: 'cast_vote', targetPlayerId },
    };
  }

  if (state.phase === 'vote_result') {
    return {
      actor: { kind: 'system', source: 'timer' },
      action: { type: 'vote_result_elapsed', round: state.round },
    };
  }

  throw new Error(`谁是卧底基线已结束或阶段未知: ${state.phase}`);
}

export function generateUndercoverBaseline(): UndercoverBaseline {
  const seed = 'd1:undercover:classic:v1' as const;
  const players = ['uc-p1', 'uc-p2', 'uc-p3', 'uc-p4', 'uc-p5', 'uc-p6'];
  const random = createSeededRandom(seed);
  const ctx: GameContext = { now: START_TIME, random };
  let state = undercoverModule.createInitialState(ctx, players, undercoverModule.parseConfig({}));
  const actions: UndercoverBaseline['actions'] = [];
  const viewTimeline: UndercoverBaseline['viewTimeline'] = [undercoverViewEntry(state, players, 0, ctx.now)];

  const apply = (actor: Actor, action: UndercoverAction): void => {
    ctx.now += STEP_TIME_MS;
    const parsedAction = undercoverModule.parseAction(action);
    const reduced = undercoverModule.reduce(ctx, state, actor, parsedAction);
    if (!reduced.ok) {
      throw new Error(`谁是卧底基线动作被拒绝: ${JSON.stringify({ actor, action: parsedAction, reduced })}`);
    }
    actions.push({ actor, action: parsedAction, now: ctx.now });
    state = reduced.state;
    viewTimeline.push(undercoverViewEntry(state, players, actions.length, ctx.now));
  };

  apply({ kind: 'system', source: 'timer' }, { type: 'begin' });
  while (actions.length < 500 && undercoverModule.getResult(state) === null) {
    const step = nextUndercoverStep(state);
    apply(step.actor, step.action);
  }

  const result = undercoverModule.getResult(state);
  if (result === null) throw new Error('谁是卧底基线超过 500 步仍未结束');
  if (result.winner === null || result.aborted) throw new Error('谁是卧底基线未产生唯一胜方');
  const views = playerViews(players, state, (current, playerId) => undercoverModule.getPlayerView(current, playerId));
  const spectatorView = undercoverModule.getSpectatorView(state);

  return {
    rulesetId: 'undercover_classic_v1',
    seed,
    players,
    actions,
    viewTimeline,
    views,
    spectatorView,
    finalState: state,
    result,
    randomCursor: random.getCursor(),
  };
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => [key, normalizeJson(record[key])]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(normalizeJson(value), null, 2)}\n`;
}

export async function writeD1Baselines(): Promise<void> {
  const targets: Array<{ path: string; baseline: UnoBaseline | UndercoverBaseline }> = [
    {
      path: resolve(ROOT, 'packages/games/uno/tests/fixtures/d1/uno-legacy-platform-v1.json'),
      baseline: generateUnoBaseline(),
    },
    {
      path: resolve(ROOT, 'packages/games/undercover/tests/fixtures/d1/undercover-classic-v1.json'),
      baseline: generateUndercoverBaseline(),
    },
  ];

  for (const target of targets) {
    await mkdir(dirname(target.path), { recursive: true });
    await writeFile(target.path, stableStringify(target.baseline), 'utf8');
    console.log(`已生成 ${target.path}`);
  }
}

const invokedDirectly = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;
if (invokedDirectly) await writeD1Baselines();
