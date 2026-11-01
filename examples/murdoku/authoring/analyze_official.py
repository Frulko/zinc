#!/usr/bin/env python3
"""Summarize the downloaded public references; never execute the official JS or import its answers into the game."""
import collections
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1] / 'references' / 'official'


def integer(value, fallback=0):
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return fallback


def fields(raw):
    result = {k: v for k, v in raw.items() if not isinstance(v, dict)}
    for section in ('GRID', 'CHARACTERS'):
        result.update(raw.get(section, {}))
    return result


def cells(data, prefix, width, height, version):
    """v2 uses row_column; legacy files choose the coordinate convention with greatest coverage."""
    pattern = re.compile(r'^' + re.escape(prefix) + r'_(\d+)_(\d+)$')
    source = {}
    for key, value in data.items():
        match = pattern.fullmatch(key)
        if match:
            source[tuple(map(int, match.groups()))] = integer(value)
    conventions = [(0, 'YX')] if version >= 2 else [(0, 'XY'), (0, 'YX'), (1, 'XY'), (1, 'YX')]
    candidates = []
    for base, order in conventions:
        keys = [(x+base, y+base) if order == 'XY' else (y+base, x+base)
                for y in range(height) for x in range(width)]
        candidates.append((sum(key in source for key in keys), [source.get(key, 0) for key in keys]))
    return max(candidates, key=lambda item: item[0])[1]


def summarize():
    catalog = json.loads((ROOT / 'catalog.json').read_text())['puzzles']
    metadata = {}
    for item in catalog:
        for name in (item.get('file'), item.get('id', '') + '.json'):
            if isinstance(name, str):
                metadata[name] = item
    cases = []
    family_mentions = collections.Counter()
    for path in sorted((ROOT / 'puzzles/en').glob('*.json')):
        raw = json.loads(path.read_text())
        props, data = raw['PROPERTIES'], fields(raw)
        width, height = integer(props['grid_w']), integer(props['grid_h'])
        version = integer(props.get('puzzle_version', 1))
        rooms = cells(data, 'room_code', width, height, version)
        objects = cells(data, 'room_objects', width, height, version)
        irregular = 0
        for room in set(rooms):
            positions = [(i % width, i // width) for i, value in enumerate(rooms) if value == room]
            xs, ys = zip(*positions)
            if (max(xs)-min(xs)+1) * (max(ys)-min(ys)+1) > len(positions):
                irregular += 1
        quotes = [str(value) for key, value in data.items()
                  if re.fullmatch(r'char_(?:sub)?quote_en_\d+', key) and str(value).strip()]
        text = ' '.join(quotes).lower()
        for name, pattern in {
            'adjacency': r'\b(beside|next to|adjacent)\b', 'exclusive': r'\b(only|nobody else)\b',
            'direction': r'\b(north|south|east|west|above|below|left of|right of)\b',
            'room-company': r'\b(alone|together|same (?:room|area))\b',
            'line': r'\b(row|column)\b', 'window-door': r'\b(window|door)\b',
            'negative': r'\b(not|never|nobody|no one|wasn.t|weren.t)\b',
        }.items():
            if re.search(pattern, text):
                family_mentions[name] += 1
        meta = metadata.get(path.name, {})
        cases.append({
            'file': path.name, 'title': meta.get('title_en_', path.stem), 'version': version,
            'width': width, 'height': height, 'people': integer(props.get('total_char')),
            'difficulty': meta.get('difficulty', 'unmatched catalogue entry'),
            'room_ids': sorted(set(rooms)), 'irregular_room_count': irregular,
            'nonzero_object_cells': sum(value > 0 for value in objects),
            'object_ids': sorted(set(objects) - {0}), 'clue_text_count': len(quotes),
        })
    stats = {
        'case_count': len(cases), 'catalogue_entry_count': len(catalog),
        'sizes': dict(collections.Counter(f"{c['width']}x{c['height']}" for c in cases)),
        'difficulties': dict(collections.Counter(c['difficulty'] for c in cases)),
        'schema_versions': dict(collections.Counter(str(c['version']) for c in cases)),
        'people_counts': dict(collections.Counter(str(c['people']) for c in cases)),
        'cases_with_nonrectangular_room_masks': sum(c['irregular_room_count'] > 0 for c in cases),
        'rectangular_boards': [c['file'] for c in cases if c['width'] != c['height']],
        'distinct_object_ids': sorted({obj for c in cases for obj in c['object_ids']}),
        'clue_family_mentions_heuristic': dict(family_mentions), 'cases': cases,
        'limits': ['Clue mentions are keyword statistics, not formal translations or validated constraints.',
                   'Room masks are bounding-box measurements; subarea merging and ship regions are not normalized here.',
                   'Nonzero object cells are raw source cells, not an occupancy or difficulty score.',
                   'Official solutions are retained only in source reference files and are not used by our generator.'],
    }
    (ROOT / 'analysis.json').write_text(json.dumps(stats, ensure_ascii=False, indent=2) + '\n')
    return stats


if __name__ == '__main__':
    result = summarize()
    print(json.dumps({k: v for k, v in result.items() if k not in ('cases', 'limits')}, ensure_ascii=False, indent=2))
