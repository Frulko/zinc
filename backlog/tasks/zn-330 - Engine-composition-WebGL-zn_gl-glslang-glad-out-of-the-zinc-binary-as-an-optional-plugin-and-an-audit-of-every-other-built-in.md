---
id: ZN-330
title: >-
  Engine composition: WebGL (zn_gl, glslang, glad) out of the zinc binary as an
  optional plugin, and an audit of every other built-in
status: Done
assignee: []
created_date: '2026-10-08 14:21'
updated_date: '2026-10-09 03:05'
labels:
  - architecture
  - webgl
milestone: m-19
dependencies: []
ordinal: 55215
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08: glslang must not be in the engine; everything optional, the engine as agnostic as possible, composed as needed. Today zn_gl + zn_gl_js (src/gl: WebGL1/2, glslang validation, glad) are linked statically into zinc whenever SDL3 is found (CMakeLists.txt, ZN_WEBGL). Move them behind the native-module/plugin ABI (plugins/webgl, built into the plugin cache on first use, ZN-101), or at least an off-by-default build option, and list the other always-linked parts (mbedTLS ZN_TLS, QuickJS, SDL3, regexp, host modules) with a keep/optional/plugin verdict for each.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a zinc built without WebGL has no glslang, glad or src/gl symbol (nm check in a T0 test) and runs every non-WebGL test unchanged
- [x] #2 a WebGL program (tests/t1/webgl_js, three, webgl_gizmo) loads WebGL as a plugin and passes as before; the conformance pass list holds
- [x] #3 docs/reports/zinc-next-decisions.md: a decision record listing each built-in with its verdict (core, optional build flag, plugin) and the size and build time saved
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done through ZN-330.01 (libzn_webgl) and ZN-330.02 (D40). The owner's SDL3 point and shaped text continue as ZN-330.03 and ZN-330.04. usage: n/a
<!-- SECTION:NOTES:END -->
