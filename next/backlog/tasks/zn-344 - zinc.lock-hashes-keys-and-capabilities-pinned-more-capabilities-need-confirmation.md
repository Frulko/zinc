---
id: ZN-344
title: >-
  zinc.lock: hashes, keys and capabilities pinned; more capabilities need
  confirmation
status: Done
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-10-09 05:24'
labels:
  - distribution
  - security
  - size-S
milestone: m-19
dependencies:
  - ZN-340
  - ZN-322
ordinal: 55350
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc.lock records for every plugin and template: version, source hash, artifact hashes per target, publisher key, tier and the capabilities (permissions of ZN-322) it requests. An update that asks for a capability the lock does not list stops for confirmation (`zinc add --accept`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a second machine installs exactly the locked bytes
- [x] #2 an update requesting a new capability is refused without confirmation and names the capability
- [x] #3 `zinc install --frozen` fails when zinc.json and zinc.lock disagree
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The lock moved from zinc.json 'lock' to zinc.lock ({format, plugins: {name: {source, commit|sha256, publicKey, tier, publisher, path, version, permissions, requested}}}); zinc.json gets 'dependencies' (name -> what zinc add was given); an old in-zinc.json lock is read and moved out at the next write. plugin.json 'permissions' (and 'version') are known keys: zinc add shows the capabilities, pins them; an update asking for one not pinned is refused naming it until zinc add --accept. zinc install --frozen refuses (and lists) a dependency not locked, a lock entry not a dependency, or a dependency asking for another source than the lock pinned; without --frozen a missing dependency is added. zinc trust works on zinc.lock. tests/t1/plugin_lock.sh (capabilities shown and pinned, second checkout same bytes, camera refused then --accept, two --frozen mismatches named, legacy lock read and migrated); plugin_add, plugin_sign, plugin_community, plugin_tiers, install_offline read zinc.lock now. Artifact hashes per target are pinned by the index and the transparency log (ZN-337, ZN-343), not copied into zinc.lock. tests/run --changed 52 pass. usage: n/a
<!-- SECTION:NOTES:END -->
