# animation documentation audit

## What it is
Skeletal animation for glTF/GLB characters (ozz-animation): named clips, crossfades, events, joint sockets, CPU skinning drawn through `zinc:3d`.

## Targets and status
`plugin.json`: macos only (ozz sources listed under macos). The doc says "initial proof platform: development Mac"; mobile/console, GPU skinning and performance are explicitly open (backlog ZN-830/831).

## What the docs have
- [x] overview (`docs/plugins/animation.md`, 66 lines)
- [~] install: licence and ozz version stated; no usage line for adding the plugin
- [x] quick start (6 lines)
- [~] API reference: behaviour is described in prose; no table. Exports in `index.ts`: `SkinnedModel` (sample, joint, dispose), `AnimationPlayer` (play, seek, update, step, pose, replace, paused, speed, loop, onEvent), `JointSocket`, `animationVersion`, `AnimationEvent`
- [~] example code: one snippet
- [x] runnable examples: `examples/animation-lab`, `examples/lantern-post`
- [ ] screenshots or GIF of the lab
- [ ] tutorial (Blender export to running clip) - the lab README has export commands but the plugin page only links it
- [~] commands: in the lab README
- [x] notes: strict import limits (4096 vertices, one skin, LINEAR keys), root motion not extracted
- [x] tests: `animation_pipeline`, `animation_lab`, `animated_scene`, `lantern_post`

## What is missing
1. GIF/screenshot of the animation lab with a blend of two clips (`ZINC_SHOT=... zinc run examples/animation-lab`).
2. A tutorial "From Blender to a walking character": export a GLB with the right settings, bake STEP/CUBICSPLINE to LINEAR, play and blend, attach an item with `JointSocket`.
3. An API table (members, units, errors) generated from the module; list properties `speed`, `loop`, `paused`, `onEvent`.
4. A "limits at a glance" table (vertex, triangle, node counts; rejected features) separate from the prose, with the exact error message for each.
5. Link to scene exchange (`docs/scene-exchange.md`) and the authoring scene reimport (`plugins/animation/scene.ts`, ZN-831), which the page does not mention.
6. Troubleshooting: the error messages when a GLB is rejected.
7. Troubleshooting for textured models (textures rejected in this profile).
8. (owner) when other targets are supported, a per-target table.

## Wrong or stale
- The page mentions only `SkinnedModel`, `AnimationPlayer`, `JointSocket`; `plugins/animation/scene.ts` exists (authoring-scene support) and is undocumented.
- No contradiction found with `index.ts`.

## Suggested pages
- Skeletal animation: overview
- From Blender to a character (tutorial)
- API reference (generated)
- Crossfades, events and sockets
- Import limits and error messages
- Animation lab walkthrough with GIFs
- Targets and roadmap
