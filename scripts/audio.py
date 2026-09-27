"""Design sonore 100 % synthétisé, calé image par image sur la timeline (build/cues.json).

Musique : 120 BPM, Ré mineur → Fa majeur (piano électrique FM, sub, kick, clap, hats).
SFX     : notifications, balayages, cliquetis de compteur, remplissage calendrier, tap CTA.
Sortie  : build/audio.wav (48 kHz stéréo, normalisé -14 LUFS / -1,5 dBTP via ffmpeg loudnorm).
"""
import json
import math
import os
import subprocess
import sys

import numpy as np
from scipy import signal as sg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
T = json.load(open(os.path.join(BUILD, "cues.json")))

SR = 48000
DUR = 20.0
N = int(SR * DUR)
BEAT = 0.5
rng = np.random.default_rng(7)

music = np.zeros((2, N))
sfx = np.zeros((2, N))
send = np.zeros((2, N))  # bus réverb


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def place(bus, sig, t, gain=1.0, pan=0.0, rev=0.0):
    """Pose un signal mono/stéréo sur un bus, panoramique à puissance constante."""
    if sig.ndim == 1:
        a = (pan + 1) * math.pi / 4
        sig = np.vstack([sig * math.cos(a), sig * math.sin(a)]) * math.sqrt(2)
    i0 = int(round(t * SR))
    s0 = 0
    if i0 < 0:
        s0 = -i0
        i0 = 0
    n = min(sig.shape[1] - s0, N - i0)
    if n <= 0:
        return
    bus[:, i0:i0 + n] += sig[:, s0:s0 + n] * gain
    if rev:
        send[:, i0:i0 + n] += sig[:, s0:s0 + n] * gain * rev


def svf(x, fc, q=0.7, mode="bp"):
    """Filtre à variable d'état (Chamberlin), fréquence variable par échantillon."""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    f = 2 * np.sin(np.pi * np.clip(fc, 20, SR / 6) / SR)
    damp = 1 / q
    lo = bp = 0.0
    out = np.empty_like(x)
    for i in range(len(x)):
        hi = x[i] - lo - damp * bp
        bp += f[i] * hi
        lo += f[i] * bp
        out[i] = bp if mode == "bp" else lo if mode == "lp" else hi
    return out


def butter(x, kind, fc, order=2):
    b, a = sg.butter(order, fc, btype=kind, fs=SR)
    return sg.lfilter(b, a, x)


# ───────────────────────── instruments ─────────────────────────

def kick(level=1.0, tight=1.0):
    n = int(0.5 * SR)
    t = tt(n)
    f = 44 + 120 * np.exp(-t * 32 * tight)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 6.5 * tight)
    click = butter(rng.standard_normal(n) * np.exp(-t * 900), "highpass", 2500) * 0.25
    return np.tanh(1.6 * (body + click)) * level


def boom():
    n = int(1.6 * SR)
    t = tt(n)
    f = 28 + 70 * np.exp(-t * 9)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 2.6)
    nz = butter(rng.standard_normal(n), "lowpass", 900) * np.exp(-t * 14) * 0.5
    return np.tanh(1.3 * (s + nz))


def clap():
    n = int(0.35 * SR)
    t = tt(n)
    nz = rng.standard_normal(n)
    env = np.zeros(n)
    for k, d in enumerate([0.0, 0.009, 0.019]):
        i = int(d * SR)
        env[i:] += np.exp(-(t[: n - i]) * 180) * (0.8 if k < 2 else 1.0)
    env += np.exp(-t * 22) * 0.35 * (t > 0.019)
    s = butter(nz * env, "bandpass", [950, 5200])
    return s * 0.9


def hat(open_=False):
    n = int((0.22 if open_ else 0.07) * SR)
    t = tt(n)
    s = butter(rng.standard_normal(n), "highpass", 7200) * np.exp(-t * (14 if open_ else 70))
    return s * 0.5


def ep_note(m, dur=1.4, vel=1.0):
    """Piano électrique FM (type DX) : porteuse + modulateur 1:1 décroissant."""
    n = int(dur * SR)
    t = tt(n)
    f = mtof(m)
    idx = 2.1 * np.exp(-t * 4.5) + 0.35
    s = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    s += 0.18 * np.sin(2 * np.pi * f * 14.0 * t) * np.exp(-t * 40)  # tine
    env = (1 - np.exp(-t * 400)) * np.exp(-t * 1.6)
    env *= np.clip((dur - t) / 0.08, 0, 1)
    return s * env * vel


def chord(ms, dur=1.4, vel=1.0, spread=0.004):
    n = int((dur + spread * len(ms)) * SR)
    L = np.zeros(n)
    R = np.zeros(n)
    for k, m in enumerate(ms):
        s = ep_note(m, dur, vel)
        i = int(k * spread * SR)
        p = -0.45 + 0.9 * k / max(1, len(ms) - 1)
        a = (p + 1) * math.pi / 4
        L[i:i + len(s)] += s * math.cos(a)
        R[i:i + len(s)] += s * math.sin(a)
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.2 * tt(n))
    return np.vstack([L * trem, R * trem[::-1]]) / len(ms) ** 0.6


def sub(m, dur=0.6, vel=1.0):
    n = int(dur * SR)
    t = tt(n)
    f = mtof(m)
    s = np.sin(2 * np.pi * f * t) + 0.22 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    env = (1 - np.exp(-t * 300)) * np.exp(-t * 2.2) * np.clip((dur - t) / 0.05, 0, 1)
    return np.tanh(2.4 * s * env) / np.tanh(2.4) * vel


def pad(ms, dur, attack=0.6):
    n = int(dur * SR)
    t = tt(n)
    out = np.zeros(n)
    for m in ms:
        for det in (-0.07, 0.0, 0.07):
            f = mtof(m + det)
            for h in range(1, 7):
                out += np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6.28)) / h
    out = butter(out, "lowpass", 1400)
    env = np.clip(t / attack, 0, 1) * np.clip((dur - t) / 0.4, 0, 1)
    return out * env / (len(ms) * 6)


def bell(m, dur=1.2, vel=1.0):
    n = int(dur * SR)
    t = tt(n)
    f = mtof(m)
    s = np.zeros(n)
    for r, a, d in [(1, 1, 3.2), (2.0, 0.45, 5), (3.0, 0.22, 7), (4.16, 0.12, 9), (5.43, 0.06, 12)]:
        s += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d)
    return s * (1 - np.exp(-t * 800)) * vel * 0.5


def ping(m, vel=1.0):
    """Notification : deux notes rapides, timbre verre."""
    a = bell(m, 0.5, 1.0)
    b = bell(m + 5, 0.6, 0.9)
    n = len(b) + int(0.07 * SR)
    s = np.zeros(n)
    s[: len(a)] += a
    s[int(0.07 * SR): int(0.07 * SR) + len(b)] += b
    return s * vel


def tick(freq=4200, vel=1.0, dec=900):
    n = int(0.025 * SR)
    t = tt(n)
    s = np.sin(2 * np.pi * freq * t) * np.exp(-t * dec) + butter(rng.standard_normal(n), "highpass", 3000) * np.exp(-t * 1500) * 0.4
    return s * vel


def blip(m, vel=1.0):
    n = int(0.09 * SR)
    t = tt(n)
    s = np.sin(2 * np.pi * mtof(m) * t) * np.exp(-t * 45) * (1 - np.exp(-t * 2000))
    return s * vel


def whoosh(dur, f0, f1, q=1.4, shape="swell"):
    n = int(dur * SR)
    t = tt(n) / dur
    fc = f0 * (f1 / f0) ** t
    s = svf(rng.standard_normal(n), fc, q, "bp")
    if shape == "swell":
        env = np.sin(np.pi * t) ** 1.5
    elif shape == "rise":
        env = t ** 2.2
    else:
        env = np.exp(-t * 4)
    return s * env * 0.6


def riser(dur):
    n = int(dur * SR)
    x = tt(n) / dur
    nz = svf(rng.standard_normal(n), 300 * (30 ** x), 0.9, "lp")
    f = 110 * (4 ** x)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.15
    return (nz * 0.5 + tone) * x ** 2.5


def marker(dur=0.32):
    n = int(dur * SR)
    t = tt(n)
    nz = butter(rng.standard_normal(n), "bandpass", [1800, 5200])
    am = 0.6 + 0.4 * np.sin(2 * np.pi * 38 * t)
    env = np.clip(t / 0.02, 0, 1) * np.exp(-t * 7)
    return nz * am * env * 0.35


def stereo(sig, width=0.4):
    """Élargit un signal mono par décorrélation légère."""
    d = int(0.011 * SR)
    r = np.concatenate([np.zeros(d), sig[:-d]])
    return np.vstack([sig, sig * (1 - width) + r * width])


# ───────────────────────── timeline de réplique JS ─────────────────────────

def clamp(x, a=0.0, b=1.0):
    return min(b, max(a, x))


def P(t, a, b):
    return clamp((t - a) / (b - a))


def outExpo(x):
    return 1.0 if x >= 1 else 1 - 2 ** (-10 * x)


def outQuart(x):
    return 1 - (1 - x) ** 4


# ═════════════════════════ 1 · HOOK (0 → 3 s) ═════════════════════════
DROP = 3.0

# nappe grave inquiète + pulsation sourde
place(music, stereo(pad([38, 45, 50], 3.05, attack=0.8), 0.5), 0.0, 0.55)
for k in range(6):
    place(music, butter(kick(0.55, 0.7), "lowpass", 180), k * BEAT, 0.35 + 0.1 * k)
# tic-tac de l'horloge (hats) qui monte
for k in range(12):
    tk = k * 0.25
    if tk < 2.62:
        place(music, hat(), tk, 0.18 + 0.28 * (tk / 2.6), pan=0.3 if k % 2 else -0.3)
# notifications
PINGS = [88, 91, 86, 93, 88, 90, 95, 86, 91, 93, 88, 96, 90]
for i, tc in enumerate(T["cards"]):
    tc = max(tc, 0.0)
    v = 0.5 if i < 5 else 0.42
    place(sfx, ping(PINGS[i % len(PINGS)] - 2, v), tc, 1.0, pan=(-0.55 if i % 2 else 0.55) * (0.4 + 0.6 * (i / 12)), rev=0.25)
    place(sfx, butter(kick(0.3, 2.2), "bandpass", [120, 900]), tc + 0.02, 0.35)  # carte qui tombe
# montée
place(sfx, stereo(riser(1.25), 0.5), 1.4, 0.55)
# balayage des cartes : whoosh panoramique gauche → droite
w = whoosh(0.42, 2600, 380, 1.1)
n = len(w)
pan = np.linspace(-0.9, 0.9, n)
a = (pan + 1) * np.pi / 4
place(sfx, np.vstack([w * np.cos(a), w * np.sin(a)]) * 1.4, 2.58, 1.1, rev=0.2)

# ═════════════════════════ 2 · GROOVE (3 → 17 s) ═════════════════════════
# grille d'accords (mesure = 2 s) : racine basse + voicing piano électrique
PROG = [
    (3.0, 38, [53, 57, 60, 64]),   # Dm9
    (5.0, 34, [53, 57, 60, 62]),   # Bbmaj9
    (7.0, 41, [52, 55, 57, 60]),   # Fmaj9
    (9.0, 36, [52, 55, 57, 62]),   # C6/9
    (11.0, 38, [53, 57, 60, 64]),  # Dm9
    (13.0, 34, [53, 57, 60, 62]),  # Bbmaj9
    (15.0, 43, [53, 57, 58, 62]),  # Gm9
    (16.0, 36, [53, 55, 58, 62]),  # C9sus
]
END_GROOVE = T["lock"]  # 17.0
for bar_t, root, voicing in PROG:
    bar_len = 1.0 if bar_t >= 15.0 else 2.0
    hits = [0.0, 0.75, 1.5] if bar_len == 2.0 else [0.0, 0.5]
    for j, h in enumerate(hits):
        tt0 = bar_t + h
        if tt0 >= END_GROOVE:
            continue
        place(music, chord(voicing, 0.9 if j else 1.3, 0.9 if j == 0 else 0.6), tt0, 0.52, rev=0.35)
        place(music, sub(root + 12, 0.55 if j < len(hits) - 1 else 0.45, 0.95), tt0, 0.36)
# pad chaud continu
place(music, stereo(pad([50, 57, 60, 64], 14.1, 1.2), 0.6), 3.0, 0.32)

kick_times = []
bt = DROP
while bt < END_GROOVE - 1e-6:
    kick_times.append(bt)
    place(music, kick(1.0), bt, 0.72)
    beat_in_bar = round((bt - DROP) / BEAT) % 4
    if beat_in_bar in (1, 3):
        place(music, clap(), bt, 0.55, rev=0.35)
    place(music, hat(), bt + 0.25, 0.32, pan=0.25)
    place(music, hat(), bt + 0.125, 0.09, pan=-0.3)
    place(music, hat(), bt + 0.375, 0.1, pan=-0.3)
    if beat_in_bar == 3:
        place(music, hat(True), bt + 0.25, 0.16, pan=0.35)
    bt += BEAT

# ═════════════════════════ 3 · FIN (17 → 20 s) ═════════════════════════
FIN = T["lock"]
place(music, kick(1.0), FIN, 0.7)
place(music, boom(), FIN, 0.4)
fin_chord = [52, 55, 57, 60, 64]  # Fmaj9
place(music, chord(fin_chord, 3.0, 1.0, spread=0.018), FIN, 0.5, rev=0.5)
place(music, stereo(pad([41, 48, 52, 57, 60, 64], 3.0, 0.3), 0.6), FIN, 0.62)
place(music, sub(41, 2.8, 1.0), FIN, 0.4)
place(music, chord(fin_chord, 1.8, 0.7, spread=0.02), T["tap"], 0.38, rev=0.5)
for k, m in enumerate([76, 79, 81, 84]):
    place(sfx, bell(m, 1.6, 0.5), FIN + 0.12 + k * 0.09, 0.35, pan=-0.4 + k * 0.27, rev=0.5)
# petit shaker qui garde la pulsation jusqu'au bout
for k in range(10):
    ts = FIN + 0.25 + k * 0.25
    if ts < 19.6:
        place(music, hat(), ts, 0.09 * (1 - k / 12), pan=0.3 if k % 2 else -0.3)

# ═════════════════════════ SFX calés image ═════════════════════════
# drop
place(sfx, boom(), DROP, 0.6)
place(sfx, stereo(butter(rng.standard_normal(int(1.4 * SR)) * np.exp(-tt(int(1.4 * SR)) * 3.2), "highpass", 5000), 0.7), DROP, 0.12, rev=0.4)

# services qui défilent : cliquetis ; "de tout." : impact
for i, c in enumerate(T["cyc"][:-1]):
    place(sfx, tick(3600 + i * 180, 0.55), c, 1.0, pan=0.2 * (-1) ** i)
    place(sfx, blip(81 + [0, 2, 4, 7, 9, 12][i], 0.25), c, 1.0, rev=0.2)
tout = T["cyc"][-1]
place(sfx, whoosh(0.22, 800, 3000, 1.2, "rise"), tout - 0.22, 0.5)
place(sfx, boom(), tout, 0.45)
place(music, chord([57, 60, 64, 69], 1.0, 1.0, 0.01), tout, 0.25, rev=0.4)

# "VOUS PERCEVEZ." : cloche + trait de surligneur
place(sfx, bell(84, 1.4, 0.6), T["perc"], 0.5, pan=-0.2, rev=0.45)
place(sfx, bell(88, 1.4, 0.5), T["perc"] + 0.06, 0.4, pan=0.2, rev=0.45)
place(sfx, marker(0.36), T["perc"] + 0.14, 0.9, pan=0.1)

# transition miel → ardoise
w23 = T["w23"]
place(sfx, whoosh(0.34, 300, 4200, 1.3, "rise"), w23[0] - 0.02, 0.8, rev=0.2)

# compteur : un clic à chaque passage de chiffre + impact à chaque stat
tA, tC, tD = T["st"]


def rolls(t):
    eC = outQuart(P(t, tC, tC + 0.75))
    eD = outQuart(P(t, tD, tD + 0.75))
    p1 = -1 + 14 * outExpo(P(t, tA, tA + 0.8)) + 6 * eC + 5 * eD
    p2 = -1 + 11 * eC + 8 * eD
    p3 = -1 + 13 * eD
    return p1, p2, p3


prev = rolls(tA - 0.01)
last_tick = -1.0
for k in range(int((12.4 - tA) * 1000)):
    t = tA + k / 1000
    cur = rolls(t)
    crossed = sum(1 for a, b in zip(prev, cur) if math.floor(a) != math.floor(b))
    if crossed and t - last_tick > 0.012:
        place(sfx, tick(2600 + 900 * rng.random(), 0.32, 1400), t, 1.0, pan=rng.uniform(-0.3, 0.3))
        last_tick = t
    prev = cur
for ts in T["st"]:
    place(sfx, boom(), ts, 0.34)
    place(sfx, whoosh(0.24, 500, 2600, 1.2, "rise"), ts - 0.24, 0.4)
# barres qui poussent
place(sfx, whoosh(0.6, 400, 1600, 2.0, "swell"), tA + 0.3, 0.22, pan=0.3)
# calendrier : 27 nuits réservées → arpège pentatonique ascendant
penta = [0, 2, 4, 7, 9]
for k in range(27):
    m = 72 + 12 * (k // 5) // 2 + penta[k % 5]
    place(sfx, blip(min(m, 100), 0.16), tC + 0.3 + k * 0.028, 1.0, pan=-0.6 + 1.2 * k / 26, rev=0.15)
# étoiles
for i in range(5):
    place(sfx, tick(1800, 0.35, 600), tD + 0.14 + i * 0.07, 1.0)
    place(sfx, bell([79, 81, 84, 86, 88][i], 1.0, 0.35), tD + 0.4 + i * 0.11, 0.45, pan=-0.5 + 0.25 * i, rev=0.4)

# Toulouse : volet montant + cliquetis des quartiers qui passent au centre
s4a, s4b = T["s4in"]
place(sfx, whoosh(0.36, 350, 3800, 1.2, "rise"), s4a - 0.12, 0.8, rev=0.2)
place(sfx, boom(), s4b, 0.4)


def wall_scroll(t):
    p = 1 - (1 - P(t, s4a - 0.1, T["s4fg"] + 0.1)) ** 3
    return -60 + (-2300 + 60) * p - (t - s4a) * 30


prevc = None
for k in range(int((T["s4fg"] + 0.1 - s4a) * 1000)):
    t = s4a + k / 1000
    sc = wall_scroll(t)
    c = math.floor((800 - sc - 79) / 158)
    if prevc is not None and c != prevc:
        place(sfx, tick(1500, 0.45, 700), t, 1.0, pan=0.15)
    prevc = c
place(sfx, boom(), T["s4fg"], 0.35)
for i in range(5):
    place(sfx, blip(84 + [0, 2, 4, 7, 9][i], 0.2), T["s4fg"] + 0.5 + i * 0.05, 1.0, pan=-0.3 + 0.15 * i, rev=0.3)

# CTA : iris, impacts sur les mots, tap
s5a, s5b = T["s5in"]
place(sfx, whoosh(0.34, 250, 3000, 1.1, "rise"), s5a - 0.06, 0.8, rev=0.25)
place(sfx, boom(), T["est"], 0.5)
place(sfx, stereo(butter(rng.standard_normal(int(1.2 * SR)) * np.exp(-tt(int(1.2 * SR)) * 3.5), "highpass", 5500), 0.7), T["est"], 0.1, rev=0.4)
place(sfx, butter(kick(0.6, 1.5), "lowpass", 400), T["grat"], 0.35)
place(sfx, butter(kick(0.6, 1.5), "lowpass", 400), T["sous"], 0.35)
place(sfx, marker(0.3), T["sous"] + 0.1, 0.6)
tap = T["tap"]
place(sfx, tick(1100, 0.9, 260), tap, 0.9)
place(sfx, blip(79, 0.5), tap + 0.02, 1.0, rev=0.3)
place(sfx, blip(84, 0.45), tap + 0.1, 1.0, rev=0.3)

# ═════════════════════════ mixage ═════════════════════════
# sidechain : la musique respire sur chaque kick
duck = np.ones(N)
for kt in kick_times[1:]:
    i = int(kt * SR)
    n = min(int(0.3 * SR), N - i)
    duck[i:i + n] = np.minimum(duck[i:i + n], 1 - 0.35 * np.exp(-tt(n) * 14))
music_d = music.copy()
music_d[:, : int(END_GROOVE * SR)] *= duck[: int(END_GROOVE * SR)]

# réverbe : IR bruit décroissant stéréo décorrélé, filtré
ir_n = int(1.8 * SR)
irt = tt(ir_n)
ir = np.vstack([
    butter(rng.standard_normal(ir_n) * np.exp(-irt * 3.4), "lowpass", 5500),
    butter(rng.standard_normal(ir_n) * np.exp(-irt * 3.4), "lowpass", 5500),
])
ir[:, : int(0.018 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
wet = np.vstack([sg.fftconvolve(send[c], ir[c])[:N] for c in range(2)]) * 0.55

mix = music_d * 0.85 + sfx * 1.0 + wet
mix = butter(mix, "highpass", 38)
# fondu final
fo = int(0.5 * SR)
mix[:, -fo:] *= np.linspace(1, 0, fo) ** 1.5
# légère saturation de bus puis crête
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix /= np.max(np.abs(mix)) * 1.02

raw = os.path.join(BUILD, "audio_raw.wav")
from scipy.io import wavfile

wavfile.write(raw, SR, (mix.T * 32767).astype(np.int16))

# normalisation loudness (2 passes)
ff = os.environ.get("FFMPEG") or subprocess.check_output(
    [sys.executable, "-c", "import imageio_ffmpeg as f;print(f.get_ffmpeg_exe())"]).decode().strip()
out = subprocess.run([ff, "-hide_banner", "-i", raw, "-af", "loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
m = json.loads(out[out.rindex("{"): out.rindex("}") + 1])
af = (f"loudnorm=I=-14:TP=-1.5:LRA=9:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
      f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
subprocess.run([ff, "-y", "-loglevel", "error", "-i", raw, "-af", af, "-ar", "48000", os.path.join(BUILD, "audio.wav")], check=True)
print(f"audio → build/audio.wav  (entrée {m['input_i']} LUFS, crête {m['input_tp']} dBTP)")
