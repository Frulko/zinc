---
id: ZN-1130
title: Provide owned nonblocking filesystem locks
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-12 12:57'
labels:
  - filesystem
  - host
  - size-M
milestone: m-7
dependencies: []
ordinal: 17301
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks original ZN-1034 AC2: the shared persistent artwork cache must serialize cover read/publication and artwork mutation/invalidation across app instances. Public zinc:fs exports and native host have no exclusive file lock; mkdir succeeds on existing directories, compiler-only tc::FileLock is blocking, and system.instance.lock owns an unrelated app singleton socket/global descriptor. Provide the missing generic filesystem primitive rather than an app workaround. Minimal contract: tryLock(path): i32 returns a positive opaque owned token, zero only for contention, other errors throw; unlock(token): void refuses stale handles without touching replacement ownership. Native host dispatch and existing fs permission/scope policy are the shared boundary. Stable sibling lock files are never truncated/deleted by this provider. Read primary/source research .logs/research-filelock-o.txt. Owner RT/HAL/UI/main/gfx_host/hal_dispatch modules are reserved: no edits there. Existing teardown hook may be reused only with actual same-process restart proof; any real gap is reported rather than falsely claimed. No instance permission, plugin.call bypass, new service, SDK or OS setup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The public fs primitive acquires exclusively and nonblockingly on the development Mac on interpreter, actual native AOT and QuickJS; independent opens/processes contend, unlock/reacquire works, contention is distinct from filesystem errors, and existing filesystem callers remain coherent.
- [ ] #2 Opaque owned tokens reject stale/double release without releasing a newer acquisition, finally and process death release ownership, and same-process program teardown/restart closes held locks without token reuse; explicit lifecycle/RAII and thread safety are proven by a focused small regression.
- [x] #3 Permission and path validation precede creation, including denied paths, embedded NUL, directories and symlink boundaries; unsupported web/WASI/profile providers report unavailable rather than fake contention, all bindings and docs agree, and a focused T0 regression plus mapping accompanies the source with no owner-held edits.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-12 — Safe explicit-ownership increment, coordinator O decision. AC1 and AC3 pass; AC2 remains open. The public API is `tryLock(path): i32` (>0 thread-owned opaque token, 0 only contention, other errors throw) and `unlock(token): void` (EBADF for invalid/stale/double/other-thread release). Use `finally`. Stable regular sibling files are created without truncation or unlink. POSIX uses flock + O_CLOEXEC/O_NOFOLLOW/O_NONBLOCK; Windows uses noninheritable CreateFileW + LockFileEx, with reparse rejection. No dependency, instance singleton, socket service or permission bypass. Tokens are process-wide monotonic positive i32 values; exhaustion refuses rather than wrapping. TLS owns RAII OS entries, so other threads cannot release them and thread exit closes them.

The native host checks NUL, fs:write and picked-file scope before creation, resolves the existing parent and rechecks the canonical destination. POSIX backslashes remain ordinary filename characters. All 689 old runtime row numbers are preserved: two rows appended at the absolute tail, with system-tail routing. Frontend exports and module declarations agree. Web/browser WASM/WASI/console providers explicitly report ENOTSUP; the development bridge routes both locking and error retrieval to its native provider. The existing permission model is not a stronger sandbox against concurrent replacement of an ancestor directory. Cooperating clients must never replace/unlink their live lock file. Network filesystem behavior is unproven.

Research supplied by coordinator before implementation: Apple flock manual https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/flock.2.html ; Linux man-pages https://man7.org/linux/man-pages/man2/flock.2.html ; Microsoft LockFileEx https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-lockfileex . Platform locking fits exclusive cross-process ownership without another dependency. Compiler tc::FileLock is blocking and system.instance.lock is an unrelated one-global-fd app/socket lifecycle, so neither is reused.

**Remaining AC2, reproduced rather than hidden:** plain VM runModuleHooked and QuickJS run return without the legacy graphics finish callback; forced embedder quit also skips it. at_finish has 16 unchecked slots, so it is neither a complete nor reliable ownership boundary. No hook or startup-only cleanup workaround was added. An unclosed token survives program teardown on a reused thread. Explicit finally works; thread exit and process death release the OS lock. Completing AC2 needs a real program-owner begin/end boundary through shared VM/AOT runModuleHooked, QuickJS early-return paths, appStart/appFinish/forced quit and worker ownership; these owner-held modules were not edited. Next command after that implementation: adapt `.logs/1130/stage08-gap/fixture/harness.cpp` to expect a new positive acquisition after each completed run, including error/forced-quit paths. No task split and no false Done.

**Proofs** (all bounded, own worktree compiler):
- `.logs/1130/stage01-t0`: first native regression PASS; `.logs/1130/stage03-public-t0`: expanded native/WASI/public interpreter regression PASS; `.logs/1130/stage05-negative`: final `tests/run --only fs_lock` PASS. One focused T0 covers independent opens/inodes, distinct paths, stale/wrong-thread tokens, thread-exit RAII, process death, no truncation and token exhaustion. Its public fixture covers finally, canonical aliases, a legal backslash filename, ENOENT/NUL/directory/final-symlink errors, denied manifest/assets paths and canonical-parent escape before creation. Actual production web row/bridge snippets and browser WASM switch, actual WASI host with an asset-forwarding control, and actual console host with only unrelated HAL stubs prove ENOTSUP errors are observable.
- `.logs/1130/stage04-public-all3/results.json`: zinc check and the same public/trust program on interpreter, actual linked native AOT and QuickJS all PASS. Native app/key/inputs and executable alias retained in `native-cache`; no fallback.
- `.logs/1130/stage06-death/results.json`: each public engine acquires a real OS lock; another OS descriptor contends, SIGKILL of the holder then allows acquisition. Native holder app/key/inputs retained. All children reaped.
- `.logs/1130/stage08-gap`: actual linked harness drives picked-scope refusal, granted-directory success and a symlink-parent escape refusal without creation; VM programs run twice on one thread (token 2 then 0) and QuickJS programs run twice (3 then 0), preserving the known remaining gap. Stage07 failed only because the initial harness parsed VM output after run() flushed it; authentic logs/binary/source retained, then runHooked(outLive=false) corrected the harness in a new stage.
- `.logs/1130/compiler`: immutable CLI, all 69 recursively found archives/modules including SDL and the three optional engine modules, plus 5187 actual compiler dependency files. Stage-specific scripts/fixtures/diffs/source hashes and actual AOT apps retained. `.logs/1130/final-verification.json` confirms 16234 source files unchanged through final proof, all 69 compiler artifacts unchanged and frozen copies verified, all 5187 compiler inputs unchanged, all old 689 ABI rows preserved. `git diff --check` passes. No new host-source warnings. Build has 106 inherited warnings in unchanged V8 SDK, vendor, assets/agent sources and duplicate-library linkage; exact lines retained in inherited-warnings.txt. No warning-free whole-build claim.

No owner-held RT/HAL/UI/main/gfx_host/hal_dispatch or app source changed. No suite, T1/T2/demo/pixel/conformance/benchmark/fuzz/CI/device/network/audio/global install. No owned process remains. Usage: n/a.

**Proposed tests**
- After real run-owner hooks: rerun the retained same-process VM/QJS/native/embedder harness with successful post-teardown reacquisition, exception and forced-quit paths; about 10 s, memory unmeasured.
- On Windows hardware: public lock/unlock/contention/death/reparse/permission smoke against two processes; bounded 15 s, memory unmeasured. Implementation is present but Windows execution is unproven.
- On Pi/Linux/Mojave: the same bounded native desktop smoke and thread-exit check; about 10 s each, memory unmeasured. No hardware proof claimed.
- Selected browser export smoke for unavailable locks and native development-bridge errors; about 10 s, memory unmeasured. Current proof executes exact production snippets, not a full browser export.
<!-- SECTION:NOTES:END -->
