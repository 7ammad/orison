"""Score for Orison, 30 seconds. Everything is synthesised and every time comes from the film's timeline, so picture and
sound cannot drift. A low drone and wind in the cloud; music-box bells on the city; a choir that opens at the cathedral;
a clock that speeds up inside the heart and a riser that ends exactly on the burn-out cut; D major for the last shot.

    python "$TEARDOWN/run_sfx.py" score.py
"""

import math
import os
import random

from sfx.dsp import add, reverb, saw, svf, zeros
from sfx.score_kit import airy, hz
from sfx.synth import SR, bandnoise, riser, whoosh

TIMELINE = "orison-film/timeline.json"
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "orison-score.wav")
TARGET_LUFS = -15.0
SEED = 23


def env(x, a, r):
    """Raised-cosine fade in over a seconds, out over r seconds, in place."""
    n = len(x)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    for i in range(min(na, n)):
        x[i] *= 0.5 - 0.5 * math.cos(math.pi * i / na)
    for i in range(min(nr, n)):
        x[n - 1 - i] *= 0.5 - 0.5 * math.cos(math.pi * i / nr)
    return x


def choir(notes, dur, bright=0.5, a=1.0, r=1.2, seed=1):
    """A wordless choir: detuned saws through a lowpass and two vowel formants. Returns (left, right)."""
    rnd = random.Random(seed)
    n = int(dur * SR)
    left, right = zeros(n), zeros(n)
    for i, name in enumerate(notes):
        f = hz(name)
        g = 1 / (1 + i * 0.12)
        for d, side in ((-0.0034, left), (0.0021, left), (0.0034, right), (-0.0021, right)):
            add(side, saw(f * (1 + d), n, rnd.random()), 0, 0.22 * g)
    out = []
    lp = 500 + 1900 * bright
    for x in (left, right):
        low = svf(x, lambda k: lp * (0.6 + 0.4 * min(1, k / (a * SR + 1))), 0.7, "lp", 256)
        ah = svf(x, 680, 2.6, "bp")
        oh = svf(x, 1120, 3.2, "bp")
        y = [p * 0.62 + q * 0.75 + s * 0.42 * bright for p, q, s in zip(low, ah, oh)]
        out.append(env(y, a, r))
    return out[0], out[1]


def boom(level=1.0, dur=3.6):
    """The beat: a body the size of a mountain closing. A falling sub, a dark burst, a long body."""
    n = int(dur * SR)
    noise = svf([random.uniform(-1, 1) for _ in range(int(0.5 * SR))], 420, 0.7, "lp")
    out = [0.0] * n
    ph = 0.0
    for k in range(n):
        t = k / SR
        f = 31 + 62 * math.exp(-t / 0.09)
        ph += 2 * math.pi * f / SR
        rise = min(1, t / 0.012)
        s = math.sin(ph) * math.exp(-t / 1.05) * rise
        s += 0.32 * math.sin(2 * ph) * math.exp(-t / 0.55) * rise
        if k < len(noise):
            s += noise[k] * 1.8 * math.exp(-t / 0.09)
        out[k] = level * math.tanh(1.5 * s)
    return out


def moan(f0, f1, dur, seed=0):
    """A very large animal singing: a slow glide with vibrato and a hollow, odd-harmonic throat."""
    n = int(dur * SR)
    out = [0.0] * n
    ph = 0.0
    for k in range(n):
        x = k / n
        f = f0 * (f1 / f0) ** x * (1 + 0.012 * math.sin(2 * math.pi * 4.3 * k / SR + seed) * x)
        ph += 2 * math.pi * f / SR
        s = math.sin(ph) + 0.42 * math.sin(3 * ph + 0.3 * math.sin(ph)) + 0.18 * math.sin(5 * ph)
        out[k] = s * math.sin(math.pi * x) ** 1.4
    return svf(out, lambda k: 380 + 680 * math.sin(math.pi * k / n), 1.1, "lp", 256)


def bell(f, dur=2.4, level=1.0):
    """A glass bell: inharmonic partials with their own decays."""
    n = int(dur * SR)
    out = [0.0] * n
    for ratio, g, tau in ((1, 1.0, 0.8), (2.01, 0.45, 0.46), (3.02, 0.22, 0.26), (5.43, 0.12, 0.11)):
        w = 2 * math.pi * f * ratio / SR
        ph = 0.0
        for k in range(n):
            ph += w
            out[k] += g * math.sin(ph) * math.exp(-k / (tau * SR))
    a = int(0.003 * SR)
    for k in range(a):
        out[k] *= k / a
    return [v * level for v in out]


def tick(f=2400, level=1.0):
    """A tooth of a huge brass gear."""
    n = int(0.09 * SR)
    out = [0.0] * n
    for ratio, g, tau in ((1, 1.0, 0.012), (1.73, 0.6, 0.008), (0.41, 0.8, 0.022)):
        w = 2 * math.pi * f * ratio / SR
        ph = 0.0
        for k in range(n):
            ph += w
            out[k] += g * math.sin(ph) * math.exp(-k / (tau * SR))
    return [v * level for v in out]


def flutter(dur, level=1.0):
    """A flock's wings: band noise chopped by many small beats."""
    n = int(dur * SR)
    x = bandnoise(n, lambda k: 2200 + 900 * math.sin(k / SR * 1.4), q=0.7)
    return [level * x[k] * (0.5 + 0.5 * math.sin(2 * math.pi * 17 * k / SR)) ** 2 * math.sin(math.pi * k / n) for k in range(n)]


def score(mix, tl):
    dur = tl["duration"]
    beats = tl["beats"]
    cuts = tl["cuts"]
    end = tl["end"] + 0.5
    n = int(SR * dur)
    rnd = random.Random(SEED)
    hall = zeros(n)  # everything that should ring in the same enormous space

    def to_hall(t, x, g=1.0):
        add(hall, x, int(t * SR), g)

    # the choir, section by section, each chord overlapping the next
    sections = [
        (0.6, cuts[0] + 0.9, ["D2", "A2", "D3", "A3"], 0.14, 3.0, 1.0, 0.11),
        (cuts[0] - 0.2, cuts[1] + 0.9, ["D3", "A3", "E4", "F4"], 0.42, 1.0, 1.0, 0.13),
        (cuts[1] - 0.1, cuts[2] + 0.9, ["Bb2", "F3", "D4", "A4", "D5"], 0.95, 0.7, 1.0, 0.13),
        (cuts[2] - 0.1, 18.3, ["G2", "D3", "Bb3", "F4"], 0.5, 0.8, 0.9, 0.17),
        (17.9, cuts[3] + 0.3, ["A2", "E3", "C#4", "G4", "A4"], 0.95, 1.2, 0.3, 0.27),
        (cuts[3], 23.8, ["F2", "C3", "A3", "E4", "A4"], 0.9, 0.25, 0.9, 0.2),
        (23.2, cuts[4] + 0.9, ["C3", "G3", "E4", "D5"], 0.8, 0.8, 1.0, 0.16),
        (cuts[4] - 0.2, end, ["D2", "A2", "D3", "F#3", "A3", "E4", "A4"], 1.0, 0.9, 1.6, 0.17),
    ]
    for i, (t0, t1, notes, bright, a, r, gain) in enumerate(sections):
        left, right = choir(notes, t1 - t0, bright, a, r, seed=i + 3)
        mix.put_stereo(t0, left, right, gain)
        to_hall(t0, [(p + q) * 0.5 for p, q in zip(left, right)], gain * 0.8)

    # the drone under the cloud and the last shot
    drone = [0.0] * n
    ph1 = ph2 = 0.0
    for k in range(n):
        t = k / SR
        ph1 += 2 * math.pi * hz("D1") / SR
        ph2 += 2 * math.pi * hz("A1") * 1.002 / SR
        g = min(1, t / 2.5) * (1 - 0.65 * max(0, min(1, (t - cuts[0]) / 2))) + 0.65 * max(0, min(1, (t - cuts[4]) / 2))
        drone[k] = g * (math.sin(ph1) + 0.5 * math.sin(ph2) + 0.25 * math.sin(2 * ph1))
    mix.put(0, drone, 0.17)

    # wind: thick in the cloud, thin and high above it
    mix.put(0, airy(cuts[0] + 1.2, 240, 1100, 1.0), 0.05, -0.1)
    mix.put(cuts[4] - 0.5, airy(dur - cuts[4] + 0.5, 500, 900, 1.0), 0.028, 0.15)

    # the beats, each ringing in the hall; the last is the largest
    levels = [0.62, 0.5, 1.0, 0.8, 1.05, 1.25]
    for b, lv in zip(beats, levels):
        x = boom(lv)
        mix.put(b, x, 0.62)
        to_hall(b, x, 0.2)

    # a very large animal, twice
    to_hall(beats[2] + 0.5, moan(hz("A3"), hz("F3"), 3.2, 1), 0.17)
    to_hall(beats[5] + 0.7, moan(hz("D3"), hz("A3"), 2.8, 2), 0.2)

    # music-box bells on the city: the rib lights running past
    t = cuts[0] + 0.3
    pool = ["D5", "F5", "A5", "C6", "E6", "A6", "D6"]
    while t < cuts[1] - 0.2:
        x = bell(hz(rnd.choice(pool)), 2.0, 1.0)
        mix.put(t, x, 0.03, rnd.uniform(-0.7, 0.7))
        to_hall(t, x, 0.035)
        t += rnd.choice((0.19, 0.27, 0.38, 0.54))

    # the clock inside the heart speeds up to the burn-out
    t = cuts[2] + 0.2
    side = -1
    while t < cuts[3] - 0.02:
        x = (t - cuts[2]) / (cuts[3] - cuts[2])
        rate = 1.6 * (15 / 1.6) ** (x**1.5)
        lv = 0.35 + 0.65 * x
        g = tick(1500 + 1100 * rnd.random(), lv)
        mix.put(t, g, 0.08, side * 0.45)
        to_hall(t, g, 0.04)
        side = -side
        t += 1 / rate

    # one riser, ending exactly on the cut out of the sun
    r = riser(3.4, 200, 6000)
    mix.put(cuts[3] - 3.4, r, 0.2)
    to_hall(cuts[3] - 3.4, r, 0.03)

    # air on the cuts, wings on the flock
    for c in (cuts[1], cuts[2], cuts[4]):
        mix.put(c - 0.55, whoosh(1.1, 180, 2400, 0.55), 0.035, rnd.uniform(-0.3, 0.3))
    mix.put(cuts[3] + 0.05, whoosh(3.4, 3000, 500, 0.25), 0.04, -0.5)
    mix.put(cuts[3] + 0.3, flutter(cuts[4] - cuts[3], 1.0), 0.03, 0.35)
    mix.put(cuts[4] + 0.4, flutter(3.2, 0.7), 0.012, -0.3)

    # high glass ringing after the last beat, for the shot the film was all going to
    for i, name in enumerate(["D6", "F#6", "A6", "E7", "D7"]):
        x = bell(hz(name), 3.0, 1.0)
        tt = beats[5] + 0.25 + i * 0.31
        mix.put(tt, x, 0.024, (i - 2) * 0.3)
        to_hall(tt, x, 0.05)

    # one room for all of it
    wl, wr = reverb(hall, size=0.93, damp=0.42, scale=1.5)
    fadeout = [1.0 if k < (end - 0.4) * SR else max(0.0, 1 - (k - (end - 0.4) * SR) / (0.4 * SR)) for k in range(n)]
    mix.put_stereo(0, [a * f for a, f in zip(wl, fadeout)], [a * f for a, f in zip(wr, fadeout)], 0.75)
