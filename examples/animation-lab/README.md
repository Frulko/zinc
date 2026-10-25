# Companion Animation Lab

A real editable Blender dog, with a connected remeshed skin, twelve deform bones,
idle/walk/run clips, marker events and a mouth socket. Of 723 vertices, 544 use
mixed bone weights above the generator's 5% threshold. Zinc imports the GLB through
cgltf and ozz-animation; it does not animate rigid stand-in parts.

From the repository root:

```sh
build/zinc check examples/animation-lab
ZINC_BACKGROUND=1 build/zinc run examples/animation-lab
ZINC=build/zinc tests/run --only animation_pipeline
ZINC=build/zinc tests/run --only animation_lab
```

Click/tap the bottom actions or use Space to pause, Enter to crossfade clips,
Left/Right to seek 0.1 seconds, X to advance one 24 Hz pose step, Up/Down to change
speed, C to toggle looping. The display shows clip time/duration, blend weight, loop policy, live events,
joint/vertex budgets and controller ownership of actor motion. The golden stick
follows the mouth's actual joint matrix through animation, blending and seeking.
The actor remains in place because gameplay, not the clip, owns translation.

Each clip loops by default; Enter selects idle/walk/run. API callers can set
`player.loop=false` to stop on the final pose. Seeking never refires event-driven
gameplay actions. Paused, unchanged frames keep the prior drawing.

Regenerate the actual editable `.blend`, GLB, marker/socket sidecar and independent
reference poses with Blender 5.2.1 LTS:

```sh
blender -b --factory-startup -P examples/animation-lab/authoring/build.py
```

`authoring/companion.blend` is the actual generated project; the generator is the
original source, with no network art dependency. All original art/source is MIT.
The GLB has 723 vertices and 1442 triangles; the runtime skeleton includes the
armature/mesh nodes for 14 hierarchy nodes. The generator samples Blender's own
evaluated deformed mesh for Walk and Run. The regression compares every Zinc
vertex to that independent reference, enforcing 5 mm maximum error (observed
0.444 mm in the pinned toolchain), and checks loop crossings, pause, seek, step,
blend and socket coordinates. Malformed joint indices and weights must fail.

`src/main.ts` mounts a `zinc:stage` view; `state.ts` assembles the scene/attachment,
`view.ts` owns debug controls, and `proof.ts` exercises real import/playback behavior.
`--proof` runs those assertions and pauses on a deterministic deformation capture.

The dependency is vendored and pinned under `third_party/ozz-animation` with its
MIT licence and archive checksum. There is no installation step for app users.
The [module contract](../../docs/plugins/animation.md) lists hard import limits,
supported interpolation/materials and reimport rules. Desktop Mac is the only
proven target. This is CPU skinning; no handheld, GPU palette or timing claim is
made. The lab is an animation feature proof, not yet the playable Lantern Post game.
