/**
 * D4-U-UI / D4-B-UI 支持：为平台 start_game 尚被服务端规则集解析阻塞的版本化规则集
 * 直插一条 ACTIVE 会话（与 e2e/helpers/dbClient.seedRoom 的 seed + resume 模式一脉相承，
 * 见 wsClient.ts 顶部说明）。会话状态由真实游戏模块 createInitialState 生成，
 * 快照信封与 startGame 落库格式逐字段一致（engineContractVersion 2 + stateDigest）。
 * 后续 resume_room / game_action 全走真实 WS 链路、真实模块权威裁决。
 */
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createSeededRandom, type AnyGameModuleV2 } from '@ldj/shared';
import { createSnapshotEnvelope } from '../../packages/server/src/core/game/snapshotEnvelope.ts';
import { seedRoom, type SeededRoom } from '../helpers/dbClient.ts';

export interface SeededSession extends SeededRoom {
  sessionId: string;
  /** 模块 createInitialState 产出的初始状态（供测试确定角色/词条等确定性信息） */
  state: unknown;
}

export interface SeedActiveSessionOptions {
  /** 版本化游戏模块（如 unoHouseModule / blankModule） */
  module: AnyGameModuleV2;
  /** 参局玩家数（房主 + 其余） */
  count: number;
  /** 传给模块 parseConfig 的配置（如 { mode: 'individual', roundCount: 1 }） */
  config: unknown;
  /** 全员 ready（默认 true；ACTIVE 会话后 ready 状态不影响对局） */
  ready?: boolean;
}

/**
 * seed 一间 LOBBY 房并把其提升为 IN_GAME + 一条 ACTIVE 版本化会话。
 * 与 startGame 一致的随机种子/游标/快照语义：createSeededRandom(seed) →
 * createInitialState → getCursor() → createSnapshotEnvelope。
 */
export function seedActiveSession(dbPath: string, options: SeedActiveSessionOptions): SeededSession {
  const { module, count, config } = options;
  const seeded = seedRoom(dbPath, {
    gameId: module.manifest.id,
    count,
    ready: options.ready ?? true,
    config: {},
  });
  const players = seeded.players.map((player) => player.playerId);

  const db = new DatabaseSync(dbPath, { timeout: 5000 });
  try {
    const now = Date.now();
    const seed = randomUUID();
    const random = createSeededRandom(seed);
    const parsedConfig = module.parseConfig(config);
    const state = module.createInitialState({ now, random }, players, parsedConfig);
    const cursor = random.getCursor();
    const sessionId = randomUUID();
    const snapshot = createSnapshotEnvelope({
      gameId: module.manifest.id,
      rulesetId: module.identity.rulesetId,
      schemaVersion: module.manifest.stateSchemaVersion,
      createdAtSequence: 0,
      rngState: { cursor },
      state,
    });

    db.prepare(
      `INSERT INTO game_sessions
         (id, room_id, module_id, module_version, state_schema_version, status, snapshot_json,
          seed, rng_state_json, ruleset_id, last_seq, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, 0, ?, ?)`,
    ).run(
      sessionId,
      seeded.roomId,
      module.manifest.id,
      module.manifest.version,
      module.manifest.stateSchemaVersion,
      JSON.stringify(snapshot),
      seed,
      JSON.stringify({ cursor }),
      module.identity.rulesetId,
      now,
      now,
    );
    db.prepare(`UPDATE rooms SET status = 'IN_GAME', game_id = ?, updated_at = ? WHERE id = ?`).run(
      module.manifest.id,
      now,
      seeded.roomId,
    );
    return { ...seeded, sessionId, state };
  } finally {
    db.close();
  }
}
