import { prefs, $ } from '../lib/core.js';

// Every sound is synthesised on the fly — no audio files to download.
let ctx = null;
let enabled = prefs.get('sound', true);

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Browsers only allow audio after a user gesture.
addEventListener('pointerdown', () => enabled && ac(), { once: true, capture: true });

function tone({ freq, to = freq, dur = 0.15, type = 'sine', gain = 0.12, delay = 0 }) {
  const a = enabled && ctx && ctx.state === 'running' ? ctx : null;
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.3, from = 900, to = 2600, gain = 0.06, q = 0.9 }) {
  const a = enabled && ctx && ctx.state === 'running' ? ctx : null;
  if (!a) return;
  const len = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, a.currentTime);
  f.frequency.exponentialRampToValueAtTime(to, a.currentTime + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

export const sfx = {
  coin() { tone({ freq: 988, dur: 0.08, type: 'square', gain: 0.05 }); tone({ freq: 1319, dur: 0.32, type: 'square', gain: 0.05, delay: 0.07 }); },
  chime() { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.4, type: 'triangle', gain: 0.08, delay: i * 0.08 })); },
  page() { noise({ dur: 0.32, from: 700, to: 2800, gain: 0.05 }); },
  pop() { tone({ freq: 420, to: 140, dur: 0.14, gain: 0.12 }); },
  stamp() { tone({ freq: 140, to: 60, dur: 0.18, gain: 0.2 }); noise({ dur: 0.08, from: 2000, to: 800, gain: 0.05 }); },
  pluck() { tone({ freq: 784, to: 760, dur: 0.18, type: 'triangle', gain: 0.07 }); },
  click() { tone({ freq: 1800, to: 1200, dur: 0.04, type: 'square', gain: 0.03 }); },
  party() { noise({ dur: 0.5, from: 400, to: 3000, gain: 0.08, q: 2 }); sfx.chime(); },
};

export function initSound() {
  const btn = $('[data-sound-toggle]');
  // The icon is swapped, not hidden: CSS can't reach into an SVG <use> shadow tree.
  const sync = () => {
    btn?.setAttribute('aria-pressed', String(enabled));
    btn?.querySelector('use')?.setAttribute('href', enabled ? '#i-sound-on' : '#i-sound-off');
  };
  sync();
  btn?.addEventListener('click', () => {
    enabled = !enabled;
    prefs.set('sound', enabled);
    sync();
    if (enabled) { ac(); sfx.click(); }
  });
}
