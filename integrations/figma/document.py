"""Validated Figma data, shared by the native viewer and readable source export."""
import base64
import copy
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata
import xml.etree.ElementTree as ET
from semantic import contract

LIMIT = 32 * 1024 * 1024
NUMERIC = set('width height left top right bottom flexShrink flexGrow flexBasis gap rowGap columnGap paddingTop paddingRight paddingBottom paddingLeft minWidth maxWidth minHeight maxHeight opacity borderRadius borderWidth fontSize lineHeight letterSpacing rotate'.split())
ENUMS = {'position': {'absolute', 'relative'}, 'overflow': {'hidden', 'auto'},
         'fontWeight': {'normal', 'bold'}, 'textAlign': {'left', 'right', 'center', 'justified'},
         'flexDirection': {'row', 'column'}, 'flexWrap': {'wrap', 'nowrap'},
         'justifyContent': {'flex-start', 'center', 'flex-end', 'space-between', 'space-around'},
         'alignItems': {'flex-start', 'center', 'flex-end', 'stretch'}, 'alignSelf': {'flex-start', 'center', 'flex-end', 'stretch'}}
COLORS = {'backgroundColor', 'color', 'borderColor'}
PREFIX = dict(zip('width height left top right bottom flexShrink flexGrow gap rowGap columnGap paddingTop paddingRight paddingBottom paddingLeft minWidth maxWidth minHeight maxHeight borderRadius borderWidth fontSize lineHeight letterSpacing rotate'.split(),
                  'w h left top right bottom shrink grow gap gap-y gap-x pt pr pb pl min-w max-w min-h max-h rounded border text leading tracking rotate'.split()))
TOKENS = {'position': {'absolute': 'absolute', 'relative': 'relative'},
          'overflow': {'hidden': 'overflow-hidden', 'auto': 'overflow-auto'},
          'flexDirection': {'row': 'flex-row', 'column': 'flex-col'}, 'flexWrap': {'wrap': 'flex-wrap', 'nowrap': 'flex-nowrap'},
          'justifyContent': {'flex-start': 'justify-start', 'center': 'justify-center', 'flex-end': 'justify-end', 'space-between': 'justify-between', 'space-around': 'justify-around'},
          'alignItems': {'flex-start': 'items-start', 'center': 'items-center', 'flex-end': 'items-end', 'stretch': 'items-stretch'},
          'alignSelf': {'flex-start': 'self-start', 'center': 'self-center', 'flex-end': 'self-end', 'stretch': 'self-stretch'},
          'fontWeight': {'normal': 'font-normal', 'bold': 'font-bold'},
          'textAlign': {'left': 'text-left', 'right': 'text-right', 'center': 'text-center', 'justified': 'text-justify'}}
MOTION_KEYS = {'left', 'top', 'translateX', 'translateY', 'width', 'height', 'opacity', 'rotate', 'scaleX', 'scaleY', 'borderRadius', 'gap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'}


def identifier(name, fallback='Layer'):
    words = re.findall(r'[A-Za-z0-9]+', unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode())
    name = ''.join(w[:1].upper() + w[1:] for w in words)[:64] or fallback
    return name if name[0].isalpha() else fallback + name


def finite(value, low=-100000, high=100000):
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError('Invalid numeric value')
    return value


def text(value, limit=256):
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError('Invalid text value')
    return value


def metadata(value, depth=0):
    if depth > 16: raise ValueError('Metadata is too deeply nested')
    if value is None or type(value) is bool: return value
    if isinstance(value, str): return text(value, 10000)
    if type(value) in (int, float): return finite(value, -1e12, 1e12)
    if isinstance(value, list) and len(value) <= 1000: return [metadata(v, depth + 1) for v in value]
    if isinstance(value, dict) and len(value) <= 1000: return {text(k): metadata(v, depth + 1) for k, v in value.items()}
    raise ValueError('Invalid design metadata')


def classes(style):
    out = []
    for key, value in style.items():
        if key in NUMERIC and not isinstance(value, str):
            continue
        if key in COLORS:
            prefix = {'backgroundColor': 'bg', 'color': 'text', 'borderColor': 'border'}[key]
            out.append(prefix + '-[' + value[:7] + ']/' + str(round(int(value[7:9], 16) * 100 / 255)))
        elif key in PREFIX:
            suffix = str(value) + ('px' if key in {'fontSize', 'borderWidth'} else '')
            out.append(PREFIX[key] + '-[' + suffix + ']')
        else:
            out.append(TOKENS[key][value])
    return ' '.join(out)


def validate_assets(raw):
    if not isinstance(raw, dict) or len(raw) > 256:
        raise ValueError('At most 256 extracted assets')
    assets, pixels = {}, 0
    for name, encoded in raw.items():
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}\.(png|jpg|svg|json)', name) or not isinstance(encoded, str):
            raise ValueError('Invalid asset name or data')
        try:
            data = base64.b64decode(encoded, validate=True)
        except ValueError as e:
            raise ValueError('Invalid asset encoding') from e
        if len(data) > 8 * 1024 * 1024:
            raise ValueError('An asset exceeds 8 MiB')
        if name.endswith('.png'):
            if len(data) < 24 or data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
                raise ValueError('Expected a PNG image')
            w, h = int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big')
            pixels += w * h
            if not 1 <= w <= 8192 or not 1 <= h <= 8192 or pixels > 16_777_216:
                raise ValueError('PNG dimensions exceed preview limits')
        elif name.endswith('.jpg'):
            try: from PIL import Image
            except ImportError: raise ValueError('JPEG photos require Pillow: python3 -m pip install Pillow')
            import io
            try:
                with Image.open(io.BytesIO(data)) as image:
                    w,h=image.size
                    if image.format != 'JPEG' or not 1 <= w <= 8192 or not 1 <= h <= 8192: raise ValueError('Invalid JPEG dimensions')
                    pixels += w*h
                    if pixels > 16_777_216: raise ValueError('Image dimensions exceed preview limits')
                    image.verify()
            except OSError as error: raise ValueError('Invalid JPEG') from error
        elif name.endswith('.svg'):
            try:
                if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
                    raise ValueError('SVG declarations are not allowed')
                root = ET.fromstring(data)
                if root.tag.split('}')[-1] != 'svg':
                    raise ValueError('Expected SVG')
                for element in root.iter():
                    if element.tag.split('}')[-1] in {'script', 'style', 'foreignObject', 'image'}:
                        raise ValueError('SVG must contain local vectors only')
                    for attr, value in element.attrib.items():
                        if attr.lower().startswith('on') or (attr.split('}')[-1] == 'href' and not value.startswith('#')):
                            raise ValueError('External SVG references are not allowed')
                        if any(not url.strip().strip('\"\'').startswith('#') for url in re.findall(r'url\s*\((.*?)\)', value, re.I)):
                            raise ValueError('External SVG references are not allowed')
            except ET.ParseError as e:
                raise ValueError('Invalid SVG') from e
        else:
            animation = json.loads(data)
            if not isinstance(animation, dict) or not isinstance(animation.get('layers'), list):
                raise ValueError('Expected Lottie JSON')
            if len(animation['layers']) > 512 or len(animation.get('assets', [])) > 128:
                raise ValueError('Lottie exceeds layer limits')
            finite(animation.get('fr'), 1, 120)
            finite(animation.get('op'), 1, 100000)
            finite(animation.get('w'), 1, 4096); finite(animation.get('h'), 1, 4096)
            # The native Lottie subset is vector-only; do not silently lose external media.
            if any(a.get('p') for a in animation.get('assets', [])):
                raise ValueError('Lottie with external images must be embedded as a supported media asset')
        assets[name] = data
    return assets


def normalize(raw):
    if not isinstance(raw, dict) or raw.get('format') != 'zinc-live/1':
        raise ValueError('Expected zinc-live/1')
    assets = validate_assets(raw.get('assets', {}))
    names, ids, count = set(), set(), 0
    mapping = []

    def node(n, depth=0, path=''):
        nonlocal count
        count += 1
        if count > 5000 or depth > 48 or not isinstance(n, dict):
            raise ValueError('Design exceeds 5000 nodes or 48 levels')
        tag, style = n.get('type'), n.get('style')
        if tag not in {'View', 'Text', 'Image', 'Svg', 'Lottie'} or not isinstance(style, dict):
            raise ValueError('Invalid node or style')
        style = dict(style)
        if isinstance(style.get('flexGrow'), (int,float)) and style['flexGrow'] > 0: style.setdefault('flexBasis',0)
        for key, value in style.items():
            if key in NUMERIC:
                if isinstance(value, str) and key in {'width', 'height'} and re.fullmatch(r'\d{1,3}(\.\d+)?%', value) and float(value[:-1]) <= 100:
                    continue
                finite(value)
                if key == 'opacity': finite(value, 0, 1)
            elif key in ENUMS:
                if not isinstance(value, str) or value not in ENUMS[key]: raise ValueError('Invalid style: ' + key)
            elif key in COLORS:
                if not isinstance(value, str) or not re.fullmatch(r'#[a-fA-F0-9]{8}', value): raise ValueError('Invalid color')
            else:
                raise ValueError('Unknown style: ' + key)
        uid = text(n.get('id', 'node-' + str(count)))
        if uid in ids: raise ValueError('Duplicate node id: ' + uid)
        ids.add(uid)
        name = text(n.get('name', tag))
        code_name = identifier(name)
        if code_name in names: code_name += '_' + hashlib.sha256(uid.encode()).hexdigest()[:6]
        names.add(code_name)
        path = path + '/' + name
        numbers = [{'key': key, 'value': value} for key, value in style.items() if key in NUMERIC and not isinstance(value, str)]
        result = {'id': uid, 'name': name, 'codeName': code_name, 'type': tag, 'style': style, 'numbers': numbers, 'classes': classes(style), 'children': [], 'interactions': [], 'motion': []}
        for field in ['bindings', 'component']:
            if field in n: result[field] = metadata(n[field])
        native = contract(result.get('component'))
        if native is not None:
            result['native'] = native
            result['type'] = tag = 'View'
        mapping.append({'id': uid, 'name': name, 'codeName': code_name, 'path': path})
        children = n.get('children', [])
        if not isinstance(children, list) or (tag != 'View' and children): raise ValueError('Only View may have children')
        if tag == 'Text':
            if n.get('font'):
                if not isinstance(n['font'], dict): raise ValueError('Invalid font reference')
                result['font'] = {'family': text(n['font'].get('family')), 'style': text(n['font'].get('style'))}
            result['text'] = text(n.get('text'), 100000)
            if 'wrap' in n and type(n['wrap']) is not bool: raise ValueError('Invalid text wrapping')
            result['wrap'] = n.get('wrap', True)
            result['classes'] += ' whitespace-pre-wrap' if result['wrap'] else ' whitespace-pre'
        if tag in {'Image', 'Svg', 'Lottie'}:
            asset = n.get('asset')
            if not isinstance(asset, str) or asset not in assets: raise ValueError('Missing asset')
            if not asset.endswith({'Image': ('.png','.jpg'), 'Svg': ('.svg',), 'Lottie': ('.json',)}[tag]): raise ValueError('Wrong asset type')
            result['asset'] = asset
            if tag == 'Image':
                fit = n.get('imageFit','stretch')
                if fit not in {'cover','contain','stretch'}: raise ValueError('Invalid image fit')
                result['imageFit'] = fit
            if 'text' in n: result['text'] = text(n['text'], 100000)
        interactions = n.get('interactions', [])
        if not isinstance(interactions, list) or len(interactions) > 32: raise ValueError('Too many interactions')
        for a in interactions:
            if not isinstance(a, dict) or a.get('trigger') not in {'click', 'enter', 'leave', 'down', 'up', 'hover', 'press', 'after'} or a.get('action') not in {'navigate', 'back', 'overlay', 'close', 'variant'}:
                raise ValueError('Invalid interaction')
            transition = a.get('transition', {})
            if not isinstance(transition, dict): raise ValueError('Invalid transition')
            kind = transition.get('kind', 'instant')
            if kind not in {'instant', 'dissolve', 'move', 'smart'}: raise ValueError('Invalid transition kind')
            result['interactions'].append({'key': code_name + '.' + a['trigger'] + '.' + str(len(result['interactions'])), 'trigger': a['trigger'], 'action': a['action'], 'target': text(a.get('target', '')),
                'delay': finite(a.get('delay', 0), 0, 60000), 'transition': {'kind': kind, 'duration': finite(transition.get('duration', 0), 0, 10000), 'easing': text(transition.get('easing', 'linear'), 64)}})
        motion = n.get('motion', [])
        if not isinstance(motion, list) or len(motion) > 32: raise ValueError('Too many motion tracks')
        for track in motion:
            if not isinstance(track, dict) or track.get('key') not in MOTION_KEYS: raise ValueError('Invalid motion property')
            points = track.get('points')
            if not isinstance(points, list) or not 1 <= len(points) <= 256: raise ValueError('Invalid keyframes')
            last = -1
            for point in points:
                if not isinstance(point, dict): raise ValueError('Invalid keyframe')
                at = finite(point.get('at'), 0, 600000)
                if at < last: raise ValueError('Unsorted keyframes')
                last = at; finite(point.get('value'))
                text(point.get('easing', 'linear'), 64)
            result['motion'].append(copy.deepcopy(track))
        result['children'] = [node(child, depth + 1, path) for child in children]
        return result

    screens = raw.get('screens')
    if screens is None:
        screens = [{'id': 'screen', 'name': raw.get('name', 'Design'), 'tree': raw.get('tree')}]
    if not isinstance(screens, list) or not 1 <= len(screens) <= 32: raise ValueError('At most 32 prototype screens')
    result = {'format': 'zinc-live/1', 'name': text(raw.get('name', 'Design')), 'screens': [], 'fonts': [], 'warnings': []}
    for screen in screens:
        if not isinstance(screen, dict): raise ValueError('Invalid screen')
        tree = node(screen.get('tree'))
        width = finite(screen.get('width', tree['style'].get('width')), 1, 4096)
        height = finite(screen.get('height', tree['style'].get('height')), 1, 4096)
        result['screens'].append({'id': text(screen.get('id', tree['id'])), 'name': text(screen.get('name', tree['name'])), 'tree': tree, 'width': round(width), 'height': round(height), 'duration': finite(screen.get('duration', 0), 0, 600000)})
    for screen in result['screens']:
        parts = screen['name'].split(' / ')
        if len(parts) >= 3 and parts[-1] in {'Tablet','Portrait','Mobile'}:
            screen['group'] = ' / '.join(parts[:-1])
            screen['minWidth'] = {'Mobile':0,'Portrait':600,'Tablet':1000}[parts[-1]]
    screen_ids = [s['id'] for s in result['screens']]
    if len(set(screen_ids)) != len(screen_ids): raise ValueError('Duplicate screen id')
    result['initial'] = text(raw.get('initial', screen_ids[0]))
    if result['initial'] not in screen_ids: raise ValueError('Missing initial screen')
    def targets(n):
        for action in n['interactions']:
            if action['action'] in {'navigate', 'overlay', 'variant'} and action['target'] not in screen_ids:
                raise ValueError('Prototype destination was not exported: ' + action['target'])
        for child in n['children']: targets(child)
    for screen in result['screens']: targets(screen['tree'])
    fonts = raw.get('fonts', [])
    if not isinstance(fonts, list) or len(fonts) > 128: raise ValueError('Too many fonts')
    for f in fonts:
        if not isinstance(f, dict): raise ValueError('Invalid font metadata')
        result['fonts'].append({'family': text(f.get('family')), 'style': text(f.get('style')), 'extraction': text(f.get('extraction', 'native'))})
    warnings = raw.get('warnings', [])
    if not isinstance(warnings, list) or len(warnings) > 5000: raise ValueError('Invalid warnings')
    result['warnings'] = [text(w, 1000) for w in warnings]
    result['designSystem'] = metadata(raw.get('designSystem', {}))
    return result, assets, mapping


def source(document):
    """Export a self-contained scene module using the same runtime as the viewer."""
    # Serialized data stays data. The shared runtime supplies layout, interactions and playback.
    payload = json.dumps(document, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
    name = identifier(document['name'], 'Design')
    return ("// Generated by Zinc Live. Keep application logic in your caller.\n"
            "import { Scene } from './scene';\nimport { onCleanup } from 'zinc:ui/solid';\n"
            'export const designDocument = JSON.parse(' + json.dumps(payload, ensure_ascii=False) + ');\n'
            'export function ' + name + '(): i32 {\n'
            '  const scene = new Scene();\n  scene.load(designDocument);\n  onCleanup(() => scene.close());\n  return scene.root;\n}\n'
            'export const Design = ' + name + ';\n')
