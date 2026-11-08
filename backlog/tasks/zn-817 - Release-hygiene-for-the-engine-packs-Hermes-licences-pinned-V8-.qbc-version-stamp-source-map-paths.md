---
id: ZN-817
title: >-
  Release hygiene for the engine packs (Hermes licences, pinned V8, .qbc version
  stamp, source-map paths)
status: Done
assignee: []
created_date: '2026-10-24 23:56'
updated_date: '2026-11-08 21:52'
labels:
  - size-S
milestone: m-14
dependencies: []
ordinal: 3300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Drop criterion 1 (done, tools/hermes-pack:30). Keep V8 pin, .qbc stamp (src/qjs/bundle.cpp), source-map sources embedded.

From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-773.07: Hermes pack: add the licences of libhermesvm's vendored parts (llvh, dtoa, zip...) to the pack before publishing one.
- ZN-773.04: tools/v8-pack takes Homebrew's newest V8 at each release: pin the version (and bump it on purpose) so a new V8 major cannot break the Node-API patch during a release.
- ZN-773.09: stamp zinc's version into the .qbc: a zinc update that changes QuickJS without bumping BC_VERSION would still load an old .qbc.
- ZN-773.09: source maps of a build hold relative paths: a moved build or app resolves ../main.js against its new place; embed the sources or absolute paths at export.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hermes pack carries the licences of libhermesvm vendored parts
- [x] #2 tools/v8-pack pins the V8 version
- [x] #3 .qbc is stamped with the zinc version and a mismatch recompiles
- [x] #4 Source maps of a moved build resolve (sources embedded or absolute)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: rewrite. Hermes licences already in tools/hermes-pack LICENSES (llvh, dtoa, zip); left: pin V8 in tools/v8-pack, stamp zinc version in .qbc, source-map paths.

Web search (2026-11-08, sonnet): QuickJS JS_ReadObject checks only its BC_VERSION byte; V8 code caches carry version/flag/source hashes and the caller recompiles on reject (https://chromium.googlesource.com/v8/v8/+/5e2fda250c8648be4f4d9e64c0220c726aec3f90/src/snapshot/code-serializer.cc). Source maps: relative `sources` resolve against the map URL + sourceRoot; embed sourcesContent, avoid absolute build-machine paths. Homebrew: versioned formulae are not for pinning; pin by bottle sha (ghcr blob address) or brew extract (https://docs.brew.sh/Versions).

Done:
- AC1 Hermes licences: already in tools/hermes-pack (LICENSE.llvh, dtoa, zip...), per the review.
- AC2 tools/v8-pack: PIN = 15.6.75.19 (the V8 the Node-API layer was built against, ~/.zinc/sdk/v8/current), bottles of homebrew-core 679b40815659 (golden_gate, tahoe, sequoia) fetched by their ghcr blob address and sha-checked. Homebrew's formula is already at 15.8.62.9: unpinned, the next release would have taken it. `--latest` takes the newest and prints the PIN line to paste after it passes. Proof: a fresh pack into a scratch dir downloaded the pinned sequoia bottle (sha ok); the default run kept ~/.zinc/sdk/v8/15.6.75.19.
- AC3 .qbc stamp: the file starts with "zinc-qbc <zinc version>\n" (ZINC_ENGINE_VERSION, set by main first thing: no tc dependency in zn_qjs). A different or missing stamp is never read: with the bundle beside it the source runs (step line "compiled by zinc X, the source instead"), alone it is refused with "build it again". Every rebuild of zinc with another commit invalidates dev .qbc files (they fall back to the .js, a parse at start); exported .app bundles carry their own zinc, so they always match.
- AC4 source maps: sources relative to the project (zinc.json folder, else the entry's), sourceRoot the way from the bundle to it, sourcesContent the original texts (only when esbuild wrote none: the script engines keep theirs). mapStack resolves sourceRoot+source beside the bundle when the file exists, else prints the project-relative name. Proof: a build moved away traces "at boom (src/util.js:2:13)"; in place the absolute path.
- T0: tests/t0/qjs_bundle.sh (stamp, map fields, moved trace, foreign stamp with and without the .js).

later.md line: ZN-817: tools/hermes-pack and the engine packs of JSC: pin their sources the same way (check they do not float).

Proposed tests: tests/t1/qjs_build_bytecode.sh (build, move, damaged/stale .qbc, macos export app.qbc; ~1 min); a release dry run of tools/engine-pack v8 with the pinned SDK (minutes, network).
<!-- SECTION:NOTES:END -->
