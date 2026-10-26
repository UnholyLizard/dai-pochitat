-- Reader management for staff: confirmed library card number, private staff notes, custom
-- (walk-in) readers without Telegram, and book loans with a return date.
--
-- Custom readers have no Telegram account: they get a negative, unique tg_id (real Telegram ids are
-- positive), so the NOT NULL UNIQUE column keeps working and they can never sign in.

ALTER TABLE users ADD COLUMN library_no TEXT;              -- set by staff = card number confirmed
ALTER TABLE users ADD COLUMN notes TEXT NOT NULL DEFAULT ''; -- staff only, never sent to the reader
ALTER TABLE users ADD COLUMN contact TEXT NOT NULL DEFAULT ''; -- phone / e-mail / parent, free text

CREATE UNIQUE INDEX IF NOT EXISTS users_library_no ON users (library_no) WHERE library_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  loaned_at INTEGER NOT NULL,
  due_date TEXT NOT NULL,            -- YYYY-MM-DD, the day the book is expected back
  returned_at INTEGER,               -- NULL while the book is out
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users (id) ON DELETE SET NULL
);
-- A book can be out with one reader at a time.
CREATE UNIQUE INDEX IF NOT EXISTS loans_one_open ON loans (book_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS loans_by_user ON loans (user_id, returned_at);
CREATE INDEX IF NOT EXISTS loans_open_due ON loans (due_date) WHERE returned_at IS NULL;
