/** 房间与成员的公开领域模型（SPEC §4） */

export const ROOM_STATUSES = ['LOBBY', 'IN_GAME', 'POST_GAME', 'CLOSED'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const MEMBER_CONNECTION_STATUSES = [
  'CONNECTED',
  'DISCONNECTED_RESERVED',
  'EXPIRED',
  'KICKED',
] as const;
export type MemberConnectionStatus = (typeof MEMBER_CONNECTION_STATUSES)[number];

export const SEAT_ROLES = ['player', 'spectator'] as const;
export type SeatRole = (typeof SEAT_ROLES)[number];

export const SESSION_STATUSES = [
  'PREPARING',
  'ACTIVE',
  'RECOVERING',
  'FINISHED',
  'ABORTED',
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** 房间配置公开领域模型 */
export interface RoomConfiguration {
  spectatorsAllowed?: boolean;
  reservationMinutes?: number;
  gameConfig?: Record<string, unknown>;
}

/** 房间成员的公开视图（不含任何凭证） */
export interface RoomMemberView {
  playerId: string;
  nickname: string;
  seatRole: SeatRole;
  seat: number | null;
  isHost: boolean;
  connectionStatus: MemberConnectionStatus;
  /** 机器人种类；真人为 null（客户端据此打标签） */
  botKind: 'rule' | 'llm' | null;
  /** 是否已准备（LOBBY/POST_GAME 生效；对局中恒为 false） */
  ready: boolean;
  /** 成员头像标识（如 preset:fox 或自定义 Base64 URL） */
  avatar?: string;
}

/** 房间快照的公开视图（room_snapshot payload） */
export interface RoomSnapshotView {
  roomCode: string;
  status: RoomStatus;
  seq: number;
  gameId: string | null;
  config: unknown;
  members: RoomMemberView[];
}

/** 房间人数上限（FR-ROOM-004） */
export const MAX_PLAYERS = 12;
export const MAX_SPECTATORS = 8;
export const MIN_PLAYERS_TO_START = 4;
