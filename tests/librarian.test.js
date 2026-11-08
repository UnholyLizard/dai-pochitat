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


