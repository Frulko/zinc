import contextlib
import io
import json
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
TOOL = runpy.run_path(str(ROOT / 'tools/cui-compare'))


class CompareHarness(unittest.TestCase):
    def test_unmeasured_values_and_artifact_integrity(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            artifact = out / 'app with spaces'
            artifact.write_bytes(b'actual artifact')
            record = {'cui_pin': TOOL['PIN'], 'build_wall_s': {'cui': 1, 'zinc': 2},
                      'artifacts': {name: {'path': str(artifact), 'sha256': TOOL['digest'](artifact), 'bytes': 15} for name in ['cui', 'zinc']}}
            (out / 'build.json').write_text(json.dumps(record))
            self.assertEqual(TOOL['verify'](out), record)
            with contextlib.redirect_stdout(io.StringIO()) as output:
                TOOL['show'](out)
            self.assertIn('unavailable', output.getvalue())
            self.assertIn('no speed ratio', output.getvalue())
            artifact.write_bytes(b'changed')
            with self.assertRaisesRegex(RuntimeError, 'artifact changed'):
                TOOL['verify'](out)

    def test_timeout_reaps_child(self):
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / 'process.log'
            with self.assertRaises(subprocess.TimeoutExpired):
                TOOL['command']([sys.executable, '-c', 'import time; print("started", flush=True); time.sleep(20)'], log, seconds=0.5)
            self.assertIn('started', log.read_text())

    def test_generated_build_reports_do_not_change_source_fingerprint(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'examples/ui/tracker/build').mkdir(parents=True)
            (root / 'lib').mkdir()
            (root / 'plugins').mkdir()
            (root / 'lib/source.ts').write_text('const value = 1;')
            with patch.dict(TOOL['inputs'].__globals__, ROOT=root):
                before = TOOL['inputs']()
                (root / 'examples/ui/tracker/build/report.json').write_text('{}')
                self.assertEqual(TOOL['inputs'](), before)
                (root / 'lib/source.ts').write_text('const value = 2;')
                self.assertNotEqual(TOOL['inputs'](), before)

    def test_run_rejects_incomplete_profile_and_never_fills_window_metrics(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            record = {'cui_pin': TOOL['PIN'], 'build_wall_s': {'cui': 1, 'zinc': 2},
                      'artifacts': {name: {'path': '/unused', 'bytes': 15} for name in ['cui', 'cui_frame_driver', 'zinc']}}
            (out / 'build.json').write_text(json.dumps(record))
            profile = {'frames': 4, 'window': [1440, 900], 'phases': {name: {'p50': 2} for name in ['app', 'layout', 'paint', 'raster']}}

            def fake_command(command, log, **kwargs):
                if log.name == 'frame-cui.log':
                    log.write_text('cui compare json: ' + json.dumps({'frames': [[10, 20]] * 4}))
                else:
                    log.write_text('zinc profile json: ' + json.dumps(profile))

            args = SimpleNamespace(out=out, frames=5, skip=1, window_idle=False)
            with patch.dict(TOOL['run'].__globals__, verify=lambda out: record, command=fake_command):
                with contextlib.redirect_stdout(io.StringIO()):
                    TOOL['run'](args)
                result = json.loads((out / 'run.json').read_text())
                self.assertFalse(result['comparable'])
                self.assertIsNone(result['window_idle'])
                self.assertEqual(result['frame']['cui']['build_layout_paint_p50_us'], 10)
                profile['frames'] = 0
                with self.assertRaisesRegex(RuntimeError, 'incomplete'):
                    TOOL['run'](args)

    def test_zbench_parser_keeps_actual_phase_names(self):
        raw = {'schema': 1, 'frames': 2, 'window': [1440, 900], 'phases': {'layout': {'p50': 3}, 'paint': {'p50': 5}}}
        self.assertEqual(TOOL['parse_zinc_run']('zinc profile json: ' + json.dumps(raw))['profile'], raw)
        self.assertNotIn('profile', TOOL['parse_zinc_run']('missing report'))


if __name__ == '__main__':
    unittest.main()
