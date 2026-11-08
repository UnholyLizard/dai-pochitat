-- Migration 0007: Events for block #5 (Parties & gatherings)
-- Stores library events, multilingual title/description/ages, start/end dates,
-- and Instagram announcement / recap links.

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  title_ru TEXT NOT NULL,
  title_en TEXT,
  text_ru TEXT,
  text_en TEXT,
  ages_ru TEXT,
  ages_en TEXT,
  instagram_announce TEXT,
  instagram_recap TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_start ON events (start);

-- Seed with library events
INSERT OR IGNORE INTO events (id, start, end, title_ru, title_en, text_ru, text_en, ages_ru, ages_en, instagram_announce, instagram_recap, created_at, updated_at) VALUES
('birthday-2026', '2026-09-25T14:00', '2026-09-25T16:30', 'День рождения библиотеки', 'The library’s birthday', 'Сто новых книг, литературные угощения и подарки для постоянных и новых читателей.', 'A hundred new books, literary treats and presents for old and new readers.', 'для всех', 'everyone', 'https://www.instagram.com/daipochitatmne/', 'https://www.instagram.com/daipochitatmne/', 1727272800000, 1727272800000),
('spooky-2026', '2026-10-30T17:00', '2026-10-30T19:00', 'Вечер страшилок с фонариками', 'Spooky stories by torchlight', 'Приносите фонарик и смелость. Страшно — но не очень.', 'Bring a torch and your bravest face. Scary — but not too scary.', '7+ лет', 'ages 7+', 'https://www.instagram.com/daipochitatmne/', 'https://www.instagram.com/daipochitatmne/', 1730307600000, 1730307600000),
('readaloud-2026-11', '2026-11-07T11:00', '2026-11-07T12:00', 'Громкие чтения для малышей', 'Read-aloud for little ones', 'Читаем по ролям и рисуем героев.', 'We read in voices and draw the characters.', '3–6 лет', 'ages 3–6', 'https://www.instagram.com/daipochitatmne/', 'https://www.instagram.com/daipochitatmne/', 1730977200000, 1730977200000),
('teens-2026-11', '2026-11-18T16:00', '2026-11-18T17:30', 'Подростковый книжный клуб', 'Teen book club', 'Обсуждаем «Книжного вора». Печенье прилагается.', 'This month: “The Book Thief”. Biscuits provided.', '13+ лет', 'ages 13+', 'https://www.instagram.com/daipochitatmne/', '', 1731945600000, 1731945600000),
('swap-2026-12', '2026-12-06T12:00', '2026-12-06T15:00', 'Книжный обмен', 'Book swap', 'Принеси книгу, которую уже прочитал, — унеси новую.', 'Bring a book you’ve finished, take home a new one.', 'для всех', 'everyone', 'https://www.instagram.com/daipochitatmne/', '', 1733486400000, 1733486400000);

-- Fix DP-0599 title and author in Serbian Latinica
UPDATE books SET title_me = 'Moj prijatelj Šejk u Sturebiju', author_me = 'Ulf Stark', author_ru = 'Ульф Старк', author_en = 'Ulf Stark' WHERE code = 'DP-0599';

