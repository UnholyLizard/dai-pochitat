// Collectibles and achievements. Names and facts are in the i18n dictionaries.

export const CRITTERS = [
  { id: 'owl', art: 'critter-owl', chapter: 'house', hint: { ru: 'Кто-то ухает в оливковом дереве у жёлтого дома.', en: 'Something is hooting in the olive tree by the yellow house.' } },
  { id: 'mouse', art: 'critter-mouse', chapter: 'room', hint: { ru: 'В комнате, у кресла, кто-то шуршит и пахнет свечкой.', en: 'Something by the armchair is rustling and smells of candles.' } },
  { id: 'dragon', art: 'critter-dragon', chapter: 'chest', hint: { ru: 'Возле моего сундука кто-то пыхтит дымом!', en: 'Someone near my chest is puffing smoke!' } },
  { id: 'parrot', art: 'critter-parrot', chapter: 'casting', hint: { ru: 'На кастинге кто-то подсказывает слова — у режиссёрского кресла.', en: 'At the casting someone is prompting lines — by the director’s chair.' } },
  { id: 'hedgehog', art: 'critter-hedgehog', chapter: 'events', hint: { ru: 'На празднике, у подарков, прячется кто-то колючий.', en: 'Someone prickly is hiding by the presents.' } },
  { id: 'cat', art: 'critter-cat', chapter: 'find', hint: { ru: 'На карте, у самого моря, кто-то дремлет.', en: 'On the map, by the sea, someone’s napping.' } },
  { id: 'badger', art: 'critter-badger', chapter: 'end', hint: { ru: 'Загляни в самый низ — там кто-то пьёт чай.', en: 'Look at the very bottom — someone’s having tea.' } },
];

// ink: stamp colour in the reader's card
export const STAMPS = [
  { id: 'open', ink: '#1f4dd8' },
  { id: 'chat', ink: '#c94a30' },
  { id: 'jury', ink: '#d9667e' },
  { id: 'oracle', ink: '#6f8f3a' },
  { id: 'night', ink: '#7d5bbf' },
  { id: 'candles', ink: '#d9667e' },
  { id: 'strong', ink: '#2b1b12' },
  { id: 'riddle', ink: '#2f8a84' },
  { id: 'polyglot', ink: '#1f4dd8' },
  { id: 'named', ink: '#c94a30' },
  { id: 'upside', ink: '#7d5bbf' },
  { id: 'tracker', ink: '#6f8f3a' },
  { id: 'finish', ink: '#2b1b12' },
  { id: 'installed', ink: '#2f8a84' },
];

// Coins needed for each rank (rank.0 … rank.4). Max coins = 7 critters + 14 stamps = 21,
// so the top rank never requires installing the app (not every browser can).
export const RANKS = [0, 3, 7, 12, 18];
