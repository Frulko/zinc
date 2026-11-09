# Resume — 2026-11-09

## Coordination

Continue `zn-coordinate` until the main repository `.paused` exists or no work remains. Never ask the owner a question. This root session is the sole backlog coordinator; [COORDINATOR.md](docs/reports/backlog-review-2026-11-07/COORDINATOR.md) records claims and integrations. Other sessions are working on Mapper, documents and runtime/LVGL changes.

This session closed 17 tasks: ZN-1078.03/.04/.05/.08/.10, ZN-1079–1087, ZN-1089, ZN-1091 and ZN-1092. Earlier integration details, known failures and proposed tests remain in [the archived handover](docs/reports/session-handover-2026-11-09.md).

| Worker | Branch / worktree | Current work |
| --- | --- | --- |
| Sole core writer | `work/1088-resume`, `.worktrees/1088-resume` | Private checkpoint `e6d744868` parks ZN-1088 with all criteria open. Prepare ZN-1093 (JSX `id`), ZN-1094 (`flatMap`), then ZN-1090 (default icons); validate and fold final task updates into their commits before integration. |
| Pickers | `work/1078-pickers`, `.worktrees/1078-pickers` | ZN-1078.07: component/gallery source and exact tests written; static checks pass. Runtime proofs, pictures and size gate remain pending. Owns shared kit host helpers. |
| Data | `work/1078-data`, `.worktrees/1078-data` | ZN-1078.12: components and gallery source written. Confirmed engine blockers are `id` and `flatMap`; reviewing keyboard, loading and selection behavior. No runtime proof yet. |
| Feedback parked | `.worktrees/1078-feedback-astra` | Source `b088d2952` integrated; no active worker. Cleanup patch and notes under `.logs/feedback-astra-handover.*`. Only AC2 is checked; resume after size/default icons. |

New workers inherit the configured model after the owner's “on rebascule”. Launchers retain Fast and optional `ZN_CODEX_MODEL`; the global model configuration was not changed. Research agents have finished; disposable review/research worktrees were removed.

## Core checkpoints and blockers

- **Nothing after `e6d744868` is integrated yet.** Its allocation cost uses existing `kAllocs` effects, stable-ID metadata pruning and an audited `native.systemHost` opt-in (default full, SVG lite). The exact layout regression passed on all three engines, including hot/debug retention and numeric/string inlining controls.
- A new reached-Script regression exposed missing native/cross static archive dependencies. Source repairs include recursive Script retention and required archives; the final build, host/cache/Script regression, current-source size gate and original gallery smoke remain pending. Cross execution and runtime performance are unmeasured.
- **Earlier candidate `e020951cc` numbers only:** AOT direct/index/ten = 5,390,968 / 5,423,984 / 6,074,800 bytes. Unused-family cost 33,016 passes; used-component average 72,312 exceeds 65,536, needing another 60,992 bytes total. These are not measurements of the latest checkpoint. Preserve `.worktrees/1088-astra/.logs/1088-final` and `.worktrees/1089-core` attribution evidence.
- ZN-1093: a three-line ordinary JSX `id` example fails Z0005. Support the existing generic attribute pipeline, VirtualList and actual web DOM IDs; do not add a grid-specific registry. Primary WAI/React research is in the task.
- ZN-1094: a two-line nested-string-array `flatMap` example fails Z0106. Implement through existing typed array HOF generation; TC39 and vendored QuickJS research is in the task. Do not rewrite PathBar to hide it.
- ZN-1090: reached library defaults must supply icons without application manifests, preserving shaking. Research favors shared typed reachability for valid Zinc and preliminary linking for bundles. Arbitrary JavaScript outside Zinc must not acquire a mandatory checker/esbuild dependency; its existing explicit declarations remain the offline fallback. No production icon fix yet.
- Inputs `0a8c0b141` and Navigation `3dde12a02` are integrated progress, with functional proofs but open size criteria depending on ZN-1088. Their retained worktrees contain attribution inputs. Never raise budgets or trim valid UI to pass.
- Pickers now use the full lazy Unicode 17 catalogue (1,914 entries, nine groups, 330 tone sets). Font coverage and actual rendering are unproved. Possible pre-layout scroll and neutral-component React ownership problems await runtime repros; no workaround or speculative new task.

## Machine and integration safety

- Main has other sessions' uncommitted runtime/LVGL/host changes, a display hunk in `src/main.cpp`, Virtual/Fenwick hunks in `lib/std/ui.ts`, and changelog/affected/performance edits. Preserve them. The performance file currently has 15 external added lines; stage only coordinator-owned appended blocks. Never use main's binary for these UI proofs.
- Retained clean binary: `.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc`, rebuilt through the integrated SDL aspect fix. Use it read-only with `ZINC_ROOT=$worker_tree`. Reset that tree to develop only when clean, and rebuild after C++ integration.
- Heavy commands use `/Users/mowmow/Lab/zinc/tools/work-run SECONDS COMMAND ARGS`, with one queued command per worker. Another session has restarted a bounded one-hour Mapper app and holds the global lock. Preserve it. Cheap bounded static `zinc check` commands can proceed without executing apps; builds, tests and app runs remain queued.
- At most two building trees globally, one app/test at a time, bounded runs, headless or `ZINC_BACKGROUND=1`, no leftovers. Do not kill another session's jobs. Core canceled only its own queued build before changing inputs.
- `tools/integrate` preserves overlapping owner work and now handles merge/diff3/zdiff3 bases correctly (`06e670420`). Still inspect restored work, conflict markers and affected JSON after integration. Keep immutable stash identities.
- Current runtime allows three workers. The five-worker launcher setting applies only to new CLI sessions; do not launch a second coordinator. No push.

## Latest completed behavior and validation

- Owner gallery ZN-1087 is Done: app/password `c59fa16fa`, SDL aspect `b189f5bab`, nested wrap `414861c46`, full default proof `5bd6649c3`. Native 360/768/1024/1440 checks cover bounds, scrolling, reveal/edit/focus and Enter/Space without a resize workaround. Pictures are `docs/img/design/gallery-responsive.png` and `password-reveal.png`.
- TDZ outlining `c69f4e7a8` preserves guards while sharing the non-returning error constructor; the then-current size gate passed at 62,412 bytes/component. Focus disposer `d78054826` / `8fc1bb2d1` provides exact idempotent cleanup and initial focus snapshots.
- Selection and Overlays are Done, with Solid/React/native proofs and pictures. Owner-requested kit checks, short gallery captures and bounded background interaction passed; no owner UI process was left by this coordinator.
- Harness `e426a7560`, D269: seven UI work scenarios with correct-result/provenance gates and nullable unavailable memory. Three small artifacts are under `docs/reports/bench/ui-work-2026-11-09-*`. Four sparse writes over 64 rows cause four bindings but 528 measure / 528 place / 848 paint visits; no timing ranking was claimed.

## Tests to run — the owner picks

Immediate feature proofs remain each worker's exact T0, actual Solid/React/native behavior, Zinc-drawn captures and the unchanged final size gate. No suite, T1/T2/demo test, pixel comparison, fuzzing, full benchmark or cross run is authorized here. Proposed milestone checks include physical keyboard/VoiceOver/touch, all seven AOT work scenarios and quiet-machine scaling; all older commands and known failures are retained in the archived handover.

## Owner demo

From the retained clean tree: `PICTURE=gallery ZINC_SIZE=1280x900 ZINC_ROOT="$PWD" build/zinc run docs/img/design/src --interp`. For the kit: `ZINC_ROOT="$PWD" build/zinc run examples/ui/kit-gallery --interp`; `GALLERY=actions`, `chrome`, `selection` or `overlays` selects a completed family. The coordinator loop continues.
