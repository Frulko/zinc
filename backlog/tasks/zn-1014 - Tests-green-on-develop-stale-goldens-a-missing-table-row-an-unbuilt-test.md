---
id: ZN-1014
title: 'Tests green on develop: stale goldens, a missing table row, an unbuilt test'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:35'
updated_date: '2026-11-08 19:34'
labels:
  - tests
  - hardening
  - size-M
milestone: m-12
dependencies: []
ordinal: 2900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A list of tests that fail or pass vacuously on develop for known, mechanical reasons: plugin_manifest (zinc:carplay missing from plugins-added-table), i18n_test not built plus German Z5012/Z5013 missing, zbc_test not built, ir/zbc golden `exceptions` helper numbering, modules.sh position 1:1 vs 1:19, nuxt_ui/rn_showcase/platform_look hashes, ui_class_parser, promise_statics Z0103, `fuzz_regress.sh` checking only the exit code, webrtc_call.sh relative ZINC, webrtc_chat stack overflow, diff-matrix `conf:async errors modules...` interp DIFF, the webcam_demo golden refreshed without a cause, plugins-table lists. Fix each at its cause (not by re-recording blindly).

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-851: plugin_manifest fails since 3d3b59dc: zinc:carplay is not in tests/data/plugins-added-table.txt.
- tools/diff-matrix: on `conf:async errors modules features generic_static` gives interp=DIFF (aot ok) on main, seen by ZN-742.01.
- The ir and zbc goldens of `exceptions` (__log47 vs __log48) and lint's rules.expect (ProgressRing's svg import) are stale on develop.
- `zbc_test` is not built by `tools/build zinc`.
- i18n: the German Z5012 and Z5013 entries are missing from i18n/de/diag.json.
- i18n: `i18n/de/diag.json` lacks Z5012 and Z5013, and `i18n_test` is not built: `tests/run --only i18n` fails on develop.
- `nuxt_ui` (3 frame hashes) fails on develop with and without the min-w-0 change; bisect on a quiet machine.
- ZN-867: `ui_class_parser` fails on develop ("style-only Solid program: 1 @applyToken function(s) in the ZBC, expected 0"), not from the Discord work; check the recent `lib/std/ui.ts` changes.
- ZN-880: the ir/zbc golden "exceptions" differs in helper numbering (__log47 against __log50) on develop's binary; re-record or find what moved.
- ZN-882: re-record the nuxt_ui, rn_showcase and platform_look hashes once their failure on develop is fixed; the new ones include the border inset.
- ZN-883: tests/t0/modules.sh expects Z0119 at package.ts:1:1 but gets 1:19 on develop: fix the test or the diagnostic's position.
- ZN-874: bring tests/data/plugins-table.txt and plugins-added-table.txt up to date (discord-voice, display shell and sidecar, imageio, secure-store, shell, trieur); plugin_manifest fails on develop.
- ZN-890: promise_statics.ts of the run test fails with Z0103 on develop.
- ZN-891: tests/t1/webrtc_call.sh should make ZINC absolute, as discord_voice.sh does; tests/run keeps only the last --only when given several.
- webrtc_chat dies with "stack overflow (in @hostNode)" on develop.
- zinc-dev: `tests/t1/dev_mode.sh` waits 2 s for the reload and fails when the load average is above the core count (seen at 14); it passes on a quiet machine.
- webcam_demo: the golden hash was refreshed for 1 and 58 pixels of at most 1 level with no commit of its own naming the cause; find which change moved them.
- macos_window failed once (fullscreen close check "close 20,22 | fullscreen 1") and passed on the rerun right after, 2026-11-06; watch for a flake.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each named test passes on develop with `tests/run --only <name>` (or is moved to tests/ci/off.txt with a reason when it is machine-bound)
- [x] #2 `tools/build zinc` builds `zbc_test` and `i18n_test`
- [x] #3 `i18n/de/diag.json` has Z5012 and Z5013
- [ ] #4 a short note lists which goldens were re-recorded and what moved
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-08 worker: against main's binary (ZINC=<main>/build/zinc) these PASS on develop already: plugin_manifest, i18n, zbc, ir, run (promise_statics), modules, nuxt_ui, rn_showcase, platform_look, ui_class_parser, fuzz_regress, promise_all_mixed, webrtc_call, webcam_demo. i18n/de/diag.json has Z5012/Z5013. Fixed: tools/diff-matrix captured the step lines of 'zinc run' on stderr (interp=DIFF on every conf program; ZINC_STEPS=0 now); webrtc_chat scripted session quit before the channels' close events (setTimeout 0 after pc.close), so 'chat closed' lines vanished: the script waits 300 ms like roomScript (the stack overflow no longer occurs); zbc_test and i18n_test are now dependencies of zinc (tools/build zinc builds them). No golden re-recorded. Open: lint (rules.expect passes from the main tree but fails in a nested worktree: relative path depth ../../../../ and plugin-targets findings differ; hero.matrix and esp32-app.matrix differ in the main tree too: svg/audio/device plugin-targets lines and (+N) counts, needs a build of develop to tell stale golden from regression), dev_mode (load-bound), macos_window (flake), AC1 for lint, AC4 note above.
<!-- SECTION:NOTES:END -->
