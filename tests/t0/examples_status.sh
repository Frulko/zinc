#!/bin/sh
# Headless example milestones use the camera fixture instead of attached USB hardware.
cd "$(dirname "$0")/../.." || exit 2
python3 - <<'PY'
import os, runpy, subprocess, tempfile
from pathlib import Path
from unittest.mock import patch

tool = runpy.run_path('tools/examples-status')
with patch.dict(os.environ, ZINC_FAKE_CAMERA='0'), patch('subprocess.run') as run:
    run.return_value = subprocess.CompletedProcess([], 0, '', '')
    assert tool['run_one']('zinc', 'camera/cli/src/main.ts', 3, 40)[1] == 'OK'
    env = run.call_args.kwargs['env']
    assert env['ZINC_FAKE_CAMERA'] == env['ZINC_HEADLESS'] == env['ZINC_DETERMINISTIC'] == '1'
    assert tool['run_one']('zinc', 'fatty/src/main.ts', 3, 40)[1] == 'OK'
    assert run.call_args.args[0] == ['zinc', 'run', os.path.join(tool['EXAMPLES'], 'fatty')]
    tool['run_one']('zinc', 'js-three/main.js', 3, 40)
    assert run.call_args.args[0] == ['zinc', 'run', os.path.join(tool['EXAMPLES'], 'js-three')]
    tool['run_one']('zinc', 'fatty/src/Gobelins.ts', 3, 40)
    assert run.call_args.args[0][2] == os.path.join(tool['EXAMPLES'], 'fatty/src/Gobelins.ts')
    run.return_value = subprocess.CompletedProcess([], 101, '', 'panic: camera fixture failed')
    assert tool['run_one']('zinc', 'camera/cli/src/main.ts', 3, 40)[1] == 'RUNTIME'
    with tempfile.TemporaryDirectory() as tmp, patch.dict(tool['run_one'].__globals__, EXAMPLES=tmp):
        project = Path(tmp) / 'broken'
        project.mkdir()
        (project / 'zinc.json').write_text('{broken')
        (project / 'main.ts').write_text('')
        run.return_value = subprocess.CompletedProcess([], 1, '', 'error Z0001: invalid project')
        assert tool['run_one']('zinc', 'broken/main.ts', 3, 40)[1] == 'COMPILE'
        assert run.call_args.args[0][2] == str(project / 'main.ts')
print('examples-status: camera fixture and runtime failures verified')
PY
