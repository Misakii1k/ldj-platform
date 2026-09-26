import { test } from 'node:test';
import assert from 'node:assert/strict';
import { werewolfModule, WEREWOLF_STATE_SCHEMA_VERSION } from '../server/module.ts';
import type { WerewolfState } from '../server/module.ts';

const DUMMY_CTX = {
  now: 1_700_000_000_000,
  random: {
    nextInt: () => 0,
    shuffle: <T>(items: readonly T[]) => [...items],
  },
};

const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

test('legacy werewolf: schemaVersion 升级至 5，新局初始化 timelineState version 1', () => {
  assert.equal(WEREWOLF_STATE_SCHEMA_VERSION, 5);
  const config = werewolfModule.parseConfig({});
  const state = werewolfModule.createInitialState(DUMMY_CTX, PLAYERS, config);
  assert.equal(state.schemaVersion, 5);
  assert.ok(state.timelineState);
  assert.equal(state.timelineState.version, 1);
  assert.equal(state.timelineState.current.period, 'day');
  assert.equal(state.timelineState.current.segment, 'confirm');

  const pub = werewolfModule.getSpectatorView(state);
  assert.equal(pub.schemaVersion, 5);
  assert.ok(pub.timeline);
  assert.equal(pub.timeline.id, state.timelineState.current.id);
  assert.equal('timelineState' in pub, false);
});

test('legacy werewolf: v4 快照成功迁移至 v5，timelineState=null，保留原有行动/阶段/计时', () => {
  const config = werewolfModule.parseConfig({ pace: 'fast' });
  const fresh = werewolfModule.createInitialState(DUMMY_CTX, PLAYERS, config);

  // 模拟一个处于 night 阶段的 v4 快照（无 timelineState）
  const v4Snapshot: Record<string, unknown> = {
    ...fresh,
    schemaVersion: 4,
    phase: 'night',
    day: 1,
    deadlineAt: 1_700_000_020_000,
    phaseToken: 'night:1',
    night: {
      wolfVotes: { p1: 'p5' },
      killTargetId: null,
      seerChecked: false,
      seerResult: null,
      witchSaveDecision: null,
      witchPoisonDecided: false,
      witchPoisonTargetId: null,
      guardDecided: false,
      guardTargetId: null,
    },
  };
  delete v4Snapshot.timelineState;

  const migrated = werewolfModule.migrateSnapshot!(4, v4Snapshot) as WerewolfState;
  assert.equal(migrated.schemaVersion, 5);
  assert.equal(migrated.timelineState, null);
  assert.equal(migrated.phase, 'night');
  assert.equal(migrated.day, 1);
  assert.equal(migrated.deadlineAt, 1_700_000_020_000);
  assert.equal(migrated.phaseToken, 'night:1');
  assert.deepEqual(migrated.night.wolfVotes, { p1: 'p5' });

  // 视图投影在旧局中 timeline 为 null
  const pub = werewolfModule.getSpectatorView(migrated);
  assert.equal(pub.timeline, null);
});
