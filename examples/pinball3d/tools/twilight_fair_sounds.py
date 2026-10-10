#!/usr/bin/env python3
"""The sounds of the table Twilight Fair, made from nothing: assets/tables/twilight-fair/sounds/*.mp3.

A fairground at dusk: bells, a wooden mallet, ratchets, a slide whistle, and a steam organ that plays a waltz. Every file
is synthesised here, sample by sample, with the oscillators, filters and envelopes of tidal_lock_sounds.py (this script
imports them: it holds only what this table sounds like). Nothing is recorded, nothing is sampled from a game, and the
waltz is composed below.

usage: twilight_fair_sounds.py [--only name,name...] [--out <dir>]
needs python3 and ffmpeg with libmp3lame."""
import math, os, sys
from tidal_lock_sounds import FX, MUSIC, TAU, Track, bandpass, bell, decay, env, highpass, looped, lowpass, midi, noise, note, osc, save, seq

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'tables', 'twilight-fair', 'sounds')
r = FX


def mixed(seconds, *parts):
    """Parts added at their starts: (start, samples, gain) rows."""
    tr = Track(seconds, r)
    for start, s, g in parts:
        tr.add(start, s, g)
    return tr.s


def knock(hz, seed, seconds=0.09):   # wood on wood
    return mixed(seconds, (0, env(osc(r, seconds, hz, 'sine', f1=hz * 0.55, curve=2), r, 0.001, 0.0, 0.0, 0.01, power=1.8), 1.0),
                 (0, decay(bandpass(noise(r, seconds, seed), r, 900, 2400, 3), r, 0.006), 0.5))


def click(seed, hz=3200):   # a pawl on a ratchet
    return decay(bandpass(noise(r, 0.03, seed), r, hz, hz * 1.3, 5), r, 0.004)


def ratchet(n, step, seed):
    return mixed(n * step + 0.04, *[(i * step, click(seed + i, 2600 + 250 * i), 0.9) for i in range(n)])


def organ(pitch, seconds, g=1.0):   # a pipe of the steam organ: a hollow square with breath in it
    tone = note(r, pitch, seconds, 'pulse', attack=0.025, release=0.06, sustain=0.85, duty=0.5, cutoff=3200, vibrato=0.12)
    air = env(bandpass(noise(r, seconds, pitch), r, 1800, 5200, 1.5), r, 0.03, 0.0, 1.0, 0.06)
    return [a * g + b * 0.06 * g for a, b in zip(tone, air)]


def whistle(f0, f1, seconds):   # a slide whistle
    return env(osc(r, seconds, f0, 'sine', f1=f1, curve=1.2, vibrato=0.25, vibrato_hz=7), r, 0.02, 0.0, 0.9, 0.08)


def roll():   # a ball on a painted wooden board: low noise that swells as it turns, made to go round
    s = lowpass(noise(r, 2.4, 21), r, 700, 500)
    return looped([v * (0.75 + 0.25 * math.sin(TAU * 9 * i / r)) for i, v in enumerate(s)], r, 0.3)


def tune(rate, notes, beat, shape='tri', g=0.5, tail=0.3):
    """A line of the steam organ's music: (pitch, beats) rows, None for a rest."""
    tr = Track(sum(b for _, b in notes) * beat + tail, rate)
    t = 0.0
    for pitch, beats in notes:
        if pitch is not None:
            tr.add(t, note(rate, pitch, beats * beat * 0.92, shape, attack=0.02, release=0.06, sustain=0.8, duty=0.5, cutoff=3000, vibrato=0.1), g)
        t += beats * beat
    return tr


# the waltz: eight bars in C, bass on the first beat and the chord on the two others, the tune above
CHORDS = [(48, (60, 64, 67)), (48, (60, 64, 67)), (43, (59, 62, 65)), (43, (59, 62, 65)), (43, (59, 62, 65)), (43, (59, 62, 65)), (48, (60, 64, 67)), (48, (60, 64, 67))]
TUNE = [(76, 1), (79, 1), (84, 1), (88, 2), (84, 1), (86, 1), (83, 1), (79, 1), (77, 2), (74, 1),
        (71, 1), (74, 1), (77, 1), (81, 2), (79, 1), (76, 1), (79, 1), (84, 1), (84, 2), (None, 1)]


def waltz(beat, tune_gain, rate=MUSIC):
    tr = Track(len(CHORDS) * 3 * beat, rate, loop=True)
    for bar, (bass, chord) in enumerate(CHORDS):
        t = bar * 3 * beat
        tr.add(t, note(rate, bass, beat * 0.9, 'tri', attack=0.01, release=0.08, sustain=0.7, cutoff=900), 0.5)
        for k in (1, 2):
            for p in chord:
                tr.add(t + k * beat, note(rate, p, beat * 0.5, 'pulse', attack=0.01, release=0.05, sustain=0.5, duty=0.5, cutoff=2200), 0.1)
    t = 0.0
    for pitch, beats in TUNE:
        if pitch is not None:
            tr.add(t, note(rate, pitch, beats * beat * 0.92, 'pulse', attack=0.03, release=0.08, sustain=0.85, duty=0.5, cutoff=3400, vibrato=0.12), tune_gain)
        t += beats * beat
    return tr.s


EFFECTS = {
    'flipper-up': lambda: mixed(0.12, (0, knock(190, 1, 0.1), 1.0), (0.004, click(2, 2100), 0.6)),
    'flipper-down': lambda: mixed(0.1, (0, knock(140, 3, 0.09), 0.8)),
    'bumper': lambda: mixed(0.5, (0, bell(r, 84, 0.5, half=0.09, index=2.6, ratio=2.76), 1.0), (0, click(4), 0.5)),
    'sling': lambda: knock(620, 5, 0.07),
    'duck': lambda: bell(r, 96, 0.25, half=0.04, index=3.2, ratio=3.9),
    'coconut': lambda: mixed(0.2, (0, knock(240, 6, 0.12), 1.0), (0.05, knock(150, 7, 0.12), 0.6)),
    'coconut-up': lambda: ratchet(4, 0.045, 8),
    'lane': lambda: mixed(0.5, (0, bell(r, 88, 0.25, half=0.07, index=1.2, ratio=2.0), 0.8), (0.09, bell(r, 91, 0.4, half=0.1, index=1.2, ratio=2.0), 0.8)),
    'spinner': lambda: click(9, 2900),
    'gate': lambda: click(10, 4200),
    'mallet': lambda: mixed(0.3, (0, knock(110, 11, 0.2), 1.0), (0, decay(lowpass(noise(r, 0.2, 12), r, 500), r, 0.03), 0.7)),
    'striker': lambda: mixed(1.1, (0, whistle(300, 1500, 0.45), 0.6), (0.42, bell(r, 79, 0.65, half=0.16, index=2.4, ratio=2.76), 1.0)),
    'big-bell': lambda: bell(r, 72, 0.9, half=0.22, index=2.8, ratio=2.76),
    'plunger-pull': lambda: env(bandpass(noise(r, 0.4, 13), r, 500, 1700, 6), r, 0.05, 0.0, 1.0, 0.1),
    'plunger-shot': lambda: mixed(0.4, (0, knock(160, 14, 0.12), 1.0), (0.01, decay(osc(r, 0.38, 430, 'tri', f1=390, vibrato=0.4, vibrato_hz=28), r, 0.07), 0.5)),
    'drain': lambda: whistle(1100, 180, 0.8),
    'ball-roll': roll,
    'ball-land': lambda: knock(180, 15, 0.1),
    'ball-knock': lambda: knock(420, 16, 0.06),
    'wall': lambda: knock(760, 17, 0.05),
    'nudge': lambda: mixed(0.3, (0, knock(80, 18, 0.2), 1.0), (0.06, click(19, 1800), 0.3), (0.11, click(20, 2200), 0.2)),
    'letter': lambda: mixed(0.14, (0, click(22, 3600), 0.6), (0.005, organ(84, 0.11), 0.5)),
    'start': lambda: tune(r, [(72, 1), (76, 1), (79, 1), (84, 1), (79, 1), (84, 2)], 0.11).echo(0.2, 0.35, 0.25).s,
    'ball-ready': lambda: tune(r, [(79, 1), (84, 2)], 0.1, tail=0.15).s,
    'ball-saved': lambda: mixed(0.7, (0, whistle(400, 1300, 0.3), 0.6), (0.28, bell(r, 91, 0.4, half=0.1, index=1.5, ratio=2.0), 0.8)),
    'tilt': lambda: env(lowpass(osc(r, 0.9, 98, 'saw', f1=70, vibrato=0.6, vibrato_hz=17), r, 1300), r, 0.01, 0.0, 0.8, 0.2),
    'mission': lambda: tune(r, [(67, 1), (72, 1), (76, 1), (79, 1), (76, 1), (79, 1), (84, 3)], 0.1, shape='pulse').echo(0.2, 0.4, 0.3).s,
    'rank': lambda: tune(r, [(72, 1), (74, 1), (76, 1), (77, 1), (79, 1), (81, 1), (83, 1), (84, 3)], 0.06).echo(0.12, 0.4, 0.3).s,
    'extra-ball': lambda: mixed(1.0, (0, bell(r, 84, 0.3, half=0.08), 0.8), (0.15, bell(r, 88, 0.3, half=0.08), 0.8), (0.3, bell(r, 91, 0.6, half=0.15), 0.9)),
    'jackpot': lambda: mixed(1.4, (0, bell(r, 72, 1.2, half=0.3, index=2.8), 1.0), *[(0.1 + 0.08 * i, bell(r, p, 0.5, half=0.08, index=1.0, ratio=2.0), 0.4) for i, p in enumerate((84, 88, 91, 96, 100))]),
    'game-over': lambda: tune(r, [(79, 2), (76, 2), (72, 2), (67, 4)], 0.13, tail=0.4).s,
}
MUSICS = {
    'music-play': lambda: waltz(0.34, 0.26),
    'music-attract': lambda: waltz(0.46, 0.2),
    'music-over': lambda: tune(MUSIC, [(72, 3), (71, 3), (69, 3), (67, 6)], 0.4, g=0.4, tail=0.6).s,
}


def main():
    args, only, out = sys.argv[1:], None, OUT
    while args:
        a = args.pop(0)
        if a == '--only':
            only = args.pop(0).split(',')
        elif a == '--out':
            out = args.pop(0)
        else:
            sys.exit(__doc__)
    os.makedirs(out, exist_ok=True)
    total = 0
    for name, make in list(EFFECTS.items()) + list(MUSICS.items()):
        path = os.path.join(out, name + '.mp3')
        if only is None or name in only:
            rate = MUSIC if name in MUSICS else FX
            s = make()
            save(path, s, rate, 64)
            print(f'{name}.mp3  {len(s) / rate:.2f} s  {os.path.getsize(path)} bytes')
        if os.path.exists(path):
            total += os.path.getsize(path)
    print(f'{total} bytes in all')


if __name__ == '__main__':
    main()
