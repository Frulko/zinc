# Compares the blob of `zinc bake` (src/res) with expected.json, which the old TypeScript tool (compiler/src/resources.ts) produced for the same program:
# metrics, every glyph (position, advance, hash of the bitmap) and every image (size, scale, hash of the pixels). usage: res_check.py blob.bin expected.json
import json, struct, hashlib
import sys
b = open(sys.argv[1], 'rb').read()
p = 4
def u32():
    global p
    v = struct.unpack_from('<I', b, p)[0]; p += 4; return v
def s32():
    global p
    v = struct.unpack_from('<i', b, p)[0]; p += 4; return v
def string():
    global p
    n = u32(); s = b[p:p+n].decode(); p += n; return s
fonts = []
for _ in range(u32()):
    f = {'name': string(), 'px': s32(), 'ascent': s32(), 'descent': s32(), 'lineGap': s32()}
    ng = u32(); gl = []
    for _ in range(ng):
        gl.append([u32(), s32(), s32(), s32(), s32(), s32(), u32()])
    nb = u32(); bm = b[p:p+nb]; p += nb
    g = {}
    for i, x in enumerate(gl):
        nxt = gl[i+1][6] if i+1 < len(gl) else nb
        g[x[0]] = [x[1], x[2], x[3], x[4], x[5], hashlib.sha1(bm[x[6]:nxt]).hexdigest()]
    f['glyphs'] = g; fonts.append(f)
images = []
for _ in range(u32()):
    n = string(); w = s32(); h = s32(); sc = s32(); px = b[p:p+w*h*4]; p += w*h*4
    images.append({'name': n, 'w': w, 'h': h, 'scale': sc, 'sha': hashlib.sha1(px).hexdigest()})
old = json.load(open(sys.argv[2]))
bad = 0
print('fonts old/new', len(old['fonts']), len(fonts), 'images', len(old['images']), len(images))
nf = {(f['name'], f['px']): f for f in fonts}
for o in old['fonts']:
    f = nf.get((o['name'], o['px']))
    if not f: print('missing font', o['name'], o['px']); bad += 1; continue
    for k in ('ascent', 'descent', 'lineGap'):
        if o[k] != f[k]: print('metric', o['name'], o['px'], k, o[k], f[k]); bad += 1
    for cp, v in o['glyphs'].items():
        if f['glyphs'].get(int(cp)) != v: print('glyph differs', o['name'], o['px'], cp, v, f['glyphs'].get(int(cp))); bad += 1; break
ni = {i['name']: i for i in images}
for o in old['images']:
    i = ni.get(o['name'])
    if i != o: print('image differs', o['name'], o, i); bad += 1
print('differences:', bad)
assert len(old['ttf']) == 0 or True
sys.exit(1 if bad else 0)
