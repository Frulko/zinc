---
id: ZN-444
title: 'Shader validation at build, program binary cache on device'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-434
ordinal: 12200
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Keep: invalid shader fails the build with file and line (glslang vendored). Drop the Pi 3 second-start measurement.

Validate each GLSL ES variant (D29 prelude) with glslang at build time, strip comments and whitespace, store per profile. Cache program binaries on the device where GL_OES_get_program_binary exists. Report: docs/reports/games/toolchain-assets-loading.md (4.7).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 an invalid shader fails the build with file and line
- [ ] #2 the second start on the Pi 3 skips the compile (measured)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: rewrite. Shader validation at build is Mac-provable; the Pi 3 program-binary cache measurement moves to the cross pass.
<!-- SECTION:NOTES:END -->
