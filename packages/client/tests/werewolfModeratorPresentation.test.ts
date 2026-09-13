/**
 * 狼人杀「真人主持」表现层映射测试。
 * 重点是座位号的唯一权威来源（房间席位）与角色信息的不泄露边界。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  RoomMemberView,
  WerewolfModeratorPlayerSummary,
  WerewolfModeratorView,
  WerewolfRoleInfo,
} from '@ldj/shared';
import { WEREWOLF_ROLE_DEFS } from '@ldj/shared';
import {
  buildModeratorConsoleModel,
  buildModeratorPlayerModel,
  buildModeratorSeats,
} from '../src/game/werewolf/moderator/presentation.ts';

function member(
  playerId: string,
  seat: number,
  nickname: string,
  overrides: Partial<RoomMemberView> = {},
): RoomMemberView {
  return {
    playerId,
    nickname,
    seatRole: 'player',
    seat,
    isHost: false,
    connectionStatus: 'CONNECTED',
    botKind: null,
    ready: true,
    ...overrides,
  };
}

function playerSummary(
  playerId: string,
  seat: number,
  overrides: Partial<WerewolfModeratorPlayerSummary> = {},
): WerewolfModeratorPlayerSummary {
  return { playerId, seat, isEliminated: false, ...overrides };
}

function moderatorView(overrides: Partial<WerewolfModeratorView> = {}): WerewolfModeratorView {
  return {
    rulesetId: 'werewolf_moderator_v1',
    isModerator: false,
    moderatorPlayerId: 'host',
    gameEnded: false,
    winner: null,
    players: [
      playerSummary('p1', 1),
      playerSummary('p2', 2),
      playerSummary('p3', 3),
    ],
    ...overrides,
  };
}

/**
 * 房主占房间 1 号位、抽卡玩家为房间 2..4 号。
 * 服务端 view.players[].seat 为剔除主持人后重编的 1..3 —— UI 必须显示房间席位。
 */
const roomMembers: RoomMemberView[] = [
  member('host', 1, '房主', { isHost: true }),
  member('p1', 2, '玩家甲'),
  member('p2', 3, '玩家乙'),
  member('p3', 4, '玩家丙'),
];

test('席位号取自房间席位，与大厅一致（不采用服务端重编的对局席位）', () => {
  const seats = buildModeratorSeats(moderatorView(), roomMembers);

  assert.deepEqual(seats.map((seat) => seat.seatLabel), ['2 号', '3 号', '4 号']);
  assert.deepEqual(seats.map((seat) => seat.seatNumber), [2, 3, 4]);
  assert.deepEqual(seats.map((seat) => seat.name), ['玩家甲', '玩家乙', '玩家丙']);
});

test('席位按房间席位升序，与权威视角中的玩家顺序无关', () => {
  const seats = buildModeratorSeats(
    moderatorView({
      players: [playerSummary('p3', 3), playerSummary('p1', 1), playerSummary('p2', 2)],
    }),
    roomMembers,
  );

  assert.deepEqual(seats.map((seat) => seat.seatLabel), ['2 号', '3 号', '4 号']);
});

test('成员缺失时使用不泄露内部 ID 的兜底文案并排在末尾', () => {
  const seats = buildModeratorSeats(moderatorView(), [
    roomMembers[0]!,
    roomMembers[1]!,
    roomMembers[3]!,
  ]);

  assert.equal(seats.length, 3);
  const last = seats.at(-1)!;
  assert.equal(last.playerId, 'p2');
  assert.equal(last.seatLabel, '—');
  assert.equal(last.seatNumber, null);
  assert.ok(!last.name.includes('p2'), '兜底文案不得包含内部 playerId');
  assert.equal(last.offline, true, '房间快照中已无该成员，应视为离线');
});

test('离线标记来自成员连接状态', () => {
  const seats = buildModeratorSeats(moderatorView(), [
    roomMembers[0]!,
    member('p1', 2, '玩家甲', { connectionStatus: 'DISCONNECTED_RESERVED' }),
    roomMembers[2]!,
    roomMembers[3]!,
  ]);

  assert.equal(seats.find((seat) => seat.playerId === 'p1')?.offline, true);
  assert.equal(seats.find((seat) => seat.playerId === 'p2')?.offline, false);
});

test('玩家端终局前不泄露任何他人角色，终局后公开', () => {
  const beforeEnd = buildModeratorPlayerModel(moderatorView(), roomMembers, { selfId: 'p1' });
  assert.deepEqual(beforeEnd.seats.map((seat) => seat.revealedRoleLabel), [null, null, null]);
  assert.equal(beforeEnd.reveal, null);
  assert.equal(beforeEnd.self, null);

  const roleInfo: WerewolfRoleInfo = WEREWOLF_ROLE_DEFS.seer;
  const afterEnd = buildModeratorPlayerModel(
    moderatorView({
      gameEnded: true,
      winner: 'werewolf',
      myRole: roleInfo,
      isMeEliminated: true,
      players: [
        playerSummary('p1', 1, { isEliminated: true, role: 'seer', roleInfo }),
        playerSummary('p2', 2, { role: 'wolf', roleInfo: WEREWOLF_ROLE_DEFS.wolf }),
        playerSummary('p3', 3, { role: 'villager', roleInfo: WEREWOLF_ROLE_DEFS.villager }),
      ],
    }),
    roomMembers,
    { selfId: 'p1' },
  );

  assert.deepEqual(afterEnd.seats.map((seat) => seat.revealedRoleLabel), ['预言家', '狼人', '普通村民']);
  assert.equal(afterEnd.self?.name, '预言家');
  assert.equal(afterEnd.selfAlive, false);
  assert.equal(afterEnd.aliveCount, 2);
  assert.equal(afterEnd.reveal?.headline, '狼人阵营获胜');
  assert.equal(afterEnd.reveal?.rows.length, 3);
});

test('终局复盘行的名字与席位模型一致（GameOverReveal 依赖按名字匹配）', () => {
  const model = buildModeratorPlayerModel(
    moderatorView({
      gameEnded: true,
      winner: 'good',
      players: [
        playerSummary('p1', 1, { role: 'villager', roleInfo: WEREWOLF_ROLE_DEFS.villager }),
        playerSummary('p2', 2, { role: 'wolf', roleInfo: WEREWOLF_ROLE_DEFS.wolf }),
        playerSummary('p3', 3, { role: 'seer', roleInfo: WEREWOLF_ROLE_DEFS.seer }),
      ],
    }),
    roomMembers,
  );

  assert.equal(model.reveal?.headline, '好人阵营获胜');
  for (const row of model.reveal!.rows) {
    assert.ok(model.seats.some((seat) => seat.name === row.name), `复盘行 ${row.name} 必须能匹配到席位`);
  }
});

test('观战模型不含自身角色，也不泄露终局前他人角色', () => {
  const model = buildModeratorPlayerModel(moderatorView(), roomMembers, { spectator: true });

  assert.equal(model.spectator, true);
  assert.equal(model.self, null);
  assert.deepEqual(model.seats.map((seat) => seat.revealedRoleLabel), [null, null, null]);
});

test('主持台模型映射法官席位、统计与胜负提示', () => {
  const model = buildModeratorConsoleModel(
    moderatorView({
      isModerator: true,
      statistics: {
        aliveWolves: 2,
        aliveGods: 2,
        aliveVillagers: 1,
        totalAlive: 5,
        totalEliminated: 1,
        totalPlayers: 6,
      },
      suggestedOutcome: 'village_win',
      suggestedOutcomeReason: '所有狼人均已出局，好人阵营获胜！',
    }),
    roomMembers,
  );

  assert.equal(model.moderatorSeatLabel, '1 号');
  assert.deepEqual(model.summary, {
    aliveWolves: 2,
    aliveGods: 2,
    aliveVillagers: 1,
    aliveTotal: 5,
    total: 6,
  });
  assert.deepEqual(model.suggestion, {
    outcome: 'village_win',
    reason: '所有狼人均已出局，好人阵营获胜！',
  });
  assert.deepEqual(model.seats.map((seat) => seat.seatLabel), ['2 号', '3 号', '4 号']);
});

test('主持台无统计或无提示原因时不伪造建议', () => {
  const model = buildModeratorConsoleModel(
    moderatorView({ isModerator: true, suggestedOutcome: 'village_win' }),
    roomMembers,
  );

  assert.equal(model.summary, null);
  assert.equal(model.suggestion, null);
  assert.equal(model.moderatorSeatLabel, '1 号');
});

test('法官不在抽卡玩家列表中时仍能解析其席位标签', () => {
  const seats = buildModeratorSeats(moderatorView(), roomMembers);
  assert.ok(!seats.some((seat) => seat.playerId === 'host'), '法官不得出现在抽卡玩家席位中');

  const withoutHost = buildModeratorConsoleModel(moderatorView(), [roomMembers[1]!]);
  assert.equal(withoutHost.moderatorSeatLabel, '—');
});
