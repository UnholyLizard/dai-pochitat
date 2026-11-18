// The SHOTS table of the «Дай почитать!» film (options: see capture.cjs). Shot times are on the score's beat grid
// (100 BPM, 0.6 s a beat): a segment that starts on a bar line keeps its clicks on beats.
module.exports = ({ track, path2, at, PARK, DESKTOP, MOBILE }) => {
  // The reader's card as it stands when a later shot begins (coins and stamps continue from the shots before it).
  const card = (stamps, found, vote = null, librarian = 'ginger') => ({
    v: 1, coins: stamps.length + found.length, name: '', wish: [], solved: [], cardNo: '2610', visits: 1, lastVisit: Date.UTC(2026, 9, 24, 14, 0, 0),
    stamps: Object.fromEntries(stamps.map((s) => [s, 1])), found: Object.fromEntries(found.map((s) => [s, 1])), librarian, vote, voter: '00000000-0000-4000-8000-000000000000',
  });
  const parked = () => ({ x: PARK[0], y: PARK[1] });

  return {
    // lab: each chapter at rest (recon; not in the film)
    recon: { vp: DESKTOP, dur: 1, pre: 1, settle: 1, setup: `return H.stops();`, mouse: parked },

    // 1–3. One take, film 2.4 → 19.2 s (shot t = film − 2.4). The closed book on the sunlit table sways after the
    // pointer; scrolling opens the cover and the yellow house stands up (the first stamp, a coin flies to the card);
    // a tap finds the owl; the page turns to the reading room; a tap on the paper lamp makes it evening (film 14.4,
    // bar 7); a tap finds the mouse by the armchair.
    book: {
      vp: DESKTOP, dur: 17.0, pre: 1, settle: 1.4,
      setup: `window.__dpGame.reset(); const s = H.stops(); return { house: s.house, room: s.room };`,
      scroll: (t, d) => track([[0, 0], [5.0, 0], [7.15, d.house, 'inOutCubic'], [9.3, d.house], [11.25, d.room, 'inOutCubic'], [17, d.room]])(t),
      measure: [[7.4, 'owl', `H.layer('critter-owl', 0.55)`], [11.6, 'lamp', `H.layer('lamp', 0.8)`], [13.9, 'mouse', `H.layer('critter-mouse', 0.5)`]],
      mouse: (t, d) => {
        const owl = d.owl || { x: 946, y: 385 }, lamp = d.lamp || { x: 968, y: 310 }, ms = d.mouse || { x: 735, y: 588 };
        return path2([[0, 470, 640], [0.5, 470, 640], [2.4, 1010, 430, 'inOutSine'], [3.9, 1130, 520, 'inOutSine'], [5.0, 1100, 560, 'inOutSine'], [7.1, 1090, 600, 'inOutSine'],
          [7.6, owl.x, owl.y, 'inOutSine'], [7.95, owl.x, owl.y], [9.2, 1020, 590, 'inOutSine'], [11.2, 1040, 560, 'inOutSine'],
          [11.8, lamp.x, lamp.y, 'inOutSine'], [12.15, lamp.x, lamp.y], [13.4, 1010, 520, 'inOutSine'], [14.2, ms.x, ms.y, 'inOutSine'], [14.55, ms.x, ms.y],
          [17, 900, 560, 'inOutSine']])(t);
      },
      clicks: [7.8, 12.0, 14.4],
      cursor: [0.3, 17],
      log: `({ y: H.y(), B: +S.B.toFixed(2), theme: document.documentElement.dataset.theme, coins: window.__dpGame.state.coins, toasts: document.querySelectorAll('.toast').length })`,
    },

    // 4. Casting, film 19.2 → 26.4 (bars 9–11). Cinder the cat is picked (hops onto the puppet stage), a tap on the
    // cat brings another line, the vote goes in and the tally appears (film 24.0, bar 11).
    casting: {
      vp: DESKTOP, dur: 7.6, pre: 1, settle: 1.4, game: card(['open', 'night', 'finish'], ['owl', 'mouse']),
      setup: `const y = H.stop('casting'); H.to(y); return { y };`,
      after: `return { cin: H.rect(document.querySelector('.cand input[value="cinder"]').closest('label')), vote: H.rect('[data-cast-vote]') };`,
      scroll: (t, d) => d.y + (d.grow ? track([[4.95, 0], [5.9, d.grow, 'inOutCubic']])(t) : 0),
      measure: [[2.0, 'cat', `H.layer('cand-cinder', 0.6)`], [4.3, 'vote', `H.rect('[data-cast-vote]')`],
        [4.92, 'grow', `(() => { const c = document.querySelector('#casting .card').getBoundingClientRect(); return Math.max(0, Math.round(c.bottom - (innerHeight - 40))); })()`]],
      mouse: (t, d) => {
        const cat = d.cat || { x: 1150, y: 330 };
        return path2([[0, 760, 660], [0.4, 760, 660], [1.0, ...at(d.cin, 0, -8), 'inOutSine'], [1.35, ...at(d.cin, 0, -8)], [2.15, cat.x, cat.y, 'inOutSine'], [2.6, cat.x, cat.y],
          [4.3, ...at(d.vote, -8, 2), 'inOutSine'], [4.95, ...at(d.vote, -8, 2)], [6.2, 860, 600, 'inOutSine'], [7.6, 880, 620, 'inOutSine']])(t);
      },
      clicks: [1.2, 2.4, 4.8],
      cursor: [0.2, 7.6],
      log: `({ cand: S.candidate, vote: window.__dpGame.state.vote, tally: !!document.querySelector('.tally') })`,
    },

    // 5. The magic chest, film 26.4 → 30.6 (bar 12 to bar 13, beat 3): "magical" is picked, "Open the chest!" brings a book from the
    // live catalogue and coins burst from the pop-up.
    chest: {
      vp: DESKTOP, dur: 4.6, pre: 1, settle: 1.4, game: card(['open', 'night', 'jury', 'finish'], ['owl', 'mouse'], 'cinder', 'cinder'),
      setup: `const y = H.stop('chest'); H.to(y); return { y };`,
      after: `return { magic: H.rect(document.querySelector('[data-oracle] input[value="magic"]').closest('label')), go: H.rect('[data-oracle] button[type=submit]') };`,
      scroll: (t, d) => d.y + (d.grow ? track([[1.35, 0], [2.3, d.grow, 'inOutCubic']])(t) : 0),
      measure: [[1.32, 'grow', `(() => { const c = document.querySelector('[data-oracle-result]').getBoundingClientRect(); return Math.max(0, Math.round(c.bottom - (innerHeight - 60))); })()`]],
      mouse: (t, d) => path2([[0, 700, 700], [0.15, 700, 700], [0.5, ...at(d.magic, 4, 1), 'inOutSine'], [0.72, ...at(d.magic, 4, 1)], [1.1, ...at(d.go, -30, 2), 'inOutSine'], [1.35, ...at(d.go, -30, 2)],
        [2.6, 760, 640, 'inOutSine'], [4.6, 800, 660, 'inOutSine']])(t),
      clicks: [0.6, 1.2],
      cursor: [0.1, 4.6],
      log: `({ book: (document.querySelector('[data-oracle-result] h3') || {}).textContent, coins: window.__dpGame.state.coins })`,
    },

    // 6. The librarian, film 30.6 → 36.6: the chat opens beside the party spread (film 31.2, bar 14) and the candidate the
    // reader voted for answers in their own voice (Cinder the cat); "A riddle!" is tapped (film 34.2) and the riddle comes.
    chat: {
      vp: DESKTOP, dur: 6.4, pre: 1, settle: 1.4, game: card(['open', 'night', 'jury', 'finish', 'oracle'], ['owl', 'mouse'], 'cinder', 'cinder'),
      setup: `const y = H.stop('events'); H.to(y); return { y };`,
      after: `return { fab: H.rect('.librarian-fab') };`,
      scroll: (t, d) => d.y,
      measure: [[3.42, 'chip', `(() => { const c = [...document.querySelectorAll('[data-chat-chips] button')].find((b) => /riddle/i.test(b.textContent)); return c ? H.rect(c) : null; })()`]],
      mouse: (t, d) => {
        const chip = d.chip || { x: 1100, y: 760 };
        return path2([[0, 980, 620], [0.1, 980, 620], [0.5, ...at(d.fab, -6, 4), 'inOutSine'], [0.75, ...at(d.fab, -6, 4)], [2.2, 1000, 640, 'inOutSine'], [3.42, 1010, 650, 'inOutSine'], [3.56, chip.x, chip.y, 'inOutSine'],
          [3.8, chip.x, chip.y], [5.0, 1000, 600, 'inOutSine'], [6.4, 990, 590, 'inOutSine']])(t);
      },
      clicks: [0.6, 3.6],
      cursor: [0.1, 6.4],
      log: `({ open: document.querySelector('#librarian').matches(':popover-open'), msgs: document.querySelectorAll('#librarian .msg').length, chips: document.querySelectorAll('[data-chat-chips] button').length })`,
    },

    // 7. The catalogue, film 36.6 → 40.8 (the card opens at film 39.0): a search is typed, the shelf narrows, a book opens.
    catalog: {
      vp: DESKTOP, dur: 4.6, pre: 2.5, settle: 1.0, route: 'catalog/', book: false,
      after: `return { q: H.rect('.catalog-search-input') };`,
      measure: [[1.95, 'card', `(() => { const c = document.querySelector('.catalog-card'); return c ? H.rect(c) : null; })()`]],
      mouse: (t, d) => {
        const c = d.card || { x: 700, t: 400 };
        return path2([[0, 700, 430], [0.05, 700, 430], [0.28, d.q.l + 150, d.q.y + 2, 'inOutSine'], [1.4, d.q.l + 190, d.q.y + 6], [2.2, c.x, c.t + 130, 'inOutSine'], [2.5, c.x, c.t + 130],
          [3.6, 1010, 600, 'inOutSine'], [4.6, 1030, 610, 'inOutSine']])(t);
      },
      clicks: [0.3, 2.4],
      typing: [[0.48, 1.08, 'dragon']],
      cursor: [0.03, 4.6],
      log: `({ cards: document.querySelectorAll('.catalog-card').length, drawer: !document.getElementById('book-drawer').hidden, status: (document.querySelector('[data-catalog-status]') || {}).textContent })`,
    },

    // 8. Phone, film 40.8 → 45.6 (bars 18–19): the book sits above the text, the cover opens under the thumb, a tap on
    // the coin counter opens the reader's card (film 43.2, bar 19).
    mobile: {
      vp: MOBILE, dur: 5.2, pre: 1, settle: 1.4, game: card(['open', 'night', 'jury', 'finish', 'oracle', 'chat'], ['owl', 'mouse'], 'cinder', 'cinder'),
      setup: `const s = H.stops(); return { house: s.house };`,
      after: `return { coins: H.rect('.hud__coins') };`,
      scroll: (t, d) => track([[0, 0], [0.25, 0], [2.0, d.house, 'inOutCubic'], [5.2, d.house]])(t),
      mouse: (t, d) => ({ x: d.coins.x, y: d.coins.y }),
      clicks: [2.4],
      perFrame: (t) => (t > 3.5 ? `const p = document.querySelector('#passport'); if (p && p.open) { const sc = p.scrollHeight > p.clientHeight ? p : (p.querySelector('[data-passport]') || p); sc.scrollTop = ${Math.round(track([[3.5, 0], [4.9, 300, 'inOutCubic']])(t))}; }` : ''),
      log: `({ y: H.y(), B: +S.B.toFixed(2), pass: document.getElementById('passport').open })`,
    },
  };
};
