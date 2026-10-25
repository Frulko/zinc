#!/usr/bin/env python3
"""Use the same trust boundary as the Blender publisher, including editor exports."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
from scene_exchange import publish, revision, partition_world

try:
    document = json.loads(Path(sys.argv[1]).read_text())
    if any('world' in node['metadata'] for node in document['nodes']):
        document['revision'] = revision(document)
        document['worldSources'] = partition_world(document)['provenance']
    publish(document, sys.argv[2])
except (ValueError, OSError) as error:
    print(f'Zinc export: {error}', file=sys.stderr)
    sys.exit(1)
