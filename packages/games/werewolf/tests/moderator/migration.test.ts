import { test } from 'node:test';
import assert from 'node:assert/strict';
import { werewolfModeratorModule } from '../../server/moderator/module.ts';
import type { ModeratorState } from '../../server/moderator/types.ts';

const PLAYERS = ['mod', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const DUMMY_CTX = {
  now: 1_000_000,
  random: {
    nextInt: () => 0,
    shuffle: <T>(items: readonly T[]) => [...items],
  },
};

test('moderator: schemaVersion 升级至 2，新局初始化 manual/day/confirm，旧快照迁移 timelineState=null', () => {
  const config = werewolfModeratorModule.parseConfig({
    moderatorPlayerId: 'mod',
    roles: { guard: true, hunter: true, idiot: false },
  });
  const state = werewolfModeratorModule.createInitialState(DUMMY_CTX, PLAYERS, config);
  assert.equal(state.schemaVersion, 2);
  assert.ok(state.timelineState);
  assert.equal(state.timelineState.current.mode, 'manual');
  assert.equal(state.timelineState.current.period, 'day');
  assert.equal(state.timelineState.current.segment, 'confirm');
  assert.equal(state.timelineState.activeTimerToken, null);

  // 视图投影
  const pub = werewolfModeratorModule.getPlayerView(state, 'p1');
  assert.ok(pub.timeline);
  assert.equal(pub.timeline.segment, 'confirm');
  assert.equal(pub.timeline.mode, 'manual');

  // 旧快照迁移 1 -> 2
  const v1Snapshot: any = {
    schemaVersion: 1,
    moderatorPlayerId: 'mod',
    playerOrder: ['p1', 'p2', 'p3', 'p4', 'p5'],
    assignedRoles: { p1: 'wolf', p2: 'villager', p3: 'seer', p4: 'witch', p5: 'hunter' },
    eliminatedPlayerIds: [],
    gameEnded: false,
    winner: null,
    history: [],
  };
  const migrated = werewolfModeratorModule.snapshotMigrations[1]!(v1Snapshot) as ModeratorState;
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.timelineState, null);

  // 旧局视角
  const oldPub = werewolfModeratorModule.getPlayerView(migrated, 'p1');
  assert.equal(oldPub.timeline, null);
});
