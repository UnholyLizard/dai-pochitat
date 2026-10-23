-- One row per anonymous voter; changing your mind updates the row instead of adding one.
CREATE TABLE IF NOT EXISTS votes (
  voter TEXT PRIMARY KEY,
  candidate TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS votes_by_candidate ON votes (candidate);
