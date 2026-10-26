---
id: ZN-845
title: macOS Sierra legacy runtime experiment
status: Done
assignee: []
created_date: '2026-10-26 16:32'
updated_date: '2026-10-26 16:38'
labels:
  - macos
  - size-M
dependencies: []
ordinal: 554460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request 2026-10-26: try a legacy Zinc runtime for Intel Macs running macOS 10.12. Reuse the portable runtime and software raster; keep the modern engine build unchanged. First experiment: pack on a current Mac, run bytecode on the legacy runtime.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A repeatable isolated build produces an x86_64 runtime declaring macOS 10.12, without SDL3 or modern JavaScriptCore
- [x] #2 Packed hello and graphics programs run with matching output and deterministic pixels on the development Mac
- [x] #3 A background Cocoa window presents the software raster and accepts basic game keyboard and pointer input
- [x] #4 Document the artifact, commands, limitations, and the remaining real-Sierra verification
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented isolated targets/macos-legacy CMake entry and Cocoa software-raster HAL over the portable console interpreter. Kept modern CMake untouched. Native Intel binary declares 10.12 and links system libc++/libSystem/Cocoa only; no SDL/Metal/JSC. Existing shortestDouble fallback already handles old Apple runtimes. Full CLI syntax-only 10.12 probe confirms filesystem APIs unavailable before 10.15; stopped that full build after establishing the blocker. Final checks: tests/run --only macos_legacy PASS; tests/run --only macos_legacy_window PASS; ZN_CONSOLE_BUILD=build/macos-legacy-core tests/run --only console_core PASS. Actual background bouncing-ball 60-frame run PASS, hash 216f7766b51df966 identical to normal interpreter; captured image visually checked. Cocoa test checks actual displayed-view quadrants, game keys/mouse, close, unchanged frontmost app; initial focus regression fixed by preserving background CLI activation policy as SDL does. Preview build/macos-legacy-preview.tar.gz contains runtime, hello, bouncing-ball, run.command and hashes/provenance; archive launcher smoke PASS. D172 and docs/reports/zinc-next-macos-legacy.md document the choice. Experiment complete; real Sierra dyld/render/input verification remains explicitly unproven in backlog/later.md. No QuickJS, desktop host/plugins, signing, publication or push. Usage: n/a for Codex.
<!-- SECTION:NOTES:END -->
