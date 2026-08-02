/**
 * M2 房间闭环 · 命令层测试（对应 AC-02/03/10/12 的服务端规则部分）。
 * 直接驱动 executor + 命令函数，验证加入/退出/踢人/转让/恢复/聊天规则。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, closeDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor, CommandError } from '../src/core/executor.ts';
import { applyJoinRoom, type JoinRoomOutcome } from '../src/core/commands/joinRoom.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { applyResumeRoom } from '../src/core/commands/resumeRoom.ts';
import { applyLeaveRoom } from '../src/core/commands/leaveRoom.ts';
import { applyRoomCommand } from '../src/core/commands/roomCommand.ts';
import { applyChatSend, listChatAfter } from '../src/core/commands/chat.ts';
import { applyMarkDisconnected, applyAutoTransferHost } from '../src/core/commands/presence.ts';
import { findRoomIdByCode } from '../src/core/roomLookup.ts';

interface Ctx {
  db: Db;
  executor: RoomCommandExecutor;
  roomId: string;
  roomCode: string;
  hostId: string;
  hostToken: string;
}

let requestCounter = 0;
function nextReq(): string {
  return `req-${++requestCounter}`;
}

async function setup(password?: string): Promise<Ctx> {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  const executor = new RoomCommandExecutor(db);
  const seeded = seedRoom(db, { ...(password ? { password } : {}) });
  return {
    db,
    executor,
    roomId: seeded.roomId,
    roomCode: seeded.roomCode,
    hostId: seeded.hostId,
    hostToken: seeded.hostResumeToken,
  };
}

async function join(
  ctx: Ctx,
  nickname: string,
  opts: { password?: string; asSpectator?: boolean } = {},
): Promise<JoinRoomOutcome> {
  const result = await ctx.executor.executeOnRoom({
    roomId: ctx.roomId,
    actorScope: `conn:${nickname}`,
    requestId: nextReq(),
    handler: (tx) =>
      applyJoinRoom(tx, ctx.roomId, {
        roomCode: ctx.roomCode,
        nickname,
        asSpectator: opts.asSpectator ?? false,
        ...(opts.password !== undefined ? { password: opts.password } : {}),
      }),
  });
  return result.outcome;
}

async function assertCommandError(fn: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof CommandError, `应抛 CommandError，实际 ${String(err)}`);
    assert.equal(err.code, code);
    return true;
  });
}

test('AC-02 加入：8 人不同昵称加入，席位递增、房主与人数正确', async () => {
  const ctx = await setup();
  try {
    for (let i = 1; i <= 7; i++) {
      const joined = await join(ctx, `玩家${i}`);
      assert.equal(joined.seatRole, 'player');
    }
    const snapshot = (await join(ctx, '玩家8')).snapshot;
    assert.equal(snapshot.members.length, 9); // 房主 + 8
    const seats = snapshot.members.map((m) => m.seat).sort((a, b) => a! - b!);
    assert.deepEqual(seats, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const host = snapshot.members.find((m) => m.isHost);
    assert.equal(host?.playerId, ctx.hostId);
    // 房间码大小写不敏感（FR-ROOM-001）
    assert.equal(findRoomIdByCode(ctx.db, ctx.roomCode), ctx.roomId);
  } finally {
    closeDb(ctx.db);
  }
});

test('AC-03 输入边界：重名 / 错误密码 / 玩家满员均返回明确错误且不产生脏成员', async () => {
  const ctx = await setup('secret123');
  try {
    // 错误密码 / 缺密码
    await assertCommandError(() => join(ctx, '甲', { password: 'wrong' }), 'INVALID_PASSWORD');
    await assertCommandError(() => join(ctx, '甲'), 'INVALID_PASSWORD');
    // 重名（含房主昵称）
    await assertCommandError(() => join(ctx, '房主', { password: 'secret123' }), 'NICKNAME_TAKEN');
    // 填满 12 个玩家席位后再加玩家 → ROOM_FULL
    for (let i = 1; i <= 11; i++) {
      await join(ctx, `玩家${i}`, { password: 'secret123' });
    }
    await assertCommandError(() => join(ctx, '挤不进', { password: 'secret123' }), 'ROOM_FULL');
    // 观战仍可进（独立 8 席）
    const spec = await join(ctx, '观战1', { password: 'secret123', asSpectator: true });
    assert.equal(spec.seatRole, 'spectator');
    assert.equal(spec.snapshot.members.length, 13);
    // 失败的加入不留脏成员
    const rows = ctx.db
      .prepare('SELECT COUNT(*) AS n FROM room_members WHERE room_id = ?')
      .get(ctx.roomId) as { n: number };
    assert.equal(rows.n, 13);
  } finally {
    closeDb(ctx.db);
  }
});

test('观战规则：IN_GAME 只能以观战身份加入；观战满员拒绝；关闭观战拒绝', async () => {
  const ctx = await setup();
  try {
    ctx.db.prepare("UPDATE rooms SET status = 'IN_GAME' WHERE id = ?").run(ctx.roomId);
    const auto = await join(ctx, '中途者'); // 未声明观战 → 自动降级
    assert.equal(auto.seatRole, 'spectator');
    for (let i = 2; i <= 8; i++) {
      await join(ctx, `观战${i}`, { asSpectator: true });
    }
    await assertCommandError(() => join(ctx, '观战9', { asSpectator: true }), 'ROOM_FULL');

    // 关闭观战（update_config 由房主执行）
    ctx.db.prepare("UPDATE rooms SET status = 'LOBBY' WHERE id = ?").run(ctx.roomId);
    await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: `player:${ctx.hostId}`,
      requestId: nextReq(),
      handler: (tx) =>
        applyRoomCommand(tx, ctx.roomId, ctx.hostId, {
          command: 'update_config',
          config: { spectatorsAllowed: false },
        }),
    });
    ctx.db.prepare("UPDATE rooms SET status = 'IN_GAME' WHERE id = ?").run(ctx.roomId);
    // 已有 8 名观战离开一个，留出容量后仍应因配置被拒
    ctx.db
      .prepare("DELETE FROM room_members WHERE room_id = ? AND nickname = '观战2'")
      .run(ctx.roomId);
    await assertCommandError(() => join(ctx, '新观战', { asSpectator: true }), 'ACTION_NOT_ALLOWED');
  } finally {
    closeDb(ctx.db);
  }
});

test('退出：LOBBY 退出删除成员并释放昵称；房主退出立即转让最早加入的在线玩家', async () => {
  const ctx = await setup();
  try {
    const p1 = await join(ctx, '老二');
    await join(ctx, '老三');

    // 房主退出 → 老二接任（joined_at 最早的 CONNECTED 玩家）
    const result = await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: `player:${ctx.hostId}`,
      requestId: nextReq(),
      handler: (tx) => applyLeaveRoom(tx, ctx.roomId, ctx.hostId),
    });
    assert.equal(result.outcome.mode, 'removed');
    assert.equal(result.outcome.newHostId, p1.playerId);
    // 昵称已释放：新成员可用"房主"
    const rejoin = await join(ctx, '房主');
    assert.equal(rejoin.seatRole, 'player');

    // 全部退出 → empty_since 落值
    for (const m of rejoin.snapshot.members) {
      await ctx.executor.executeOnRoom({
        roomId: ctx.roomId,
        actorScope: `player:${m.playerId}`,
        requestId: nextReq(),
        handler: (tx) => applyLeaveRoom(tx, ctx.roomId, m.playerId),
      });
    }
    const room = ctx.db
      .prepare('SELECT empty_since, host_player_id FROM rooms WHERE id = ?')
      .get(ctx.roomId) as { empty_since: number | null; host_player_id: string | null };
    assert.notEqual(room.empty_since, null);
    assert.equal(room.host_player_id, null);
  } finally {
    closeDb(ctx.db);
  }
});

test('IN_GAME 退出：转为断线保留（席位不释放），重连可恢复（AC-10 服务端规则）', async () => {
  const ctx = await setup();
  try {
    const p1 = await join(ctx, '苦主');
    ctx.db.prepare("UPDATE rooms SET status = 'IN_GAME' WHERE id = ?").run(ctx.roomId);
    const left = await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: `player:${p1.playerId}`,
      requestId: nextReq(),
      handler: (tx) => applyLeaveRoom(tx, ctx.roomId, p1.playerId),
    });
    assert.equal(left.outcome.mode, 'reserved');
    const member = left.outcome.snapshot.members.find((m) => m.playerId === p1.playerId);
    assert.equal(member?.connectionStatus, 'DISCONNECTED_RESERVED');
    assert.equal(member?.seat, 2);

    // 用 resumeToken 恢复 → CONNECTED
    const resumed = await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: `player:${p1.playerId}`,
      requestId: nextReq(),
      handler: (tx) =>
        applyResumeRoom(tx, ctx.roomId, {
          roomCode: ctx.roomCode,
          playerId: p1.playerId,
          resumeToken: p1.resumeToken,
          lastSeq: null,
          chatCursor: null,
        }),
    });
    const back = resumed.outcome.snapshot.members.find((m) => m.playerId === p1.playerId);
    assert.equal(back?.connectionStatus, 'CONNECTED');
  } finally {
    closeDb(ctx.db);
  }
});

test('恢复边界：伪造 token → INVALID_RESUME_TOKEN；保留超时 → RESERVATION_EXPIRED', async () => {
  const ctx = await setup();
  try {
    const p1 = await join(ctx, '断线侠');
    const resumePayload = {
      roomCode: ctx.roomCode,
      playerId: p1.playerId,
      lastSeq: null,
      chatCursor: null,
    };
    await assertCommandError(
      () =>
        ctx.executor.executeOnRoom({
          roomId: ctx.roomId,
          actorScope: `player:${p1.playerId}`,
          requestId: nextReq(),
          handler: (tx) =>
            applyResumeRoom(tx, ctx.roomId, { ...resumePayload, resumeToken: 'x'.repeat(43) }),
        }),
      'INVALID_RESUME_TOKEN',
    );
    // 保留期限已过 → EXPIRED + 席位释放
    ctx.db
      .prepare(
        "UPDATE room_members SET connection_status = 'DISCONNECTED_RESERVED', reserved_until = 1 WHERE room_id = ? AND player_id = ?",
      )
      .run(ctx.roomId, p1.playerId);
    await assertCommandError(
      () =>
        ctx.executor.executeOnRoom({
          roomId: ctx.roomId,
          actorScope: `player:${p1.playerId}`,
          requestId: nextReq(),
          handler: (tx) =>
            applyResumeRoom(tx, ctx.roomId, { ...resumePayload, resumeToken: p1.resumeToken }),
        }),
      'RESERVATION_EXPIRED',
    );
    // 命令失败事务回滚：不在 resume 失败路径落库 EXPIRED（到期清扫属 M4），状态保持断线保留
    const row = ctx.db
      .prepare('SELECT connection_status, seat FROM room_members WHERE room_id = ? AND player_id = ?')
      .get(ctx.roomId, p1.playerId) as { connection_status: string; seat: number | null };
    assert.equal(row.connection_status, 'DISCONNECTED_RESERVED');
    assert.equal(row.seat, 2);
  } finally {
    closeDb(ctx.db);
  }
});

test('踢人：标记 KICKED、席位与昵称释放、凭证作废、审计落库；非房主无权', async () => {
  const ctx = await setup();
  try {
    const p1 = await join(ctx, '倒霉蛋');
    // 非房主执行 → NOT_AUTHORIZED（FR-HOST-004）
    await assertCommandError(
      () =>
        ctx.executor.executeOnRoom({
          roomId: ctx.roomId,
          actorScope: `player:${p1.playerId}`,
          requestId: nextReq(),
          handler: (tx) =>
            applyRoomCommand(tx, ctx.roomId, p1.playerId, {
              command: 'kick_player',
              targetPlayerId: ctx.hostId,
            }),
        }),
      'NOT_AUTHORIZED',
    );

    const kicked = await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: `player:${ctx.hostId}`,
      requestId: nextReq(),
      handler: (tx) =>
        applyRoomCommand(tx, ctx.roomId, ctx.hostId, {
          command: 'kick_player',
          targetPlayerId: p1.playerId,
        }),
    });
    assert.equal(kicked.outcome.kickedPlayerId, p1.playerId);
    // 快照不含被踢者
    assert.ok(!kicked.outcome.snapshot.members.some((m) => m.playerId === p1.playerId));
    // 被踢者用原 token 恢复 → INVALID_RESUME_TOKEN（FR-HOST-003）
    await assertCommandError(
      () =>
        ctx.executor.executeOnRoom({
          roomId: ctx.roomId,
          actorScope: `player:${p1.playerId}`,
          requestId: nextReq(),
          handler: (tx) =>
            applyResumeRoom(tx, ctx.roomId, {
              roomCode: ctx.roomCode,
              playerId: p1.playerId,
              resumeToken: p1.resumeToken,
              lastSeq: null,
              chatCursor: null,
            }),
        }),
      'INVALID_RESUME_TOKEN',
    );
    // 昵称释放：新成员可复用
    const reuse = await join(ctx, '倒霉蛋');
    assert.equal(reuse.seatRole, 'player');
    // 审计日志落库
    const audit = ctx.db
      .prepare('SELECT COUNT(*) AS n FROM audit_log WHERE room_id = ?')
      .get(ctx.roomId) as { n: number };
    assert.ok(audit.n >= 1);
  } finally {
    closeDb(ctx.db);
  }
});

test('AC-12 房主转让：断线标记 + 自动转让给最早在线玩家；房主回归不自动夺回', async () => {
  const ctx = await setup();
  try {
    const p1 = await join(ctx, '老二');
    await join(ctx, '老三');

    // 房主断线 → DISCONNECTED_RESERVED，wasHost=true
    const marked = await ctx.executor.executeInternal({
      roomId: ctx.roomId,
      handler: (tx) => applyMarkDisconnected(tx, ctx.roomId, ctx.hostId),
    });
    assert.ok(marked);
    assert.equal(marked.outcome.wasHost, true);

    // 30 秒计时器到点 → 转让给最早加入的 CONNECTED 玩家（老二）
    const transferred = await ctx.executor.executeInternal({
      roomId: ctx.roomId,
      handler: (tx) => applyAutoTransferHost(tx, ctx.roomId, ctx.hostId),
    });
    assert.ok(transferred);
    assert.equal(transferred.outcome.newHostId, p1.playerId);

    // 原房主重连恢复 → 不自动夺回（AC-12）
    await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: `player:${ctx.hostId}`,
      requestId: nextReq(),
      handler: (tx) =>
        applyResumeRoom(tx, ctx.roomId, {
          roomCode: ctx.roomCode,
          playerId: ctx.hostId,
          resumeToken: ctx.hostToken,
          lastSeq: null,
          chatCursor: null,
        }),
    });
    const room = ctx.db.prepare('SELECT host_player_id FROM rooms WHERE id = ?').get(ctx.roomId) as {
      host_player_id: string;
    };
    assert.equal(room.host_player_id, p1.playerId);

    // 房主已回归时再次触发转让 → no-op
    const again = await ctx.executor.executeInternal({
      roomId: ctx.roomId,
      handler: (tx) => applyAutoTransferHost(tx, ctx.roomId, p1.playerId),
    });
    assert.equal(again, null);
  } finally {
    closeDb(ctx.db);
  }
});

test('关闭房间：状态 CLOSED，后续命令 ROOM_CLOSED', async () => {
  const ctx = await setup();
  try {
    await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: `player:${ctx.hostId}`,
      requestId: nextReq(),
      handler: (tx) => applyRoomCommand(tx, ctx.roomId, ctx.hostId, { command: 'close_room' }),
    });
    await assertCommandError(() => join(ctx, '来晚了'), 'ROOM_CLOSED');
  } finally {
    closeDb(ctx.db);
  }
});

test('聊天：独立游标不推动 roomSeq；按游标补发不重复不遗漏（AC-14 服务端规则）', async () => {
  const ctx = await setup();
  try {
    const seqBefore = (
      ctx.db.prepare('SELECT seq FROM rooms WHERE id = ?').get(ctx.roomId) as { seq: number }
    ).seq;

    const cursors: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const sent = await ctx.executor.executeOnRoom({
        roomId: ctx.roomId,
        actorScope: `player:${ctx.hostId}`,
        requestId: nextReq(),
        bumpSeq: false,
        handler: (tx) => applyChatSend(tx, ctx.roomId, ctx.hostId, `消息${i}`),
      });
      cursors.push(sent.outcome.cursor);
    }
    // roomSeq 不受聊天影响（§9.1）
    const seqAfter = (
      ctx.db.prepare('SELECT seq FROM rooms WHERE id = ?').get(ctx.roomId) as { seq: number }
    ).seq;
    assert.equal(seqAfter, seqBefore);
    // 游标严格递增
    for (let i = 1; i < cursors.length; i++) assert.ok(cursors[i]! > cursors[i - 1]!);

    // 从第 2 条之后补发 → 恰好 3 条，无重复
    const missed = listChatAfter(ctx.db, ctx.roomId, cursors[1]!);
    assert.deepEqual(missed.map((m) => m.text), ['消息3', '消息4', '消息5']);

    // XSS 字符按纯文本存储不转义不执行（AC-14 由客户端渲染层保证，服务端保持原文）
    const xss = await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: `player:${ctx.hostId}`,
      requestId: nextReq(),
      bumpSeq: false,
      handler: (tx) => applyChatSend(tx, ctx.roomId, ctx.hostId, '<script>alert(1)</script>'),
    });
    assert.equal(xss.outcome.text, '<script>alert(1)</script>');

    // 幂等：同 requestId 重发返回同一游标，不重复落库
    const dupReq = nextReq();
    const first = await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: `player:${ctx.hostId}`,
      requestId: dupReq,
      bumpSeq: false,
      handler: (tx) => applyChatSend(tx, ctx.roomId, ctx.hostId, '幂等消息'),
    });
    const replay = await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: `player:${ctx.hostId}`,
      requestId: dupReq,
      bumpSeq: false,
      handler: (tx) => applyChatSend(tx, ctx.roomId, ctx.hostId, '幂等消息'),
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.outcome.cursor, first.outcome.cursor);
    const count = ctx.db
      .prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE room_id = ? AND text = '幂等消息'")
      .get(ctx.roomId) as { n: number };
    assert.equal(count.n, 1);
  } finally {
    closeDb(ctx.db);
  }
});
