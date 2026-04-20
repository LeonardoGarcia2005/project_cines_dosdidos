-- ============================================================
--  CINES UNIDOS - Schema SQLite
--  Demostración de transacciones concurrentes
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT UNIQUE NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS movies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  genre       TEXT,
  duration    INTEGER,
  rating      TEXT
);

CREATE TABLE IF NOT EXISTS screenings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id     INTEGER REFERENCES movies(id),
  room         TEXT NOT NULL,
  starts_at    TEXT NOT NULL,
  total_seats  INTEGER NOT NULL DEFAULT 300
);

CREATE TABLE IF NOT EXISTS seats (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  screening_id INTEGER REFERENCES screenings(id) ON DELETE CASCADE,
  row_letter   TEXT NOT NULL,
  col_number   INTEGER NOT NULL,
  seat_type    TEXT DEFAULT 'standard',
  status       TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'held', 'reserved')),
  held_by      TEXT,
  held_until   TEXT,
  reserved_by  INTEGER REFERENCES users(id),
  reserved_at  TEXT,
  UNIQUE (screening_id, row_letter, col_number)
);

CREATE INDEX IF NOT EXISTS idx_seats_screening_status ON seats(screening_id, status);

CREATE TABLE IF NOT EXISTS reservations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  seat_id      INTEGER REFERENCES seats(id),
  user_id      INTEGER REFERENCES users(id),
  session_id   TEXT NOT NULL,
  action       TEXT NOT NULL,
  detail       TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
)
