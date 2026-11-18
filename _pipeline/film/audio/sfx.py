# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "scipy", "soundfile"]
# ///
"""Sound effects for the «Дай почитать!» film, placed on the picture: every hit time comes from the sequence
(stage/sequence.json: segment start + the footage time of the click), so sound and picture share one clock.

    MOTION_REEL_SKILL=<skill> uv run _pipeline/film/audio/sfx.py

Paper sounds in the spirit of the site's own synthesized feedback (src/game/sfx.js): page swish, pop, coin, stamp,
chime. Seeded. Writes audio/sfx.wav and ../hits.json (the hit list, for the record and the sync check).
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
FILM = HERE.parent
sys.path.insert(0, str(Path(os.environ["MOTION_REEL_SKILL"]) / "scripts"))
from dsp import *  # noqa: E402,F403

seed(20261113)
SEQ = json.loads((FILM.parent / "stage" / "sequence.json").read_text(encoding="utf8"))
DUR = float(SEQ["duration"])
SEGS = {s["id"]: s for s in SEQ["segments"]}
SEGS[SEQ["phone"]["id"]] = SEQ["phone"]


def T(name, off=0.0):
    """Film time of a sequence anchor (+ offset)."""
    a = SEQ["anchors"][name]
    s = SEGS[a["seg"]]
    return float(s["t0"]) + float(s.get("lead", 0)) + float(a["at"]) - float(s.get("start", 0)) / 60 + off


def S(seg, at):
    """Film time of footage time `at` in a segment."""
    s = SEGS[seg]
    return float(s["t0"]) + float(s.get("lead", 0)) + at - float(s.get("start", 0)) / 60


# ---------------------------------------------------------------- palette
def env(n, a, d):
    t = tvec(n)
    return (1 - np.exp(-t / a)) * np.exp(-t / d)


def click():
    n = int(0.05 * SR); t = tvec(n)
    return (np.sin(2 * np.pi * 1700 * t) * 0.7 + filt(rng.standard_normal(n), "highpass", 3000) * 0.5) * env(n, 0.0005, 0.007)


def key():
    n = int(0.04 * SR); t = tvec(n)
    f = 2300 * float(rng.uniform(0.9, 1.12))
    return (np.sin(2 * np.pi * f * t) * 0.5 + filt(rng.standard_normal(n), "highpass", 4000) * 0.6) * env(n, 0.0004, 0.005)


def pop(f0=540.0):
    n = int(0.16 * SR); t = tvec(n)
    f = f0 * (0.5 + 0.5 * np.exp(-t / 0.035))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return (x + filt(rng.standard_normal(n), "bandpass", [900, 3200]) * 0.25 * np.exp(-t / 0.012)) * env(n, 0.001, 0.045)


def coin():
    n = int(0.75 * SR); t = tvec(n)
    x = np.zeros(n)
    for f, at, g in ((hz("G6"), 0.0, 0.8), (hz("C7"), 0.075, 1.0)):
        k = int(at * SR); tt = t[: n - k]
        x[k:] += g * (np.sin(2 * np.pi * f * tt) + 0.22 * np.sin(2 * np.pi * f * 2.99 * tt) * np.exp(-tt / 0.05)) * (1 - np.exp(-tt / 0.001)) * np.exp(-tt / 0.2)
    return x


def stamp():
    n = int(0.22 * SR); t = tvec(n)
    f = 70 + 90 * np.exp(-t / 0.03)
    thud = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.06)
    slap = filt(rng.standard_normal(n), "bandpass", [500, 2600]) * env(n, 0.001, 0.018) * 0.5
    return thud + slap


def chime(notes=("D6", "F#6", "A6"), gap=0.085):
    n = int(1.5 * SR); t = tvec(n)
    x = np.zeros(n)
    for i, nt in enumerate(notes):
        k = int(i * gap * SR); tt = t[: n - k]; f = hz(nt)
        x[k:] += (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt / 0.2)) * (1 - np.exp(-tt / 0.001)) * np.exp(-tt / 0.45)
    return x / len(notes) ** 0.5


def swish(length=0.9):
    """A page turning: an airy sweep with a little paper crackle on top."""
    n = int(length * SR); p = np.linspace(0, 1, n)
    fc = 500 * (7 ** np.sin(np.pi * p) ** 1.2)
    air = sweep_filter(rng.standard_normal(n), fc, "bandpass", 0.9) * np.sin(np.pi * p) ** 1.6
    crack = filt(rng.standard_normal(n), "highpass", 3500) * (rng.uniform(size=n) > 0.985) * np.sin(np.pi * p) ** 2 * 2.2
    return air + filt(crack, "lowpass", 9000)


def woosh(length=0.7):
    return whoosh(length, 260, 1500, peak=0.62, q=0.9, shape=2.2)


def bloom():
    """The lamp coming on: a warm swell that opens up, with a soft bell on top."""
    x = pad_chord(["D3", "A3", "F#4"], 1.6, cutoff=(350, 1900), attack=0.35, release=0.9, voices=5)
    b = glockish("D5", 1.4)
    x[:, : len(b)] += 0.5 * b
    return x


def glockish(note, length=1.2):
    f = hz(note); n = int(length * SR); t = tvec(n)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.2)) * (1 - np.exp(-t / 0.002)) * np.exp(-t / 0.5)


def blip(up=True):
    n = int(0.09 * SR); t = tvec(n)
    f = np.linspace(760, 980, n) if up else np.linspace(980, 760, n)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.03)


def sparkle(length=0.6, count=9):
    n = int((length + 0.8) * SR)
    x = np.zeros(n)
    scale = ["D6", "F#6", "A6", "B6", "D7", "F#7", "A7"]
    for i in range(count):
        g = glockish(scale[int(rng.integers(len(scale)))], 0.7) * float(rng.uniform(0.4, 1.0))
        k = int(rng.uniform(0, length) * SR)
        x[k:k + len(g)] += g[: n - k]
    return x / 2.2


def scribble(length=0.62):
    n = int(length * SR); t = tvec(n)
    x = filt(rng.standard_normal(n), "bandpass", [1800, 5200])
    return x * (0.55 + 0.45 * np.sin(2 * np.pi * 15 * t)) * np.sin(np.pi * t / length) ** 0.8


def tap():
    n = int(0.07 * SR); t = tvec(n)
    return (np.sin(2 * np.pi * (180 + 160 * np.exp(-t / 0.01)) * t) + filt(rng.standard_normal(n), "lowpass", 1800) * 0.4) * env(n, 0.001, 0.014)


# ---------------------------------------------------------------- the hit list: (time, label, sound, gain, pan, anchor)
# anchor 'peak': the sound's loudest point sits on the time (swishes, whooshes); default: it starts there.
HITS = [
    (0.32, "title letters land", "stamp", 0.30, -0.2, None), (0.62, "title letters land", "stamp", 0.24, 0.0, None), (0.9, "title letters land", "stamp", 0.2, 0.2, None),
    (1.0, "squiggle draws", "scribble", 0.20, 0.1, None),
    (2.95, "browser lands", "woosh", 0.34, 0.2, "peak"),
    (S("book", 5.9), "the cover opens", "swish", 0.36, 0.15, "peak"),
    (S("book", 7.0), "the house stands up; first stamp", "pop", 0.34, 0.2, None), (S("book", 7.02), "first stamp", "stamp", 0.26, 0.2, None), (S("book", 7.12), "coin", "coin", 0.20, 0.3, None),
    (T("owlClick"), "owl found", "click", 0.3, 0.1, None), (T("owlClick", 0.03), "owl found", "pop", 0.34, 0.1, None), (T("owlClick", 0.12), "coin", "coin", 0.22, 0.3, None),
    (S("book", 10.3), "the page turns", "swish", 0.42, 0.1, "peak"), (S("book", 11.25), "the room stands up", "pop", 0.26, 0.2, None),
    (T("lampClick"), "the lamp", "click", 0.36, 0.1, None), (T("lampClick", 0.02), "evening", "bloom", 0.30, 0.0, None), (T("lampClick", 0.2), "night stamp", "coin", 0.18, 0.3, None),
    (T("lampClick", 0.55), "new rank", "chime", 0.20, 0.25, None),
    (T("mouseClick"), "mouse found", "click", 0.28, -0.1, None), (T("mouseClick", 0.03), "mouse found", "pop", 0.30, -0.1, None), (T("mouseClick", 0.12), "coin", "coin", 0.18, 0.3, None),
    (19.2, "cut to the casting", "woosh", 0.20, -0.2, "peak"),
    (T("pickClick"), "Cinder picked", "click", 0.3, -0.4, None), (T("pickClick", 0.1), "the cat hops on stage", "pop", 0.32, 0.35, None),
    (T("catClick"), "another line", "click", 0.28, 0.35, None), (T("catClick", 0.04), "hop", "pop", 0.3, 0.35, None),
    (T("voteClick"), "the vote", "click", 0.32, -0.4, None), (T("voteClick", 0.03), "stamp", "stamp", 0.26, -0.3, None), (T("voteClick", 0.1), "thank you", "chime", 0.24, 0.0, None),
    (T("voteClick", 0.2), "coin", "coin", 0.16, 0.3, None),
    (26.4, "cut to the chest", "woosh", 0.20, 0.2, "peak"),
    (T("magicClick"), "magical", "click", 0.28, -0.3, None),
    (T("openClick"), "open the chest", "click", 0.32, -0.3, None), (T("openClick", 0.03), "a book comes out", "pop", 0.34, -0.2, None), (T("openClick", 0.08), "coins burst", "sparkle", 0.26, 0.3, None),
    (T("openClick", 0.2), "coin", "coin", 0.18, 0.3, None), (T("openClick", 0.6), "new rank", "chime", 0.18, 0.25, None),
    (30.6, "cut to the chat", "woosh", 0.20, -0.2, "peak"),
    (T("fabClick"), "chat opens", "click", 0.3, 0.4, None), (T("fabClick", 0.03), "chat opens", "pop", 0.3, 0.4, None),
    (S("chat", 1.9), "first bubble", "blip", 0.22, 0.4, None), (S("chat", 3.2), "second bubble", "blip", 0.22, 0.4, None),
    (T("chipClick"), "a riddle!", "click", 0.3, 0.4, None), (S("chat", 4.9), "the riddle", "blip", 0.24, 0.4, None),
    (36.6, "cut to the catalogue", "woosh", 0.20, 0.2, "peak"),
    (T("searchClick"), "search box", "click", 0.26, -0.1, None),
    *[(S("catalog", 0.48 + i * 0.12), "typing", "key", 0.20, -0.1 + 0.04 * i, None) for i in range(6)],
    (T("cardClick"), "a book opens", "click", 0.3, -0.2, None), (T("cardClick", 0.04), "a book opens", "pop", 0.28, 0.0, None),
    (41.3, "the phone slides in", "woosh", 0.34, -0.1, "peak"),
    (T("cardTap"), "the reader's card", "tap", 0.34, -0.1, None), (T("cardTap", 0.05), "the reader's card", "pop", 0.28, -0.1, None),
    (45.62, "end card", "stamp", 0.30, -0.3, None), (45.9, "wordmark", "sparkle", 0.16, 0.0, None), (46.6, "the address", "pop", 0.26, 0.0, None),
]
PAL = {"click": click, "key": key, "pop": pop, "coin": coin, "stamp": stamp, "chime": chime, "swish": swish, "woosh": woosh, "bloom": bloom, "blip": blip,
       "sparkle": sparkle, "scribble": scribble, "tap": tap}


def main():
    dry, wet = Bus(DUR, 100), Bus(DUR, 100)
    out = []
    for t, label, name, gain, pan, anchor in sorted(HITS, key=lambda h: h[0]):
        x = PAL[name]()
        x = x / (np.abs(x).max() + 1e-9)
        lead = 0.0
        if anchor == "peak":
            mono = x if x.ndim == 1 else x.mean(axis=0)
            lead = float(np.argmax(env_follow(mono, 0.01, 0.05))) / SR
        dry.add(x, 0, gain, pan=pan, at=max(0.0, t - lead))
        wet.add(x, 0, gain * (0.5 if name in ("chime", "coin", "sparkle", "bloom", "swish") else 0.15), pan=pan, at=max(0.0, t - lead))
        out.append({"t": round(t, 3), "beat": round(t / 0.6, 2), "label": label, "sfx": name, "gain": gain})
    n = int(DUR * SR)
    w = reverb(wet.x, wet=1.0, length=1.6, decay=0.4) - wet.x
    mix = (dry.x + 0.6 * w)[:, :n]
    mix = np.stack([filt(ch, "highpass", 60) for ch in mix])
    mix = limit(mix, ceiling_db=-3.0)
    sf.write(HERE / "sfx.wav", mix.T, SR, subtype="PCM_24")
    (FILM / "hits.json").write_text(json.dumps(out, indent=1), encoding="utf8")
    print(f"sfx.wav {DUR:.1f}s  {len(out)} hits  peak {20 * np.log10(np.abs(mix).max() + 1e-9):.1f} dBFS")


if __name__ == "__main__":
    main()
