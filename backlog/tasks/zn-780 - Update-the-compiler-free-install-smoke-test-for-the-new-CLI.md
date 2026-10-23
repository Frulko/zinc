---
id: ZN-780
title: Update the compiler-free install smoke test for the new CLI
status: Done
assignee: []
created_date: '2026-10-23 10:47'
updated_date: '2026-10-23 10:53'
labels:
  - tooling
  - ci
  - size-S
dependencies: []
ordinal: 516460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner reported package-macos-arm64 failure in run 39939275942, job 120368231565. The installation smoke test still compares zinc new output to the pre-onboarding one-line text. Check actual successful project creation and keep diagnostics deterministic in the clean environment.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The installed zinc new command must succeed and create the game project files without requiring the old success text.
- [x] #2 The compiler-free installation regression passes on a locally built native package; diagnostics use English consistently.
- [x] #3 Record the CI evidence and local result, then commit the focused fix without pushing or publishing.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CI evidence: https://github.com/Frulko/zinc/actions/runs/39939275942/job/120368231565 (package-macos-arm64), Package succeeded; install_nocompiler failed only with zinc new game fails from the install. Its exact expected one-line success message predates the onboarding CLI. The test now requires exit success plus non-empty zinc.json and src/main.ts, then retains every existing run/reload/plugins/Atelier/compiler-shim check; failures print captured output. clean() and the direct dev environment pin ZINC_LANG=en after env -i. Initial local run revealed the existing binary was stale (unknown esp32.iram); tools/build zinc updated it, without source changes. Repackaged the current native binary with python3 tools/package --build build --out /tmp/zinc-ci-install.ICztah/current; CLI 34.0 MB and app 35.2 MB, both within budgets. ZINC_DIST=/tmp/zinc-ci-install.ICztah/current tests/run --only install_nocompiler: PASS (1 passed, 0 failed). Shell syntax and diff check pass. Existing Native::iram initialiser warning recorded in backlog/later.md. Test-only change: no user changelog line. No cross builds, full suite, pushes, reruns or publications. Owner next: git push && gh workflow run zinc-next --ref develop; rerunning the old run would keep its old SHA.
<!-- SECTION:NOTES:END -->
