#!/usr/bin/env python3
"""Use the production public loop with deterministic backend/timer imports only."""
import pathlib
import sys
root = pathlib.Path(__file__).resolve().parents[3]
out = pathlib.Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
source = (root / 'plugins/wifi/index.ts').read_text()
assert source.count("import S from './native/wifi.spec';") == 1
(out / 'wifi.ts').write_text(source.replace("import S from './native/wifi.spec';", "import S from './fake';\nimport { setInterval, clearInterval } from './fake';"))
for name in ('fake.ts', 'reentrant.ts'):
    (out / name).write_text((root / 'tests/data/radios' / name).read_text())
