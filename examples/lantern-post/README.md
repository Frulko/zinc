# Lantern Post

A playable three-delivery courier route authored in Blender and run by Zinc.
Open a courtyard gate and visit three brass mailboxes with a genuinely skinned
companion. Nested cottage/lantern libraries, camera, colliders, triggers, rig,
clips and mouth socket are authored data. Zinc owns gameplay and live state.

From the repository root:

```sh
build/zinc check examples/lantern-post
ZINC_BACKGROUND=1 build/zinc run examples/lantern-post
ZINC=build/zinc tests/run --only lantern_post
```

Arrows/WASD or the left stick move; hold X to run; Space delivers/opens the gate.
Mouse/touch can hold the direction/run zones and tap Deliver/Gate. Enter reloads.
C opens the in-demo Inspector: source records, translucent collisions/triggers,
clip time/blend and foot events. Tab cycles sources, Q pauses the pose, E seeks
one pose step without events, V rejects a malformed revision. The title areas
also reload (left) and toggle the Inspector (right). Deliver once each at the west
cottage, east cottage and lantern post. Animation is in-place; gameplay owns motion.

## Real artist iteration

Blender 5.2.1 LTS is proven. App users need no Blender installation. The actual
editable projects and published GLBs/manifests are committed. Recreate them:

```sh
blender -b --factory-startup --python-exit-code 1 -P examples/animation-lab/authoring/build.py
blender -b --factory-startup --python-exit-code 1 -P examples/lantern-post/authoring/build.py
blender -b examples/animation-lab/authoring/companion.blend --python-exit-code 1 -P examples/lantern-post/authoring/retime.py
blender -b examples/lantern-post/authoring/lantern.blend --python-exit-code 1 -P examples/lantern-post/authoring/revise.py
tools/scene-exchange examples/lantern-post/assets/scene.json
tools/scene-exchange examples/lantern-post/assets/revised.json
build/zinc assets build examples/lantern-post
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=120 build/zinc run examples/lantern-post -- --proof
```

`retime.py` reopens the **saved** companion project, doubles its real Walk key
times and foot markers (one second → two seconds), and exports a new skin GLB.
`revise.py` reopens the yard, moves the gate 0.5 m, links that revised character
and publishes a complete second revision. Edited `.blend` files are in
`authoring/revisions/`; `assets/revised.json` names immutable hash-addressed assets.
This is an executed source edit, not a manually changed placement/animation mock.

The proof drives the collision-aware route, delivers one parcel, loads the actual
artist revision and checks courier coordinates, open gate, quest progress and
normalized Walk phase. Invalid event metadata and malformed scene input must keep
the last valid playable scene/skin. It then finishes the other two deliveries
and verifies that interacting again cannot credit a parcel twice. The T1 session
also exercises real debug input and an exact reviewed capture.

For live files, install the [extension](../../integrations/blender/README.md), open
`authoring/lantern.blend`, then run:

```sh
ZINC_BACKGROUND=1 ZINC_SCENE_DIR="$PWD/examples/lantern-post/assets" build/zinc run examples/lantern-post
```

Publish to `assets/` and press Enter. A collection instance's `zinc_skin` JSON
names its stable asset ID, GLB, marker/socket sidecar and source project. Publish
the character library before publishing its scene; the publisher commits the
whole referenced revision atomically. Same IDs/topology preserve clip phase;
changed topology or asset identity resets animation state. A moved collider that
traps the courier recovers at the authored spawn while retaining deliveries.

## Files and limits

`src/main.ts` mounts the stage; `state.ts` owns gameplay/reimport; `world.ts` builds
authored collision/trigger volumes; `view.ts` supplies input/Inspector; `proof.ts`
verifies the route and actual artist revision. `zinc:animation/scene` is the generic
scene bridge, with one independent native skin/player per authored instance.

`authoring/lantern.blend` contains the assembled project. Static art comes from
`examples/blender-library/authoring/library.blend`; its linked companion comes
from `examples/animation-lab/authoring/companion.blend`. Keep repository-relative
locations when editing. Source links are diagnostic data, never commands. No third-party art downloads are needed. ozz-animation's pinned MIT licence is vendored separately.

Measured content counts: 36 entities, 15 assets, a 723-vertex/1442-triangle skin,
14 skin hierarchy nodes. Live triangle counts appear in the HUD. Import limits
are in [the animation contract](../../docs/plugins/animation.md). No throughput
claim is made. Development Mac is the proof platform; materials are base/vertex
color without Eevee/PBR parity. The bounded courtyard motor uses circle/AABB
sliding, not general navigation or Blender physics translation. Root-motion
extraction and cross-platform behavior remain unverified. World fusion is the
separate `.zworld` integration; this small fixture currently keeps static nodes.
