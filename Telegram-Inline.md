# Telegram Bot Inline Mode: Posters-Only & Preserved Header Design Architecture

This specification document outlines the architecture, UX patterns, and implementation details of the **MonteGigs Telegram Inline Bot** (`@MonteGigsBot`). It serves as a production blueprint for building high-engagement, visual-first catalog experiences in Telegram (such as events, books, movies, or merchandise).

---

## 1. Design Philosophy: Visual-First "Posters-Only" Catalog

In Telegram, inline bots allow users to type `@BotUsername <query>` in any chat (direct messages, groups, or channels) to browse items and share interactive cards directly into the conversation without leaving the chat.

### The Problem with Telegram's Default Inline Flow
By default, developers often return a mixed bag of results:
- Items with pictures return `InlineQueryResultPhoto`.
- Items without pictures degrade to `InlineQueryResultArticle` (plain text list item).

In the Telegram UI, this produces a disjointed, low-quality experience: the user sees a chaotic list with small text snippets interspersed between large picture cards. Furthermore, when shared, an article sends plain text, whereas a photo sends a rich visual card with an embedded image.

### Our Solution: Guaranteed Posters-Only (`type: 'photo'`)
Every catalog item in MonteGigs is **always** delivered as an `InlineQueryResultPhoto`:
1. **Uniform Visual Grid / Carousel**: The Telegram inline popup presents a clean, consistent visual gallery.
2. **No Degradation on Missing Artwork**: If an item does not have a user-uploaded poster or custom image, the bot does **not** fall back to a text article. Instead, it serves a polished, high-resolution branded fallback poster (e.g. `https://montegigs.me/logo_social.png`).
3. **Rich Metadata in Search Results**: Even though the card is a photo, Telegram displays the `title` and `description` fields in the search list, providing immediate context (date, venue/author, category, price/rating) prior to sharing.

---

## 2. The Preserved Header Result (Sticky Search HUD & Digest)

Telegram inline query popups do not have native persistent headers or toolbar menus. To create an interactive search "HUD" (Heads-Up Display), we introduce a **Preserved Header-Like Result** as the very first card on the first page (`offset === 0`).

```
┌─────────────────────────────────────────────────────────────┐
│ 📊 Found 12 results for "rock"                              │ <-- Sticky Header Card
│ Tap an event below to share it (or tap here for full digest)│     (type: 'article')
├─────────────────────────────────────────────────────────────┤
│ 🖼️ [ POSTER 1 ] - Hard Rock Halloween                      │ <-- Catalog Item 1
│ 31 Oct | Podgorica | Hard Rock Cafe | €: Free               │     (type: 'photo')
├─────────────────────────────────────────────────────────────┤
│ 🖼️ [ POSTER 2 ] - Winter Rock Festival                      │ <-- Catalog Item 2
│ 14 Nov | Budva | Beer & Bike Club | €: 10                   │     (type: 'photo')
└─────────────────────────────────────────────────────────────┘
```

### Key Characteristics of the Header Card
- **Type**: `InlineQueryResultArticle` with `id: 'results_header'`.
- **Top Placement**: Prepended at index 0 on `offset === 0` via `results.unshift(...)`.
- **Thumbnail**: Branded icon (`/logo_social.png`).
- **Dynamic Action Keyboard**:
  - If a filter was detected (e.g., city `"Budva"` or author `"Tolkien"`), an interactive button with `switch_inline_query_current_chat: "<filter>"` is attached so the user can quickly pivot the query with one tap.
  - A primary call-to-action button linking directly to the full catalog web app (`url: "https://montegigs.me/"`).
- **One-Tap Digest Sharing**: If the user taps the header card itself, instead of sharing an individual event, it sends a **Compiled Markdown Digest** summarizing the top 10 matching results with clickable links, dates, and locations.

---

## 3. Telegram Bot API Object Structure

### 3.1 Item Card (`InlineQueryResultPhoto`)

```javascript
{
  type: 'photo',
  id: String(item.id),
  photo_url: photoUrl,           // Full-size image URL (HTTPS)
  thumb_url: photoUrl,           // Thumbnail preview URL (Legacy clients)
  thumbnail_url: photoUrl,       // Thumbnail preview URL (Bot API 6.0+)
  caption: captionText,          // Markdown formatted caption (Max 1024 chars)
  parse_mode: 'Markdown',
  reply_markup: {
    inline_keyboard: [
      [{ text: '👁️ View Event', url: `${siteOrigin}/events/...` }],
      [{ text: '🎟️ Buy Tickets', url: item.ticket_link }]
    ]
  },
  photo_width: 512,
  photo_height: 512,
  title: (item.hasDeal ? '⭐ ' : '') + item.name,
  description: `${item.date} | ${item.venue?.city || 'Montenegro'} | ${item.venue?.name || 'TBA'} | €:${item.cost || 'TBA'}`
}
```

> [!IMPORTANT]
> **Caption Length Limit**: Telegram restricts photo captions to **1024 characters**. If a caption exceeds 1024 characters, Telegram rejects the entire `answerInlineQuery` call with `400 Bad Request: MEDIA_CAPTION_TOO_LONG`. Always pass captions through a Markdown-safe truncation helper.

### 3.2 Header Card (`InlineQueryResultArticle`)

```javascript
{
  type: 'article',
  id: 'results_header',
  title: `📊 Found ${countText}${queryText}`,
  description: 'Tap an event below to share it',
  thumb_url: `${siteOrigin}/logo_social.png`,
  thumbnail_url: `${siteOrigin}/logo_social.png`,
  input_message_content: {
    message_text: digestMarkdownText,
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  },
  reply_markup: {
    inline_keyboard: [
      [{ text: `More in ${cityHint}`, switch_inline_query_current_chat: cityHint }],
      [{ text: '🎭 Browse All Events', url: `${siteOrigin}/` }]
    ]
  }
}
```

---

## 4. Full-Text Search (FTS5) & Entity Discovery Architecture

MonteGigs uses SQLite / Cloudflare D1 **FTS5** virtual tables to achieve sub-15ms fuzzy and prefix searches across multiple entity tables.

### Dual-FTS Table Strategy
1. **Entity FTS (`events_fts`)**: Indexes `name`, `description`, `description_ru`, `description_bs`, `venue_name`, `venue_city`, and `venue_address`.
2. **Creator FTS (`artists_fts`)**: Indexes `name`, `genres`, `profile`, `profile_ru`, and `profile_bs`.

### Prefix MATCH Query Syntax
User inputs are normalized and expanded into spelling variants (handling Montenegrin Latin and Cyrillic variants like `ž/z/zh`, `đ/dj/d`, `č/c/ch`):
```javascript
export function createFtsMatchString(searchTerms) {
  if (!searchTerms || searchTerms.length === 0) return null;
  const sanitizedTerms = searchTerms
    .map((term) => String(term || '').replace(/[\\"*()]/g, ' ').trim())
    .filter((term) => term.length > 0)
    .map((term) => `"${term}"*`);

  if (sanitizedTerms.length === 0) return null;
  if (sanitizedTerms.length === 1) return sanitizedTerms[0];
  return `(${sanitizedTerms.join(' OR ')})`;
}
```
*Example*: Querying `"rock"` with variants `['rock', 'рок']` creates:
```sql
("rock"* OR "рок"*)
```

### Cross-Referencing Entity Graph
1. Step 1: Query `artists_fts MATCH ?` to find creator IDs matching the query by name, genre, or profile text.
2. Step 2: Query `events` matching either `events_fts` OR where `events.artist_ids` (stored as JSON array `[1, 2, 3]`) contains any of the matched artist IDs using `json_each`:
```sql
SELECT e.id, e.name, e.date, v.name AS venue_name
FROM events e
LEFT JOIN venues v ON v.id = e.venue_id
WHERE e.status = 'confirmed' AND e.date >= ?
  AND (
    e.id IN (SELECT rowid FROM events_fts WHERE events_fts MATCH ?)
    OR LOWER(COALESCE(e.genre, '')) LIKE ? ESCAPE '\'
    OR LOWER(COALESCE(e.event_type, '')) LIKE ? ESCAPE '\'
    OR EXISTS (
      SELECT 1 FROM json_each(CASE WHEN json_valid(e.artist_ids) THEN e.artist_ids ELSE '[]' END) j
      WHERE j.value IN (3, 11, 19, 23, 24)
    )
  )
ORDER BY e.date, COALESCE(e.time, '99:99')
LIMIT ? OFFSET ?;
```
3. Step 3: Gracefully fall back to standard `LIKE` matching if FTS5 tables are not present (e.g. in minimal unit test environments).

---

## 5. Pagination & Offset Mechanics

Telegram's Bot API limits inline query responses to **50 items maximum** per `answerInlineQuery` call.

- **Page 1 (`offset === 0`)**:
  - Request `limit = 49` from the database.
  - Insert 1 Header Card (`results_header`).
  - Total returned to Telegram = `1 + 49 = 50`.
  - Next offset: `events.length === 49 ? "49" : ""`.
- **Page 2+ (`offset > 0`)**:
  - Request `limit = 50` from the database.
  - Do **not** insert the header card.
  - Total returned to Telegram = `50`.
  - Next offset: `events.length === 50 ? String(offset + 50) : ""`.

---

## 6. Blueprint: Adapting the Design to a Books Catalog

To adapt this pattern to a **Books Catalog**, follow the mapping below:

| MonteGigs Events Concept | Books Catalog Implementation |
| :--- | :--- |
| **Event Poster** | **Book Cover** (front jacket / 2:3 or 1:1 square crop) |
| **Poster Fallback** | **Branded Book Cover Placeholder** (`/book_cover_placeholder.png`) |
| **Venue / City** | **Publisher / Language / Edition** |
| **Artist / Performer** | **Author / Illustrator / Translator** |
| **Event Caption** | **Title, Author, Year, Rating, Genre, Blurb snippet** |
| **Primary Action** | `[📖 Read Preview]` or `[🛒 Buy Book]` |
| **Sticky Header** | `📊 Found X books for "[query]"` + `[More by Author]` button |
| **Header Digest Tap** | Markdown Reading List sharing the top 10 books with Goodreads/Store links |

### 6.1 Database Schema (D1 / SQLite)

```sql
CREATE TABLE authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    bio TEXT,
    photo_url TEXT
);

CREATE TABLE books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author_ids TEXT NOT NULL DEFAULT '[]', -- JSON array of author IDs: [1, 2]
    isbn TEXT,
    publisher TEXT,
    year INTEGER,
    genre TEXT,
    rating REAL DEFAULT 0.0,
    cover_image TEXT,
    description TEXT,
    preview_url TEXT,
    buy_url TEXT,
    status TEXT NOT NULL DEFAULT 'available' -- 'available', 'archived'
);

-- FTS5 Tables
CREATE VIRTUAL TABLE books_fts USING fts5(
    title,
    description,
    genre,
    publisher,
    tokenize='unicode61'
);

CREATE VIRTUAL TABLE authors_fts USING fts5(
    name,
    bio,
    tokenize='unicode61'
);
```

### 6.2 Book Inline Result Formatter (grammY / Cloudflare Worker)

```javascript
import { InlineKeyboard } from 'grammy';

function escapeMarkdown(text) {
  return text ? String(text).replace(/([*_`[\]()])/g, '\\$1') : '';
}

function truncate(text, maxLength = 1024) {
  if (!text || text.length <= maxLength) return text || '';
  const suffix = '\n\n... (truncated)';
  return text.substring(0, maxLength - suffix.length) + suffix;
}

export async function formatBookInlineResults(db, origin, books, { query, authorHint, offset = 0 }) {
  const coverFallback = `${origin}/book_cover_placeholder.png`;

  if (!books.length) {
    return {
      results: [{
        type: 'article',
        id: 'no_results',
        title: 'No books found',
        input_message_content: { message_text: `No books found for "${query}"` }
      }],
      next_offset: '',
      cache_time: 300,
    };
  }

  // 1. Map each book into a guaranteed 'photo' card
  const results = books.map((book) => {
    const coverUrl = book.cover_image
      ? (/^https?:\/\//.test(book.cover_image) ? book.cover_image : `${origin}${book.cover_image}`)
      : coverFallback;

    const title = escapeMarkdown(book.title);
    const authorName = escapeMarkdown(book.author_name || 'Unknown Author');
    const year = book.year ? ` (${book.year})` : '';
    const rating = book.rating > 0 ? `⭐ ${book.rating.toFixed(1)}/5` : 'Not Rated';
    const genre = book.genre ? `\n🏷️ *Genre*: ${escapeMarkdown(book.genre)}` : '';
    const blurb = book.description ? `\n\n📖 *Summary*:\n${escapeMarkdown(book.description)}` : '';

    const caption = `*${title}*${year}\n✍️ *Author*: ${authorName}\n📊 *Rating*: ${rating}${genre}${blurb}`;

    const kb = new InlineKeyboard();
    if (book.preview_url) {
      kb.url('📖 Read Preview', book.preview_url);
    }
    if (book.buy_url) {
      kb.row().url('🛒 Buy Book', book.buy_url);
    }

    return {
      type: 'photo',
      id: String(book.id),
      photo_url: coverUrl,
      thumb_url: coverUrl,
      thumbnail_url: coverUrl,
      caption: truncate(caption, 1024),
      parse_mode: 'Markdown',
      reply_markup: kb,
      title: `${book.rating > 4.5 ? '🏆 ' : ''}${book.title}`,
      description: `${book.author_name || 'Unknown'} | ${book.year || 'N/A'} | ${book.genre || 'General'} | ⭐ ${book.rating || 'N/A'}`
    };
  });

  // 2. Add Preserved Sticky Header Card on First Page
  if (offset === 0) {
    const headerTitle = `Found ${books.length}+ books${query ? ` for "${query}"` : ''}`;
    
    // Build top 10 reading list digest
    let digest = `📚 *${escapeMarkdown(headerTitle)}*\n\n`;
    const topBooks = books.slice(0, 10);
    for (const b of topBooks) {
      const star = b.rating >= 4.5 ? '⭐ ' : '📖 ';
      const link = b.preview_url || b.buy_url || `${origin}/books/${b.id}`;
      digest += `${star}[${escapeMarkdown(b.title)}](${link})\n      by ${escapeMarkdown(b.author_name || 'Unknown')} (${b.year || 'N/A'})\n\n`;
    }
    if (books.length > topBooks.length) {
      digest += `_...and ${books.length - topBooks.length} more books_\n\n`;
    }
    digest += `_Shared via @BookCatalogBot_`;

    const navButtons = [];
    if (authorHint) {
      navButtons.push([{ text: `More by ${authorHint}`, switch_inline_query_current_chat: authorHint }]);
    }
    navButtons.push([{ text: '📚 Browse Full Library', url: `${origin}/` }]);

    results.unshift({
      type: 'article',
      id: 'results_header',
      title: `📊 ${headerTitle}`,
      description: 'Tap a book below to share it, or tap here for full reading list',
      thumb_url: `${origin}/book_icon.png`,
      thumbnail_url: `${origin}/book_icon.png`,
      input_message_content: {
        message_text: digest,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      },
      reply_markup: { inline_keyboard: navButtons }
    });
  }

  // 3. Respect 50 items Telegram limit
  const page = results.slice(0, 50);
  const expectedLimit = offset === 0 ? 49 : 50;
  return {
    results: page,
    next_offset: books.length === expectedLimit ? String(offset + expectedLimit) : '',
    cache_time: 300
  };
}
```

---

## 7. Quality Checklist for Production Deployment

- [x] **Constant-time secret comparison**: Ensure `X-Telegram-Bot-Api-Secret-Token` matches `env.TELEGRAM_WEBHOOK_SECRET` without extra whitespace or newlines.
- [x] **Guaranteed Photo Types**: Every catalog item has `type: 'photo'` and points to an absolute, public HTTPS image URL.
- [x] **Fallback Visual Asset**: Publicly serve a branded fallback graphic (`/logo_social.png` or `/book_cover_placeholder.png`) with long cache headers (`Cache-Control: public, max-age=604800`).
- [x] **Safe Caption Truncation**: Strictly constrain photo captions to $\le 1024$ characters.
- [x] **Markdown Entity Escaping**: Ensure reserved characters (`*`, `_`, `[`, `]`, `(`, `)`) in names and descriptions are escaped.
- [x] **Dual FTS Indexing**: Search against item FTS and creator/author FTS, bridging IDs through `json_each`.
- [x] **Pagination Offsets**: Use `offset 0 -> limit 49 (+1 header = 50)`, then `offset 49 -> limit 50`.
