#!/bin/sh
# The reusable driver accepts a different demo's protocol/state names and does not query local RSS in remote mode.
set -eu
cd "$(dirname "$0")/../.."
python3 - <<'PY'
import io, json, pathlib, runpy, sys, tempfile
from contextlib import redirect_stderr
p = runpy.run_path('tools/resource-probe')
state = {'screen': 'previous', 'pid': 12345}
visits = []
def request(port, method, **params):
    assert port == 9229
    if method == 'Demo.state': return state.copy()
    if method == 'Demo.visit':
        state['screen'] = params['tab']; visits.append(params['tab']); return {}
    assert method == 'Zinc.getResourceStats', method
    return {'images': {'objects': 2, 'cpuBytes': 480}}
p['main'].__globals__['request'] = request
with tempfile.TemporaryDirectory() as directory:
    root = pathlib.Path(directory); scenario = root / 'scenario.json'; output = root / 'output'
    scenario.write_text(json.dumps(dict(stateMethod='Demo.state', navigateMethod='Demo.visit', stateKey='screen', parameter='tab', initial='desk', route=['object', 'clip', 'desk'])))
    sys.argv = ['resource-probe', '--scenario', str(scenario), '--remote', '--cycles', '2', '--dwell', '0', '--output', str(output)]
    p['main']()
    samples = [json.loads(line) for line in (output / 'samples.jsonl').read_text().splitlines()]
    assert visits == ['desk'] + ['object', 'clip', 'desk'] * 2
    assert len(samples) == 7 and all(s['rssBytes'] is None and s['pid'] == 12345 for s in samples)
    assert all(s['resources']['images']['cpuBytes'] == 480 for s in samples)
    assert not (output / 'app.log').exists()
    scenario.write_text('{}')
    with redirect_stderr(io.StringIO()):
        try: p['main']()
        except SystemExit as error: assert error.code == 2
        else: raise AssertionError('invalid scenario accepted')
print('resource_probe: ok (custom demo protocol, remote sampling, scenario validation)')
PY
