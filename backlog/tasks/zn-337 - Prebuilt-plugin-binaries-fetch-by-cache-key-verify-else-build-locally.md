---
id: ZN-337
title: 'Prebuilt plugin binaries: fetch by cache key, verify, else build locally'
status: Done
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-10-09 04:40'
labels:
  - distribution
  - security
  - size-M
milestone: m-19
dependencies:
  - ZN-332
  - ZN-336
ordinal: 55280
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Before compiling a plugin, zinc computes its cache key (src/tc/plugin_build.cpp) and asks the configured sources for `<target>/<name>-<key>.tar`: verified by sha256 and signature against the index, unpacked into the plugin cache; any failure falls back to the local build of today. Prebuilt binaries can be refused by policy (D-policy).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 hit: a published binary is used and nothing is compiled (a test counts compiler runs)
- [x] #2 miss or a tampered archive: the local build runs and the tampered file is reported
- [x] #3 the key of a plugin whose sources changed misses (no stale binary is ever used)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
buildPlugin asks the signed index (ZINC_INDEX_URL, trusted root ZINC_INDEX_ROOT or next/index/root.json, cache ~/.zinc/index) for binaries/<target>/<name>-<cache key>.tar before compiling (vendored C included); the TUF client checks signatures, length and SHA-256; zapp::untar (zapp.cpp moved into zn_tc, its ustar reader shared) unpacks plugin.dylib/.so, plugin.a, vendor.a into the cache entry with the digest file; plugin-build reports 'fetched'. A refused archive is printed and the plugin built here; a miss or no index is silent; ZINC_PREBUILT=0 turns it off. tests/t1/plugin_fetch.sh: hit = 'fetched' with 0 compiler runs (a counting zig wrapper) and the program runs on it; a tampered archive is reported and rebuilt; a changed plugin has another key and builds. zapp, fuse, installer_deb pass; tests/run --changed 55 pass (native_plugins skipped as before). The policy of D-policy is ZN-346. usage: n/a
<!-- SECTION:NOTES:END -->
