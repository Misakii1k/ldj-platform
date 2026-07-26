CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL CHECK (applied_at >= 0)
) STRICT;

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('LOBBY', 'IN_GAME', 'POST_GAME', 'CLOSED')),
  host_player_id TEXT,
  game_id TEXT,
  config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json)),
  seq INTEGER NOT NULL DEFAULT 0 CHECK (seq >= 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
  expires_at INTEGER CHECK (expires_at IS NULL OR expires_at >= 0)
) STRICT;

CREATE TABLE IF NOT EXISTS room_members (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  seat_role TEXT NOT NULL CHECK (seat_role IN ('player', 'spectator')),
  seat INTEGER CHECK (seat IS NULL OR seat >= 0),
  resume_token_hash TEXT NOT NULL,
  reserved_until INTEGER CHECK (reserved_until IS NULL OR reserved_until >= 0),
  joined_at INTEGER NOT NULL CHECK (joined_at >= 0),
  PRIMARY KEY (room_id, player_id),
  UNIQUE (room_id, identity_id)
) STRICT;

CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  module_version TEXT NOT NULL,
  state_schema_version INTEGER NOT NULL CHECK (state_schema_version > 0),
  status TEXT NOT NULL CHECK (
    status IN ('PREPARING', 'ACTIVE', 'RECOVERING', 'FINISHED', 'ABORTED')
  ),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  seed TEXT NOT NULL,
  rng_state_json TEXT NOT NULL CHECK (json_valid(rng_state_json)),
  last_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
) STRICT;

CREATE TABLE IF NOT EXISTS game_events (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq > 0),
  request_id TEXT,
  command_time INTEGER NOT NULL CHECK (command_time >= 0),
  actor_json TEXT NOT NULL CHECK (json_valid(actor_json)),
  action_json TEXT NOT NULL CHECK (json_valid(action_json)),
  events_json TEXT NOT NULL CHECK (json_valid(events_json)),
  UNIQUE (session_id, seq)
) STRICT;

CREATE TABLE IF NOT EXISTS command_receipts (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  actor_scope TEXT NOT NULL,
  request_id TEXT NOT NULL,
  room_seq INTEGER NOT NULL CHECK (room_seq >= 0),
  outcome_json TEXT NOT NULL CHECK (json_valid(outcome_json)),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  PRIMARY KEY (room_id, actor_scope, request_id)
) STRICT;

CREATE TABLE IF NOT EXISTS timers (
  session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  timer_id TEXT NOT NULL,
  deadline_at INTEGER NOT NULL CHECK (deadline_at >= 0),
  action_json TEXT NOT NULL CHECK (json_valid(action_json)),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'CANCELLED', 'CONSUMED')),
  PRIMARY KEY (session_id, timer_id)
) STRICT;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES game_sessions(id) ON DELETE SET NULL,
  from_player_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('player', 'system')),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 300),
  created_at INTEGER NOT NULL CHECK (created_at >= 0)
) STRICT;

CREATE TABLE IF NOT EXISTS game_results (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE REFERENCES game_sessions(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  created_at INTEGER NOT NULL CHECK (created_at >= 0)
) STRICT;

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  actor_player_id TEXT,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at INTEGER NOT NULL CHECK (created_at >= 0)
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS room_members_player_seat_unique
  ON room_members(room_id, seat)
  WHERE seat_role = 'player' AND seat IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS game_sessions_one_active_per_room
  ON game_sessions(room_id)
  WHERE status IN ('PREPARING', 'ACTIVE', 'RECOVERING');

CREATE UNIQUE INDEX IF NOT EXISTS game_events_request_unique
  ON game_events(session_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS game_events_session_seq
  ON game_events(session_id, seq);

CREATE INDEX IF NOT EXISTS chat_messages_room_cursor
  ON chat_messages(room_id, id);

CREATE INDEX IF NOT EXISTS timers_pending_deadline
  ON timers(deadline_at)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS audit_log_room_created
  ON audit_log(room_id, created_at);
