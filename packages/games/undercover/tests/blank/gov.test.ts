/**
 * D4-B GOV 组：独立注册、未验收不 playable、拒绝可变角色语义、
 * 身份公开方式快照锁定、运行中不可改身份配置。
 * 引用 UNDERCOVER-BLANK-GOV-001/002 的 plannedTestIds。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CATALOG } from '@ldj/shared';
import {
  getDefaultRuleset,
  getGameModule,
  getSessionGameModule,
} from '../../../../server/src/core/game/registry.ts';
import { blankModule, BLANK_VERSIONED_IDENTITY } from '../../server/blank/module.ts';
import { init, reduceSystem } from './helpers.ts';

test('undercover_blank_registers_separately_from_classic_test', () => {
  // 身份独立
  assert.deepEqual(BLANK_VERSIONED_IDENTITY, {
    engineContractVersion: 2,
    rulesetId: 'undercover_blank_v1',
    viewVersion: 1,
  });
  assert.equal(blankModule.identity.rulesetId, 'undercover_blank_v1');
  assert.deepEqual(blankModule.registeredRulesets, ['undercover_blank_v1']);
  // 与 classic 并行：注册表可解析 (undercover, undercover_blank_v1)
  const module = getGameModule('undercover', 'undercover_blank_v1');
  assert.ok(module, '注册表应注册 (undercover, undercover_blank_v1)');
  if (module && 'identity' in module) {
    assert.equal(module.identity.rulesetId, 'undercover_blank_v1');
  }
  // classic 默认保持不变
  assert.equal(getDefaultRuleset('undercover'), 'undercover_classic_v1');
  const session = { module_id: 'undercover', ruleset_id: 'undercover_blank_v1' } as Parameters<
    typeof getSessionGameModule
  >[0];
  assert.ok(getSessionGameModule(session), '会话级解析应命中 blank 模块');
});

test('undercover_blank_is_not_playable_before_acceptance_test', () => {
  const entry = GAME_CATALOG.find((game) => game.id === 'undercover');
  assert.ok(entry);
  assert.notEqual(entry!.availability, 'playable', 'blank 未独立验收前不得 playable');
  assert.equal(entry!.availability, 'internal_prototype');
});

test('undercover_blank_rejects_mutable_role_semantics_test', () => {
  // 角色语义不可由可变配置覆盖：strict schema 拒绝未知配置键。
  assert.throws(() => blankModule.parseConfig({ roleCount: 2 }), /Unrecognized key|未知/);
  assert.throws(() => blankModule.parseConfig({ roleSemantics: 'two_undercover' }), /Unrecognized key|未知/);
  // 合法配置可解析且默认值正确。
  const config = blankModule.parseConfig({});
  assert.equal(config.revealMode, 'immediate');
  assert.equal(config.speechSeconds, 60);
  assert.equal(config.voteSeconds, 45);
});

test('undercover_blank_reveal_mode_is_snapshot_locked_test', () => {
  const { state } = init(['p1', 'p2', 'p3', 'p4'], { revealMode: 'delayed' });
  assert.equal(state.config.revealMode, 'delayed');
  // 快照（整个 state 序列化）携带 revealMode，整局不可变。
  const snapshot = JSON.parse(JSON.stringify(state)) as { config: { revealMode: string } };
  assert.equal(snapshot.config.revealMode, 'delayed');
});

test('undercover_blank_midgame_identity_config_change_is_rejected_test', () => {
  const { state, ctx } = init(['p1', 'p2', 'p3', 'p4'], { revealMode: 'immediate' });
  // 推进若干动作后 revealMode 保持初始值（无任何动作可改写身份配置）。
  let current = state;
  const out = reduceSystem(current, { type: 'begin' }, ctx);
  current = out.state;
  assert.equal(current.config.revealMode, 'immediate');
  // 非法系统动作（改身份配置）被 parseAction 拒绝。
  assert.throws(
    () => blankModule.parseAction({ type: 'set_reveal_mode', mode: 'delayed' }),
    /Invalid discriminator|未知/,
  );
});
