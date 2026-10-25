---
id: ZN-831
title: Lantern Post Blender to Zinc production showcase
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 11:01'
labels:
  - size-L
  - blender
  - demo
  - 3d
dependencies:
  - ZN-829
  - ZN-830
ordinal: 540460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-25): launch the Swift/Godot/Blender workflows and demos with agents. Create the compact playable production showcase using the Blender library scene and skeletal animation pipeline, with full artist-to-runtime iteration and diagnostics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A playable courier and genuinely skinned animal companion complete a compact three-delivery route
- [x] #2 Blender authors nested scene assets collisions triggers cameras skeletons sockets and clips while Zinc owns gameplay
- [x] #3 A scripted demonstration edits a gate and a walk clip republishes and preserves compatible delivery state
- [x] #4 Inspector provenance animation collision and failure recovery plus targeted game tests captures and budget reports prove the workflow
<!-- AC:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.

Delivered actual playable project (2026-10-25): 36 authored entities/15 assets, saved lantern.blend with nested cottage/lantern collections and linked Companion library, saved revised scene and companion projects, exact README commands, original/revised hash-named GLBs and manifests, Stage game with mouse/touch/gamepad/keyboard controls, circle/AABB collision, gate and three one-credit deliveries. The companion is the actual skinned 723-vertex/1442-triangle mesh, with native in-place Idle/Walk/Run, blending, foot events and a source-derived mouth socket.

Generic optional `zinc:animation/scene` supplies per-instance native skins to the shared SceneRevision trust boundary. Same scene/node/asset IDs and joint topology retain normalized phase; invalid candidates release their resources before rollback. Static-only scenes retain no animation dependency. Blender `zinc_skin` collection references publish GLB + events/sockets/provenance atomically; unrelated/unlinked source objects are not exported.

Executed real authoring edit: reopen saved companion.blend, double actual Walk keys/markers from1s to2s, save companion-revised.blend/GLB, reopen yard, move gate0.5m and link revised library, save lantern-revised.blend and publish revised.json. The game proof opens the blocking gate, delivers west, loads that real revision preserving actor/open gate/quest/normalized Walk phase, rejects invalid animation metadata and malformed scene while retaining live resources, then delivers east/post and rejects duplicate credit. Blocked authored spawn revisions reject before commit.

PASS: `zinc check examples/lantern-post`; `tests/run --only lantern_post` (90-frame actual debug input session + exact reviewed capture); `tests/run --only animated_scene` (two independently deforming instances, ten replacement cycles with bounded reused native handles, preserved phase/pause/speed, failed-candidate cleanup); `animation_pipeline`, `scene_exchange`, `blender_library`. Headless explicit GPU full gameplay/reimport proof passes; AOT2frames and QuickJS2frames smoke exit0. Asset build:18 source entries, one237048-byte pack (includes both revision fixtures). No timing/RSS throughput claim under parallel work.

Scope is explicit: compact flat yard motor, base/vertex colors and Mac proof. This in-demo Inspector displays provenance/clip/blend/events/collision volumes; it does not pretend an unimplemented app/inspector transport. Source/rig libraries and actual captures are included. World fusion remains the separate reopened ZN829 criterion and is not faked with a different binary.

Finish-worktree verification (2026-10-25): Integration verification against develop 55e263e0: sequential headless `animated_scene` and `lantern_post` PASS using this tree native sources (explicit ZINC_ROOT); existing scene exchange and static library tests also PASS. No integration code fix needed. Native windows and timing are coordinator-owned; not repeated here.
