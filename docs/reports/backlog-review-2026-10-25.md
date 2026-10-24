# Backlog review, 2026-10-25

The owner asked, after release 0.8.0, for a review of the whole backlog: what is done, what is left, duplicates, useless tasks, a new
priority. The working files (brief, one result per shard, the checks, the applied plan) are in `docs/reports/backlog-review-2026-10-25/`.

## Method

- Seven review agents read every open task (379 then; ZN-790 to ZN-792, claimed by the console sessions, were left alone), checked the code,
  tests and commits, and gave one verdict each with evidence (`BRIEF.md`). Two more read the 60 Done tasks with unticked criteria and the 968
  lines of `backlog/later.md`.
- Three verifier agents tried to prove wrong every irreversible verdict (130 closes, drops and merges). They disagreed with 42; their
  correction was applied every time (`verify-v1..3.json`).
- The new order is the 2026-10-10 score: value x3 + novelty x3 + unblocks x2 + confidence x2 + effort (S 5, M 3, L 1) + risk. A task takes
  the highest score of the open tasks it unblocks, so a dependency comes before what waits for it. Ordinals: the Mac list 1000 on, the
  cross-platform pass 50000 on, parked tasks 90000 on (`applied.json` has the scores). The groups of `priority.json` still apply: the
  showcase group is gone (its demos shipped), the cross-platform pass stays last.

## Result

Open tasks: 382 before, 336 after (334 Backlog, 2 Review). 178 on the Mac, 65 in the cross-platform pass, 88 parked, plus the 3 console tasks.

| Verdict | Tasks | What was done |
|---|---|---|
| done | 52 | Done, criteria ticked, evidence in the notes (16 found done, 36 Review tasks whose last step was a person or a board) |
| dropped | 18 | archived (`backlog/archive/tasks/`) with the reason in the notes |
| merged | 20 | archived; the notes and the verifier's carry-over went to the task that stays; dependencies point there |
| done-partly | 39 | open, a "What is left" paragraph at the top of the description, sometimes a new title |
| rewrite | 34 | new title and/or a paragraph that replaces the stale text (prototype, old paths, changed decisions) |
| split | 5 | 17 subtasks (ZN-161, ZN-418, ZN-440, ZN-541, ZN-723) |
| parked | 83 | label `parked` (needs a board, Windows, a phone or the owner's hardware, or far from the goal) |
| keep | 128 | unchanged but for the order |

Also:
- 30 stale `@parallel` claims released (from 2026-10-11 to 2026-10-18, no agent left on them). 11 Review tasks with Mac work left went back to Backlog.
- 45 Done tasks with moot criteria have a note that says why. ZN-489 (the cooker has no tests) and ZN-603 (the follow-up the notes promised
  was never filed) are reopened.
- `backlog/later.md`: 968 to 403 lines. 307 removed (done, duplicates, or measures and ideas nobody needs, each with its reason in
  `later-engine.json` and `later-demos-cross.json`), and 254 promoted into 25 tasks (ZN-793 to ZN-817). 18 of those are Mac work: fixes
  for check and export, first-project polish, QuickJS and npm, web export, React gaps, the Kenney re-skin, lighter apps. The other 7 group the
  cross-platform lines: Windows, Linux, Pi, ESP32, handhelds, peripherals, mobile. Ten lines were added for the verifiers' findings.
- The task files of the new tasks were added under `New-task: owner backlog review 2026-10-25`.

## What the verifiers corrected

- Thirteen Pocket3D/PocketJS tasks (ZN-499 to ZN-511), the bare-metal Pi chain (ZN-217, ZN-220, ZN-222), BigInt (ZN-159), ZN-308 and ZN-348
  were proposed as drops. They are parked instead: the owner asked for them, so they are far, not useless.
- Seven Review tasks the reviewers would have closed still have Mac work:
  - ZN-184: there is no GLES2/WebGL1 instancing path.
  - ZN-147: the fuzz finding still crashes, and `fuzz_regress` only checks the exit code.
  - ZN-243: `openFilesIMP` is never installed.
  - ZN-249: the window transparency still reads alpha 255.
  - ZN-257: there is no GL-tier golden for the borders.
  - ZN-179: the one-buffer switch is not done.
  - ZN-121.04: 12 of 25 programs fail the no-f64 check.
- ZN-203.06 and ZN-203.09 stay open: 91 WebGL conformance pages still fail.
- The development machine is an M1 Pro now. ZN-567 and ZN-592.02 were "moot without an M1"; they are now a quick measurement on a quiet
  machine. Several Done tasks of M21 whose numbers came from an M1 could be measured again the same way.
- The JS library demos (ZN-577, ZN-579, ZN-580) are not the bunnymark of ZN-578: they stay separate.

## Fixed with this review

- `AGENTS.md`: the development machine is an Apple M1 Pro (arm64, 10 cores, 16 GB), not the Intel Mac it described.
- D144 is marked superseded by D165 for the Vita (vitaGL for zinc:gl, WebGL 1, three.js and zinc:3d).
- `zinc-engine/*` in the plugin starter is right: it is D37's organisation, which the owner has yet to create (ZN-354, closed).

## Next on the Mac (by score)

1. ZN-799, first-project polish: `ui.d.ts`, `app.window` without an id, the Button default, the kit Input.
2. ZN-774 and ZN-774.23, onboarding and a first sketch that teaches by its comments.
3. ZN-724, measure quickjs-jit against D110.
4. ZN-774.29, spike: the Zinc compiler built to wasm.
5. ZN-713, the Electron/Tauri comparison again on the M1 Pro.
6. ZN-793, `zinc check` and `zinc dev` diagnostics for QuickJS projects.
7. ZN-203.06, the remaining WebGL conformance pages.
8. ZN-682, the bounds of a zinc:3d node.
9. ZN-794, `Promise.then` flattens a returned promise.
10. ZN-800, the Kenney re-skin of the pinball and pocket-hero.

The simulator chain (ZN-535, ZN-313, ZN-143, ZN-300) scores highest of all. Its titles put it in the cross-platform group, though it runs on
the Mac. Move it into the Mac list if the owner wants the boards in Atelier sooner.
