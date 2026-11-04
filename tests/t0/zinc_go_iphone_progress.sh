#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
python3 - <<'PY'
import os
from pathlib import Path
import selectors
import subprocess
import tempfile
import time

root = Path.cwd()
with tempfile.TemporaryDirectory(prefix='zinc-go-progress-') as temp:
    work = Path(temp)
    mocks = work / 'bin'
    mocks.mkdir()
    def mock(name, body):
        path = mocks / name
        path.write_text('#!/bin/sh\nset -eu\n' + body + '\n')
        path.chmod(0o755)
        return str(path)
    zinc = mock('zinc', 'mkdir -p "$6"\necho "export ready"')
    mock('cmake', 'echo "configure output"\n[ "${FAIL_STAGE:-}" != cmake ] || exit 23')
    mock('sysctl', 'echo 2')
    mock('defaults', 'exit 1')
    mock('xcrun', '''case "$*" in
*"list devices"*)
  for last do :; done
  printf '%s' '{"result":{"devices":[{"identifier":"STALE","hardwareProperties":{"deviceType":"iPhone"},"connectionProperties":{"tunnelState":"unavailable"}},{"identifier":"CONNECTED","hardwareProperties":{"deviceType":"iPhone"},"connectionProperties":{"tunnelState":"connected"}}]}}' > "$last";;
*"info details"*) echo 'udid: TEST-UDID';;
*"install app"*) echo "$*" > "$TEST_TRACE.device"; echo install >> "$TEST_TRACE";;
*"process launch"*) echo launch >> "$TEST_TRACE";;
esac''')
    mock('xcodebuild', '''echo 'CompileC engine.cpp'
echo 'compiler warning sample' >&2
[ "${FAIL_STAGE:-}" != xcodebuild ] || exit 37
read -r release
echo 'BUILD SUCCEEDED' ''')
    env = dict(os.environ, PATH=str(mocks) + ':' + os.environ['PATH'],
               ZINC=zinc, ZINC_IOS_TEAM='TESTTEAM', ZINC_IOS_DEVICE='TESTDEVICE',
               ZINC_GO_OUT=str(work / 'out'), TEST_TRACE=str(work / 'trace'))
    command = [str(root / 'tools/zinc-go-iphone'), 'all']
    # The mock build waits for stdin: its compile line must appear before it finishes.
    process = subprocess.Popen(command, env=env, stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ)
    output = b''
    try:
        deadline = time.monotonic() + 10
        while b'CompileC engine.cpp' not in output and time.monotonic() < deadline:
            for key, _ in selector.select(0.1):
                data = os.read(key.fd, 8192)
                if not data:
                    raise AssertionError('script ended before streaming build output: ' + output.decode())
                output += data
        assert b'CompileC engine.cpp' in output, 'build output was not streamed'
        assert process.poll() is None, 'build was expected to still be running'
        rest, _ = process.communicate(input=b'continue\n', timeout=10)
        output += rest
        assert process.returncode == 0, output.decode()
    finally:
        selector.close()
        if process.poll() is None:
            process.kill()
            process.communicate()
    log = (work / 'out/build-device.log').read_text()
    for line in ['configure output', 'CompileC engine.cpp', 'compiler warning sample', 'BUILD SUCCEEDED']:
        assert line in log, line
        assert line.encode() in output, line
    assert (work / 'trace').read_text().splitlines() == ['install', 'launch']
    for stage in ['cmake', 'xcodebuild']:
        (work / 'trace').unlink(missing_ok=True)
        failed = subprocess.run(command, env=dict(env, FAIL_STAGE=stage), input=b'continue\n',
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=10)
        assert failed.returncode != 0, stage + ' failure was hidden by tee'
        assert not (work / 'trace').exists(), stage + ' failure installed or launched the app'
    automatic = dict(env)
    automatic.pop('ZINC_IOS_DEVICE')
    installed = subprocess.run([command[0], 'install'], env=automatic, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=10)
    assert installed.returncode == 0, installed.stdout.decode()
    assert '--device CONNECTED ' in Path(str(work / 'trace') + '.device').read_text()
    no_team = dict(env)
    no_team.pop('ZINC_IOS_TEAM')
    failed = subprocess.run(command, env=no_team, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=10)
    assert failed.returncode != 0 and b'no Apple team' in failed.stdout, failed.stdout.decode()
print('zinc_go_iphone_progress: live output, saved log and failure propagation pass')
PY
