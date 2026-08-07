/**
 * landlord_platform_v1 — 通用版本化契约套件（D5 P2a）。
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
import { landlordPlatformModule } from '../../server/platform/module.ts';
import { actor, apply, driveBotGame, init, makeCtx, startedPlaying, system } from './helpers.ts';
import type { PlatformState } from '../../server/platform/types.ts';

const PLAYERS = ['p0', 'p1', 'p2'];
const CONFIG = {};

test('platform 契约：identity/initial/pure/rejected/deterministic', () => {
  versionedContractAssertions.identity(landlordPlatformModule);
  const ctx = deterministicContext();
  versionedContractAssertions.initial(landlordPlatformModule, ctx, PLAYERS, CONFIG);

  const s = startedPlaying(PLAYERS, [2, 0, 1]);
  const landlordCard = s.hands.p0![0]!;
  versionedContractAssertions.pure(landlordPlatformModule, ctx, s, actor('p0'), { type: 'play_combo', cardIds: [landlordCard.id] });
  versionedContractAssertions.deterministic(landlordPlatformModule, ctx, s, actor('p0'), { type: 'play_combo', cardIds: [landlordCard.id] });
  // 未轮到 p1：过牌被拒且不推进
  versionedContractAssertions.rejectedDoesNotAdvance(landlordPlatformModule, ctx, s, actor('p1'), { type: 'pass_turn' });
});

test('platform 契约：viewSchemas 逐玩家 + 观战视角 round-trip', () => {
  const s = startedPlaying(PLAYERS, [2, 0, 0]);
  versionedContractAssertions.viewSchemas(landlordPlatformModule, s, PLAYERS);
});

test('platform 契约：noSecretLeak 他人手牌/底牌不泄漏', () => {
  let s = startedPlaying(PLAYERS, [2, 0, 0]);
  s = apply(s, actor('p0'), { type: 'play_combo', cardIds: [s.hands.p0![0]!.id] });
  versionedContractAssertions.noSecretLeak(
    landlordPlatformModule,
    s,
    PLAYERS,
    (snap, playerId) => {
      const st = snap as PlatformState;
      const secrets: unknown[] = [...(st.hands[playerId] ?? [])];
      if (st.landlordId === playerId) secrets.push(...st.bottomCards);
      return secrets;
    },
    { isRevealed: () => false },
  );
});

test('platform 契约：botLegalCandidates 机器人在叫分/出牌阶段动作均被 reducer 接受', () => {
  const ctx = makeCtx('landlord-bot-legal');
  const bidding = apply(init(PLAYERS, CONFIG, ctx), system, { type: 'begin' }, ctx);
  versionedContractAssertions.botLegalCandidates(landlordPlatformModule, ctx, bidding, PLAYERS, 'landlord-bot-bid');
  const playing = startedPlaying(PLAYERS, [2, 0, 1], ctx);
  versionedContractAssertions.botLegalCandidates(landlordPlatformModule, ctx, playing, PLAYERS, 'landlord-bot-play');
});

test('platform 契约：resultOnlyOnce + snapshotReplayable（稳定完整轨迹字节一致）', () => {
  const { steps } = driveBotGame(PLAYERS, CONFIG, 'landlord-platform-stable');
  assert.ok(steps.length > 10, `轨迹过短：${steps.length}`);
  versionedContractAssertions.resultOnlyOnce(landlordPlatformModule, 'landlord-platform-stable', PLAYERS, CONFIG, steps);
  versionedContractAssertions.snapshotReplayable(landlordPlatformModule, 'landlord-platform-stable', PLAYERS, CONFIG, steps);
});

test('platform 完整机器人局在机器人/超时混合驱动下确定性收束', () => {
  const a = driveBotGame(PLAYERS, CONFIG, 'landlord-platform-full', 300);
  const b = driveBotGame(PLAYERS, CONFIG, 'landlord-platform-full', 300);
  assert.equal(a.final.phase, 'game_over');
  assert.equal(a.final.winnerTeam, b.final.winnerTeam);
  assert.deepEqual(a.final, b.final);
  assert.ok(a.steps.length <= 300);
});
