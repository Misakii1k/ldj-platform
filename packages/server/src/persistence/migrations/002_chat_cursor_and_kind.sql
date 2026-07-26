CREATE TABLE chat_messages_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES game_sessions(id) ON DELETE SET NULL,
  from_player_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('user', 'system')),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 300),
  created_at INTEGER NOT NULL CHECK (created_at >= 0)
) STRICT;

INSERT INTO chat_messages_v2
  (id, room_id, session_id, from_player_id, kind, text, created_at)
SELECT
  id,
  room_id,
  session_id,
  from_player_id,
  CASE kind WHEN 'player' THEN 'user' ELSE kind END,
  text,
  created_at
FROM chat_messages
ORDER BY id;

DROP TABLE chat_messages;
ALTER TABLE chat_messages_v2 RENAME TO chat_messages;

CREATE INDEX chat_messages_room_cursor
  ON chat_messages(room_id, id);
