---
id: ZN-702
title: WebGL works around the macOS AMD and Intel GL shader bugs ANGLE knows
status: Backlog
assignee: []
created_date: '2026-10-10 22:03'
labels:
  - webgl
  - size-M
milestone: m-8
dependencies: []
ordinal: 473410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-612: on the Intel Mac's AMD GL driver three conformance pages fail that pass on Apple Silicon: conformance2/glsl3/matrix-row-major-dynamic-indexing (dynamic indexing of a row_major matrix of a uniform block), conformance2/glsl3/vector-dynamic-indexing-swizzled-lvalue (a dynamically indexed swizzle as an lvalue), conformance2/textures/misc/tex-srgb-mipmap (generateMipmap of an sRGB texture averages encoded values). Browsers rewrite the shader or the call for these drivers (ANGLE's workarounds rewrite_row_major_matrices, remove_dynamic_indexing_of_swizzled_vector, decode_encode_srgb_for_generatemipmap, enabled per vendor on macOS GL). Apply the same rewrites in src/gl when the context's vendor is AMD or Intel (the shader translation already passes through glslang for validation), then drop the pages from tests/golden/webgl/conformance-known-amd.txt. Low value while Apple Silicon is the target: Intel Macs only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the three pages pass on the Intel Mac's AMD driver
- [ ] #2 Apple Silicon runs the shaders unchanged (no rewrite on its vendor)
<!-- AC:END -->
