# Resume — 2026-11-09

## Active coordination

- Continue zn-coordinate until the main repository `.paused` exists or nothing can start. Never ask the owner a question. One coordinator: this root session; state log is [COORDINATOR.md](docs/reports/backlog-review-2026-11-07/COORDINATOR.md).
- Three workers: sole core, owner gallery proof, Feedback. Every command runs in its own worktree; source and ownership below. They use zn-start, no suites, no push.
- This session closed13 tasks: ZN-1078.03/.04/.05/.08/.10 and ZN-1079/1080/1081/1082/1083/1084/1085/1086. Full integration history and older unresolved handovers/tests remain in [the archived resume](docs/reports/session-handover-2026-11-09.md); read only the relevant topic.

| Worker | Branch/worktree | State and next step |
| --- | --- | --- |
| Core | work/1089-core, .worktrees/1089-core | 1089 integrated cf0b4c9e0; 1091 aspect fix integrated b189f5bab, AC3 waits1092. Now1092 nestedwrap, then1088 size attribution and1090 library default icons. Sole shared core writer. |
| Gallery proof | work/1087-gallery-proof, .worktrees/1087-gallery-proof | Owner screenshot fixes integrated c59fa16fa: real aligned password eye/pointer/keyboard, responsive app source. AC1 waits1091/1092; fresh worker verifies defaults/resize/scroll and closes criteria. |
| Feedback | work/1078-overlays-resume, .worktrees/1078-overlays-resume | .11 feature checks green across3engines after1089; owns feedback/spinner/progress and sole host.componentEffect. Final generic icon/size proofs wait1090/1088. |

- Inputs progress0a8c0b141 and Navigation progress3dde12a02 are integrated with functional proofs green, size AC3 open and dependency1088. Their old worktrees/artifacts remain read-only for core attribution. .07Pickers unstarted. Metadata alone may not explain used-code growth; core measures both.
- Owner screenshot app is docs/img/design/src (PICTURE=gallery), not the kit-gallery app. No ZINC_RESIZE workaround:1091 clears SDL startup aspect lock;1092 fixes confirmed nestedwrap parentheight/scroll overlap. Repros/probes /tmp/1087-proof/; preserve original worker tree until absolute imports retargeted.

## Safe engine and machine

- Main tree has OTHER SESSION uncommitted runtime/LVGL/host work, `src/main.cpp` display hunk, ui.ts Virtual/Fenwick near636/967, changelog/affected/perf lines. Preserve it; never use main/build/zinc for these UI proofs. Tasks844/853/884 belong to other sessions.
- Retained clean tree/binary: `.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc`, rebuilt with integrated c69f4e7a8. Use ZINC_ROOT=$worker_tree, ZINC=$absolute_clean_binary. Reset the retained tree only when clean; tools/build zinc after a C++ change.
- Heavy commands queue automatically via `/Users/mowmow/Lab/zinc/tools/work-run SECONDS COMMAND ARGS`; git-common-dir flock shared by worktrees, existing timeout kills the command group. No coordinator token waits. The old /tmp/zinc-heavy-run-501.py delegates here.
- Two building trees at most, one heavy process at a time. Headless or ZINC_BACKGROUND=1, bounded runs, no synthetic load or left-over apps. Source reading/editing remains parallel.
- tools/codex-live configures five worker slots for NEW CLI sessions (documented max_threads alias); this session's runtime cap remains three workers. Launch argument mock, linked-tree serialization/exit/timeout regression and skill validation passed. No second coordinator started.

## Latest integrated behavior

- c69f4e7a8, ZN-1086: one non-returning TDZ error constructor shared by inlined guards. Same-source Button ReferenceError allocation sites859→1; guards/value evaluation/errors preserved. Unchanged AOT gate62412 B/component <=65536; no source/budget workaround.
- d78054826 +8fc1bb2d1, ZN-1085: onFocusWithin returns an idempotent registration-specific disposer and snapshots existing focus without an enter callback. Use host.onCleanup(ui.onFocusWithin(...)); Inputs/Overlays migrate their own callers. Exact stale-handle, replacement and keyboard/pointer blur cases pass all3 engines.
- 53009551b, ZN-1078.08: Selection Done after the size fix; mixed native AppKit checkbox, stable React gestures via host.componentRef, filled icons, labelled keyboard controls and light/dark gallery.
- 2a0c72f1f, ZN-1078.10: Overlays Done; dialog/sheet/popover/hover/tooltip/confirmation/tour/toasts, owned deadlines and focus subscriptions,11 real images. Exact Solid/React checks, AOT and unchanged size gate pass.
- e426a7560, ZN-1084/D269: seven UI work scenarios, optional visits and creation/settled/disposal counters, correct-result/provenance gates, memory unavailable=null. Three small artifacts: docs/reports/bench/ui-work-2026-11-09-{qjs64,coarse16,aot16}.json. Four sparse writes64rows:4bindings but528measure/528place/848paint visits; no timing ranking.

## Validation and tests to run (the owner picks)

- Owner asked to test the kit: clean kit_quiet/input/actions/chrome/selection/selection_native/overlays, ui_focus_dispose, tdz_outline, bench_harness and unchanged kit_size passed. Gallery check, brief headless captures and bounded background interactive run passed; no process left. Suites/cross/GPU/full benchmarks not run.
- Next immediate checks are each worker's exact feature/React/native proof, original gallery capture and final unchanged size gate. Inputs is not Done until its own full-source gate passes. Never replace valid user code to hide engine gaps.
- At a chosen milestone: physical keyboard/VoiceOver/touch and native host behavior for kit families; all7 AOT UI work scenes64rows, then quiet-machine scaling; hot_recompile/fast_refresh for TDZ helper keys. RSS/heap, Yoga/style/DOM internals and native host work remain unmeasured.
- All older proposed tests and known machine-specific failures are preserved under Tests to run and topic headings in the archived resume. Do not re-investigate those on unrelated work.

## Owner demo

From the retained clean tree: `ZINC_ROOT=$PWD build/zinc run examples/ui/kit-gallery --interp`. GALLERY=actions/chrome/selection/overlays selects a family; Dark toggles the theme. User was given this command and the loop continues.
