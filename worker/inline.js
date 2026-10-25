// Telegram inline mode: `@bot <query>` in any chat searches the catalog and shares a book card.
//
// Design (see Telegram-Inline.md): every book is a `photo` result — never a plain article — so the
// popup is one even gallery; books without a cover get the branded fallback poster. The first page
// opens with a "header" article that shows the match count, pivots to more by the same author, and,
// when tapped, shares a reading-list digest of the top 10.

import { log } from './util.js';

const FALLBACK_POSTER = '/og.jpg';          // Telegram wants JPEG for photo results
const COVER_DIR = '/covers-jpg';            // generated from public/covers by scripts/make-inline-covers.mjs
const PAGE_FIRST = 49;                      // + the header card = Telegram's 50
const PAGE_NEXT = 50;
const CAPTION_MAX = 1024;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ru = (code) => /^(ru|uk|be|kk)\b/i.test(code ?? '');

const UI = {
  ru: {
    found: (n, q) => `Найдено ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'книга' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'книги' : 'книг'}${q ? ` по «${q}»` : ''}`,
    all: (n) => `Библиотека «Дай почитать!» — ${n} книг`,
    tap: 'Нажмите на книгу, чтобы поделиться ею, или сюда — за списком для чтения',
    none: 'Ничего не нашлось',
    noneHint: 'Попробуйте название, автора или тему: «Пушкин», «про дружбу»',
    open: '📖 Открыть в каталоге',
    catalog: '📚 Весь каталог',
    more: (a) => `Ещё: ${a}`,
    app: '📚 Открыть библиотеку',
    author: 'Автор', illustrator: 'Иллюстратор', year: 'Год', age: 'Возраст', code: 'Шифр',
    shared: 'Список для чтения из «Дай почитать!»',
    andMore: (n) => `…и ещё ${n}`,
  },
  en: {
    found: (n, q) => `Found ${n} book${n === 1 ? '' : 's'}${q ? ` for “${q}”` : ''}`,
    all: (n) => `“Dai pochitat!” library — ${n} books`,
    tap: 'Tap a book to share it, or tap here for a reading list',
    none: 'Nothing found',
    noneHint: 'Try a title, an author or a topic: “Pushkin”, “about friendship”',
    open: '📖 Open in catalog',
    catalog: '📚 Full catalog',
    more: (a) => `More: ${a}`,
    app: '📚 Open the library',
    author: 'Author', illustrator: 'Illustrator', year: 'Year', age: 'Ages', code: 'Shelf code',
    shared: 'A reading list from “Dai pochitat!”',
    andMore: (n) => `…and ${n} more`,
  },
};

/** Pick the reader's language, falling back across the three the catalog stores. */
const pick = (b, field, lang) => (lang === 'ru' ? [b[`${field}_ru`], b[`${field}_en`], b[`${field}_me`]] : [b[`${field}_en`], b[`${field}_ru`], b[`${field}_me`]]).find(Boolean) ?? '';

function ftsMatch(q) {
  const words = q.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 6);
  return words.map((w) => `"${w}"*`).join(' ');
}

async function search(env, q, limit, offset) {
  const match = ftsMatch(q);
  const from = match
    ? "FROM books_fts f JOIN books b ON b.rowid = f.rowid WHERE books_fts MATCH ? AND b.status != 'lost'"
    : "FROM books b WHERE b.status != 'lost'";
  const order = match ? 'ORDER BY f.rank, b.code' : "ORDER BY (b.cover_url IS NULL OR b.cover_url = ''), b.code";
  const binds = match ? [match] : [];
  const [rows, count] = await Promise.all([
    env.DB.prepare(`SELECT b.* ${from} ${order} LIMIT ? OFFSET ?`).bind(...binds, limit, offset).all(),
    offset === 0 ? env.DB.prepare(`SELECT COUNT(*) AS n ${from}`).bind(...binds).first() : null,
  ]);
  return { books: rows.results ?? [], total: count?.n ?? null };
}

const ageLabel = (b) => (b.age_max >= 99 ? `${b.age_min}+` : b.age_min === b.age_max ? String(b.age_min) : `${b.age_min}–${b.age_max}`);

function caption(b, lang, T) {
  const author = pick(b, 'author', lang);
  const lines = [`<b>${esc(pick(b, 'title', lang))}</b>`];
  if (author) lines.push(`✍️ ${T.author}: ${esc(author)}`);
  if (b.illustrator) lines.push(`🎨 ${T.illustrator}: ${esc(b.illustrator)}`);
  const meta = [b.year && `${T.year}: ${b.year}`, `${T.age}: ${ageLabel(b)}`, b.code && `${T.code}: ${b.code}`].filter(Boolean);
  lines.push(`🏷️ ${meta.join(' · ')}`);
  const head = lines.join('\n');
  const blurb = pick(b, 'annotation', lang) || pick(b, 'says', lang);
  if (!blurb) return head;
  // Telegram rejects the whole answer when a caption is over 1024 characters: budget the blurb.
  const room = CAPTION_MAX - head.length - 8;
  if (room < 40) return head;
  let text = esc(blurb);
  if (text.length > room) {
    text = esc(blurb.slice(0, Math.max(0, room - 20)));
    text = `${text.slice(0, text.lastIndexOf(' ') > 20 ? text.lastIndexOf(' ') : text.length).replace(/&[a-z]*$/, '')}…`;
  }
  return `${head}\n\n<i>${text}</i>`;
}

function photoResult(b, origin, lang, T) {
  const poster = b.cover_url ? `${origin}${COVER_DIR}/${b.code}.jpg` : `${origin}${FALLBACK_POSTER}`;
  const author = pick(b, 'author', lang);
  const rows = [[{ text: T.open, url: `${origin}/?book=${encodeURIComponent(b.code)}` }]];
  if (author && author.length <= 40) rows.push([{ text: T.more(author), switch_inline_query_current_chat: author }]);
  else rows.push([{ text: T.catalog, url: `${origin}/` }]);
  return {
    type: 'photo',
    id: b.code,
    photo_url: poster,
    thumbnail_url: poster,
    title: pick(b, 'title', lang),
    description: [author, b.year, ageLabel(b)].filter(Boolean).join(' · '),
    caption: caption(b, lang, T),
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: rows },
  };
}

function headerResult(books, total, q, origin, lang, T) {
  const title = q ? T.found(total, q) : T.all(total);
  const top = books.slice(0, 10);
  const items = top.map((b) => {
    const author = pick(b, 'author', lang);
    return `📖 <a href="${esc(`${origin}/?book=${encodeURIComponent(b.code)}`)}">${esc(pick(b, 'title', lang))}</a>${author ? `\n      ${esc(author)}` : ''}${b.year ? ` (${b.year})` : ''}`;
  });
  const rest = total - top.length;
  const text = [`📚 <b>${esc(title)}</b>`, '', ...items.flatMap((i) => [i, '']), rest > 0 ? `<i>${T.andMore(rest)}</i>` : '', `<i>${T.shared}</i>`].join('\n').replace(/\n{3,}/g, '\n\n');

  // Pivot: if the query names an author, one tap lists everything by them.
  const first = books[0] && pick(books[0], 'author', lang);
  const hint = q && first && first.toLowerCase().includes(q.split(/\s+/)[0].toLowerCase()) && first.length <= 40 ? first : '';
  const keyboard = [];
  if (hint) keyboard.push([{ text: T.more(hint), switch_inline_query_current_chat: hint }]);
  keyboard.push([{ text: T.catalog, url: `${origin}/` }]);

  return {
    type: 'article',
    id: 'results_header',
    title: `📊 ${title}`,
    description: T.tap,
    thumbnail_url: `${origin}/icons/icon-192.png`,
    input_message_content: { message_text: text, parse_mode: 'HTML', disable_web_page_preview: true },
    reply_markup: { inline_keyboard: keyboard },
  };
}

/** Build the answerInlineQuery payload for one inline query. */
export async function inlineAnswer(env, query, origin) {
  const lang = ru(query.from?.language_code) ? 'ru' : 'en';
  const T = UI[lang];
  const q = (query.query ?? '').trim().slice(0, 64);
  const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
  const limit = offset === 0 ? PAGE_FIRST : PAGE_NEXT;

  const { books, total } = await search(env, q, limit, offset);

  const base = {
    inline_query_id: query.id,
    cache_time: 300,
    button: { text: T.app, web_app: { url: `${origin}/?tgapp=1` } },
  };
  if (!books.length && offset === 0) {
    return {
      ...base,
      results: [{
        type: 'article',
        id: 'no_results',
        title: T.none,
        description: T.noneHint,
        thumbnail_url: `${origin}/icons/icon-192.png`,
        input_message_content: { message_text: `${T.none}: «${esc(q)}»`, parse_mode: 'HTML' },
      }],
    };
  }

  const results = books.map((b) => photoResult(b, origin, lang, T));
  if (offset === 0) results.unshift(headerResult(books, total ?? books.length, q, origin, lang, T));
  return { ...base, results, next_offset: books.length === limit ? String(offset + limit) : '' };
}

export async function handleInline(env, query, origin, call) {
  try {
    const payload = await inlineAnswer(env, query, origin);
    await call(env, 'answerInlineQuery', payload);
  } catch (err) {
    log('error', 'inline query failed', { error: String(err?.message ?? err) });
  }
}
