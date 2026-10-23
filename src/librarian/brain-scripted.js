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

const INTENTS = [
  ['dontknow', ['не знаю', 'сдаюсь', 'скажи ответ', 'какой ответ', 'dont know', 'don t know', 'give up', 'tell me the answer']],
  ['riddle', ['загад', 'игр', 'поигра', 'riddle', 'puzzle', 'quiz', 'game']],
  ['hint', ['подсказ', 'зверь', 'зверят', 'жител', 'спрятал', 'прячет', 'hint', 'critter', 'hidden', 'hiding', 'find animals', 'where are the']],
  ['install', ['установ', 'приложени', 'на телефон', 'на экран', 'без интернета', 'офлайн', 'install', '=app', 'home screen', 'offline']],
  ['more', ['еще', 'другую', 'другое', 'следующ', 'another', 'more', 'next', 'else']],
  ['events', ['праздн', 'событ', 'мероприят', 'афиш', 'клуб', 'встреч', 'event', 'party', 'club', 'happening']],
  ['recommend', ['что почитать', 'посовет', 'порекоменд', 'книг', 'книж', 'почитать', 'recommend', 'suggest', 'book', 'what to read', 'what should i read']],
  ['hours', ['когда', '=час', 'часы', 'время', 'открыт', 'работает', 'расписан', 'hour', 'open', 'when', 'time', 'schedule']],
  ['where', ['где', 'адрес', 'найти', 'дорог', 'добрат', 'карт', 'where', 'address', 'find you', 'map', 'location', 'directions']],
  ['join', ['записат', 'билет', 'запис', 'стать читат', 'join', 'sign up', 'member', 'card', 'register']],
  ['price', ['сколько стоит', 'цена', 'плат', 'бесплат', 'деньг', 'price', 'cost', 'free', 'pay', 'money']],
  ['donate', ['подар', 'пожертв', 'отдать', 'принест', 'donat', 'give books', 'gift']],
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
  ['greet', ['привет', 'здравств', 'здрасьте', '=хай', 'добрый', 'доброе', 'hello', '=hi', '=hey', 'good morning', 'good afternoon']],
];

const RIDDLES = [
  { id: 'karlsson', book: 'karlsson', a: ['карлсон', 'karlsson', 'karlson', 'carlson'],
    q: R('Кто живёт на крыше, обожает варенье и летает с пропеллером на спине?', 'Who lives on a roof, adores jam and flies with a propeller on his back?'),
    hint: R('Он — мужчина в самом расцвете сил.', 'He’s a man in his prime.') },
  { id: 'prince', book: 'little-prince', a: ['принц', 'prince'],
    q: R('Какой мальчик прилетел с крошечной планеты и очень любил свою розу?', 'Which boy came from a tiny planet and loved his rose very much?'),
    hint: R('Он маленький, но очень важный. Почти король.', 'He is little but very important. Almost a king.') },
  { id: 'pooh', book: 'pooh', a: ['пух', 'винни', 'pooh', 'winnie'],
    q: R('Какой медведь сочиняет пыхтелки и обожает мёд?', 'Which bear makes up hums and adores honey?'),
    hint: R('«В голове моей опилки, да-да-да!»', '“A bear of very little brain.”') },
  { id: 'oz', book: 'oz', a: ['изумруд', 'emerald', 'oz'],
    q: R('В каком городе все жители носят зелёные очки?', 'In which city does everyone wear green spectacles?'),
    hint: R('Город назван в честь зелёного драгоценного камня.', 'It’s named after a green gem.') },
  { id: 'narnia', book: 'narnia', a: ['шкаф', 'гардероб', 'wardrobe'],
    q: R('Через что Люси попала в Нарнию?', 'What did Lucy walk through to reach Narnia?'),
    hint: R('Там обычно висят шубы.', 'Fur coats usually hang in it.') },
  { id: 'harry', book: 'hp1', a: ['гарри', 'поттер', 'harry', 'potter'],
    q: R('Как зовут мальчика со шрамом в виде молнии?', 'What’s the name of the boy with a lightning-bolt scar?'),
    hint: R('Он жил в чулане под лестницей.', 'He lived in a cupboard under the stairs.') },
  { id: 'alice', book: 'alice', a: ['алис', 'alice'],
    q: R('Кто прыгнул в кроличью нору вслед за Белым Кроликом?', 'Who followed the White Rabbit down the rabbit hole?'),
    hint: R('Её имя начинается на «А».', 'Her name starts with an A.') },
  { id: 'treasure', book: 'treasure', a: ['сокровищ', 'treasure'],
    q: R('В какой книге юнга Джим находит карту с крестиком и попадает к пиратам?', 'In which book does cabin boy Jim find a map with an X and end up among pirates?'),
    hint: R('Там есть остров, попугай и одноногий кок.', 'It has an island, a parrot and a one-legged cook.') },
];

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

function bookFromText(text) {
  let best = null, score = 0;
  for (const b of BOOKS) {
    for (const title of [b.title.ru, b.title.en]) {
      const words = norm(title).split(' ').filter((w) => w.length >= 4);
      const hits = words.filter((w) => text.includes(w.slice(0, Math.max(5, w.length - 2)))).length;
      const s = words.length ? hits / words.length : 0;
      if (hits && s > score) { best = b; score = s; }
    }
  }
  return score >= 0.5 ? best : null;
}

export function createScriptedBrain() {
  const mem = { riddle: null, wrong: 0, mood: null, age: null, last: null };

  const L = (pair, lang) => pair[lang] ?? pair.ru;
  const chipsDefault = (lang) => [
    { label: L(R('Что почитать?', 'What should I read?'), lang) },
    { label: L(R('Загадку!', 'A riddle!'), lang) },
    { label: L(R('Когда вы открыты?', 'When are you open?'), lang) },
    { label: L(R('Где вы?', 'Where are you?'), lang) },
    { label: L(R('Подсказку про зверят', 'A hint about the critters'), lang) },
  ];
  const moodChips = (lang) => Object.keys(MOODS).map((m) => ({
    label: L({
      funny: R('смешное', 'funny'), adventure: R('приключения', 'adventure'), magic: R('волшебное', 'magic'),
      spooky: R('страшноватое', 'spooky'), friends: R('про дружбу', 'friendship'), animals: R('про животных', 'animals'), real: R('про жизнь', 'real life'),
    }[m], lang),
  }));

  function recommend(lang, voice, mood, age) {
    mem.last = 'book';
    mem.mood = mood ?? mem.mood;
    mem.age = age ?? mem.age;
    const pool = findBooks({ age: mem.age ?? 'middle', mood: mem.mood });
    const book = pick(pool.length ? pool : findBooks({ age: mem.age ?? 'middle' }));
    if (!book) return [{ say: L(R('Хм, в сундуке пусто. Приходи в библиотеку — там книг больше!', 'Hmm, the chest is empty. Come to the library — there are many more!'), lang) }];
    return [
      { say: L(line(voice, 'found'), lang) },
      { book: book.id },
      { chips: [{ label: L(R('Ещё!', 'Another!'), lang) }, { label: L(R('Другое настроение', 'Different mood'), lang), send: L(R('Что почитать?', 'What should I read?'), lang) }] },
    ];
  }

  function askRiddle(lang, solved) {
    const open = RIDDLES.filter((r) => !solved.includes(r.id) && r.id !== mem.riddle?.id);
    mem.riddle = pick(open.length ? open : RIDDLES);
    mem.wrong = 0;
    mem.last = 'riddle';
    return [{ say: L(R('Загадка! ', 'Riddle time! '), lang) + L(mem.riddle.q, lang) }, { chips: [{ label: L(R('Не знаю', 'I don’t know'), lang) }] }];
  }

  return {
    greet({ lang, state, app, librarian, now = new Date() }) {
      const voice = librarianById(librarian).voice;
      const h = now.getHours();
      const hello = L(h < 12 ? R('Доброе утро', 'Good morning') : h < 18 ? R('Добрый день', 'Good afternoon') : R('Добрый вечер', 'Good evening'), lang);
      const week = bookOfTheWeek(now);
      const out = [];
      const fill = (s) => s.replace('{hello}', hello).replace('{name}', state.name);
      out.push({ say: fill(L(state.name ? voice.welcome : voice.greet, lang)) });
      out.push({ say: L(R(`Кстати, книга недели — «${week.title.ru}». ${week.says.ru}`, `By the way, this week’s book is “${week.title.en}”. ${week.says.en}`), lang) });
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
          return [say(line(voice, 'correct')), { book: r.book }, { action: { type: 'solve', id: r.id } }, { chips: [{ label: L(R('Ещё загадку!', 'Another riddle!'), lang) }, ...chipsDefault(lang).slice(0, 1)] }];
        }
        if (has(text, INTENTS[0][1]) || mem.wrong >= 2) {
          mem.riddle = null;
          return [say(R(`Это «${bookById(r.book).title.ru}»! Почитай — сразу запомнишь.`, `It’s “${bookById(r.book).title.en}”! Read it and you’ll never forget.`)), { book: r.book }, { chips: [{ label: L(R('Ещё загадку!', 'Another riddle!'), lang) }] }];
        }
        if (!moodFromText(text) && !INTENTS.slice(1).some(([, s]) => has(text, s))) {
          mem.wrong += 1;
          return [say(R(`Не-а! Подсказка: ${r.hint.ru}`, `Nope! Hint: ${r.hint.en}`)), { chips: [{ label: L(R('Не знаю', 'I don’t know'), lang) }] }];
        }
        mem.riddle = null; // they changed the subject
      }

      const book = bookFromText(text);
      if (book) {
        return [say(R(`О, «${book.title.ru}»! ${book.says.ru}`, `Oh, “${book.title.en}”! ${book.says.en}`)), { book: book.id }, { chips: chipsDefault(lang).slice(0, 2) }];
      }

      const age = ageFromText(text);
      const mood = moodFromText(text);
      const intent = INTENTS.find(([, stems]) => has(text, stems))?.[0];

      // Moods only steer when nothing more specific was asked («подсказку про зверят» is a hint, not a book).
      if (mood && (!intent || ['recommend', 'more', 'greet', 'dontknow'].includes(intent))) return recommend(lang, voice, mood, age);
      if (age && (intent === 'recommend' || !intent)) return recommend(lang, voice, null, age);

      switch (intent) {
        case 'greet':
          return [say(pick([R('Привет-привет! Чем займёмся?', 'Hello hello! What shall we do?'), R('Хей! Я как раз считаю книжки. Все на месте!', 'Hey! Just counting the books. All present!')])), { chips: chipsDefault(lang) }];
        case 'who':
          return [say(line(voice, 'who')), { chips: [{ label: L(R('Кто ещё на кастинге?', 'Who else is auditioning?'), lang), action: { type: 'goto', id: 'casting' } }] }];
        case 'casting':
          return [say(R('В библиотеке идёт кастинг на роль библиотекаря! Послушай кандидатов и отдай свой голос — кого выберешь, тот и будет здесь отвечать.', 'There’s a casting for the librarian’s role! Listen to the candidates and cast your vote — whoever you choose will answer here.')),
            { chips: [{ label: L(R('К кастингу!', 'To the casting!'), lang), action: { type: 'goto', id: 'casting' } }] }];
        case 'ai':
          return [say(R('Пока я знаю только библиотечные дела: книжки, загадки, расписание. Но учусь! Скоро смогу проверять, какая книга на полке, и откладывать её для тебя.', 'So far I only know library things: books, riddles, opening hours. But I’m learning! Soon I’ll be able to check which books are on the shelf and keep one aside for you.'))];
        case 'recommend':
          return [say(R('Сейчас найдём! Какое у тебя настроение?', 'Let’s find one! What’s your mood?')), { chips: moodChips(lang) }];
        case 'more':
          if (mem.last === 'riddle') return askRiddle(lang, state.solved);
          return mem.last === 'book' ? recommend(lang, voice) : [say(R('Ещё чего? Книжку или загадку?', 'More of what? A book or a riddle?')), { chips: chipsDefault(lang).slice(0, 2) }];
        case 'riddle':
          return askRiddle(lang, state.solved);
        case 'dontknow':
          return [say(R('Ничего страшного! Давай я что-нибудь подскажу.', 'No problem! Let me help.')), { chips: chipsDefault(lang) }];
        case 'hours': {
          const lines = LIBRARY.hours.map((h) => `${L(h.days, lang)} — ${L(h.time, lang)}`).join('; ');
          return [say(R(`Мы открыты: ${lines}. Но лучше уточни в Telegram — расписание иногда меняется.`, `We’re open: ${lines}. Best to double-check on Telegram — the schedule sometimes changes.`)), { chips: [{ label: L(R('Где вы?', 'Where are you?'), lang) }] }];
        }
        case 'where':
          return [say(R(`Мы в школе-саду «Компас» в Баре — в жёлтом доме с синими окнами. Его видно даже с Луны. Ну, почти.`, `We’re in the Kompas school-garden in Bar — the yellow house with blue windows. You can see it from the Moon. Nearly.`)), { chips: [{ label: L(R('Показать в книге', 'Show me in the book'), lang), action: { type: 'goto', id: 'find' } }] }];
        case 'join':
        case 'price':
          return [say(R(`Записаться просто: приходи со взрослым, получи читательский билет — это бесплатно! — и бери ${LIBRARY.loan.books} книги на ${LIBRARY.loan.weeks} недели.`, `Joining is easy: come with a grown-up, get your library card — it’s free! — and take ${LIBRARY.loan.books} books home for ${LIBRARY.loan.weeks} weeks.`)), { chips: [{ label: L(R('Когда вы открыты?', 'When are you open?'), lang) }] }];
        case 'events': {
          const next = EVENTS.find((e) => new Date(e.end) >= Date.now());
          if (!next) return [say(R('Скоро объявим новый праздник. Следи за нами в Telegram!', 'We’ll announce the next party soon. Follow us on Telegram!'))];
          const d = new Date(next.start).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long' });
          return [say(R(`Ближайшее — «${next.title.ru}», ${d}. Пойдёшь? Я приду с фонариком!`, `Next up: “${next.title.en}”, ${d}. Coming? I’ll bring a torch!`)), { chips: [{ label: L(R('Все праздники', 'All events'), lang), action: { type: 'goto', id: 'events' } }] }];
        }
        case 'donate':
          return [say(R('Книги в подарок? Ура! Приносите в часы работы — мы найдём им новых читателей. Особенно ждём книги на русском и английском.', 'Books to give? Hooray! Bring them during opening hours — we’ll find them new readers. Russian and English books are especially welcome.'))];
        case 'hint': {
          const c = CRITTERS.find((x) => !state.found[x.id]);
          if (!c) return [say(R('Ты нашёл всех жителей! Даже я так не умею.', 'You found all the book folk! Even I can’t do that.'))];
          return [say(R(`Шепну по секрету: ${c.hint.ru}`, `Psst, here’s a secret: ${c.hint.en}`)), { chips: [{ label: L(R('Показать страницу', 'Show me the page'), lang), action: { type: 'goto', id: c.chapter === 'end' ? 'end' : c.chapter } }] }];
        }
        case 'night':
          return [say(isNight ? R('Щёлк! Да будет день!', 'Click! Let there be day!') : R('Щёлк! Зажигаю лампу. Вечером читается лучше всего.', 'Click! Lamp on. Evenings are best for reading.')), { action: { type: 'theme' } }];
        case 'upside':
          return [say(R('Вжух! Теперь ты читаешь как я.', 'Whoosh! Now you read like me.')), { action: { type: 'upside' } }];
        case 'horse':
          return [say(line(voice, 'horse')), { chips: [{ label: L(R('Покажи!', 'Show me!'), lang), action: { type: 'goto', id: 'chest' } }] }];
        case 'install':
          if (app.standalone) return [say(R('Я уже живу у тебя на экране! Книга открывается даже без интернета.', 'I already live on your screen! The book opens even without internet.'))];
          if (app.canInstall) return [say(R('Хоп — и книга поселится у тебя на телефоне, рядом с играми. И будет открываться без интернета!', 'Hop — and the book moves onto your phone, right next to your games. It even opens offline!')), { action: { type: 'install' } }];
          if (app.ios) return [say(R('На айфоне так: нажми «Поделиться» внизу Safari, потом «На экран „Домой“». Готово — я у тебя в кармане!', 'On an iPhone: tap “Share” in Safari, then “Add to Home Screen”. Done — I’m in your pocket!'))];
          return [say(R('Открой меню браузера и выбери «Установить приложение» или «Добавить на главный экран». Книга будет открываться даже без интернета!', 'Open your browser menu and choose “Install app” or “Add to Home screen”. The book will open even offline!'))];
        case 'coins':
          return [say(R(`У тебя ${state.coins} — загляни в читательский билет, там все штампы!`, `You have ${state.coins} — check your library card, all your stamps are there!`)), { chips: [{ label: L(R('Открыть билет', 'Open my card'), lang), action: { type: 'passport' } }] }];
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
