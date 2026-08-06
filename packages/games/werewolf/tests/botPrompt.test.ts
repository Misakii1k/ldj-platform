import test from 'node:test';
import assert from 'node:assert/strict';
import type { Actor, BotDecisionInput, GameContext } from '@ldj/shared';
import { werewolfModule, type WerewolfAction, type WerewolfConfig, type WerewolfPlayerView, type WerewolfState } from '../server/module.ts';

const ids = ['w1', 'w2', 's', 'x', 'g', 'v'];
const system: Actor = { kind: 'system', source: 'admin' };
const actor = (playerId: string): Actor => ({ kind: 'player', playerId });
const ctx: GameContext = {
  now: 1,
  random: {
    nextInt: () => 0,
    shuffle: <T>(items: readonly T[]) => [...items],
  },
};

function config(open: boolean, winCondition: 'numbers' | 'roles' = 'numbers'): WerewolfConfig {
  return {
    rulesetId: open ? 'werewolf_platform_open_kill_v1' : 'werewolf_legacy_platform_v2',
    preset: 'classic',
    pace: 'standard',
    witchSelfSave: 'first_night',
    winCondition,
    wolfKillScope: open ? 'any' : 'non_wolf',
    roles: { guard: false, hunter: false, idiot: true },
  };
}

function apply(state: WerewolfState, by: Actor, action: WerewolfAction): WerewolfState {
  const result = werewolfModule.reduce(ctx, state, by, action);
  if (!result.ok) assert.fail(result.message);
  return result.state;
}

function initialState(open: boolean, winCondition: 'numbers' | 'roles' = 'numbers'): WerewolfState {
  return werewolfModule.createInitialState(ctx, ids, config(open, winCondition));
}

function nightState(open: boolean): WerewolfState {
  let state = apply(initialState(open), system, { type: 'begin' });
  for (const id of ids) state = apply(state, actor(id), { type: 'confirm_role' });
  assert.equal(state.phase, 'night');
  return state;
}

function input(view: WerewolfPlayerView, index = 0): BotDecisionInput<WerewolfPlayerView> {
  return {
    view,
    playerId: 'w1',
    random: {
      nextInt: (min, max) => Math.min(max - 1, min + index),
      shuffle: <T>(items: readonly T[]) => [...items],
    },
  };
}

test('规则机器人和 LLM 候选都按规则集开放或限制自刀与同伴刀', () => {
  const openView = werewolfModule.getPlayerView(nightState(true), 'w1');
  const openRule = werewolfModule.pickBotAction?.(input(openView));
  assert.deepEqual(openRule, { type: 'night_kill', targetPlayerId: 'w1' });
  const openPrompt = werewolfModule.buildBotPrompt?.(input(openView));
  assert.deepEqual(openPrompt?.options.map((option) => option.id), ids);
  assert.match(openPrompt?.roleBrief ?? '', /包括你自己和狼同伴/);

  const legacyView = werewolfModule.getPlayerView(nightState(false), 'w1');
  const legacyRule = werewolfModule.pickBotAction?.(input(legacyView));
  assert.deepEqual(legacyRule, { type: 'night_kill', targetPlayerId: 's' });
  const legacyPrompt = werewolfModule.buildBotPrompt?.(input(legacyView));
  assert.deepEqual(legacyPrompt?.options.map((option) => option.id), ['s', 'x', 'g', 'v']);
  assert.match(legacyPrompt?.roleBrief ?? '', /不能投给狼同伴，也不能投给自己/);
});

test('LLM 身份提示按人数胜负与屠神规则分别生成', () => {
  const numbers = apply(initialState(false, 'numbers'), system, { type: 'begin' });
  const numbersPrompt = werewolfModule.buildBotPrompt?.(input(werewolfModule.getPlayerView(numbers, 'w1')));
  assert.match(numbersPrompt?.roleBrief ?? '', /狼人数量达到其他存活玩家数量/);
  assert.doesNotMatch(numbersPrompt?.roleBrief ?? '', /屠神规则/);

  const roles = apply(initialState(false, 'roles'), system, { type: 'begin' });
  const rolesPrompt = werewolfModule.buildBotPrompt?.(input(werewolfModule.getPlayerView(roles, 'w1')));
  assert.match(rolesPrompt?.roleBrief ?? '', /屠神规则/);
  assert.match(rolesPrompt?.roleBrief ?? '', /神职全部出局/);
});

test('规则机器人和 LLM 放逐候选都排除已翻牌白痴', () => {
  const state = nightState(false);
  const voting: WerewolfState = {
    ...structuredClone(state),
    phase: 'voting',
    votes: {},
    runoffCandidates: [],
    players: {
      ...structuredClone(state.players),
      g: { ...state.players.g!, idiotRevealed: true },
    },
  };
  assert.equal(voting.players.g?.role, 'idiot');
  const botInput = input(werewolfModule.getPlayerView(voting, 'w1'), 3);
  assert.deepEqual(werewolfModule.pickBotAction?.(botInput), { type: 'day_vote', targetPlayerId: 'v' });
  const prompt = werewolfModule.buildBotPrompt?.(botInput);
  assert.equal(prompt?.options.some((option) => option.id === 'g'), false);
  assert.equal(prompt?.options.at(-1)?.id, 'abstain');
});
