# Skeletal animation

`zinc:animation` imports one real skinned GLB mesh and named clips. cgltf decodes
the exchange data; pinned MIT ozz-animation 0.17.0 builds/compresses the skeleton
and clips, then samples, blends, converts local poses to model matrices and skins
vertices. Zinc owns rendering, gameplay time, transitions, events and sockets.
There is no new homegrown animation math framework.

```ts
import { SkinnedModel, AnimationPlayer, JointSocket } from 'zinc:animation';
const dog = new SkinnedModel('companion.glb');
const player = new AnimationPlayer(dog, [
  {clip:'Walk', time:0.25, name:'foot-left'}
]);
player.play('Walk', 0.3);
player.onEvent = (name: string): void => { console.log(name); };
// On each simulation tick: player.update(dt). Add dog to your zinc:3d scene.
```

`paused` stops `update`; `step(seconds)` deliberately advances even while paused.
`seek(seconds)` changes the pose without emitting events and cancels a pending
transition. `speed` must be finite and nonnegative; reverse playback is rejected.
`loop=false` clamps at the end and emits no repeated end events. Forward event
crossing uses `(previous,end]`, includes every crossed loop, and caps a single
advance at 100 loops. During crossfade only the destination clip emits events.
Event metadata is explicit sidecar data exported from Blender action markers;
glTF and ozz do not automatically transfer gameplay events.

This first profile uses **in-place clips**: gameplay/controller code owns root
translation and collision response. It does not extract or apply root-motion
displacement. Animation seeking never changes world gameplay state. `JointSocket`
attaches child nodes to an actual sampled bone matrix; its local position is
authored in that joint's exchange coordinate space.

Prepare a new `SkinnedModel` completely before replacing a live one. A player's
`replace(candidate)` returns whether skeleton joint names/parents and current
clip name are compatible. Compatible replacement retains normalized phase,
pause/speed/loop controls; a topology change resets clip/phase. A transition is
cancelled on replacement. No events are replayed. The caller swaps the scene node
at a frame boundary and disposes the old model only after success. `dispose()` is
idempotent and releases native animation and renderer mesh storage. A failed
candidate constructor leaves the current model unchanged.

Supported initial proof platform: development Mac, software rasterizer and the
Mac OpenGL renderer's persistent vertex buffer. CPU skinning reuses native pose
and vertex buffers; the bridge reuses the caller's output arrays. Skin vertices
are uploaded into the existing GPU buffer rather than creating a mesh each frame.
GPU palette skinning, mobile/console verification and performance measurements
remain separate work; do not infer their budgets from this desktop proof.

The import boundary enforces one skin, one mesh instance/primitive, at most 4096
vertices, 8192 triangles, 64 hierarchy nodes and 32 MiB GLB input. Four normalized
weights, finite bind/vertex/key values, named unique joints/clips and valid
triangle/joint indices are required. The renderer supports base/vertex color in
this profile. Textures, alpha, morph targets, required extensions, external
buffers, nonuniform/negative skeletal scales and matrix rest transforms are
rejected explicitly. Clips support LINEAR keys and constant STEP channels;
changing STEP and CUBICSPLINE tracks must be baked to LINEAR before export.

The [animation lab](../../examples/animation-lab/README.md) contains original
editable Blender art, exact export commands, independent Blender deformation
references, controls and regression tests. Its weight blending deforms a connected
skin; it is not a collection of rigid body parts.

Primary library references: [ozz overview](https://guillaumeblanc.github.io/ozz-animation/documentation/)
and [pinned 0.17.0 release](https://github.com/guillaumeblanc/ozz-animation/releases/tag/0.17.0).
