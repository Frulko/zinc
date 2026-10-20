---
id: ZN-583
title: 'Physics plugins: Box2D v3 (2D) and Jolt (3D)'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-09 08:12'
updated_date: '2026-10-11 18:05'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies: []
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
matter-js, planck and cannon-es run 20-40x slower on QuickJS than on V8 (planck 500 bodies: 28.5 ms per step). Native plugins physics2d (Box2D v3, MIT) and physics3d (Jolt, MIT), vendored with licences, typed APIs (world, bodies, shapes, joints, contacts, raycasts) and a JS API for QuickJS; an optional planck-shaped JS facade for common calls. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 2,000 piled 2D bodies step in <= 2 ms in AOT and <= 3 ms from QuickJS through the JS API
- [ ] #2 1,000 3D bodies step in <= 3 ms
- [x] #3 deterministic replay: same positions after 600 steps
- [ ] #4 builds for macOS, Linux and armhf with the pinned zig
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11, parallel worktree (branch worktree-agent-aee2a0941021d8667): the parent's own criteria, after ZN-583.01 and ZN-583.02. Review: criterion 2 needs a measurement on a quiet machine (benchmarks are valid only after integration, alone: AGENTS.md), criterion 4 another machine. usage: n/a (tools/usage has no figure for a parallel agent).

What changed
- plugins/physics3d: a `threads` world option (1 by default: exactly as before; n > 1: Jolt's JobSystemThreadPool, n - 1 workers and the calling thread; 0: one per core, hw.physicalcpu on macOS, hardware_concurrency elsewhere). A threaded world follows the library's determinism rules (Docs/Architecture.md, "Deterministic Simulation"): the listeners record under a mutex, a step listener numbers the collision steps, the contacts of a step are sorted (collision step, began or went on before ended, then by value), the moved bodies are listed by index. The contact listener is set only once a body asks for events: Jolt then skips rebuilding a manifold for every cached contact and the walk of the ended ones (-1.9% instructions on the 1,000-body pile, same positions). vendor/jolt_1.cpp compiles JobSystemThreadPool.cpp, JobSystemWithBarrier.cpp and Semaphore.cpp (the vendor archive rebuilds once: 93 s with the pinned zig at load 8); PIN updated.
- bench/physics3d_pile.ts: `-- bodies threads` (threads 0 by default), prints the threads and a hash of the final positions.
- tests/data/physics3d/drop.ts: `-- threads`; the replay from the start also compares the order of the contacts (a hash, not printed). tests/t1/physics3d.sh runs the compiled drop.ts on 4 threads against drop.out too.
- docs/plugins/physics3d.md: the option, Exact, Performance, Limits.

Criteria on real output
1. Met, by ZN-583.01's measurement on a CPU at full speed (bench/physics2d_pile.ts, load 3.79 to 3.96, CPU_Speed_Limit 100): compiled 1.786 ms, QuickJS 2.613 ms. Today at CPU_Speed_Limit 44 (load 6.6) the compiled pile took 4.065 and 4.075 ms: the heat, not the code.
2. Not proven on this machine today. bench/physics3d_pile.ts, 1,000 awake bodies, compiled, runs alternated:
   - load 7.3 to 8.4, CPU held at 44 to 46%: one thread 7.54 8.19 8.24 8.19 8.58 (median 8.19 ms), one per core (6) 3.37 3.86 3.59 3.64 3.94 (median 3.64 ms);
   - load 8.2 to 10, CPU 37 to 42%, one per core: compiled 3.77 3.82 4.98, interpreter 3.86 4.94 4.73, QuickJS 5.09 5.04 6.02 (medians 3.82, 4.73, 5.09);
   - load 5.5 to 6.7, CPU 46 to 60%: one thread 5.97 6.56 7.25 6.24 6.63 7.86, one per core 2.75 3.17 3.15 2.73 3.12 3.95 (median 3.14 ms).
   The cores divide the step by 2.1 to 2.3; the heat costs as much (the 2D pile: 1.786 ms at full speed, 4.07 ms at 44%), which puts the 3D pile near 1.6 ms on one per core at full speed: an estimate. To prove it after integration, alone: `build/zinc build bench/physics3d_pile.ts -o /tmp/pile && /tmp/pile 1000 1; /tmp/pile 1000 0; /tmp/pile 1000 0; /tmp/pile 1000 0` (tick #2 when the median of the `threads 0` lines is 3 ms or less).
   Profile of one thread (sample, 780 samples): velocity solver 43%, contact cache 14%, broad phase pairs 9%, the walk of ended contacts 4%, sorts and island splitting 6%, position solver 3%.
3. Met. tests/t1/physics2d.sh PASS: drop.out holds "replay from the start: identical" (the whole scene played twice, 600 steps each) on the interpreter, compiled and QuickJS. tests/t1/physics3d.sh PASS: drop.out identical on the interpreter, compiled, QuickJS and compiled on 4 threads, with "replay from the start: identical" (positions and order of the contacts, 600 steps) and "replay from the saved state: identical". The compiled drop.ts prints drop.out byte for byte on 1, 2, 4 and 12 threads. With the sort of the events taken out, 6 of 6 runs on 4 threads printed "replay from the start: DIFFERENT" (the check can fail). bench/physics3d_pile.ts ends with positions -784144820 on 1, 2, 4, 6, 8 and 12 threads, compiled, interpreted and on QuickJS.
4. Not run: cross targets wait for the cross-platform pass (Mac only); line below.

Tests run: tests/run --changed (bench_harness, native_gen, qjs_native, physics3d, pinball3d: 5 PASS, the pinball's game log unchanged), tests/run --tier t1 --only physics3d PASS (35 s, again after the last change), --only physics2d PASS; clang++ -fsyntax-only -Wall -Wextra on physics3d.host.cpp: no warning.

Decisions (for a decision record)
- Several threads through Jolt's own JobSystemThreadPool, per world and asked for (`threads`, default 1), not on by default: 20 bodies step in 0.056 ms on one thread and 0.142 to 0.151 ms on six (waking the workers costs more than it saves), and the contact order of existing one-thread programs (the pinball) stays as it was.
- `threads: 0` is one per core, not per hardware thread: 12 threads 4.76 ms against 6 threads 3.84 ms (medians of 5, load 7 to 11).
- Determinism with workers: the positions do not depend on the thread count (measured above); the callbacks and the active body list do, so the events are sorted by collision step (a step listener, threaded worlds only: with it Jolt also runs steps where every body sleeps, where nothing moves), the ended ones after the others of their collision step as Jolt reports them, then by value; the moved list by body index.
- Not kept: a temp allocator sized to maxContacts (page reclaims 3,308 against 3,290, instructions equal), -O3 (ZN-583.02). Already native: the plugin is built for the host CPU (AVX, no FMA under JPH_CROSS_PLATFORM_DETERMINISTIC).

Lines for backlog/later.md (the coordinator writes them)
- Cross-platform pass: ZN-583 #4: zinc:physics2d and zinc:physics3d built with the pinned zig for x86_64-linux, aarch64-linux and armhf-linux (`zinc build --target armhf-linux tests/data/physics3d/drop.ts`, the same for physics2d) and run in the container or QEMU: drop.out byte for byte, and physics3d's drop.ts -- 4 (the thread pool; -pthread is in the manifest); Jolt on 32-bit ARM to check against the library's platform list.
- ZN-583: measure bench/physics3d_pile.ts (`-- 1000 1` and `-- 1000 0`) and bench/physics2d_pile.ts on a quiet machine, compiled and on QuickJS; the numbers in zinc-next-perf.md and docs/plugins/physics3d.md.
- zinc:physics3d: `threads: 0` counts hardware threads on Linux (SMT doubles them on x86): compare one per core and one per hardware thread there.
- zinc:physics3d: one pool of workers shared by the worlds of a program, if a program steps several large worlds.

ZN-690 (stepped on several threads, 1,000 bodies in 3 ms) is this work: its #3 is met, its #2 waits for the same quiet measurement, its #1 is the coordinator's perf log.

Not verified: a quiet machine; Linux and the other targets; arm64 macOS.
<!-- SECTION:NOTES:END -->
