# Resume — 2026-11-09

## Coordination

Continue `zn-coordinate` until the main repository `.paused` exists or no work remains. Never ask the owner a question. This root session is the sole backlog coordinator; [COORDINATOR.md](docs/reports/backlog-review-2026-11-07/COORDINATOR.md) records claims and integrations. Other sessions are working on Mapper, documents and runtime/LVGL changes.

This session closed 21 tasks: ZN-1078.03/.04/.05/.06/.08/.09/.10, ZN-1079–1087, ZN-1088–1092. Earlier integration details, known failures and proposed tests remain in [the archived handover](docs/reports/session-handover-2026-11-09.md).

| Worker | Branch / worktree | Current work |
| --- | --- | --- |
| Sole core writer | `work/1096`, `.worktrees/1096` | First correct existing1093 composed-ID normalization; then1096 pending scroll intent. Two additional confirmed constructor/guard checker gaps are being reserved. |
| Pickers | `work/1078-pickers-proof`, `.worktrees/1078-pickers-proof` | Fresh checkpoint proof; original private source `b1b945b19` retained. AllACopen. Actual source reveals1093 Z0107 and iterable Set inference Z0109; no app workaround. |
| Data | `work/1078-data-proof`, `.worktrees/1078-data-proof` | Fresh checkpoint `f048a55bf` proof; allACopen. Original Data IDs reveal1093 regression; optional callback guarding also fails checker despite tsc strict acceptance. |
| Feedback parked | `.worktrees/1078-feedback-astra` | Integrated source `b088d2952`; cleanup patch and notes in `.logs/feedback-astra-handover.*`. OnlyAC2 checked. |


New workers inherit the configured model after the owner's “on rebascule”. Launchers retain Fast and optional `ZN_CODEX_MODEL`; the global model configuration was not changed. Research agents have finished; disposable review/research worktrees were removed. Code 13 provider research is saved in its unclaimed task for the next family.

## Integrated core and remaining blockers

- Inputs06 and Navigation09 are nowDone after clean root kit_size, kit_inputs, kit_navigation and original gallery check/three-frame smoke PASS.
- Integrated five commits:1088 `9b4f5451d`,1093 `e3a20b747`,1094 `e500cf6de`,1095 `0d1228346`,1090 `41c30e3ac`.1088/1090 Done;1093/1094/1095 keep original Picker/Data consumerAC3 open. Root checked engine source-tree identity against tested provenance and rebuilt the clean retained tree; unchanged kit_size PASS. Existing asset/nanosvg warnings are not a new warning-free claim.
- Final combined gate: AOT direct/index/ten5,325,320/5,374,848/5,910,096 B; unused49,528 and59,472 B/component pass. JS233,514/235,601/272,216 B; unused2,087 and4,068 B/component pass,249 B total headroom. New Picker Slider/Data Card changes are excluded and need fresh gates. Shared exact SVG wrappers save7,409 minified B with all41 canonical selected glyphs preserved. No budget/UI trim and no runtime speed claim.
- Exact layout/plugin-host/codec/Script/ID/flatMap/ownership/icons/Input/Navigation/Overlay checks pass on tested source. Original gallery interpreter and Feedback QuickJS short smokes pass. Provenance persisted at `docs/reports/bench/kit-core-2026-11-09.json`; source/log/binary retained in `.worktrees/1088-resume` until replacement validated.
- Real paired-Pi aarch64 Script+SVG executable10,391,584 B returned42/exit0; no remote proof process remains. Preserve CLI baker64MP policy/engine callback ABI; bounded runtime image helpers use16MP cap. Normal configured SSH identity agent stalled; paired deployment succeeded without changing credentials.
- Fresh UI caller checks caught unconditional synthesized `??` on composed nonnullable IDs (Z0107).1093 is being corrected by the sole core worker, with no app ID rewrite. Constructor iterable inference and guarded optional callback failures have minimal source evidence/primary research; reserve actual blocking tasks before implementation.
-1096 preserves pre-layout scroll intent. Root original three-frame interpreter repro expected200 but observed0. RN/Flutter research is in task; no picker frame-delay workaround. Picker catalogue is lazy Unicode17 (1,914 entries/nine groups/330tone sets); actual glyph coverage and captures remain unproved.
- Decisions D270–273 record stable metadata/allocation cost, conservative plugin host capability, canonical neutral JSX ownership and reached icon serialization. Contextual mixed scalar/tuple literal inference remains a later line; already-typed tuple flatMap is proven.

## Machine and integration safety

- Main has other sessions' uncommitted runtime/LVGL/host changes, a display hunk in `src/main.cpp`, Virtual/Fenwick hunks in `lib/std/ui.ts`, and changelog/affected/performance edits. Preserve them. The performance file currently has 15 external added lines; stage only coordinator-owned appended blocks. Never use main's binary for these UI proofs.
- Retained clean binary: `.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc`, rebuilt through41c30e3ac; source matches integrated core. Use it read-only with `ZINC_ROOT=$worker_tree`. Reset only when clean and rebuild after subsequent C++ integration.
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
