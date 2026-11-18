# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "scipy", "soundfile"]
# ///
"""Score for the «Дай почитать!» showcase film: an original music-box tune in D major, 100 BPM, 22 bars (52.8 s).

    MOTION_REEL_SKILL=<skill> uv run _pipeline/film/audio/score.py

Music box (melody) over plucked strings, a soft upright bass and brushes; the evening shot (bars 7-8) drops to the
music box and a warm pad, the casting (bar 9) brings the band back, the last chord rings into the studio sign-off.
Everything is synthesized here (dsp.py from the motion-reel skill); seeded, so every run writes the same file.
Writes audio/music.wav and ../beats.json (the grid the sequence and the SFX are timed against).
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

seed(20261112)
BPM, BARS, BEATS = 100, 22, 4
BEAT = 60 / BPM
DUR = BARS * BEATS * BEAT


# ---------------------------------------------------------------- instruments
def mbox(note, length=1.7, bright=1.0):
    """Music-box tine: a pure fundamental, a soft octave, two short inharmonic partials and a pin click."""
    f = hz(note)
    n = int(length * SR)
    t = tvec(n)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.75)
    x += 0.30 * np.sin(2 * np.pi * f * 2.004 * t) * np.exp(-t / 0.42)
    if f * 5.43 < 15000:
        x += 0.20 * bright * np.sin(2 * np.pi * f * 5.43 * t) * np.exp(-t / 0.11)
    if f * 8.9 < 16000:
        x += 0.08 * bright * np.sin(2 * np.pi * f * 8.9 * t) * np.exp(-t / 0.05)
    click = filt(rng.standard_normal(n), "highpass", 3500) * np.exp(-t / 0.0025) * 0.12 * bright
    return (x + click) * (1 - np.exp(-t / 0.0012)) * np.clip((length - t) / 0.08, 0, 1)


def glock(note, length=1.2):
    f = hz(note)
    n = int(length * SR)
    t = tvec(n)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.5) + 0.38 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.22)
    x += 0.16 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / 0.07)
    return x * (1 - np.exp(-t / 0.001)) * np.clip((length - t) / 0.06, 0, 1)


_pz = {}


def pizz(note):
    """Pizzicato string: Karplus-Strong, darkened and shortened."""
    if note not in _pz:
        x = ks_pluck(hz(note), length=0.55, bright=0.32, buzz=0.0)
        t = tvec(len(x))
        _pz[note] = filt(x, "lowpass", 2600) * np.exp(-t / 0.2)
    return _pz[note]


def upright(note, length=0.9):
    f = hz(note)
    n = int(length * SR)
    t = tvec(n)
    x = np.sin(2 * np.pi * f * t) + 0.42 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.25) + 0.15 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / 0.1)
    thump = filt(rng.standard_normal(n), "lowpass", 380) * np.exp(-t / 0.012) * 0.5
    return np.tanh(1.2 * (x + thump)) * np.exp(-t / 0.42) * (1 - np.exp(-t / 0.004)) * np.clip((length - t) / 0.06, 0, 1)


def brush(length=0.26, sweep=True):
    n = int(length * SR)
    t = tvec(n)
    x = filt(filt(rng.standard_normal(n), "highpass", 2200), "lowpass", 8500)
    env = (1 - np.exp(-t / (0.035 if sweep else 0.004))) * np.exp(-t / (0.07 if sweep else 0.03))
    return x * env


def shaker():
    n = int(0.07 * SR)
    t = tvec(n)
    return filt(rng.standard_normal(n), "highpass", 6500) * (1 - np.exp(-t / 0.004)) * np.exp(-t / 0.016)


# ---------------------------------------------------------------- harmony (one chord a bar)
CH = {
    "D": dict(pl=["D4", "F#4", "A4"], b=("D2", "A2"), pad=["D3", "A3", "F#4", "A4"]),
    "A": dict(pl=["C#4", "E4", "A4"], b=("A2", "E2"), pad=["A2", "E3", "C#4", "E4"]),
    "Bm": dict(pl=["D4", "F#4", "B4"], b=("B2", "F#2"), pad=["B2", "F#3", "D4", "A4"]),
    "G": dict(pl=["D4", "G4", "B4"], b=("G2", "D3"), pad=["G2", "D3", "B3", "F#4"]),
    "F#m": dict(pl=["C#4", "F#4", "A4"], b=("F#2", "C#3"), pad=["F#2", "C#3", "A3", "E4"]),
    "Em": dict(pl=["E4", "G4", "B4"], b=("E2", "B2"), pad=["E3", "B3", "G4", "B4"]),
    "A7": dict(pl=["C#4", "G4", "A4"], b=("A2", "E2"), pad=["A2", "G3", "C#4", "E4"]),
}
#        1    2    3    4     5    6    7     8    9    10     11   12    13   14   15    16   17   18    19   20    21   22
BAR = ["D", "D", "A", "Bm", "G", "A", "Bm", "G", "D", "F#m", "G", "Em", "A", "D", "Bm", "G", "A", "Bm", "G", "A7", "D", "D"]

# melody: per bar [(beat, note, gain?)]
MEL = [
    [(0, "A4"), (0.5, "D5"), (1, "F#5"), (1.5, "A5"), (2, "D6"), (3.5, "C#6", 0.7)],
    [(0, "F#5"), (1, "A5"), (1.5, "F#5"), (2, "E5"), (3, "D5")],
    [(0, "E5"), (1, "C#5"), (1.5, "E5"), (2, "A5")],
    [(0, "D5"), (1, "F#5"), (1.5, "B5"), (2, "A5"), (3, "F#5")],
    [(0, "G5"), (1, "B5"), (1.5, "D6"), (2, "B5"), (3, "G5")],
    [(0, "A5"), (1, "C#6"), (1.5, "E6"), (2, "C#6"), (3, "A5"), (3.5, "B5", 0.7)],
    [(0, "B5"), (2, "F#5"), (3, "D5")],
    [(0, "G5"), (1.5, "F#5"), (2, "D5"), (3, "B4"), (3.5, "E5", 0.7)],
    [(0, "F#5"), (1, "A5"), (1.5, "F#5"), (2, "E5"), (3, "D5")],
    [(0, "C#5"), (1, "F#5"), (1.5, "A5"), (2, "C#6"), (3, "A5")],
    [(0, "B5"), (1, "G5"), (1.5, "B5"), (2, "D6"), (3, "E6"), (3.5, "D6", 0.7)],
    [(0, "E5"), (1, "G5"), (1.5, "B5"), (2, "E6"), (3, "B5")],
    [(0, "C#6"), (1, "A5"), (1.5, "E5"), (2, "A5"), (3, "C#6"), (3.5, "E6", 0.7)],
    [(0, "D6"), (1, "A5"), (1.5, "F#5"), (2, "A5"), (3, "D5")],
    [(0, "B5"), (1, "F#5"), (1.5, "D5"), (2, "F#5"), (3, "B4")],
    [(0, "G5"), (1, "B5"), (1.5, "D6"), (2, "G6"), (3, "D6")],
    [(0, "E6"), (1, "C#6"), (1.5, "A5"), (2, "C#6"), (3, "E6"), (3.5, "A5", 0.7)],
    [(0, "D6"), (1, "B5"), (2, "F#5"), (3, "B5")],
    [(0, "D6"), (1, "B5"), (2, "G5"), (3, "A5"), (3.5, "B5", 0.7)],
    [(0, "C#6"), (1, "E6"), (1.5, "G5"), (2, "A5"), (3, "E5"), (3.5, "C#5", 0.7)],
    [(0, "D5"), (0.5, "F#5"), (1, "A5"), (1.5, "D6"), (2, "F#6")],
    [(0, "D6", 0.8), (0, "A5", 0.6), (0, "F#5", 0.6), (2, "D5", 0.7)],
]
# glockenspiel answers (bar -> [(beat, note)]), an octave above the tune's turn
GLK = {6: [(2.5, "E7"), (3, "C#7")], 11: [(2.5, "D7"), (3.25, "B6")], 13: [(2.5, "A6"), (3, "C#7"), (3.5, "E7")],
       15: [(2.5, "F#6"), (3, "B6")], 17: [(2.5, "E7"), (3, "C#7")], 19: [(1.5, "D7"), (2.5, "B6")], 20: [(2.5, "A6"), (3, "G6")]}

rng_set = lambda a, b: set(range(a, b + 1))  # noqa: E731
PLUCK = rng_set(2, 6) | rng_set(9, 20)
BASS = rng_set(2, 6) | rng_set(9, 20)
BRUSH = rng_set(4, 6) | rng_set(9, 19)
PAD = rng_set(7, 8) | rng_set(18, 22)


def main():
    lead, band, low, perc, pads = (Bus(DUR, BPM) for _ in range(5))
    for i, chord in enumerate(BAR):
        bar = i + 1
        b0 = i * BEATS
        c = CH[chord]
        evening = bar in (7, 8)
        # melody (music box); the evening bars ring longer and softer
        for ev in MEL[i]:
            beat, note = ev[0], ev[1]
            g = (ev[2] if len(ev) > 2 else 1.0) * (0.85 if evening else 1.0) * float(rng.uniform(0.92, 1.0))
            lead.add(mbox(note, 2.4 if evening or bar >= 21 else 1.7), b0 + beat, 0.30 * g, pan=float(rng.uniform(-0.12, 0.12)))
            if bar in (9, 14, 16, 21):   # the theme's returns are doubled an octave down
                lead.add(mbox(note[:-1] + str(int(note[-1]) - 1), 1.4, 0.6), b0 + beat, 0.11 * g, pan=0.2)
        for beat, note in GLK.get(bar, []):
            lead.add(glock(note), b0 + beat, 0.085, pan=0.35)
        if bar in PLUCK:
            pat = [(0.5, 0), (1, 1), (1.5, 2), (2.5, 0), (3, 2), (3.5, 1)]
            for beat, k in pat:
                band.add(pizz(c["pl"][k]), b0 + beat, 0.36 * float(rng.uniform(0.8, 1.0)), pan=-0.3 + 0.22 * k)
        if bar in BASS:
            low.add(upright(c["b"][0]), b0, 0.55)
            low.add(upright(c["b"][1], 0.7), b0 + 2, 0.44)
            if bar not in (6, 20):
                low.add(upright(c["b"][0], 0.35), b0 + 3.5, 0.26)
        if bar in BRUSH:
            for beat in (1, 3):
                perc.add(brush(), b0 + beat - 0.04, 0.20, pan=0.15)
            for k in range(8):
                perc.add(shaker(), b0 + k * 0.5, 0.05 if k % 2 else 0.028, pan=-0.35)
            if bar in (6, 11, 13, 17, 19):   # a brush roll into the next section
                for k in range(4):
                    perc.add(brush(0.12, sweep=False), b0 + 3 + k * 0.25, 0.07 + 0.03 * k, pan=0.1)
        if bar in PAD:
            length = BEATS * BEAT * (2.6 if bar == 22 else 1.15)
            pads.add(pad_chord(c["pad"], length, cutoff=(700, 1100), attack=0.7, release=1.2), b0, 0.20 if evening else 0.15)

    lead.x = reverb(lead.x, wet=0.34, length=2.2, decay=0.55)
    band.x = reverb(band.x, wet=0.16, length=1.2, decay=0.3)
    perc.x = reverb(perc.x, wet=0.10, length=0.9, decay=0.22)
    pads.x = reverb(pads.x, wet=0.30, length=2.4, decay=0.7)
    low.x = np.stack([filt(ch, "lowpass", 900) for ch in low.x])
    mix = lead.x + band.x + low.x + perc.x + pads.x
    n = int(DUR * SR)
    mix = mix[:, :n]
    mix[:, -int(0.4 * SR):] *= np.linspace(1, 0, int(0.4 * SR))
    mix = np.stack([filt(ch, "highpass", 32) for ch in mix])
    mix = limit(mix / np.abs(mix).max() * 0.82, ceiling_db=-1.5)
    sf.write(HERE / "music.wav", mix.T, SR, subtype="PCM_24")

    beats = [round(k * BEAT, 5) for k in range(BARS * BEATS + 1)]
    energy = []
    for i in range(BARS):
        seg = mix[:, int(i * BEATS * BEAT * SR): int((i + 1) * BEATS * BEAT * SR)]
        energy.append(round(float(np.sqrt(np.mean(seg ** 2))), 4))
    grid = {
        "bpm": BPM, "period": BEAT, "offset": 0.0, "beats_per_bar": BEATS, "bars": BARS, "duration": round(DUR, 3),
        "beats": beats, "downbeats": [round(i * BEATS * BEAT, 5) for i in range(BARS + 1)],
        "sections": {"title": [1, 1], "cover": [2, 3], "open_turn": [4, 6], "evening": [7, 8], "casting": [9, 11], "chest": [12, 13],
                     "librarian": [14, 15], "catalogue": [16, 17], "phone": [18, 19], "end": [20, 20], "outro": [21, 22]},
        "chords": BAR, "energy": energy,
    }
    try:   # the grid as heard: the tracker's fit against the written one
        m = measure_beats(mix.mean(axis=0), SR, BPM)
        grid["measured"] = {k: m[k] for k in ("bpm", "period", "offset", "fit_inliers", "fit_residual_ms")}
    except Exception as e:  # noqa: BLE001
        grid["measured"] = {"error": str(e)}
    (FILM / "beats.json").write_text(json.dumps(grid, indent=1))
    I, TP = ebur128(HERE / "music.wav")
    print(f"music.wav {DUR:.1f}s  {I} LUFS  peak {TP} dBFS  measured {grid['measured']}")


if __name__ == "__main__":
    main()
