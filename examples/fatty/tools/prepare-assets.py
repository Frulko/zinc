#!/usr/bin/env python3
"""Read the original Flash XML with ElementTree; emit metrics for Zinc, without touching the assets."""
from pathlib import Path
import json
import xml.etree.ElementTree as ET

assets = Path(__file__).resolve().parents[1] / 'assets'
atlases = {}
for name in ('ui_sprite.xml', 'sprite elements.xml', 'sprite_gros.xml',
             'sprite gros barbouile.xml', 'anim_all.xml'):
    root = ET.parse(assets / name).getroot()
    entries = [dict(frame.attrib) for frame in root.findall('SubTexture')]
    assert entries and len({frame['name'] for frame in entries}) == len(entries), name
    # sprite_gros.xml names "sprite gros.png"; the shipped PNG actually uses an underscore.
    image_name = 'sprite_gros.png' if name == 'sprite_gros.xml' else root.attrib['imagePath']
    assert (assets / image_name).is_file(), image_name
    atlases[name] = entries
font = ET.parse(assets / 'typo/Cubano_green_64.fnt').getroot()
data = {
    'atlases': atlases,
    'glyphs': [dict(glyph.attrib) for glyph in font.findall('./chars/char')],
    'kernings': [dict(kern.attrib) for kern in font.findall('./kernings/kerning')],
    'lineHeight': int(font.find('common').attrib['lineHeight']),
}
(assets / 'atlas-data.json').write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
