# Review shard E (66 tasks), 2026-11-07

Counts: keep 35, park 14, done-partly 7, rewrite 5, done 3, drop 1, review-close 1. Three tasks carry an assignee (ZN-774.32, ZN-792, ZN-799): verdicts given, to leave alone.

## Findings

- Already done or nearly: ZN-744 and ZN-746 (previous review said close; the open criteria are Nexus 7 figures), ZN-813 (the stale `zinc update` text is gone, AGENTS.md describes the M1 Pro), ZN-792 (all ten criteria ticked, close as done).
- Small closes by one step: ZN-698 (sha256 of bytes is in `lib/std/web.ts:2034`, only the chunked file hash and test left), ZN-708 (Date.now already wall clock outside test runs; decision record and a test left), ZN-713 (numbers must be re-taken on a quiet machine at a milestone), ZN-774.18, ZN-774.32, ZN-761, ZN-812 (useEffect cleanup exists in `lib/std/react.ts:127`).
- ZN-699 is real and tiny: `Math.atan` is missing in `src/frontend/check.cpp:511`.
- ZN-814: `devices/phone.json` exists without insets; rewrite as adding insets and a cutout to it rather than two new files.
- ZN-703: keep, but the Node sim no longer exists, so compare against a frozen table made with fdlibm.
- Park: ZN-701 (Intel Mac AMD), 725, 741, 743, 752, 754, 760 (Nexus 7, Pi, console hardware) and the cross-platform pass tasks ZN-804 to 811. Drop: ZN-700 (shared editor kit, two internal demos only).
- ZN-723 and its four parts are a large gated spike (L, deep); ZN-724 is a bounded measure; neither is a night task.
- The onboarding subtasks (774.21 to 774.31) are the best lot for the owner's "usable and accessible" aim, mostly site and Atelier work on the Mac.

## The ten that matter most

1. ZN-805: lighter exports and idle sleep; size and CPU for every app.
2. ZN-774.21: llms.txt and Markdown pages; small, no risk.
3. ZN-774.27: `zinc help <name>` and F1; first-run help.
4. ZN-799: `lib/ui.d.ts` is one line; editors show nothing for zinc:ui.
5. ZN-802: clear errors (number not f64, one error per typo).
6. ZN-794: `Promise.then` flattening, a common trap.
7. ZN-796: typed numbers agree on QuickJS.
8. ZN-798: five frontend defects, one a compiler SIGSEGV.
9. ZN-699 and ZN-795: two quick wins (atan, monitor UDP bind).
10. ZN-774.22: site search in five languages.

## Surprises

- Marks are my estimates from task text and a few greps; I did not run builds. I did not prove ZN-796 or ZN-794 on the engine (a `zinc run` quickjs try failed on argument syntax), so they stay `keep` on the task text.
- Heavy criteria (100 MB hash, benchmark runs, Nexus 7 figures) are not reasons to keep a task open; they became later lines in the rewrites.
