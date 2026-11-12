#!/usr/bin/env python3
"""Exercise the production BLE public loop with backend/timer imports replaced only."""
import pathlib
import sys
root = pathlib.Path(__file__).resolve().parents[3]
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
source = (root / 'plugins/ble/index.ts').read_text()
assert source.count("import S from './native/ble.spec';") == 1
(out / 'ble.ts').write_text(source.replace("import S from './native/ble.spec';", "import S from './ble-fake';\nimport { setInterval, clearInterval, setTimeout, clearTimeout } from './ble-fake';"))
for name in ('ble-fake.ts', 'ble-reentrant.ts'):
    (out / name).write_text((root / 'tests/data/radios' / name).read_text())
