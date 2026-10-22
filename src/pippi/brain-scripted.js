// Pippi's offline brain: intent matching + a little memory. Same reply contract as the
// future AI brain (see librarian.js), so the chat UI never knows which one is talking.
import { BOOKS, AGE_GROUPS, findBooks, bookById, bookOfTheWeek } from '../content/books.js';
import { EVENTS } from '../content/events.js';
import { LIBRARY } from '../content/library.js';
import { CRITTERS } from '../content/game.js';

const R = (ru, en) => ({ ru, en });
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
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
  ['monkey', ['нильсон', 'обезьян', 'nilsson', 'monkey']],
  ['coins', ['монет', 'звани', 'очк', 'coin', 'rank', 'points', 'score', 'passport', 'паспорт']],
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
  { id: 'pippi', book: 'pippi', a: ['пепп', 'pipp', 'ты', 'you'],
    q: R('Кто живёт с лошадью и обезьянкой, а косички у неё торчат в разные стороны?', 'Who lives with a horse and a monkey, with braids sticking out sideways?'),
    hint: R('Посмотри внимательно, с кем ты сейчас разговариваешь!', 'Look closely at who you’re talking to!') },
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

  function recommend(lang, mood, age) {
    mem.last = 'book';
    mem.mood = mood ?? mem.mood;
    mem.age = age ?? mem.age;
    const pool = findBooks({ age: mem.age ?? 'middle', mood: mem.mood });
    const book = pick(pool.length ? pool : findBooks({ age: mem.age ?? 'middle' }));
    if (!book) return [{ say: L(R('Хм, в сундуке пусто. Приходи в библиотеку — там книг больше!', 'Hmm, the chest is empty. Come to the library — there are many more!'), lang) }];
    return [
      { say: L(pick([R('Ага! Вот что я выудила из сундука:', 'Aha! Look what I fished out of the chest:'), R('Держи! Только не урони — она тяжёлая. Шучу!', 'Here! Don’t drop it — it’s heavy. Kidding!'), R('Тадам!', 'Ta-da!')]), lang) },
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
    greet({ lang, state, app, now = new Date() }) {
      const h = now.getHours();
      const hello = h < 12 ? R('Доброе утро', 'Good morning') : h < 18 ? R('Добрый день', 'Good afternoon') : R('Добрый вечер', 'Good evening');
      const week = bookOfTheWeek(now);
      const out = [];
      if (state.name) out.push({ say: `${L(hello, lang)}, ${state.name}! ${L(R('С возвращением в библиотеку.', 'Welcome back to the library.'), lang)}` });
      else out.push({ say: L(R(`${hello.ru}! Я Пеппи — самая сильная библиотекарша на свете. Могу поднять лошадь, а могу найти тебе книжку. Что выберешь?`, `${hello.en}! I’m Pippi — the strongest librarian in the world. I can lift a horse, or I can find you a book. Which will it be?`), lang) });
      out.push({ say: L(R(`Кстати, книга недели — «${week.title.ru}». ${week.says.ru}`, `By the way, this week’s book is “${week.title.en}”. ${week.says.en}`), lang) });
      const chips = chipsDefault(lang);
      if (app?.canInstall && state.visits >= 2) chips.unshift({ label: L(R('Поселить книгу на телефоне', 'Keep the book on my phone'), lang), send: L(R('Как установить на телефон?', 'How do I install it?'), lang) });
      out.push({ chips });
      return out;
    },

    async reply(input, { lang, state, isNight, app = {} }) {
      const text = norm(input);
      const say = (pair) => ({ say: L(pair, lang) });

      // A riddle is waiting for an answer.
      if (mem.riddle) {
        const r = mem.riddle;
        const words = text.split(' ');
        const right = r.a.some((a) => (a.length <= 3 ? words.includes(a) : words.some((w) => w.startsWith(a))));
        if (right) {
          mem.riddle = null;
          return [say(R('Правильно! Ты настоящий книгочей.', 'Correct! You’re a true bookworm.')), { book: r.book }, { action: { type: 'solve', id: r.id } }, { chips: [{ label: L(R('Ещё загадку!', 'Another riddle!'), lang) }, ...chipsDefault(lang).slice(0, 1)] }];
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
      if (mood && (!intent || ['recommend', 'more', 'greet', 'dontknow'].includes(intent))) return recommend(lang, mood, age);
      if (age && (intent === 'recommend' || !intent)) return recommend(lang, null, age);

      switch (intent) {
        case 'greet':
          return [say(pick([R('Привет-привет! Чем займёмся?', 'Hello hello! What shall we do?'), R('Хей! Я как раз пересчитывала книжки. Все на месте!', 'Hey! I was just counting the books. All present!')])), { chips: chipsDefault(lang) }];
        case 'who':
          return [say(R('Я Пеппи. Ну, почти та самая. Работаю здесь библиотекарем: знаю, где живёт каждая книжка, и умею читать вверх ногами. А скоро стану ещё умнее — меня учат разговаривать обо всём на свете.', 'I’m Pippi. Well, nearly that Pippi. I’m the librarian here: I know where every book lives and I can read upside down. Soon I’ll be even cleverer — they’re teaching me to talk about everything.'))];
        case 'ai':
          return [say(R('Я пока выучила только библиотечные дела: книжки, загадки, расписание. Но меня учат! Скоро смогу проверять, какая книга на полке, и откладывать её для тебя.', 'So far I only know library things: books, riddles, opening hours. But I’m learning! Soon I’ll be able to check which books are on the shelf and keep one aside for you.'))];
        case 'recommend':
          return [say(R('Сейчас найдём! Какое у тебя настроение?', 'Let’s find one! What’s your mood?')), { chips: moodChips(lang) }];
        case 'more':
          if (mem.last === 'riddle') return askRiddle(lang, state.solved);
          return mem.last === 'book' ? recommend(lang) : [say(R('Ещё чего? Книжку или загадку?', 'More of what? A book or a riddle?')), { chips: chipsDefault(lang).slice(0, 2) }];
        case 'riddle':
          return askRiddle(lang, state.solved);
        case 'dontknow':
          return [say(R('Ничего страшного! Давай я что-нибудь подскажу.', 'No problem! Let me help.')), { chips: chipsDefault(lang) }];
        case 'hours': {
          const lines = LIBRARY.hours.map((h) => `${L(h.days, lang)} — ${L(h.time, lang)}`).join('; ');
          return [say(R(`Мы открыты: ${lines}. Но лучше уточни в Telegram — вдруг я ушла кормить лошадь.`, `We’re open: ${lines}. Best to double-check on Telegram — I might be out feeding the horse.`)), { chips: [{ label: L(R('Где вы?', 'Where are you?'), lang) }] }];
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
          return [say(R('Лошадь? Да я её одной рукой подниму! Загляни в главу про мой сундук и нажми на неё.', 'The horse? I can lift it with one hand! Find it in the chapter about my chest and give it a tap.')), { chips: [{ label: L(R('Покажи!', 'Show me!'), lang), action: { type: 'goto', id: 'chest' } }] }];
        case 'monkey':
          return [say(R('Господин Нильсон сейчас спит в шляпе. Не будем его будить.', 'Mr Nilsson is asleep in a hat right now. Let’s not wake him.'))];
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
          return [say(pick([R('Пожалуйста! Заходи ещё — у меня в сундуке полно сюрпризов.', 'You’re welcome! Come again — my chest is full of surprises.'), R('Всегда пожалуйста! Передай привет своей книжке.', 'Any time! Say hi to your book for me.')]))];
        case 'bye':
          return [say(R('Пока-пока! Приходи в жёлтый дом — я буду ждать.', 'Bye-bye! Come to the yellow house — I’ll be waiting.'))];
        default:
          return [
            say(pick([
              R('Хм, этого я пока не знаю — я ещё учусь. Спроси меня про книги, расписание или загадки!', 'Hmm, I don’t know that yet — I’m still learning. Ask me about books, opening hours or riddles!'),
              R('Ой, я как раз смотрела в другую сторону. Давай про книжки?', 'Oops, I was looking the other way. Shall we talk books?'),
              R('Это слишком сложно даже для самой сильной девочки на свете. Попробуй по-другому!', 'That’s too tricky even for the strongest girl in the world. Try another way!'),
            ])),
            { chips: chipsDefault(lang) },
          ];
      }
    },
  };
}
