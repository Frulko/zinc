---
id: ZN-345
title: Revocation of versions and keys
status: Done
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-10-09 05:33'
labels:
  - distribution
  - security
  - size-S
milestone: m-19
dependencies:
  - ZN-336
  - ZN-344
ordinal: 55360
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The index can revoke a version or a publisher key; zinc refuses to install it and warns at `zinc run` / `zinc install` when a revoked item is already installed or locked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a revoked version is refused at install
- [x] #2 an installed revoked version prints a warning naming the reason and the replacement
- [x] #3 a revoked key invalidates every artifact it signed that has no other valid signature
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The index's revocations.json (only from the top-level role): versions {plugin + version | sha256 | commit, reason, replacement} and keys {publicKey, reason}. openIndex reads it after refresh, keeps a copy in ~/.zinc/index/revocations.json and revokes the keys in the TUF client (their signatures no longer count: a role or archive only they signed falls below its threshold). zinc add and zinc install refuse a revoked version or key with the reason and the replacement; zinc run/build/check (loadChecked) warn for zinc.lock entries from the cached copy, offline. tests/t1/revocation.sh: install refused naming reason and replacement, run warns and still runs, add refused, acme's plugin unreachable once its key is revoked. Found on the way: a relative entry (zinc run main.ts) never read the project's plugins/ (fixed, regression check in plugin_add); tests/t0/tc.sh expected the old refusal message of ZN-339.01 (fixed). T0 80/80, tests/run --changed 63 pass. usage: n/a
<!-- SECTION:NOTES:END -->
