#!/usr/bin/env python3
"""The sounds of the table Tidal Lock, made again from nothing: assets/tables/tidal-lock/sounds/*.mp3.

Two kinds, as the table's LICENSES.md says:
- recorded mechanics, cut out of recordings published under CC0 on freesound.org (a 1977 pinball machine and a marble
  on a table): the flippers, the bumpers, the slingshots, the plunger, the drain, the ball that rolls, lands and knocks;
- everything else is synthesised here, sample by sample: the effects of the targets, lanes, ramp and dock, the jingles
  of the rules, and the four pieces of music. Nothing is sampled from a game.

usage: tidal_lock_sounds.py [--only name,name...] [--cache <dir>] [--out <dir>]
  --only    make these sounds only (the names of the files, without .mp3)
  --cache   where the recordings are downloaded (default: a folder in the temporary directory, kept between runs)
  --out     where the files go (default: the table's sounds folder)
needs python3 and ffmpeg with libmp3lame; the recordings need the network once.
The files are MP3, mono: the format zinc:audio decodes that is smallest for this (the whole set is under 1 MB), and one
that loops without a gap (the encoder's delay is written in the file and skipped by the decoder)."""
import array, math, os, random, subprocess, sys, tempfile, urllib.request, wave

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'tables', 'tidal-lock', 'sounds')
FX = 44100      # effects
MUSIC = 32000   # music: nothing above 15 kHz in it, and a lower rate spends the bits better
TAU = 2 * math.pi

# ---------------------------------------------------------------- the recordings (all CC0: see LICENSES.md)
SOURCES = {
    'flipper': 'https://cdn.freesound.org/previews/450/450270_98337-hq.ogg',   # schafferdavid, pinball-flipper hits.wav
    'bumper': 'https://cdn.freesound.org/previews/450/450265_98337-hq.ogg',    # schafferdavid, pinball-bumper hits.wav
    'plunger': 'https://cdn.freesound.org/previews/450/450267_98337-hq.ogg',   # schafferdavid, pinball-ball being launched by plunger.wav
    'trough': 'https://cdn.freesound.org/previews/450/450266_98337-hq.ogg',    # schafferdavid, pinball-ball falling under flippers.wav
    'marble': 'https://cdn.freesound.org/previews/458/458137_7254624-hq.ogg',  # NeatoEnt, Ball on table.wav
    'hole': 'https://cdn.freesound.org/previews/458/458136_7254624-hq.ogg',    # NeatoEnt, Ball in hole.wav
}
_decoded = {}


def recording(key, cache):
    """The samples of a recording, mono at FX, downloaded once."""
    if key not in _decoded:
        os.makedirs(cache, exist_ok=True)
        path = os.path.join(cache, key + '.ogg')
        if not os.path.exists(path):
            req = urllib.request.Request(SOURCES[key], headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as r, open(path, 'wb') as f:
                f.write(r.read())
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(FX), '-f', 's16le', '-'], check=True, capture_output=True).stdout
        a = array.array('h')
        a.frombytes(raw)
        _decoded[key] = [v / 32768 for v in a]
    return _decoded[key]


def cut(key, start, end, cache, fade_in=0.003, fade_out=0.03):
    """A stretch of a recording, faded at both ends."""
    s = recording(key, cache)[int(start * FX):int(end * FX)]
    return faded(s, FX, fade_in, fade_out)


def faded(s, rate, fade_in, fade_out):
    n, a, b = len(s), int(fade_in * rate), int(fade_out * rate)
    for i in range(min(a, n)):
        s[i] *= i / a
    for i in range(min(b, n)):
        s[n - 1 - i] *= i / b
    return s


def looped(s, rate, overlap):
    """A stretch that can be played round and round: its end is mixed into its start, so there is no seam."""
    k = int(overlap * rate)
    body = s[:len(s) - k]
    for i in range(k):
        t = i / k
        body[i] = body[i] * math.sqrt(t) + s[len(s) - k + i] * math.sqrt(1 - t)
    return body


# ---------------------------------------------------------------- synthesis
def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def blep(t, dt):
    """The correction that takes the stair out of a saw or a square (polyBLEP): no buzz of aliasing in the high notes."""
    if t < dt:
        t /= dt
        return t + t - t * t - 1
    if t > 1 - dt:
        t = (t - 1) / dt
        return t * t + t + t + 1
    return 0.0


def osc(rate, seconds, f0, shape='sine', f1=None, duty=0.5, vibrato=0.0, vibrato_hz=5.5, curve=1.0):
    """An oscillator for `seconds`: its pitch goes from f0 to f1 (exponentially; curve > 1 gets there sooner), a vibrato of
    `vibrato` semitones may ride on it."""
    n = int(seconds * rate)
    out = [0.0] * n
    ph = 0.0
    ratio = (f1 / f0) if f1 else 1.0
    for i in range(n):
        f = f0 * ratio ** ((i / n) ** (1 / curve)) if f1 else f0
        if vibrato:
            f *= 2 ** (vibrato * math.sin(TAU * vibrato_hz * i / rate) / 12)
        dt = f / rate
        ph += dt
        ph -= int(ph)
        if shape == 'sine':
            out[i] = math.sin(TAU * ph)
        elif shape == 'tri':
            out[i] = 4 * abs(ph - 0.5) - 1
        elif shape == 'saw':
            out[i] = 2 * ph - 1 - blep(ph, dt)
        else:   # a pulse of width `duty`
            out[i] = (1.0 if ph < duty else -1.0) + blep(ph, dt) - blep((ph + 1 - duty) % 1, dt)
    return out


def noise(rate, seconds, seed):
    r = random.Random(seed)
    return [r.uniform(-1, 1) for _ in range(int(seconds * rate))]


def env(s, rate, attack=0.004, decay=0.0, sustain=1.0, release=0.02, power=1.0):
    """Attack, decay to `sustain`, hold, release over the last `release` seconds; decay = 0 with sustain < 1 is one long
    fall to `sustain` over the whole note (a plucked or struck sound)."""
    n, a, r = len(s), max(1, int(attack * rate)), max(1, int(release * rate))
    d = int(decay * rate)
    for i in range(n):
        if i < a:
            g = i / a
        elif d > 0:
            g = sustain + (1 - sustain) * max(0.0, 1 - (i - a) / d) ** 2
        else:
            g = sustain + (1 - sustain) * (1 - (i - a) / max(1, n - a)) ** power
        if i >= n - r:
            g *= (n - 1 - i) / r
        s[i] *= g
    return s


def decay(s, rate, half):
    """An exponential fall: half as loud every `half` seconds (a bell, a struck thing)."""
    k = 0.5 ** (1 / (half * rate))
    g = 1.0
    for i in range(len(s)):
        s[i] *= g
        g *= k
    return s


def lowpass(s, rate, hz, hz1=None, poles=2):
    """A low-pass filter whose corner may move from hz to hz1 over the sound."""
    n = len(s)
    for _ in range(poles):
        y = 0.0
        if hz1 is None:
            a = 1 - math.exp(-TAU * hz / rate)
            for i in range(n):
                y += a * (s[i] - y)
                s[i] = y
        else:
            fc, k = hz, (hz1 / hz) ** (1 / max(1, n))
            for i in range(n):
                y += (1 - math.exp(-TAU * fc / rate)) * (s[i] - y)
                s[i] = y
                fc *= k
    return s


def highpass(s, rate, hz):
    y = 0.0
    a = 1 - math.exp(-TAU * hz / rate)
    for i in range(len(s)):
        y += a * (s[i] - y)
        s[i] -= y
    return s


def bandpass(s, rate, hz, hz1, q):
    """A resonant band that sweeps from hz to hz1 (a state-variable filter): wind, a whoosh, a laser."""
    low = band = 0.0
    n = len(s)
    fc, k = hz, (hz1 / hz) ** (1 / max(1, n))
    for i in range(n):
        f = 2 * math.sin(math.pi * min(fc, rate / 6.5) / rate)
        low += f * band
        high = s[i] - low - band / q
        band += f * high
        s[i] = band
        fc *= k
    return s


def gain(s, g):
    return [v * g for v in s]


class Track:
    """A stretch of sound that parts are added to. In a loop, what passes the end comes back at the start, so the
    tail of the last note and of the echo lies under the first one and the loop has no seam."""

    def __init__(self, seconds, rate, loop=False):
        self.rate, self.loop = rate, loop
        self.n = int(round(seconds * rate))
        self.s = [0.0] * self.n

    def add(self, start, part, g=1.0):
        i, s, n = int(round(start * self.rate)), self.s, self.n
        if self.loop:
            for k, v in enumerate(part):
                s[(i + k) % n] += v * g
        else:
            for k, v in enumerate(part[:max(0, n - i)]):
                s[i + k] += v * g
        return self

    def echo(self, seconds, feedback, mix):
        """Adds echoes of the whole track, each `seconds` later and `feedback` as loud."""
        d, n, src = int(seconds * self.rate), self.n, list(self.s)
        g = mix
        for _ in range(6):
            if g < 0.02:
                break
            shifted = src[-d % n:] + src[:-d % n] if self.loop else [0.0] * d + src[:n - d]
            for i in range(n):
                self.s[i] += shifted[i] * g
            src = shifted
            g *= feedback
        return self


def note(rate, pitch, seconds, shape, attack=0.005, release=0.03, sustain=0.6, cutoff=None, cutoff1=None, duty=0.5, detune=0.0, vibrato=0.0, half=None):
    """One note of an instrument: an oscillator (two, `detune` semitones apart, when asked), filtered, shaped."""
    f = midi(pitch)
    s = osc(rate, seconds, f, shape, duty=duty, vibrato=vibrato)
    if detune:
        t = osc(rate, seconds, f * 2 ** (detune / 12), shape, duty=duty, vibrato=vibrato)
        s = [(a + b) * 0.5 for a, b in zip(s, t)]
    if cutoff:
        lowpass(s, rate, cutoff, cutoff1)
    if half:
        decay(s, rate, half)
    return env(s, rate, attack, 0.0, sustain, release)


def kick(rate):
    return env(osc(rate, 0.22, 150, 'sine', f1=42, curve=3), rate, 0.001, 0.0, 0.0, 0.02, power=1.6)


def snare(rate, seed):
    body = env(osc(rate, 0.12, 220, 'tri', f1=150), rate, 0.001, 0.0, 0.0, 0.01, power=2)
    rattle = env(highpass(noise(rate, 0.16, seed), rate, 1400), rate, 0.001, 0.0, 0.0, 0.01, power=2.5)
    return [a * 0.6 + b * 0.7 for a, b in zip(body + [0.0] * (len(rattle) - len(body)), rattle)]


def hat(rate, seed, seconds=0.04):
    return env(highpass(noise(rate, seconds, seed), rate, 6000), rate, 0.0005, 0.0, 0.0, 0.005, power=3)


def bell(rate, pitch, seconds, half=0.25, index=2.2, ratio=2.76):
    """A struck, glassy tone: one sine bending another (two-operator FM), bright at the strike and pure as it fades."""
    f, n = midi(pitch), int(seconds * rate)
    out = [0.0] * n
    k = 0.5 ** (1 / (half * 0.4 * rate))
    depth = index
    for i in range(n):
        t = i / rate
        out[i] = math.sin(TAU * f * t + depth * math.sin(TAU * f * ratio * t))
        depth *= k
    return env(decay(out, rate, half), rate, 0.002, 0.0, 1.0, 0.03)


CHORDS = {   # the notes of the chords the music uses, as semitones above D
    'Dm': (0, 3, 7), 'Bb': (8, 12, 15), 'C': (10, 14, 17), 'F': (3, 7, 12), 'Gm': (5, 8, 12), 'A': (7, 11, 14), 'Asus': (7, 12, 14),
    'Dm9': (0, 3, 7, 14), 'Bbmaj7': (8, 12, 15, 19), 'Gm7': (5, 8, 12, 15),
}
D2 = 38


def chord_root(name):
    return CHORDS[name][0]


def pad(track, t, seconds, chord, octave=1, g=0.16, cutoff=900):
    """A slow, wide chord: detuned saws behind a low-pass."""
    for semis in CHORDS[chord]:
        track.add(t, note(track.rate, D2 + 12 * octave + semis, seconds + 0.5, 'saw', attack=0.35, release=0.6, sustain=1.0, cutoff=cutoff, detune=0.14), g)


def play_theme():
    """The music of a ball in play: 112 beats a minute, eight bars in D minor, a bass that drives, an arpeggio with an echo."""
    beat, bars = 60 / 112, ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'F', 'Gm', 'A']
    tr = Track(len(bars) * 4 * beat, MUSIC, loop=True)
    lead = Track(len(bars) * 4 * beat, MUSIC, loop=True)
    r = MUSIC
    melody = {   # bars 5 to 8: (eighth of the bar, semitones above D4, eighths long)
        4: [(0, 7, 2), (2, 12, 2), (4, 15, 1), (5, 14, 1), (6, 12, 2)],
        5: [(0, 10, 2), (2, 7, 2), (4, 10, 2), (6, 15, 2)],
        6: [(0, 8, 2), (2, 12, 2), (4, 17, 1), (5, 15, 1), (6, 12, 2)],
        7: [(0, 14, 2), (2, 11, 2), (4, 7, 4)],
    }
    for b, chord in enumerate(bars):
        t0, root = b * 4 * beat, chord_root(chord)
        pad(tr, t0, 4 * beat, chord, g=0.11)
        for e, semis in enumerate([0, 0, 12, 0, 0, 7, 12, 7]):   # the bass, in eighths
            tr.add(t0 + e * beat / 2, note(r, D2 + root + semis, beat * 0.46, 'saw', release=0.02, cutoff=1400, cutoff1=220, sustain=0.5), 0.34)
        for q in range(4):
            if q % 2 == 0:
                tr.add(t0 + q * beat, kick(r), 0.8)
            else:
                tr.add(t0 + q * beat, snare(r, b * 4 + q), 0.34)
        if b % 2 == 1:
            tr.add(t0 + 2.5 * beat, kick(r), 0.6)
        for e in range(8):
            tr.add(t0 + e * beat / 2, hat(r, b * 8 + e), 0.10 if e % 2 else 0.05)
        tones = CHORDS[chord]
        for s in range(16):   # the arpeggio, in sixteenths: up the chord and its octave
            semis = tones[s % 3] + (12 if (s // 3) % 2 else 0)
            lead.add(t0 + s * beat / 4, note(r, D2 + 24 + semis, beat * 0.22, 'pulse', duty=0.25, release=0.02, sustain=0.2, cutoff=3200), 0.085)
        for e, semis, eighths in melody.get(b, []):
            lead.add(t0 + e * beat / 2, note(r, D2 + 24 + semis, eighths * beat / 2 * 0.92, 'tri', attack=0.012, release=0.05, sustain=0.75, vibrato=0.12), 0.17)
            lead.add(t0 + e * beat / 2, note(r, D2 + 24 + semis, eighths * beat / 2 * 0.92, 'saw', attack=0.012, release=0.05, sustain=0.6, cutoff=2400), 0.05)
    lead.echo(beat * 0.75, 0.45, 0.35)
    tr.add(0, lead.s)
    return tr.s


def attract_theme():
    """The music of a table that waits: slow chords, a drone, a few glassy notes far apart."""
    beat, bars = 60 / 76, ['Dm9', 'Bbmaj7', 'Gm7', 'Asus']
    tr = Track(len(bars) * 4 * beat, MUSIC, loop=True)
    bells = Track(len(bars) * 4 * beat, MUSIC, loop=True)
    r = MUSIC
    notes = [[(0, 24), (1.5, 31), (3, 26)], [(0.5, 27), (2, 32), (3.5, 24)], [(0, 29), (1.5, 27), (3, 24)], [(0.5, 26), (2, 31), (3, 23)]]
    for b, chord in enumerate(bars):
        t0 = b * 4 * beat
        pad(tr, t0, 4 * beat, chord, g=0.15, cutoff=700)
        tr.add(t0, note(r, D2 + (0 if b < 3 else -5), 4 * beat + 0.4, 'sine', attack=0.5, release=0.8, sustain=1.0), 0.2)
        for at, semis in notes[b]:
            bells.add(t0 + at * beat, bell(r, D2 + 24 + semis, 1.6, half=0.35, index=1.6), 0.13)
    bells.echo(beat * 1.5, 0.5, 0.5)
    tr.add(0, bells.s)
    return tr.s


def multiball_theme():
    """The music of multiball: 138 beats a minute, a kick on every beat, the bass in sixteenths, a lead that climbs."""
    beat, bars = 60 / 138, ['Dm', 'Dm', 'F', 'C', 'Dm', 'Dm', 'Bb', 'A']
    tr = Track(len(bars) * 4 * beat, MUSIC, loop=True)
    lead = Track(len(bars) * 4 * beat, MUSIC, loop=True)
    r = MUSIC
    riff = [0, 12, 7, 12, 3, 12, 7, 12, 0, 12, 7, 12, 3, 12, 19, 12]   # semitones above the chord's root, in sixteenths; 3 stands for its third
    for b, chord in enumerate(bars):
        t0, root = b * 4 * beat, chord_root(chord)
        pad(tr, t0, 4 * beat, chord, g=0.09, cutoff=1300)
        for s in range(16):
            tr.add(t0 + s * beat / 4, note(r, D2 + root + (12 if s % 2 else 0), beat * 0.2, 'saw', release=0.015, cutoff=1800, cutoff1=300, sustain=0.5), 0.3)
            third = CHORDS[chord][1] - root
            semis = third if riff[s] == 3 else riff[s]
            lead.add(t0 + s * beat / 4, note(r, D2 + 12 + root + semis, beat * 0.21, 'saw', release=0.02, sustain=0.3, cutoff=4200, detune=0.1), 0.085)
        for q in range(4):
            tr.add(t0 + q * beat, kick(r), 0.85)
            tr.add(t0 + (q + 0.5) * beat, hat(r, b * 4 + q, 0.09), 0.13)
            if q % 2 == 1:
                tr.add(t0 + q * beat, snare(r, 100 + b * 4 + q), 0.32)
        if b % 4 == 3:   # a climb into the next four bars
            tr.add(t0 + 2 * beat, env(bandpass(noise(r, 2 * beat, 7 + b), r, 500, 5000, 3), r, 2 * beat * 0.9, 0.0, 1.0, 0.03), 0.16)
            lead.add(t0 + 2 * beat, env(osc(r, 2 * beat, midi(D2 + 24 + root), 'saw', f1=midi(D2 + 36 + root)), r, 0.2, 0.0, 1.0, 0.04), 0.07)
    lead.echo(beat * 0.75, 0.4, 0.3)
    tr.add(0, lead.s)
    return tr.s


def over_theme():
    """The music after the last ball: the chords come down and fade, a glassy line goes down with them."""
    tr = Track(6.5, MUSIC)
    bells = Track(6.5, MUSIC)
    for i, chord in enumerate(['Dm', 'Bb', 'Gm', 'Dm']):
        pad(tr, i * 1.3, 1.6, chord, octave=1 if i < 3 else 0, g=0.16, cutoff=800 - i * 120)
    for i, semis in enumerate([24, 19, 15, 12, 7]):
        bells.add(0.1 + i * 0.65, bell(MUSIC, D2 + 24 + semis, 1.8, half=0.4, index=1.4), 0.15)
    bells.echo(0.5, 0.45, 0.45)
    tr.add(0, bells.s)
    return faded(tr.s, MUSIC, 0.01, 2.0)


def seq(rate, notes, shape='pulse', step=0.09, hold=0.9, g=1.0, duty=0.25, cutoff=None, tail=0.0):
    """Notes one after the other: (pitch, steps long) rows; a pitch of None is a rest."""
    total = sum(n for _, n in notes) * step + tail
    tr = Track(total, rate)
    t = 0.0
    for pitch, steps in notes:
        if pitch is not None:
            tr.add(t, note(rate, pitch, steps * step * hold + (tail if t + steps * step >= total - tail - 1e-9 else 0), shape, duty=duty, sustain=0.5, release=0.03, cutoff=cutoff), g)
        t += steps * step
    return tr


def effects(cache):
    """Every effect, by the name of its file: a function that returns its samples at FX."""
    r = FX

    def thud():   # a ball on a rubber post
        return [a + b * 0.25 for a, b in zip(env(osc(r, 0.1, 170, 'sine', f1=70, curve=2), r, 0.001, 0.0, 0.0, 0.01, power=1.5), lowpass(noise(r, 0.1, 1), r, 900, 200))]

    def target():   # a standup target: a struck plate, bright
        return [a + b * 0.3 for a, b in zip(bell(r, 88, 0.32, half=0.07, index=3.0, ratio=3.51), env(highpass(noise(r, 0.32, 2), r, 3000), r, 0.0005, 0.0, 0.0, 0.3, power=40))]

    def shield():   # a drop target goes down: a blip that falls, and the thunk of the plate
        tr = Track(0.2, r)
        tr.add(0, env(osc(r, 0.13, 700, 'pulse', f1=230, duty=0.3), r, 0.002, 0.0, 0.2, 0.02), 0.6)
        tr.add(0.02, env(osc(r, 0.12, 120, 'sine', f1=60), r, 0.002, 0.0, 0.0, 0.02, power=1.5), 0.9)
        return tr.s

    def raise_():   # the bank comes back up
        return seq(r, [(69, 1), (74, 1), (81, 2)], step=0.045, g=0.8, cutoff=4000).s

    def lane():   # a top lane: two glassy notes going up
        tr = Track(0.42, r)
        tr.add(0, bell(r, 86, 0.2, half=0.06, index=1.2, ratio=2.0), 0.8)
        tr.add(0.07, bell(r, 93, 0.35, half=0.09, index=1.2, ratio=2.0), 0.8)
        return tr.s

    def inlane():
        return env(osc(r, 0.09, midi(81), 'tri', f1=midi(86)), r, 0.004, 0.0, 0.4, 0.03)

    def outlane():   # a ball on its way out: a saw that sinks
        return env(lowpass(osc(r, 0.4, 520, 'saw', f1=160, curve=1.5), r, 2600, 500), r, 0.005, 0.0, 0.5, 0.08)

    def gate():   # a wire gate swings: two tones that do not agree, very short
        return [a + b for a, b in zip(decay(osc(r, 0.06, 3100, 'sine'), r, 0.008), decay(osc(r, 0.06, 4740, 'sine'), r, 0.006))]

    def spin():   # one half turn of the spinner
        return [a * 0.7 + b * 0.5 for a, b in zip(decay(osc(r, 0.035, 1960, 'pulse', duty=0.3), r, 0.006), decay(highpass(noise(r, 0.035, 3), r, 4000), r, 0.002))]

    def whoosh():   # the ball takes the ramp: air
        s = bandpass(noise(r, 0.6, 4), r, 350, 3400, 4)
        n = len(s)
        return [v * math.sin(math.pi * (i / n) ** 0.8) ** 1.5 for i, v in enumerate(s)]

    def zap():   # the ball leaves the rail: a short falling ray
        return env(bandpass(osc(r, 0.3, 2100, 'saw', f1=260, curve=1.6), r, 3000, 500, 2.5), r, 0.002, 0.0, 0.3, 0.06)

    def wire():   # the ball rolls onto the wire rail: the wires ring
        s = [0.0] * int(0.5 * r)
        for f, g, half in ((1730, 1.0, 0.07), (2590, 0.7, 0.05), (4130, 0.5, 0.035), (5890, 0.3, 0.02)):
            for i, v in enumerate(decay(osc(r, 0.5, f, 'sine'), r, half)):
                s[i] += v * g
        return env(s, r, 0.001, 0.0, 1.0, 0.05)

    def capture():   # the dock takes the ball: the recorded thunk of a ball in a hole, and the clamps closing
        tr = Track(0.55, r)
        tr.add(0, gain(cut('hole', 10.272, 10.6, cache), 4.0))
        servo = osc(r, 0.4, 180, 'saw', f1=330, curve=0.7)
        tr.add(0.1, env(lowpass([v * (0.6 + 0.4 * math.sin(TAU * 31 * i / r)) for i, v in enumerate(servo)], r, 1800), r, 0.05, 0.0, 1.0, 0.12), 0.22)
        return tr.s

    def eject():   # the dock sends the ball up: a thump, and air let out
        tr = Track(0.45, r)
        tr.add(0, env(osc(r, 0.2, 60, 'sine', f1=170, curve=0.6), r, 0.002, 0.0, 0.0, 0.03, power=1.2), 1.0)
        tr.add(0.01, env(bandpass(noise(r, 0.42, 5), r, 600, 5200, 2), r, 0.004, 0.0, 0.0, 0.05, power=2.2), 0.5)
        return tr.s

    def start():   # a new game: up the chord of D minor to its octave
        return seq(r, [(62, 1), (65, 1), (69, 1), (74, 1), (77, 1), (81, 3)], step=0.085, cutoff=5000, tail=0.25).echo(0.17, 0.4, 0.3).s

    def ready():   # a ball is served
        return seq(r, [(69, 1), (74, 2)], shape='tri', step=0.1, tail=0.12).s

    def saved():   # the ball comes back
        return seq(r, [(74, 1), (81, 1), (86, 1), (81, 1), (86, 2)], step=0.06, cutoff=6000, tail=0.15).echo(0.12, 0.4, 0.3).s

    def tilt():   # the table is tilted: two low squares that grind and sink
        a = osc(r, 1.1, 116, 'pulse', f1=62, curve=0.8)
        b = osc(r, 1.1, 123, 'pulse', f1=65, curve=0.8, duty=0.4)
        s = [(x + y) * 0.5 * (0.65 + 0.35 * math.sin(TAU * 11 * i / r)) for i, (x, y) in enumerate(zip(a, b))]
        return env(lowpass(s, r, 1500, 500), r, 0.005, 0.0, 0.7, 0.25)

    def mission():   # a mission is done: three notes up, then the chord held
        tr = seq(r, [(62, 1), (65, 1), (69, 1), (None, 6)], step=0.11, cutoff=5000)
        for p in (74, 77, 81):
            tr.add(0.33, note(r, p, 0.62, 'pulse', duty=0.3, sustain=0.6, release=0.2, cutoff=5000, detune=0.08), 0.5)
        tr.add(0.33, note(r, 38, 0.6, 'saw', sustain=0.6, release=0.15, cutoff=900), 0.6)
        return tr.echo(0.165, 0.35, 0.25).s

    def rank():   # a promotion: a run up the scale
        return seq(r, [(74, 1), (76, 1), (77, 1), (79, 1), (81, 1), (84, 1), (86, 3)], shape='tri', step=0.055, tail=0.2).echo(0.11, 0.45, 0.35).s

    def siren():   # multiball starts: a siren that climbs, and air that rises under it
        n = int(1.6 * r)
        ph, s = 0.0, [0.0] * n
        for i in range(n):
            t = i / n
            f = 300 * 4 ** t * 2 ** (0.25 * math.sin(TAU * 7.5 * i / r))
            ph = (ph + f / r) % 1
            s[i] = 2 * ph - 1 - blep(ph, f / r)
        tr = Track(1.7, r)
        tr.add(0, env(lowpass(s, r, 3800), r, 0.05, 0.0, 1.0, 0.12), 0.6)
        tr.add(0, env(bandpass(noise(r, 1.6, 6), r, 300, 6000, 3), r, 1.4, 0.0, 1.0, 0.1), 0.45)
        return tr.s

    def calm():   # multiball is over
        return env(osc(r, 0.6, 880, 'tri', f1=196, curve=1.4, vibrato=0.2), r, 0.01, 0.0, 0.5, 0.2)

    def jackpot():   # the chord of D major struck hard, and sparks above it
        tr = Track(1.5, r)
        for p in (50, 62, 66, 69, 74):
            tr.add(0, note(r, p, 1.0, 'saw', sustain=0.0, release=0.1, cutoff=6000, cutoff1=900, detune=0.12), 0.3)
        tr.add(0, env(osc(r, 0.3, 110, 'sine', f1=45), r, 0.002, 0.0, 0.0, 0.03, power=1.5), 0.9)
        for i, p in enumerate((86, 90, 93, 98, 102, 105)):
            tr.add(0.12 + i * 0.07, bell(r, p, 0.5, half=0.08, index=1.0, ratio=2.0), 0.3)
        return tr.echo(0.21, 0.4, 0.3).s

    def extra():   # an extra ball
        return seq(r, [(69, 1), (74, 1), (69, 1), (74, 1), (77, 1), (81, 4)], step=0.075, cutoff=5500, tail=0.2).echo(0.15, 0.4, 0.3).s

    def over():   # the game is over: four notes down
        return seq(r, [(74, 2), (72, 2), (70, 2), (69, 5)], shape='tri', step=0.12, hold=0.95, tail=0.3).s

    def nudge():   # the table is bumped: the cabinet takes the shove (a low knock on wood), and what is loose in it rattles
        tr = Track(0.32, r)
        tr.add(0, env(osc(r, 0.2, 92, 'sine', f1=48, curve=1.6), r, 0.002, 0.0, 0.0, 0.03, power=1.6), 1.0)
        tr.add(0, env(lowpass(noise(r, 0.07, 7), r, 700, 180), r, 0.001, 0.0, 0.0, 0.01, power=3.0), 0.5)
        for at, seed in ((0.05, 8), (0.085, 9), (0.13, 10)):
            tr.add(at, decay(bandpass(noise(r, 0.05, seed), r, 2600, 3400, 6), r, 0.008), 0.16)
        return tr.s

    def letter():   # a letter of the initials is taken: a key of the station's console, and its short answer
        tr = Track(0.16, r)
        tr.add(0, decay(highpass(noise(r, 0.02, 11), r, 2500), r, 0.003), 0.5)
        tr.add(0.005, env(osc(r, 0.11, midi(86), 'pulse', duty=0.25), r, 0.002, 0.0, 0.5, 0.05), 0.5)
        tr.add(0.005, bell(r, 98, 0.14, half=0.03, index=1.0, ratio=2.0), 0.35)
        return tr.s

    def roll():   # the ball rolling on the board: a steady stretch of the marble, made to go round
        return looped(recording('marble', cache)[int(12.1 * FX):int(14.45 * FX)], FX, 0.25)

    return {
        # recorded: name, samples
        'flipper-up': lambda: cut('flipper', 8.255, 8.56, cache),
        'flipper-down': lambda: cut('flipper', 8.6, 8.88, cache),
        'bumper': lambda: cut('bumper', 3.478, 3.9, cache, fade_out=0.08),
        'slingshot': lambda: cut('bumper', 1.14, 1.435, cache),
        'plunger-pull': lambda: cut('plunger', 0.39, 0.8, cache, fade_in=0.02, fade_out=0.1),
        'plunger-shot': lambda: cut('plunger', 1.34, 2.3, cache, fade_out=0.3),
        'drain': lambda: cut('trough', 0.18, 1.14, cache, fade_in=0.08, fade_out=0.08),
        'ball-roll': roll,
        'ball-land': lambda: cut('marble', 81.557, 81.83, cache),
        'ball-knock': lambda: cut('bumper', 2.186, 2.31, cache),
        'steel': lambda: cut('bumper', 4.243, 4.4, cache),
        'dock-capture': capture,
        # synthesised
        'rubber': thud, 'target': target, 'shield-down': shield, 'shield-up': raise_, 'lane': lane, 'inlane': inlane, 'outlane': outlane,
        'gate': gate, 'spinner': spin, 'ramp': whoosh, 'rail-on': wire, 'rail': zap, 'dock-eject': eject, 'start': start, 'ball-ready': ready,
        'ball-saved': saved, 'tilt': tilt, 'mission': mission, 'rank': rank, 'multiball': siren, 'multiball-end': calm,
        'jackpot': jackpot, 'extra-ball': extra, 'game-over': over, 'nudge': nudge, 'letter': letter,
    }


MUSICS = {'music-attract': attract_theme, 'music-play': play_theme, 'music-multiball': multiball_theme, 'music-over': over_theme}


def save(path, s, rate, kbps):
    """Writes the samples as an MP3 file, as loud as they go without clipping."""
    peak = max(1e-9, max(abs(v) for v in s))
    a = array.array('h', (int(round(v / peak * 0.85 * 32767)) for v in s))   # the decoded MP3 overshoots its source a little
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 's.wav')
        with wave.open(wav, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(a.tobytes())
        # no tag, no date: the same samples give the same file
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', '-ac', '1', '-map_metadata', '-1', '-id3v2_version', '0',
                        '-fflags', '+bitexact', '-flags:a', '+bitexact', path], check=True)


def main():
    args = sys.argv[1:]
    only, cache, out = None, os.path.join(tempfile.gettempdir(), 'tidal-lock-recordings'), OUT
    while args:
        a = args.pop(0)
        if a == '--only':
            only = args.pop(0).split(',')
        elif a == '--cache':
            cache = args.pop(0)
        elif a == '--out':
            out = args.pop(0)
        else:
            sys.exit(__doc__)
    os.makedirs(out, exist_ok=True)
    total = 0
    for name, make in list(effects(cache).items()) + list(MUSICS.items()):
        path = os.path.join(out, name + '.mp3')
        if only is None or name in only:
            music = name in MUSICS
            s = make()
            save(path, s, MUSIC if music else FX, 64)
            print(f'{name}.mp3  {len(s) / (MUSIC if music else FX):.2f} s  {os.path.getsize(path)} bytes')
        if os.path.exists(path):
            total += os.path.getsize(path)
    print(f'{total} bytes in all')


if __name__ == '__main__':
    main()
