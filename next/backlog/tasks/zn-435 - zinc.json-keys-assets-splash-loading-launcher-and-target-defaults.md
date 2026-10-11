---
id: ZN-435
title: 'zinc.json keys assets, splash, loading, launcher and target defaults'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:36'
updated_date: '2026-10-11 11:29'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-434
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Parse and validate assets (object form: dir, rules, groups, profiles, budgets), splash, loading, launcher and targets.<id>.assets. Add an assets entry per target in targets/capabilities.json (formats, max size, POT, codecs, pack codec, budgets). Report: docs/reports/games/toolchain-assets-loading.md (3, 10).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 parseProject tests cover each key and each error
- [x] #2 zinc assets info prints the effective profile per target
- [x] #3 projects without the keys produce byte-identical outputs to before
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-11 (agent worktree, Intel Mac, load 2.7 to 4.4: another agent building).

What landed:
- `src/frontend/project.{h,cpp}`: `Project::assets` (dir, rules with their importer options, groups with include/exclude/priority in manifest order, profiles, budgets in bytes), `splash` (also `targets.<id>.splash`), `loading`, `launcher`, `targets.<id>.assets` (`profile` + inline profile keys). Every malformed key is fatal with its line (the `app` convention); unknown keys inside the new objects are warnings. `assetProfiles()` merges per target: the default of targets/capabilities.json, the named profile, the target's own keys; budgets the default's then `assets.budgets.<id>`, key by key. `parseByteSize`/`byteSize` (B, KB, MB, GB, 1024-based).
- `targets/capabilities.json`: an `assets` group per target (texture formats in preference order, maxSize, pot, audio, sfx, pack, split, budgets), from sections 3 and 6.6 of the report.
- `zinc assets info [dir] [--target T]`: one line per target with the profile in force and the budgets. `zinc assets build` (and pack, build, export through buildAssets) now reads zinc.json: `assets.dir`, `rules`, `groups` (with `exclude`, new in src/assets); a malformed key stops it with exit 2.
- Docs: docs/reports/zinc-next-assets.md (zinc.json section), docs/targets/capabilities.md, docs/guide/01-getting-started.md.

Tests (real output):
- AC1: `tests/run --only project_assets` PASS: `build/project_test` checks the report's §10 example field by field, the string forms and defaults, warnings for unknown keys in each object, 52 error cases (each fatal, with its line), sizes, the merge order, bad capability entries, and that every shipped target default is complete and valid.
- AC2: same test, `zinc assets info` lines checked for macos (named profile + inline key + project budget), rpi1, esp32, wasm (`--target`), an unknown target refused (exit 2).
- AC3: the same test builds a project without keys, with `"assets": "assets"`, with `{"dir": "assets"}` and with only splash/loading/launcher: identical packs, dev and release. One-off proof against the engine before this change (main's build of a0fba4d0): game-2d, hero, pocket-hero, museum-table, webgl-cube, flipctl give byte-identical packs (dev and release, 31 KB to 76 MB), and `zinc run` of game-2d, hero, pocket-hero, breakout (headless, deterministic, 3 frames) the same output and the same frame PNG. All 66 zinc.json of examples/, next/app and apps/ still parse (no fatal error).
- Also PASS: assets, project, ui_layout_option, permissions, cli_core, requires, system_manifest.

Decisions (no record number: worktree rule):
- The parsed keys live in frontend/project.h like every zinc.json key; src/assets keeps its own Rule/Group (no frontend dependency), the CLI maps them.
- A profile is a string map (the report's keys), validated against closed lists of format and codec names (the report's §3 tables; a name joins with its encoder), so a typo fails at once instead of when ZN-439 encodes. Budget keys are a closed set too (an unchecked misspelt budget would pass silently).
- The build takes dir, rules and groups now; the profiles are parsed, merged and shown but do not drive the build yet (dev stores, release zstd), so projects without the keys keep their exact packs (AC3); the encoders and the per-target pack codec come with ZN-439/ZN-436.
- `assets.dir` may point outside the project (shared assets in a monorepo, as the prototype allows).
- Starting values I estimated (the report has none): rmpp (rgba8, 4096, zstd, ram 256MB, boot 16MB), ps1 (clut8|clut4|rgba5551, 256, vag, lz4, ram/gpu 1MB, boot 256KB), ps2 (clut8|clut4|rgba5551|rgba8, 1024, pot, vag, lz4, ram 24MB, gpu 4MB, boot 2MB), sim (rgba8, pcm, none, no budgets).

Lines for later.md:
- `assets.dir` is read by `zinc assets build/info` only: the baker (bakeResources), the assets/ copy of `zinc export` and zinc:assets still use assets/ beside the entry; make them follow zinc.json assets.dir.
- Wire the effective profile's `pack` codec into release packs (lz4 on rpi1/esp32/ps1/ps2, none on wasm) with ZN-436/ZN-439.
- Cross-platform pass: check the asset defaults of targets/capabilities.json on the devices (rmpp, ps1, ps2 estimates; Pi and ESP32 budgets).
- The prototype's zinc:platform now also exports `ASSETS: boolean = false` from the new group (as it does `UI`); compiler/src/capabilities.ts could skip object groups.
<!-- SECTION:NOTES:END -->
