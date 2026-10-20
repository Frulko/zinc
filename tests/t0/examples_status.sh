#!/bin/sh
# Headless example milestones use the camera fixture instead of attached USB hardware.
cd "$(dirname "$0")/../.." || exit 2
python3 - <<'PY'
import os, runpy, subprocess
from unittest.mock import patch

tool = runpy.run_path('tools/examples-status')
with patch.dict(os.environ, ZINC_FAKE_CAMERA='0'), patch('subprocess.run') as run:
    run.return_value = subprocess.CompletedProcess([], 0, '', '')
    assert tool['run_one']('zinc', 'camera/cli/src/main.ts', 3, 40)[1] == 'OK'
    env = run.call_args.kwargs['env']
    assert env['ZINC_FAKE_CAMERA'] == env['ZINC_HEADLESS'] == env['ZINC_DETERMINISTIC'] == '1'
    run.return_value = subprocess.CompletedProcess([], 101, '', 'panic: camera fixture failed')
    assert tool['run_one']('zinc', 'camera/cli/src/main.ts', 3, 40)[1] == 'RUNTIME'
print('examples-status: camera fixture and runtime failures verified')
PY
