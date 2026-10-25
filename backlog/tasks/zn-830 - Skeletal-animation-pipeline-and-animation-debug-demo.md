---
id: ZN-830
title: Skeletal animation pipeline and animation debug demo
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 11:01'
labels:
  - size-L
  - blender
  - animation
  - 3d
dependencies:
  - ZN-829
ordinal: 539460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-25): launch the Swift/Godot/Blender workflows and demos with agents. Add real Blender glTF skeletal animation to Zinc using a pinned proven animation library where appropriate, with skinning clips blending events sockets and debug controls.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A real skinned character deforms correctly with imported bind pose weights and named clips
- [x] #2 Idle walk run transitions loop policy playback speed root motion ownership and attachment sockets are demonstrated
- [x] #3 Pause seek single step blend inspection and event metadata are available with regression coverage for loops and seeks
- [x] #4 A pinned licensed animation dependency if used and supported target limits are documented with a runnable animation lab
<!-- AC:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.

ZN829 static publication slice is complete; its new world-baking criterion remains independently waiting for Tokyo importer. Proceeding with skeletal pipeline rather than blocking on world integration.

Implemented and executed actual vertical slice (2026-10-25): pinned MIT ozz-animation 0.17.0 archive SHA256 22b4401c77a2be68acb0a8aa2e857f94dbaccfed3ab25e304a1ddea4c546e86b, existing cgltf decoder, native handle-owned skeleton/clip import, ozz compression/sampling/blending/local-to-model/CPU skinning, persistent software/OpenGL mesh deformation, TS clip clock/event policy and actual joint attachments. No hand-written animation mathematics framework. Library scoring for coordinator decision: ozz fit5/perf5/size3/maintain5/licence5/portable5/effort4 =65; bespoke fit4/perf2/size5/maintain1/licence5/portable4/effort1 =45. Primary docs https://guillaumeblanc.github.io/ozz-animation/documentation/ and pinned release https://github.com/guillaumeblanc/ozz-animation/releases/tag/0.17.0.

Real editable companion.blend and deterministic generator produce 723 vertices/1442 triangles, twelve deform bones (14 hierarchy nodes), 544 vertices with >5% secondary influence, Idle/Walk/Run, action-marker events and source-derived mouth socket. Independent Blender evaluated Walk/Run geometry versus Zinc maximum error0.000444m (gate0.005m);1230 coordinate values deform. Runnable Stage lab exposes pause, seek, step, speed, loop toggle, crossfade weight/time and event count; controller owns in-place root movement.

Proofs: `tests/run --only animation_pipeline` PASS including malformed weights/joint indices, real deformation/reference, loop boundaries, seek-no-events, pause/step, blends, source socket coordinates, compatible replacement phase/idempotent disposal. `tests/run --only animation_lab` PASS:120-frame actual scripted input session traverses Idle/Run and pause/seek/step/loop-off, one exact reviewed skin golden. `zinc check examples/animation-lab` PASS. Explicit headless `ZINC_3D=gpu` prints rendererGPU and passes the same reference/behavior proof; native AOT2frames and QuickJS2frames smoke exit0. `tests/run --only blender_library` PASS after correcting the keyboard label (gamepadB maps keyboardX). Custom importer compiles clang++ -Wall -Wextra -Werror with vendored headers treated as system.

Limits are explicit in docs/plugins/animation.md: CPU baseline, Mac proof only,4096vertices/8192triangles/64hierarchy nodes/4normalizedweights/32MiBGLB, opaquebase/vertexcolor,LINEAR+constantSTEP. Morph/texture/nonuniformscale/unsupportedchannels fail. Root motion extraction/retargeting/GPU palette skinning are not claimed. Timing/budget throughput measurements remain for coordinator alone after integration; structural budgets and actual counts are proved. ZN831 will integrate artist reimport and playable gameplay.
