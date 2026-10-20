---
id: ZN-617
title: >-
  Plugin cache check at start without pkg-config processes (zinc:video 34 ms per
  start)
status: Done
assignee: []
created_date: '2026-10-10 11:22'
updated_date: '2026-10-10 16:29'
labels:
  - perf
milestone: m-21
dependencies:
  - ZN-615
ordinal: 376270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From ZN-615: with the library loaded at the first call, a start still pays buildPlugin's cache check for every plugin the program imports: zinc:video 34-39 ms, lottie 9 ms (hero, Intel Mac, zinc -v). For video, buildPlugin spawns sh with pkg-config --exists, --cflags and --libs (about 20 ms) and regenerates the spec's header and thunk (frontend::generateNative) to compute the key. Cache the pkg-config answer and the generated code per plugin directory, keyed by the spec's content and the mtimes of the .pc files pkg-config used, and measure hero's start (10 starts, before and after).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 hero's cached interpreted start no longer runs pkg-config when nothing changed
- [x] #2 a changed .pc file or spec still rebuilds the plugin (test)
- [x] #3 start time measured before and after in docs/reports/zinc-next-perf.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10 (usage: n/a, session total).
- Measured first (hero, interpreted, Intel Mac under load): video 275-324 ms per start, lottie 64-80 ms; stages: pkg-config ~80 ms (video), key hashing 5-8 ms, digest of the built libraries 10-15 ms, compilers() ~2 ms.
- src/tc/plugin_build.cpp: buildPlugin = a stamp in ~/.zinc/cache/<target>/plugin-stamps/<name>-<hash> (hash of the plugin directory, target, defines incl. zinc.json options, compiler choice, CXX/CC and PKG_CONFIG_* environment) holding the module, flags, key, link arguments, the libraries with inode/size/ctime, and the inputs with inode/size/mtime (native dir and its files, manifest sources and their directories, plugin.json, the .pc files of the packages and of what they require (one sh at build time), the ABI headers, zinc itself); a valid stamp returns without pkg-config, generateNative, hashing or digest; otherwise buildPluginSlow (the former function) runs and writes the stamp. buildDefines / systemCompiler shared by both. ZINC_PLUGIN_NO_STAMP=1 ignores stamps. docs/plugins.md.
- AC1: tests/t1/plugin_stamp.sh (a pkg-config shim logs calls): the second start runs no pkg-config and logs 'unchanged since its last build'; hero: video 0.28 ms, lottie 0.3 ms.
- AC2: same test: a changed .pc file reruns pkg-config and rebuilds (value 42 -> 100), a changed spec does not take the stamp, a changed source rebuilds (150).
- AC3: hero start 214-226 -> 173-201 ms median (10 starts, load 8-10), docs/reports/zinc-next-perf.md.
- Found on the way: (1) tests/t0/plugin_manifest.sh and tests/data/plugins-table.txt still expected the 3d plugin before ZN-563's renderer option and description (the prototype prints the new table too): updated. (2) The AOT precompiled header's key hashed header contents but clang checks their mtimes: a header edited and restored broke AOT builds ('has been modified since the precompiled header was built'): the key now has the mtimes (src/main.cpp). plugin_build, plugin_key (stamps moved out of the plugins directory; directories are inputs, so an added file is seen), native_plugins, plugin_prebuilt, plugin_repro, plugin_fetch, plugin_tiers, native_lazy, plugin_manifest, aot pass.
<!-- SECTION:NOTES:END -->
