---
id: ZN-434
title: Asset build graph and content-addressed cache
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:35'
updated_date: '2026-10-11 11:06'
labels:
  - games
  - assets
  - size-L
milestone: m-22
dependencies:
  - ZN-433
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/res grows into src/assets: rules, importer registry, built-in importers (copy; PNG/JPEG/WebP/SVG to premultiplied RGBA8/RGB565/RGBA4444; the font baker), groups to packs, report.json and `zinc assets build`. run, pack, build and export call it. Includes the importer decision record (pinned tools as subprocesses, script importers in Zinc). Report: docs/reports/games/toolchain-assets-loading.md (4.1, 4.9, 9).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a second build of an unchanged project runs no importer (under 50 ms for game-2d)
- [x] #2 changing one image re-imports only that image
- [x] #3 packs are identical across two directories and two ZINC_HOMEs
- [x] #4 the report lists every asset with source bytes, output bytes and time
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done in a parallel worktree (agent), 2026-10-11.

What landed:
- `src/assets` (zn_assets, CLI only): rules (globs `*`, `?`, `**`, `{a,b}`; built-in rules images to `image`, the rest to `copy`; later rules override), the importer registry (`copy` v1, `image` v1: PNG/JPEG/WebP/BMP/GIF through the baker's decoders, SVG through its rasterizer, premultiplied RGBA8 / RGB565 / RGBA4444 after a 16-byte `ZIM1` header), the content-addressed cache (`~/.zinc/cache/assets/<2 hex>/<XXH3-128 key>`, written aside and renamed, LRU trim to 2 GiB or `ZINC_ASSET_CACHE_MB`, `ZINC_NO_CACHE`), groups to ZPK packs (`<group>.zpk`, unmatched assets in `default`; a pack is rewritten only when its key changed, `.packs`; packs of vanished groups removed), `report.json` (per asset: name, importer, group, sourceBytes, outputBytes, ms, cached; per pack; totals).
- The font baker behind the same cache: `zn::assets::bake` keys on the sources, the options, the engine build and the names and bytes of every file of lib/fonts and assets/ the baker reads (`res::bakerReads`); `bakeResources` (run, pack, build, export, bake) calls it.
- `zinc assets build [dir] [--target T] [--release]` (help row); `zinc pack` and `zinc build` run the dev asset build for their machine or `--target`, `zinc export` the release one for its target. `zinc run` uses the cached baker only: it writes no packs until ZN-436 reads them.
- xxHash 0.8.4 vendored (header only, BSD-2, tag archive sha256 5738270935e7c3d38a79b3adf7c9692566ce7895a25f67de43ad52ab504acd32, released 2026-09-19), third_party/README row.
- Docs: docs/reports/zinc-next-assets.md (module page, image layout, cache, report), ARCHITECTURE.md layout line.

Decision for the coordinator to record (no number taken here): how importers run, from report games/toolchain-assets-loading.md section 9, scored with RULES 4 (fit x3, perf x3, size x2, maintainability x2, licence x2, portability x1, effort x1): pinned upstream command-line tools run as subprocesses for codecs plus Zinc `script` importers for data formats 5,4,5,5,5,4,5 = 66; in-process importers behind a C table in a shared library 4,5,3,3,5,4,2 = 55; everything as Zinc scripts 2,1,5,4,5,5,3 = 45. Chosen: subprocess tools and script importers (crash isolation, parallel by process, no glue against changing library APIs); the three built-in importers (copy, image, the font baker) stay in-process in the CLI since they reuse code zinc already links. Revisit if spawning shows against many small imports.

Choices made inside the task (reversible):
- Keys: XXH3-128 over parts each hashed on its own (no length-prefix bugs), parts = importer id and version, the engine build, the options after defaults, the source bytes; no path, so two checkouts and two names share an artifact. The engine build is its executable's mtime and size, as the zbc and run caches already use: a rebuilt engine re-imports, so a changed importer never meets a stale artifact.
- Artifacts are stored by their input key; no second content-hash level and no per-project stat index (build/.zinc-assets in the report): every source is read and hashed each build (100 MB: 117 ms), an artifact found in the cache is only read when its pack must be written.
- The font baker is not part of `zinc assets build` (its inputs are the program's sources, which only a compile knows); its blob is not a pack entry yet (ZN-436 decides how the runtime gets fonts from packs).
- Rules and groups come from `Options` only; parsing `zinc.json` assets.rules/groups/profiles is ZN-435. Profiles: dev stores entries, release zstd 19.
- SVG default scale 2 (as the baker on desktop), at most 1024 px wide; a raster image's scale from its `@Nx` name.

Tests (all PASS): tests/t0/assets.sh (new: assets_test unit checks for rules, groups, the three layouts with exact pixel values, cache hits, a lone re-import, release packs, an emptied cache, stale packs, an unknown importer and a bad image; then on the game-2d template: second build imports 0, one changed SVG imports 1, report rows for every asset, packs byte-identical from two directories with two ZINC_HOMEs in dev and release, and `zinc bake` reuses its blob byte for byte), plus res, res_jpeg, res_subset, zapp, fuse, cli_core, run_cache, zbc_cache, aot_assets, sbom.

Measured (macOS x86_64 i7-9750H, load 2.5 to 3.3 with another agent building): game-2d first `zinc assets build` 13.5 ms; second build 9.5 ms median of 21 for the whole command (1 ms inside the build; AC1: under 50 ms); first release build 20.5 ms; game-2d plus 100 MB of data: first build 1.45 s, second 117 ms (1.5 s before artifacts were read lazily); `zinc bake` of game-2d with compile 50.5 ms from the cache against 76.3 ms baked.

Lines for later.md (not written here):
- ZN-434: importers in parallel (ZINC_ASSET_JOBS) when a first build of many images measurably waits on one core.
- ZN-434: a stat index of the sources (size, mtime) when reading and hashing every source shows in second builds (100 MB: 117 ms today).
- ZN-434: importer versions instead of the engine's executable stamp in the asset keys once the importers settle, so CI shares ~/.zinc/cache/assets across engine builds and `zinc assets verify` can compare.
- ZN-434: key the font baker on its scan's result (sizes, characters, faces) instead of the source texts, so an edit that adds no size or character reuses the blob in `zinc dev`.
- ZN-434: zpk::write taking entries already compressed, so a release pack with one changed entry recompresses that entry only.
- Cross-platform pass: ZN-434 tests/t0/assets.sh on Linux x86_64 and arm64, and zn_assets (xxhash.h) under the zig cross builds.
<!-- SECTION:NOTES:END -->
