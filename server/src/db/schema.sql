CREATE TABLE IF NOT EXISTS games (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_type_configs (
  game_id           TEXT NOT NULL REFERENCES games(id),
  event_type        TEXT NOT NULL,
  label             TEXT NOT NULL,
  duration_min      INTEGER NOT NULL CHECK (duration_min > 0),
  default_capacity  INTEGER NOT NULL,
  max_capacity      INTEGER NOT NULL CHECK (max_capacity BETWEEN 1 AND 30),
  min_players       INTEGER NOT NULL CHECK (min_players >= 2),
  PRIMARY KEY (game_id, event_type),
  CHECK (default_capacity BETWEEN min_players AND max_capacity)
);

CREATE TABLE IF NOT EXISTS events (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  game_id          TEXT NOT NULL REFERENCES games(id),
  event_type       TEXT NOT NULL,
  starts_at        TEXT NOT NULL,   -- UTC ISO 8601
  duration_min     INTEGER NOT NULL,
  capacity         INTEGER NOT NULL,
  min_players      INTEGER NOT NULL,
  location         TEXT NOT NULL,
  confirmed_count  INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  FOREIGN KEY (game_id, event_type) REFERENCES event_type_configs(game_id, event_type),
  CHECK (capacity > 0 AND capacity <= 30),
  CHECK (confirmed_count >= 0 AND confirmed_count <= capacity)
);

CREATE TABLE IF NOT EXISTS registrations (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL REFERENCES events(id),
  player_name  TEXT NOT NULL,
  player_key   TEXT NOT NULL,       -- lower(trim(player_name)), computed in app
  created_at   TEXT NOT NULL,
  UNIQUE (event_id, player_key)
);

CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at);
