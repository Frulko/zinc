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
- [ ] #1 The public fs primitive acquires exclusively and nonblockingly on the development Mac on interpreter, actual native AOT and QuickJS; independent opens/processes contend, unlock/reacquire works, contention is distinct from filesystem errors, and existing filesystem callers remain coherent.
- [ ] #2 Opaque owned tokens reject stale/double release without releasing a newer acquisition, finally and process death release ownership, and same-process program teardown/restart closes held locks without token reuse; explicit lifecycle/RAII and thread safety are proven by a focused small regression.
- [ ] #3 Permission and path validation precede creation, including denied paths, embedded NUL, directories and symlink boundaries; unsupported web/WASI/profile providers report unavailable rather than fake contention, all bindings and docs agree, and a focused T0 regression plus mapping accompanies the source with no owner-held edits.
<!-- AC:END -->
