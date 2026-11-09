#!/bin/sh
# Test the gate's measurement contract without hardware timing or compiling kernels.
cd "$(dirname "$0")/../.." || exit 2
python3 tests/data/bench_harness.py || exit 1
# Cheap real structural oracle: no timing threshold, GPU, AOT build or device.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_PROFILE=json ZINC_PROFILE_SKIP=0 ZINC_SIZE=240x160 ZINC_FRAMES=100 \
  ZB_ROWS=16 ZB_PER=8 ZB_SCENE=ui_noop,ui_sparse_label,ui_paint_only,ui_filter,ui_lifetime,ui_retained,ui_virtual \
  ZB_OUT="$tmp/report.json" timeout 20 "$ZINC" run --interp tests/bench/render_suite > "$tmp/log" 2>&1 || { tail -10 "$tmp/log"; exit 1; }
python3 - "$tmp/report.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
assert r['schema'] == 'zbench-report/1' and r['done'] and len(r['sections']) == 7
for p in r['sections']:
    w = p['ui_work']
    assert w['oracle']['pass'], (p['section'], w['oracle'])
    assert [x['phase'] for x in w['phases']] == ['creation', 'settled', 'disposal']
    assert w['phases'][-1]['live_rows'] == 0
    assert all(x['memory']['rss_bytes'] is None for x in w['phases'])
noop = r['sections'][0]['ui_work']['phases'][1]
assert [noop[k] for k in ('binding_evaluations', 'component_constructions', 'layout_passes', 'measure_visits', 'paint_visits')] == [0]*5
sparse = r['sections'][1]['ui_work']['phases'][1]
assert sparse['binding_evaluations'] == 4 and sparse['component_constructions'] == 0
assert sparse['measure_visits'] > 4 and sparse['paint_visits'] > 4
assert r['sections'][2]['ui_work']['phases'][1]['layout_passes'] == 0
PY
