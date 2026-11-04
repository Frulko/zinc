"""Resolve native font files on the Mac; Figma's Plugin API supplies names, not binaries."""
from functools import lru_cache
import io
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def key(value):
    return ''.join(c for c in value.casefold() if c.isalnum())


@lru_cache(maxsize=1)
def installed():
    if sys.platform != 'darwin':
        return []
    result = subprocess.run(['system_profiler', 'SPFontsDataType', '-json'], capture_output=True, timeout=30, check=True)
    return json.loads(result.stdout).get('SPFontsDataType', [])


@lru_cache(maxsize=128)
def resolve(family, style):
    bundled = ROOT / 'lib/fonts' / (family + '-' + style + '.ttf')
    if bundled.parent == ROOT / 'lib/fonts' and bundled.is_file():
        return bundled.read_bytes(), ''
    try:
        for file in installed():
            for face in file.get('typefaces', []):
                if key(face.get('family', '')) != key(family) or key(face.get('style', '')) != key(style):
                    continue
                if face.get('enabled') == 'no': continue
                path = Path(file['path'])
                if path.stat().st_size > 32 * 1024 * 1024: return None, 'fichier de police trop volumineux'
                data = path.read_bytes()
                # fontTools is optional, needed only for collections or variable font instances.
                if data[:4] == b'ttcf' or path.suffix.lower() == '.otf' or b'fvar' in data[:4096]:
                    try:
                        from fontTools.ttLib import TTFont, TTCollection
                        from fontTools.ttLib import TTLibError
                        if data[:4] == b'ttcf':
                            collection = TTCollection(io.BytesIO(data))
                            matches = [f for f in collection.fonts if key(f['name'].getDebugName(2) or '') == key(style) and key(f['name'].getDebugName(1) or '') == key(family)]
                            if not matches: return None, 'face introuvable dans la collection'
                            font = matches[0]
                        else:
                            font = TTFont(io.BytesIO(data))
                        if 'fvar' in font:
                            from fontTools.varLib.instancer import instantiateVariableFont
                            instance = next((i for i in font['fvar'].instances if key(font['name'].getDebugName(i.subfamilyNameID) or '') == key(style)), None)
                            if instance is None: return None, 'instance variable introuvable'
                            font = instantiateVariableFont(font, instance.coordinates)
                        if 'glyf' not in font: return None, 'contours OpenType CFF non pris en charge par Zinc'
                        output = io.BytesIO(); font.save(output); data = output.getvalue()
                    except ImportError:
                        return None, 'fontTools requis pour cette collection ou police variable'
                    except (TTLibError, NotImplementedError) as error:
                        return None, 'extraction de la police impossible : ' + str(error)
                if data[:4] not in (b'\x00\x01\x00\x00', b'true'): return None, 'format de police non pris en charge'
                return data, ''
        return None, 'police absente du Mac ; installez-la puis relancez Zinc Live'
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        return None, 'lecture de la police impossible : ' + str(error)
