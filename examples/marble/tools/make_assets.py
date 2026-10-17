#!/usr/bin/env python3
"""The marble course's level and sounds (python3, standard library only): run it again after a change.

usage: make_assets.py [--from DIR]
  --from DIR: the unpacked Kenney zips (DIR/dig_audio_pack = Digital Audio, DIR/music-jingles): copies the sounds the game
              uses into assets/kenney/ with each pack's License.txt. Without it, the copies already there are kept.

Writes:
- assets/level.ldtk: the course, an LDtk project (the fields zinc's importer reads, docs/reports/zinc-next-assets.md) with
  an IntGrid "Heights" of 24 x 24 cells (0: no floor, 1..4: a floor at height 0..3, half a cell per step) and an
  "Entities" layer: Start, 20 Gem, Goal, Platform (fields toX, toZ: where it travels, in cells; period: seconds) and Prop
  (fields piece: a piece of assets/models/models.json, yaw: degrees, solid: whether it stops the ball);
- assets/roll.wav: the rolling loop, filtered noise with a slow rumble, 22.05 kHz mono, made to go round.
The course is this example's own."""
import json, math, os, random, shutil, struct, sys, wave

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'assets')

PACKS = {
    'digital-audio': ('dig_audio_pack', 'https://kenney.nl/assets/digital-audio', ['Audio/powerUp2.ogg', 'Audio/phaserDown2.ogg']),
    'music-jingles': ('music-jingles', 'https://kenney.nl/assets/music-jingles', ['Audio/8-Bit jingles/jingles_NES12.ogg', 'Audio/8-Bit jingles/jingles_NES07.ogg']),
}

def copy_kenney(src):
    for name, (folder, url, files) in PACKS.items():
        out = os.path.join(ASSETS, 'kenney', name)
        os.makedirs(out, exist_ok=True)
        shutil.copyfile(os.path.join(src, folder, 'License.txt'), os.path.join(out, 'License.txt'))
        for f in files: shutil.copyfile(os.path.join(src, folder, f), os.path.join(out, os.path.basename(f)))
        open(os.path.join(out, 'SOURCE.txt'), 'w').write('Kenney, "%s", %s (CC0 1.0, License.txt). Files copied unchanged: %s\n'
                                                       % (name.replace('-', ' ').title(), url, ', '.join(os.path.basename(f) for f in files)))

# The course, far end first (row 0 is the farthest from the camera at the start). '.' no floor, '0'..'3' a floor's height.
# The ball starts high at the near end and rolls down the terraces: a step down is a drop, a step up is a wall.
COURSE = [
    '........................',
    '...00000000000000000....',
    '...00000000000000000....',
    '...00000000000000000....',
    '........................',
    '........................',
    '........................',
    '........................',
    '...111.........111......',
    '...1111111111111111.....',
    '...1111111111111111.....',
    '......2.........2.......',
    '......2.........2.......',
    '......22.......22.......',
    '......22222222222.......',
    '......22222222222.......',
    '..........22............',
    '..........33............',
    '..........33............',
    '.......3..33..3.........',
    '.......33333333.........',
    '.......33333333.........',
    '.......33333333.........',
    '........................',
]
N = 24
assert len(COURSE) == N and all(len(r) == N for r in COURSE)

def entities():
    out = [('Start', 11, 21, {})]
    gems = [(8, 21), (14, 21), (11, 18), (10, 16), (7, 15), (15, 15), (6, 12), (6, 11), (16, 12), (16, 11),
            (4, 10), (18, 10), (8, 9), (14, 9), (4, 8), (17, 8), (5, 2), (17, 2), (8, 1), (14, 3)]
    out += [('Gem', c, r, {}) for c, r in gems]
    out += [('Goal', 11, 1, {})]
    # two shuttles over the gap of rows 4..7: 2 x 2 cells, from the edge of row 8 to the edge of row 3
    out += [('Platform', 4, 6, {'toX': 4, 'toZ': 4, 'period': 5.0}), ('Platform', 16, 6, {'toX': 16, 'toZ': 4, 'period': 3.2})]
    # decoration, pieces of the course art (assets/models/models.json); solid ones stop the ball
    props = [('tree', 7, 22, 1), ('tree_pine', 14, 22, 1), ('mushrooms', 16, 14, 0), ('flowers', 6, 14, 0), ('tree_small', 3, 10, 1),
             ('barrel', 18, 9, 1), ('potted_plant', 10, 10, 1), ('potted_plant', 12, 10, 1), ('pillar', 3, 1, 1), ('pillar', 19, 1, 1),
             ('rock_tall', 19, 3, 1), ('flowers', 9, 2, 0), ('grass_tuft', 13, 2, 0), ('crate', 7, 20, 1)]
    out += [('Prop', c, r, {'piece': p, 'yaw': 90 * ((r * 7 + c * 3) % 4), 'solid': s == 1}) for p, c, r, s in props]
    return out

def ldtk():
    uid = iter(range(100, 10000))
    def iid(n): return '%08x-0000-4000-8000-%012x' % (n, n)
    def field(name, kind, value): return {'__identifier': name, '__type': kind, '__value': value, '__tile': None, 'defUid': 0, 'realEditorValues': []}
    ents = []
    for name, c, r, f in entities():
        size = 2 if name == 'Platform' else 1   # a platform's cell is its top left one
        ents.append({'__identifier': name, '__grid': [c, r], '__pivot': [0, 0], '__tags': [], '__tile': None, '__smartColor': '#FFCD75',
                     'iid': iid(next(uid)), 'width': 16 * size, 'height': 16 * size, 'defUid': 1, 'px': [c * 16, r * 16],
                     'fieldInstances': [field(k, 'Bool' if isinstance(v, bool) else 'String' if isinstance(v, str) else 'Float' if isinstance(v, float) else 'Int', v)
                                        for k, v in f.items()],
                     '__worldX': c * 16, '__worldY': r * 16})
    ints = [0 if ch == '.' else int(ch) + 1 for row in COURSE for ch in row]
    def layer(ident, kind, **kw):
        base = {'__identifier': ident, '__type': kind, '__cWid': N, '__cHei': N, '__gridSize': 16, '__opacity': 1, '__pxTotalOffsetX': 0,
                '__pxTotalOffsetY': 0, '__tilesetDefUid': None, '__tilesetRelPath': None, 'iid': iid(next(uid)), 'levelId': 0,
                'layerDefUid': next(uid), 'pxOffsetX': 0, 'pxOffsetY': 0, 'visible': True, 'optionalRules': [], 'intGridCsv': [],
                'autoLayerTiles': [], 'seed': 0, 'overrideTilesetUid': None, 'gridTiles': [], 'entityInstances': []}
        base.update(kw)
        return base
    lvl = {'identifier': 'Terraces', 'iid': iid(1), 'uid': 0, 'worldX': 0, 'worldY': 0, 'worldDepth': 0, 'pxWid': N * 16, 'pxHei': N * 16,
           '__bgColor': '#87CEEB', 'bgColor': '#87CEEB', 'externalRelPath': None, 'fieldInstances': [field('time', 'Int', 90)],
           'layerInstances': [layer('Entities', 'Entities', entityInstances=ents), layer('Heights', 'IntGrid', intGridCsv=ints)], '__neighbours': []}
    return {'__header__': {'fileType': 'LDtk Project JSON', 'app': 'LDtk', 'doc': 'https://ldtk.io/json', 'appVersion': '1.5.3', 'url': 'https://ldtk.io'},
            'iid': iid(0), 'jsonVersion': '1.5.3', 'nextUid': next(uid), 'worldLayout': 'Free', 'defaultGridSize': 16, 'minifyJson': True,
            'externalLevels': False, 'bgColor': '#40465B', 'defaultLevelBgColor': '#87CEEB',
            'defs': {'layers': [], 'entities': [{'identifier': n, 'uid': i + 1} for i, n in enumerate(['Start', 'Gem', 'Goal', 'Platform', 'Prop'])],
                     'tilesets': [], 'enums': [], 'externalEnums': [], 'levelFields': [{'identifier': 'time', 'uid': 90, '__type': 'Int'}]},
            'levels': [lvl], 'worlds': []}

RATE = 22050
def roll():
    """Two seconds of low noise, a rumble that swells nine times a second, crossfaded into its own start so it loops."""
    rnd = random.Random(21)
    n, fade = 2 * RATE, RATE // 5
    raw, lp, lp2 = [], 0.0, 0.0
    for i in range(n + fade):
        lp += (rnd.random() * 2 - 1 - lp) * 0.08
        lp2 += (lp - lp2) * 0.15
        raw.append(lp2 * (0.75 + 0.25 * math.sin(2 * math.pi * 9 * i / RATE)))
    out = raw[:n]
    for i in range(fade): out[i] = out[i] * (i / fade) + raw[n + i] * (1 - i / fade)
    peak = max(abs(v) for v in out)
    return [v / peak * 0.8 for v in out]

def save_wav(path, samples):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s)) * 32000)) for s in samples))

if __name__ == '__main__':
    os.makedirs(ASSETS, exist_ok=True)
    if '--from' in sys.argv: copy_kenney(sys.argv[sys.argv.index('--from') + 1])
    json.dump(ldtk(), open(os.path.join(ASSETS, 'level.ldtk'), 'w'), separators=(',', ':'))
    save_wav(os.path.join(ASSETS, 'roll.wav'), roll())
    print('marble assets written to', os.path.normpath(ASSETS))
