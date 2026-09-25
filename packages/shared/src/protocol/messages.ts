import { z } from 'zod';
import { isKnownGameId } from '../game/catalog.ts';

/**
 * 昵称规范化（FR-ROOM-003）：Unicode NFC 规范化 + 去除首尾空白后长度 1–16。
 * 返回 null 表示非法。
 */
export function normalizeNickname(raw: string): string | null {
  const normalized = raw.normalize('NFC').trim();
  if (normalized.length < 1 || normalized.length > 16) return null;
  // 拒绝控制字符与换行
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

/** 昵称 schema：先规范化再校验 */
export const nicknameSchema = z
  .string()
  .max(64) // 防止超长输入进入 normalize
  .transform((raw, ctx) => {
    const n = normalizeNickname(raw);
    if (n === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '昵称需为 1–16 个字符' });
      return z.NEVER;
    }
    return n;
  });

/** 房间密码：可选，4–32 字符（FR-ROOM-002） */
export const roomPasswordSchema = z.string().min(4).max(32);

/** 房间短码：5 位，大小写不敏感，存储/比较前归一化为大写（FR-ROOM-001） */
export const roomCodeSchema = z
  .string()
  .max(16)
  .transform((raw, ctx) => {
    const code = raw.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '房间码需为 5 位字母数字' });
      return z.NEVER;
    }
    return code;
  });

/** 已知游戏 ID；是否已开放由服务端创建房间时决定。 */
export const gameIdSchema = z
  .string()
  .min(1)
  .max(32)
  .refine(isKnownGameId, { message: '未知游戏' });

/** create_room payload */
export const createRoomPayloadSchema = z
  .object({
    nickname: nicknameSchema,
    gameId: gameIdSchema.optional(),
    password: roomPasswordSchema.optional(),
    // 建房时可选携带游戏配置（如角色池开关、节奏预设）；键由模块 parseConfig 把关
    gameConfig: z.record(z.unknown()).optional(),
  })
  .strict();
export type CreateRoomPayload = z.infer<typeof createRoomPayloadSchema>;

/** join_room payload（FR-ROOM-003/004/005） */
export const joinRoomPayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
    nickname: nicknameSchema,
    password: z.string().max(64).optional(),
    asSpectator: z.boolean().optional().default(false),
  })
  .strict();
export type JoinRoomPayload = z.infer<typeof joinRoomPayloadSchema>;

/** 客户端最后接受的版本化游戏视角身份，用于决定能否增量补发公开事件。 */
export const gameResumeIdentitySchema = z
  .object({
    sessionId: z.string().min(1).max(64),
    viewVersion: z.number().int().positive(),
  })
  .strict();
export type GameResumeIdentity = z.infer<typeof gameResumeIdentitySchema>;

/** resume_room payload（FR-ID-002：房间码 + PlayerId + resumeToken 缺一不可） */
export const resumeRoomPayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
    playerId: z.string().min(1).max(64),
    resumeToken: z.string().min(16).max(128),
    lastSeq: z.number().int().nonnegative().nullable().optional().default(null),
    chatCursor: z.number().int().nonnegative().nullable().optional().default(null),
    game: gameResumeIdentitySchema.nullable().optional(),
  })
  .strict();
export type ResumeRoomPayload = z.infer<typeof resumeRoomPayloadSchema>;

/** leave_room payload（无字段；actor 由服务端连接上下文推导） */
export const leaveRoomPayloadSchema = z.object({}).strict();

/** room_status payload（心跳查询，无字段；actor 由服务端连接上下文推导） */
export const roomStatusPayloadSchema = z.object({}).strict();

/** room_command payload（§9.2：准备/开局/终止/返回大厅/踢人/转让房主/修改配置/关闭房间） */
export const roomCommandPayloadSchema = z.discriminatedUnion('command', [
  // 准备/取消准备（LOBBY/POST_GAME，全员可发）
  z.object({ command: z.literal('ready'), ready: z.boolean() }).strict(),
  z.object({ command: z.literal('kick_player'), targetPlayerId: z.string().min(1).max(64) }).strict(),
  z.object({ command: z.literal('transfer_host'), targetPlayerId: z.string().min(1).max(64) }).strict(),
  z
    .object({
      command: z.literal('update_config'),
      // 配置白名单：只允许已知键，拒绝任意大对象（SPEC §9.5）
      config: z
        .object({
          spectatorsAllowed: z.boolean().optional(),
          reservationMinutes: z.number().int().min(1).max(30).optional(),
          // 游戏配置透传：键由各游戏模块 parseConfig 把关（开局时校验）
          gameConfig: z.record(z.unknown()).optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ command: z.literal('close_room') }).strict(),
  // 添加机器人陪练（测试用）：rule 走纯函数策略，llm 交给大模型决策
  z
    .object({
      command: z.literal('add_bot'),
      kind: z.enum(['rule', 'llm']).optional().default('rule'),
    })
    .strict(),
  // 移除机器人；不指定目标时移除席位号最大的那个
  z
    .object({
      command: z.literal('remove_bot'),
      targetPlayerId: z.string().min(1).max(64).optional(),
    })
    .strict(),
  // 开局（FR-HOST-001）：gameConfig 由游戏模块 parseConfig 把关，内核只透传
  z.object({ command: z.literal('start_game'), gameConfig: z.unknown().optional() }).strict(),
  // 房主更换游戏
  z.object({ command: z.literal('select_game'), gameId: z.string().min(1).max(64) }).strict(),
  // 终止本局（FR-HOST-002）：二次确认在客户端完成
  z.object({ command: z.literal('abort_game') }).strict(),
  // POST_GAME → LOBBY（FR-RESULT-004 / D-6）
  z.object({ command: z.literal('return_to_lobby') }).strict(),
  // 切换席位身份：切换为参局玩家或公共桌面大屏/观战
  z
    .object({
      command: z.literal('switch_seat_role'),
      role: z.enum(['player', 'spectator']),
      targetPlayerId: z.string().min(1).max(64).optional(),
    })
    .strict(),
]);
export type RoomCommandPayload = z.infer<typeof roomCommandPayloadSchema>;

/** chat_send payload（FR-CHAT-001/002；禁伪造 system，FR-CHAT-005 由服务端 kind 控制） */
export const chatSendPayloadSchema = z
  .object({
    text: z.string().max(1200),
    toPlayerId: z.string().min(1).max(200).optional(),
  })
  .strict();
export type ChatSendPayload = z.infer<typeof chatSendPayloadSchema>;

/** 单条聊天消息的公开视图（chat_batch 元素） */
export interface ChatMessageView {
  cursor: number;
  kind: 'player' | 'system';
  fromPlayerId: string | null;
  toPlayerId?: string;
  text: string;
  at: number;
}

/** resync payload（SPEC §9.2：携带客户端最后序号和聊天游标） */
export const resyncPayloadSchema = z
  .object({
    lastSeq: z.number().int().nonnegative().nullable(),
    chatCursor: z.number().int().nonnegative().nullable(),
    game: gameResumeIdentitySchema.nullable().optional(),
  })
  .strict();
export type ResyncPayload = z.infer<typeof resyncPayloadSchema>;

/** 聊天文本：规范化后 1–300（FR-CHAT-002），按纯文本处理 */
export const chatTextSchema = z
  .string()
  .max(1200)
  .transform((raw, ctx) => {
    const t = raw.normalize('NFC').trim();
    if (t.length < 1 || t.length > 300) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '消息长度需为 1–300 字符' });
      return z.NEVER;
    }
    return t;
  });
