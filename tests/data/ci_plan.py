"""CI scope stays conservative without repeating the complete corpus per push."""
import json
from pathlib import Path
import runpy
import subprocess
import tempfile
import unittest
import os
import textwrap

ROOT = Path(__file__).resolve().parents[2]
plan = runpy.run_path(str(ROOT / "tools/ci-plan"))["plan"]


class Scope(unittest.TestCase):
    def test_docs_do_not_build(self):
        self.assertFalse(plan(["backlog/tasks/task.md", "docs/report.md", "tests/compat/results/next.json"])["test"])

    def test_fixture_keeps_macos_without_bench(self):
        result = plan(["tests/t1/macos_window.sh"])
        self.assertTrue(result["test"])
        self.assertFalse(result["full"])
        self.assertFalse(result["bench"])
        self.assertFalse(result["reproducible"])

    def test_core_keeps_performance_gate(self):
        for path in ("src/vm/vm.cpp", "runtime/gfx.cpp", "plugins/ui/native/main.cpp", "corpus/bench/fib.out"):
            self.assertTrue(plan([path])["bench"], path)

    def test_build_changes_keep_reproducibility(self):
        self.assertTrue(plan(["CMakeLists.txt"])["reproducible"])

    def test_full_runs_include_all_gates(self):
        self.assertTrue(all(plan([], full=True).values()))

    def test_quick_checks_skip_expensive_jobs_but_never_weaken_full(self):
        paths = ['src/vm/vm.cpp', '.github/workflows/zinc-next.yml', 'tools/package']
        self.assertEqual(plan(paths, quick=True), {
            'test': True, 'full': False, 'bench': False, 'reproducible': False, 'package': False})
        self.assertTrue(all(plan(paths, full=True, quick=True).values()))

    def test_workflow_checks_its_own_jobs(self):
        result = plan([".github/workflows/zinc-next.yml"])
        self.assertTrue(result["bench"] and result["reproducible"] and result["package"])

    def test_manual_scope_requires_a_base_and_tags_always_keep_full_checks(self):
        source = (ROOT / '.github/workflows/zinc-next.yml').read_text()
        script = textwrap.dedent(source.split('        run: |\n', 1)[1].split('\n  build:', 1)[0])
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / 'tools').mkdir()
            (repo / 'tools/ci-plan').write_bytes((ROOT / 'tools/ci-plan').read_bytes())

            def git(*args):
                return subprocess.check_output(['git', '-C', tmp, *args], stderr=subprocess.DEVNULL, text=True).strip()

            git('init')
            git('add', 'tools')
            git('-c', 'user.name=test', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '-m', 'base')
            base = git('rev-parse', 'HEAD')
            (repo / 'source.cpp').write_text('change')
            git('add', 'source.cpp')
            git('-c', 'user.name=test', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '-m', 'change')
            for mode, ref, compare, full, status in (
                    ('changed', 'refs/heads/develop', base, False, 0),
                    ('changed', 'refs/heads/develop', '', None, 1),
                    ('changed', 'refs/heads/develop', 'missing', None, 1),
                    ('full', 'refs/heads/develop', '', True, 0),
                    ('changed', 'refs/tags/v1.0.0', '', True, 0)):
                output = repo / 'output'
                output.write_text('')
                env = dict(os.environ, EVENT='workflow_dispatch', MODE=mode, BASE_REF=compare,
                           BEFORE=base, PR_BASE='', DEFAULT_BRANCH='main', GITHUB_REF=ref,
                           RUNNER_TEMP=tmp, GITHUB_OUTPUT=str(output))
                result = subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', script], cwd=tmp,
                                        env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, status, result.stderr)
                if status == 0:
                    values = dict(line.split('=', 1) for line in output.read_text().splitlines())
                    self.assertEqual(values['full'], str(full).lower())
                    for key in ('package', 'bench', 'reproducible'):
                        self.assertEqual(values[key], str(full).lower())

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
            self.assertEqual(select(["tests/t1/ui.sh"]), {"ui"})
            self.assertEqual(select(["tests/t2/cross.sh"]), {"cross"})
            self.assertEqual(select(["next/lib/theme.ts", "src/new_module.cpp"]), {"checker", "ui"})
            self.assertEqual(select(["src/vm/vm.cpp"]), {"checker", "ui"})
            self.assertEqual(select(["docs/report.md"]), set())
            self.assertEqual(select(["tests/compat/results/next.json"]), set())

    def test_runner_uses_committed_comparison(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            tests = repo / "tests"
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
            git("add", "tests", "input.ts")
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
