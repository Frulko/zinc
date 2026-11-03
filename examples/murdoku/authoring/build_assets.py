#!/usr/bin/env python3
"""Bake the locally archived SVG layers. Requires rsvg-convert and Pillow.

--print bakes only the print-* atlases of the A4 sheet: 256 pixels to a tile, which is 300 dpi at the size the sheet draws them.
"""
import base64
import io
import json
import re
from pathlib import Path
import subprocess
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / 'references/official/asset-library'
OUT = ROOT / 'assets'
RECIPES = []
PRINT = '--print' in sys.argv
PREFIX, COLOUR, INK_OBJECT, INK_CAST, INK_SCALE = ('print-', 256, 256, 256, 2) if PRINT else ('', 128, 192, 160, 1)
OBJECTS = ['plant','chair','shelf','statue','flowers','carpet','table','safe','piano','fire','bed','hammock','bonsai','grandfatherclock','easel','locker','basket','painting']
COLORS = ['#648c68','#789f9a','#b99472','#c7bc9d','#91a578','#c89c91','#bfa486','#8998a0','#a68d74','#d6aa79','#97a8ba','#bfa888','#829777','#b99772','#bb9c76','#95a6a4','#bf9e70','#b6a3ba']

def layer(path, color, x=0, y=0, w=128, h=128):
    rgb = [int(color[i:i+2], 16)/255 for i in (1,3,5)]
    ident = 'f'+str(len(RECIPES))
    RECIPES.append(str(path.relative_to(LIB)))
    data = base64.b64encode(path.read_bytes()).decode()
    matrix = f'{rgb[0]} 0 0 0 0 0 {rgb[1]} 0 0 0 0 0 {rgb[2]} 0 0 0 0 0 1 0'
    return f'<defs><filter id="{ident}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="{matrix}"/></filter></defs><image x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMin meet" filter="url(#{ident})" href="data:image/svg+xml;base64,{data}"/>'

def render(content, w=128, h=128, px=None):
    px = px or COLOUR
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{px}" height="{px}" viewBox="0 0 {w} {h}">{content}</svg>'
    return Image.open(io.BytesIO(subprocess.run(['rsvg-convert'], input=svg.encode(), stdout=subprocess.PIPE, check=True).stdout)).convert('RGBA')

def ink(tile, hi=0.62, lo=0.30, outline=2, hatch=4):
    """E-ink tone map: black below lo, white above hi, diagonal hatch between; a black outline around the silhouette. Pure black and white, opaque inside."""
    from PIL import ImageFilter
    a = tile.getchannel('A').point(lambda v: 255 if v > 100 else 0)
    lum = Image.alpha_composite(Image.new('RGBA', tile.size, 'white'), tile).convert('L')
    ring = a.filter(ImageFilter.MaxFilter(2*outline+1)) if outline else a
    out = Image.new('RGBA', tile.size, (0,0,0,0)); px = out.load(); lp = lum.load(); ap = a.load(); rp = ring.load()
    for y in range(tile.height):
        for x in range(tile.width):
            if ap[x,y]:
                v = lp[x,y]/255
                k = v < lo or (v < hi and (x+y) % hatch == 0)
                px[x,y] = (0,0,0,255) if k else (255,255,255,255)
            elif rp[x,y]: px[x,y] = (0,0,0,255)
    return out

def atlas(tiles, columns, name):
    w,h=tiles[0].size
    result=Image.new('RGBA',(columns*w,((len(tiles)+columns-1)//columns)*h))
    for i,tile in enumerate(tiles):
        assert tile.getbbox(), f'Empty sprite {name}:{i}'
        result.paste(tile,((i%columns)*w,(i//columns)*h))
    result.save(OUT/(PREFIX+name))
    print(f'{name}: {len(tiles)} sprites, {result.width} × {result.height}', flush=True)

furniture=[]; ink_furniture=[]
I=INK_OBJECT
for name,color in zip(OBJECTS,COLORS):
    content=layer(LIB/f'objects/obj_{name}.svg',color,12,12,104,104)
    overlay=LIB/f'objects/obj_{name}_02.svg'
    if overlay.exists(): content+=layer(overlay,'#f6ead2',12,12,104,104)
    furniture.append(render(content))
    ink_furniture.append(ink(render(content,128,128,I),outline=2*INK_SCALE,hatch=4*INK_SCALE))
atlas(furniture,6,'manor-objects.png')
atlas(ink_furniture,6,'ink-objects.png')
textures=['bigwood','woodentile','rich','smalltiles']
atlas([render(layer(LIB/f'textures/texture_floor_{t}.svg','#a49a8b')) for t in textures],4,'manor-floors.png')
# Floors in ink: the same outlines in black; the checkers' dark squares become a hatch so the people read on them.
atlas([ink(render(layer(LIB/f'textures/texture_floor_{t}.svg','#a49a8b'),128,128,128*INK_SCALE),hi=0.99,lo=0.7 if t in ('bigwood','woodentile') else 0.0,outline=0,hatch=5*INK_SCALE) for t in textures],4,'ink-floors.png')

palette=json.loads((LIB/'portrait-colors.json').read_text())
recipes=[]
for sex in ['man','woman']:
    tiles=[]; inks=[]
    folder=LIB/f'portraits/theme-0/{sex}'
    for skin in range(4):
        for hair in range(4):
            body=folder/'body'/f'{sex}_body_{3 if sex == "man" else 0:03}.svg'
            hairstyle=folder/'hair'/f'{sex}_hair_{[1,5,12,20][hair]:03}.svg'
            outfits=sorted(p for p in (folder/'clothes').glob('*.svg') if re.fullmatch(sex+r'_clothes_\d{3}\.svg',p.name) and p.stat().st_size > 400)
            outfit=outfits[(skin*4+hair)%len(outfits)]
            skin_color=palette['skin'][str([0,1,3,4][skin])]
            hair_color=palette['hair'][str([6,3,7,10][hair])]
            outfit_color=palette['clothes'][str((skin*5+hair*3)%16)]
            sx=.9 if sex=='man' else 1.15
            dy=0 if sex=='man' else -10.24
            content=layer(body,skin_color,0,0,128,128)
            content+=layer(outfit,outfit_color,64-64*sx,dy,128*sx,128)
            content+=layer(hairstyle,hair_color,64-64*sx,0,128*sx,128)
            tiles.append(render(content))
            tone=[(body,skin_color,0.5),(outfit,outfit_color,0.62),(hairstyle,hair_color,0.72)]
            box=[(0,0,128),(64-64*sx,dy,128*sx),(64-64*sx,0,128*sx)]
            im=Image.new('RGBA',(INK_CAST,INK_CAST),(0,0,0,0))
            for (f,c,hi),(x,y,w) in zip(tone,box):
                im=Image.alpha_composite(im,ink(render(layer(f,c,x,y,w,128),128,128,INK_CAST),hi=hi,outline=2*INK_SCALE,hatch=5*INK_SCALE))
            inks.append(im)
            recipes.append(dict(sex=sex,skin=skin,hair=hair,body=body.name,hairstyle=hairstyle.name,outfit=outfit.name,colors=[skin_color,hair_color,outfit_color]))
    atlas(tiles,4,f'cast-{sex}.png')
    atlas(inks,4,f'ink-cast-{sex}.png')
if not PRINT: (OUT/'manor-assets.json').write_text(json.dumps(dict(source='https://murdoku.com/play/',objects=OBJECTS,portraits=recipes,layers=sorted(set(RECIPES))),indent=2)+'\n')
