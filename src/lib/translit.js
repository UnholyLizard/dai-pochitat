// Transliteration from Serbian Cyrillic to standard Latin alphabet (latinica).
const CYR_TO_LAT = {
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Ђ': 'Đ', 'Е': 'E', 'Ж': 'Ž', 'З': 'Z', 'И': 'I',
  'Ј': 'J', 'К': 'K', 'Л': 'L', 'Љ': 'Lj', 'М': 'M', 'Н': 'N', 'Њ': 'Nj', 'О': 'O', 'П': 'P', 'Р': 'R',
  'С': 'S', 'Т': 'T', 'Ћ': 'Ć', 'У': 'U', 'Ф': 'F', 'Х': 'H', 'Ц': 'C', 'Ч': 'Č', 'Џ': 'Dž', 'Ш': 'Š',
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ђ': 'đ', 'е': 'e', 'ж': 'ž', 'з': 'z', 'и': 'i',
  'ј': 'j', 'к': 'k', 'л': 'l', 'љ': 'lj', 'м': 'm', 'н': 'n', 'њ': 'nj', 'о': 'o', 'п': 'p', 'р': 'r',
  'с': 's', 'т': 't', 'ћ': 'ć', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'č', 'џ': 'dž', 'ш': 'š',
  // Cyrillic letters that may appear in titles
  'Щ': 'Št', 'щ': 'št', 'Ъ': '', 'ъ': '', 'Ы': 'I', 'ы': 'i', 'Ь': '', 'ь': '', 'Э': 'E', 'э': 'e',
  'Ю': 'Ju', 'ю': 'ju', 'Я': 'Ja', 'я': 'ja', 'Ё': 'Jo', 'ё': 'jo',
};

export function transliterateSerbian(str) {
  if (!str || typeof str !== 'string') return '';
  const isUpper = (ch) => ch && ch !== ch.toLowerCase() && ch === ch.toUpperCase();
  let res = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    let lat = CYR_TO_LAT[ch];
    if (lat !== undefined) {
      if ((ch === 'Љ' || ch === 'Њ' || ch === 'Џ') && (isUpper(str[i + 1]) || (i > 0 && isUpper(str[i - 1])))) {
        lat = lat.toUpperCase();
      }
      res += lat;
    } else {
      res += ch;
    }
  }
  return res;
}

/** Resolves the book's title in its original language, transliterating Serbian/Montenegrin Cyrillic to Latinica. */
export function getBookTitle(b) {
  if (!b) return '';
  const lang = b.language || (b.primary_section === 'me_sr' ? 'me' : (b.primary_section === 'en' ? 'en' : (b.title_ru ? 'ru' : '')));
  if (lang === 'me' || lang === 'sr') {
    const raw = b.title_me || (typeof b.title === 'object' ? b.title?.me || b.title?.ru : b.title_ru || b.title);
    return transliterateSerbian(raw || '');
  }
  if (lang === 'en') {
    return b.title_en || (typeof b.title === 'object' ? b.title?.en : b.title) || b.title_ru || '';
  }
  if (lang === 'ru') {
    return b.title_ru || (typeof b.title === 'object' ? b.title?.ru : b.title) || b.title_en || '';
  }
  const val = typeof b.title === 'object' ? (b.title?.ru || b.title?.en || b.title?.me || '') : (b.title_ru || b.title || b.title_en || b.title_me || '');
  return val;
}

/** Resolves the book's author in its original language, transliterating Serbian/Montenegrin Cyrillic to Latinica. */
export function getBookAuthor(b) {
  if (!b) return '';
  const lang = b.language || (b.primary_section === 'me_sr' ? 'me' : (b.primary_section === 'en' ? 'en' : (b.author_ru ? 'ru' : '')));
  if (lang === 'me' || lang === 'sr') {
    const raw = b.author_me || (typeof b.author === 'object' ? b.author?.me || b.author?.ru : b.author_ru || b.author);
    return transliterateSerbian(raw || '');
  }
  if (lang === 'en') {
    return b.author_en || (typeof b.author === 'object' ? b.author?.en : b.author) || b.author_ru || '';
  }
  if (lang === 'ru') {
    return b.author_ru || (typeof b.author === 'object' ? b.author?.ru : b.author) || b.author_en || '';
  }
  return typeof b.author === 'object' ? (b.author?.ru || b.author?.en || b.author?.me || '') : (b.author_ru || b.author || b.author_en || b.author_me || '');
}

