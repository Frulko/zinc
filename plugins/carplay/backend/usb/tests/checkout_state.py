#!/usr/bin/env python3
"""Assert repeat builds preserve user-owned backend changes."""
from pathlib import Path
import subprocess
import tempfile

script = Path(__file__).resolve().parents[1] / 'checkout-state'
with tempfile.TemporaryDirectory(prefix='carplay-usb-state-') as temporary:
    root = Path(temporary) / 'receiver'
    root.mkdir()
    def git(*args):
        subprocess.run(['git', '-C', str(root), *args], check=True, capture_output=True)
    def state(action):
        return subprocess.run([str(script), str(root), action], capture_output=True, text=True)
    git('init', '-q')
    source = root / 'source.kt'
    source.write_text('original\n')
    git('add', 'source.kt')
    git('-c', 'user.name=USB test', '-c', 'user.email=usb-test@example.invalid', 'commit', '-qm', 'base')
    assert state('verify').returncode == 0
    source.write_text('managed overlay\n')
    assert state('verify').returncode != 0
    assert state('record').returncode == 0
    assert state('verify').returncode == 0
    extra = root / 'owner-notes'
    extra.write_text('preserve this\n')
    assert state('verify').returncode != 0
    assert extra.read_text() == 'preserve this\n'
    extra.unlink()
    source.write_text('owner modification\n')
    result = state('verify')
    assert result.returncode != 0 and 'refusing to overwrite' in result.stderr
    assert source.read_text() == 'owner modification\n'
print('PASS backend overlay ownership')
