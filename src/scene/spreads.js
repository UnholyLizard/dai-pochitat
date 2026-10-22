// What pops up on each spread. Units: s = distance from the spine (0…1.5),
// z = depth on the page (−1 far … +1 near), h = height. Back layers rise first.
// page: 'L' | 'R'. action: what a click does. critter: a collectible hiding there.

export const SPREADS = [
  null, // 0: the closed cover
  {
    key: 'house',
    ground: 'ground-house',
    layers: [
      { art: 'sun', page: 'L', s: 0.95, z: -0.98, h: 0.42, lift: 1.02, sway: 0.012 },
      { art: 'cypress', page: 'L', s: 1.18, z: -0.74, h: 1.25, sway: 0.012 },
      { art: 'olive', page: 'L', s: 0.55, z: -0.36, h: 1.02, sway: 0.016, delay: 0.08 },
      { art: 'critter-owl', page: 'L', s: 0.38, z: -0.27, h: 0.22, lift: 0.58, critter: 'owl', delay: 0.2 },
      { art: 'kids-grass', page: 'L', s: 0.86, z: 0.42, h: 0.5, delay: 0.22 },
      { art: 'mountains', page: 'R', s: 0.72, z: -0.95, h: 0.56 },
      { art: 'cloud', page: 'R', s: 1.08, z: -0.97, h: 0.28, lift: 0.98, sway: 0.01 },
      { art: 'house', page: 'R', s: 0.8, z: -0.34, h: 1.32, lean: 0.05, delay: 0.1 },
    ],
  },
  {
    key: 'room',
    ground: 'ground-room',
    layers: [
      { art: 'window', page: 'L', s: 0.82, z: -0.86, h: 1.28 },
      { art: 'lamp', page: 'L', s: 0.28, z: -0.42, h: 1.22, action: 'night', delay: 0.1 },
      { art: 'armchair', page: 'L', s: 0.94, z: -0.06, h: 0.68, delay: 0.16 },
      { art: 'critter-mouse', page: 'L', s: 1.32, z: 0.56, h: 0.2, critter: 'mouse', delay: 0.26 },
      { art: 'bookshelf', page: 'R', s: 0.7, z: -0.8, h: 1.4 },
      { art: 'kids-cushions', page: 'R', s: 0.76, z: 0.16, h: 0.6, delay: 0.18 },
    ],
  },
  {
    key: 'chest',
    ground: 'ground-chest',
    layers: [
      { art: 'palm', page: 'L', s: 1.22, z: -0.84, h: 1.28, sway: 0.014 },
      { art: 'horse', page: 'L', s: 0.72, z: -0.42, h: 0.9, action: 'horse', hopHeight: 0.5, delay: 0.1 },
      { art: 'coin-pile', page: 'L', s: 0.52, z: 0.46, h: 0.36, delay: 0.22 },
      { art: 'pippi-chest', id: 'pippi', page: 'R', s: 0.72, z: -0.26, h: 1.6, action: 'pippi', hopHeight: 0.3, delay: 0.06 },
      { art: 'critter-dragon', page: 'R', s: 1.28, z: 0.44, h: 0.3, critter: 'dragon', delay: 0.24 },
    ],
  },
  {
    key: 'events',
    ground: 'ground-party',
    layers: [
      { art: 'balloons', page: 'L', s: 0.95, z: -0.62, h: 1.3, sway: 0.03 },
      { art: 'gifts', page: 'L', s: 0.5, z: 0.24, h: 0.5, delay: 0.16 },
      { art: 'critter-hedgehog', page: 'L', s: 1.24, z: 0.56, h: 0.2, critter: 'hedgehog', delay: 0.26 },
      { art: 'bunting', page: 'R', s: 0.75, z: -0.96, h: 0.42, lift: 0.95, sway: 0.016 },
      { art: 'cake', page: 'R', s: 0.7, z: -0.22, h: 0.92, action: 'cake', hopHeight: 0.18, delay: 0.08 },
      { art: 'pippi-read', page: 'R', s: 0.86, z: 0.5, h: 0.42, delay: 0.22 },
    ],
  },
  {
    key: 'find',
    ground: 'ground-map',
    layers: [
      { art: 'palm', page: 'L', s: 1.2, z: -0.62, h: 1.2, sway: 0.014 },
      { art: 'signpost', page: 'L', s: 0.52, z: -0.12, h: 0.82, delay: 0.1 },
      { art: 'critter-cat', page: 'L', s: 1.0, z: 0.56, h: 0.22, critter: 'cat', delay: 0.24 },
      { art: 'harbour', page: 'R', s: 0.66, z: -0.92, h: 0.74 },
      { art: 'house', id: 'house-small', page: 'R', s: 1.12, z: -0.05, h: 0.66, delay: 0.08 },
      { pin: true, id: 'pin', page: 'R', s: 1.12, z: 0.0, h: 0.24, lift: 0.74, delay: 0.3 },
      { art: 'sailboat', page: 'R', s: 0.42, z: 0.72, h: 0.4, sway: 0.03, delay: 0.18 },
    ],
  },
];

export const ALL_ART = [...new Set(SPREADS.flatMap((s) => s?.layers.map((l) => l.art).filter(Boolean) ?? []))];
