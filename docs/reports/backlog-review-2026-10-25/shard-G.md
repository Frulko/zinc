# Shard G: m-10 CLI and tooling, m-7, m-13, m-9, m-14, m-15 (32 tasks)

Counts: keep 15, review-close 8, done 4, done-partly 3, drop 1, split 1. Details in `shard-G.json`.

## Notable findings

- Done but left in Review: ZN-095 (web globals), ZN-099 (zrt adapters), ZN-102 (sqlite/wasm/ffi plugins). Their blocker, ZN-167 (closures to
  native exports), is Done; `tests/t1/native_plugins.sh` now runs wasm, socket, sqlite and process on the native plugins.
- Review tasks to close as done: ZN-113, 138, 162 and the five Atelier tasks ZN-728/732/733/734/736 (assignee `@parallel`, so
  `assigned: true`; the coordinator will not touch them). Only a person looking at a real window, the Pi run or the Finder action remain.
- ZN-774.20 (card shadows, PERF-04) is a duplicate of ZN-403/ZN-589, already Done (b2-rounded 40.7 -> 14.4 ms): mark done.
- ZN-610 (mqtt over TLS 1.3 hang) was most likely fixed by commit 6a6b23b6 (TLS 1.3 records behind a session ticket). Left: run it against a
  TLS 1.3-only broker and add the handshake-timeout test. `tests/t0/tls.sh` fails the HTTPS step on this machine (certificate verify), unrelated.
- ZN-376 is still a real bug: `function f(){}; f === f` prints false (checked), because every read of a function builds a new thunk.
- ZN-158/159/161 (typed arrays, BigInt, Object/Symbol/Reflect/Proxy/Intl): none exist in the typed engine (checked: Z0101 and Z0005).
  Typed arrays: keep. BigInt: drop (no user, QuickJS covers JS). ZN-161: split, drop Reflect and Proxy.
- ZN-143 (Atelier simulators/profiler): the device panel and LSP diagnostics exist, the profiler/flame graph and run-on-simulator do not.
- ZN-774 onboarding: 17 of 31 children Done; 14 open. 774.21-.31 are untouched ideas from the benchmark report; 774.29 (compiler to wasm)
  gates 774.30 (browser playground) and 774.31 (share link).

## The ten that matter most

1. ZN-376 function identity bug: language correctness, small, Mac.
2. ZN-158 typed arrays in the typed engine: unblocks binary data, Blob, fetch bodies.
3. ZN-774.23 first sketch that teaches by comments: the beginner path.
4. ZN-774.29 then .30 browser playground: biggest reach for education users.
5. ZN-774.26 lessons with checks (`zinc learn`).
6. ZN-774.21 llms.txt and ZN-774.22 Pagefind search: cheap site wins.
7. ZN-774.27 `zinc help <name>` and F1 offline help.
8. ZN-774.28 errors that teach (zinc explain entries with wrong programs).
9. ZN-143 Atelier profile view and simulator run.
10. ZN-610 TLS 1.3 verification and timeout test (small, closes a known failure).

## Surprises

The five Atelier Review tasks carry `@parallel` as assignee though they look finished. ZN-774.18 has all code done and only a timing run left.
