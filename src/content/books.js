// A sample of the shelf for the magic chest. The real catalogue can replace this list 1:1.
// age: [min, max]; moods: funny | adventure | magic | spooky | friends | animals | real
const B = (id, ru, en, ruAuthor, enAuthor, age, moods, color, saysRu, saysEn, coverUrl = null) => ({
  id, title: { ru, en }, author: { ru: ruAuthor, en: enAuthor }, age, moods, color, says: { ru: saysRu, en: saysEn }, cover_url: coverUrl,
});

export const BOOKS = [
  B('karlsson', 'Малыш и Карлсон', 'Karlsson-on-the-Roof', 'Астрид Линдгрен', 'Astrid Lindgren', [6, 10], ['funny', 'friends'], '#2f8a84',
    'Мужчина в самом расцвете сил. И с пропеллером!', 'A man in his prime. With a propeller!'),
  B('lionheart', 'Братья Львиное Сердце', 'The Brothers Lionheart', 'Астрид Линдгрен', 'Astrid Lindgren', [9, 13], ['adventure', 'magic', 'friends'], '#7d5bbf',
    'Про храбрость. Возьми платок — на всякий случай.', 'About courage. Bring a hanky, just in case.', '/covers/DP-0402.webp'),
  B('ronia', 'Рони, дочь разбойника', 'Ronia, the Robber’s Daughter', 'Астрид Линдгрен', 'Astrid Lindgren', [9, 12], ['adventure', 'friends'], '#6f8f3a',
    'Девочка из леса, которая никого не боится.', 'A forest girl who fears no one.', '/covers/DP-0401.webp'),
  B('moomin-comet', 'Муми-тролль и комета', 'Comet in Moominland', 'Туве Янссон', 'Tove Jansson', [7, 11], ['adventure', 'friends', 'magic'], '#3f7fd6',
    'Летит комета, а они пьют чай. Вот это выдержка!', 'A comet is coming and they’re having tea. Now that’s calm!'),
  B('gruffalo', 'Груффало', 'The Gruffalo', 'Джулия Дональдсон', 'Julia Donaldson', [3, 6], ['funny', 'animals', 'spooky'], '#8a5a2b',
    'Мышонок хитрее всех. Запомни этот приём!', 'The mouse outsmarts them all. Remember that trick!', '/covers/DP-0875.webp'),
  B('pooh', 'Винни-Пух и все-все-все', 'Winnie-the-Pooh', 'Алан Милн', 'A. A. Milne', [3, 8], ['funny', 'animals', 'friends'], '#e3a512',
    'Медведь, мёд и много пыхтелок. Идеально перед сном.', 'A bear, some honey, lots of hums. Perfect before bed.'),
  B('little-prince', 'Маленький принц', 'The Little Prince', 'Антуан де Сент-Экзюпери', 'Antoine de Saint-Exupéry', [9, 99], ['friends', 'magic', 'real'], '#1f4dd8',
    'Короткая, но потом думаешь о ней всю жизнь.', 'Short, but you’ll think about it forever.', '/covers/DP-0447.webp'),
  B('hp1', 'Гарри Поттер и философский камень', 'Harry Potter and the Philosopher’s Stone', 'Джоан Роулинг', 'J. K. Rowling', [9, 14], ['magic', 'adventure', 'friends'], '#9b2c2c',
    'Мальчик живёт под лестницей, а потом — ух!', 'A boy lives under the stairs, and then — whoosh!', '/covers/DP-0159.webp'),
  B('narnia', 'Лев, колдунья и платяной шкаф', 'The Lion, the Witch and the Wardrobe', 'Клайв Льюис', 'C. S. Lewis', [8, 12], ['magic', 'adventure'], '#c9a227',
    'После неё ты будешь проверять каждый шкаф.', 'After this you’ll check every wardrobe.', '/covers/DP-1186.webp'),
  B('hobbit', 'Хоббит', 'The Hobbit', 'Джон Толкин', 'J. R. R. Tolkien', [10, 14], ['adventure', 'magic'], '#4b6b2f',
    'Туда и обратно. С драконом посередине.', 'There and back again. With a dragon in the middle.', '/covers/DP-0365.webp'),
  B('charlie', 'Чарли и шоколадная фабрика', 'Charlie and the Chocolate Factory', 'Роальд Даль', 'Roald Dahl', [7, 11], ['funny', 'magic'], '#6b3e26',
    'Читай с конфетой. Иначе будет мучительно.', 'Read with a sweet in hand. Otherwise it’s torture.', '/covers/DP-0148.webp'),
  B('matilda', 'Матильда', 'Matilda', 'Роальд Даль', 'Roald Dahl', [8, 12], ['funny', 'real', 'magic'], '#d9667e',
    'Девочка, которая прочитала всю библиотеку. Уважаю.', 'A girl who read the whole library. Respect.', '/covers/DP-0145.webp'),
  B('witches', 'Ведьмы', 'The Witches', 'Роальд Даль', 'Roald Dahl', [8, 12], ['spooky', 'magic', 'funny'], '#5b3f8c',
    'Страшно и смешно одновременно — редкое сочетание.', 'Scary and funny at once — a rare mix.', '/covers/DP-0151.webp'),
  B('oz', 'Волшебник Изумрудного города', 'The Wizard of the Emerald City', 'Александр Волков', 'Alexander Volkov', [6, 10], ['magic', 'adventure', 'friends'], '#2e8b57',
    'Друзья, дорога и немножко обмана. Классика!', 'Friends, a road and a little trickery. A classic!', '/covers/DP-0153.webp'),
  B('deniska', 'Денискины рассказы', 'Deniska’s Stories', 'Виктор Драгунский', 'Victor Dragunsky', [6, 10], ['funny', 'real'], '#e07b39',
    'Смеётся вся библиотека — даже лошадь.', 'The whole library laughs — even the horse.'),
  B('neznayka', 'Незнайка на Луне', 'Dunno on the Moon', 'Николай Носов', 'Nikolay Nosov', [7, 11], ['funny', 'adventure'], '#3d6fb6',
    'Коротышки летят на Луну. А что, так можно было?', 'Little folk fly to the Moon. Wait, that’s allowed?', '/covers/DP-0379.webp'),
  B('alice', 'Алиса в Стране чудес', 'Alice’s Adventures in Wonderland', 'Льюис Кэрролл', 'Lewis Carroll', [8, 99], ['magic', 'funny'], '#4aa3c7',
    'Всё вверх ногами. Мой любимый порядок!', 'Everything upside down. My favourite kind of order!', '/covers/DP-0344.webp'),
  B('nils', 'Чудесное путешествие Нильса с дикими гусями', 'The Wonderful Adventures of Nils', 'Сельма Лагерлёф', 'Selma Lagerlöf', [8, 11], ['animals', 'adventure'], '#8a9a5b',
    'Целая Швеция с высоты гусиного полёта.', 'All of Sweden from a goose’s back.', '/covers/DP-0974.webp'),
  B('wonder', 'Чудо', 'Wonder', 'Р. Дж. Паласио', 'R. J. Palacio', [10, 14], ['friends', 'real'], '#2b5fd9',
    'Про то, как важно быть добрым. Очень важно.', 'About being kind. Very, very important.', '/covers/DP-1000.webp'),
  B('percy', 'Перси Джексон и похититель молний', 'Percy Jackson and the Lightning Thief', 'Рик Риордан', 'Rick Riordan', [10, 14], ['adventure', 'magic', 'funny'], '#1f6f8b',
    'Древние боги в наше время. Шумно и весело!', 'Ancient gods today. Loud and fun!'),
  B('hilda', 'Хильда и тролль', 'Hilda and the Troll', 'Люк Пирсон', 'Luke Pearson', [6, 10], ['adventure', 'magic', 'animals'], '#2a9d8f',
    'Синеволосая девочка и тролль. Комикс — тоже книга!', 'A blue-haired girl and a troll. Comics count!', '/covers/DP-0815.webp'),
  B('little-witch', 'Маленькая Баба-Яга', 'The Little Witch', 'Отфрид Пройслер', 'Otfried Preußler', [6, 10], ['magic', 'funny'], '#6a4c93',
    'Ей всего сто двадцать семь. Совсем малышка!', 'She’s only a hundred and twenty-seven. Just a baby!', '/covers/DP-0361.webp'),
  B('wimpy', 'Дневник слабака', 'Diary of a Wimpy Kid', 'Джефф Кинни', 'Jeff Kinney', [9, 13], ['funny', 'real'], '#c2a35a',
    'Читается за вечер. Хохочется — всю неделю.', 'Read it in an evening. Laugh all week.'),
  B('waffle', 'Вафельное сердце', 'Waffle Hearts', 'Мария Парр', 'Maria Parr', [8, 12], ['funny', 'friends'], '#d4793b',
    'Лучшая подруга и норвежская деревня. Вкусно!', 'A best friend and a Norwegian village. Delicious!', '/covers/DP-0085.webp'),
  B('coraline', 'Коралина', 'Coraline', 'Нил Гейман', 'Neil Gaiman', [9, 13], ['spooky', 'magic'], '#3c3c6b',
    'Пуговицы вместо глаз. Бр-р-р. Обожаю!', 'Buttons for eyes. Brrr. Love it!'),
  B('garden', 'Таинственный сад', 'The Secret Garden', 'Фрэнсис Бёрнетт', 'Frances Hodgson Burnett', [9, 13], ['friends', 'real'], '#5a8f3d',
    'Ключ, калитка и сад, который оживает.', 'A key, a gate and a garden coming back to life.'),
  B('treasure', 'Остров сокровищ', 'Treasure Island', 'Роберт Льюис Стивенсон', 'Robert Louis Stevenson', [10, 14], ['adventure'], '#a0522d',
    'Пираты, карта и сундук — всё как мы любим.', 'Pirates, a map and a chest — just how we like it.', '/covers/DP-0375.webp'),
  B('hunger', 'Голодные игры', 'The Hunger Games', 'Сьюзен Коллинз', 'Suzanne Collins', [13, 18], ['adventure', 'real'], '#b5442c',
    'Для тех, кто постарше. Не оторваться.', 'For older readers. Impossible to put down.'),
  B('baskervilles', 'Собака Баскервилей', 'The Hound of the Baskervilles', 'Артур Конан Дойл', 'Arthur Conan Doyle', [12, 99], ['spooky', 'adventure'], '#4a4e69',
    'Туман, болота и великий сыщик. Читай при свете!', 'Fog, moors and a great detective. Keep the light on!'),
  B('poppins', 'Мэри Поппинс', 'Mary Poppins', 'Памела Трэверс', 'P. L. Travers', [6, 10], ['magic', 'funny'], '#2f4858',
    'Няня с зонтиком и характером. Волшебно!', 'A nanny with an umbrella and attitude. Magic!', '/covers/DP-0380.webp'),
  B('charlotte', 'Паутина Шарлотты', 'Charlotte’s Web', 'Элвин Брукс Уайт', 'E. B. White', [7, 10], ['animals', 'friends'], '#b07d48',
    'Поросёнок и паучиха. Самая нежная дружба.', 'A pig and a spider. The gentlest friendship.'),
  B('alisa', 'Путешествие Алисы', 'Alisa’s Journey', 'Кир Булычёв', 'Kir Bulychev', [8, 12], ['adventure', 'funny', 'magic'], '#3a86ff',
    'Космос, звери и девочка из будущего.', 'Space, creatures and a girl from the future.'),
  B('justso', 'Сказки просто так', 'Just So Stories', 'Редьярд Киплинг', 'Rudyard Kipling', [5, 9], ['animals', 'funny'], '#c08a3e',
    'Откуда у слонёнка хобот? Вот тут написано!', 'How did the elephant get his trunk? It’s all in here!'),
  B('fahrenheit', '451° по Фаренгейту', 'Fahrenheit 451', 'Рэй Брэдбери', 'Ray Bradbury', [14, 99], ['real', 'spooky'], '#e85d04',
    'Про мир, где жгут книги. Мы такого не допустим!', 'A world that burns books. Not on my watch!'),
  B('book-thief', 'Книжный вор', 'The Book Thief', 'Маркус Зусак', 'Markus Zusak', [14, 99], ['real', 'friends'], '#6d597a',
    'Про девочку, которая спасала книги. Наш человек.', 'About a girl who rescued books. One of us.', '/covers/DP-1175.webp'),
  B('mio', 'Мио, мой Мио!', 'Mio, My Son', 'Астрид Линдгрен', 'Astrid Lindgren', [8, 12], ['magic', 'adventure'], '#457b9d',
    'Волшебная страна и настоящий друг.', 'A magic land and a true friend.'),
  B('friends-club', 'Клуб друзей', 'The Friends Club', 'Софи Геррив', 'Sophie Guerrive', [3, 6], ['friends', 'animals', 'adventure'], '#e5aa2c',
    'Уютнейший первый комикс для малышей, доказывающий, что дружба побеждает любые страхи!', 'The coziest first comic for little ones, proving that friendship conquers any fear!', '/covers/DP-0002.webp'),
  B('caterpillar', 'Очень голодная гусеница', 'The Very Hungry Caterpillar', 'Эрик Карл', 'Eric Carle', [3, 6], ['animals', 'funny'], '#7da638',
    'Книжка с дырочками, которую обожают малыши во всём мире!', 'A book with holes that toddlers around the world adore!', '/covers/DP-0009.webp'),
  B('winter-book', 'Зимняя книга', 'Winter', 'Ротраут Сюзанна Бернер', 'Rotraut Susanne Berner', [3, 7], ['real', 'adventure'], '#4a89dc',
    'В Городке наступила зима! Ищи птичек, санки и тайные истории на каждом развороте.', 'Winter has arrived in Town! Spot birds, sledges, and secret stories on every spread.', '/covers/DP-0013.webp'),
  B('gnome-fox', 'Гном и лис', 'The Tomten and the Fox', 'Астрид Линдгрен', 'Astrid Lindgren', [4, 8], ['magic', 'friends', 'animals'], '#8a422d',
    'Добрый рождественский гном делится кашей с голодным лисом.', 'A kind Christmas gnome shares porridge with a hungry fox.', '/covers/DP-1280.webp'),
  B('moomin-winter', 'Зима Муми-тролля', 'Moominland Midwinter', 'Туве Янссон', 'Tove Jansson', [7, 12], ['magic', 'adventure'], '#2e5b88',
    'Муми-тролль проснулся среди зимы, когда весь дом ещё спал...', 'Moomintroll wakes up in the middle of winter when the rest of the house is fast asleep...', '/covers/DP-0413.webp'),
];

export const AGE_GROUPS = { little: [3, 6], middle: [7, 10], big: [11, 13], teen: [14, 18] };

export const bookById = (id) => BOOKS.find((b) => b.id === id);

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
