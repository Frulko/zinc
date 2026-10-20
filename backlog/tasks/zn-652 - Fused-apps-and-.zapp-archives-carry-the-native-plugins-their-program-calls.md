---
id: ZN-652
title: Fused apps and .zapp archives carry the native plugins their program calls
status: Done
assignee: []
created_date: '2026-10-10 17:57'
updated_date: '2026-10-11 08:28'
labels:
  - packaging
  - plugins
  - size-M
milestone: m-19
dependencies: []
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-390: a game packed normally (zinc pack, zinc fuse) builds or fetches its native plugin where it starts: 50 s and a toolchain download in an empty HOME, so tests/t0/fuse.sh packs game-2d with ZINC_DETERMINISTIC=1 to bind the Zinc stand-in instead. A packed app must hold the built plugin libraries for its target.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc fuse of templates/game-2d packed normally plays in an empty HOME with no download and no build
- [x] #2 fuse.sh drops its ZINC_DETERMINISTIC=1
- [x] #3 the archive lists the plugin libraries and their hashes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-11). zinc pack puts the library of each native plugin the program calls (built for this machine, from the plugin cache) and its exports file in native/<target>-<arch>/<plugin>/ (e.g. native/macos-x86_64/audio/plugin.dylib), listed with their SHA-256 in manifest.json like every member. At run time the native provider of a fused executable looks there first (src/main.cpp packedPlugin: the exports registered for a load at the first call, as for a built plugin; a library that does not load falls back to the build). Trust: only a fused executable takes the packed libraries, being native code itself; zinc run app.zapp keeps building plugins from the engine's sources, so running a .zapp does not run native code it carries (docs/zapp.md). AC1/AC2: tests/t0/fuse.sh packs game-2d normally (env -u ZINC_DETERMINISTIC: tests/run sets it, which binds the stand-in), checks the archive lists native/.../audio with its hash, and the fused game in an empty HOME draws zinc run's frame with only cache/zapp written in that HOME (no toolchain, no plugin build; ZINC_LOG=plugin=info says 'audio: the app's packed library'). AC3: the manifest lists the library with its SHA-256 (checked in fuse.sh). Tests: fuse, zapp, app_update, app_update_api, update_sign pass. usage: n/a
<!-- SECTION:NOTES:END -->
