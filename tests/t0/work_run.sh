#!/bin/sh
# Two linked trees must share the queue; a failed or timed-out command releases it.
cd "$(dirname "$0")/../.." || exit 2
python3 -I - "$PWD/tools/work-run" <<'PY'
from pathlib import Path
import subprocess
import sys
import tempfile
import time

runner = sys.argv[1]
with tempfile.TemporaryDirectory() as tmp:
    base = Path(tmp)
    repo, other = base / 'repo', base / 'other'
    repo.mkdir()
    def git(*args):
        subprocess.run(['git', *args], cwd=repo, check=True, capture_output=True)
    git('init', '-q')
    git('-c', 'user.name=Test', '-c', 'user.email=test@invalid', 'commit', '-qm', 'test: create fixture', '--allow-empty')
    git('worktree', 'add', '-q', '-b', 'other', str(other))
    value, started = base / 'value', base / 'started'
    value.write_text('0')
    code = 'from pathlib import Path; import sys,time; p=Path(sys.argv[1]); n=int(p.read_text()); Path(sys.argv[2]).touch(); time.sleep(.25); p.write_text(str(n+1))'
    args = [runner, '3', sys.executable, '-c', code, str(value), str(started)]
    first = subprocess.Popen(args, cwd=repo)
    deadline = time.monotonic() + 4
    while not started.exists() and time.monotonic() < deadline:
        time.sleep(.005)
    assert started.exists(), 'first command did not start'
    second = subprocess.Popen(args, cwd=other)
    assert first.wait(5) == second.wait(5) == 0
    assert value.read_text() == '2', 'linked worktrees ran concurrently'
    def run(seconds, code):
        return subprocess.run([runner, seconds, sys.executable, '-c', code], cwd=other, capture_output=True, timeout=5).returncode
    assert run('1', 'raise SystemExit(7)') == 7
    assert run('.05', 'import time; time.sleep(10)') == 124
    assert run('1', 'pass') == 0, 'lock survived command exit'
    for invalid in ['0', '-1', 'nan', 'inf']:
        assert run(invalid, 'pass') != 0
print('work_run: linked trees, exit, timeout and validation pass')
PY
