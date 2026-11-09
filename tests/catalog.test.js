import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKS } from '../src/content/books.js';
import { getBookTitle, getBookAuthor, transliterateSerbian } from '../src/lib/translit.js';

function matchesAgeGroup(b, group) {
  if (!group) return true;
  if (b.age_group === group || b.ageGroup === group) return true;
  const min = b.age ? b.age[0] : (b.age_min ?? 0);
  const max = b.age ? b.age[1] : (b.age_max ?? 99);
  if (group === 'little') return min <= 6;
  if (group === 'middle') return min <= 10 && max >= 7;
  if (group === 'big' || group === 'teen') return min <= 15 && max >= 11;
  if (group === 'adult') return min >= 16 || (max >= 16 && min >= 12);
  return false;
}

test('translit - transliterates Serbian Cyrillic to Latinica', () => {
  assert.equal(transliterateSerbian('Мали принц'), 'Mali princ');
  assert.equal(transliterateSerbian('Љубав'), 'Ljubav');
});

test('getBookTitle and getBookAuthor - resolves strings without [object Object]', () => {
  for (const b of BOOKS) {
    const title = getBookTitle(b);
    const author = getBookAuthor(b);
    assert.equal(typeof title, 'string');
    assert.ok(title.length > 0);
    assert.ok(!title.includes('[object Object]'), `title contains [object Object] for ${b.id}`);

    assert.equal(typeof author, 'string');
    assert.ok(author.length > 0);
    assert.ok(!author.includes('[object Object]'), `author contains [object Object] for ${b.id}`);
  }
});

test('catalog fallback filtering - search works in Russian and English', () => {
  const search = (q) => {
    const ql = q.toLowerCase();
    return BOOKS.filter((b) => {
      const titleObj = typeof b.title === 'object' && b.title !== null ? b.title : null;
      const authorObj = typeof b.author === 'object' && b.author !== null ? b.author : null;
      const tr = (titleObj ? (titleObj.ru || '') : (b.title_ru || b.title || '')).toLowerCase();
      const te = (titleObj ? (titleObj.en || '') : (b.title_en || '')).toLowerCase();
      const ar = (authorObj ? (authorObj.ru || '') : (b.author_ru || b.author || '')).toLowerCase();
      const ae = (authorObj ? (authorObj.en || '') : (b.author_en || '')).toLowerCase();
      return tr.includes(ql) || te.includes(ql) || ar.includes(ql) || ae.includes(ql);
    });
  };

  const ruTitleMatch = search('Груффало');
  assert.ok(ruTitleMatch.length > 0, 'Should find Gruffalo in Russian');

  const enTitleMatch = search('Gruffalo');
  assert.ok(enTitleMatch.length > 0, 'Should find Gruffalo in English');

  const enAuthorMatch = search('Lindgren');
  assert.ok(enAuthorMatch.length >= 2, 'Should find books by Lindgren in English');

  const ruAuthorMatch = search('Линдгрен');
  assert.ok(ruAuthorMatch.length >= 2, 'Should find books by Линдгрен in Russian');
});

test('catalog fallback filtering - ageGroup correctly filters BOOKS array', () => {
  const little = BOOKS.filter((b) => matchesAgeGroup(b, 'little'));
  assert.ok(little.length > 0, 'Should have books for little (0-6)');
  assert.ok(little.some((b) => b.id.includes('груффало')), 'Gruffalo should be in little');

  const middle = BOOKS.filter((b) => matchesAgeGroup(b, 'middle'));
  assert.ok(middle.length > 0, 'Should have books for middle (7-10)');
  assert.ok(middle.some((b) => b.id.includes('братья-львиное-сердце')), 'Brothers Lionheart should be in middle');

  const big = BOOKS.filter((b) => matchesAgeGroup(b, 'big'));
  assert.ok(big.length > 0, 'Should have books for big (11-15)');

  const adult = BOOKS.filter((b) => matchesAgeGroup(b, 'adult'));
  assert.ok(adult.length > 0, 'Should have books for adult (16+)');
});
