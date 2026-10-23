"""Failing release checks retain evidence without changing their exit status."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class Diagnostics(unittest.TestCase):
    def test_compat_preserves_startup_failure_and_success_summary(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            node = root / 'node'
            node.write_text('#!/bin/sh\nprintf "%s\\n" "$FIXTURE_OUTPUT"\nexit "$FIXTURE_STATUS"\n')
            node.chmod(0o755)
            for status, output in ((27, 'fatal: fixture source fetch failed'), (1, 'REGRESSION fixture'),
                                   (0, 'progress\ncompat check: 0 regression(s)')):
                env = dict(os.environ, PATH=tmp + ':' + os.environ['PATH'], FIXTURE_STATUS=str(status), FIXTURE_OUTPUT=output)
                result = subprocess.run(['sh', str(ROOT / 'tests/t2/compat.sh')], env=env, text=True, capture_output=True)
                self.assertEqual(result.returncode, status)
                if status:
                    self.assertIn(output, result.stdout)
                else:
                    self.assertIn('compat check:', result.stdout)
                    self.assertNotIn('progress', result.stdout)

    def test_relay_samples_only_its_valid_fixture_pids(self):
        source = (ROOT / 'tests/t1/notify_relay.sh').read_text()
        bad = 'bad() {' + source.split('bad() {', 1)[1].split('\ntrap ', 1)[0]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bin = root / 'bin'
            bin.mkdir()
            sample = bin / 'sample'
            sample.write_text('#!/bin/sh\necho "$1" >> "$FIXTURE_CALLS"\nwhile [ "$1" != -file ]; do shift; done\nshift\necho "fixture native stack" > "$1"\n')
            sample.chmod(0o755)
            calls = root / 'calls'
            env = dict(os.environ, PATH=str(bin) + ':' + os.environ['PATH'], FIXTURE_CALLS=str(calls))
            script = 'tmp=$1; app=$2; tpid=$3;\n' + bad + '\nbad fixture\n'
            result = subprocess.run(['sh', '-c', script, '_', tmp, '111111', '222222'], env=env, text=True, capture_output=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(calls.read_text().splitlines(), ['111111', '222222'])
            self.assertEqual(result.stdout.count('fixture native stack'), 2)
            calls.unlink()
            result = subprocess.run(['sh', '-c', script, '_', tmp, '0', 'invalid'], env=env, text=True, capture_output=True)
            self.assertEqual(result.returncode, 1)
            self.assertFalse(calls.exists())
            sample.write_text('#!/bin/sh\necho "fixture sampling denied" >&2\nexit 1\n')
            result = subprocess.run(['sh', '-c', script, '_', tmp, '111111', ''], env=env, text=True, capture_output=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn('cannot sample fixture process 111111:', result.stdout)
            self.assertIn('fixture sampling denied', result.stdout)


if __name__ == '__main__':
    unittest.main()
