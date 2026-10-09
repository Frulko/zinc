---
id: ZN-333
title: Reproducible builds of zinc and of plugins (byte-identical artifacts)
status: Done
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-10-09 04:10'
labels:
  - distribution
  - security
  - ci
  - size-M
milestone: m-19
dependencies:
  - ZN-332
ordinal: 55240
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rebuilders (D-rebuilders) and content-addressed caches need byte-identical outputs: SOURCE_DATE_EPOCH, -ffile-prefix-map / -fdebug-prefix-map, deterministic `ar` (zig ar D), sorted inputs, no build paths or timestamps in archives (tar --mtime, --sort=name, numeric owners).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 two builds of zinc and of three plugins in different directories and at different times are byte-identical (a CI job diffs them)
- [x] #2 the plugin archive (.tar) of D-binary-cache is byte-identical across two machines of the same target
- [x] #3 docs/reports/zinc-next-reproducible.md lists the flags and what breaks reproducibility
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
zinc: -ffile-prefix-map on every target (checkout -> zinc, build dir -> build; the checkout without '..', compared as text), -DZN_REPRODUCIBLE=ON drops the compiled-in checkout path (ZINC_ROOT or the package), ZN_HOST_LIBS and ZN_SDL_INCLUDE written with @bin@ / @root@ and filled at run time. Two clean Release builds of HEAD in two worktrees, built minutes apart: zinc and libzn_webgl.dylib identical (before: 349 bytes differed, 13 paths). Plugins (zig): prefix maps for the plugin, cache, checkout and toolchains; macOS link -install_name @rpath/plugin.dylib and -Wl,-S (OSO stabs named objects and mtimes); Linux: ZIG_LIB_DIR through /tmp/zinc-zig-<version>-lib (zig's static libc++ carried ZINC_HOME paths). zinc plugin-build --pack <tar>: deterministic ustar of <target>/plugin.*, vendor.a, key. Measured: device, svg, sqlite identical from two dirs and two homes on the Mac (tests/t1/plugin_repro.sh) and from two fresh arm64 ubuntu containers with the repo at /src and /mnt/other/zinc and two homes. CI job 'reproducible' (macos-14) builds twice and diffs zinc, libzn_webgl and the three plugin archives. Report docs/reports/zinc-next-reproducible.md. tests/run --changed 53 pass. usage: n/a
<!-- SECTION:NOTES:END -->
