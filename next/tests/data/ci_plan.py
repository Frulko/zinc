"""CI scope stays conservative without repeating the complete corpus per push."""
import json
from pathlib import Path
import runpy
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
plan = runpy.run_path(str(ROOT / "tools/ci-plan"))["plan"]


class Scope(unittest.TestCase):
    def test_docs_do_not_build(self):
        self.assertFalse(plan(["next/backlog/tasks/task.md", "docs/report.md", "tests/compat/results/next.json"])["test"])

    def test_fixture_keeps_macos_without_bench(self):
        result = plan(["next/tests/t1/macos_window.sh"])
        self.assertTrue(result["test"])
        self.assertFalse(result["full"])
        self.assertFalse(result["bench"])
        self.assertFalse(result["reproducible"])

    def test_core_keeps_performance_gate(self):
        for path in ("next/src/vm/vm.cpp", "runtime/gfx.cpp", "plugins/ui/native/main.cpp", "next/corpus/bench/fib.out"):
            self.assertTrue(plan([path])["bench"], path)

    def test_build_changes_keep_reproducibility(self):
        self.assertTrue(plan(["next/CMakeLists.txt"])["reproducible"])

    def test_full_runs_include_all_gates(self):
        self.assertTrue(all(plan([], full=True).values()))

    def test_workflow_checks_its_own_jobs(self):
        result = plan([".github/workflows/zinc-next.yml"])
        self.assertTrue(result["bench"] and result["reproducible"] and result["package"])

    def test_affected_selection_and_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            tests = Path(tmp)
            for tier, name in (("t0", "checker"), ("t1", "ui"), ("t2", "cross")):
                (tests / tier).mkdir()
                (tests / tier / f"{name}.sh").write_text("exit 0\n")
            cfg = tests / "affected.json"
            cfg.write_text(json.dumps({"map": [{"paths": ["lib/theme.ts"], "tests": ["ui"]}]}))

            def select(paths):
                return set(subprocess.check_output(
                    ["python3", str(ROOT / "tests/affected.py"), str(cfg)],
                    input="\n".join(paths), text=True).splitlines())

            self.assertEqual(select(["next/lib/theme.ts"]), {"ui"})
            self.assertEqual(select(["next/tests/t1/ui.sh"]), {"ui"})
            self.assertEqual(select(["next/tests/t2/cross.sh"]), {"cross"})
            self.assertEqual(select(["next/lib/theme.ts", "next/src/new_module.cpp"]), {"checker", "ui"})
            self.assertEqual(select(["next/src/vm/vm.cpp"]), {"checker", "ui"})
            self.assertEqual(select(["docs/report.md"]), set())
            self.assertEqual(select(["tests/compat/results/next.json"]), set())

    def test_runner_uses_committed_comparison(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            tests = repo / "next/tests"
            (tests / "t0").mkdir(parents=True)
            (tests / "t1").mkdir()
            for name in ("run", "affected.py"):
                (tests / name).write_bytes((ROOT / "tests" / name).read_bytes())
            (tests / "affected.json").write_text(json.dumps({"map": [{"paths": ["input.ts"], "tests": ["sample"]}]}))
            (tests / "t0/sample.sh").write_text("exit 0\n")
            (repo / "input.ts").write_text("before\n")

            def git(*args):
                return subprocess.check_output(["git", "-C", tmp, *args], stderr=subprocess.DEVNULL, text=True).strip()

            git("init")
            git("add", "next", "input.ts")
            commit = ("-c", "user.name=CI Test", "-c", "user.email=ci@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m")
            git(*commit, "initial")
            base = git("rev-parse", "HEAD")
            (repo / "input.ts").write_text("after\n")
            git("add", "input.ts")
            git(*commit, "change")
            import os
            env = dict(os.environ, ZINC_ZIG="unused-test-toolchain")
            result = subprocess.run(["sh", str(tests / "run"), "--changed-from", base],
                                    cwd=tmp, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("PASS sample", result.stdout)
            invalid = subprocess.run(["sh", str(tests / "run"), "--changed-from", "missing-ref"],
                                     cwd=tmp, env=env, capture_output=True, text=True)
            self.assertEqual(invalid.returncode, 2)


unittest.main()
