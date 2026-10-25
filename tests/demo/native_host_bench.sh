#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
[ "$(uname)" = Darwin ] || exit 77
swift='examples/swift-observatory/build/Native Observatory.app/Contents/MacOS/Observatory'
rally='examples/zinc-libgodot/build/rally'
[ -x "$swift" ] && [ -x "$rally" ] || { echo 'Build both native hosts first'; exit 77; }
# Lifecycle assertions only: values measured during this smoke are not performance results.
ZINC_BACKGROUND=1 python3 - "$swift" "$rally" <<'PY'
import json, os, subprocess, sys
hosts = [(sys.argv[1:2], 'swift-observatory', ['tick_us', 'copy_us']),
         ([sys.argv[2], os.path.join(os.path.dirname(sys.argv[2]), 'libgodot.dylib')], 'zinc-libgodot', ['godot_iteration_us', 'zinc_tick_present_us'])]
for command, host, fields in hosts:
    for arguments in [['--bench-frames', '0'], ['--bench-frames', 'bad'], ['--bench-workload', 'bad']]:
        result = subprocess.run(command + arguments, capture_output=True, text=True, timeout=10)
        assert result.returncode == 2, (host, arguments, result.stderr)
    for workload in ['idle', 'active']:
        result = subprocess.run(command + ['--bench-frames', '31', '--bench-workload', workload], capture_output=True, text=True, timeout=30)
        assert result.returncode == 0, (host, result.stderr)
        lines = result.stdout.splitlines()
        assert lines.count('workflow ready') == 1, (host, lines)
        records = [json.loads(line.removeprefix('workflow bench json: ')) for line in lines if line.startswith('workflow bench json: ')]
        assert len(records) == 1, host
        record = records[0]
        assert (record['schema'], record['host'], record['workload']) == (1, host, workload), record
        assert (record['warmup_frames'], record['total_frames'], record['sample_count']) == (30, 31, 1), record
        assert record['first_ready_us'] > 0, record
        for field in ['interval_us', *fields]:
            assert len(record[field]) == 1 and record[field][0] >= 0, (host, field)
print('PASS native_host_bench: argument rejection, native readiness, warmup exclusion, idle/active, clean exit')
PY
