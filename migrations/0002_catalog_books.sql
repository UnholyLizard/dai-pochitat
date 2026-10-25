-- Migration 0002: Catalog Books & Collections
-- Stores library books, multilingual titles & descriptions (RU, EN, ME),
-- tags, age ranges, shelf sections, and curated collections.

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,                       -- Unique book slug or UUID (e.g. 'club-druzei')
  code TEXT UNIQUE,                          -- Library accession / inventory code (e.g. 'DP-0001')
  title_ru TEXT NOT NULL,
  title_en TEXT,
  title_me TEXT,
  author_ru TEXT,
  author_en TEXT,
  author_me TEXT,
  illustrator TEXT,
  publisher TEXT,
  year INTEGER,
  isbn TEXT,
  age_min INTEGER NOT NULL DEFAULT 0,
  age_max INTEGER NOT NULL DEFAULT 99,
  age_group TEXT NOT NULL DEFAULT 'middle',  -- 'little' (0-6), 'middle' (7-10), 'big' (11-13), 'teen' (14-18), 'adult' (18+)
  annotation_ru TEXT,
  annotation_en TEXT,
  annotation_me TEXT,
  says_ru TEXT,                              -- Short librarian pitch in Russian
  says_en TEXT,                              -- Short librarian pitch in English
  says_me TEXT,                              -- Short librarian pitch in Montenegrin
  cover_url TEXT,                            -- Path or URL to cover image (e.g. '/covers/cellImage_...webp')
  dominant_color TEXT DEFAULT '#2f8a84',     -- Hex color for UI cards & 3D spine
  primary_section TEXT NOT NULL,             -- '0+', '7-9', 'teens', 'adults', 'classics', 'comics', 'poetry', 'nonfiction', 'me_sr', 'en'
  language TEXT NOT NULL DEFAULT 'ru',       -- Original book language: 'ru', 'en', 'me', 'sr', 'de', 'fr', etc.
  status TEXT NOT NULL DEFAULT 'available',  -- 'available', 'borrowed', 'reserved', 'repair', 'lost'
  condition_notes TEXT,                      -- e.g. 'большого формата', 'поврежден корешок'
  moods_json TEXT DEFAULT '[]',              -- JSON array: ["funny", "friends"]
  tags_json TEXT DEFAULT '[]',               -- JSON array: ["comics", "friendship", "animals"]
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Search and lookup indexes
CREATE INDEX IF NOT EXISTS idx_books_age ON books (age_min, age_max);
CREATE INDEX IF NOT EXISTS idx_books_section ON books (primary_section);
CREATE INDEX IF NOT EXISTS idx_books_language ON books (language);
CREATE INDEX IF NOT EXISTS idx_books_status ON books (status);

-- Curated collections (e.g. '14_feb' for Valentine's, 'new_year', 'human_rights', 'staff_picks')
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  title_ru TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_me TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description_ru TEXT,
  description_en TEXT,
  description_me TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_books (
  collection_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  PRIMARY KEY (collection_id, book_id),
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_collection_books_book ON collection_books(book_id);

-- Full text search across 3 languages
CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5 (
  title_ru,
  title_en,
  title_me,
  author_ru,
  author_en,
  author_me,
  annotation_ru,
  tokenize = 'unicode61'
);
