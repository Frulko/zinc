"""Failing release checks retain evidence without changing their exit status."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import runpy
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


class Diagnostics(unittest.TestCase):
    def test_preflight_builds_then_checks_and_preserves_failures(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'tools').mkdir()
            (root / 'tests').mkdir()
            (root / 'tools/preflight').write_bytes((ROOT / 'tools/preflight').read_bytes())
            for name in ('tools/build', 'tests/run'):
                script = root / name
                script.write_text('#!/bin/sh\necho "' + name + ' $*" >> "$CALLS"\nexit "${' + ('BUILD_STATUS' if name == 'tools/build' else 'TEST_STATUS') + ':-0}"\n')
                script.chmod(0o755)
            calls = root / 'calls'
            build = ('tools/build zinc assets_test board_test codec_test gl_caps_test gltf_check '
                     'i18n_test ir_test layout_test layout_yoga_test napi_test native_test ops_test '
                     'platform_test qr_test scenario_test segment_test sim_test yoga_test zbc_test zpk_test')
            for args, status, expected in (([], {}, [build, 'tests/run --tier t0 --fail-fast']),
                                           (['v1.0.0'], {}, [build, 'tests/run --changed-from v1.0.0 --fail-fast']),
                                           ([], {'BUILD_STATUS': '17'}, [build]),
                                           ([], {'TEST_STATUS': '19'}, [build, 'tests/run --tier t0 --fail-fast'])):
                calls.unlink(missing_ok=True)
                result = subprocess.run(['sh', str(root / 'tools/preflight'), *args],
                                        env=dict(os.environ, CALLS=str(calls), **status), capture_output=True)
                self.assertEqual(result.returncode, int(next(iter(status.values()), 0)))
                self.assertEqual(calls.read_text().splitlines(), expected)

    def test_runner_stops_at_first_failure_across_tiers(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'tests/t0').mkdir(parents=True)
            (root / 'tests/t1').mkdir()
            (root / 'tests/run').write_bytes((ROOT / 'tests/run').read_bytes())
            (root / 'tests/t0/a.sh').write_text('echo deliberate failure\nexit 1\n')
            (root / 'tests/t0/b.sh').write_text('exit 0\n')
            (root / 'tests/t1/c.sh').write_text('exit 0\n')
            for args, later in (([], True), (['--fail-fast'], False)):
                result = subprocess.run(['sh', str(root / 'tests/run'), '--tier', 't1', *args],
                                        env=dict(os.environ, ZINC_ZIG='fixture'), capture_output=True, text=True)
                self.assertEqual(result.returncode, 1)
                self.assertIn('FAIL a', result.stdout)
                self.assertEqual('PASS b' in result.stdout, later)
                self.assertEqual('PASS c' in result.stdout, later)
                self.assertIn('deliberate failure', result.stdout)

    def test_windows_archives_include_plugin_import_library(self):
        package = runpy.run_path(str(ROOT / 'tools/package'))
        fn = package['package_windows']
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            build = root / 'build'
            build.mkdir()
            for name in ('zinc.exe', 'libzinc.dll.a', 'host.dll', 'zinc-atelier.exe'):
                (build / name).write_text(name)
            with patch.dict(fn.__globals__, VERSION='1.0.0', payload=lambda p: None,
                            prebuild_plugins=lambda *a: {}):
                archives, _ = fn(str(build), str(root / 'out'))
            import zipfile
            self.assertEqual(len(archives), 2)
            for _, archive in archives:
                with zipfile.ZipFile(archive) as z:
                    self.assertTrue(any(n.endswith('/bin/libzinc.dll.a') for n in z.namelist()))
                    self.assertTrue(any(n.endswith('/bin/zinc.exe') for n in z.namelist()))

    def test_relay_is_explicitly_skipped_in_ci(self):
        env = dict(os.environ, ZINC_CI='1', ZINC='/nonexistent/fixture-zinc')
        result = subprocess.run(['sh', str(ROOT / 'tests/t1/notify_relay.sh')], env=env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 77)
        self.assertIn('disabled in CI by owner', result.stdout)
        self.assertIn('intermittent stall remains unresolved', result.stdout)

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
