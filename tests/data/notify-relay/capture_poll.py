"""Run only real capture/SQLite/plist polling, without a relay, tray or network."""
import os
from pathlib import Path
import plistlib
import sqlite3
import subprocess
import sys
import tempfile

with tempfile.TemporaryDirectory(prefix='zinc-capture-batches-') as tmp:
    root = Path(tmp)
    request = {'app': 'net.whatsapp.WhatsApp', 'req': {'titl': 'Fixture sender', 'body': 'Fixture body'}}
    plain = plistlib.dumps(request, fmt=plistlib.FMT_BINARY)
    (root / 'plain.plist').write_bytes(plain)
    request['req']['cnta'] = {'identityImageData': b'\x89PNG\r\n\x1a\n' + bytes(65536)}
    (root / 'image.plist').write_bytes(plistlib.dumps(request, fmt=plistlib.FMT_BINARY))
    with sqlite3.connect(root / 'db') as db:
        db.executescript('PRAGMA journal_mode=WAL; CREATE TABLE app(app_id INTEGER PRIMARY KEY, identifier TEXT); '
                         'CREATE TABLE record(rec_id INTEGER PRIMARY KEY,app_id INTEGER,uuid BLOB,data BLOB,delivered_date REAL,presented INTEGER); '
                         "INSERT INTO app VALUES(1,'net.whatsapp.WhatsApp');")
        db.execute('INSERT INTO record VALUES(1,1,?,?,?,1)', (bytes(16), plain, 799996000.5))
    env = dict(os.environ, RELAY_CAPTURE_FIXTURE=tmp, ZINC_HEADLESS='1', ZINC_BACKGROUND='1')
    result = subprocess.run([sys.argv[1], 'run', 'examples/notify-relay/tests/capture.ts'], env=env, text=True,
                            capture_output=True, timeout=25)
    assert result.returncode == 0 and 'capture batches: PASS' in result.stdout, result.stdout + result.stderr
    print('capture batches: PASS')
