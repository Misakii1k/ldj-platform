import { test } from 'node:test';
import assert from 'node:assert/strict';
import { werewolfV2Module } from '../../server/v2/module.ts';
import { v2StateSchema, v2PublicViewSchema, v2PlayerViewSchema } from '../../server/v2/schemas.ts';
import { init, IDENTITY_CTX } from './helpers.ts';

test('V2 snapshotMigration：schema 1 迁移至 schema 2，旧快照保持 timelineState=null', () => {
  const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const stateV1 = init(players, {}, IDENTITY_CTX);
  // 模拟旧版 schemaVersion 1 快照（无 timelineState）
  const legacyV1Snapshot: Record<string, unknown> = {
    ...stateV1,
    schemaVersion: 1,
  };
  delete legacyV1Snapshot.timelineState;

  // 执行迁移
  const migrator = werewolfV2Module.snapshotMigrations?.[1];
  assert.ok(migrator, 'snapshotMigrations[1] 必须已注册');

  const migrated = migrator(legacyV1Snapshot) as { schemaVersion?: number; timelineState?: unknown };
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.timelineState, null);

  // 校验解析通过
  const parsed = v2StateSchema.safeParse(migrated);
  assert.equal(parsed.success, true);
});

test('V2 createInitialState：新局生成 schemaVersion=2 且具有 timelineState version=1', () => {
  const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const state = init(players, {}, IDENTITY_CTX);

  assert.equal(state.schemaVersion, 2);
  assert.ok(state.timelineState);
  assert.equal(state.timelineState.version, 1);
  assert.equal(state.timelineState.current.day, 0);
  assert.equal(state.timelineState.current.period, 'day');
  assert.equal(state.timelineState.current.segment, 'confirm');

  // 状态通过 schema 校验
  const parsedState = v2StateSchema.safeParse(state);
  assert.equal(parsedState.success, true);

  // 公共视图与玩家视图通过 schema 校验，且仅含 timeline 投影
  const pubView = werewolfV2Module.getSpectatorView(state);
  assert.equal(pubView.schemaVersion, 2);
  assert.ok(pubView.timeline);
  assert.equal(pubView.timeline.id, state.timelineState.current.id);
  assert.equal('timelineState' in pubView, false);

  const parsedPub = v2PublicViewSchema.safeParse(pubView);
  assert.equal(parsedPub.success, true);

  const playerView = werewolfV2Module.getPlayerView(state, 'p1');
  assert.ok(playerView.timeline);
  const parsedPlayer = v2PlayerViewSchema.safeParse(playerView);
  assert.equal(parsedPlayer.success, true);
});

test('V2 view 解析兼容：旧局 timeline=null 与新局 timeline 均合法通过', () => {
  const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const state = init(players, {}, IDENTITY_CTX);
  const pubView = werewolfV2Module.getSpectatorView(state);

  // 新局
  assert.equal(v2PublicViewSchema.safeParse(pubView).success, true);

  // 旧局（timeline 为 null 或 undefined）
  const legacyPubView = {
    ...pubView,
    timeline: null,
  };
  assert.equal(v2PublicViewSchema.safeParse(legacyPubView).success, true);

  const legacyNoTimeline = {
    ...pubView,
  };
  delete (legacyNoTimeline as { timeline?: unknown }).timeline;
  assert.equal(v2PublicViewSchema.safeParse(legacyNoTimeline).success, true);
});
