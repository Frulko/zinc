# Resume — 2026-11-09

## Coordination

Continue `zn-coordinate` until the main repository `.paused` exists or no work remains. Never ask the owner a question. This root session is the sole backlog coordinator; [COORDINATOR.md](docs/reports/backlog-review-2026-11-07/COORDINATOR.md) records claims and integrations. Other sessions are working on Mapper, documents and runtime/LVGL changes.

This session closed 17 tasks: ZN-1078.03/.04/.05/.08/.10, ZN-1079–1087, ZN-1089, ZN-1091 and ZN-1092. Earlier integration details, known failures and proposed tests remain in [the archived handover](docs/reports/session-handover-2026-11-09.md).

| Worker | Branch / worktree | Current work |
| --- | --- | --- |
| Sole core writer | `work/1088-resume`, `.worktrees/1088-resume` | Five-task source batch 1088/1093/1094/1095/1090. Warm local proofs and the Pi Script+SVG proof pass; final icon/flatMap checks, gate and rebase/fixups are finishing. All private commits remain unintegrated; request final hashes before integrating. |
| Pickers | `work/1078-pickers`, `.worktrees/1078-pickers` | Parked private checkpoint `b1b945b19`, clean. All AC open; source/tests/gallery/catalogue ready. Fresh proof worker resumes after core+1096. Shared host helpers transferred to core 1095. |
| Data | `work/1078-data`, `.worktrees/1078-data` | Parked private checkpoint `f048a55bf`, all AC open. Canonical header and scoped read-only gallery filesystem permissions added. Host helper working copy was excluded from commit. Fresh proof worker needs integrated core and canonical helpers. |
| Feedback parked | `.worktrees/1078-feedback-astra` | Source `b088d2952` integrated; no active worker. Cleanup patch and notes under `.logs/feedback-astra-handover.*`. Only AC2 is checked; resume after size/default icons. |

New workers inherit the configured model after the owner's “on rebascule”. Launchers retain Fast and optional `ZN_CODEX_MODEL`; the global model configuration was not changed. Research agents have finished; disposable review/research worktrees were removed. Code 13 provider research is saved in its unclaimed task for the next family.

## Core checkpoints and blockers

- **The core branch is still private.** Metadata pruning, allocation-effect inline cost and the audited native system-host contract are implemented. Exact layout, plugin/Script/legacy-cache, JSX ID and flatMap checks pass on all three engines; neutral ownership, actual kit_inputs/overlays and the original short gallery smoke also pass.
- Pi cross proof passed through the paired `zinc-player`: an owned aarch64 Script+SVG binary returned 42 and left no remote app. SSH's configured 1Password agent was not usable unattended; paired deployment avoided that issue. Cross linking exposed missing archives and runtime image ownership; preserve the baker's 64 MP limit and existing engine callback ABI while runtime web helpers use the established 16 MP cap. Final helper/codec checks are being completed.
- Latest measured candidate, before final fixups/icons: AOT direct/index/ten = 5,308,712 / 5,358,240 / 5,877,008 bytes; unused 49,528 passes 126,976, used 57,640 passes 65,536. JS 231,480 / 233,567 / 263,389: unused 2,087 and used 3,313 pass. These supersede the older e020 size failure but require final provenance/gate after current source changes. Runtime speed is unmeasured.
- Read-only reviews found and corrected tuple flatMap, nullish IDs, stale virtual-row reinsertion, imperative toast owner leaks and reentrant cleanup. Shared componentSignal/componentMemo/effect-deps/_scroll helpers now belong to core 1095. Preserve attribution in `.worktrees/1088-astra/.logs/1088-final` and the old 1089 tree; do not integrate obsolete checkpoints.
- ZN-1093: a three-line ordinary JSX `id` example fails Z0005. Support the existing generic attribute pipeline, VirtualList and actual web DOM IDs; do not add a grid-specific registry. Primary WAI/React research is in the task.
- ZN-1094: a two-line nested-string-array `flatMap` example fails Z0106. Implement through existing typed array HOF generation; TC39 and vendored QuickJS research is in the task. Do not rewrite PathBar to hide it.
- ZN-1090: reached library defaults must supply icons without application manifests, preserving shaking. Research favors shared typed reachability for valid Zinc and preliminary linking for bundles. Arbitrary JavaScript outside Zinc must not acquire a mandatory checker/esbuild dependency; its existing explicit declarations remain the offline fallback. Production icon fix now passes its focused direct/offline/stage/bundle/unknown-name cases; final source/gate/handoff is pending. Inference can conservatively include ordinary UI literals that match an icon name; it does not keep the whole catalogue.
- Inputs `0a8c0b141` and Navigation `3dde12a02` are integrated progress, with functional proofs but open size criteria depending on ZN-1088. Their retained worktrees contain attribution inputs. Never raise budgets or trim valid UI to pass.
- ZN-1095: static lowering confirms neutral nested JSX lacks child React ownership; it is claimed for the same core writer. Prepared conditional cleanup/state and virtual row assertions remain unrun. Preserve ordinary JSX and shared Solid behavior; no hidden child workaround.
- Pickers now use the full lazy Unicode 17 catalogue (1,914 entries, nine groups, 330 tone sets). Font coverage and actual rendering are unproved. Root confirmed pre-layout scroll loss with the original three-frame probe (expected 200, observed 0). ZN-1096 is claimed for a fresh sole core worker after this five-task batch; RN/Flutter research and exact scope are in its task. Keep pending intent and disposal in the engine, no picker delay workaround.

## Machine and integration safety

- Main has other sessions' uncommitted runtime/LVGL/host changes, a display hunk in `src/main.cpp`, Virtual/Fenwick hunks in `lib/std/ui.ts`, and changelog/affected/performance edits. Preserve them. The performance file currently has 15 external added lines; stage only coordinator-owned appended blocks. Never use main's binary for these UI proofs.
- Retained clean binary: `.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc`, rebuilt through the integrated SDL aspect fix. Use it read-only with `ZINC_ROOT=$worker_tree`. Reset that tree to develop only when clean, and rebuild after C++ integration.
- Heavy commands use `/Users/mowmow/Lab/zinc/tools/work-run SECONDS COMMAND ARGS`, with one queued command per worker. The long Mapper lock is now released; use the queue normally and preserve other sessions’ jobs. Cheap bounded static `zinc check` commands can proceed without executing apps; builds, tests and app runs remain queued.
- At most two building trees globally, one app/test at a time, bounded runs, headless or `ZINC_BACKGROUND=1`, no leftovers. Do not kill another session's jobs. Core canceled only its own earlier queued builds before changing inputs. There are no parked UI worker jobs.
- `tools/integrate` preserves overlapping owner work and now handles merge/diff3/zdiff3 bases correctly (`06e670420`). Still inspect restored work, conflict markers and affected JSON after integration. Keep immutable stash identities.
- Current runtime allows three workers. The five-worker launcher setting applies only to new CLI sessions; do not launch a second coordinator. No push.

## Latest completed behavior and validation

- Owner gallery ZN-1087 is Done: app/password `c59fa16fa`, SDL aspect `b189f5bab`, nested wrap `414861c46`, full default proof `5bd6649c3`. Native 360/768/1024/1440 checks cover bounds, scrolling, reveal/edit/focus and Enter/Space without a resize workaround. Pictures are `docs/img/design/gallery-responsive.png` and `password-reveal.png`.
- TDZ outlining `c69f4e7a8` preserves guards while sharing the non-returning error constructor; the then-current size gate passed at 62,412 bytes/component. Focus disposer `d78054826` / `8fc1bb2d1` provides exact idempotent cleanup and initial focus snapshots.
- Selection and Overlays are Done, with Solid/React/native proofs and pictures. Owner-requested kit checks, short gallery captures and bounded background interaction passed; no owner UI process was left by this coordinator.
- Harness `e426a7560`, D269: seven UI work scenarios with correct-result/provenance gates and nullable unavailable memory. Three small artifacts are under `docs/reports/bench/ui-work-2026-11-09-*`. Four sparse writes over 64 rows cause four bindings but 528 measure / 528 place / 848 paint visits; no timing ranking was claimed.

## Tests to run — the owner picks

Immediate feature proofs remain each worker's exact T0, actual Solid/React/native behavior, Zinc-drawn captures and the unchanged final size gate. No suite, T1/T2/demo test, pixel comparison, fuzzing or full benchmark is authorized here. A short real cross proof is required when cross code changes; the core Pi proof has passed. Proposed milestone checks include physical keyboard/VoiceOver/touch, all seven AOT work scenarios and quiet-machine scaling; all older commands and known failures are retained in the archived handover.

## Owner demo

From the retained clean tree: `PICTURE=gallery ZINC_SIZE=1280x900 ZINC_ROOT="$PWD" build/zinc run docs/img/design/src --interp`. For the kit: `ZINC_ROOT="$PWD" build/zinc run examples/ui/kit-gallery --interp`; `GALLERY=actions`, `chrome`, `selection` or `overlays` selects a completed family. The coordinator loop continues.
