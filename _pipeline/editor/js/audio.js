// Audio track engine for Stage Editor: synchronizes soundtrack playback with
// stage preview and timeline scrubbing, handles looping, volume, mute, and track configuration.
import { on, emit } from './util.js';
import { S, duration } from './store.js';

let audioEl = null;
let currentSrc = null;
let muted = false;
let volume = 1.0;
const DRIFT_THRESHOLD = 0.08; // re-sync if audio drifts from playhead by > 80ms

// Resolve an audio track's URL from its sequence specification
export function resolveAudioUrl(src) {
  if (!src) return '';
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) return src;
  return `/files/${src.replace(/^\/+/, '')}`;
}

export function getAudioTrack() {
  const au = S.seq && S.seq.audio;
  if (!au) return null;
  if (typeof au === 'string') return { src: au, t0: 0, offset: 0, volume: 1, mute: false };
  return {
    src: au.src || '',
    t0: au.t0 || 0,
    offset: au.offset || 0,
    dur: au.dur || null,
    volume: au.volume != null ? au.volume : 1,
    mute: !!au.mute,
  };
}

export function isMuted() {
  return muted;
}

export function toggleMute(force) {
  setMuted(force != null ? force : !muted);
}

export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem('stage-editor:muted', muted ? '1' : '0'); } catch {}
  applyAudioVolume();
  emit('audio-mute', muted);
}

export function getVolume() {
  return volume;
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem('stage-editor:volume', String(volume)); } catch {}
  applyAudioVolume();
  emit('audio-volume', volume);
}

function applyAudioVolume() {
  if (!audioEl) return;
  const track = getAudioTrack();
  if (muted || (track && track.mute)) {
    audioEl.volume = 0;
    audioEl.muted = true;
  } else {
    audioEl.muted = false;
    audioEl.volume = volume * (track && track.volume != null ? track.volume : 1);
  }
}

// Convert global sequence playhead time S.t to audio file currentTime
function playheadToAudioTime(t) {
  const track = getAudioTrack();
  if (!track || !track.src) return -1;
  const t0 = track.t0 || 0;
  const off = track.offset || 0;
  if (t < t0) return -1;
  const aTime = t - t0 + off;
  if (track.dur != null && aTime > off + track.dur) return -1;
  return aTime;
}

export function initAudio() {
  audioEl = new Audio();
  audioEl.preload = 'auto';

  try {
    muted = localStorage.getItem('stage-editor:muted') === '1';
    const savedVol = localStorage.getItem('stage-editor:volume');
    if (savedVol != null) volume = parseFloat(savedVol) || 1.0;
  } catch {}

  applyAudioVolume();

  // Keep track source in sync when sequence changes
  on('change', () => syncTrackSource());
  syncTrackSource();

  // Play / pause handling
  on('play', (playing) => {
    if (!audioEl) return;
    const track = getAudioTrack();
    if (!track || !track.src) return;

    if (playing) {
      applyAudioVolume();
      const aTime = playheadToAudioTime(S.t);
      if (aTime >= 0 && (!audioEl.duration || aTime < audioEl.duration)) {
        try {
          audioEl.currentTime = aTime;
        } catch {}
        audioEl.play().catch(() => {
          // Autoplay policy or media unready: will play on user interaction
        });
      } else {
        audioEl.pause();
      }
    } else {
      audioEl.pause();
    }
  });

  // Time updates during playback or manual scrubbing
  on('time', (src) => {
    if (!audioEl) return;
    const track = getAudioTrack();
    if (!track || !track.src) return;

    const aTime = playheadToAudioTime(S.t);
    if (aTime < 0 || (audioEl.duration && aTime >= audioEl.duration)) {
      if (!audioEl.paused) audioEl.pause();
      return;
    }

    if (src === 'play') {
      // During active playback: resume if we just crossed t0, and correct any clock drift
      if (audioEl.paused && S.playing) {
        try { audioEl.currentTime = aTime; } catch {}
        audioEl.play().catch(() => {});
      } else if (!audioEl.paused) {
        const drift = Math.abs(audioEl.currentTime - aTime);
        if (drift > DRIFT_THRESHOLD) {
          try { audioEl.currentTime = aTime; } catch {}
        }
      }
    } else {
      // Scrubbing / seeking while paused
      try { audioEl.currentTime = aTime; } catch {}
    }
  });
}

function syncTrackSource() {
  if (!audioEl) return;
  const track = getAudioTrack();
  if (!track || !track.src) {
    if (currentSrc) {
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.load();
      currentSrc = null;
    }
    return;
  }

  const url = resolveAudioUrl(track.src);
  if (url !== currentSrc) {
    currentSrc = url;
    const wasPlaying = !audioEl.paused;
    audioEl.src = url;
    applyAudioVolume();
    const aTime = playheadToAudioTime(S.t);
    if (aTime >= 0) {
      try { audioEl.currentTime = aTime; } catch {}
    }
    if (wasPlaying && S.playing) {
      audioEl.play().catch(() => {});
    }
  } else {
    applyAudioVolume();
  }
}
