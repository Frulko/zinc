import json, os, shutil, struct, subprocess, sys, tempfile
from pathlib import Path
root = Path.cwd()
zinc = str(Path(sys.argv[1]).resolve())
with tempfile.TemporaryDirectory(prefix='zinc-music-layout-') as tmp:
    app = Path(tmp)
    manifest = json.loads((root / 'examples/music-tree/zinc.json').read_text())
    manifest['entry'] = 'main.ts'
    (app / 'zinc.json').write_text(json.dumps(manifest))
    (app / 'spotify.json').write_text('{}')  # No shared desktop Spotify credentials.
    shutil.copytree(root / 'examples/music-tree/src', app / 'src')
    (app / 'main.ts').write_text((root / 'tests/data/music-tree/responsive_stage.ts').read_text().replace('@APP@', '.'))
    # Start a paired-list view without opening a real relay or adding a production test hook.
    relay = app / 'src/services/notify-service.ts'
    source = relay.read_text()
    original = 'export let isMacPaired: boolean = false;'
    assert original in source
    relay.write_text(source.replace(original, "export let isMacPaired: boolean = env('MUSIC_TEST_VIEW').startsWith('notifications');", 1))
    cases = [('landscape',800,480,'', '3 move 585 340\n4 down\n6 up\n', 'PLAY'),
             ('portrait',480,800,'', '3 move 272 660\n4 down\n6 up\n', 'PLAY'),
             ('short',320,480,'', '3 move 200 400\n4 wheel 0 -6\n8 move 192 340\n9 down\n11 up\n', 'PLAY'),
             ('desktop',1280,720,'', '', ''),
             ('context',480,800,'context', '3 move 432 78\n4 down\n6 up\n', 'context=false'),
             ('volume',800,480,'volume', '', ''),
             ('clock',480,800,'clock', '', ''),
             ('weather',480,800,'weather', '', ''),
             ('rings',480,800,'rings', '', ''),
             ('rooms',480,800,'rooms', '', ''),
             ('radios',480,800,'radios', '', ''),
             ('spotify',480,800,'spotify', '', ''),
             ('settings',480,800,'settings', '', ''),
             ('artist',480,800,'artist', '', ''),
             ('album',320,800,'album', '', ''),
             ('notifications',320,480,'notifications', '', ''),
             ('notifications-empty',320,480,'notifications-empty', '', ''),
             ('pairing',320,480,'pairing', '3 move 200 400\n4 wheel 0 -12\n', ''),
             ('search',480,800,'search', '', '')]
    for name,w,h,mode,keys,want in cases:
        shot = app / (name + '.png')
        events = app / 'input'
        events.write_text(keys)
        env = dict(os.environ, HOME=str(app), ZINC_HEADLESS='1', ZINC_BACKGROUND='1', ZINC_DETERMINISTIC='1', ZINC_FRAMES='60' if mode == 'search' else '20',
                   ZINC_SIZE=f'{w}x{h}', ZINC_SCALE='1', ZINC_STORAGE=str(app / ('storage-' + name)), ZINC_INPUT=str(events),
                   ZINC_SHOT=str(shot), ZINC_SHOT_FRAMES='40' if mode == 'search' else '18' if mode == 'pairing' else '2', MUSIC_TEST_VIEW=mode, ZINC_MUSIC_RELAY='' if mode in ('notifications', 'notifications-empty', 'pairing') else '/dev/null', ZINC_MUSIC_METEO='http://127.0.0.1:9')
        r = subprocess.run([zinc, 'run', str(app)], cwd=app, env=env, text=True, capture_output=True, timeout=35)
        assert r.returncode == 0 and r.stdout.count('bounds OK') == 2 and want in r.stdout, (name,r.stdout,r.stderr)
        actual = app / (name + ('-40.png' if mode == 'search' else '-18.png' if mode == 'pairing' else '-2.png'))
        assert struct.unpack('>II', actual.read_bytes()[16:24]) == (w,h), name
        if name == 'landscape':
            golden = root / 'tests/golden/music-tree/responsive-player.png'
            assert subprocess.run([str(root / 'tools/pngdiff'), str(actual), str(golden)], capture_output=True).returncode == 0, 'responsive player golden changed'
        if os.environ.get('KEEP'):
            dest = Path(os.environ['KEEP']); dest.mkdir(parents=True, exist_ok=True)
            (dest / (name + '.png')).write_bytes(actual.read_bytes())
        print('responsive ' + name + ': PASS', flush=True)
