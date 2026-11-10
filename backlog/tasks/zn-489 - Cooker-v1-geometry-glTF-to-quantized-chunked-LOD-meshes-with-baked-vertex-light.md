---
id: ZN-489
title: >-
  Cooker v1 geometry: glTF to quantized, chunked, LOD meshes with baked vertex
  light
status: Done
assignee: []
created_date: '2026-10-09 07:39'
updated_date: '2026-11-10 15:29'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-433
ordinal: 50300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Add to tests/t0/cook.sh: over-budget failure names cell and section; receipt carries quantization error and LOD counts; psp output has no float positions. Drop the CLI/criteria already met.

zinc cook, a desktop program (Zinc code AOT-compiled plus C++ helpers): read glTF (cgltf) or a three.js scene exported by Zinc's three.js, split into cells, simplify per level with meshoptimizer, quantize positions to i16/u16 over the cell box (PSP: signed with a x32768 model scale), pack per-profile vertex layouts (PSP 8-12 B, 3DS/iOS 8-16 B, Vita 12-20 B), u16 indices in batches <= 65,535 vertices, and bake light into vertex colours (sun + ambient + AO by BVH ray casts, adaptive edge splits). Profiles psp30, vita60, n3ds30, ios60 carry triangle budgets and fail the cook with the section named. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A sample CC0 scene cooks for the four profiles; two cooks are byte-identical
- [x] #2 Budgets per profile are enforced and a failure names the cell and section
- [x] #3 Quantization error and triangle counts per LOD are in the receipt
- [x] #4 No float positions are emitted for the psp profile (checked by a test)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Partial: cook.cpp/cook.h implemented (glTF->quantized mesh, vertex light bake, LOD via meshopt, budget check, deterministic receipt). Wired into zn_assets build. Not yet: CLI  command, profile presets, test, byte-identical verification. Next: add CLI subcommand and a T0 test.

Done: cook module + CLI 'zinc assets cook' + T0 test (cook.sh, byte-identical). Profile budgets enforced.
Review 2026-10-25: reopened. Cooker works but three of four criteria have no test. Add a T0 test over the four profiles: byte-identical, over-budget failure names cell and section, receipt carries quantization error and LOD counts, psp output has no float positions.
Review 2026-11-07: rewrite. Cooker exists (zinc assets cook, tests/t0/cook.sh); only the missing tests remain, all on the Mac. Evidence: src/assets/cook.cpp; tests/t0/cook.sh (byte-identical and receipt only)

2026-11-10 worker implementation (work/489):

- Scope follows the 2026-11-07 review: cooker contracts only. Existing CLI presets remain unchanged; no new flag, renderer, demo, chunking or runtime LOD work. Callers/readers inspected: CLI assets cook/view; no consumer uses quantErr.
- Expanded `tests/t0/cook.sh`: Kenney Platformer Kit CC0 tree (existing licences and models.json, 408 triangles) cooks twice for psp30/vita60/n3ds30/ios60. Both pack and receipt bytes compare equal for every profile. Receipts require exact profile, positive integer vertices, 408 triangles, finite nonnegative quantError, exactly lod0/lod1 integer counts and 0 <= lod1 <= lod0 == triangles. A simplifier may preserve topology/counts.
- Independent Python parsing checks PSP magic/name, finite f32 header bounds, vertex count, exactly 9-byte `<3h3B` records, quantized position range, u16 index count/range and EOF. Header bounds are floats; vertex positions are integers. It does not use readCook.
- A two-triangle embedded glTF and native assert helper exercise the existing CookProfile.triBudget seam for every profile. Budget 1 returns false, receipt.ok=false and receipt.error==err==`budget overrun: cell default section triangles 2 > 1`, with no output directory; budget 2 succeeds. No giant synthetic scene or CLI budget option.
- Found and repaired incorrect metadata: the old estimate undid an unrounded 65535-scale X value and ignored Y/Z, while output truncates XYZ at 32767. Accumulate mean Euclidean distance from the actual stored i16 XYZ and f32 header bounds, reconstructed in double precision; units are source mesh coordinate units. Binary geometry encoding stays identical. Header comment and asset documentation define the metric.
- Regression source has only exact X endpoints and fractional Y/Z. The Python check independently decodes source f32 positions and output bytes and compares mean XYZ distance to quantError (receipt text precision tolerance 1e-5 relative). This catches zero, X-only, wrong-scale and unrounded estimates. The same check also cooks the tiny fixture through the actual CLI, so a stale CLI cannot pass solely because the native source helper is current.
- Research supplied by the coordinator: [meshoptimizer simplification](https://meshoptimizer.org/#simplification) and [vertex quantization](https://meshoptimizer.org/#vertex-quantization), [KHR_mesh_quantization](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_mesh_quantization/README.md), [glTF accessors](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#accessors), [cgltf](https://raw.githubusercontent.com/jkuhlmann/cgltf/master/README.md). Reuse the existing pinned cgltf/meshoptimizer; do not require a strict LOD reduction or reinterpret floating bounds as floating position records.

Proof:

- Initial bounded `tests/run --only cook`: PASS (1 passed, 0 failed), using common CLI SHA256 0523dc12d32233b0891970a1c5906afac1c483c53e9a1090d760036e20a342ac and this tree as ZINC_ROOT. The native helper compiles this repaired production cook.cpp plus vendored cgltf with C++20 `-Wall -Wextra -Werror`, linked to the common read-only libzn_meshopt.a; no full engine rebuild in this worker.
- Concrete before/after tiny fixture proof: baseline CLI reports error 0; repaired production helper reports 6.9066e-06; independent byte reconstruction gives 6.9065981446157634e-06 source units. The PSP pack stays byte-identical, 93 bytes, SHA256 86517c21f2f34d64a04278d8137c438d61e1f25dc499b627501c7f1e7acc6ae0; receipt grows from 219 to 228 bytes. Local proof: `.logs/cook-proof/summary.json` and old/budget-* files. These are correctness artifacts, not performance measurements.
- The final T0 also validates the actual CLI tiny-fixture error: it deliberately rejects the stale common CLI with quantError 0 versus decoded 6.9065981446157634e-06; coordinator must run it with rebuilt zinc. All four criteria pass the repaired source-helper plus existing-CLI contract proof. Task remains In Progress until coordinator rebuilds linked zinc and reruns exact cook against the repaired CLI before counting Done. No source program changed, so zinc check is inapplicable. No suite, hardware, benchmark or cross-profile runtime claim. No processes left running.
- usage: n/a (tools/usage)

Proposed tests:

- `ZINC=<integrated-build>/zinc ZINC_ROOT=<integrated-tree> tests/run --only cook`: prove all four contracts and repaired linked CLI after integration; seconds, memory unmeasured (small fixture + one native compile).
- Hardware profile consumption belongs to the later cross-platform pass; this task proves host-side cooking only. No new later.md line or decision number proposed.

Coordinator linked-CLI proof passes on source b7c0d7b4c, compiler 54114b62024f586d835630c7964bfa7e037f93c989b8d9464961b04beea46a9b: tools/build zinc and exact cook T0 cover four profiles, deterministic pack/receipt bytes, tiny budget boundary, integer PSP positions and independent XYZ error. Durable proof: .logs/archive-completed-workers-20261110/489-final; root .logs/integration-2026-11-10/cook/summary.json. No performance or hardware claim.
<!-- SECTION:NOTES:END -->
