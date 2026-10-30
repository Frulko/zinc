---
id: ZN-885
title: 'examples/discord: cut the memory footprint'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 21:05'
labels:
  - perf
  - size-M
milestone: m-28
dependencies: []
ordinal: 579460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner measured 351 MB in Activity Monitor's Memory column (physical footprint; Real Mem 45 MB) for the Discord client after a call. DiscordLite's spirit is low RAM. Measure what holds the footprint (tools/window-memory, footmem/vmmap/heap: READY JSON kept, decoded images and their sizes, glyph atlases, GPU textures, audio buffers, plugin allocations), fix the biggest holders in the engine or the app, and log before/after in the task notes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A breakdown of the footprint by holder, measured, in the task notes
- [x] #2 The biggest holders cut; footprint after login + a channel + a call measured before and after
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured on the M1 Pro, windowed (ZINC_BACKGROUND=1), the app against examples/discord/tests/fake-discord.ts, physical footprint (`footprint`, Activity Monitor's Memory) of the cached run (second launch). FAKE_GUILDS=100 (a new knob of the fake) sends a 3.5 MB READY of 102 servers, as a real account's.

Breakdown before (develop, 100 servers, 204-233 MB):
- mimalloc (vmmap names its tag-100 arena "IOAccelerator"): 82-90 MB dirty, of which 4.3 MB live objects (mi_heap_visit_blocks). The rest is the READY's parsed `any` tree, freed but kept: mimalloc purges only inside later allocations, and on macOS its MADV_DONTNEED leaves the pages in the footprint.
- libmalloc (MALLOC_SMALL/MEDIUM/TINY/NANO): 76 MB dirty, about 36 MB live: the baked fonts and images three times (resources.bin read, 8 MB; its copy in main.cpp's blob, 7 MB; installResources' 7.9 MB), 1223 dense vtables of all 830 selectors (8.1 MB), the last host-call answer (the 3.5 MB READY string in sys_host.cpp gOut), the object registry's 2 MB peak; the rest freed but kept.
- The window: 2 to 3 CAMetalLayer drawables (IOSurface, 14.8 MB each at 1200x760 @2x) and the raster's shared MTLBuffer frame (14.6 MB): 42-57 MB, set by the window's size.
- The interpreter's stack (20 MB mmap, touched part only), zrt's TLSF heap (512 MB virtual, 11 MB touched in a call), 7 raster band threads (0.5 MB stacks).

Fixes, all in the engine (the app is unchanged): src/host/loop.cpp trims every 2 s and before a sleep of 100 ms or more (mi_collect(true) and malloc_zone_pressure_relief, 0.1 to 0.5 ms); mimalloc patched with upstream's macOS decommit (MADV_FREE_REUSABLE / MADV_FREE_REUSE); main.cpp moves the cached resources and frees the blob once installed; a class's vtable spans only its own selectors (vbase); sys_host ret() drops a large answer buffer; the object registry shrinks after a burst.

After / before (cached run, MB): login 84 / 106; 100 servers 93 / 204 (peak 165 while READY is handled); voice call 98 / 120. tests/data/heap_trim.ts (27 MB of JSON parsed and dropped): 8.5 / 222. Tests: heap_trim (new), discord, discord_voice (hashes unchanged), class_runtime, allocations, aot pass.

Left: the window's three full-size buffers (about 45 MB at this size, more on a large window) are now the biggest holder; the 618 Mach ports were not reproduced (the fake session is small); Linux has no trim yet (glibc malloc_trim).
<!-- SECTION:NOTES:END -->
