/**
 * 房间配置（rooms.config_json）解析：白名单键 + 默认值。
 * 未知键在读取时忽略；写入侧由 roomCommandPayloadSchema 白名单约束。
 */

export interface RoomConfig {
  /** 是否允许观战（FR-SPEC-001） */
  spectatorsAllowed: boolean;
  /** 断线席位保留分钟数（FR-REC-004，默认 5） */
  reservationMinutes: number;
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  spectatorsAllowed: true,
  reservationMinutes: 5,
};

export function parseRoomConfig(configJson: string): RoomConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(configJson);
  } catch {
    return { ...DEFAULT_ROOM_CONFIG };
  }
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    spectatorsAllowed:
      typeof obj.spectatorsAllowed === 'boolean'
        ? obj.spectatorsAllowed
        : DEFAULT_ROOM_CONFIG.spectatorsAllowed,
    reservationMinutes:
      typeof obj.reservationMinutes === 'number' && Number.isInteger(obj.reservationMinutes)
        ? obj.reservationMinutes
        : DEFAULT_ROOM_CONFIG.reservationMinutes,
  };
}
