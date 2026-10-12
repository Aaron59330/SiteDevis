#!/usr/bin/env python3
"""Synthèse de la bande-son (musique + effets) à partir de timeline.js — numpy uniquement.
Usage : python3 audio.py sortie.wav"""
import json, sys, wave
import numpy as np

SR = 44100
rng = np.random.default_rng(7)
src = open(__file__.replace('audio.py', 'timeline.js'), encoding='utf-8').read()
CUES = json.loads(src[src.index('{'):src.rindex('}') + 1])
DUR = CUES['duration']
N = int(SR * DUR)
BPM = 120
BEAT = 60 / BPM


def tarr(d):
    return np.arange(int(SR * d)) / SR


def noise(d):
    return rng.standard_normal(int(SR * d))


def fft_filter(x, lo=None, hi=None):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.ones_like(f)
    if lo is not None:
        m *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi is not None:
        m *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * m, len(x))


def mono_to_stereo(x, pan=0.0):
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * l, x * r], axis=1)


mix = np.zeros((N, 2))
music = np.zeros((N, 2))
sfx = np.zeros((N, 2))


def add(buf, t0, sig, gain=1.0, pan=0.0):
    i0 = int(t0 * SR)
    if i0 >= N or i0 + len(sig) <= 0:
        return
    s = mono_to_stereo(sig * gain, pan)
    a = max(0, -i0)
    b = min(len(s), N - i0)
    buf[i0 + a:i0 + b] += s[a:b]


def midi(n):
    return 440 * 2 ** ((n - 69) / 12)


# ---------- instruments ----------
def kick():
    t = tarr(0.45)
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 8) * 1.0 + np.sin(ph * 2) * np.exp(-t * 30) * 0.15


def hat(open_=False):
    d = 0.25 if open_ else 0.06
    t = tarr(d)
    n = np.diff(noise(d), prepend=0)
    return n * np.exp(-t * (14 if open_ else 70)) * 0.25


def clap():
    t = tarr(0.3)
    n = fft_filter(noise(0.3), lo=900, hi=7000)
    env = np.exp(-t * 18) + 0.6 * np.exp(-((t - 0.012) * 90) ** 2) + 0.5 * np.exp(-((t - 0.024) * 90) ** 2)
    return n * env * 0.45


def bass(note, d=0.45):
    t = tarr(d)
    f = midi(note)
    env = np.minimum(1, t * 200) * np.exp(-t * 4.5)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)) * env * 0.55


def pluck(note, d=0.5):
    t = tarr(d)
    f = midi(note)
    env = np.minimum(1, t * 400) * np.exp(-t * 7)
    s = sum((1 / k) * np.sin(2 * np.pi * f * k * t) * np.exp(-t * 3 * k) for k in range(1, 6))
    return s * env * 0.35


def pad(notes, d):
    t = tarr(d)
    out = np.zeros_like(t)
    for n in notes:
        f = midi(n)
        for det in (-0.07, 0.0, 0.07):
            out += np.sin(2 * np.pi * f * (1 + det * 0.01) * t + det * 5) + 0.3 * np.sin(4 * np.pi * f * t)
    env = np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.6)
    return out / (len(notes) * 3) * env * 0.5


def bell(f, d=1.4):
    t = tarr(d)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 4) + 0.3 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 8)) * np.exp(-t * 3.2) * np.minimum(1, t * 800)


# ---------- musique ----------
CHORDS = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [48, 52, 55]), (55, [55, 59, 62])]  # Am F C G
BAR = 4 * BEAT
n_bars = int(np.ceil(DUR / BAR))
kick_times = []
for b in range(n_bars):
    root, notes = CHORDS[b % 4]
    t0 = b * BAR
    if t0 < 28.4:
        add(music, t0, pad([n for n in notes] + [notes[0] + 12], min(BAR + 0.5, 28.9 - t0)), 0.55 if t0 < 3 else 0.42)
    for k in range(8):  # croches
        t = t0 + k * BEAT / 2
        if 3.0 <= t < 28.0:
            # arpégiateur
            pat = [0, 1, 2, 1, 0, 2, 1, 2]
            vol = 0.5 if t < 12 else 0.7
            add(music, t, pluck(notes[pat[k]] + 12, 0.4), vol, pan=(-0.5 if k % 2 else 0.5))
            if k % 2 == 1:
                add(music, t, hat(), 0.9, pan=0.2)
            if t >= 7.0:
                add(music, t, bass(root - 12, 0.4), 0.9 if k % 2 == 0 else 0.6)
    for k in range(4):
        t = t0 + k * BEAT
        if 3.0 <= t < 28.0:
            add(music, t, kick(), 1.0)
            kick_times.append(t)
            if k % 2 == 1 and t >= 7.0:
                add(music, t, clap(), 0.9)
            if k == 3 and t >= 7.0:
                add(music, t + BEAT / 2, hat(True), 0.7)

# sidechain simple : on baisse la musique (hors kick) juste après chaque kick
sc = np.ones(N)
ti = np.arange(N) / SR
for kt in kick_times:
    i0 = int(kt * SR)
    seg = min(int(0.28 * SR), N - i0)
    if seg > 0:
        sc[i0:i0 + seg] *= 1 - 0.38 * np.exp(-np.arange(seg) / SR / 0.09)
# on ne ducke pas la grosse caisse elle-même : reconstruit kick à part
kick_only = np.zeros((N, 2))
for kt in kick_times:
    add(kick_only, kt, kick(), 1.0)
music = (music - kick_only) * sc[:, None] + kick_only

# intro : nappe + pulsation douce, fondu d'entrée
intro = np.minimum(1, ti / 0.8)
music *= intro[:, None]

# réverbération (convolution FFT d'une réponse impulsionnelle exponentielle bruitée)
ir_len = int(1.6 * SR)
ir = np.stack([rng.standard_normal(ir_len) * np.exp(-np.arange(ir_len) / SR / 0.45) for _ in range(2)], axis=1)
ir = np.stack([fft_filter(ir[:, c], lo=300, hi=6000) for c in range(2)], axis=1) * 0.012


def reverb(sig, wet):
    out = np.zeros_like(sig)
    L = len(sig) + ir_len
    for c in range(2):
        out[:, c] = np.fft.irfft(np.fft.rfft(sig[:, c], L) * np.fft.rfft(ir[:, c], L), L)[:len(sig)]
    return sig + wet * out


music = reverb(music, 0.55)

# ---------- effets sonores ----------
def pop():
    t = tarr(0.16)
    f = 900 * np.exp(-t * 14) + 280
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 26) * 0.55


def click():
    t = tarr(0.09)
    n = fft_filter(noise(0.09), lo=2500) * np.exp(-t * 160) * 0.5
    return n + np.sin(2 * np.pi * 1400 * t) * np.exp(-t * 90) * 0.35


def tick(f=2600):
    t = tarr(0.03)
    return (fft_filter(noise(0.03), lo=1800) * np.exp(-t * 200) * 0.5 + np.sin(2 * np.pi * f * t) * np.exp(-t * 150) * 0.15)


def whoosh(d=1.1):
    n = noise(d)
    edges = np.geomspace(250, 9000, 9)
    t = tarr(d)
    out = np.zeros_like(t)
    for i in range(8):
        band = fft_filter(n, lo=edges[i], hi=edges[i + 1])
        c = (i + 0.5) / 8
        w = np.exp(-(((t / d) - (0.15 + 0.7 * c)) ** 2) / (2 * 0.12 ** 2))
        out += band * w * (1.0 + 2 * c)
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.4
    return out * env * 0.9


def riser(d):
    t = tarr(d)
    n = noise(d)
    out = np.zeros_like(t)
    edges = np.geomspace(300, 12000, 9)
    for i in range(8):
        w = np.exp(-(((t / d) - (i + 0.5) / 8) ** 2) / (2 * 0.16 ** 2))
        out += fft_filter(n, lo=edges[i], hi=edges[i + 1]) * w * 2
    f = 180 * np.exp(np.log(2400 / 180) * (t / d) ** 1.5)
    sw = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.35
    return (out + sw) * (t / d) ** 2 * 0.9


def impact(d=1.6):
    t = tarr(d)
    f = 110 * np.exp(-t * 4) + 32
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.4)
    crash = fft_filter(noise(d), lo=800) * np.exp(-t * 5) * 0.35
    return (boom * 1.1 + crash) * 0.9


def chime():
    notes = [midi(81), midi(85), midi(88), midi(93)]  # A5 C#6 E6 A6
    out = np.zeros(int(SR * 2.0))
    for i, f in enumerate(notes):
        b = bell(f, 1.6)
        j = int(i * 0.085 * SR)
        out[j:j + len(b)] += b * 0.35
    return out


def cash():
    out = np.zeros(int(SR * 1.6))
    for t0, f in ((0.0, 1760), (0.11, 2349)):
        b = bell(f, 1.2)
        j = int(t0 * SR)
        out[j:j + len(b)] += b * 0.55
    # tintement de pièces
    for k in range(9):
        j = int((0.28 + k * 0.045 + rng.random() * 0.02) * SR)
        tt = tarr(0.25)
        f = rng.uniform(3600, 6200)
        c = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 22) * 0.18
        out[j:j + len(c)] += c
    return out


for t in CUES['pop']:
    add(sfx, t, pop(), 0.9, pan=rng.uniform(-0.3, 0.3))
for t in CUES['click']:
    add(sfx, t, click(), 1.0)
for a, b in CUES['type']:
    t = a
    while t < b:
        add(sfx, t, tick(rng.uniform(2200, 3200)), rng.uniform(0.6, 1.0), pan=rng.uniform(-0.15, 0.15))
        t += rng.uniform(0.05, 0.095)
for t in CUES['whoosh']:
    add(sfx, t - 0.7, whoosh(1.2), 0.8)
for t in CUES['chime']:
    add(sfx, t, chime(), 0.8)
for t in CUES['cash']:
    add(sfx, t, cash(), 1.0)
for a, b in CUES['count']:
    t, i = a, 0
    while t < b:
        add(sfx, t, tick(1200 + 900 * (t - a) / (b - a)), 0.55, pan=0.25)
        t += 0.032
for t in CUES['hit']:
    add(sfx, t, impact(), 0.85 if t > 1 else 0.5)
for a, b in CUES['riser']:
    add(sfx, a, riser(b - a), 0.8)

# accord final long
fin = pad([57, 64, 69, 72, 76], 2.2)
add(music, 28.4, fin, 0.9)

mix = music * 0.85 + reverb(sfx, 0.25) * 1.0
# fondu final
fade = np.clip((DUR - ti) / 1.0, 0, 1) ** 1.2
mix *= fade[:, None]
# limiteur doux + normalisation
mix = np.tanh(mix * 1.1)
mix /= max(1e-9, np.abs(mix).max()) / 0.89

out = (mix * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'audio.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(out.tobytes())
print('audio ok', DUR, 's')
