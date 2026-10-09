"""Host-only lifecycle checks: all system commands and device paths are replaced with temporary fakes."""
import os
from pathlib import Path
import subprocess
import tempfile

source = Path(__file__).resolve().parents[2] / 'examples/remarkable/quill-test/launch.sh'
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    state = root / 'state'
    state.mkdir()
    wake = root / 'power'
    wake.mkdir()
    for name in ['wake_lock', 'wake_unlock']:
        (wake / name).touch()
    lock = root / 'lock'
    script = source.read_text().replace('/run/zinc-quill-test', str(state)).replace('/tmp/epframebuffer.lock', str(lock)).replace('/sys/power', str(wake))
    script = script.replace('/lib/ld-linux-aarch64.so.1', str(root / 'loader'))
    (root / 'launch.sh').write_text(script)

    def fake(name, body):
        p = root / name
        p.write_text('#!/bin/sh\nset -eu\n' + body + '\n')
        p.chmod(0o755)

    fake('systemctl', '''echo "$*" >> "$TEST_ROOT/calls"
case "$1" in
is-active) test -f "$TEST_ROOT/active";;
stop) test "${FAIL_STOP:-0}" = 0 || exit 1; rm -f "$TEST_ROOT/active";;
start) touch "$TEST_ROOT/active";;
*) exit 2;;
esac''')
    fake('pgrep', 'test -f "$TEST_ROOT/active"')
    fake('scribble', 'echo ink >> "$TEST_ROOT/calls"; exit "${APP_EXIT:-0}"')
    fake('sha256sum', 'test "${BAD_HASH:-0}" = 0')
    fake('loader', 'exit 0')
    fake('systemd-run', 'printf "%s\\n" "$@" > "$TEST_ROOT/unit-args"')
    env = dict(os.environ, PATH=f'{root}:/usr/bin:/bin', TEST_ROOT=str(root), INVOCATION_ID='test')

    def run(mode, ok=True, **extra):
        result = subprocess.run(['sh', str(root / 'launch.sh'), mode], env=env | extra, capture_output=True, text=True)
        assert (result.returncode == 0) == ok, (mode, result.stderr)

    def reset():
        for p in state.iterdir():
            p.unlink()
        lock.unlink(missing_ok=True)
        (root / 'calls').write_text('')
        (root / 'active').touch()

    reset()
    run('launch')
    args = (root / 'unit-args').read_text()
    assert '--property=RuntimeMaxSec=180' in args and 'ExecStopPost=' in args
    assert '--property=KillMode=control-group' in args and '--collect' in args
    run('launch', ok=False, BAD_HASH='1')
    assert 'stop' not in (root / 'calls').read_text()
    run('session', ok=False, INVOCATION_ID='')
    assert 'stop' not in (root / 'calls').read_text()
    for exit_code in ['0', '139']:
        reset()
        run('session', ok=exit_code == '0', APP_EXIT=exit_code)
        assert (state / 'restore').exists() and not (root / 'active').exists()
        run('restore')  # Models systemd's independent ExecStopPost after normal/crash exit.
        assert (root / 'active').exists() and not list(state.iterdir())
        assert (wake / 'wake_unlock').read_text().strip() == 'zinc-quill-test'
    reset()
    run('session', ok=False, FAIL_STOP='1')
    assert 'ink' not in (root / 'calls').read_text()
    run('restore')
    reset()
    lock.write_text(f'{os.getpid()}\nxochitl\n')
    run('session', ok=False)
    assert lock.exists() and 'ink' not in (root / 'calls').read_text()
    run('restore', ok=False)  # Preserve a live owner's lock, even during recovery.
    assert lock.exists()
    reset()
    # Obtain a real terminated PID rather than assuming an arbitrary PID is unused.
    child = subprocess.Popen(['true'])
    child.wait()
    lock.write_text(f'{child.pid}\nquill\n')
    run('session')
    assert not lock.exists()
    run('restore')
print('Quill launcher: supervision arguments, compatibility refusal, exit/crash cleanup, stop failure and locks passed')
