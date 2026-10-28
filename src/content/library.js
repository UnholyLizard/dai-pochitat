// Everything the library team edits lives in src/content/.
// Hours, place, links and terms are the library's own announcement. The same facts are
// mirrored in index.html (JSON-LD, fallback copy) and public/llms.txt — update them together.

export const LIBRARY = {
  address: { ru: 'Школа-сад «Компас», ул. Шчепана Малога, 38, Бар, Черногория', en: 'Kompas school-garden, Šćepana Malog 38, Bar, Montenegro' },
  mapsUrl: 'https://maps.app.goo.gl/hJyy1JqJqxksjpZc6',
  hours: [
    { days: { ru: 'Вт и Пт', en: 'Tue & Fri' }, time: { ru: '14:00–16:30', en: '2:00–4:30 pm' } },
  ],
  // The library's own channels.
  contacts: [
    { label: 'find.fbGroup', href: 'https://www.facebook.com/groups/daipochitat', icon: 'i-facebook' },
    { label: 'find.telegram', href: 'https://t.me/daipochitat', icon: 'i-telegram' },
    { label: 'find.instagram', href: 'https://www.instagram.com/daipochitatmne/', icon: 'i-instagram' },
  ],
  // Questions and terms of use go to the owner.
  owner: {
    contacts: [
      { label: 'find.ownerFacebook', href: 'https://www.facebook.com/klevushkina', icon: 'i-facebook' },
      { label: 'find.ownerTelegram', href: 'https://t.me/mumitrolling', icon: 'i-telegram' },
      { label: 'find.viber', href: 'viber://chat?number=%2B38268621840', icon: 'i-viber' },
    ],
  },
  // Books are returned within one calendar month, on the library's opening days.
  // The book count is not in the announcement; kept from the previous draft.
  loan: { books: 2 },
  secretWord: { ru: 'СПУНК', en: 'SPUNK' },
};
