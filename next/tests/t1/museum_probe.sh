#!/bin/sh
# Remote commands use completed transitions and reject invalid/busy requests. RSS belongs to the native engine process.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); app=''; trap 'rc=$?; if [ $rc -ne 0 ]; then cat "$tmp/app.log"; fi; if [ -n "$app" ]; then kill "$app" 2>/dev/null || true; fi; rm -rf "$tmp"' EXIT
port=$(python3 tests/free_ports.py 1)
env -u ZINC_DETERMINISTIC ZINC_NATIVE=real ZINC_3D=software ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=1000000 ZINC_DEVTOOLS_PORT="$port" "$ZINC" run --interp ../examples/museum-table -- --probe --story > "$tmp/app.log" 2>&1 & app=$!
python3 - "$port" "$app" "$tmp" <<'PY'
import json, runpy, sys, time
p = runpy.run_path('tools/resource-probe'); port, pid, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
scenario = json.load(open('tools/scenarios/museum.json'))
deadline = time.monotonic() + 40
while True:
    try:
        state = p['request'](port, 'Museum.getState'); break
    except OSError:
        if time.monotonic() > deadline: raise
        time.sleep(.1)
p['wait_scene'](port, 'ukiyo-e', scenario)
for method, params in [('Museum.navigate', {'sequence': 'missing'}), ('Runtime.evaluate', {})]:
    try: p['request'](port, method, **params)
    except RuntimeError: pass
    else: raise AssertionError('invalid diagnostic request accepted')
p['request'](port, 'Museum.navigate', sequence='porcelain')
try: p['request'](port, 'Museum.navigate', sequence='wave')
except RuntimeError: pass
else: raise AssertionError('navigation accepted during fade')
state = p['wait_scene'](port, 'porcelain', scenario); assert state['retainedModels'] == 1, state
p['request'](port, 'Museum.navigate', sequence='ukiyo-e'); p['wait_scene'](port, 'ukiyo-e', scenario)
sys.argv = ['resource-probe', '--scenario', 'tools/scenarios/museum.json', '--port', str(port), '--pid', str(state['pid']), '--cycles', '1', '--dwell', '.1', '--output', out]
p['main']()
samples = [json.loads(line) for line in open(out + '/samples.jsonl')]
assert [s['state']['sequence'] for s in samples] == ['ukiyo-e', 'porcelain', 'wave', 'ukiyo-e']
assert all(s['rssBytes'] > 0 for s in samples)
assert samples[-1]['state']['retainedModels'] == samples[-1]['state']['retainedDecoders'] == 1
assert samples[-1]['resources']['video.buffers']['objects'] == 1, samples[-1]
assert samples[-1]['resources']['video.buffers']['active'] == 0
assert samples[-1]['resources']['3d.targets']['objects'] > 0
sys.argv = ['resource-probe', '--scenario', 'tools/scenarios/museum.json', '--remote', '--port', str(port), '--cycles', '1', '--dwell', '0', '--output', out + '/remote']
p['main']()
remote = [json.loads(line) for line in open(out + '/remote/samples.jsonl')]
assert len(remote) == 4 and all(s['rssBytes'] is None and s['pid'] == state['pid'] for s in remote)
assert remote[-1]['resources']['video.buffers']['objects'] == 1
assert not __import__('pathlib').Path(out + '/app.log').read_bytes().startswith(b'\0')
PY
echo 'museum_probe: ok (remote transitions, errors, real native counters and RSS)'
