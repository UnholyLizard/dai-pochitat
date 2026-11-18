# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "scipy", "soundfile"]
# ///
"""Score and sound effects for the 9:16 cuts (reel.json, story.json), from the 16:9 film's own material.

    MOTION_REEL_SKILL=<skill> uv run stage-instagram/audio.py reel|story
    node $MOTION_REEL_SKILL/scripts/mix.mjs stage-instagram/film-<cut> --no-mux     (-> audio/mix.wav, -14 LUFS)

Music: the film's music-box score (film/audio/score.py: its instruments, chords and melody, D major, 100 BPM) re-cut
bar by bar to the cut's length; ORDER lists which of the film's 22 bars plays in each bar of the cut, so the evening
bars land on the lamp tap and the band comes back on the casting, as in the film. Every bar keeps its own role
(evening, theme returns, brush rolls), and the last chord rings into the studio outro with a 0.4 s tail fade, so the
reel loops back onto bar 1 cleanly.
SFX: the film's palette (film/audio/sfx.py), placed from the sequence itself: footage times of each shot (the clicks
in its meta) through the segments, cuts at segment starts, the phone's entrance and the outro. Seeded.
Writes film-<cut>/audio/music.wav, sfx.wav, film-<cut>/film.json (duration for mix.mjs), beats.json and hits.json.
"""
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
SP = HERE.parent
CUT = sys.argv[1] if len(sys.argv) > 1 else "reel"
SEQ = json.loads((HERE / f"{CUT}.json").read_text(encoding="utf8"))
OUT = HERE / f"film-{CUT}"
(OUT / "audio").mkdir(parents=True, exist_ok=True)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


score = load("score", SP / "film" / "audio" / "score.py")   # instruments + dsp (its `from dsp import *`)
fx = load("sfx", SP / "film" / "audio" / "sfx.py")
D = score   # dsp names (Bus, reverb, filt, limit, SR, seed, rng, measure_beats, ebur128, env_follow) via score's import

# which of the film's bars (1-based) plays in each bar of the cut
ORDER = {
    # intro, cover, open+turn, turn to the room, EVENING (lamp at 9.6), casting x2, chest, chat x2, phone, A7, outro x2
    "reel": [1, 2, 4, 6, 7, 9, 10, 11, 13, 14, 18, 20, 21, 22],
    # intro, cover, EVENING (lamp at 6.0), evening, chat (band back), chat, phone, outro x2
    "story": [1, 2, 7, 8, 9, 14, 20, 21, 22],
}[CUT]
BPM, BEATS, BEAT = score.BPM, score.BEATS, score.BEAT
BARS = len(ORDER)
DUR = float(SEQ["duration"])
assert abs(BARS * BEATS * BEAT - DUR) < 1e-6, f"{CUT}: {BARS} bars = {BARS * BEATS * BEAT:.2f}s != duration {DUR}"


def music():
    # instruments draw from their module's own `rng` (bound by `from dsp import *`), so seed that one
    score.rng = rng = np.random.default_rng(20261113 if CUT == "reel" else 20261114)
    lead, band, low, perc, pads = (D.Bus(DUR, BPM) for _ in range(5))
    for i, src in enumerate(ORDER):
        b0 = i * BEATS
        chord = score.BAR[src - 1]
        c = score.CH[chord]
        evening = src in (7, 8)
        last = i >= BARS - 2
        for ev in score.MEL[src - 1]:
            beat, note = ev[0], ev[1]
            g = (ev[2] if len(ev) > 2 else 1.0) * (0.85 if evening else 1.0) * float(rng.uniform(0.92, 1.0))
            lead.add(score.mbox(note, 2.4 if evening or last else 1.7), b0 + beat, 0.30 * g, pan=float(rng.uniform(-0.12, 0.12)))
            if src in (9, 14, 16, 21):
                lead.add(score.mbox(note[:-1] + str(int(note[-1]) - 1), 1.4, 0.6), b0 + beat, 0.11 * g, pan=0.2)
        for beat, note in score.GLK.get(src, []):
            lead.add(score.glock(note), b0 + beat, 0.085, pan=0.35)
        if src in score.PLUCK:
            for beat, k in [(0.5, 0), (1, 1), (1.5, 2), (2.5, 0), (3, 2), (3.5, 1)]:
                band.add(score.pizz(c["pl"][k]), b0 + beat, 0.36 * float(rng.uniform(0.8, 1.0)), pan=-0.3 + 0.22 * k)
        if src in score.BASS:
            low.add(score.upright(c["b"][0]), b0, 0.55)
            low.add(score.upright(c["b"][1], 0.7), b0 + 2, 0.44)
            if src not in (6, 20):
                low.add(score.upright(c["b"][0], 0.35), b0 + 3.5, 0.26)
        if src in score.BRUSH:
            for beat in (1, 3):
                perc.add(score.brush(), b0 + beat - 0.04, 0.20, pan=0.15)
            for k in range(8):
                perc.add(score.shaker(), b0 + k * 0.5, 0.05 if k % 2 else 0.028, pan=-0.35)
            nxt = ORDER[i + 1] if i + 1 < BARS else None
            if nxt is not None and nxt != src + 1:   # a brush roll wherever the cut jumps to another section
                for k in range(4):
                    perc.add(score.brush(0.12, sweep=False), b0 + 3 + k * 0.25, 0.07 + 0.03 * k, pan=0.1)
        if src in score.PAD:
            length = BEATS * BEAT * (2.6 if src == 22 else 1.15)
            pads.add(score.pad_chord(c["pad"], length, cutoff=(700, 1100), attack=0.7, release=1.2), b0, 0.20 if evening else 0.15)

    lead.x = D.reverb(lead.x, wet=0.34, length=2.2, decay=0.55)
    band.x = D.reverb(band.x, wet=0.16, length=1.2, decay=0.3)
    perc.x = D.reverb(perc.x, wet=0.10, length=0.9, decay=0.22)
    pads.x = D.reverb(pads.x, wet=0.30, length=2.4, decay=0.7)
    low.x = np.stack([D.filt(ch, "lowpass", 900) for ch in low.x])
    n = int(round(DUR * D.SR))
    mix = (lead.x + band.x + low.x + perc.x + pads.x)[:, :n]
    mix[:, -int(0.4 * D.SR):] *= np.linspace(1, 0, int(0.4 * D.SR))
    mix = np.stack([D.filt(ch, "highpass", 32) for ch in mix])
    mix = D.limit(mix / np.abs(mix).max() * 0.82, ceiling_db=-1.5)
    sf.write(OUT / "audio" / "music.wav", mix.T, D.SR, subtype="PCM_24")
    grid = {"bpm": BPM, "period": BEAT, "offset": 0.0, "beats_per_bar": BEATS, "bars": BARS, "duration": DUR,
            "beats": [round(k * BEAT, 5) for k in range(BARS * BEATS + 1)],
            "downbeats": [round(i * BEATS * BEAT, 5) for i in range(BARS + 1)], "film_bars": ORDER,
            "chords": [score.BAR[s - 1] for s in ORDER]}
    (OUT / "beats.json").write_text(json.dumps(grid, indent=1))


# ---------------------------------------------------------------- sfx from the sequence
SEGS = {s["id"]: s for s in SEQ["segments"]}
PH = SEQ.get("phone")
if PH:
    SEGS[PH["id"]] = PH
ORDERED = sorted(SEQ["segments"], key=lambda s: s["t0"])
OUTRO = float(SEQ["outro"]["in"])


def seg_t(seg, at):
    s = SEGS[seg]
    return float(s["t0"]) + float(s.get("lead", 0)) + at - float(s.get("start", 0)) / 60


def on_screen(seg, t):
    """Is footage of `seg` on screen at stage time t (between its start and the next segment's)?"""
    if seg == (PH or {}).get("id"):
        return float(PH["t0"]) <= t < OUTRO
    i = next(k for k, s in enumerate(ORDERED) if s["id"] == seg)
    end = float(ORDERED[i + 1]["t0"]) if i + 1 < len(ORDERED) else (float(PH["t0"]) if PH else OUTRO)
    return float(ORDERED[i]["t0"]) <= t < min(end, OUTRO)


# footage events per shot: (footage s, label, sound, gain, pan, anchor)
EVENTS = {
    "book": [(5.9, "the cover opens", "swish", 0.36, 0.15, "peak"),
             (7.0, "the house stands up", "pop", 0.34, 0.2, None), (7.02, "first stamp", "stamp", 0.26, 0.2, None), (7.12, "coin", "coin", 0.2, 0.3, None),
             (10.3, "the page turns", "swish", 0.42, 0.1, "peak"), (11.25, "the room stands up", "pop", 0.26, 0.2, None),
             (12.0, "the lamp", "click", 0.36, 0.1, None), (12.02, "evening", "bloom", 0.30, 0.0, None), (12.2, "night stamp", "coin", 0.18, 0.3, None),
             (12.55, "new rank", "chime", 0.20, 0.25, None)],
    "casting": [(2.4, "another line", "click", 0.28, 0.35, None), (2.44, "hop", "pop", 0.3, 0.35, None),
                (4.8, "the vote", "click", 0.32, -0.4, None), (4.83, "stamp", "stamp", 0.26, -0.3, None), (4.9, "thank you", "chime", 0.24, 0.0, None),
                (5.0, "coin", "coin", 0.16, 0.3, None)],
    "chest": [(0.6, "magical", "click", 0.28, -0.3, None), (1.2, "open the chest", "click", 0.32, -0.3, None), (1.23, "a book comes out", "pop", 0.34, -0.2, None),
              (1.28, "coins burst", "sparkle", 0.26, 0.3, None), (1.4, "coin", "coin", 0.18, 0.3, None), (1.8, "new rank", "chime", 0.18, 0.25, None)],
    "chat": [(0.6, "chat opens", "click", 0.3, 0.4, None), (0.63, "chat opens", "pop", 0.3, 0.4, None), (1.9, "first bubble", "blip", 0.22, 0.4, None),
             (3.2, "second bubble", "blip", 0.22, 0.4, None), (3.6, "a riddle!", "click", 0.3, 0.4, None)],
    "mobile": [(2.4, "the reader's card", "tap", 0.34, -0.1, None), (2.45, "the reader's card", "pop", 0.28, -0.1, None)],
}


def hits():
    H = [(0.15, "the bug's mark pops", "stamp", 0.22, -0.3, None),
         (0.95, "the browser lands", "woosh", 0.26, 0.2, "peak")]
    for s in [*SEQ["segments"], *([PH] if PH else [])]:
        for at, label, name, gain, pan, anchor in EVENTS.get(s["shot"], []):
            t = seg_t(s["id"], at)
            if on_screen(s["id"], t):
                H.append((t, label, name, gain, pan, anchor))
    for s in ORDERED[1:]:
        t0 = float(s["t0"])
        if s["shot"] != "book":   # a cut to another chapter whooshes with the camera move; the jump cut in the book is the page swish
            H.append((t0, f"cut to {s['id']}", "woosh", 0.2, 0.2 if len(H) % 2 else -0.2, "peak"))
    if PH:
        H.append((float(PH["camera"][0]["t"]) + 0.55, "the phone slides in", "woosh", 0.34, -0.1, "peak"))
    H += [(OUTRO + 1.1, "the lantern lights", "chime", 0.18, 0.0, None), (OUTRO + 1.3, "wordmark", "sparkle", 0.12, 0.0, None)]
    return H


def sfx():
    fx.rng = np.random.default_rng(20261115)
    dry, wet = D.Bus(DUR, BPM), D.Bus(DUR, BPM)
    out = []
    for t, label, name, gain, pan, anchor in sorted(hits(), key=lambda h: h[0]):
        x = fx.PAL[name]()
        x = x / (np.abs(x).max() + 1e-9)
        lead = 0.0
        if anchor == "peak":
            mono = x if x.ndim == 1 else x.mean(axis=0)
            lead = float(np.argmax(D.env_follow(mono, 0.01, 0.05))) / D.SR
        dry.add(x, 0, gain, pan=pan, at=max(0.0, t - lead))
        wet.add(x, 0, gain * (0.5 if name in ("chime", "coin", "sparkle", "bloom", "swish") else 0.15), pan=pan, at=max(0.0, t - lead))
        out.append({"t": round(t, 3), "beat": round(t / BEAT, 2), "label": label, "sfx": name, "gain": gain})
    n = int(round(DUR * D.SR))
    w = D.reverb(wet.x, wet=1.0, length=1.6, decay=0.4) - wet.x
    mix = (dry.x + 0.6 * w)[:, :n]
    mix = np.stack([D.filt(ch, "highpass", 60) for ch in mix])
    mix = D.limit(mix, ceiling_db=-3.0)
    sf.write(OUT / "audio" / "sfx.wav", mix.T, D.SR, subtype="PCM_24")
    (OUT / "hits.json").write_text(json.dumps(out, indent=1), encoding="utf8")
    return out


if __name__ == "__main__":
    music()
    h = sfx()
    (OUT / "film.json").write_text(json.dumps({"title": SEQ["name"], "duration": DUR, "formats": ["9x16"]}, indent=1))
    print(f"{CUT}: {BARS} bars ({DUR}s), {len(h)} hits -> {OUT.relative_to(SP)}")
