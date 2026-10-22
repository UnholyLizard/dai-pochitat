import * as THREE from 'three';
import meta from './art-meta.json';
import { artUrl } from '../lib/core.js';

const cache = new Map();
let maxAnisotropy = 4;

export const setAnisotropy = (n) => { maxAnisotropy = n; };

/** Fetch + decode off the main thread (ImageBitmap), so big WebPs don't stall scrolling. */
async function bitmap(src, flip) {
  const blob = await (await fetch(src)).blob();
  return createImageBitmap(blob, { imageOrientation: flip ? 'flipY' : 'from-image', premultiplyAlpha: 'none' });
}

/**
 * Loads one illustration as a texture plus a tiny alpha mask for pixel-accurate picking.
 * @returns {Promise<{ id: string, texture: THREE.Texture, aspect: number, hit: (u: number, v: number) => boolean }>}
 */
export function loadArt(id) {
  if (cache.has(id)) return cache.get(id);
  const job = bitmap(artUrl(id), true).then((image) => {
    const texture = new THREE.Texture(image);
    texture.flipY = false; // already flipped while decoding
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    texture.needsUpdate = true;
    const { w, h } = meta[id] ?? { w: image.width, h: image.height };

    const MW = 64, MH = Math.max(8, Math.round((64 * h) / w));
    const c = document.createElement('canvas');
    c.width = MW; c.height = MH;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, MW, MH);
    const alpha = ctx.getImageData(0, 0, MW, MH).data;
    // The bitmap is stored upside down, so row 0 is v = 0.
    const hit = (u, v) => {
      const x = Math.min(MW - 1, Math.max(0, Math.floor(u * MW)));
      const y = Math.min(MH - 1, Math.max(0, Math.floor(v * MH)));
      return alpha[(y * MW + x) * 4 + 3] > 110;
    };
    return { id, texture, aspect: w / h, hit };
  });
  cache.set(id, job);
  return job;
}

/** Decoded image for drawing into canvases. */
export const loadImage = (src) => bitmap(src, false);
