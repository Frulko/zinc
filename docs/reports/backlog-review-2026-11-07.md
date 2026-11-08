# Backlog review, 2026-11-07

The owner asked for a project manager's review of the whole backlog and of `backlog/later.md`: put everything in one flat list and reorder
it so that autonomous agents close as many tasks as possible, starting that night. The aim is a stronger, faster, more usable and more
accessible engine. The working files (brief, one result per shard, the later.md verdicts and the applied plan `applied.json`) are in
`docs/reports/backlog-review-2026-11-07/`.

## Method

- Six review agents read the 393 open tasks, checked the code, tests and commits, and gave one verdict each with evidence (`BRIEF.md`). Two
  more judged the 1,128 lines of `backlog/later.md` and grouped the ones worth doing into task drafts.
- Before applying, every close, drop and merge was checked again (grep, file reads, git log, a few probes of seconds). Where the evidence did
  not hold, the verdict was corrected (below).
- New this time: the mark `maturity` (how much a task makes the engine stronger, faster, more usable or accessible), and effort counts
  double. Score = value x3 + maturity x3 + novelty x2 + unblocks x2 + confidence x2 + effort x2 + risk; a task takes the highest score of the
  open tasks it unblocks. The 65 new tasks got their marks from the coordinator of the review.
- Ordinals: the Mac list 1000 on by 100, the cross-platform pass 50000 on, parked tasks 90000 on. ZN-1002 stays at 990000 and ZN-1018
  (React, Vue and Svelte, the coordinator's) at 40000.
- Owner, during the review: a Raspberry Pi 3B+ (player image) and an Intel Mac on macOS 10.14 are now test machines. A task parked only
  because it needs one of them moved to the cross-platform pass; tasks that need other boards, Windows, phones or consoles stay parked.
- Tasks with an assignee (33, mostly `@parallel` claims) and the tasks In Progress were left alone, as briefed, verdicts included.

## Result

Open tasks: 393 before, 438 after (416 Backlog, 3 Ready, 5 In Progress, 14 Review). 199 on the Mac list, 77 in the cross-platform pass,
126 parked, 34 left alone.

| Verdict | Tasks | What was done |
|---|---|---|
| done | 12 | Done, criteria ticked, evidence in the notes |
| review-close | 3 | Review tasks closed as done (Hamlet chunked bake, hints, arrows) |
| dropped | 6 | archived with the reason (prototype ABI snapshots, the shared editor kit, four Hamlet tasks overtaken by the Cite view) |
| merged | 4 | archived into the task that stays, notes and dependencies carried (ZN-335.01 into ZN-338; ZN-577, 579, 580 into ZN-578) |
| done-partly | 26 | a "What is left" paragraph at the top of the description |
| rewrite | 26 | a "Rewritten by the review" paragraph, three new titles |
| split | 1 | ZN-584 (zinc:game) into five subtasks, ZN-584.01 to .05 |
| parked | 119 | label `parked` |
| to the cross pass | 26 | parked proposed, but they need only the Pi 3B+ or the Intel Mac |
| keep | 137 | unchanged but for the order |

`backlog/later.md`: 1,128 lines to 529. 4 done, 118 dropped and 8 merged lines removed (merged text went to the task notes); 471 lines
promoted into 65 tasks (ZN-1003 to ZN-1017 and ZN-1019 to ZN-1068): 55 Mac tasks, 4 for the cross-platform pass (Pi, Linux, Tokyo on
the consoles in emulators), 6 parked (Windows, Android and webOS, mobile, reMarkable, console hardware, ESP32 boards). Two lines were added
for what the verdicts left out (the ZN-707 libraries, the shared editor kit).

## Corrections made before applying

- ZN-147 (fuzzing) stays open: `tests/fuzz/regress/check-dup-names-invalid-ir.ts` still ends in an internal invalid-IR error, and
  `fuzz_regress.sh` only checks that the exit code is below 124.
- ZN-388 (classic borders) stays open: the core shipped, but 13 border and box-sizing cases are still in `classic.known-fail`.
- ZN-341 (rebuilders) parked, not dropped: the client half ships and is documented; only the rebuilder job is missing.
- ZN-570 closed as done, not merged: ZN-707 is rewritten to PixiJS, Phaser and p5 only, so the Kaplay and LittleJS text checks became a
  later.md line.
- Six Hamlet tasks (ZN-951, 966 to 969, 972) parked, not dropped: the Hamlet roadmap was the owner's request.
- later.md: lines 449 and 634 were "merged" into ZN-894, which is Done; 449 stays (primitive unions have no task), 634 is its duplicate.
  Ten dropped lines are real defects or cross-platform checks and stay (Vita link failure, rM2 export, PSP call cost, TouchPad memory
  growth, GPU images keeping their CPU pixels...). Three dropped Pi lines and one misplaced Pi line went into the Pi pass task. Line 49
  stays because ZN-794 was claimed by a worker during the review.

## Notable findings

- The Hamlet roadmap is mostly overtaken by the game itself: camera, zoom, chunked Cite view, hints and presets exist.
- Thirteen Review or claimed tasks of the Discord, consoles and Pi shell work are done in code, but they carry `@parallel` claims and were left alone: closing
  them (ZN-792, 823, 839, 869, 872, 875, 886, 889, 899, 909, 912, 917, 921) is one coordinator step.
- 31 tasks the reviewers put on the Mac lane sit in the cross-platform group because of their milestone or title (the simulator chain,
  the three.js r162 tasks, ZN-164, ZN-221, ZN-600.01...). They lead the cross list by score; a milestone change would move them earlier.
- The four engine-gap tasks from the demos (`ts-lib-gaps`, `ui-gaps`, `qjs-webenv`, checker and JSX gaps) score high: they unblock correct
  demos without workarounds.
- Four measure-only tasks (ZN-567, 589.01, 592.02, 690) close in one quiet-machine session on the M1 Pro.

## The first 30 of the new order (Mac)

1. ZN-774.21 llms.txt and a Markdown copy of every doc page
2. ZN-1041 QuickJS web environment: honour zinc.json and import maps
3. ZN-774.23 A first sketch that teaches by its comments
4. ZN-774.22 Site search in each of its five languages
5. ZN-774.27 Help at hand: F1, zinc help, one offline search
6. ZN-1006 UI font fallback: CJK, Persian, arrows, emoji
7. ZN-158 Typed arrays, ArrayBuffer, DataView
8. ZN-1007 CLI polish: argument order, suggestions, port 0, messages
9. ZN-802 First-run polish of the CLI messages and guide
10. ZN-805 Lighter exported and idle UI apps
11. ZN-774.24 First-run polish: empty panels, what's new, accessible tour
12. ZN-963 A writable per-app data directory in zinc:fs
13. ZN-1003 Checker: function and generic assignability
14. ZN-1004 Errors for silent no-ops in zinc:ui
15. ZN-671 nuxt-ui: the trash-2 icon is silently missing
16. ZN-795 Permission and network hardening of zinc monitor and fs watch
17. ZN-1014 Tests green on develop
18. ZN-1020 zinc lsp: completion in imports and JSX, auto-import
19. ZN-1050 TypeScript and runtime library gaps found by demos
20. ZN-203.06 WebGL conformance round 2, a bounded batch
21. ZN-817 Release hygiene for the engine packs
22. ZN-1010 Async and generic inference gaps
23. ZN-1011 zinc:storage: one store per program
24. ZN-1017 React Native parity: ImageBackground, Image uri, Switch, Modal
25. ZN-1021 `zinc project --json` and `--json` output
26. ZN-1025 JSX gaps: all-optional props, `{list.map(fn)}`, hyphenated attributes
27. ZN-1027 A failed native plugin build fails loudly
28. ZN-1031 Inspector polish
29. ZN-1044 zinc doctor, zinc update and plugin install polish
30. ZN-640 Network log: mask multipart/form-data fields
