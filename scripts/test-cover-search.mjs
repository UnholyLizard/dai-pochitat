import fs from 'node:fs';
import path from 'node:path';

// Load extracted catalog
const dataPath = path.resolve('scratch/extracted_catalog.json');
let books = [];
if (fs.existsSync(dataPath)) {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  books = data.books || [];
}

const missingCoverBooks = books.filter(b => b.needs_cover);
console.log(`Found ${missingCoverBooks.length} books needing covers.`);

// Clean Google Books thumbnail URL to get highest quality image
function cleanGoogleBooksImageUrl(url) {
  if (!url) return null;
  let clean = url.replace(/^http:\/\//i, 'https://');
  clean = clean.replace(/&edge=curl/gi, '');
  // Try requesting higher zoom level if zoom=1
  clean = clean.replace(/zoom=1/g, 'zoom=2');
  return clean;
}

// Query Google Books API
async function searchGoogleBooks(title, author = '', _publisher = '') {
  let q = `intitle:"${title.replace(/"/g, '')}"`;
  if (author) q += `+inauthor:"${author.replace(/"/g, '')}"`;
  
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=3&printType=books`;
  
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'DaiPochitatLibrary/1.0' } });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const json = await res.json();
    if (!json.items || json.items.length === 0) {
      // Fallback: broader query without quotes/intitle
      const broadQ = `${title} ${author}`.trim();
      const fallbackUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(broadQ)}&maxResults=3&printType=books`;
      const fallbackRes = await fetch(fallbackUrl, { headers: { 'User-Agent': 'DaiPochitatLibrary/1.0' } });
      const fallbackJson = await fallbackRes.json();
      if (!fallbackJson.items || fallbackJson.items.length === 0) return { items: [] };
      return formatGoogleItems(fallbackJson.items);
    }
    return formatGoogleItems(json.items);
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}

function formatGoogleItems(items) {
  return {
    items: items.map(item => {
      const v = item.volumeInfo || {};
      const isbns = (v.industryIdentifiers || []).map(id => id.identifier);
      const rawImg = v.imageLinks?.extraLarge || v.imageLinks?.large || v.imageLinks?.medium || v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || null;
      return {
        source: 'google_books',
        id: item.id,
        title: v.title,
        authors: v.authors || [],
        publisher: v.publisher || '',
        publishedDate: v.publishedDate || '',
        description: (v.description || '').slice(0, 150) + '...',
        isbn: isbns[0] || null,
        allIsbns: isbns,
        coverUrl: cleanGoogleBooksImageUrl(rawImg),
        pageCount: v.pageCount || null
      };
    })
  };
}

// Query Open Library API
async function searchOpenLibrary(title, author = '') {
  const params = new URLSearchParams({ title, limit: '3' });
  if (author) params.set('author', author);
  
  const url = `https://openlibrary.org/search.json?${params.toString()}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'DaiPochitatLibrary/1.0' } });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const json = await res.json();
    if (!json.docs || json.docs.length === 0) return { items: [] };
    
    return {
      items: json.docs.map(doc => {
        const coverId = doc.cover_i;
        const isbn = (doc.isbn || [])[0] || null;
        let coverUrl = null;
        if (coverId) {
          coverUrl = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
        } else if (isbn) {
          coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
        }
        return {
          source: 'open_library',
          id: doc.key,
          title: doc.title,
          authors: doc.author_name || [],
          publisher: (doc.publisher || [])[0] || '',
          publishedDate: doc.first_publish_year || '',
          isbn,
          coverUrl
        };
      })
    };
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}

// Test on a sample of books: some with missing covers, and some famous books
const sampleTest = [
  // Books currently missing covers from the catalog:
  ...missingCoverBooks.slice(0, 8).map(b => ({
    title: b.raw_title,
    author: b.raw_author,
    section: b.primary_section,
    publisher: b.publisher
  })),
  // Known control books:
  { title: 'Груффало', author: 'Джулия Дональдсон', section: 'control' },
  { title: 'Winnie-the-Pooh', author: 'A. A. Milne', section: 'control' },
  { title: 'Kako muzej živi?', author: 'Ondřej Chrobák', section: 'control_me' }
];

console.log(`\nTesting ${sampleTest.length} books against Google Books and Open Library...\n`);

for (let i = 0; i < sampleTest.length; i++) {
  const item = sampleTest[i];
  console.log(`------------------------------------------------------------`);
  console.log(`[${i + 1}/${sampleTest.length}] Query: "${item.title}" | Author: "${item.author}" (${item.section})`);
  
  const gResult = await searchGoogleBooks(item.title, item.author);
  const olResult = await searchOpenLibrary(item.title, item.author);
  
  if (gResult.items && gResult.items.length > 0) {
    const top = gResult.items[0];
    console.log(`  ✓ Google Books Match: "${top.title}" by ${top.authors.join(', ')} (${top.publishedDate})`);
    console.log(`    Publisher: ${top.publisher || 'N/A'} | ISBN: ${top.isbn || 'N/A'}`);
    console.log(`    Cover URL: ${top.coverUrl || 'No cover image'}`);
  } else {
    console.log(`  ✗ Google Books: No matches found`);
  }
  
  if (olResult.items && olResult.items.length > 0) {
    const top = olResult.items[0];
    console.log(`  ✓ Open Library Match: "${top.title}" by ${top.authors.join(', ')} (${top.publishedDate})`);
    console.log(`    ISBN: ${top.isbn || 'N/A'}`);
    console.log(`    Cover URL: ${top.coverUrl || 'No cover image'}`);
  } else {
    console.log(`  ✗ Open Library: No matches found`);
  }
  
  // Rate-limiting pause
  await new Promise(r => setTimeout(r, 400));
}
