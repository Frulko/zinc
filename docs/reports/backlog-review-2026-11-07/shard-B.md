# Backlog review 2026-11-07, shard B (66 tasks)

Counts: keep 31, park 28, rewrite 4, merge 1, drop 1, done 1. No task of this shard has an assignee.

## Findings
- ZN-388 (classic borders take layout space) is done: commit 78c2d81a2 moved the cases into `tests/golden/layout-conformance/classic.pass`.
- ZN-335.01 duplicates ZN-338 (fixture plugin repository running the reusable workflow); merged into ZN-338.
- ZN-341 (independent rebuilders) is dropped: no community, no users.
- Most of the shard is cross-platform or hardware work: the iOS 9 tasks (461, 462, 466, 475, 479, 483), the PSP/Vita/3DS 3D and input tasks, Pi measurements (412.04, 412.07, 419, 440.03), the Arduino interop tasks (303 to 308) are parked.
- ZN-418 and ZN-440 are epics with subtasks; they are never handed out, the subtasks are. The Pi 3 criteria of ZN-440, 444 and 445 are moved to the cross pass.
- ZN-330.04: `build/zinc` still contains HarfBuzz and SheenBidi symbols, so the task is still open.
- ZN-364.01: `lib/std/animated.ts` accepts `useNativeDriver` but still runs on the program's thread.
- Marks are quick estimates from the task text and a short code check, not proof runs.

## The ten that matter most
1. ZN-418.01 to .04: packed u8/i32/f32 arrays (large memory win, deep in the runtime, so not for tonight).
2. ZN-364.01: native driver animations (smooth UI under load).
3. ZN-376: function identity as a value plus an IR error, small and a correctness bug.
4. ZN-389: checker gap blocking rn-tester, fix the engine.
5. ZN-396: freeze the engine headers plugins include (stable plugin ABI).
6. ZN-423: LTO trial on the Mac, a flag with a measurable result.
7. ZN-429: `.incbin` resources in AOT, small.
8. ZN-437 then ZN-451: `zinc assets check/report --diff`, then templates and budgets.
9. ZN-391: open `.zapp` by double-click.
10. ZN-467: ff_replay CPU reference backend, the key to the other GL tasks.

Quick closers (effort S, Mac): 376, 391, 394, 395, 423, 429, 342, 311, 313, 418.04, 445.
