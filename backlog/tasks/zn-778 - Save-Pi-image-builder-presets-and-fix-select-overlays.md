---
id: ZN-778
title: Save Pi image builder presets and fix select overlays
status: Done
assignee: []
created_date: '2026-10-23 08:51'
updated_date: '2026-10-23 09:10'
labels:
  - ui
  - tooling
  - size-M
dependencies: []
ordinal: 514460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: reusable Pi image builder presets, automatic restoration of the last settings, and correction of select dropdown stacking.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Users can save and restore named presets and the latest edited settings automatically survive restart, including unknown profile keys; private values remain owner-readable only and save failures are visible.
- [x] #2 Board, screen and preset dropdowns render and receive input above later settings and close predictably; a focused regression covers the stacking defect.
- [x] #3 Targeted logic and scripted builder tests prove presets, autosave/reload, errors and dropdown selection; docs and changelog explain the resulting behavior.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added named full-profile snapshots in presets.json beside the active profile, restored through a select and saved from a keyboard-accessible Save as dialog. Names are trimmed, nonempty and unique; existing snapshots are not overwritten. Complete raw profile snapshots preserve unknown base/zinc keys and credentials. Existing per-edit autosave now uses a private temporary directory, mode 0600 and atomic replacement; read/parse/write errors are visible and a build is refused if its profile cannot be saved. Startup restores the last profile and saved preset list. Fixed the shared zinc:ui/nuxt Select once: persistent anchored engine layer instead of an absolute child clipped by Cards, trigger-width on opening, focus scope, Escape/outside dismissal and option/combobox semantics. All actual callers inspected; existing Nuxt demo expectations unchanged. Proof: build/zinc check image/builder; pi_image_presets (snapshots, multiple names, preservation of unknown keys/secrets, owner-only files, corrupt-file refusal and failed writes); pi_image_builder_presets (real pointer hits beyond the Board card, board/screen selection, Escape/outside, modal Enter/cancel, snapshot restoration, duplicate-name error, visible write failure and build refusal, cold app restart); pi_image_builder (fake build success/failure and reviewed updated goldens); nuxt_ui. No engine rebuild, Docker image build or cross-platform tests. Nothing pushed. Usage: n/a for Codex.
<!-- SECTION:NOTES:END -->
