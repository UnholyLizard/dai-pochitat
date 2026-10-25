import fs from 'node:fs';
import path from 'node:path';

const catalogDir = path.resolve('Дай почитать каталог книг');

function stripHtml(str) {
  if (!str) return '';
  return str.replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(s) {
  if (!s) return '';
  return s.toLowerCase()
    .replace(/["'«»„“]/g, '')
    .replace(/[^a-zа-я0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeSlug(title, author, index) {
  const base = (title || 'book')
    .toLowerCase()
    .replace(/[^a-zа-я0-9]/gi, '-')
    .replace(/-+/g, '-')
    .slice(0, 30);
  return `${base}-${index}`;
}

function parseTableRows(filePath) {
  const html = fs.readFileSync(filePath, 'utf-8');
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];
  
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows = [];
  let trMatch;
  while ((trMatch = trRegex.exec(tbodyMatch[1])) !== null) {
    const rowHtml = trMatch[1];
    const cells = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      const cellHtml = tdMatch[1];
      const imgMatch = cellHtml.match(/<img[^>]+src="([^">]+)"/i);
      const imgSrc = imgMatch ? imgMatch[1] : null;
      const text = stripHtml(cellHtml);
      cells.push({ text, imgSrc });
    }
    while (cells.length > 0 && !cells[cells.length - 1].text && !cells[cells.length - 1].imgSrc) {
      cells.pop();
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

// Section definitions
const SECTIONS = [
  { file: '0+.html', section: '0+', ageMin: 0, ageMax: 6, ageGroup: 'little' },
  { file: '7-9.html', section: '7-9', ageMin: 7, ageMax: 10, ageGroup: 'middle' },
  { file: 'подросткам.html', section: 'teens', ageMin: 11, ageMax: 15, ageGroup: 'big' },
  { file: 'взрослые.html', section: 'adults', ageMin: 16, ageMax: 99, ageGroup: 'adult' },
  { file: 'классика.html', section: 'classics', ageMin: 6, ageMax: 14, ageGroup: 'middle' },
  { file: 'комиксы и манга.html', section: 'comics', ageMin: 8, ageMax: 16, ageGroup: 'middle' },
  { file: 'стихи.html', section: 'poetry', ageMin: 3, ageMax: 12, ageGroup: 'little' },
  { file: 'чг-сербские.html', section: 'me_sr', ageMin: 4, ageMax: 14, ageGroup: 'middle', defaultLang: 'me' },
  { file: 'Англ.html', section: 'en', ageMin: 4, ageMax: 14, ageGroup: 'middle', defaultLang: 'en' },
  { file: 'много всего.html', section: 'nonfiction', ageMin: 6, ageMax: 16, ageGroup: 'middle' },
];

const THEMATIC_COLLECTIONS = [
  {
    file: '14 фев.html',
    id: 'love_and_warmth',
    slug: 'love-and-family',
    title_ru: 'Про любовь и семью',
    title_en: 'Love & Family',
    title_me: 'O ljubavi i porodici',
    description_ru: 'Книги о нежности, дружбе, семье и тёплых чувствах',
    description_en: 'Books about affection, friendship, family, and warm feelings',
    description_me: 'Knjige o nježnosti, prijateljstvu, porodici i toplim osjećanjima'
  },
  {
    file: 'НГ.html',
    id: 'winter_and_new_year',
    slug: 'winter-tales',
    title_ru: 'Зимние и новогодние истории',
    title_en: 'Winter & Holiday Tales',
    title_me: 'Zimske i novogodišnje priče',
    description_ru: 'Снежные приключения, ёлка, уют и новогодние чудеса',
    description_en: 'Snowy adventures, Christmas trees, warmth, and holiday miracles',
    description_me: 'Snježne avanture, jelka, udobnost i praznična čuda'
  },
  {
    file: 'Права чел.html',
    id: 'important_topics',
    slug: 'important-topics',
    title_ru: 'На важные темы',
    title_en: 'Important Topics & Human Rights',
    title_me: 'O važnim temama i pravima',
    description_ru: 'Истории о смелости, свободе, правах человека и преодолении трудностей',
    description_en: 'Stories about courage, freedom, human rights, and overcoming adversity',
    description_me: 'Priče o hrabrosti, slobodi, ljudskim pravima i prevazilaženju teškoća'
  }
];

export function buildCatalogDataset() {
  const books = [];
  const bookByNormKey = new Map(); // normTitle + '::' + normAuthor -> book
  const collectionLinks = []; // { collectionId, bookId, position }
  
  let counter = 1;
  
  // 1. Ingest Base Sections first
  for (const def of SECTIONS) {
    const rows = parseTableRows(path.join(catalogDir, def.file));
    let subheader = '';
    
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (r === 0 && row.some(c => /название|обложка|автор/i.test(c.text))) continue;
      const texts = row.map(c => c.text).filter(Boolean);
      const hasImg = row.some(c => c.imgSrc);
      const combined = texts.join(' ');
      if (/библиотека-прокат|условия использования|maps\.app\.goo/i.test(combined)) continue;
      if (texts.length === 1 && !hasImg && texts[0].length < 80) {
        subheader = texts[0];
        continue;
      }
      
      const coverCell = row[0];
      const coverImg = coverCell?.imgSrc ? path.basename(coverCell.imgSrc) : null;
      const title = row[1]?.text || '';
      const author = row[2]?.text || '';
      let illustrator = '';
      let annotation;
      let publisher;
      let notes;
      
      if (def.file === '0+.html') {
        annotation = row[3]?.text || '';
        publisher = row[4]?.text || '';
        notes = row.slice(5).map(c => c.text).filter(Boolean).join(' | ');
      } else if (['чг-сербские.html', 'подросткам.html', 'классика.html', 'стихи.html', 'много всего.html'].includes(def.file)) {
        illustrator = row[3]?.text || '';
        annotation = row[4]?.text || '';
        publisher = row[5]?.text || '';
        notes = row.slice(6).map(c => c.text).filter(Boolean).join(' | ');
      } else {
        const c3 = row[3]?.text || '';
        const c4 = row[4]?.text || '';
        if (c3.length > 60 || (!c4 && c3.length > 20)) {
          annotation = c3;
          publisher = c4;
          notes = row.slice(5).map(c => c.text).filter(Boolean).join(' | ');
        } else {
          illustrator = c3;
          annotation = c4;
          publisher = row[5]?.text || '';
          notes = row.slice(6).map(c => c.text).filter(Boolean).join(' | ');
        }
      }
      
      if (!title && !author && !coverImg) continue;
      
      const normKey = `${normalizeTitle(title)}::${normalizeTitle(author)}`;
      
      // If already added, skip or note duplicate
      if (normKey.length > 2 && bookByNormKey.has(normKey)) {
        continue;
      }
      
      const code = `DP-${String(counter).padStart(4, '0')}`;
      const id = makeSlug(title, author, counter);
      counter++;
      
        const webpName = `${code}.webp`;
        const hasWebp = fs.existsSync(path.join(process.cwd(), 'public/covers', webpName));
        const finalCoverUrl = hasWebp ? `/covers/${webpName}` : (coverImg ? `/covers/${coverImg}` : null);

        const bookRecord = {
          id,
          code,
          title_ru: def.defaultLang === 'en' ? '' : def.defaultLang === 'me' ? '' : title,
          title_en: def.defaultLang === 'en' ? title : '',
          title_me: def.defaultLang === 'me' ? title : '',
          raw_title: title,
          author_ru: def.defaultLang === 'en' ? '' : def.defaultLang === 'me' ? '' : author,
          author_en: def.defaultLang === 'en' ? author : '',
          author_me: def.defaultLang === 'me' ? author : '',
          raw_author: author,
          illustrator,
          publisher,
          year: null,
          isbn: null,
          age_min: def.ageMin,
          age_max: def.ageMax,
          age_group: def.ageGroup,
          annotation_ru: def.defaultLang === 'me' || def.defaultLang === 'en' ? '' : annotation,
          annotation_en: def.defaultLang === 'en' ? annotation : '',
          annotation_me: def.defaultLang === 'me' ? annotation : '',
          raw_annotation: annotation,
          says_ru: '',
          says_en: '',
          says_me: '',
          cover_url: finalCoverUrl,
          dominant_color: '#2f8a84',
          primary_section: def.section,
          language: def.defaultLang || 'ru',
          status: 'available',
          condition_notes: notes || (subheader ? `Категория: ${subheader}` : ''),
          moods_json: '[]',
          tags_json: JSON.stringify(subheader ? [subheader] : []),
          needs_author: !author,
          needs_cover: !finalCoverUrl,
          needs_annotation: !annotation
        };
      
      books.push(bookRecord);
      if (normKey.length > 2) {
        bookByNormKey.set(normKey, bookRecord);
      }
    }
  }
  
  // 2. Ingest Thematic Collections
  for (const col of THEMATIC_COLLECTIONS) {
    const rows = parseTableRows(path.join(catalogDir, col.file));
    let pos = 0;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (r === 0 && row.some(c => /название|обложка|автор/i.test(c.text))) continue;
      const title = row[1]?.text || '';
      const author = row[2]?.text || '';
      if (!title) continue;
      
      const normKey = `${normalizeTitle(title)}::${normalizeTitle(author)}`;
      let matched = bookByNormKey.get(normKey);
      
      // If not matched, try matching title alone
      if (!matched) {
        const normT = normalizeTitle(title);
        for (const [k, b] of bookByNormKey.entries()) {
          if (k.startsWith(normT + '::')) {
            matched = b;
            break;
          }
        }
      }
      
      if (matched) {
        pos++;
        collectionLinks.push({
          collection_id: col.id,
          book_id: matched.id,
          position: pos
        });
      } else {
        // Book only existed in thematic sheet, add it to books collection!
        const coverCell = row[0];
        const coverImg = coverCell?.imgSrc ? path.basename(coverCell.imgSrc) : null;
        const code = `DP-${String(counter).padStart(4, '0')}`;
        const id = makeSlug(title, author, counter);
        counter++;
        
        const bookRecord = {
          id,
          code,
          title_ru: title,
          title_en: '',
          title_me: '',
          raw_title: title,
          author_ru: author,
          author_en: '',
          author_me: '',
          raw_author: author,
          illustrator: row[3]?.text || '',
          publisher: row[5]?.text || row[4]?.text || '',
          year: null,
          isbn: null,
          age_min: 4,
          age_max: 12,
          age_group: 'middle',
          annotation_ru: row[4]?.text || '',
          annotation_en: '',
          annotation_me: '',
          raw_annotation: row[4]?.text || '',
          says_ru: '',
          says_en: '',
          says_me: '',
          cover_url: coverImg ? `/covers/${coverImg}` : null,
          dominant_color: '#d4793b',
          primary_section: col.id,
          language: 'ru',
          status: 'available',
          condition_notes: '',
          moods_json: '[]',
          tags_json: JSON.stringify([col.slug]),
          needs_author: !author,
          needs_cover: !coverImg,
          needs_annotation: !row[4]?.text
        };
        books.push(bookRecord);
        bookByNormKey.set(normKey, bookRecord);
        
        pos++;
        collectionLinks.push({
          collection_id: col.id,
          book_id: bookRecord.id,
          position: pos
        });
      }
    }
  }
  
  return {
    books,
    collections: THEMATIC_COLLECTIONS,
    collectionLinks,
    stats: {
      totalCanonicalBooks: books.length,
      collectionLinksCount: collectionLinks.length,
      needsCover: books.filter(b => b.needs_cover).length,
      needsAuthor: books.filter(b => b.needs_author).length,
      needsAnnotation: books.filter(b => b.needs_annotation).length,
    }
  };
}

if (process.argv[1]?.endsWith('import-catalog.mjs')) {
  const result = buildCatalogDataset();
  console.log('--- CATALOG EXTRACTION RESULTS ---');
  console.log('Total Canonical Books:', result.stats.totalCanonicalBooks);
  console.log('Collection Links:', result.stats.collectionLinksCount);
  console.log('Books needing cover:', result.stats.needsCover);
  console.log('Books needing author:', result.stats.needsAuthor);
  console.log('Books needing annotation:', result.stats.needsAnnotation);
  
  fs.writeFileSync('C:\\Users\\unhol\\.gemini\\antigravity-ide\\brain\\fc74ea69-3600-45ca-820e-a1656c110a53\\scratch\\extracted_catalog.json', JSON.stringify(result, null, 2), 'utf-8');
  console.log('Saved extracted dataset to scratch/extracted_catalog.json');
}
