import contextlib
import io
import itertools
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import zn_resmon


class BenchmarkHarness(unittest.TestCase):
    def measure(self, extra=(), bad_sample=None, bad_status=139, bad_reference=False,
                resource_exit=0, check=True, baseline_time=0.01, trace=None):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "result.json"
            baseline = Path(temp) / "baseline.json"
            baseline.write_text(json.dumps({"results": {"fib": {
                e: {"median_s": baseline_time, "peak_rss_mb": 1} for e in ("interp", "aot", "quickjs")
            }}}))
            argv = [str(ROOT / "tools/bench-m4"), "--kernels", "fib", "--runs", "3",
                    "--no-startup", "--md", "none", "--out", str(output)]
            if check: argv.append("--check-regressions")
            argv += list(extra) if extra else ["--baseline-zinc", "/reference/build/zinc"]
            argv = [str(baseline) if a == "BASELINE" else a for a in argv]
            calls = 0

            def process(cmd, **kwargs):
                nonlocal calls
                if "--baseline-zinc" in argv:
                    self.assertFalse(cmd.startswith(("node ", "qjs ")), "reference gate needs no external oracle")
                if trace is not None and " run " in cmd:
                    trace.append("reference" if "reference" in cmd else "candidate")
                stdout, stderr, status = "2178309\n", "", 0
                if " run " in cmd and "reference" not in cmd:
                    calls += 1
                    if calls == bad_sample:
                        stdout, stderr, status = "wrong\n", "runtime failure", bad_status
                if bad_reference and "reference" in cmd and " run " in cmd:
                    stdout, stderr, status = "", "broken reference", 1
                return subprocess.CompletedProcess(cmd, status, stdout, stderr)

            clock = (i / 100 for i in itertools.count())
            cwd = os.getcwd()
            log, err = io.StringIO(), io.StringIO()
            try:
                with patch.object(sys, "argv", argv), patch.dict(os.environ, {}, clear=False), \
                     patch("subprocess.run", side_effect=process), \
                     patch("platform.platform", return_value="test-runner"), \
                     patch("platform.processor", return_value="test-cpu"), \
                     patch("time.perf_counter", side_effect=lambda: next(clock)), \
                     patch("tempfile.mkdtemp", return_value=temp), \
                     patch.object(zn_resmon, "measure", return_value={
                         "exit": resource_exit, "user_s": 0.01, "sys_s": 0, "peak_rss_mb": 1}), \
                     contextlib.redirect_stdout(log), contextlib.redirect_stderr(err):
                    with self.assertRaises(SystemExit) as exit:
                        runpy.run_path(str(ROOT / "tools/bench-m4"))
            finally:
                os.chdir(cwd)
            return exit.exception.code, json.loads(output.read_text()) if output.exists() else None, err.getvalue()

    def test_same_runner_reference_passes_without_native_binary(self):
        rc, doc, _ = self.measure()
        self.assertEqual(rc, 0)
        self.assertIn("fib", doc["reference_results"])
        self.assertIsNone(doc["results"]["fib"]["quickjs"])
        self.assertIsNone(doc["results"]["fib"]["native"])
        self.assertEqual(doc["failures"], [])

    def test_twenty_percent_slowdown_fails_at_fifteen_percent(self):
        rc, doc, _ = self.measure(("--baseline-zinc", "/reference/build/zinc", "--inject-slowdown", "1.2"))
        self.assertEqual(rc, 3)
        self.assertEqual(len(doc["regressions"]), 2)

    def test_both_warmups_precede_alternating_paired_samples(self):
        trace = []
        self.measure(trace=trace)
        self.assertEqual(trace, ["candidate", "reference", "candidate", "reference",
                                 "reference", "candidate", "candidate", "reference"])

    def test_bad_timed_sample_is_not_recorded_as_fast(self):
        rc, doc, _ = self.measure(bad_sample=2)
        self.assertEqual(rc, 1)
        self.assertIsNone(doc["results"]["fib"]["interp"])
        self.assertTrue(any("runtime failure" in f and "139" in f for f in doc["failures"]))

    def test_bad_reference_is_not_skipped(self):
        rc, doc, _ = self.measure(bad_reference=True)
        self.assertEqual(rc, 1)
        self.assertTrue(any("reference interp" in f for f in doc["failures"]))

    def test_successful_timed_sample_with_wrong_output_fails(self):
        rc, _, _ = self.measure(bad_sample=2, bad_status=0)
        self.assertEqual(rc, 1)

    def test_failed_resource_sample_is_not_accepted(self):
        rc, doc, _ = self.measure(resource_exit=139)
        self.assertEqual(rc, 1)
        self.assertTrue(any("resource sample exited 139" in f for f in doc["failures"]))

    def test_missing_requested_baseline_fails(self):
        rc, _, err = self.measure(("--baseline", "/nonexistent/zinc-benchmark.json"))
        self.assertEqual(rc, 2)
        self.assertIn("Cannot read benchmark baseline", err)

    def test_historic_baseline_still_compares(self):
        rc, _, _ = self.measure(("--baseline", "BASELINE"))
        self.assertEqual(rc, 0)

    def test_invalid_baseline_timing_cannot_bypass_gate(self):
        rc, doc, _ = self.measure(("--baseline", "BASELINE"), baseline_time=float("nan"))
        self.assertEqual(rc, 1)
        self.assertTrue(any("invalid" in f for f in doc["failures"]))

    def test_unknown_kernel_cannot_bypass_gate(self):
        rc, _, _ = self.measure(("--kernels", "misspelled"))
        self.assertEqual(rc, 2)

    def test_reports_keep_m4_target_verdicts(self):
        rc, doc, _ = self.measure(check=False)
        self.assertEqual(rc, 1)
        self.assertTrue(any(not v["pass"] for v in doc["thresholds"]))


unittest.main()
