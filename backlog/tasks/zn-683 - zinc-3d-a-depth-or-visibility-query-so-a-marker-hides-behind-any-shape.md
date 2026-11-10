---
id: ZN-683
title: 'zinc:3d: a depth or visibility query, so a marker hides behind any shape'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 19:36'
updated_date: '2026-11-10 12:04'
labels:
  - 3d
  - size-S
dependencies: []
ordinal: 18600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Found by the museum table, ZN-650.03 and ZN-650.04.) Points of interest on an object are hidden when they face away, which is right for a convex vase only; a query of the depth at a pixel (or a ray cast against the scene) hides a point behind any shape.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a point behind a handle of a concave test model is reported hidden, in the software and the GPU renderer (test)
<!-- AC:END -->


## Implementation Notes

### 2026-11-10 — rendered-depth visibility

- Added `Camera.isVisible(x, y, z, bias = 0.00001)`: world coordinates tested against the camera's last rendered depth, using a target-owned saved view/projection. Before render/after dispose and outside the view returns false; invalid coordinates/bias throw. Software reads its existing depth buffer; macOS OpenGL synchronously reads one depth pixel, resolving just that pixel from MSAA when needed. No new dependency or shared engine/runtime changes.
- Scope audited: `Mesh` creation/OBJ/zmesh, CPU deformation, node hierarchy/visibility/material passes, `World` selected ranges, perspective/ortho projection, software/GL target creation/resize/disposal, native spec generation, stand-in/web dispatch and all native renderer subclasses. The private Camera target remains exclusively owned, is cleared on dispose and cannot be handed to another camera; no new handle or lifecycle flag. Saved projection is zeroed when a target is allocated/resized. GL bindings and previous context restore through RAII.
- Actual depth makes holes and concavity count, alongside current transformed/deformed geometry and selected world ranges. Blended materials write no depth; culled/hidden/clipped geometry does not count. Precision, pixel coverage and multisampling affect silhouettes. No alpha-aware raycast or 2D-overlay visibility claim. Query is for the just-rendered depth, including when async colour presentation displays the preceding frame; docs give `ZINC_GL_PRESENT=sync` for matching markers.
- Nonrendering sim, WebGL/GLES and console GPU targets explicitly report unsupported rather than fabricate visibility. Software fallback remains supported. Broader platform depth-read implementations are outside this criterion.

### Research and decision proposal (coordinator assigns any decision number)

- three.js raycasts actual mesh triangles with material-side culling: https://threejs.org/docs/pages/Raycaster . Existing `plugins/three/index.ts` raycast is tied to its TS BufferGeometry. `zinc:3d` stores native handles only, GL frees its staging arrays, and selected world/deformed geometry is drawn natively. Reusing that raycaster here would add persistent geometry copies or miss actual drawn data.
- OpenGL documents depth readback and multisample blits: https://registry.khronos.org/OpenGL-Refpages/gl4/html/glReadPixels.xhtml and https://registry.khronos.org/OpenGL-Refpages/gl4/html/glBlitFramebuffer.xhtml . Chose existing rendered depth over new raycast storage: accurate for this marker criterion with less memory/code, at the explicit cost of synchronous GPU stalls for a few marker queries. No full-frame depth copy and no added cost per pixel when queries are unused; each target adds one 64-byte projection snapshot.
- Weighted quick comparison (fit x3, performance x3, footprint x2, readability x2, supply x2, portability x1, effort x1): existing rendered depth 5/3/5/5/5/3/5 = 62; copied/native mesh raycasting 3/3/2/2/5/4/2 = 42. Revisit for many queries per frame or console/WebGL demand.

### Proof

- Used frozen read-only compiler `/Users/mowmow/Lab/zinc/.worktrees/1030/build/zinc`, SHA256 `a1918ca461194e0185218723ad530f61adc1d59a77a22b4467a6a18fb736338e`, with `ZINC_ROOT` pointing to this worktree. Its native plugin build compiled only the two 3d plugin sources and linked cleanly (observed ~2 seconds, indicative under shared load, no benchmark claim). `zinc check tests/data/zinc3d_visibility/main.ts` passed.
- Exact T0 `tests/t0/zinc3d_visibility.sh` passed: saved-matrix perspective/ortho projection, Y direction, depth units, clipping, NaN, image-edge exclusion; C++20 `-Wall -Wextra -Werror`. Native-gen produced the exact new declaration recorded in `tests/data/native-gen-render3d-additions.txt`.
- Ran `tests/data/zinc3d_visibility/main.ts` headless with `ZINC_FRAMES=2`, both `ZINC_3D=software` and `gpu`, for `--interp`, `--native`, `--engine quickjs` (six feature runs). Each printed `visibility <renderer> ok`. Real 2,304-triangle torus: visible through hole, hidden behind right and upper handles, visible in front; translated/scaled parent, second camera, camera/scene edits before redraw, orthographic mode, hidden node, blend without depth writes, near/far/view clipping, invalid bias, dispose and resized restart all asserted.
- Separate two-frame software and GPU MSAA=0/async captures inspected in `.logs/visibility-683/{software,gpu}.png`: center marker shows through the hole, marker behind handle absent. GPU fixture also proved default MSAA=4. All commands bounded through the coordinator's `tools/work-run`; no processes left running. No suite, pixel comparison or benchmark run.
- `usage: n/a` (`tools/usage`).

### Proposed tests

- `tests/run --only zinc3d_visibility`: exact projection math, ~1 second, small native compiler process; already proved directly.
- `ZINC_HEADLESS=1 ZINC_FRAMES=2 ZINC_3D=software|gpu ZINC_GL_PRESENT=sync zinc run --interp|--native|--engine quickjs tests/data/zinc3d_visibility/main.ts`: the six real concave-geometry controls and camera lifecycle, subsecond cached per run (~2 seconds first native compilation); memory not sampled. Already proved directly; owner can choose for milestone regression.
- `tests/run --only native_gen`: complete native API compatibility, seconds, compiler memory not sampled; not run during this task.
