#!/usr/bin/env python3
"""Offline pairing CLI proof with a fake BlueZ command and private store."""

import os
from pathlib import Path
import subprocess
import tempfile


CLI = Path(__file__).resolve().parents[1] / "pairings"
FIRST = "AA:BB:CC:DD:EE:01"
SECOND = "AA:BB:CC:DD:EE:02"
AIRPLAY = "CC:DD:EE:FF:00:01"


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    bin_dir = root / "bin"
    bin_dir.mkdir()
    paired = root / "paired"
    paired.write_text(FIRST + "\n" + SECOND + "\n")
    bluetoothctl = bin_dir / "bluetoothctl"
    bluetoothctl.write_text("""#!/usr/bin/env python3
import os, pathlib, sys
p=pathlib.Path(os.environ['PAIRED_FILE'])
addresses=p.read_text().splitlines()
if sys.argv[1:] == ['devices', 'Paired']:
    if os.environ.get('LIST_FAIL'):
        sys.exit(1)
    print(''.join(f'Device {a} iPhone\\n' for a in addresses), end='')
elif sys.argv[1] == 'remove':
    if os.environ.get('REMOVE_FAIL'):
        sys.exit(1)
    p.write_text(''.join(a+'\\n' for a in addresses if a != sys.argv[2]))
else:
    sys.exit(2)
""")
    bluetoothctl.chmod(0o755)
    state = root / "state"
    state.mkdir()
    store = state / "pairings.properties"
    key = "a1" * 32
    store.write_text("# paired controllers\nCC\\:DD\\:EE\\:FF\\:00\\:01=" + key + "\nAA\\:BB\\:CC\\:DD\\:EE\\:02=" + key + "\n")
    store.chmod(0o600)
    env = os.environ | {"PATH": str(bin_dir) + os.pathsep + os.environ["PATH"], "PAIRED_FILE": str(paired)}

    def run(*args, environment=env):
        return subprocess.run(["python3", str(CLI), "--state-dir", str(state), *args],
                              capture_output=True, text=True, env=environment)

    listed = run("list")
    assert listed.returncode == 0 and FIRST in listed.stdout and SECOND in listed.stdout and AIRPLAY in listed.stdout
    assert key not in listed.stdout
    offline = run("list", environment=env | {"LIST_FAIL": "1"})
    assert offline.returncode == 0 and AIRPLAY in offline.stdout and "Bluetooth=unknown" in offline.stdout
    assert "Bluetooth unavailable" in offline.stderr
    failed = run("forget", FIRST, environment=env | {"REMOVE_FAIL": "1"})
    assert failed.returncode == 1 and FIRST in paired.read_text() and "CC\\:DD\\:EE\\:FF" in store.read_text()
    removed = run("forget", FIRST.lower())
    assert removed.returncode == 0, removed.stderr
    assert FIRST not in paired.read_text() and "CC\\:DD\\:EE\\:FF" in store.read_text()
    assert SECOND in paired.read_text() and "02=" in store.read_text()
    assert "AirPlay=absent" in removed.stdout
    airplay_removed = run("forget", AIRPLAY)
    assert airplay_removed.returncode == 0 and "CC\\:DD\\:EE\\:FF" not in store.read_text(), (airplay_removed.stderr, store.read_text())
    assert "Bluetooth=absent" in airplay_removed.stdout
    assert store.stat().st_mode & 0o777 == 0o600
    missing = run("forget", FIRST)
    assert missing.returncode == 1 and "not paired" in missing.stderr

print("pairings: list, failed removal, targeted forget and file permissions pass")
