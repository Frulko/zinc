import json
import os
from pathlib import Path
import subprocess
import tempfile

with tempfile.TemporaryDirectory(prefix='zinc-qjs-gc-') as tmp:
    trace = Path(tmp) / 'trace.json'
    env = dict(os.environ, ZINC_HEADLESS='1', ZINC_DETERMINISTIC='1', ZINC_FRAMES='6', ZINC_SIZE='32x32', ZINC_PROFILE='json', ZINC_TRACE=str(trace))
    run = subprocess.run([os.environ['ZINC'], 'run', 'tests/data/qjs_gc/frame.js', '--engine', 'quickjs'], env=env, capture_output=True, text=True, timeout=12)
    assert run.returncode == 0, run.stdout + run.stderr
    assert 'frames 6 123' in run.stdout, run.stdout
    rows = [json.loads(line.split(': ', 1)[1]) for line in run.stderr.splitlines() if line.startswith('zinc profile json: ')]
    assert len(rows) == 1 and rows[0]['frames'] == 6, run.stderr
    phases = rows[0]['phases']
    assert phases['gc']['max'] > 0, phases
    # Work includes GC; the per-frame mean is additive (individual percentiles are not).
    total = sum(v['mean'] for k, v in phases.items() if k not in ('present', 'work', 'interval', 'present_interval'))
    assert abs(phases['work']['mean'] - total) <= len(phases), phases
    spans = json.loads(trace.read_text())
    if isinstance(spans, dict): spans = spans['traceEvents']
    assert any(s.get('name') == 'gc' and s.get('dur', 0) > 0 for s in spans), spans
    # Text output uses the same integrated phase; profiling off stays quiet.
    env.pop('ZINC_TRACE')
    for mode in ('1', '0'):
        env['ZINC_PROFILE'] = mode
        out = subprocess.run([os.environ['ZINC'], 'run', 'tests/data/qjs_gc/frame.js', '--engine', 'quickjs'], env=env, capture_output=True, text=True, timeout=12)
        assert out.returncode == 0, out.stderr
        assert ('zinc profile: gc p50=' in out.stderr) == (mode == '1'), out.stderr
print('ok: boundary GC phase, work totals, trace, quiet off; no latency claim')
