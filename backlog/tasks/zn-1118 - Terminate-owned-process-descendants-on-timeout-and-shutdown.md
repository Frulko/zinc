---
id: ZN-1118
title: Terminate owned process descendants on timeout and shutdown
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-10 04:14'
updated_date: '2026-11-10 04:48'
labels:
  - system
  - ui
  - size-M
milestone: m-10
dependencies: []
ordinal: 10399
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Atelier774.31 starts a bounded zinc run --interp capture, but native plugin compilation or the sketch itself may spawn descendants. Existing zinc:process kill(pid) and shutdown only terminate the direct child, leaving descendants after timeout/owner close. Root fix belongs to process provider, not shell/pkill app workaround. Read all callers/public contracts before choosing minimal owned-process group/session/job lifecycle. Preserve direct/unowned PID semantics or validate ownership rather than blindly using kill(-pid) on arbitrary IDs; prevent stale handles/group reuse, clean descendants even leader exits, reap children. POSIX spawn groups and Windows Job Objects are proven APIs; native Windows behavior not claimed without machine. Primary short lookup https://pubs.opengroup.org/onlinepubs/9799919799/functions/posix_spawnattr_setpgroup.html and https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects . Existing Share worker source/task774.31 holds App/main CLI helpers, only plugins/process provider/tests belong to this task. No main.cpp/runtime/HAL/libstdUi edits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Owned spawned process families are terminated/reaped on kill timeout and provider shutdown, preserving public contract and refusing stale or unrelated group targets; no app shell workaround
- [ ] #2 Small bounded exact T0 child/grandchild and lifecycle regressions pass on available host, original Atelier capture/close path cleans up; untested platforms explicitly recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope and choice: POSIX development-host fix in the existing process provider. zinc:process uses process.next.ts -> zinc:__proc -> src/host/loop.cpp on Next, so changing only the legacy native plugin would not fix Atelier. Read all process imports/callers, public spec/index/docs, legacy and Next providers, libuv child reaping, and the lifecycle audit. No app, CLI, AOT emitter, runtime, HAL or graphics-provider edits.

Research: POSIX_SPAWN_SETPGROUP with pgroup=0 creates a group named by the child PID (https://docs.oracle.com/cd/E36784_01/html/E36874/posix-spawn-3c.html ; local SDK spawn.h compiled). waitid(WNOWAIT) preserves the unreaped child until final cleanup. Vendored libuv unix/process.c reaps before the exit callback, so a kill(-pid) there could target a reused group. Reuse the legacy posix_spawn construction as a small shared include/zn/process_family.h helper; keep libuv pipes and SIGCHLD watching, without a polling timer or library patch. Microsoft documents Job inheritance and termination (https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects); assigning a Job after public uv_spawn returns races child execution, so Windows behavior remains unchanged until the native Windows pass.

Implementation: each POSIX spawn owns a new group. kill validates the unreaped child with waitid before signalling the group; if the leader moved groups, only its reserved PID is additionally signalled, never its new group. Leader exit kills remaining group members before waitpid reaps it, then output drains before one exit event. Shutdown kills/reaps children, closes all streams/watchers, drops queued process events and resets back-pressure. Direct zinc:sys PID signalling remains unchanged. Proc uses an explicit Starting/Running/Exited/Reported transition; stream-open flags are orthogonal resources. Legacy slots receive monotonic handles and reject stale handles even after all 32 slots cycle; Next retains its monotonic handle indices and refuses integer exhaustion.

Lifetime: normal POSIX process/worker-thread exit cleans through the TLS owner. Main-thread first spawn installs shutdownProcesses in the existing zrt::at_finish hook. The runtime finishers table persists across finish_run calls (runtime/zrt.cpp teardown does not clear nfinishers); install once, retain installation across manual shutdown and successive runs. Fast Refresh pause is not teardown and keeps its current VM/children. Nongraphical runs without finish_run use normal thread/process exit, not a claimed per-VM reload hook.

Proof on macOS arm64: tools/build zinc PASS; last incremental build warning-free for touched code (cold initial build also emitted existing external V8/assets/nanosvg warnings). ZINC_ROOT=$PWD build/zinc check examples/process/cli PASS; original process CLI interpreter smoke PASS (stdout/stderr/code, streaming/tail, UTF-8 stdin, cwd/env, TERM exit143, spawn failure and argument validation). Legacy native source fsyntax-only PASS. Exact tests/run --only process_family PASS with real runtime/zrt.cpp + HAL null and libuv; only unrelated HAR tick is stubbed. Bounded inactive helpers have eight-second alarms and T0 has timeout15: child+TERM-ignoring grandchild, independent group, kill9, leader-first exit23, stale/invalid handles, moved leader in the test's own group, direct/unrelated PID refusal, manual shutdown with live family, queue cleanup/idempotence, restart handles, two genuine finish_run calls, spawn failure, stolen reap and worker-thread exit. All direct children reaped, grandchildren gone; no process left running. No suite, stress/flood, window, fixed port or benchmark.

Final binary: build/zinc SHA256 7e7eed5ae92fad8a1e676c826c7ad94b65d51f7383f44496299e3067a9a4bc5f, base db3e5abd1. Exact T0 initially linked read-only common libzn_uv.a alongside binary SHA29ffb93a19627fb7dc465badc12c9c292ffaa55bf1db76d458b81837f4b48155; final T0 linked this tree's same vendored libuv build. Durable worker logs .logs/process1118/{build-final.log,t0-final.log,check.log,process-cli.log,legacy-compile.log,provenance.json}; provenance records source/test/log SHAs. Native provider is shared by interpreter/AOT/QuickJS; no executable TS wrapper or engine lowering changed.

Atelier original close proof (Share worker): original source in .worktrees/774.31 with provider binary1118 SHA4c36df091a45b50d0c18da457b05089685711d51e7b7bfd7631cbd239f7dcbcc and capture child Share binary802adfb89dee72af35f95548b82379e2dbec400d7d749ee96c076540ea654099. An active capture spawned Python and grandchild both ignoring TERM; scripted owner quit stopped/reaped PID97275/97276 (group97268), removed hidden staging and created no export. Evidence .worktrees/774.31/.logs/share774.31/{close-result.json,close-proof.log}. Final7e7 adds only the moved-leader PID fallback, independently covered by T0; final app close confirmation and deadline/restart evidence follow below.

Limits: process-group ownership is not a sandbox. Descendants which deliberately detach via setsid/setpgid escape the old group. Grandchildren are reaped by the OS after orphaning; only direct children can be waitpid-reaped by this provider. Windows and the removed Node simulator retain direct-child signals. No native Windows/Linux/Pi run is claimed; no device or quiet-machine measurement.

Cross-platform pass proposal: ZN-1118 Windows needs atomic Job Object assignment before child execution, then native child/grandchild/leader-exit/owner-close/restart checks when a Windows machine is available; preserve existing behavior until then. On native Linux/Pi, run tests/run --only process_family with a local libuv archive (about five seconds, expected below 250 MiB including compiler, unmeasured).

Proposed tests: original process CLI on AOT and QuickJS, same short contract smoke (roughly seconds, memory not measured); native Linux/Pi exact family T0 as above; owner-selected long repeated capture/close/reload and detached-descendant boundary checks, no suite run now.

usage: n/a

Final compatibility guard: preserved the existing working-directory and child-environment PATH contracts. Direct posix_spawn uses candidates resolved from the child's env PATH, following libuv's existing resolution, rather than libc posix_spawnp's parent PATH. On Apple, look up spawn's chdir action dynamically so the engine has no strong 10.15-only symbol. Only when cwd is requested and that action is missing, use the existing fork/exec design: all argv/env/PATH candidates, descriptors, fd limit and signal disposition prepared before fork; the child uses only setpgid/chdir/sigaction/dup2/close/execve/write/_exit. An exec-error pipe preserves synchronous spawn errors and reaps failures. No shell, no libuv patch, no process registry beyond the existing owner. ZN_APP_LIBRARY excludes the forbidden mobile fork fallback. Legacy provider selects the established ZRT_HOSTED_CPP include mode because PATH preparation uses std types.

Additional exact proof: directly executed the Mojave fallback on the development Mac, including a tool name found ONLY through the child env PATH override, argv, env override, cwd /tmp, code7, missing cwd and missing command ENOENT, direct-child reaping. The normal spawn path has the same overridden-PATH test. Native Mojave itself was not executed, and no cross-platform run is claimed. Final build/zinc SHA256 f2099e0befe594f7140d2183746de3d8cd206f9a3ea3c95bd40472c95dcacff9; last incremental tools/build zinc warning-free; nm -u shows no strong posix_spawn_file_actions_addchdir_np dependency. Exact family T0 PASS; legacy syntax check PASS without any external hosted macro. Final source/log SHA inventory is .logs/process1118/provenance.json.

Atelier deadline and restart proof (Share worker, original app source): final-at-that-time provider SHA7e7eed5ae92fad8a1e676c826c7ad94b65d51f7383f44496299e3067a9a4bc5f was already installed before the queued proof started (binary birth05:32:51.777, first marker05:33:44.109, second05:34:15.641). Deadline30s -> app restart capture -> quit PASS; family groups1333 and2163, descendant pairs1334/1340 and2165/2166 all reaped, staging absent. The timeout UI capture is timeout-ui-1850.png. Separate close7e7 PASS: capture group6006 with descendants6009/6010 gone, staging removed and no export. Evidence .worktrees/774.31/.logs/share774.31/{timeout-result.json,timeout-proof.log,close-result.json,close-proof-final.log}; Share archives these in root .logs/share-774.31-20261110. This supersedes the initial static 4c36 label for the deadline proof; 4c36 remains the earlier close proof only. The last f209 compatibility changes preserve the normal family lifecycle; one short final close on f209 follows, no extra deadline run.

Proposed tests: native Mojave exact family/fallback T0 and original cwd/env capture when available; native Linux/Pi exact T0; native Windows atomic Job assignment and equivalent child/grandchild cases when the platform pass opens. No Windows behavior was changed or claimed. Existing longer AOT/QuickJS/app-churn proposals remain owner-picked.

Final acceptance: original Atelier close on final provider f2099e0befe594f7140d2183746de3d8cd206f9a3ea3c95bd40472c95dcacff9 PASS; SHA read immediately before launching. Capture group52953, Python leader52954 and grandchild52955 all absent after scripted quit; no export and no staging. Authoritative final close result is .worktrees/774.31/.logs/share774.31/close-result.json with close-proof-f209.log; this current JSON supersedes earlier close-result contents. Deadline30s/restart proof remains on7e7 as recorded above, same family cleanup path. Share copies durable evidence to root .logs/share-774.31-20261110. No own process remains. Original process CLI interpreter smoke rerun with f209 PASS, all eight contracts. No additional Share timeout run, suite, benchmark or cross-platform run.

Both acceptance criteria are satisfied for the available POSIX development-host scope confirmed by the coordinator. Windows direct-child behavior is unchanged and explicitly outside the family guarantee; native Windows Job-before-execution remains a Cross-platform pass proposal. Native Mojave fallback code has direct host coverage but no Mojave-machine execution; native Linux/Pi likewise unclaimed. AOT/QuickJS use this same host provider, with no executable wrapper change; their extra CLI smoke is proposed rather than falsely claimed.

Proposed tests: native Mojave exact process_family T0 and original cwd/env capture; Linux/Pi local exact T0 (seconds, compiler memory expected under250MiB, not measured); original process CLI on AOT/QuickJS; Windows atomic Job assignment and native lifecycle proof when that platform pass opens. Long app/reload churn remains owner-picked. usage: n/a
<!-- SECTION:NOTES:END -->

REOPENED after the actual combined binary: capture child Zinc itself now uses1118 and creates a separate owned Python subgroup; killing the outer capture group leaves Python+grandchild alive. Prior mixed-binary proof used a capture child without1118, which inherited the outer group and falsely covered only that easier case. Repro .logs/blockers/process-nested-groups/rebased-close.py/.log, full durable .logs/share-774.31-20261110. Test processes cleaned manually after observation, none left. Own automatically nested Zinc groups are not intentional user detachment and must be covered. New proof must use the same final binary for parent/capture child and nested normal zinc:process spawn, plus no-kill-independent-group and PID reuse safety. Preserve existing platform bounds; no shell/app workaround.
