// Everything the library team edits lives in src/content/.
// ⚠ PLACEHOLDERS — hours, links and email below are made up for the concept.

export const LIBRARY = {
  address: { ru: 'Школа-сад «Компас», Бар, Черногория', en: 'Kompas school-garden, Bar, Montenegro' },
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Kompas school Bar Montenegro'),
  hours: [
    { days: { ru: 'Пн, ср, пт', en: 'Mon, Wed, Fri' }, time: { ru: '14:00–18:00', en: '2–6 pm' } },
    { days: { ru: 'Суббота', en: 'Saturday' }, time: { ru: '11:00–14:00', en: '11 am–2 pm' } },
  ],
  contacts: [
    { kind: 'telegram', href: 'https://t.me/', icon: 'i-telegram' },
    { kind: 'instagram', href: 'https://instagram.com/', icon: 'i-instagram' },
    { kind: 'email', href: 'mailto:hello@example.com', icon: 'i-mail' },
  ],
  loan: { books: 2, weeks: 2 },
  secretWord: { ru: 'СПУНК', en: 'SPUNK' },
};
