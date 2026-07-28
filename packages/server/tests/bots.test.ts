/**
 * 机器人与 AI 玩家 · 命令层测试。
 * 覆盖三条关键不变量：
 *   1. 机器人是普通成员，但不能接任房主（否则没人能开局/关房间）
 *   2. 真人全部离开后机器人被清空，房间才能进入空置回收
 *   3. LLM 玩家需要 llmAvailable 才能加入；未配置时明确报错而非静默降级
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, closeDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor, CommandError } from '../src/core/executor.ts';
import { prepareCreateRoom, applyCreateRoom } from '../src/core/commands/createRoom.ts';
import { applyJoinRoom } from '../src/core/commands/joinRoom.ts';
import { applyLeaveRoom } from '../src/core/commands/leaveRoom.ts';
import { applyRoomCommand } from '../src/core/commands/roomCommand.ts';
import {
  listBotMembers,
  isBotMember,
  purgeBotsIfNoHumans,
  BOT_TOKEN_SENTINEL,
} from '../src/core/commands/bots.ts';
import { pickNextHost, markEmptyIfNoActive } from '../src/core/commands/presence.ts';

interface Ctx {
  db: Db;
  executor: RoomCommandExecutor;
  roomId: string;
  roomCode: string;
  hostId: string;
}

let requestCounter = 0;
function nextReq(): string {
  return `bot-req-${++requestCounter}`;
}

async function setup(): Promise<Ctx> {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  const executor = new RoomCommandExecutor(db);
  const { roomId } = prepareCreateRoom();
  const created = await executor.executeCreate({
    roomId,
    actorScope: 'conn:test',
    requestId: nextReq(),
    handler: (tx) => applyCreateRoom(tx, roomId, { nickname: '房主' }),
  });
  return {
    db,
    executor,
    roomId,
    roomCode: created.outcome.roomCode,
    hostId: created.outcome.playerId,
  };
}

/** 以房主身份跑一条 room_command */
async function hostCommand(
  ctx: Ctx,
  data: unknown,
  options: { llmAvailable?: boolean } = {},
) {
  const result = await ctx.executor.executeOnRoom({
    roomId: ctx.roomId,
    actorScope: 'conn:host',
    requestId: nextReq(),
    handler: (tx) =>
      applyRoomCommand(
        tx,
        ctx.roomId,
        ctx.hostId,
        data as never,
        options.llmAvailable === undefined ? {} : { llmAvailable: options.llmAvailable },
      ),
  });
  return result.outcome;
}

test('add_bot：机器人占席位、昵称带前缀、凭证为哨兵值', async () => {
  const ctx = await setup();
  try {
    const outcome = await hostCommand(ctx, { command: 'add_bot', kind: 'rule' });
    assert.ok(outcome.bot, '应返回 bot 信息');
    assert.equal(outcome.bot.kind, 'rule');
    assert.match(outcome.bot.nickname, /^机器人/);

    const member = outcome.snapshot.members.find((m) => m.playerId === outcome.bot!.playerId);
    assert.ok(member, '快照里应有机器人成员');
    assert.equal(member.seatRole, 'player');
    assert.equal(member.botKind, 'rule');
    assert.equal(member.isHost, false);
    // 席位号紧随房主
    assert.equal(member.seat, 2);

    assert.equal(isBotMember(ctx.db, ctx.roomId, outcome.bot.playerId), true);
    assert.equal(isBotMember(ctx.db, ctx.roomId, ctx.hostId), false);

    // 凭证哨兵：不是 64 位 hex，永不可能匹配任何 sha256，机器人无法被 resume 冒用
    const row = ctx.db
      .prepare('SELECT resume_token_hash FROM room_members WHERE room_id = ? AND player_id = ?')
      .get(ctx.roomId, outcome.bot.playerId) as { resume_token_hash: string };
    assert.equal(row.resume_token_hash, BOT_TOKEN_SENTINEL);
    assert.notEqual(row.resume_token_hash.length, 64);
  } finally {
    closeDb(ctx.db);
  }
});

test('add_bot：多个机器人昵称不重复，remove_bot 默认移除最后加入的', async () => {
  const ctx = await setup();
  try {
    const first = await hostCommand(ctx, { command: 'add_bot', kind: 'rule' });
    const second = await hostCommand(ctx, { command: 'add_bot', kind: 'rule' });
    const third = await hostCommand(ctx, { command: 'add_bot', kind: 'rule' });
    const names = new Set([first.bot!.nickname, second.bot!.nickname, third.bot!.nickname]);
    assert.equal(names.size, 3, '昵称应互不相同');
    assert.equal(listBotMembers(ctx.db, ctx.roomId).length, 3);

    // 不指定目标 → 移除席位号最大的那个（最后加入）
    const removed = await hostCommand(ctx, { command: 'remove_bot' });
    assert.equal(removed.bot!.playerId, third.bot!.playerId);
    assert.equal(removed.bot!.kind, null);
    const left = listBotMembers(ctx.db, ctx.roomId).map((b) => b.playerId);
    assert.deepEqual(left.sort(), [first.bot!.playerId, second.bot!.playerId].sort());

    // 指定目标
    await hostCommand(ctx, { command: 'remove_bot', targetPlayerId: first.bot!.playerId });
    assert.deepEqual(
      listBotMembers(ctx.db, ctx.roomId).map((b) => b.playerId),
      [second.bot!.playerId],
    );
  } finally {
    closeDb(ctx.db);
  }
});

test('add_bot：未配置大模型时 llm 机器人被拒绝，规则机器人仍可加', async () => {
  const ctx = await setup();
  try {
    await assert.rejects(
      () => hostCommand(ctx, { command: 'add_bot', kind: 'llm' }, { llmAvailable: false }),
      (err: unknown) => {
        assert.ok(err instanceof CommandError);
        assert.equal(err.code, 'ACTION_NOT_ALLOWED');
        assert.match(err.message, /LLM_BASE_URL/);
        return true;
      },
    );
    // 拒绝不留脏成员
    assert.equal(listBotMembers(ctx.db, ctx.roomId).length, 0);

    const ok = await hostCommand(ctx, { command: 'add_bot', kind: 'rule' }, { llmAvailable: false });
    assert.equal(ok.bot!.kind, 'rule');
  } finally {
    closeDb(ctx.db);
  }
});

test('add_bot：配置了大模型时 llm 机器人昵称带 AI 前缀且 botKind 为 llm', async () => {
  const ctx = await setup();
  try {
    const outcome = await hostCommand(ctx, { command: 'add_bot', kind: 'llm' }, { llmAvailable: true });
    assert.equal(outcome.bot!.kind, 'llm');
    assert.match(outcome.bot!.nickname, /^AI/);
    assert.equal(listBotMembers(ctx.db, ctx.roomId)[0]?.kind, 'llm');
  } finally {
    closeDb(ctx.db);
  }
});

test('pickNextHost：机器人不会接任房主', async () => {
  const ctx = await setup();
  try {
    await hostCommand(ctx, { command: 'add_bot', kind: 'rule' });
    await hostCommand(ctx, { command: 'add_bot', kind: 'rule' });
    // 房间里除房主外只有机器人 → 无人可接任
    assert.equal(pickNextHost(ctx.db, ctx.roomId, ctx.hostId), null);

    // 加入一个真人 → 应选中真人
    const joined = await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: 'conn:p2',
      requestId: nextReq(),
      handler: (tx) =>
        applyJoinRoom(tx, ctx.roomId, {
          roomCode: ctx.roomCode,
          nickname: '玩家2',
          asSpectator: false,
        }),
    });
    assert.equal(pickNextHost(ctx.db, ctx.roomId, ctx.hostId), joined.outcome.playerId);
  } finally {
    closeDb(ctx.db);
  }
});

test('purgeBotsIfNoHumans：真人还在则保留，真人全走则清空并允许空置回收', async () => {
  const ctx = await setup();
  try {
    await hostCommand(ctx, { command: 'add_bot', kind: 'rule' });
    await hostCommand(ctx, { command: 'add_bot', kind: 'rule' });

    // 真人（房主）仍在 → 一个都不清
    assert.equal(purgeBotsIfNoHumans(ctx.db, ctx.roomId), 0);
    assert.equal(listBotMembers(ctx.db, ctx.roomId).length, 2);

    // 房主离开
    await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: 'conn:host',
      requestId: nextReq(),
      handler: (tx) => applyLeaveRoom(tx, ctx.roomId, ctx.hostId),
    });

    // leaveRoom 经 markEmptyIfNoActive 已顺带清空机器人，房间进入空置计时
    assert.equal(listBotMembers(ctx.db, ctx.roomId).length, 0);
    const room = ctx.db
      .prepare('SELECT empty_since FROM rooms WHERE id = ?')
      .get(ctx.roomId) as { empty_since: number | null };
    assert.ok(room.empty_since !== null, '真人全走后应记录空置时间');
  } finally {
    closeDb(ctx.db);
  }
});

test('markEmptyIfNoActive：机器人不会让房间永不空置', async () => {
  const ctx = await setup();
  try {
    await hostCommand(ctx, { command: 'add_bot', kind: 'rule' });
    // 直接把房主标成离开状态（绕过 leaveRoom，单测 markEmptyIfNoActive 自身）
    ctx.db
      .prepare("UPDATE room_members SET connection_status = 'EXPIRED' WHERE room_id = ? AND player_id = ?")
      .run(ctx.roomId, ctx.hostId);

    markEmptyIfNoActive(ctx.db, ctx.roomId, Date.now());
    assert.equal(listBotMembers(ctx.db, ctx.roomId).length, 0, '机器人应被先清掉');
    const room = ctx.db
      .prepare('SELECT empty_since FROM rooms WHERE id = ?')
      .get(ctx.roomId) as { empty_since: number | null };
    assert.ok(room.empty_since !== null);
  } finally {
    closeDb(ctx.db);
  }
});

test('add_bot：仅大厅状态可加，非房主不可加', async () => {
  const ctx = await setup();
  try {
    const joined = await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: 'conn:p2',
      requestId: nextReq(),
      handler: (tx) =>
        applyJoinRoom(tx, ctx.roomId, {
          roomCode: ctx.roomCode,
          nickname: '玩家2',
          asSpectator: false,
        }),
    });
    // 非房主
    await assert.rejects(
      () =>
        ctx.executor.executeOnRoom({
          roomId: ctx.roomId,
          actorScope: 'conn:p2',
          requestId: nextReq(),
          handler: (tx) =>
            applyRoomCommand(tx, ctx.roomId, joined.outcome.playerId, {
              command: 'add_bot',
              kind: 'rule',
            } as never, {}),
        }),
      (err: unknown) => {
        assert.ok(err instanceof CommandError);
        assert.equal(err.code, 'NOT_AUTHORIZED');
        return true;
      },
    );
  } finally {
    closeDb(ctx.db);
  }
});
