/**
 * 头像映射与统一解析工具
 *
 * 保证所有玩家与 AI 机器人（如 AI1~AI5）在房间大厅、牌桌席位环、
 * 发言/投票面板、对局结算操作坞、复盘揭晓等各场景展示完全一致的头像。
 */

export interface AvatarResolveSource {
  readonly avatar?: string | null;
  readonly seat?: number | null;
  readonly playerId?: string | null;
  readonly id?: string | null;
  readonly botKind?: string | null;
  readonly isBot?: boolean | number;
}

export interface ResolveAvatarOptions {
  readonly isMe?: boolean;
  readonly myAvatar?: string | null;
  readonly seat?: number | null;
  /** 显式声明传入的 seat 为 0-based（如局内 player.seat 从 0 开始）；若省略且 seat === 0 也自动识别为 0-based */
  readonly isZeroBased?: boolean;
  readonly playerId?: string | null;
}

/**
 * 根据席位号或 playerId 哈希，返回确定的手绘黑白 Notion 高保真头像。
 * 对应 public/assets/avatars/notion/notion_01.png ~ notion_64.png。
 *
 * 映射规则：
 * 1 号位（seat 1，或 0-based seat 0）-> notion_01
 * 2 号位（seat 2，或 0-based seat 1）-> notion_02
 * 3 号位（seat 3，或 0-based seat 2）-> notion_03
 * ...
 */
export function getDefaultSeatAvatar(
  seat?: number | null,
  playerId?: string | null,
  isZeroBased?: boolean,
): string {
  if (seat !== undefined && seat !== null && seat >= 0) {
    const rawSeat = Math.floor(seat);
    // 若显式声明为 0-based，或传入了 0（由于房间成员 seat 均为 1..12，出现 0 必定为 0-based 局内席位）
    const seat1Based = isZeroBased || rawSeat === 0 ? rawSeat + 1 : rawSeat;
    const index = ((seat1Based - 1) % 64) + 1;
    return `notion_${String(index).padStart(2, '0')}`;
  }
  if (playerId) {
    let hash = 0;
    for (let i = 0; i < playerId.length; i += 1) {
      hash = (hash << 5) - hash + playerId.charCodeAt(i);
      hash |= 0;
    }
    const index = (Math.abs(hash) % 64) + 1;
    return `notion_${String(index).padStart(2, '0')}`;
  }
  return 'notion_01';
}

/**
 * 统一成员/玩家头像解析逻辑
 *
 * 优先级：
 * 1. 若为当前本地玩家（isMe）：优先使用本地 Profile 的头像设置；若无则回退到 source.avatar 或 preset:fox。
 * 2. 若 source 显式携带了有效头像（非空且非机器人误带的 preset:fox 默认值）：直接使用。
 * 3. 若为本地玩家但无其他头像：回退到 myAvatar 或 preset:fox。
 * 4. 针对 AI 机器人或未设置头像的其他玩家：基于席位号返回其专属的稳定 Notion 头像。
 */
export function resolveMemberAvatar(
  source?: AvatarResolveSource | null,
  options?: ResolveAvatarOptions,
): string {
  const isMe = Boolean(options?.isMe);
  const myAvatar = options?.myAvatar;

  // 1. 如果是当前本地玩家，优先使用本地个人资料设置的头像
  if (isMe && myAvatar && myAvatar.trim()) {
    return myAvatar.trim();
  }

  // 2. 如果 source 显式携带了有效头像
  const rawAvatar = source?.avatar?.trim();
  const isBot = Boolean(source?.botKind || source?.isBot);

  if (rawAvatar) {
    // 机器人若由于默认值被赋为 preset:fox，则忽略之，改走专属席位头像映射
    if (!(isBot && rawAvatar === 'preset:fox')) {
      return rawAvatar;
    }
  }

  // 3. 如果是本地玩家且没有其他头像
  if (isMe) {
    return myAvatar || 'preset:fox';
  }

  // 4. 机器人或其他未自定义头像的席位玩家：根据席位号映射确定性头像
  const seat = options?.seat ?? source?.seat;
  const playerId = options?.playerId ?? source?.playerId ?? source?.id;

  return getDefaultSeatAvatar(seat, playerId, options?.isZeroBased);
}
