// Suggestions for the magic chest and the librarian. The list below is only an offline fallback —
// ids are real catalogue ids; loadSuggestions() swaps in the live catalogue (see /api/suggestions).
// age: [min, max]; moods: funny | adventure | magic | spooky | friends | animals | real
const B = (id, ru, en, ruAuthor, enAuthor, age, moods, color, saysRu, saysEn, coverUrl = null) => ({
  id, title: { ru, en }, author: { ru: ruAuthor, en: enAuthor }, age, moods, color, says: { ru: saysRu, en: saysEn }, cover_url: coverUrl,
});

export const BOOKS = [
  B('братья-львиное-сердце-402', 'Братья Львиное Сердце', 'The Brothers Lionheart', 'Астрид Линдгрен', 'Astrid Lindgren', [9, 13], ['adventure', 'magic', 'friends'], '#7d5bbf',
    'Про храбрость. Возьми платок — на всякий случай.', 'About courage. Bring a hanky, just in case.', '/covers/DP-0402.webp'),
  B('рони-дочь-разбойника-401', 'Рони, дочь разбойника', 'Ronia, the Robber’s Daughter', 'Астрид Линдгрен', 'Astrid Lindgren', [9, 12], ['adventure', 'friends'], '#6f8f3a',
    'Девочка из леса, которая никого не боится.', 'A forest girl who fears no one.', '/covers/DP-0401.webp'),
  B('груффало-875', 'Груффало', 'The Gruffalo', 'Джулия Дональдсон', 'Julia Donaldson', [3, 6], ['funny', 'animals', 'spooky'], '#8a5a2b',
    'Мышонок хитрее всех. Запомни этот приём!', 'The mouse outsmarts them all. Remember that trick!', '/covers/DP-0875.webp'),
  B('маленький-принц-447', 'Маленький принц', 'The Little Prince', 'Антуан де Сент-Экзюпери', 'Antoine de Saint-Exupéry', [9, 99], ['friends', 'magic', 'real'], '#1f4dd8',
    'Короткая, но потом думаешь о ней всю жизнь.', 'Short, but you’ll think about it forever.', '/covers/DP-0447.webp'),
  B('гарри-поттер-и-философский-кам-159', 'Гарри Поттер и философский камень', 'Harry Potter and the Philosopher’s Stone', 'Джоан Роулинг', 'J. K. Rowling', [9, 14], ['magic', 'adventure', 'friends'], '#9b2c2c',
    'Мальчик живёт под лестницей, а потом — ух!', 'A boy lives under the stairs, and then — whoosh!', '/covers/DP-0159.webp'),
  B('лев-колдунья-и-платяной-шкаф-1186', 'Лев, колдунья и платяной шкаф', 'The Lion, the Witch and the Wardrobe', 'Клайв Льюис', 'C. S. Lewis', [8, 12], ['magic', 'adventure'], '#c9a227',
    'После неё ты будешь проверять каждый шкаф.', 'After this you’ll check every wardrobe.', '/covers/DP-1186.webp'),
  B('хоббит-365', 'Хоббит', 'The Hobbit', 'Джон Толкин', 'J. R. R. Tolkien', [10, 14], ['adventure', 'magic'], '#4b6b2f',
    'Туда и обратно. С драконом посередине.', 'There and back again. With a dragon in the middle.', '/covers/DP-0365.webp'),
  B('чарли-и-шоколадная-фабрика-148', 'Чарли и шоколадная фабрика', 'Charlie and the Chocolate Factory', 'Роальд Даль', 'Roald Dahl', [7, 11], ['funny', 'magic'], '#6b3e26',
    'Читай с конфетой. Иначе будет мучительно.', 'Read with a sweet in hand. Otherwise it’s torture.', '/covers/DP-0148.webp'),
  B('матильда-145', 'Матильда', 'Matilda', 'Роальд Даль', 'Roald Dahl', [8, 12], ['funny', 'real', 'magic'], '#d9667e',
    'Девочка, которая прочитала всю библиотеку. Уважаю.', 'A girl who read the whole library. Respect.', '/covers/DP-0145.webp'),
  B('ведьмы-151', 'Ведьмы', 'The Witches', 'Роальд Даль', 'Roald Dahl', [8, 12], ['spooky', 'magic', 'funny'], '#5b3f8c',
    'Страшно и смешно одновременно — редкое сочетание.', 'Scary and funny at once — a rare mix.', '/covers/DP-0151.webp'),
  B('волшебник-изумрудного-города-153', 'Волшебник Изумрудного города', 'The Wizard of the Emerald City', 'Александр Волков', 'Alexander Volkov', [6, 10], ['magic', 'adventure', 'friends'], '#2e8b57',
    'Друзья, дорога и немножко обмана. Классика!', 'Friends, a road and a little trickery. A classic!', '/covers/DP-0153.webp'),
  B('незнайка-в-солнечном-городе-379', 'Незнайка в Солнечном городе', 'Dunno in Sun City', 'Николай Носов', 'Nikolay Nosov', [7, 11], ['funny', 'adventure'], '#3d6fb6',
    'Коротышки летят на Луну. А что, так можно было?', 'Little folk fly to the Moon. Wait, that’s allowed?', '/covers/DP-0379.webp'),
  B('алиса-в-стране-чудес-344', 'Алиса в Стране чудес', 'Alice’s Adventures in Wonderland', 'Льюис Кэрролл', 'Lewis Carroll', [8, 99], ['magic', 'funny'], '#4aa3c7',
    'Всё вверх ногами. Мой любимый порядок!', 'Everything upside down. My favourite kind of order!', '/covers/DP-0344.webp'),
  B('чудесное-путешествие-нильса-с--974', 'Чудесное путешествие Нильса с дикими гусями', 'The Wonderful Adventures of Nils', 'Сельма Лагерлёф', 'Selma Lagerlöf', [8, 11], ['animals', 'adventure'], '#8a9a5b',
    'Целая Швеция с высоты гусиного полёта.', 'All of Sweden from a goose’s back.', '/covers/DP-0974.webp'),
  B('чудо-1000', 'Чудо', 'Wonder', 'Р. Дж. Паласио', 'R. J. Palacio', [10, 14], ['friends', 'real'], '#2b5fd9',
    'Про то, как важно быть добрым. Очень важно.', 'About being kind. Very, very important.', '/covers/DP-1000.webp'),
  B('1-хильда-и-тролль-815', 'Хильда и тролль', 'Hilda and the Troll', 'Люк Пирсон', 'Luke Pearson', [6, 10], ['adventure', 'magic', 'animals'], '#2a9d8f',
    'Синеволосая девочка и тролль. Комикс — тоже книга!', 'A blue-haired girl and a troll. Comics count!', '/covers/DP-0815.webp'),
  B('маленькая-баба-яга-маленькое-п-361', 'Маленькая Баба-Яга', 'The Little Witch', 'Отфрид Пройслер', 'Otfried Preußler', [6, 10], ['magic', 'funny'], '#6a4c93',
    'Ей всего сто двадцать семь. Совсем малышка!', 'She’s only a hundred and twenty-seven. Just a baby!', '/covers/DP-0361.webp'),
  B('вафельное-сердце-85', 'Вафельное сердце', 'Waffle Hearts', 'Мария Парр', 'Maria Parr', [8, 12], ['funny', 'friends'], '#d4793b',
    'Лучшая подруга и норвежская деревня. Вкусно!', 'A best friend and a Norwegian village. Delicious!', '/covers/DP-0085.webp'),
  B('остров-сокровищ-375', 'Остров сокровищ', 'Treasure Island', 'Роберт Льюис Стивенсон', 'Robert Louis Stevenson', [10, 14], ['adventure'], '#a0522d',
    'Пираты, карта и сундук — всё как мы любим.', 'Pirates, a map and a chest — just how we like it.', '/covers/DP-0375.webp'),
  B('мэри-поппинс-380', 'Мэри Поппинс', 'Mary Poppins', 'Памела Трэверс', 'P. L. Travers', [6, 10], ['magic', 'funny'], '#2f4858',
    'Няня с зонтиком и характером. Волшебно!', 'A nanny with an umbrella and attitude. Magic!', '/covers/DP-0380.webp'),
  B('книжный-вор-1175', 'Книжный вор', 'The Book Thief', 'Маркус Зусак', 'Markus Zusak', [14, 99], ['real', 'friends'], '#6d597a',
    'Про девочку, которая спасала книги. Наш человек.', 'About a girl who rescued books. One of us.', '/covers/DP-1175.webp'),
  B('клуб-друзей-2', 'Клуб друзей', 'The Friends Club', 'Софи Геррив', 'Sophie Guerrive', [3, 6], ['friends', 'animals', 'adventure'], '#e5aa2c',
    'Уютнейший первый комикс для малышей, доказывающий, что дружба побеждает любые страхи!', 'The coziest first comic for little ones, proving that friendship conquers any fear!', '/covers/DP-0002.webp'),
  B('очень-голодная-гусеница-9', 'Очень голодная гусеница', 'The Very Hungry Caterpillar', 'Эрик Карл', 'Eric Carle', [3, 6], ['animals', 'funny'], '#7da638',
    'Книжка с дырочками, которую обожают малыши во всём мире!', 'A book with holes that toddlers around the world adore!', '/covers/DP-0009.webp'),
  B('зимняя-книга-13', 'Зимняя книга', 'Winter', 'Ротраут Сюзанна Бернер', 'Rotraut Susanne Berner', [3, 7], ['real', 'adventure'], '#4a89dc',
    'В Городке наступила зима! Ищи птичек, санки и тайные истории на каждом развороте.', 'Winter has arrived in Town! Spot birds, sledges, and secret stories on every spread.', '/covers/DP-0013.webp'),
  B('гном-и-лис-1280', 'Гном и лис', 'The Tomten and the Fox', 'Астрид Линдгрен', 'Astrid Lindgren', [4, 8], ['magic', 'friends', 'animals'], '#8a422d',
    'Добрый рождественский гном делится кашей с голодным лисом.', 'A kind Christmas gnome shares porridge with a hungry fox.', '/covers/DP-1280.webp'),
  B('зима-муми-тролля-413', 'Зима Муми-тролля', 'Moominland Midwinter', 'Туве Янссон', 'Tove Jansson', [7, 12], ['magic', 'adventure'], '#2e5b88',
    'Муми-тролль проснулся среди зимы, когда весь дом ещё спал...', 'Moomintroll wakes up in the middle of winter when the rest of the house is fast asleep...', '/covers/DP-0413.webp'),
];

export const AGE_GROUPS = { little: [3, 6], middle: [7, 10], big: [11, 13], teen: [14, 18] };

export const bookById = (id) => BOOKS.find((b) => b.id === id) ?? extra.get(id);

// Books outside the suggestion pool (e.g. hearts from the full catalogue), fetched on demand.
const extra = new Map();

/** Turn an API row (flat *_ru columns) into the shape the chest and the librarian use. */
export function fromRow(r) {
  let moods = [];
  try { moods = JSON.parse(r.moods_json || '[]'); } catch { /* keep [] */ }
  // Not every row has every language: fall back so no title or pitch is ever blank (ru → en → me, and en → ru → me).
  const ru = (f) => r[`${f}_ru`] || r[`${f}_en`] || r[`${f}_me`] || '';
  const en = (f) => r[`${f}_en`] || r[`${f}_ru`] || r[`${f}_me`] || '';
  return B(r.id, ru('title'), en('title'), ru('author'), en('author'), [r.age_min ?? 0, r.age_max ?? 99], moods,
    r.dominant_color || '#2f8a84', ru('says'), en('says'), r.cover_url || null);
}

/** Replace the offline list with live catalogue picks. Quietly keeps the fallback when offline. */
export async function loadSuggestions() {
  try {
    const res = await fetch('/api/suggestions');
    if (!res.ok) return false;
    const { books } = await res.json();
    if (!books?.length) return false;
    BOOKS.splice(0, BOOKS.length, ...books.map(fromRow));
    return true;
  } catch { return false; }
}

/** Resolve any catalogue id (suggestion pool first, then the API). */
export async function resolveBook(id) {
  const known = bookById(id);
  if (known) return known;
  try {
    const res = await fetch(`/api/books/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const b = fromRow((await res.json()).book);
    extra.set(id, b);
    return b;
  } catch { return null; }
}

/** Books matching an age group and mood, best matches (mood listed first) first. */
export function findBooks({ age, mood }) {
  const [lo, hi] = AGE_GROUPS[age] ?? [0, 99];
  return BOOKS.filter((b) => b.age[0] <= hi && b.age[1] >= lo && (!mood || b.moods.includes(mood)))
    .sort((a, b) => a.moods.indexOf(mood) - b.moods.indexOf(mood));
}

/** "Book of the week": stable for a week, changes every Monday. */
export function bookOfTheWeek(date = new Date()) {
  const week = Math.floor((date.getTime() / 86400000 + 3) / 7);
  return BOOKS[week % BOOKS.length];
}
