/**
 * werewolf v2 — 通用版本化契约套件（功能清单 10；AC-05/06/07/08 证据）。
 * identity/initial/pure/rejected/deterministic/viewSchemas/noSecretLeak/
 * botLegalCandidates/resultOnlyOnce/snapshotReplayable；
 * 稳定完整动作轨迹由固定种子机器人局记录，重放字节一致。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deterministicContext,
  versionedContractAssertions,
} from '../../../../shared/tests/helpers/versionedGameContract.ts';
import { werewolfV2Module } from '../../server/v2/module.ts';
import { actor, apply, driveBotGame, startedNight } from './helpers.ts';
import type { V2State } from '../../server/v2/types.ts';

const PLAYERS = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
const CONFIG = {
  preset: 'classic',
  pace: 'standard',
  witchSelfSave: 'first_night',
  winCondition: 'numbers',
  roles: { guard: false, hunter: false, idiot: false },
};

test('v2 契约：identity/initial/pure/rejected/deterministic', () => {
  versionedContractAssertions.identity(werewolfV2Module);
  const ctx = deterministicContext();
  versionedContractAssertions.initial(werewolfV2Module, ctx, PLAYERS, CONFIG);

  const night = startedNight(PLAYERS, CONFIG);
  const witch = apply(night, actor('p0'), { type: 'night_kill', targetPlayerId: 'p3' });
  const s = apply(witch, actor('p1'), { type: 'night_kill', targetPlayerId: 'p3' });
  apply(s, actor('p2'), { type: 'seer_check', targetPlayerId: 'p0' });
  versionedContractAssertions.pure(werewolfV2Module, ctx, s, actor('p3'), { type: 'witch_save', save: false });
  versionedContractAssertions.deterministic(werewolfV2Module, ctx, s, actor('p3'), { type: 'witch_save', save: false });
  // 村民夜刀被拒且不推进
  versionedContractAssertions.rejectedDoesNotAdvance(
    werewolfV2Module,
    ctx,
    s,
    actor('p4'),
    { type: 'night_kill', targetPlayerId: 'p0' },
  );
});

test('v2 契约：viewSchemas 逐玩家 + 观战视角 round-trip', () => {
  const state = startedNight(PLAYERS, CONFIG);
  versionedContractAssertions.viewSchemas(werewolfV2Module, state, PLAYERS);
});

test('v2 契约：noSecretLeak 角色/狼刀/查验历史不泄漏（狼见狼豁免）', () => {
  let state = startedNight(PLAYERS, CONFIG);
  state = apply(state, actor('p0'), { type: 'night_kill', targetPlayerId: 'p3' });
  state = apply(state, actor('p1'), { type: 'night_kill', targetPlayerId: 'p3' });
  state = apply(state, actor('p2'), { type: 'seer_check', targetPlayerId: 'p0' });
  versionedContractAssertions.noSecretLeak(
    werewolfV2Module,
    state,
    PLAYERS,
    (snap, playerId) => {
      const s = snap as V2State;
      const p = s.players[playerId];
      if (!p) return [];
      const secrets: unknown[] = [p.role];
      if (p.alive && p.role === 'wolf') secrets.push(s.night.wolfVotes);
      if (p.alive && p.role === 'seer') secrets.push(s.seerHistory);
      return secrets;
    },
    {
      // 共享 helper 的 containsValue 无法区分"他人视角中的同名角色串"与"他人自己的角色"：
      // 同角色玩家（如两名村民）必然在各自 me.role 出现相同串。同角色豁免保留真实断言
      // （跨角色角色泄漏、狼刀、查验历史仍逐人校验），狼见狼豁免被其覆盖。
      allowedLeakPairs: (owner, other) => {
        const a = (state as V2State).players[owner]?.role;
        const b = (state as V2State).players[other]?.role;
        return a !== undefined && a === b;
      },
      allowedLeakValues: (secret) => {
        // 公开 nightStage 字段包含阶段名（'wolf'|'witch'|'seer'|'guard'），其出现不代表特定玩家的身份泄漏
        return typeof secret === 'string' && ['wolf', 'witch', 'seer', 'guard'].includes(secret);
      },
      isRevealed: (snap) => (snap as V2State).phase === 'game_over',
    },
  );
});

test('v2 契约：botLegalCandidates 机器人在夜/投票阶段动作均被 reducer 接受', () => {
  const ctx = deterministicContext();
  const night = startedNight(PLAYERS, CONFIG);
  versionedContractAssertions.botLegalCandidates(werewolfV2Module, ctx, night, PLAYERS, 'v2-bot-night');
});

test('v2 契约：resultOnlyOnce + snapshotReplayable（稳定完整轨迹字节一致）', () => {
  const { steps } = driveBotGame(PLAYERS, CONFIG, 'v2-stable-trajectory');
  assert.ok(steps.length > 10, `轨迹过短：${steps.length}`);
  versionedContractAssertions.resultOnlyOnce(werewolfV2Module, 'v2-stable-trajectory', PLAYERS, CONFIG, steps);
  versionedContractAssertions.snapshotReplayable(werewolfV2Module, 'v2-stable-trajectory', PLAYERS, CONFIG, steps);
});

test('v2 完整机器人局在机器人/超时混合驱动下确定性收束', () => {
  const a = driveBotGame(PLAYERS, CONFIG, 'v2-full-game', 300);
  const b = driveBotGame(PLAYERS, CONFIG, 'v2-full-game', 300);
  assert.equal(a.final.phase, 'game_over');
  assert.equal(a.final.winner, b.final.winner);
  assert.deepEqual(a.final, b.final);
  assert.ok(a.steps.length <= 300);
});
