-- Telegram-backed accounts, sessions, saved progress and the live chat with Natasha.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id INTEGER NOT NULL UNIQUE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  -- 'owner' (the first person who signed in), 'admin' (receives Natasha's chat), 'user'
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user')),
  game_json TEXT,
  created_at INTEGER NOT NULL,
  last_login INTEGER NOT NULL
);

-- Only a SHA-256 of the cookie token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions (user_id);

-- Login by bot: the page shows t.me/<bot>?start=login_<code> and polls with <secret>.
CREATE TABLE IF NOT EXISTS login_tokens (
  code TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  user_id INTEGER REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- dir: 'in' = reader → Natasha, 'out' = Natasha → reader.
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  dir TEXT NOT NULL CHECK (dir IN ('in', 'out')),
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_by_user ON chat_messages (user_id, id);

-- Which Telegram message (in an admin's chat with the bot) carries which reader's question,
-- so Natasha answers by simply replying to it.
CREATE TABLE IF NOT EXISTS tg_relay (
  chat_id INTEGER NOT NULL,
  tg_message_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (chat_id, tg_message_id)
);
