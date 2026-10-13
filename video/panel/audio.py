#!/usr/bin/env python3
"""Bande-son du film « panel » : musique douce et minimaliste + petits sons calés sur cues.json (numpy uniquement).
Usage : python3 audio.py cues.json sortie.wav"""
import json, sys, wave
import numpy as np

SR = 44100
rng = np.random.default_rng(11)
CUES = json.load(open(sys.argv[1]))
DUR = float(CUES['duration'])
N = int(SR * DUR)
BPM = 96
BEAT = 60 / BPM
ti = np.arange(N) / SR


def tarr(d): return np.arange(int(SR * d)) / SR
def noise(d): return rng.standard_normal(int(SR * d))
def midi(n): return 440 * 2 ** ((n - 69) / 12)


def filt(x, lo=None, hi=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); m = np.ones_like(f)
    if lo: m *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi: m *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * m, len(x))


def add(buf, t0, sig, g=1.0, pan=0.0):
    i0 = int(t0 * SR)
    if i0 >= N or i0 + len(sig) <= 0: return
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    a, b = max(0, -i0), min(len(sig), N - i0)
    buf[i0 + a:i0 + b, 0] += sig[a:b] * g * l; buf[i0 + a:i0 + b, 1] += sig[a:b] * g * r


music = np.zeros((N, 2)); sfx = np.zeros((N, 2))


def pad(notes, d):
    t = tarr(d); out = np.zeros_like(t)
    for n in notes:
        for det in (-.07, .07):
            f = midi(n + det)
            out += np.sin(2 * np.pi * f * t + rng.random() * 6) + .25 * np.sin(4 * np.pi * f * t)
    env = np.minimum(1, t / 1.2) * np.minimum(1, (d - t) / 1.0)
    return filt(out, hi=2200) * env * .045


def keys(n, d=1.6):  # piano feutré
    t = tarr(d); f = midi(n)
    s = np.sin(2 * np.pi * f * t) + .35 * np.sin(4 * np.pi * f * t) * np.exp(-t * 5) + .12 * np.sin(6 * np.pi * f * t) * np.exp(-t * 9)
    return s * np.exp(-t * 2.6) * np.minimum(1, t * 300) * .2


def sub(n, d):
    t = tarr(d); return np.sin(2 * np.pi * midi(n) * t) * np.minimum(1, t * 30) * np.minimum(1, (d - t) * 8) * .28


def kick():
    t = tarr(.35); f = 95 * np.exp(-t * 22) + 44
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * .7


def shaker():
    t = tarr(.08); return filt(noise(.08), lo=6000) * np.exp(-t * 60) * .12


CH = [(48, [60, 64, 67, 71, 74]), (45, [57, 60, 64, 67, 71]), (41, [57, 60, 64, 65, 69]), (43, [55, 59, 62, 64, 67])]  # Cmaj9 Am9 Fmaj7 G6
BAR = 4 * BEAT
nb = int(np.ceil(DUR / BAR))
for b in range(nb):
    root, notes = CH[b % 4]; t0 = b * BAR
    if t0 > DUR - 3: break
    add(music, t0, pad(notes[:4], min(BAR + 1.2, DUR - t0)), .9)
    pat = [0, 2, 4, 3, 1, 4, 2, 3]
    for k in range(8):
        t = t0 + k * BEAT / 2
        if 2.0 <= t < DUR - 5 and not (79.5 < t < 84.5):
            if k % 2 == 0 or t > 16:
                add(music, t, keys(notes[pat[k]] + (12 if k % 4 == 3 else 0)), .55 if t < 16 else .7, pan=(-.35 if k % 2 else .35))
    if 8 <= t0 < DUR - 6 and not (79 < t0 < 84):
        add(music, t0, sub(root - 12, BAR * .95), 1)
    for k in range(4):
        t = t0 + k * BEAT
        if 24 <= t < 79.5:
            add(music, t, kick(), .55)
        for h in (0, .5):
            th = t + h * BEAT
            if 16 <= th < 79.5: add(music, th, shaker(), 1, pan=.3)
add(music, DUR - 6.2, pad([48, 55, 60, 64, 67, 71], 6.0), 1.2)
add(music, DUR - 6.2, keys(72, 4), .9); add(music, DUR - 6.0, keys(79, 4), .6)

# réverbération
L = int(1.8 * SR)
ir = np.stack([rng.standard_normal(L) * np.exp(-np.arange(L) / SR / .55) for _ in range(2)], 1)
ir = np.stack([filt(ir[:, c], lo=250, hi=7000) for c in range(2)], 1) * .012


def verb(x, wet):
    o = np.zeros_like(x); n = len(x) + L
    for c in range(2): o[:, c] = np.fft.irfft(np.fft.rfft(x[:, c], n) * np.fft.rfft(ir[:, c], n), n)[:len(x)]
    return x + wet * o


music = verb(music, .7)


# ---------- petits sons ----------
def pop():
    t = tarr(.12); f = 1300 * np.exp(-t * 30) + 520
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 38) * .22


def click():
    t = tarr(.07); return filt(noise(.07), lo=3000) * np.exp(-t * 170) * .35 + np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 110) * .2


def tick(f=3000):
    t = tarr(.025); return np.sin(2 * np.pi * f * t) * np.exp(-t * 220) * .12


def whoosh(d=.9):
    n = noise(d); t = tarr(d); out = np.zeros_like(t); e = np.geomspace(400, 9000, 8)
    for i in range(7):
        c = (i + .5) / 7; out += filt(n, lo=e[i], hi=e[i + 1]) * np.exp(-(((t / d) - (.2 + .6 * c)) ** 2) / (2 * .13 ** 2))
    return out * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.6 * .5


def swish(): return whoosh(.45) * .8


def chime():
    out = np.zeros(int(SR * 1.8))
    for i, n in enumerate([84, 88, 91]):
        t = tarr(1.4); f = midi(n); b = (np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6)) * np.exp(-t * 3.5) * np.minimum(1, t * 600)
        j = int(i * .07 * SR); out[j:j + len(b)] += b * .16
    return out


def riser(d):
    t = tarr(d); n = noise(d); out = np.zeros_like(t); e = np.geomspace(500, 12000, 8)
    for i in range(7): out += filt(n, lo=e[i], hi=e[i + 1]) * np.exp(-(((t / d) - (i + .5) / 7) ** 2) / (2 * .18 ** 2))
    return out * (t / d) ** 2 * .45


def hit():
    t = tarr(1.4); f = 70 * np.exp(-t * 5) + 38
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3) * .6 + filt(noise(1.4), lo=3000) * np.exp(-t * 7) * .06


for t in CUES['pop']: add(sfx, t, pop(), 1, pan=rng.uniform(-.3, .3))
for t in CUES['click']: add(sfx, t, click(), 1)
for t in CUES['whoosh']: add(sfx, t - .45, whoosh(), 1)
for t in CUES['swish']: add(sfx, t - .2, swish(), 1)
for t in CUES['chime']: add(sfx, t, chime(), 1)
for t in CUES['hit']: add(sfx, t, hit(), 1)
for a, b in CUES['tick']:
    t = a
    while t < b: add(sfx, t, tick(2200 + 1400 * (t - a) / max(.01, b - a)), 1, pan=.2); t += .045
for a, b in CUES['type']:
    t = a
    while t < b: add(sfx, t, click() * .5, rng.uniform(.5, .9), pan=rng.uniform(-.15, .15)); t += rng.uniform(.06, .1)
for a, b in CUES['riser']: add(sfx, a, riser(b - a), 1)
for t in CUES.get('hover', []): add(sfx, t, tick(3600), .8, pan=rng.uniform(-.2, .2))

mix = music * .9 + verb(sfx, .3)
mix *= (np.minimum(1, ti / .6) * np.clip((DUR - ti) / 1.4, 0, 1) ** 1.3)[:, None]
mix = np.tanh(mix * 1.2); mix /= max(1e-9, np.abs(mix).max()) / .88
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('audio ok', DUR)
