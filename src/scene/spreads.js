// What pops up on each spread. Units: s = distance from the spine (0…1.5),
// z = depth on the page (−1 far … +1 near), h = height. Back layers rise first.
// page: 'L' | 'R'. action: what a click does. critter: a collectible hiding there.
// candidate: one of the casting candidates — only the one the reader picked stands on stage.
import { LIBRARIANS } from '../content/librarians.js';

// Standee heights on the casting stage: cats are shorter than captains.
const STAGE_H = { ginger: 1.0, cinder: 0.78, patches: 0.82, mila: 1.12, nika: 1.06, tim: 0.98, marko: 1.08, bookmark: 0.96 };

export const SPREADS = [
  null, // 0: the closed cover
  {
    key: 'house',
    ground: 'ground-house',
    layers: [
      { art: 'sun', page: 'L', s: 0.95, z: -0.98, h: 0.42, lift: 1.02, sway: 0.012, action: 'seesaw', pair: 'cloud' },
      { art: 'cypress', page: 'L', s: 1.18, z: -0.74, h: 1.25, sway: 0.012 },
      { art: 'olive', page: 'L', s: 0.55, z: -0.36, h: 1.02, sway: 0.016, delay: 0.08 },
      { art: 'critter-owl', page: 'L', s: 0.38, z: -0.27, h: 0.22, lift: 0.58, critter: 'owl', delay: 0.2 },
      { art: 'kids-grass', page: 'L', s: 0.86, z: 0.58, h: 0.62, delay: 0.22, action: 'think' },
      { art: 'mountains', page: 'R', s: 0.72, z: -0.95, h: 0.56 },
      { art: 'cloud', page: 'R', s: 1.08, z: -0.97, h: 0.28, lift: 0.98, sway: 0.01, action: 'seesaw', pair: 'sun' },
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
      { art: 'critter-mouse', page: 'L', s: 1.32, z: 0.56, h: 0.28, critter: 'mouse', delay: 0.26 },
      { art: 'bookshelf', page: 'R', s: 0.7, z: -0.8, h: 1.4 },
      { art: 'kids-cushions', page: 'R', s: 0.76, z: 0.16, h: 0.74, delay: 0.18, action: 'think' },
    ],
  },
  {
    key: 'casting',
    ground: 'ground-stage',
    layers: [
      { art: 'spotlight', page: 'L', s: 1.14, z: -0.66, h: 1.18, lean: 0.05 },
      { art: 'director-chair', page: 'L', s: 0.58, z: -0.08, h: 0.68, delay: 0.1 },
      { art: 'critter-parrot', page: 'L', s: 0.95, z: 0.5, h: 0.32, critter: 'parrot', delay: 0.24 },
      { art: 'stage-arch', page: 'R', s: 0.75, z: -0.92, h: 1.32 },
      ...LIBRARIANS.map((l) => ({
        art: `${l.id}-stage`, id: `cand-${l.id}`, candidate: l.id, page: 'R', s: 0.75, z: -0.42,
        h: STAGE_H[l.id] ?? 1, action: 'audition', hopHeight: 0.22, delay: 0.12,
      })),
    ],
  },
  {
    key: 'chest',
    ground: 'ground-chest',
    layers: [
      { art: 'palm', page: 'L', s: 1.22, z: -0.84, h: 1.28, sway: 0.014 },
      { art: 'horse', page: 'L', s: 0.72, z: -0.42, h: 0.9, action: 'horse', hopHeight: 0.5, delay: 0.1 },
      { art: 'coin-pile', page: 'L', s: 0.52, z: 0.46, h: 0.36, delay: 0.22 },
      { art: 'ginger-chest', id: 'ginger', page: 'R', s: 0.72, z: -0.26, h: 1.6, action: 'librarian', hopHeight: 0.3, delay: 0.06 },
      { art: 'critter-dragon', page: 'R', s: 1.28, z: 0.44, h: 0.4, critter: 'dragon', delay: 0.24 },
    ],
  },
  {
    key: 'events',
    ground: 'ground-party',
    layers: [
      { art: 'bunting', page: 'L', s: 0.75, z: -0.96, h: 0.42, lift: 0.95, tabOverlap: 0.16, sway: 0.016, flipX: true, lean: 0.05 },
      { art: 'balloons', page: 'L', s: 0.95, z: -0.62, h: 1.08, sway: 0.03, action: 'float' },
      { art: 'gifts', page: 'L', s: 0.5, z: 0.24, h: 0.5, delay: 0.16 },
      { art: 'critter-hedgehog', page: 'L', s: 1.24, z: 0.56, h: 0.28, critter: 'hedgehog', delay: 0.26 },
      { art: 'bunting', page: 'R', s: 0.75, z: -0.96, h: 0.42, lift: 0.95, tabOverlap: 0.16, sway: 0.016, lean: 0.09 },
      { art: 'cake', page: 'R', s: 0.7, z: -0.22, h: 0.92, action: 'cake', hopHeight: 0.18, delay: 0.08 },
      { art: 'ginger-read', page: 'R', s: 0.86, z: 0.5, h: 0.68, delay: 0.22, action: 'think' },
    ],
  },
  {
    key: 'find',
    ground: 'ground-map',
    layers: [
      { art: 'palm', page: 'L', s: 1.2, z: -0.62, h: 1.2, sway: 0.014 },
      { art: 'signpost', page: 'L', s: 0.52, z: -0.12, h: 0.82, delay: 0.1, action: 'spin' },
      { art: 'critter-cat', page: 'L', s: 1.0, z: 0.56, h: 0.32, critter: 'cat', delay: 0.24 },
      { art: 'harbour', page: 'R', s: 0.66, z: -0.92, h: 0.74 },
      { art: 'house', id: 'house-small', page: 'R', s: 1.12, z: -0.05, h: 0.66, delay: 0.08 },
      { pin: true, id: 'pin', page: 'R', s: 1.12, z: 0.0, h: 0.24, lift: 0.74, delay: 0.3 },
      { art: 'sailboat', page: 'R', s: 0.42, z: 0.72, h: 0.54, sway: 0.03, delay: 0.18, action: 'wave' },
    ],
  },
];

export const ALL_ART = [...new Set(SPREADS.flatMap((s) => s?.layers.map((l) => l.art).filter(Boolean) ?? []))];
