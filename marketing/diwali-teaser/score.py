"""QUOIN Diwali teaser — score and sound design, synthesised from scratch.

No sample library and no generative-audio credits were available, so every
element here is built out of oscillators, noise and a Karplus-Strong string.
The Indian undertone is carried by a tanpura-style drone (Sa-Pa-Sa) and a
santoor-like plucked motif on a major pentatonic, rather than by any
instrument sample.

Cue sheet (seconds):
  0.55  ignition spark + air
  0.55  sub swell and drone enter
  4.00  transition whoosh; santoor motif
  8.60  build: pulse ostinato + riser
 13.45  BASS DROP, on the exact frame the light uncovers the mark
 17.00  warm resolve, santoor arpeggio, long tail
"""
import numpy as np

SR, DUR = 48000, 20.0
N = int(SR*DUR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)

def place(buf, sig, t, gain=1.0, pan=0.0):
    i = int(t*SR); j = min(N, i+len(sig))
    if i >= N or j <= i: return
    buf[i:j] += sig[:j-i]*gain

def stereo(sig, t, gain=1.0, width=0.0):
    place(L, sig, t, gain*(1-max(0, width)*0.5))
    place(R, sig, t+ (0.004 if width else 0.0), gain*(1-max(0,-width)*0.5))

def env_ad(n, a, d, p=1.0):
    t = np.arange(n)/SR
    at = np.clip(t/max(a,1e-5), 0, 1)
    dc = np.exp(-np.maximum(t-a, 0)/max(d,1e-5))
    return (at**p)*dc

# ---------------------------------------------------------------- elements
def drone(freqs, dur, shimmer=0.12):
    t = np.arange(int(dur*SR))/SR
    s = np.zeros_like(t)
    for f in freqs:
        for h, amp in [(1,1.0),(2,0.34),(3,0.19),(4,0.10),(5,0.055),(7,0.03)]:
            det = 1 + 0.0014*np.sin(2*np.pi*(0.09+0.013*h)*t + h*1.7)
            s += amp*np.sin(2*np.pi*f*h*det*t)
    s /= len(freqs)*1.7
    s *= 1 + shimmer*np.sin(2*np.pi*0.21*t + 0.6)
    return s

def sub(f0, f1, dur, decay=2.4, drive=0.0):
    t = np.arange(int(dur*SR))/SR
    f = f1 + (f0-f1)*np.exp(-t*8.0)
    ph = 2*np.pi*np.cumsum(f)/SR
    s = np.sin(ph)*np.exp(-t*decay)
    if drive: s = (1-drive)*s + drive*np.tanh(s*3.0)*np.exp(-t*decay)
    return s

def pluck(freq, dur, damp=0.9965, soft=0.55, amp=1.0):
    """Karplus-Strong: the santoor/sitar-ish voice."""
    P = max(8, int(SR/freq))
    buf = rng.uniform(-1, 1, P)
    k = np.ones(5)/5
    buf = soft*np.convolve(buf, k, mode='same') + (1-soft)*buf
    n = int(dur*SR); out = np.empty(n); idx = 0
    for i in range(n):
        out[i] = buf[idx]
        nxt = (idx+1) % P
        buf[idx] = damp*0.5*(buf[idx] + buf[nxt])
        idx = nxt
    return out*np.exp(-np.arange(n)/SR*1.05)*amp

def noise_band(dur, lo_k, hi_k):
    """Noise crossfaded between two smoothing widths — a cheap moving filter."""
    n = int(dur*SR); x = rng.uniform(-1, 1, n)
    def sm(w):
        if w <= 1: return x
        c = np.cumsum(np.insert(x, 0, 0))
        y = (c[w:] - c[:-w])/w
        return np.pad(y, (0, n-len(y)), mode='edge')
    k = np.linspace(0, 1, n)
    return sm(hi_k)*(1-k) + sm(lo_k)*k

def whoosh(dur, peak=1.0, rev=False):
    n = int(dur*SR)
    s = noise_band(dur, 2, 40)
    k = np.linspace(0, 1, n)
    e = np.sin(np.pi*k)**1.6
    if rev: e = k**2.6
    return s*e*peak

def riser(dur, f0=180, f1=2600):
    n = int(dur*SR); t = np.arange(n)/SR; k = t/dur
    f = f0*(f1/f0)**k
    ph = 2*np.pi*np.cumsum(f)/SR
    s = noise_band(dur, 3, 18)*0.45*k**2 + np.sin(ph)*0.22*k**3
    return s

def tabla(f=92, dur=0.5):
    n = int(dur*SR); t = np.arange(n)/SR
    f_ = f*(1 + 1.9*np.exp(-t*55))
    ph = 2*np.pi*np.cumsum(f_)/SR
    s = np.sin(ph)*np.exp(-t*11.0)
    c = int(0.006*SR)
    s[:c] += rng.uniform(-1,1,c)*np.exp(-np.arange(c)/(0.0018*SR))*0.5
    return s

def pad(freqs, dur, attack=1.2):
    t = np.arange(int(dur*SR))/SR
    s = np.zeros_like(t)
    for f in freqs:
        for d in (-0.07, 0.0, 0.08):
            vib = 1 + 0.0018*np.sin(2*np.pi*0.27*t + f)
            s += np.sin(2*np.pi*(f+d)*vib*t)
            s += 0.22*np.sin(2*np.pi*2*(f+d)*vib*t)
    s /= len(freqs)*3.6
    a = np.clip(t/attack, 0, 1)**1.4
    return s*a

# scale (Sa Re Ga Pa Dha on C)
C3,D3,E3,G3,A3 = 130.81,146.83,164.81,196.00,220.00
C4,D4,E4,G4,A4 = 261.63,293.66,329.63,392.00,440.00
C5,E5,G5       = 523.25,659.26,783.99

# ------------------------------------------------------------------ 0-4 s
stereo(drone([65.41, 98.00, 130.81], 9.2)*np.clip(np.linspace(0,1,int(9.2*SR))*2.2,0,1), 0.52, 0.17, 0.3)
spark = noise_band(0.22, 2, 3)*np.exp(-np.arange(int(0.22*SR))/SR*34)
stereo(spark, 0.55, 0.30)
stereo(whoosh(0.9, 0.5), 0.40, 0.22, -0.3)
stereo(sub(70, 44, 4.5, decay=0.85), 0.55, 0.42)
stereo(pad([C3, G3], 4.4, attack=1.8), 0.70, 0.10)

# ------------------------------------------------------------------ 4-8 s
stereo(whoosh(1.1, 0.75), 3.72, 0.26, 0.4)
stereo(sub(58, 41, 4.4, decay=0.7), 4.00, 0.34)
stereo(drone([65.41, 98.00, 130.81], 9.5), 4.00, 0.15, -0.25)
stereo(pad([C3, G3, C4], 4.6, attack=1.4), 4.05, 0.15)
for t_, f_, g_ in [(4.35,C4,0.5),(4.92,E4,0.42),(5.46,G4,0.46),(6.10,A4,0.36),
                   (6.72,G4,0.34),(7.28,E4,0.30)]:
    stereo(pluck(f_, 2.2, amp=g_), t_, 0.30, 0.25 if f_>300 else -0.2)

# ----------------------------------------------------------------- 8-13 s
stereo(pad([C3, E3, G3, C4], 5.2, attack=1.1), 8.05, 0.17)
stereo(drone([65.41, 98.00], 5.3), 8.00, 0.13)
t_ = 8.60
while t_ < 12.75:                      # the pulse that drives the build
    k = (t_-8.60)/4.15
    stereo(tabla(88, 0.45), t_, 0.16 + 0.30*k)
    t_ += 0.40
stereo(riser(4.1, 170, 2400), 8.75, 0.16)
for t_, f_ in [(9.30,G4),(10.05,A4),(10.80,C5),(11.55,E5),(12.15,G5)]:
    stereo(pluck(f_, 1.8, amp=0.34), t_, 0.26, 0.3)
stereo(sub(52, 38, 5.0, decay=0.5), 8.00, 0.30)
stereo(whoosh(0.85, 0.9, rev=True), 12.60, 0.30)   # suck into the cut

# ---------------------------------------------------- 13.45 s  BASS DROP
DROP = 13.45
stereo(sub(96, 33, 5.2, decay=1.05, drive=0.35), DROP, 0.95)
stereo(tabla(66, 1.1), DROP, 0.42)
splash = noise_band(2.4, 4, 9)*np.exp(-np.arange(int(2.4*SR))/SR*2.6)
stereo(splash, DROP, 0.11, 0.5)
stereo(pad([C3, G3, C4, E4], 3.6, attack=0.22), DROP+0.02, 0.26)
stereo(drone([65.41, 98.00, 130.81], 3.6), DROP+0.05, 0.13)
stereo(pluck(C4, 3.0, amp=0.5), DROP+0.04, 0.24)

# ----------------------------------------------------------------- 17-20 s
stereo(pad([C3, E3, G3, C4, E4], 3.3, attack=0.9), 16.95, 0.24)
stereo(drone([65.41, 98.00, 130.81], 3.2), 17.00, 0.13)
stereo(sub(46, 36, 3.2, decay=0.55), 17.00, 0.26)
for t_, f_, g_ in [(17.45,C4,0.42),(17.92,E4,0.38),(18.38,G4,0.36),
                   (18.90,C5,0.32),(19.35,G4,0.22)]:
    stereo(pluck(f_, 2.6, amp=g_), t_, 0.26, 0.2)

# -------------------------------------------------------- space and master
def reverb(x, tail=2.0, mix=0.26):
    n = int(tail*SR)
    t = np.arange(n)/SR
    ir = rng.uniform(-1, 1, n)*np.exp(-t*3.1)
    ir[:int(0.013*SR)] = 0                     # pre-delay
    nf = 1 << int(np.ceil(np.log2(len(x)+n)))
    y = np.fft.irfft(np.fft.rfft(x, nf)*np.fft.rfft(ir, nf), nf)[:len(x)]
    y /= (np.max(np.abs(y)) + 1e-9)
    return (1-mix)*x + mix*y*np.max(np.abs(x))

L, R = reverb(L), reverb(R)
fade = np.ones(N)
k = int(0.45*SR); fade[-k:] = np.linspace(1, 0, k)**1.6
k0 = int(0.10*SR); fade[:k0] = np.linspace(0, 1, k0)
L *= fade; R *= fade
out = np.stack([L, R], 1)
out = np.tanh(out*1.15)*0.92                   # soft clip, no hard edges
out /= (np.max(np.abs(out)) + 1e-9)
out *= 0.89
np.save('/home/user/quoin/audio/score.npy', out.astype(np.float32))
import wave
w = wave.open('/home/user/quoin/audio/score.wav','wb')
w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((out*32767).astype('<i2').tobytes()); w.close()
print('score.wav written', round(len(out)/SR,3), 's  peak', round(float(np.max(np.abs(out))),3))
