#!/usr/bin/env python3
"""Fresh and repeated overlays must produce identical, compilable source."""
from pathlib import Path
import subprocess
import sys
import tempfile

script = Path(__file__).resolve().parents[1] / 'prepare'
with tempfile.TemporaryDirectory(prefix='carplay-usb-prepare-') as temporary:
    root = Path(temporary) / 'receiver'
    subprocess.run(['git', 'clone', '-q', '--shared', sys.argv[1], str(root)], check=True)
    main = root / 'server/src/main/kotlin/com/playport/server/Main.kt'
    gradle = root / 'protocol/build.gradle.kts'
    subprocess.run([str(script), str(root)], check=True)
    first = main.read_bytes(), gradle.read_bytes()
    initializer = main.read_text().split('    val wired = try {', 1)[1].split('    val server =', 1)[0]
    assert 'wired?.close()' not in initializer, 'initializer cannot close an uninitialized value'
    subprocess.run([str(script), str(root)], check=True)
    assert first == (main.read_bytes(), gradle.read_bytes()), 'warm overlay differs from fresh checkout'
print('PASS fresh/repeated backend overlay')
