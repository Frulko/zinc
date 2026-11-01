#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
PYTHONDONTWRITEBYTECODE=1 python3 - <<'PY'
from pathlib import Path
import importlib.util
import json
import hashlib
import xml.etree.ElementTree as ET
root=Path('examples/murdoku/references/official')
spec=importlib.util.spec_from_file_location('reference_analysis','examples/murdoku/authoring/analyze_official.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
# Rectangular fixtures distinguish row/column conventions; square examples would hide a transpose bug.
xy={f'room_code_{x}_{y}':str(y*3+x+1) for y in range(2) for x in range(3)}
yx={f'room_code_{y}_{x}':str(y*3+x+1) for y in range(2) for x in range(3)}
assert module.cells(xy,'room_code',3,2,1)==[1,2,3,4,5,6]
assert module.cells(yx,'room_code',3,2,2)==[1,2,3,4,5,6]
assert module.cells(yx,'room_code',3,2,1)==[1,2,3,4,5,6]
sources=json.loads((root/'sources.json').read_text())['files']
assert len(sources)==42
for item in sources:
 data=(root/item['path']).read_bytes()
 assert hashlib.sha256(data).hexdigest()==item['sha256'],item['path']
 json.loads(data)
assets=json.loads((root/'asset-library/manifest.json').read_text())['assets']
assert len(assets)==629 and len({a['path']for a in assets})==629
for item in assets:
 data=(root/'asset-library'/item['path']).read_bytes()
 assert hashlib.sha256(data).hexdigest()==item['sha256'],item['path']
 assert ET.fromstring(data).tag.endswith('svg'),item['path']
palette=json.loads((root/'24h-delivery/palette.json').read_text())
assert palette['rooms'][0]['base']=='#dbb98f' # packed BGR 9419227, not naive RGB
stats=json.loads((root/'analysis.json').read_text())
assert sum(stats['sizes'].values())==42
assert stats['sizes']['9x10']==1 and stats['schema_versions']=={'1':5,'2':37}
print('murdoku references: 42 sources, 629 SVGs, checksums, BGR colours and both coordinate formats pass')
PY
