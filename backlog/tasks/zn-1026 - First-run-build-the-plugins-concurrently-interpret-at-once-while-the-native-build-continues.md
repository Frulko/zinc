---
id: ZN-1026
title: >-
  First run: build the plugins concurrently, interpret at once while the native
  build continues
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:36'
updated_date: '2026-11-09 08:00'
labels:
  - perf
  - cli
  - first-run
  - size-M
milestone: m-12
dependencies: []
ordinal: 7500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The first run of a project that imports plugins is slow (ipod cold 75 s). Build the imported plugins concurrently with each other and the frontend, run a stale native program on the interpreter at once while its native build continues for the next run (hero), and remember a failed native build so a Mac without the Command Line Tools does not retry at every run. Aim: users see a window in seconds on a modest machine.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-774.16: a windowed `zinc run` whose native build fails (a Mac without the Command Line Tools) compiles and tries the C++ build at every run before interpreting: remember the failure beside the run cache and start from the cached ZBC.
- Build speed: build the plugins a project imports concurrently with each other and with the frontend (ipod cold 75 s toward ~30 s, sqlite3.c's 20 s the floor); the baked resources (~1.4 MB) in their own unit keyed by content, not in unit 0 (~1 s per rebuild).
- Build speed (owner's call, changes D43): run a stale native program on the interpreter at once while its native build continues in the background for the next run (hero edit-and-run ~1.5 s instead of 13-25 s).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a program with two native plugins builds them in parallel (cold build time of ipod measured before/after in docs/reports/zinc-next-perf.md)
- [x] #2 `zinc run` of a program with a stale native build opens at once on the interpreter and swaps to native on the next run
- [x] #3 a failed native build is remembered until the toolchain changes
- [x] #4 no D43 conflict: record the decision
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research (sonnet web search, 2026-11-08):
- Ninja/make `-l N` gate new jobs on the load average (a gate, not a cap); the make jobserver hands out N-1 tokens; Cargo's `jobserver` crate has no load gate and overcommits memory (https://thebrokenrail.com/2025/06/30/ninja-jobserver.html, https://discourse.nixos.org/t/rfc-global-jobserver-for-all-nix-builds/15923). Taken: one in-process slot budget (compileJobs) shared by every runCommands caller, plus a getloadavg gate at the physical core count; no jobserver.
- Expo fingerprint: a native rebuild only when the native hash changes, JS reloads at once (https://expo.dev/blog/fingerprint-your-native-runtime). Taken: interpret now, swap at the next process start (no state migration).
- Go build cache: temp file + rename, readers tolerate a missing entry (https://go.googlesource.com/go/+/go1.16/src/cmd/go/internal/cache/cache.go, https://golang.org/issue/40461). Taken: the builder writes app.new and renames; the failure file is written by rename too.
- flock per key, never pids in files; a detached builder in its own session, stdio to a log, its own timeout; a negative cache keyed by the toolchain identity, distinct not tried / building / ready / failed. All taken.

What was built:
- Plugins: the provider no longer builds a stale plugin inline during loadProgram; it starts it on a thread (PluginBatch in src/main.cpp) and the loader goes on parsing; loadChecked joins the batch before the type check, registers the libraries, then loads again (a plugin whose build failed reports its error). One process-wide `.build-lock` (BuildLockHeld) is taken once for the batch. tc::runCommands shares one slot budget (ZINC_JOBS / compileJobs) across threads and starts no new compiler while the load average is above the physical core count (the first job of a caller always starts, so nothing deadlocks). plugin_build: thread_local archiver/target, compilers() and haveCommand under a mutex; the parser's made-up names (setters, static blocks, String.raw) go through one locked keeper, since plugin specs parse on build threads.
- Run: a stale or missing native program starts a detached builder (double fork, setsid, nice 10, alarm 1800, log in the run cache's build.log, flock on build.lock so two runs never build twice) and interprets at once; the next run finds the native program. `--native` keeps the foreground build. A failed build writes `failed` (the toolchain key: CXX, zinc, c++ on PATH, xcode-select link, the CLT clang++ stamp) and later runs start from the cached bytecode without trying again until that key changes. Windows keeps the foreground build (no fork).

Proof (short runs, 2026-11-09):
- bgtest scratch project: first run interpreted at once (0.99 s) and the builder made app.new; the next run "native, cached build"; after an edit interpreted again and rebuilt in the background; with CXX=/usr/bin/false the failure was remembered and the next run started from the cached bytecode with no build; after unset CXX it rebuilt in the background and the next run was native.
- Cold plugin build of examples/ipod (fresh ZINC_HOME, ZINC_OFFLINE=1): before (develop binary, one after the other) 33.5 s (system 2.7, ipod 9.9, audio 5.6, svg 0.7, sqlite 12.6); after 18.0 s (ipod 13.9 and sqlite 13.6 overlapping), peak load 4.93. Indicative only: another tree was building. Real measurement to take on a quiet machine and log in zinc-next-perf.md (coordinator).
- hero headless smoke with cached plugins: runs, exit 0. tests/run --only build_progress (two threads, ZINC_JOBS=2, at most 2 at once) and --only parser pass.

Decision (D43 revised, for the coordinator to record): `zinc run` of a program whose native build is missing or stale interprets at once and builds the native program in the background for the next run; `--native` waits for the build; a failed build is remembered beside the run cache, keyed by the toolchain identity, and not tried again until that key changes. Why: the owner's call (window in seconds on a modest machine), D43's speed is kept from the second run on, and a process switch at the next start needs no state migration. Trade-off: a run whose sources changed but whose C++ key did not is interpreted once instead of native at once.

Later (backlog/later.md lines):
- ZN-1026: plugins join before the type check, so their build overlaps loading only, not lowering and the AOT emit; join just before the native link instead.
- ZN-1026: the baked resources (~1.4 MB) still sit in unit 0; their own unit keyed by content saves ~1 s per rebuild.
- ZN-1026: the background builder has no memory cap; sqlite3.c is the heaviest unit (watch it on the Pi and 8 GB Macs).
- ZN-1026: `zinc doctor` could show a remembered native build failure with the hint `xcode-select --install`.

Proposed tests (not run):
- tests/run --only run_background (new T1): background build, native next run, stale rebuild, remembered failure, new compiler; ~30-60 s, opens a 20-frame window per run (alone), <300 MB.
- tests/run --only run_cache and first_run (T1): the run cache and the first-run path still agree with the new background build; ~1 min each.
- tests/run --only plugin_build plugin_stamp (T0/T1): stamps and the build lock under the batch; seconds to a minute.
- Cold `examples/ipod` plugin build on a quiet machine, before/after (fresh ZINC_HOME): ~20-40 s, ~1.5 GB peak; numbers for zinc-next-perf.md.
<!-- SECTION:NOTES:END -->
