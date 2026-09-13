/**
 * werewolf v2 — 严格 config/action/state 契约（AC-01/AC-02 + 功能清单 1、9）。
 * 规则集身份固定为 werewolf_platform_open_kill_v1（wolfKillScope=any），
 * 拒绝矛盾/未知字段；snapshotMigrations 为空（新模块 schema v1）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { werewolfV2Module } from '../../server/v2/module.ts';
import { IDENTITY_CTX } from './helpers.ts';

test('v2 identity/registeredRulesets/defaultRuleset 固定为 open-kill', () => {
  assert.deepEqual(werewolfV2Module.identity, {
    engineContractVersion: 2,
    rulesetId: 'werewolf_platform_open_kill_v1',
    viewVersion: 1,
  });
  assert.deepEqual(werewolfV2Module.registeredRulesets, ['werewolf_platform_open_kill_v1']);
  assert.equal(werewolfV2Module.defaultRulesetId, 'werewolf_platform_open_kill_v1');
  assert.equal(werewolfV2Module.manifest.id, 'werewolf');
  assert.equal(werewolfV2Module.manifest.minPlayers, 6);
  assert.equal(werewolfV2Module.manifest.maxPlayers, 12);
  assert.equal(werewolfV2Module.manifest.stateSchemaVersion, 1);
  assert.deepEqual(werewolfV2Module.snapshotMigrations, {});
});

test('v2 parseConfig 默认值与合法 open-kill 配置', () => {
  const defaults = werewolfV2Module.parseConfig({});
  assert.deepEqual(defaults, {
    rulesetId: 'werewolf_platform_open_kill_v1',
    preset: 'classic',
    pace: 'standard',
    witchSelfSave: 'first_night',
    winCondition: 'numbers',
    wolfKillScope: 'any',
    roles: { guard: false, hunter: false, idiot: false },
    freeDiscussion: true,
    wolfDelta: 0,
  });
  const explicit = werewolfV2Module.parseConfig({
    rulesetId: 'werewolf_platform_open_kill_v1',
    preset: 'advanced',
    pace: 'fast',
    witchSelfSave: 'always',
    winCondition: 'roles',
    wolfKillScope: 'any',
    roles: { guard: true, hunter: true, idiot: true },
    wolfDelta: 1,
  });
  assert.deepEqual(explicit.roles, { guard: true, hunter: true, idiot: true });
  assert.equal(explicit.wolfDelta, 1);
  assert.deepEqual(werewolfV2Module.parseConfig({ wolfKillScope: 'any' }).rulesetId, 'werewolf_platform_open_kill_v1');
  assert.throws(() => werewolfV2Module.parseConfig({ wolfDelta: 2 }));
  assert.throws(() => werewolfV2Module.parseConfig({ wolfDelta: -2 }));
});

test('v2 parseConfig 拒绝非 open-kill / 矛盾 / 未知字段', () => {
  assert.throws(() => werewolfV2Module.parseConfig({ rulesetId: 'werewolf_legacy_platform_v2' }));
  assert.throws(() => werewolfV2Module.parseConfig({ rulesetId: 'unknown_ruleset' }));
  assert.throws(() => werewolfV2Module.parseConfig({ wolfKillScope: 'non_wolf' }));
  assert.throws(() => werewolfV2Module.parseConfig({ wolfKillScope: 'self_only' }));
  assert.throws(() => werewolfV2Module.parseConfig({
    rulesetId: 'werewolf_platform_open_kill_v1',
    wolfKillScope: 'non_wolf',
  }));
  assert.throws(() => werewolfV2Module.parseConfig({ extra: 1 }));
  assert.throws(() => werewolfV2Module.parseConfig({ preset: 'custom' }));
  assert.throws(() => werewolfV2Module.parseConfig({ pace: 'ultra' }));
  assert.throws(() => werewolfV2Module.parseConfig({ witchSelfSave: 'sometimes' }));
  assert.throws(() => werewolfV2Module.parseConfig({ winCondition: 'score' }));
  assert.throws(() => werewolfV2Module.parseConfig({ roles: { guard: 'yes' } }));
  assert.throws(() => werewolfV2Module.parseConfig({ roles: { guard: true, extra: true } }));
});

test('v2 parseAction 严格拒绝未知键/非法值/未知类型', () => {
  assert.deepEqual(werewolfV2Module.parseAction({ type: 'begin' }), { type: 'begin' });
  assert.deepEqual(werewolfV2Module.parseAction({ type: 'confirm_role' }), { type: 'confirm_role' });
  assert.deepEqual(werewolfV2Module.parseAction({ type: 'night_kill', targetPlayerId: 'p1' }), {
    type: 'night_kill',
    targetPlayerId: 'p1',
  });
  assert.deepEqual(werewolfV2Module.parseAction({ type: 'witch_save', save: false }), { type: 'witch_save', save: false });
  assert.deepEqual(werewolfV2Module.parseAction({ type: 'witch_poison', targetPlayerId: null }), {
    type: 'witch_poison',
    targetPlayerId: null,
  });
  assert.deepEqual(werewolfV2Module.parseAction({ type: 'guard_guard', targetPlayerId: null }), {
    type: 'guard_guard',
    targetPlayerId: null,
  });
  assert.deepEqual(werewolfV2Module.parseAction({ type: 'hunter_shoot', targetPlayerId: null }), {
    type: 'hunter_shoot',
    targetPlayerId: null,
  });
  assert.deepEqual(werewolfV2Module.parseAction({ type: 'day_vote', targetPlayerId: null }), {
    type: 'day_vote',
    targetPlayerId: null,
  });
  assert.throws(() => werewolfV2Module.parseAction({ type: 'begin', extra: 1 }));
  assert.throws(() => werewolfV2Module.parseAction({ type: 'confirm_role', extra: 1 }));
  assert.throws(() => werewolfV2Module.parseAction({ type: 'night_kill' }));
  assert.throws(() => werewolfV2Module.parseAction({ type: 'night_kill', targetPlayerId: '' }));
  assert.throws(() => werewolfV2Module.parseAction({ type: 'witch_save', save: 'yes' }));
  assert.throws(() => werewolfV2Module.parseAction({ type: 'unknown_type' }));
  assert.throws(() => werewolfV2Module.parseAction({ type: 'phase_timeout', phase: 'nope', day: 1, token: 't' }));
  assert.throws(() => werewolfV2Module.parseAction({ type: 'phase_timeout', phase: 'night', day: -1, token: 't' }));
  assert.throws(() => werewolfV2Module.parseAction({ type: 'player_forfeited', playerIds: [] }));
});

test('v2 createInitialState 人数边界 6-12，越界与重复拒绝', () => {
  const six = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
  assert.ok(werewolfV2Module.createInitialState(IDENTITY_CTX, six, werewolfV2Module.parseConfig({})));
  const twelve = Array.from({ length: 12 }, (_, i) => `p${i}`);
  assert.ok(werewolfV2Module.createInitialState(IDENTITY_CTX, twelve, werewolfV2Module.parseConfig({})));
  assert.throws(() => werewolfV2Module.createInitialState(IDENTITY_CTX, ['p0', 'p1', 'p2', 'p3', 'p4'], werewolfV2Module.parseConfig({})));
  assert.throws(() => werewolfV2Module.createInitialState(IDENTITY_CTX, Array.from({ length: 13 }, (_, i) => `p${i}`), werewolfV2Module.parseConfig({})));
  assert.throws(() => werewolfV2Module.createInitialState(IDENTITY_CTX, ['p0', 'p0', 'p1', 'p2', 'p3', 'p4'], werewolfV2Module.parseConfig({})));
});

test('v2 parseState/parsePlayerView/parseSpectatorView 拒绝未知字段（严格 schema）', () => {
  const state = werewolfV2Module.createInitialState(IDENTITY_CTX, ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'], werewolfV2Module.parseConfig({}));
  assert.equal(state.schemaVersion, 1);
  assert.doesNotThrow(() => werewolfV2Module.parseState(state));
  assert.doesNotThrow(() => werewolfV2Module.parsePlayerView(werewolfV2Module.getPlayerView(state, 'p0')));
  assert.doesNotThrow(() => werewolfV2Module.parseSpectatorView(werewolfV2Module.getSpectatorView(state)));
  assert.throws(() => werewolfV2Module.parseState({ ...state, hackerField: true }));
  assert.throws(() => werewolfV2Module.parsePlayerView({ ...werewolfV2Module.getPlayerView(state, 'p0'), secret: 1 }));
  assert.throws(() => werewolfV2Module.parseSpectatorView({ ...werewolfV2Module.getSpectatorView(state), reveal: {} }));
});
