/**
 * Schema v1：SPEC §10.2 十张逻辑表。
 * 迁移只前进；每次 schema 变更新增一个 migration。
 */

export interface Migration {
  version: number;
  name: string;
  up: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'schema-v1',
    up: `
CREATE TABLE rooms (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL CHECK (status IN ('LOBBY','IN_GAME','POST_GAME','CLOSED')),
  host_player_id  TEXT,
  game_id         TEXT,
  config_json     TEXT NOT NULL DEFAULT '{}',
  password_hash   TEXT,
  seq             INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  empty_since     INTEGER
);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_empty_since ON rooms(empty_since) WHERE empty_since IS NOT NULL;

CREATE TABLE room_members (
  room_id           TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id         TEXT NOT NULL,
  identity_id       TEXT,
  nickname          TEXT NOT NULL,
  seat_role         TEXT NOT NULL CHECK (seat_role IN ('player','spectator')),
  seat              INTEGER,
  connection_status TEXT NOT NULL DEFAULT 'DISCONNECTED_RESERVED'
                    CHECK (connection_status IN ('CONNECTED','DISCONNECTED_RESERVED','EXPIRED','KICKED')),
  resume_token_hash TEXT NOT NULL,
  reserved_until    INTEGER,
  joined_at         INTEGER NOT NULL,
  PRIMARY KEY (room_id, player_id)
);
CREATE UNIQUE INDEX idx_members_seat ON room_members(room_id, seat) WHERE seat IS NOT NULL;
-- 同房重名仅限活跃成员：被踢/过期成员保留历史行但释放昵称（FR-ROOM-003）
CREATE UNIQUE INDEX idx_members_nickname ON room_members(room_id, nickname)
  WHERE connection_status NOT IN ('KICKED','EXPIRED');
CREATE INDEX idx_members_reserved ON room_members(reserved_until) WHERE reserved_until IS NOT NULL;

CREATE TABLE game_sessions (
  id                   TEXT PRIMARY KEY,
  room_id              TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  module_id            TEXT NOT NULL,
  module_version       TEXT NOT NULL,
  state_schema_version INTEGER NOT NULL,
  status               TEXT NOT NULL CHECK (status IN ('PREPARING','ACTIVE','RECOVERING','FINISHED','ABORTED')),
  snapshot_json        TEXT NOT NULL,
  seed                 TEXT NOT NULL,
  rng_state_json       TEXT NOT NULL,
  last_seq             INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_sessions_one_active ON game_sessions(room_id)
  WHERE status IN ('PREPARING','ACTIVE','RECOVERING');

CREATE TABLE game_events (
  session_id   TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  request_id   TEXT,
  command_time INTEGER NOT NULL,
  actor_json   TEXT NOT NULL,
  action_json  TEXT NOT NULL,
  events_json  TEXT NOT NULL,
  PRIMARY KEY (session_id, seq)
);

CREATE TABLE command_receipts (
  room_id      TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  actor_scope  TEXT NOT NULL,
  request_id   TEXT NOT NULL,
  room_seq     INTEGER NOT NULL,
  outcome_json TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (room_id, actor_scope, request_id)
);
CREATE INDEX idx_receipts_created ON command_receipts(created_at);

CREATE TABLE timers (
  session_id  TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  timer_id    TEXT NOT NULL,
  deadline_at INTEGER NOT NULL,
  action_json TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('pending','consumed','cancelled')),
  PRIMARY KEY (session_id, timer_id)
);
CREATE INDEX idx_timers_due ON timers(deadline_at) WHERE status = 'pending';

CREATE TABLE chat_messages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id        TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  session_id     TEXT,
  from_player_id TEXT,
  kind           TEXT NOT NULL CHECK (kind IN ('player','system')),
  text           TEXT NOT NULL,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_chat_room_cursor ON chat_messages(room_id, id);

CREATE TABLE game_results (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL UNIQUE REFERENCES game_sessions(id) ON DELETE CASCADE,
  module_id   TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id         TEXT,
  actor_player_id TEXT,
  action          TEXT NOT NULL,
  result          TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);
`,
  },
  {
    version: 2,
    name: 'backfill-room-game-id',
    up: `
UPDATE rooms
SET game_id = 'undercover'
WHERE game_id IS NULL;
`,
  },
  {
    version: 3,
    name: 'add-member-bot-columns',
    // 机器人是普通成员多两个标记：席位/昵称/重名规则全部复用，
    // 只在"房主转让"和"房间空置回收"两处需要把它排除掉。
    // resume_token_hash 存字面量 'bot'（非 64 位 hex，永不匹配任何 sha256），
    // 与 'revoked' 同为不可用凭证哨兵。
    //
    // bot_kind 区分决策方式：'rule' 走纯函数策略，'llm' 先问大模型、
    // 失败再回落到同一个纯函数策略。真人成员该列为 NULL。
    up: `
ALTER TABLE room_members ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE room_members ADD COLUMN bot_kind TEXT
  CHECK (bot_kind IS NULL OR bot_kind IN ('rule','llm'));
CREATE INDEX idx_members_bot ON room_members(room_id) WHERE is_bot = 1;
`,
  },
  {
    version: 4,
    name: 'add-app-settings',
    // 运行期设置（目前只有大模型接入）。做成 key-value 而非固定列：
    // 这张表存的是"部署时才知道的配置"，加一项不该再来一次迁移。
    //
    // 单行单例（id = 1）本来也够用，但 key-value 让「只改 model 不动 apiKey」
    // 这种局部更新天然可行，也便于以后加无关的设置项。
    //
    // 密钥以明文存本机 SQLite：与 .env 同级的信任模型（局域网自部署，
    // 库文件本身就是敏感文件）。对外一律不回传，只回 hasApiKey 布尔。
    up: `
CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`,
  },
  {
    version: 5,
    name: 'retire-removed-game-sessions',
    // 清理已从代码和目录中摘除的历史游戏，避免旧房间继续出现在大厅，
    // 同时保留 FINISHED 会话和 game_results 供历史审计。
    up: `
UPDATE timers
SET status = 'cancelled'
WHERE status = 'pending'
  AND session_id IN (
    SELECT id FROM game_sessions WHERE module_id = 'richman'
  );

UPDATE game_sessions
SET status = 'ABORTED',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE module_id = 'richman'
  AND status IN ('PREPARING', 'ACTIVE', 'RECOVERING');

UPDATE rooms
SET status = 'CLOSED',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE game_id = 'richman'
  AND status != 'CLOSED';
`,
  },
  {
    version: 6,
    name: 'add-member-ready',
    // 房间级"准备"机制（FR-ROOM-NEW）：LOBBY/POST_GAME 下玩家先准备，
    // 全员就绪且人数达标后自动开局；对局中该列保留但恒为 0。
    up: `
ALTER TABLE room_members ADD COLUMN ready INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    version: 7,
    name: 'add-session-ruleset-identity',
    // 重建 game_sessions：引入权威 ruleset_id、SUSPENDED 状态与失败列。
    // migrator 在每次迁移的事务外先关闭外键、提交后恢复（PRAGMA foreign_keys
    // 在事务内是 no-op），所以这里的 PRAGMA 语句仅作文档性兜底；
    // DROP 父表不会级联删除 game_events/timers/game_results 等子表行。
    //
    // ruleset_id 回填优先级：
    // 1. V2 快照信封顶层 $.rulesetId（UNO / 卧底 versioned module）
    // 2. 按 module_id 兜底：undercover / uno / landlord / werewolf。
    //    werewolf 只显式识别 config.rulesetId = 'werewolf_platform_open_kill_v1'，
    //    其余（含缺失）一律视为 legacy 基线 'werewolf_legacy_platform_v2'。
    // 3. 仍为空则 'unregistered_module'，随后整行标记 SUSPENDED。
    // json_extract 对原始 legacy JSON 缺路径返回 NULL，属预期，不中断迁移。
    up: `
PRAGMA foreign_keys = OFF;

CREATE TABLE game_sessions_new (
  id                   TEXT PRIMARY KEY,
  room_id              TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  module_id            TEXT NOT NULL,
  module_version       TEXT NOT NULL,
  state_schema_version INTEGER NOT NULL,
  status               TEXT NOT NULL CHECK (status IN ('PREPARING','ACTIVE','RECOVERING','SUSPENDED','FINISHED','ABORTED')),
  snapshot_json        TEXT NOT NULL,
  seed                 TEXT NOT NULL,
  rng_state_json       TEXT NOT NULL,
  last_seq             INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  ruleset_id           TEXT NOT NULL,
  failure              TEXT,
  failure_details_json TEXT
);

INSERT INTO game_sessions_new (id, room_id, module_id, module_version, state_schema_version, status, snapshot_json, seed, rng_state_json, last_seq, created_at, updated_at, ruleset_id, failure, failure_details_json)
SELECT id, room_id, module_id, module_version, state_schema_version, status, snapshot_json, seed, rng_state_json, last_seq, created_at, updated_at,
  COALESCE(
    json_extract(snapshot_json, '$.rulesetId'),
    CASE module_id
      WHEN 'undercover' THEN 'undercover_classic_v1'
      WHEN 'uno' THEN 'uno_legacy_platform_v1'
      WHEN 'landlord' THEN 'landlord_legacy_platform_v1'
      WHEN 'werewolf' THEN
        CASE WHEN json_extract(snapshot_json, '$.config.rulesetId') = 'werewolf_platform_open_kill_v1' THEN 'werewolf_platform_open_kill_v1'
             ELSE 'werewolf_legacy_platform_v2' END
      ELSE NULL
    END,
    'unregistered_module'
  ), NULL, NULL
FROM game_sessions;

-- 未注册模块的会话：仅仍处于活动态（PREPARING/ACTIVE/RECOVERING）的标记 SUSPENDED；
-- 已 ABORTED/FINISHED 的历史行不反转（与 v5 退役语义一致），也不占用活动位。
UPDATE game_sessions_new
SET status = 'SUSPENDED',
    failure = 'FAILED_RULESET_UNAVAILABLE',
    failure_details_json = '{"reason":"module_unregistered_at_migration"}'
WHERE module_id NOT IN ('uno','undercover','werewolf','landlord')
  AND status IN ('PREPARING','ACTIVE','RECOVERING');

DROP TABLE game_sessions;
ALTER TABLE game_sessions_new RENAME TO game_sessions;
CREATE UNIQUE INDEX idx_sessions_one_active ON game_sessions(room_id)
  WHERE status IN ('PREPARING','ACTIVE','RECOVERING','SUSPENDED');
PRAGMA foreign_keys = ON;

-- 迁移后外键完整性哨兵：存在任何违规即抛错，整条迁移回滚
SELECT json('foreign_key_violation')
WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check);
`,
  },
  {
    version: 8,
    name: 'add-adjudication-tasks',
    // D4-A1：持久化外部裁判任务。
    // 任务行在房间事务提交后创建（post-commit，独立于房间事务），
    // 结果按 task_id exactly-once 回灌：同 task_id 第二次到达被丢弃。
    // input_plaintext_json 仅 pending/running 需要，结果应用后擦除。
    // 普通 CREATE TABLE，无特殊外键处理；迁移器在迁移期间已保持 foreign_keys OFF。
    up: `
CREATE TABLE adjudication_tasks (
  task_id              TEXT PRIMARY KEY,
  session_id           TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  ruleset_id           TEXT NOT NULL,
  task_type            TEXT NOT NULL,
  submitted_at_seq     INTEGER NOT NULL,
  eligibility_digest   TEXT NOT NULL,
  input_digest         TEXT NOT NULL,
  input_plaintext_json TEXT,          -- 仅 pending/running 需要；结果应用后擦除
  status               TEXT NOT NULL CHECK (status IN ('pending','running','done','discarded','errored')),
  primary_attempt_json TEXT,
  fallback_attempt_json TEXT,
  result_json          TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE INDEX idx_adjudication_tasks_session ON adjudication_tasks(session_id, status);

-- 迁移后外键完整性哨兵：存在任何违规即抛错，整条迁移回滚
SELECT json('foreign_key_violation')
WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check);
`,
  },
  {
    version: 9,
    name: 'private-room-chat',
    up: `ALTER TABLE chat_messages ADD COLUMN to_player_id TEXT;
CREATE INDEX idx_chat_recipient ON chat_messages(room_id, to_player_id, id);`,
  },
];
