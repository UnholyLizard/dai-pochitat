import fs from 'node:fs';
import path from 'node:path';
import { buildCatalogDataset } from './import-catalog.mjs';

const { books, collections, collectionLinks } = buildCatalogDataset();

function escapeSql(str) {
  if (str == null) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

const lines = [];
lines.push('-- Generated D1 Seed for Dai Pochitat Books Catalog');
lines.push('BEGIN TRANSACTION;');

// Insert collections
for (const col of collections) {
  lines.push(`INSERT OR REPLACE INTO collections (id, title_ru, title_en, title_me, slug, description_ru, description_en, description_me, created_at) VALUES (${escapeSql(col.id)}, ${escapeSql(col.title_ru)}, ${escapeSql(col.title_en)}, ${escapeSql(col.title_me)}, ${escapeSql(col.slug)}, ${escapeSql(col.description_ru)}, ${escapeSql(col.description_en)}, ${escapeSql(col.description_me)}, ${Date.now()});`);
}

// Insert books
for (const b of books) {
  lines.push(`INSERT OR REPLACE INTO books (id, code, title_ru, title_en, title_me, author_ru, author_en, author_me, illustrator, publisher, year, isbn, age_min, age_max, age_group, annotation_ru, annotation_en, annotation_me, says_ru, says_en, says_me, cover_url, dominant_color, primary_section, language, status, condition_notes, moods_json, tags_json, created_at, updated_at) VALUES (${escapeSql(b.id)}, ${escapeSql(b.code)}, ${escapeSql(b.title_ru)}, ${escapeSql(b.title_en)}, ${escapeSql(b.title_me)}, ${escapeSql(b.author_ru)}, ${escapeSql(b.author_en)}, ${escapeSql(b.author_me)}, ${escapeSql(b.illustrator)}, ${escapeSql(b.publisher)}, ${b.year || 'NULL'}, ${escapeSql(b.isbn)}, ${b.age_min}, ${b.age_max}, ${escapeSql(b.age_group)}, ${escapeSql(b.annotation_ru)}, ${escapeSql(b.annotation_en)}, ${escapeSql(b.annotation_me)}, ${escapeSql(b.says_ru)}, ${escapeSql(b.says_en)}, ${escapeSql(b.says_me)}, ${escapeSql(b.cover_url)}, ${escapeSql(b.dominant_color)}, ${escapeSql(b.primary_section)}, ${escapeSql(b.language)}, ${escapeSql(b.status)}, ${escapeSql(b.condition_notes)}, ${escapeSql(b.moods_json)}, ${escapeSql(b.tags_json)}, ${Date.now()}, ${Date.now()});`);
}

// Insert collection links
for (const link of collectionLinks) {
  lines.push(`INSERT OR REPLACE INTO collection_books (collection_id, book_id, position) VALUES (${escapeSql(link.collection_id)}, ${escapeSql(link.book_id)}, ${link.position});`);
}

// Insert into books_fts
for (const b of books) {
  lines.push(`INSERT INTO books_fts (rowid, title_ru, title_en, title_me, author_ru, author_en, author_me, annotation_ru) VALUES ((SELECT rowid FROM books WHERE id = ${escapeSql(b.id)}), ${escapeSql(b.title_ru)}, ${escapeSql(b.title_en)}, ${escapeSql(b.title_me)}, ${escapeSql(b.author_ru)}, ${escapeSql(b.author_en)}, ${escapeSql(b.author_me)}, ${escapeSql(b.annotation_ru)});`);
}

lines.push('COMMIT;');

const seedPath = path.resolve('migrations/0003_catalog_seed.sql');
fs.writeFileSync(seedPath, lines.join('\n'), 'utf-8');
console.log(`Generated seed SQL at ${seedPath} (${lines.length} lines, ${(fs.statSync(seedPath).size / 1024).toFixed(1)} KB)`);
