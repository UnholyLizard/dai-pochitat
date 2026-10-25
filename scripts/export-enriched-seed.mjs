import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

console.log('Exporting enriched catalog from local D1 to migrations/0003_catalog_seed.sql...');

function escapeSql(str) {
  if (str == null) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

// 1. Get collections
const rawCol = execSync('npx wrangler d1 execute dai-pochitat-casting --local --json --command "SELECT * FROM collections ORDER BY id ASC;"', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const collections = JSON.parse(rawCol.slice(rawCol.indexOf('[')))[0].results;

// 2. Get books
const rawBooks = execSync('npx wrangler d1 execute dai-pochitat-casting --local --json --command "SELECT * FROM books ORDER BY code ASC;"', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
const books = JSON.parse(rawBooks.slice(rawBooks.indexOf('[')))[0].results;

// 3. Get collection_books
const rawLinks = execSync('npx wrangler d1 execute dai-pochitat-casting --local --json --command "SELECT * FROM collection_books ORDER BY collection_id, position ASC;"', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const links = JSON.parse(rawLinks.slice(rawLinks.indexOf('[')))[0].results;

console.log(`Loaded ${collections.length} collections, ${books.length} books, ${links.length} collection links.`);

const lines = [];
lines.push('-- Generated D1 Seed with Full 3-Language Enriched Dai Pochitat Catalog');

for (const c of collections) {
  lines.push(`INSERT OR REPLACE INTO collections (id, title_ru, title_en, title_me, slug, description_ru, description_en, description_me, created_at) VALUES (${escapeSql(c.id)}, ${escapeSql(c.title_ru)}, ${escapeSql(c.title_en)}, ${escapeSql(c.title_me)}, ${escapeSql(c.slug)}, ${escapeSql(c.description_ru)}, ${escapeSql(c.description_en)}, ${escapeSql(c.description_me)}, ${c.created_at});`);
}

for (const b of books) {
  lines.push(`INSERT OR REPLACE INTO books (id, code, title_ru, title_en, title_me, author_ru, author_en, author_me, illustrator, publisher, year, isbn, age_min, age_max, age_group, annotation_ru, annotation_en, annotation_me, says_ru, says_en, says_me, cover_url, dominant_color, primary_section, language, status, condition_notes, moods_json, tags_json, created_at, updated_at) VALUES (${escapeSql(b.id)}, ${escapeSql(b.code)}, ${escapeSql(b.title_ru)}, ${escapeSql(b.title_en)}, ${escapeSql(b.title_me)}, ${escapeSql(b.author_ru)}, ${escapeSql(b.author_en)}, ${escapeSql(b.author_me)}, ${escapeSql(b.illustrator)}, ${escapeSql(b.publisher)}, ${b.year || 'NULL'}, ${escapeSql(b.isbn)}, ${b.age_min}, ${b.age_max}, ${escapeSql(b.age_group)}, ${escapeSql(b.annotation_ru)}, ${escapeSql(b.annotation_en)}, ${escapeSql(b.annotation_me)}, ${escapeSql(b.says_ru)}, ${escapeSql(b.says_en)}, ${escapeSql(b.says_me)}, ${escapeSql(b.cover_url)}, ${escapeSql(b.dominant_color)}, ${escapeSql(b.primary_section)}, ${escapeSql(b.language)}, ${escapeSql(b.status)}, ${escapeSql(b.condition_notes)}, ${escapeSql(b.moods_json)}, ${escapeSql(b.tags_json)}, ${b.created_at}, ${b.updated_at});`);
}

for (const l of links) {
  lines.push(`INSERT OR REPLACE INTO collection_books (collection_id, book_id, position) VALUES (${escapeSql(l.collection_id)}, ${escapeSql(l.book_id)}, ${l.position});`);
}

for (const b of books) {
  lines.push(`INSERT INTO books_fts (rowid, title_ru, title_en, title_me, author_ru, author_en, author_me, annotation_ru) VALUES ((SELECT rowid FROM books WHERE id = ${escapeSql(b.id)}), ${escapeSql(b.title_ru)}, ${escapeSql(b.title_en)}, ${escapeSql(b.title_me)}, ${escapeSql(b.author_ru)}, ${escapeSql(b.author_en)}, ${escapeSql(b.author_me)}, ${escapeSql(b.annotation_ru)});`);
}

const target = path.resolve('migrations/0003_catalog_seed.sql');
fs.writeFileSync(target, lines.join('\n'), 'utf-8');
console.log(`Successfully updated ${target} (${lines.length} lines, ${(fs.statSync(target).size / (1024 * 1024)).toFixed(2)} MB)`);
