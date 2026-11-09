// The librarian's offline brain: intent matching + a little memory. Same reply contract as the
// future AI brain (see librarian.js), so the chat UI never knows which one is talking.
// Facts are shared; personality lines come from the candidate the reader chose in the casting.
import { BOOKS, AGE_GROUPS, findBooks, bookById, bookOfTheWeek } from '../content/books.js';
import { librarianById } from '../content/librarians.js';
import { EVENTS } from '../content/events.js';
import { LIBRARY } from '../content/library.js';
import { CRITTERS } from '../content/game.js';

const R = (ru, en) => ({ ru, en });
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Lines any librarian may fall back on (grammatically neutral in Russian).
const NEUTRAL = {
  horse: R('Пятнистая лошадь живёт в главе про сундук. Нажми на неё — увидишь фокус!', 'The spotted horse lives in the chest chapter. Tap it for a trick!'),
  found: R('Тадам! Вот книга для тебя:', 'Ta-da! Here’s a book for you:'),
};
const line = (voice, key) => {
  const v = voice[key] ?? NEUTRAL[key];
  return Array.isArray(v) ? pick(v) : v;
};
const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s+-]/gu, ' ').replace(/\s+/g, ' ').trim();

// Stems match at word starts («смеш» → «смешное»); '=word' must match a whole word;
// stems with a space match as a phrase.
const has = (text, stems) => {
  const words = text.split(' ');
  return stems.some((s) =>
    s.startsWith('=') ? words.includes(s.slice(1)) : s.includes(' ') ? text.includes(s) : words.some((w) => w.startsWith(s)));
};

const MOODS = {
  funny: ['смеш', 'весел', 'юмор', 'ржак', 'funny', 'laugh', 'fun', 'hilarious', 'joke'],
  adventure: ['приключ', 'пират', 'путешеств', 'adventur', 'pirate', 'exciting', 'quest'],
  magic: ['волшеб', 'маги', 'сказк', 'фэнтез', 'колдун', 'magic', 'fairy', 'wizard', 'fantasy'],
  spooky: ['страш', 'ужас', 'жутк', 'призрак', 'ведьм', 'spook', 'scary', 'horror', 'ghost', 'creepy'],
  friends: ['друж', '=друг', 'друзь', 'подруг', 'friend'],
  animals: ['живот', 'звер', '=кот', 'котик', 'котен', 'кошк', 'собак', 'animal', '=cat', '=cats', '=dog', '=dogs', '=pet', '=pets'],
  real: ['жизн', 'настоящ', 'реальн', 'школ', '=real', 'realistic', 'life', 'school', 'true'],
};

const STOP_STEMS = [
  // Greetings & conversational
  'привет', 'здравств', 'здрасьте', 'добр', 'вечер', 'утр', 'день', 'хай', 'дел',
  'hello', 'hi', 'hey', 'good', 'morning', 'afternoon', 'evening',
  // Reading & books
  'книг', 'книж', 'чит', 'read', 'book',
  // Critters & hints
  'звер', 'жител',
  // Mood stems (so mood requests like "смешная книга" or "сказка" steer by mood rather than title collisions)
  ...Object.values(MOODS).flat().map((s) => (s.startsWith('=') ? s.slice(1) : s)),
  // Intent & question words
  'что', 'где', 'когд', 'как', 'кто', 'куд', 'откуд', 'почем', 'зачем', 'скольк',
  'открыт', 'час', 'врем', 'работ',
  'подсказ', 'загад', 'игр', 'поигра',
  'посовет', 'порекоменд', 'праздн', 'установ', 'телефон',
  'билет', 'паспорт', 'подар', 'спасиб', 'пока', 'робот',
  'what', 'where', 'when', 'who', 'how', 'why', 'which',
  'open', 'hour', 'time', 'schedul',
  'hint', 'riddle', 'game', 'puzzle',
  'recommend', 'suggest', 'event', 'install', 'card', 'passport',
  'free', 'price', 'cost', 'donat', 'gift', 'thank', 'bye',
];

const STOP_WORDS = new Set([
  'это', 'этот', 'эта', 'эти', 'тот', 'та', 'те', 'для', 'про', 'без', 'под', 'над',
  'или', 'если', 'меня', 'тебя', 'себя', 'свой', 'своя', 'свое', 'свои', 'наш', 'наша',
  'хочу', 'хочется', 'еще', 'спасти',
  'this', 'that', 'these', 'those', 'with', 'from', 'into', 'about', 'your', 'my', 'the',
  'are', 'you', 'want', 'more', 'another', 'should',
  'have', 'has', 'had', 'tell', 'answer', 'find', 'someth',
]);

const isStopWord = (w) => STOP_WORDS.has(w) || STOP_STEMS.some((s) => (s.includes(' ') ? w === s : w.startsWith(s)));

const INTENTS = [
  ['dontknow', ['не знаю', 'сдаюсь', 'скажи ответ', 'какой ответ', 'dont know', 'don t know', 'give up', 'tell me the answer']],
  ['riddle', ['загад', 'игр', 'поигра', 'riddle', 'puzzle', 'quiz', 'game']],
  ['hint', ['подсказ', 'зверь', 'зверят', 'жител', 'спрятал', 'прячет', 'hint', 'critter', 'hidden', 'hiding', 'find animals', 'where are the']],
  ['install', ['установ', 'приложени', 'на телефон', 'на экран', 'без интернета', 'офлайн', 'install', '=app', 'home screen', 'offline']],
  ['starter_chips', ['еще вопрос', 'другие вопрос', 'все вопрос', 'главные вопрос', 'more question', 'all question', 'starter question', 'start question']],
  ['more', ['еще', 'другую', 'другое', 'следующ', 'another', 'more', 'next', 'else']],
  ['events', ['праздн', 'событ', 'мероприят', 'афиш', 'клуб', 'встреч', 'event', 'party', 'club', 'happening']],
  ['recommend', ['что почитать', 'посовет', 'порекоменд', 'книг', 'книж', 'почитать', 'recommend', 'suggest', 'book', 'what to read', 'what should i read']],
  ['hours', ['когда', '=час', 'часы', 'время', 'открыт', 'работает', 'расписан', 'hour', 'open', 'when', 'time', 'schedule']],
  ['where', ['где', 'адрес', 'найти', 'дорог', 'добрат', 'карт', 'where', 'address', 'find you', 'map', 'location', 'directions']],
  ['join', ['записат', 'билет', 'запис', 'стать читат', 'join', 'sign up', 'member', 'card', 'register']],
  ['price', ['сколько стоит', 'цена', 'плат', 'бесплат', 'деньг', 'price', 'cost', 'free', 'pay', 'money']],
  ['donate', ['подар', 'пожертв', 'отдать', 'принест', 'donat', 'give books', 'gift']],
  ['greet', ['привет', 'здравств', 'здрасьте', '=хай', 'добрый', 'доброе', 'добрый вечер', 'good evening', 'hello', '=hi', '=hey', 'good morning', 'good afternoon']],
  ['night', ['вечер', 'ночь', 'темн', 'лампа', 'свет', 'night', 'dark', 'lamp', 'evening', 'light']],
  ['upside', ['вверх ногами', 'вверх тормашками', 'перевер', 'upside down', 'flip']],
  ['horse', ['лошад', 'конь', 'horse', 'pony']],
  ['coins', ['монет', 'звани', 'очк', 'coin', 'rank', 'points', 'score', 'passport', 'паспорт']],
  ['casting', ['кастинг', 'голосова', 'выбрать библиотекар', 'другого библиотекар', 'другой библиотекар', 'casting', '=vote', 'voting', 'new librarian', 'another librarian']],
  ['ai', ['робот', 'нейросет', 'искусствен', '=бот', 'robot', '=ai', '=bot', 'artificial', 'chatgpt']],
  ['who', ['кто ты', 'ты кто', 'как тебя', 'про себя', 'who are you', 'your name', 'about you']],
  ['english', ['по-английски', 'по английски', 'english', 'in english']],
  ['russian', ['по-русски', 'по русски', 'russian', 'in russian']],
  ['thanks', ['спасиб', 'благодар', 'thank', 'thx', 'cheers']],
  ['bye', ['=пока', 'пока-пока', 'до свидан', '=bye', 'goodbye', 'see you']],
];

const RIDDLES = [
  {
    id: 'karlsson', book: null,
    title: R('Малыш и Карлсон, который живёт на крыше', 'Karlsson-on-the-Roof'),
    a: ['карлсон', 'karlsson', 'karlson', 'carlson'],
    q: R('Кто живёт на крыше, обожает варенье и летает с пропеллером на спине?', 'Who lives on a roof, adores jam and flies with a propeller on his back?'),
    hint: R('Он — мужчина в самом расцвете сил.', 'He’s a man in his prime.'),
  },
  {
    id: 'prince', book: 'маленький-принц-447',
    title: R('Маленький принц', 'The Little Prince'),
    a: ['принц', 'prince'],
    q: R('Какой мальчик прилетел с крошечной планеты и очень любил свою розу?', 'Which boy came from a tiny planet and loved his rose very much?'),
    hint: R('Он маленький, но очень важный. Почти король.', 'He is little but very important. Almost a king.'),
  },
  {
    id: 'pooh', book: null,
    title: R('Винни-Пух и все-все-все', 'Winnie-the-Pooh'),
    a: ['пух', 'винни', 'pooh', 'winnie'],
    q: R('Какой медведь сочиняет пыхтелки и обожает мёд?', 'Which bear makes up hums and adores honey?'),
    hint: R('«В голове моей опилки, да-да-да!»', '“A bear of very little brain.”'),
  },
  {
    id: 'oz', book: 'волшебник-изумрудного-города-153',
    title: R('Волшебник Изумрудного города', 'The Wizard of the Emerald City'),
    a: ['изумруд', 'emerald', 'oz'],
    q: R('В каком городе все жители носят зелёные очки?', 'In which city does everyone wear green spectacles?'),
    hint: R('Город назван в честь зелёного драгоценного камня.', 'It’s named after a green gem.'),
  },
  {
    id: 'narnia', book: 'лев-колдунья-и-платяной-шкаф-1186',
    title: R('Лев, колдунья и платяной шкаф', 'The Lion, the Witch and the Wardrobe'),
    a: ['шкаф', 'гардероб', 'wardrobe'],
    q: R('Через что Люси попала в Нарнию?', 'What did Lucy walk through to reach Narnia?'),
    hint: R('Там обычно висят шубы.', 'Fur coats usually hang in it.'),
  },
  {
    id: 'harry', book: 'гарри-поттер-и-философский-кам-159',
    title: R('Гарри Поттер и философский камень', 'Harry Potter and the Philosopher’s Stone'),
    a: ['гарри', 'поттер', 'harry', 'potter'],
    q: R('Как зовут мальчика со шрамом в виде молнии?', 'What’s the name of the boy with a lightning-bolt scar?'),
    hint: R('Он жил в чулане под лестницей.', 'He lived in a cupboard under the stairs.'),
  },
  {
    id: 'alice', book: 'алиса-в-стране-чудес-344',
    title: R('Алиса в Стране чудес', 'Alice’s Adventures in Wonderland'),
    a: ['алис', 'alice'],
    q: R('Кто прыгнул в кроличью нору вслед за Белым Кроликом?', 'Who followed the White Rabbit down the rabbit hole?'),
    hint: R('Её имя начинается на «А».', 'Her name starts with an A.'),
  },
  {
    id: 'treasure', book: 'остров-сокровищ-375',
    title: R('Остров сокровищ', 'Treasure Island'),
    a: ['сокровищ', 'treasure'],
    q: R('В какой книге юнга Джим находит карту с крестиком и попадает к пиратам?', 'In which book does cabin boy Jim find a map with an X and end up among pirates?'),
    hint: R('Там есть остров, попугай и одноногий кок.', 'It has an island, a parrot and a one-legged cook.'),
  },
  {
    id: 'hobbit', book: 'хоббит-365',
    title: R('Хоббит, или Туда и обратно', 'The Hobbit'),
    a: ['хоббит', 'hobbit', 'бильбо', 'bilbo'],
    q: R('Кто нашёл золотое кольцо в тёмной пещере и отправился в поход к Одинокой горе?', 'Who found a golden ring in a dark cave and set off on a quest to the Lonely Mountain?'),
    hint: R('Он полурослик, который любит уют и второй завтрак.', 'He’s a halfling who loves comfort and second breakfast.'),
  },
  {
    id: 'gruffalo', book: 'груффало-875',
    title: R('Груффало', 'The Gruffalo'),
    a: ['груффало', 'gruffalo'],
    q: R('У кого страшные клыки и когти, бородавка на носу, но он до смерти испугался маленького мышонка?', 'Who has terrible tusks and terrible claws, but got terrified of a little brown mouse?'),
    hint: R('Его придумала Джулия Дональдсон.', 'Julia Donaldson created him.'),
  },
];

const getTitlePair = (book, fallback = null) => {
  if (book?.title && typeof book.title === 'object') {
    return {
      ru: book.title.ru || book.title.en || '',
      en: book.title.en || book.title.ru || '',
    };
  }
  if (typeof book?.title === 'string' && book.title) {
    return { ru: book.title, en: book.title };
  }
  if (fallback?.title && typeof fallback.title === 'object') {
    return {
      ru: fallback.title.ru || fallback.title.en || '',
      en: fallback.title.en || fallback.title.ru || '',
    };
  }
  if (typeof fallback?.title === 'string' && fallback.title) {
    return { ru: fallback.title, en: fallback.title };
  }
  return { ru: '', en: '' };
};

const getSaysPair = (book) => {
  if (book?.says && typeof book.says === 'object') {
    return {
      ru: book.says.ru || book.says.en || '',
      en: book.says.en || book.says.ru || '',
    };
  }
  if (typeof book?.says === 'string' && book.says) {
    return { ru: book.says, en: book.says };
  }
  return { ru: '', en: '' };
};

const ageFromText = (text) => {
  const m = text.match(/(\d{1,2})/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 2 && n <= 19) return Object.entries(AGE_GROUPS).find(([, [lo, hi]]) => n >= lo && n <= hi)?.[0] ?? (n > 13 ? 'teen' : 'little');
  }
  if (has(text, ['малыш', 'маленьк', 'little', 'toddler', 'preschool'])) return 'little';
  if (has(text, ['подрост', 'teen', 'тинейдж'])) return 'teen';
  return null;
};

const moodFromText = (text) => Object.entries(MOODS).find(([, stems]) => has(text, stems))?.[0] ?? null;

function editDistance1(a, b) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    let diff = 0;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i]) {
        diff++;
        if (diff > 1) return false;
      }
    }
    return diff <= 1;
  }
  const short = la < lb ? a : b;
  const long = la < lb ? b : a;
  let i = 0, j = 0, diff = 0;
  while (i < short.length && j < long.length) {
    if (short[i] !== long[j]) {
      diff++;
      if (diff > 1) return false;
      j++;
    } else {
      i++;
      j++;
    }
  }
  return true;
}

const matchWord = (qw, tw) => {
  if (qw === tw) return true;
  if (tw.length >= 4 && qw.length >= 4) {
    const stemLen = Math.max(4, Math.min(tw.length - 2, 6));
    const tStem = tw.slice(0, stemLen);
    if (qw.startsWith(tStem)) return true;
    // 1-character typo tolerance for longer content words (>= 5 characters)
    if (tw.length >= 5 && qw.length >= 5) {
      if (editDistance1(qw, tw)) return true;
      const qStem = qw.slice(0, stemLen);
      if (editDistance1(qStem, tStem)) return true;
      if (Math.abs(qw.length - tw.length) <= 2) {
        const minLen = Math.min(qw.length, tw.length);
        if (editDistance1(qw.slice(0, minLen), tw.slice(0, minLen))) return true;
      }
    }
  }
  return false;
};

function bookFromText(text) {
  const qWords = norm(text).split(' ').filter(Boolean);
  if (!qWords.length) return null;

  const contentQWords = qWords.filter((w) => !isStopWord(w));

  let best = null, bestScore = 0;
  for (const b of BOOKS) {
    const titles = [b.title?.ru, b.title?.en, typeof b.title === 'string' ? b.title : null].filter(Boolean);
    for (const title of titles) {
      const normTitle = norm(title);
      if (normTitle === text) return b;
      if (!contentQWords.length) continue;

      const titleWords = normTitle.split(' ').filter((w) => w.length >= 2);
      const contentWords = titleWords.filter((w) => w.length >= 3 && !isStopWord(w));
      if (!contentWords.length) continue;

      let contentHits = 0;
      for (const cw of contentWords) {
        if (contentQWords.some((qw) => matchWord(qw, cw))) contentHits++;
      }

      if (contentHits > 0) {
        const titleCoverage = contentHits / contentWords.length;
        if (titleCoverage >= 0.5 && titleCoverage > bestScore) {
          bestScore = titleCoverage;
          best = b;
        }
      }
    }
  }
  return bestScore >= 0.5 ? best : null;
}

export function createScriptedBrain() {
  const mem = { riddle: null, wrong: 0, mood: null, age: null, last: null };

  const L = (pair, lang) => (pair && typeof pair === 'object' ? (pair[lang] ?? pair.ru ?? pair.en ?? '') : (pair ?? ''));
  const chipsDefault = (lang) => [
    { label: L(R('Что почитать?', 'What should I read?'), lang) },
    { label: L(R('Загадку!', 'A riddle!'), lang) },
    { label: L(R('Когда вы открыты?', 'When are you open?'), lang) },
    { label: L(R('Где вы?', 'Where are you?'), lang) },
    { label: L(R('Подсказку про зверят', 'A hint about the critters'), lang) },
  ];
  const moreQuestionsChip = (lang) => ({
    label: L(R('Ещё вопросы…', 'More questions…'), lang),
    action: { type: 'starter_chips' },
  });
  const moodChips = (lang) => Object.keys(MOODS).map((m) => ({
    label: L({
      funny: R('смешное', 'funny'), adventure: R('приключения', 'adventure'), magic: R('волшебное', 'magic'),
      spooky: R('страшноватое', 'spooky'), friends: R('про дружбу', 'friendship'), animals: R('про животных', 'animals'), real: R('про жизнь', 'real life'),
    }[m], lang),
  }));

  function recommend(lang, voice, mood, age, state = {}) {
    mem.last = 'book';
    mem.mood = mood ?? mem.mood;
    mem.age = age ?? mem.age;
    const pool = findBooks({ age: mem.age ?? 'middle', mood: mem.mood });
    const book = pick(pool.length ? pool : findBooks({ age: mem.age ?? 'middle' }));
    if (!book) return [{ say: L(R('Хм, в сундуке пусто. Приходи в библиотеку — там книг больше!', 'Hmm, the chest is empty. Come to the library — there are many more!'), lang) }];
    const chips = [
      { label: L(R('Ещё!', 'Another!'), lang) },
      { label: L(R('Другое настроение', 'Different mood'), lang), send: L(R('Что почитать?', 'What should I read?'), lang) },
      moreQuestionsChip(lang),
    ];
    if (book && !state?.wish?.includes(book.id)) {
      chips.unshift({
        label: L(R('В читательский билет', 'Add to my card'), lang),
        action: { type: 'wish', id: book.id },
      });
    }
    return [
      { say: L(line(voice, 'found'), lang) },
      { book: book.id },
      { chips },
    ];
  }

  function askRiddle(lang, solved = []) {
    const solvedList = Array.isArray(solved) ? solved : [];
    const open = RIDDLES.filter((r) => !solvedList.includes(r.id) && r.id !== mem.riddle?.id);
    mem.riddle = pick(open.length ? open : RIDDLES);
    mem.wrong = 0;
    mem.last = 'riddle';
    return [{ say: L(R('Загадка! ', 'Riddle time! '), lang) + L(mem.riddle.q, lang) }, { chips: [{ label: L(R('Не знаю', 'I don’t know'), lang) }, moreQuestionsChip(lang)] }];
  }

  return {
    starterChips(lang) {
      return chipsDefault(lang);
    },

    greet({ lang, state, app, librarian, now = new Date() }) {
      const voice = librarianById(librarian).voice;
      const h = now.getHours();
      const hello = L(h < 12 ? R('Доброе утро', 'Good morning') : h < 18 ? R('Добрый день', 'Good afternoon') : R('Добрый вечер', 'Good evening'), lang);
      const week = bookOfTheWeek(now);
      const out = [];
      const fill = (s) => s.replace('{hello}', hello).replace('{name}', state.name);
      out.push({ say: fill(L(state.name ? voice.welcome : voice.greet, lang)) });
      if (week) {
        const titles = getTitlePair(week);
        const says = getSaysPair(week);
        out.push({ say: L(R(`Кстати, книга недели — «${titles.ru}». ${says.ru}`, `By the way, this week’s book is “${titles.en}”. ${says.en}`), lang) });
      }
      const chips = chipsDefault(lang);
      if (app?.canInstall && state.visits >= 2) chips.unshift({ label: L(R('Поселить книгу на телефоне', 'Keep the book on my phone'), lang), send: L(R('Как установить на телефон?', 'How do I install it?'), lang) });
      out.push({ chips });
      return out;
    },

    /** What the newly chosen librarian says when they take over the chat. */
    takeOver({ lang, librarian }) {
      return [{ say: L(librarianById(librarian).voice.hello, lang) }, { chips: chipsDefault(lang).slice(0, 3) }];
    },

    async reply(input, { lang, state, isNight, app = {}, librarian }) {
      const voice = librarianById(librarian).voice;
      const text = norm(input);
      const say = (pair) => ({ say: L(pair, lang) });

      // A riddle is waiting for an answer.
      if (mem.riddle) {
        const r = mem.riddle;
        const words = text.split(' ');
        const right = r.a.some((a) => (a.length <= 3 ? words.includes(a) : words.some((w) => w.startsWith(a))));
        if (right) {
          mem.riddle = null;
          const book = r.book ? bookById(r.book) : null;
          const chips = [{ label: L(R('Ещё загадку!', 'Another riddle!'), lang) }, ...chipsDefault(lang).slice(0, 1), moreQuestionsChip(lang)];
          if (book && !state?.wish?.includes(book.id)) {
            chips.unshift({
              label: L(R('В читательский билет', 'Add to my card'), lang),
              action: { type: 'wish', id: book.id },
            });
          }
          return [
            say(line(voice, 'correct')),
            ...(book ? [{ book: book.id }] : []),
            { action: { type: 'solve', id: r.id } },
            { chips },
          ];
        }
        if (has(text, INTENTS[0][1]) || mem.wrong >= 2) {
          mem.riddle = null;
          const book = r.book ? bookById(r.book) : null;
          const titles = getTitlePair(book, r);
          const chips = [{ label: L(R('Ещё загадку!', 'Another riddle!'), lang) }, moreQuestionsChip(lang)];
          if (book && !state?.wish?.includes(book.id)) {
            chips.unshift({
              label: L(R('В читательский билет', 'Add to my card'), lang),
              action: { type: 'wish', id: book.id },
            });
          }
          return [
            say(R(`Это «${titles.ru}»! Почитай — сразу запомнишь.`, `It’s “${titles.en}”! Read it and you’ll never forget.`)),
            ...(book ? [{ book: book.id }] : []),
            { chips },
          ];
        }
        if (!moodFromText(text) && !INTENTS.slice(1).some(([, s]) => has(text, s))) {
          mem.wrong += 1;
          const hint = typeof r.hint === 'object' ? r.hint : { ru: r.hint, en: r.hint };
          return [say(R(`Не-а! Подсказка: ${hint.ru}`, `Nope! Hint: ${hint.en}`)), { chips: [{ label: L(R('Не знаю', 'I don’t know'), lang) }, moreQuestionsChip(lang)] }];
        }
        mem.riddle = null; // they changed the subject
      }

      const book = bookFromText(text);
      if (book) {
        const titles = getTitlePair(book);
        const says = getSaysPair(book);
        const chips = [...chipsDefault(lang).slice(0, 2), moreQuestionsChip(lang)];
        if (!state?.wish?.includes(book.id)) {
          chips.unshift({
            label: L(R('В читательский билет', 'Add to my card'), lang),
            action: { type: 'wish', id: book.id },
          });
        }
        return [say(R(`О, «${titles.ru}»! ${says.ru}`, `Oh, “${titles.en}”! ${says.en}`)), { book: book.id }, { chips }];
      }

      const age = ageFromText(text);
      const mood = moodFromText(text);
      const intent = INTENTS.find(([, stems]) => has(text, stems))?.[0];

      // Moods only steer when nothing more specific was asked («подсказку про зверят» is a hint, not a book).
      if (mood && (!intent || ['recommend', 'more', 'greet', 'dontknow'].includes(intent))) return recommend(lang, voice, mood, age, state);
      if (age && (intent === 'recommend' || !intent)) return recommend(lang, voice, null, age, state);

      switch (intent) {
        case 'greet':
          return [say(pick([R('Привет-привет! Чем займёмся?', 'Hello hello! What shall we do?'), R('Хей! Я как раз считаю книжки. Все на месте!', 'Hey! Just counting the books. All present!')])), { chips: chipsDefault(lang) }];
        case 'starter_chips':
          return [say(R('Вот главные темы для разговора:', 'Here are the starter topics:')), { chips: chipsDefault(lang) }];
        case 'who':
          return [say(line(voice, 'who')), { chips: [{ label: L(R('Кто ещё на кастинге?', 'Who else is auditioning?'), lang), action: { type: 'goto', id: 'casting' } }, moreQuestionsChip(lang)] }];
        case 'casting':
          return [say(R('В библиотеке идёт кастинг на роль библиотекаря! Послушай кандидатов и отдай свой голос — кого выберешь, тот и будет здесь отвечать.', 'There’s a casting for the librarian’s role! Listen to the candidates and cast your vote — whoever you choose will answer here.')),
            { chips: [{ label: L(R('К кастингу!', 'To the casting!'), lang), action: { type: 'goto', id: 'casting' } }, moreQuestionsChip(lang)] }];
        case 'ai':
          return [say(R('Пока я знаю только библиотечные дела: книжки, загадки, расписание. Но учусь! Скоро смогу проверять, какая книга на полке, и откладывать её для тебя.', 'So far I only know library things: books, riddles, opening hours. But I’m learning! Soon I’ll be able to check which books are on the shelf and keep one aside for you.')), { chips: [moreQuestionsChip(lang)] }];
        case 'recommend':
          return [say(R('Сейчас найдём! Какое у тебя настроение?', 'Let’s find one! What’s your mood?')), { chips: [...moodChips(lang), moreQuestionsChip(lang)] }];
        case 'more':
          if (mem.last === 'riddle') return askRiddle(lang, state.solved);
          return mem.last === 'book' ? recommend(lang, voice, null, null, state) : [say(R('Ещё чего? Книжку или загадку?', 'More of what? A book or a riddle?')), { chips: [...chipsDefault(lang).slice(0, 2), moreQuestionsChip(lang)] }];
        case 'riddle':
          return askRiddle(lang, state.solved);
        case 'dontknow':
          return [say(R('Ничего страшного! Давай я что-нибудь подскажу.', 'No problem! Let me help.')), { chips: chipsDefault(lang) }];
        case 'hours': {
          const lines = LIBRARY.hours.map((h) => `${L(h.days, lang)} — ${L(h.time, lang)}`).join('; ');
          return [say(R(`Мы открыты: ${lines}. Но лучше уточни в Telegram — расписание иногда меняется.`, `We’re open: ${lines}. Best to double-check on Telegram — the schedule sometimes changes.`)), { chips: [{ label: L(R('Где вы?', 'Where are you?'), lang) }, moreQuestionsChip(lang)] }];
        }
        case 'where':
          return [say(R(`Мы в школе-саду «Компас» в Баре — в жёлтом доме с синими окнами. Его видно даже с Луны. Ну, почти.`, `We’re in the Kompas school-garden in Bar — the yellow house with blue windows. You can see it from the Moon. Nearly.`)), { chips: [{ label: L(R('Показать в книге', 'Show me in the book'), lang), action: { type: 'goto', id: 'find' } }, moreQuestionsChip(lang)] }];
        case 'join':
        case 'price':
          return [say(R(`Записаться просто: приходи со взрослым, получи читательский билет — это бесплатно! — и бери ${LIBRARY.loan.books} книги. Вернуть их нужно в течение календарного месяца, в дни работы библиотеки.`, `Joining is easy: come with a grown-up, get your library card — it’s free! — and take ${LIBRARY.loan.books} books home. Return them within one calendar month, on our opening days.`)), { chips: [{ label: L(R('Когда вы открыты?', 'When are you open?'), lang) }, moreQuestionsChip(lang)] }];
        case 'events': {
          const next = EVENTS.find((e) => new Date(e.end) >= Date.now());
          if (!next) return [say(R('Скоро объявим новый праздник. Следи за нами в Telegram!', 'We’ll announce the next party soon. Follow us on Telegram!')), { chips: [moreQuestionsChip(lang)] }];
          const d = new Date(next.start).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long' });
          const ruTitle = (typeof next.title === 'object' ? next.title.ru : next.title) || next.title_ru || '';
          const enTitle = (typeof next.title === 'object' ? next.title.en : next.title) || next.title_en || ruTitle;
          return [say(R(`Ближайшее — «${ruTitle}», ${d}. Пойдёшь? Я приду с фонариком!`, `Next up: “${enTitle}”, ${d}. Coming? I’ll bring a torch!`)), { chips: [{ label: L(R('Все праздники', 'All events'), lang), action: { type: 'goto', id: 'events' } }, moreQuestionsChip(lang)] }];
        }
        case 'donate':
          return [say(R('Книги в подарок? Ура! Приносите в часы работы — мы найдём им новых читателей. Особенно ждём книги на русском и английском.', 'Books to give? Hooray! Bring them during opening hours — we’ll find them new readers. Russian and English books are especially welcome.')), { chips: [moreQuestionsChip(lang)] }];
        case 'hint': {
          const c = CRITTERS.find((x) => !state.found[x.id]);
          if (!c) return [say(R('Ты нашёл всех жителей! Даже я так не умею.', 'You found all the book folk! Even I can’t do that.')), { chips: chipsDefault(lang) }];
          return [say(R(`Шепну по секрету: ${c.hint.ru}`, `Psst, here’s a secret: ${c.hint.en}`)), { chips: [{ label: L(R('Показать страницу', 'Show me the page'), lang), action: { type: 'goto', id: c.chapter === 'end' ? 'end' : c.chapter } }, moreQuestionsChip(lang)] }];
        }
        case 'night':
          return [say(isNight ? R('Щёлк! Да будет день!', 'Click! Let there be day!') : R('Щёлк! Зажигаю лампу. Вечером читается лучше всего.', 'Click! Lamp on. Evenings are best for reading.')), { action: { type: 'theme' } }];
        case 'upside':
          return [say(R('Вжух! Теперь ты читаешь как я.', 'Whoosh! Now you read like me.')), { action: { type: 'upside' } }];
        case 'horse':
          return [say(line(voice, 'horse')), { chips: [{ label: L(R('Покажи!', 'Show me!'), lang), action: { type: 'goto', id: 'chest' } }, moreQuestionsChip(lang)] }];
        case 'install':
          if (app.standalone) return [say(R('Я уже живу у тебя на экране! Книга открывается даже без интернета.', 'I already live on your screen! The book opens even without internet.')), { chips: [moreQuestionsChip(lang)] }];
          if (app.canInstall) return [say(R('Хоп — и книга поселится у тебя на телефоне, рядом с играми. И будет открываться без интернета!', 'Hop — and the book moves onto your phone, right next to your games. It even opens offline!')), { action: { type: 'install' }, chips: [moreQuestionsChip(lang)] }];
          if (app.ios) return [say(R('На айфоне так: нажми «Поделиться» внизу Safari, потом «На экран „Домой“». Готово — я у тебя в кармане!', 'On an iPhone: tap “Share” in Safari, then “Add to Home Screen”. Done — I’m in your pocket!')), { chips: [moreQuestionsChip(lang)] }];
          return [say(R('Открой меню браузера и выбери «Установить приложение» или «Добавить на главный экран». Книга будет открываться даже без интернета!', 'Open your browser menu and choose “Install app” or “Add to Home screen”. The book will open even offline!')), { chips: [moreQuestionsChip(lang)] }];
        case 'coins':
          return [say(R(`У тебя ${state.coins} — загляни в читательский билет, там все штампы!`, `You have ${state.coins} — check your library card, all your stamps are there!`)), { chips: [{ label: L(R('Открыть билет', 'Open my card'), lang), action: { type: 'passport' } }, moreQuestionsChip(lang)] }];
        case 'english':
          return [{ action: { type: 'lang', lang: 'en' } }, { say: 'Righto! English it is.' }];
        case 'russian':
          return [{ action: { type: 'lang', lang: 'ru' } }, { say: 'Договорились! Говорим по-русски.' }];
        case 'thanks':
          return [say(line(voice, 'thanks'))];
        case 'bye':
          return [say(line(voice, 'bye'))];
        default:
          return [say(line(voice, 'fallback')), { chips: chipsDefault(lang) }];
      }
    },
  };
}
