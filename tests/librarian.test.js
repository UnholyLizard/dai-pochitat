import test from 'node:test';
import assert from 'node:assert/strict';
import { createScriptedBrain } from '../src/librarian/brain-scripted.js';
import { BOOKS } from '../src/content/books.js';

test('librarian riddle flow - handles surrender without throwing title error', async () => {
  const brain = createScriptedBrain();
  const ctx = {
    lang: 'ru',
    state: { solved: [], name: 'Reader', coins: 0, found: {}, stamps: {}, wish: [] },
    isNight: false,
    librarian: 'owl',
  };

  for (let i = 0; i < 15; i++) {
    const askReply = await brain.reply('Загадку', ctx);
    assert.ok(Array.isArray(askReply), 'reply should be array');
    assert.ok(askReply[0].say.includes('Загадка!'), 'should present riddle');

    const surrenderReply = await brain.reply('Не знаю', ctx);
    assert.ok(Array.isArray(surrenderReply), 'surrender reply should be array');
    assert.ok(surrenderReply[0].say.startsWith('Это «'), 'should reveal answer');
    assert.ok(!surrenderReply[0].say.includes('undefined'), 'should not contain undefined');
  }
});

test('librarian riddle flow - English surrender', async () => {
  const brain = createScriptedBrain();
  const ctx = {
    lang: 'en',
    state: { solved: [], name: 'Reader', coins: 0, found: {}, stamps: {}, wish: [] },
    isNight: false,
    librarian: 'owl',
  };

  const askReply = await brain.reply('Give me a riddle', ctx);
  assert.ok(Array.isArray(askReply));

  const surrenderReply = await brain.reply("I don't know", ctx);
  assert.ok(Array.isArray(surrenderReply));
  assert.ok(surrenderReply[0].say.startsWith('It’s “'));
  assert.ok(!surrenderReply[0].say.includes('undefined'));
});

test('librarian riddle flow - wrong answers give hints then reveal', async () => {
  const brain = createScriptedBrain();
  const ctx = {
    lang: 'ru',
    state: { solved: [], name: 'Reader', coins: 0, found: {}, stamps: {}, wish: [] },
    isNight: false,
    librarian: 'owl',
  };

  await brain.reply('Загадку', ctx);
  const wrong1 = await brain.reply('абракадабра1', ctx);
  assert.ok(wrong1[0].say.includes('Не-а! Подсказка:'));

  const wrong2 = await brain.reply('абракадабра2', ctx);
  assert.ok(wrong2[0].say.includes('Не-а! Подсказка:'));

  const wrong3 = await brain.reply('абракадабра3', ctx);
  assert.ok(wrong3[0].say.startsWith('Это «'));
  assert.ok(!wrong3[0].say.includes('undefined'));
});

test('librarian events flow', async () => {
  const brain = createScriptedBrain();
  const ctx = {
    lang: 'ru',
    state: { solved: [], name: 'Reader', coins: 0, found: {}, stamps: {}, wish: [] },
    isNight: false,
    librarian: 'owl',
  };

  const res = await brain.reply('праздники', ctx);
  assert.ok(Array.isArray(res));
  assert.ok(res[0].say.length > 0);
  assert.ok(!res[0].say.includes('undefined'));
});

test('librarian recommend flow - offers wish chip when book not in wish list', async () => {
  const brain = createScriptedBrain();
  const ctx = {
    lang: 'ru',
    state: { solved: [], name: 'Reader', coins: 0, found: {}, stamps: {}, wish: [] },
    isNight: false,
    librarian: 'owl',
  };

  const res = await brain.reply('смешную книгу', ctx);
  const bookEntry = res.find((r) => r.book);
  const chipsEntry = res.find((r) => r.chips);
  assert.ok(bookEntry, 'recommendation should include book');
  assert.ok(chipsEntry, 'recommendation should include chips');
  const wishChip = chipsEntry.chips.find((c) => c.action?.type === 'wish');
  assert.ok(wishChip, 'should offer wish action chip');
  assert.equal(wishChip.action.id, bookEntry.book);

  // If all books are already in wish list, should not offer redundant wish chip
  ctx.state.wish = BOOKS.map((b) => b.id);
  const res2 = await brain.reply('смешную книгу', ctx);
  const chipsEntry2 = res2.find((r) => r.chips);
  const wishChip2 = chipsEntry2.chips.find((c) => c.action?.type === 'wish');
  assert.equal(wishChip2, undefined, 'should not offer wish chip if already in wishlist');
});

test('librarian greeting and recommend consistency - Russian vs English', async () => {
  // Inject mock catalog books that have titles with "Привет" and "Читать"
  BOOKS.push({
    id: 'привет-маттиас--105',
    title: { ru: 'Привет, Маттиас!', en: 'Hello, Mattias!' },
    says: { ru: 'Хорошая книга', en: 'Good book' },
  });
  BOOKS.push({
    id: 'читать-265',
    title: { ru: 'Читать', en: 'Read' },
    says: { ru: 'Хорошая книга 2', en: 'Good book 2' },
  });

  const brain = createScriptedBrain();
  const ctxRu = {
    lang: 'ru',
    state: { solved: [], name: 'Reader', coins: 0, found: {}, stamps: {}, wish: [] },
    isNight: false,
    librarian: 'owl',
  };
  const ctxEn = {
    lang: 'en',
    state: { solved: [], name: 'Reader', coins: 0, found: {}, stamps: {}, wish: [] },
    isNight: false,
    librarian: 'owl',
  };

  // 1. Russian greeting "Привет!" should trigger greet intent, NOT the book "Привет, Маттиас!"
  const ruGreet = await brain.reply('Привет!', ctxRu);
  assert.ok(!ruGreet.some((r) => r.book), 'Привет! must not return a book card');
  assert.ok(
    ruGreet[0].say.includes('Привет-привет') || ruGreet[0].say.includes('Хей!'),
    'Привет! should reply with a greeting',
  );
  const ruGreetChips = ruGreet.find((r) => r.chips)?.chips ?? [];
  assert.ok(ruGreetChips.some((c) => c.label.includes('Что почитать?')), 'Привет! should show default chips');

  // 2. English greeting "Hi!" should trigger greet intent
  const enGreet = await brain.reply('Hi!', ctxEn);
  assert.ok(!enGreet.some((r) => r.book), 'Hi! must not return a book card');
  assert.ok(
    enGreet[0].say.includes('Hello hello') || enGreet[0].say.includes('Hey!'),
    'Hi! should reply with a greeting',
  );
  const enGreetChips = enGreet.find((r) => r.chips)?.chips ?? [];
  assert.ok(enGreetChips.some((c) => c.label.includes('What should I read?')), 'Hi! should show default chips');

  // 3. Russian recommendation prompt "Что почитать?" should ask for mood, NOT show the book "Читать"
  const ruRec = await brain.reply('Что почитать?', ctxRu);
  assert.ok(!ruRec.some((r) => r.book), 'Что почитать? must not return a book card');
  assert.ok(ruRec[0].say.includes('Какое у тебя настроение?'), 'Что почитать? should ask for mood');
  const ruRecChips = ruRec.find((r) => r.chips)?.chips ?? [];
  assert.ok(ruRecChips.some((c) => c.label === 'смешное'), 'Что почитать? should offer mood chips');

  // 4. English recommendation prompt "What should I read?" should ask for mood
  const enRec = await brain.reply('What should I read?', ctxEn);
  assert.ok(!enRec.some((r) => r.book), 'What should I read? must not return a book card');
  assert.ok(enRec[0].say.includes('What’s your mood?'), 'What should I read? should ask for mood');
  const enRecChips = enRec.find((r) => r.chips)?.chips ?? [];
  assert.ok(enRecChips.some((c) => c.label === 'funny'), 'What should I read? should offer mood chips');

  // 5. "Добрый вечер" and "Good evening" should trigger greeting, not theme switch
  const ruEvening = await brain.reply('Добрый вечер', ctxRu);
  assert.ok(!ruEvening.some((r) => r.action?.type === 'theme'), 'Добрый вечер must not toggle night theme');
  assert.ok(ruEvening[0].say.includes('Привет-привет') || ruEvening[0].say.includes('Хей!'));

  // 6. Genuine book titles still match and show the book
  const hobbitMatch = await brain.reply('Хоббит', ctxRu);
  assert.ok(hobbitMatch.some((r) => r.book === 'хоббит-365'), 'Хоббит should show the Hobbit book card');

  // 7. Full title match for "Привет, Маттиас!" should still find the book when explicitly named
  const mattiasMatch = await brain.reply('Привет, Маттиас!', ctxRu);
  assert.ok(mattiasMatch.some((r) => r.book === 'привет-маттиас--105'), 'Exact book title should match');
});

test('librarian typo tolerance for offline book search', async () => {
  const brain = createScriptedBrain();
  const ctxRu = {
    lang: 'ru',
    state: { solved: [], name: 'Reader', coins: 0, found: {}, stamps: {}, wish: [] },
    isNight: false,
    librarian: 'owl',
  };

  // 1. Single character typo: "Гарри Потер" (missing one 'т')
  const potterMatch = await brain.reply('Гарри Потер', ctxRu);
  assert.ok(potterMatch.some((r) => r.book === 'гарри-поттер-и-философский-кам-159'), 'Should match Harry Potter with typo');

  // 2. Single character typo: "Хобит" (missing one 'б')
  const hobbitMatch = await brain.reply('Хобит', ctxRu);
  assert.ok(hobbitMatch.some((r) => r.book === 'хоббит-365'), 'Should match Hobbit with typo');

  // 3. Single character typo: "Груфало" (missing one 'ф')
  const gruffaloMatch = await brain.reply('Груфало', ctxRu);
  assert.ok(gruffaloMatch.some((r) => r.book === 'груффало-875'), 'Should match Gruffalo with typo');
});

test('librarian starter chips reveal and more questions chip', async () => {
  const brain = createScriptedBrain();
  const ctxRu = {
    lang: 'ru',
    state: { solved: [], name: 'Reader', coins: 0, found: {}, stamps: {}, wish: [] },
    isNight: false,
    librarian: 'owl',
  };

  // starterChips method returns default list
  const starter = brain.starterChips('ru');
  assert.equal(starter.length, 5);
  assert.ok(starter.some((c) => c.label.includes('Что почитать?')));
  assert.ok(starter.some((c) => c.label.includes('Когда вы открыты?')));

  // Hours reply includes "Ещё вопросы…" chip to restore starter chips
  const hoursReply = await brain.reply('Когда вы открыты?', ctxRu);
  const hoursChips = hoursReply.find((r) => r.chips)?.chips ?? [];
  const moreChip = hoursChips.find((c) => c.action?.type === 'starter_chips');
  assert.ok(moreChip, 'Hours reply should include starter_chips action chip');
  assert.equal(moreChip.label, 'Ещё вопросы…');

  // Sending "Ещё вопросы" reveals the starter chips
  const revealReply = await brain.reply('Ещё вопросы', ctxRu);
  const revealChips = revealReply.find((r) => r.chips)?.chips ?? [];
  assert.equal(revealChips.length, 5);
  assert.ok(revealChips.some((c) => c.label.includes('Что почитать?')));
});
