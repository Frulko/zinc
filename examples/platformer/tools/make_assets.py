#!/usr/bin/env python3
"""The platformer's assets: Kenney's art and sounds (CC0), the level and the sprite sheets written here, and a music loop
synthesised here (Kenney publishes jingles, no loops). python3, standard library only.

usage: make_assets.py [--from DIR]
  --from DIR: the unpacked Kenney zips (DIR/pp = Pixel Platformer, DIR/dig_audio_pack = Digital Audio, DIR/impact-sounds,
              DIR/music-jingles): copies the files the game uses into assets/kenney/ with each pack's License.txt.
              Without it, the copies already in assets/kenney/ are kept.

Writes:
- assets/level.ldtk: the level, 120 x 28 cells of 18 px, in LDtk's JSON (the fields zinc's importer reads, see
  docs/reports/zinc-next-assets.md): an IntGrid "Collisions" (1 solid, 2 one-way cloud, 3 spikes), the tile layers "Front"
  (Pixel Platformer's tiles, 18 px) and "Back" (its backgrounds, 24 px) and an "Entities" layer (Start, Coin, Walker,
  Flyer, Goal). Nothing in it is copied from Kenney's sample maps: the layout is this game's own;
- assets/characters.json and assets/items.json: TexturePacker "JSON hash" sheets with frame tags over Kenney's
  tilesheets (the hero, the walker and the flyer; the coin, the flag, the hearts);
- assets/music.wav: a four-bar loop, 22.05 kHz mono (square lead, triangle bass, noise hat)."""
import json, os, random, shutil, struct, sys, wave

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'assets')
KENNEY = 'kenney'

# ---------------------------------------------------------------- Kenney's files
PACKS = {   # folder under assets/kenney: (folder of the unpacked zip, its page, the files the game uses)
    'pixel-platformer': ('pp', 'https://kenney.nl/assets/pixel-platformer',
                         ['Tilemap/tilemap_packed.png', 'Tilemap/tilemap-characters_packed.png', 'Tilemap/tilemap-backgrounds_packed.png']),
    'digital-audio': ('dig_audio_pack', 'https://kenney.nl/assets/digital-audio', ['Audio/phaseJump2.ogg', 'Audio/highUp.ogg', 'Audio/lowDown.ogg']),
    'impact-sounds': ('impact-sounds', 'https://kenney.nl/assets/impact-sounds', ['Audio/impactSoft_heavy_000.ogg']),
    'music-jingles': ('music-jingles', 'https://kenney.nl/assets/music-jingles',
                      ['Audio/8-Bit jingles/jingles_NES12.ogg', 'Audio/8-Bit jingles/jingles_NES07.ogg']),
}

def copy_kenney(src):
    for name, (folder, url, files) in PACKS.items():
        out = os.path.join(ASSETS, KENNEY, name)
        os.makedirs(out, exist_ok=True)
        shutil.copyfile(os.path.join(src, folder, 'License.txt'), os.path.join(out, 'License.txt'))
        for f in files: shutil.copyfile(os.path.join(src, folder, f), os.path.join(out, os.path.basename(f)))
        open(os.path.join(out, 'SOURCE.txt'), 'w').write('Kenney, "%s", %s (CC0 1.0, License.txt). Files copied unchanged: %s\n'
                                                       % (name.replace('-', ' ').title(), url, ', '.join(os.path.basename(f) for f in files)))

# ---------------------------------------------------------------- Pixel Platformer's tiles (tilemap_packed.png: 20 x 9 tiles of 18 px)
G = 18
T = {'top_l': 21, 'top': 22, 'top_r': 23, 'fill_l': 121, 'fill': 122, 'fill2': 104, 'fill_r': 123, 'corner_r': 24, 'corner_l': 25,
     'block_l': 48, 'block': 49, 'block_r': 50, 'crate': 26, 'spikes': 68, 'cloud_l': 153, 'cloud': 154, 'cloud_r': 155,
     'plant': 124, 'plant2': 125, 'tree': 126, 'mushroom': 128, 'fence': 106, 'sign': 88}
# the backgrounds (tilemap-backgrounds_packed.png: 8 x 3 tiles of 24 px): the first strip, four tiles wide
BG = 24
BG_TREES, BG_GROUND = (8, 9, 10, 11), (16, 17, 18, 19)

COLS, ROWS = 120, 28
FLOOR = 24   # the top row of the usual ground: four rows of earth under it

def level():
    """Columns of ground (top row, or None for a pit), then what stands on it. Rows count from the top: F is the usual floor."""
    F = FLOOR
    ground = [F] * COLS
    for a, b, top in ((16, 18, None), (35, 40, F - 2), (41, 44, None), (45, 60, F - 1), (61, 63, F - 1), (79, 81, None), (82, 95, F - 2),
                      (96, 99, None)):
        for c in range(a, b + 1): ground[c] = top
    solid = [[0] * COLS for _ in range(ROWS)]
    for c, top in enumerate(ground):
        if top is not None:
            for r in range(top, ROWS): solid[r][c] = 1
    for c in range(61, 64): solid[F - 2][c] = 3                    # spikes on the raised floor
    for c in range(50, 55): solid[F - 5][c] = 1                    # a floating ledge with coins above
    for c in range(41, 45): solid[F - 4][c] = 2                    # clouds over the second pit
    for c in range(96, 100): solid[F - 5][c] = 2                   # and over the last one
    stairs = {}
    for k, c in enumerate(range(90, 96)):                          # stairs of crates on the floor of F - 2
        stairs[c] = F - 3 - k // 2
        for r in range(stairs[c], F - 2): solid[r][c] = 1
    entities = [('Start', 3, F - 1)]
    entities += [('Coin', c, F - 2) for c in (8, 10, 12, 23, 25, 27)]
    entities += [('Coin', 17, F - 3)]
    entities += [('Coin', c, F - 7) for c in range(50, 55)]
    entities += [('Coin', c, F - 6) for c in (42, 43, 97, 98)]
    entities += [('Coin', c, F - 3) for c in (66, 68, 85, 87)]
    entities += [('Coin', c, stairs[c] - 2) for c in (90, 92, 94)]
    entities += [('Walker', 28, F - 1), ('Walker', 70, F - 1), ('Walker', 75, F - 1), ('Walker', 106, F - 1)]
    entities += [('Flyer', 57, F - 6), ('Flyer', 87, F - 7)]
    entities += [('Goal', 114, F - 1)]
    decor = {(1, F - 1): 'sign', (6, F - 1): 'plant', (14, F - 1): 'fence', (15, F - 1): 'fence', (21, F - 1): 'tree', (31, F - 1): 'mushroom',
             (37, F - 3): 'plant2', (47, F - 2): 'tree', (58, F - 2): 'plant', (66, F - 1): 'plant2', (73, F - 1): 'mushroom', (77, F - 1): 'tree',
             (84, F - 3): 'plant', (102, F - 1): 'plant2', (104, F - 1): 'fence', (105, F - 1): 'fence', (110, F - 1): 'tree', (117, F - 1): 'mushroom'}
    return solid, entities, decor

def front_tile(solid, c, r):
    def s(cc, rr): return 0 <= cc < COLS and 0 <= rr < ROWS and solid[rr][cc] == 1
    v = solid[r][c]
    if v == 2: return 'cloud_l' if c == 0 or solid[r][c - 1] != 2 else 'cloud_r' if c == COLS - 1 or solid[r][c + 1] != 2 else 'cloud'
    if v == 3: return 'spikes'
    if v != 1: return None
    if 90 <= c <= 95 and r < FLOOR - 2: return 'crate'
    if r == FLOOR - 5 and 50 <= c <= 54: return 'block_l' if c == 50 else 'block_r' if c == 54 else 'block'
    if not s(c, r - 1):   # a top: grass
        return 'top' if s(c - 1, r) and s(c + 1, r) else 'top_r' if s(c - 1, r) else 'top_l' if s(c + 1, r) else 'top'
    if s(c - 1, r) and not s(c - 1, r - 1): return 'corner_l'   # the grass of a lower top on the left runs into this wall
    if s(c + 1, r) and not s(c + 1, r - 1): return 'corner_r'
    if not s(c - 1, r): return 'fill_l'
    if not s(c + 1, r): return 'fill_r'
    return 'fill2' if (c * 7 + r * 13) % 11 == 0 else 'fill'

def ldtk():
    solid, entities, decor = level()
    uid = iter(range(100, 10000))
    def iid(n): return '%08x-0000-4000-8000-%012x' % (n, n)
    def grid_tiles(cells, size, cols):
        return [{'px': [c * size, r * size], 'src': [(t % cols) * size, (t // cols) * size], 'f': 0, 't': t, 'd': [r * 1000 + c], 'a': 1}
                for (c, r), t in sorted(cells.items(), key=lambda k: (k[0][1], k[0][0]))]
    front = {(c, r): T[front_tile(solid, c, r)] for r in range(ROWS) for c in range(COLS) if front_tile(solid, c, r)}
    for k, name in decor.items(): front[k] = T[name]
    bcols, brows = COLS * G // BG, ROWS * G // BG
    horizon = (FLOOR * G - 40) // BG   # the far trees stand a little above the floor
    back = {}
    for c in range(bcols):
        back[(c, horizon)] = BG_TREES[c % 4]
        for r in range(horizon + 1, brows): back[(c, r)] = BG_GROUND[c % 4]
    tiles_uid, bg_uid = next(uid), next(uid)
    def layer(ident, kind, size, cols, rows, **kw):
        base = {'__identifier': ident, '__type': kind, '__cWid': cols, '__cHei': rows, '__gridSize': size, '__opacity': 1,
                '__pxTotalOffsetX': 0, '__pxTotalOffsetY': 0, '__tilesetDefUid': None, '__tilesetRelPath': None,
                'iid': iid(next(uid)), 'levelId': 0, 'layerDefUid': next(uid), 'pxOffsetX': 0, 'pxOffsetY': 0, 'visible': True,
                'optionalRules': [], 'intGridCsv': [], 'autoLayerTiles': [], 'seed': 0, 'overrideTilesetUid': None, 'gridTiles': [], 'entityInstances': []}
        base.update(kw)
        return base
    sizes = {'Start': (14, 22), 'Coin': (18, 18), 'Walker': (18, 18), 'Flyer': (18, 18), 'Goal': (18, 36)}
    names = list(sizes)
    ents = [{'__identifier': n, '__grid': [c, r], '__pivot': [0.5, 1], '__tags': [], '__tile': None, '__smartColor': '#FFCD75', 'iid': iid(next(uid)),
             'width': sizes[n][0], 'height': sizes[n][1], 'defUid': 1 + names.index(n), 'px': [c * G + G // 2, (r + 1) * G], 'fieldInstances': [],
             '__worldX': c * G + G // 2, '__worldY': (r + 1) * G} for n, c, r in entities]
    pp = KENNEY + '/pixel-platformer/'
    layers = [   # LDtk lists the top layer first
        layer('Entities', 'Entities', G, COLS, ROWS, entityInstances=ents),
        layer('Collisions', 'IntGrid', G, COLS, ROWS, intGridCsv=[solid[r][c] for r in range(ROWS) for c in range(COLS)]),
        layer('Front', 'Tiles', G, COLS, ROWS, __tilesetDefUid=tiles_uid, __tilesetRelPath=pp + 'tilemap_packed.png', gridTiles=grid_tiles(front, G, 20)),
        layer('Back', 'Tiles', BG, bcols, brows, __tilesetDefUid=bg_uid, __tilesetRelPath=pp + 'tilemap-backgrounds_packed.png', gridTiles=grid_tiles(back, BG, 8)),
    ]
    lvl = {'identifier': 'Meadow', 'iid': iid(1), 'uid': 0, 'worldX': 0, 'worldY': 0, 'worldDepth': 0, 'pxWid': COLS * G, 'pxHei': ROWS * G,
           '__bgColor': '#DFF6F5', 'bgColor': '#DFF6F5', 'useAutoIdentifier': False, 'bgRelPath': None, 'bgPos': None, 'bgPivotX': 0.5, 'bgPivotY': 0.5,
           '__smartColor': '#ADADB5', '__bgPos': None, 'externalRelPath': None, 'layerInstances': layers, '__neighbours': [],
           'fieldInstances': [{'__identifier': 'title', '__type': 'String', '__value': 'Meadow Run', '__tile': None, 'defUid': 90, 'realEditorValues': []}]}
    def tileset(u, ident, path, size, w, h):
        return {'__cWid': w // size, '__cHei': h // size, 'identifier': ident, 'uid': u, 'relPath': path, 'pxWid': w, 'pxHei': h, 'tileGridSize': size,
                'spacing': 0, 'padding': 0, 'tags': [], 'customData': [], 'enumTags': [], 'cachedPixelData': None, 'savedSelections': [], 'embedAtlas': None,
                'tagsSourceEnumUid': None}
    defs = {'layers': [], 'entities': [{'identifier': n, 'uid': i + 1, 'width': sizes[n][0], 'height': sizes[n][1], 'pivotX': 0.5, 'pivotY': 1, 'color': '#FFCD75'}
                                       for i, n in enumerate(names)],
            'tilesets': [tileset(tiles_uid, 'Tiles', pp + 'tilemap_packed.png', G, 360, 162),
                         tileset(bg_uid, 'Backgrounds', pp + 'tilemap-backgrounds_packed.png', BG, 192, 72)],
            'enums': [], 'externalEnums': [], 'levelFields': [{'identifier': 'title', 'uid': 90, '__type': 'String'}]}
    return {'__header__': {'fileType': 'LDtk Project JSON', 'app': 'LDtk', 'doc': 'https://ldtk.io/json', 'schema': 'https://ldtk.io/files/JSON_SCHEMA.json',
                           'appAuthor': 'Sebastien Benard', 'appVersion': '1.5.3', 'url': 'https://ldtk.io'},
            'iid': iid(0), 'jsonVersion': '1.5.3', 'appBuildId': 0, 'nextUid': next(uid), 'identifierStyle': 'Capitalize', 'toc': [], 'worldLayout': 'Free',
            'worldGridWidth': 256, 'worldGridHeight': 256, 'defaultLevelWidth': COLS * G, 'defaultLevelHeight': ROWS * G, 'defaultPivotX': 0, 'defaultPivotY': 0,
            'defaultGridSize': G, 'defaultEntityWidth': 16, 'defaultEntityHeight': 16, 'bgColor': '#40465B', 'defaultLevelBgColor': '#DFF6F5',
            'minifyJson': True, 'externalLevels': False, 'exportTiled': False, 'simplifiedExport': False, 'imageExportMode': 'None', 'exportLevelBg': True,
            'pngFilePattern': None, 'backupOnSave': False, 'backupLimit': 10, 'backupRelPath': None, 'levelNamePattern': 'Level_%idx', 'tutorialDesc': None,
            'customCommands': [], 'flags': [], 'defs': defs, 'levels': [lvl], 'worlds': [], 'dummyWorldIid': iid(2)}

# ---------------------------------------------------------------- sprite sheets over Kenney's tilesheets
def sheet(image, size, cols, w, h, frames, tags):
    """frames: (name, tile index, ms) in order; tags: (name, first, last)."""
    out = {}
    for name, t, ms in frames:
        out[name] = {'frame': {'x': (t % cols) * size, 'y': (t // cols) * size, 'w': size, 'h': size}, 'rotated': False, 'trimmed': False,
                     'spriteSourceSize': {'x': 0, 'y': 0, 'w': size, 'h': size}, 'sourceSize': {'w': size, 'h': size}, 'pivot': {'x': 0.5, 'y': 1},
                     'duration': ms}
    return {'frames': out, 'meta': {'app': 'examples/platformer/tools/make_assets.py', 'image': image, 'size': {'w': w, 'h': h},
                                    'frameTags': [{'name': n, 'from': a, 'to': b, 'direction': 'forward'} for n, a, b in tags]}}

def characters():   # tilemap-characters_packed.png: 9 x 3 characters of 24 px, two frames each (three for the bat)
    frames = [('hero_0', 0, 120), ('hero_1', 1, 120), ('walker_0', 18, 160), ('walker_1', 19, 160), ('walker_flat', 20, 100),
              ('flyer_0', 24, 90), ('flyer_1', 25, 90), ('flyer_2', 26, 90)]
    return sheet(KENNEY + '/pixel-platformer/tilemap-characters_packed.png', 24, 9, 216, 72, frames,
                 [('hero_idle', 0, 0), ('hero_run', 0, 1), ('hero_jump', 1, 1), ('walker', 2, 3), ('flyer', 5, 7)])

def items():   # coins, the flag and its pole, hearts, from tilemap_packed.png
    frames = [('coin_0', 151, 160), ('coin_1', 152, 160), ('flag_0', 111, 260), ('flag_1', 112, 260), ('pole', 131, 100), ('heart', 44, 100),
              ('heart_empty', 46, 100)]
    return sheet(KENNEY + '/pixel-platformer/tilemap_packed.png', 18, 20, 360, 162, frames, [('coin', 0, 1), ('flag', 2, 3)])

# ---------------------------------------------------------------- the music
RATE = 22050
def square(ph): return 1.0 if (ph % 1.0) < 0.5 else -1.0
def tri(ph): return 4 * abs((ph % 1.0) - 0.5) - 1

def music():
    """Four bars at 140 bpm in C major, looped: a square lead, a triangle bass, a noise hat on the off-beats."""
    beat = 60 / 140
    n = int(16 * beat * RATE)
    out = [0.0] * n
    def midi(m): return 440 * 2 ** ((m - 69) / 12)
    def note(m, start, beats, wave_, vol):
        a, b = int(start * beat * RATE), int((start + beats) * beat * RATE * 0.92)
        f = midi(m)
        for i in range(a, min(b, n)):
            t = (i - a) / RATE
            out[i] += wave_(t * f) * vol * min(1, t * 200) * max(0, 1 - (i - a) / (b - a) * 0.6)
    lead = [(72, 1), (76, 1), (79, 1), (76, 1), (77, 1), (81, 1), (79, 2), (76, 1), (74, 1), (72, 1), (74, 1), (76, 2), (72, 2)]
    t = 0
    for m, d in lead: note(m, t, d, square, 0.11); t += d
    for bar, root in enumerate((48, 53, 55, 48)):
        for k in range(4): note(root + (7 if k % 2 else 0), bar * 4 + k, 1, tri, 0.28)
    rnd = random.Random(5)
    for k in range(16):
        a = int((k + 0.5) * beat * RATE)
        for i in range(int(0.03 * RATE)): out[a + i] += (rnd.random() * 2 - 1) * 0.08 * (1 - i / (0.03 * RATE))
    return out

def save_wav(path, samples):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s)) * 32000)) for s in samples))

if __name__ == '__main__':
    os.makedirs(ASSETS, exist_ok=True)
    if '--from' in sys.argv: copy_kenney(sys.argv[sys.argv.index('--from') + 1])
    json.dump(ldtk(), open(os.path.join(ASSETS, 'level.ldtk'), 'w'), separators=(',', ':'))
    json.dump(characters(), open(os.path.join(ASSETS, 'characters.json'), 'w'), indent=1)
    json.dump(items(), open(os.path.join(ASSETS, 'items.json'), 'w'), indent=1)
    save_wav(os.path.join(ASSETS, 'music.wav'), music())
    print('platformer assets written to', os.path.normpath(ASSETS))
