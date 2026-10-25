# Scene exchange v1

`zinc.scene` version 1 is the shared Blender/Godot publication format. It carries
data, never executable source links. All paths use `/`, relative to the project
for provenance, and relative to the publication directory for asset URIs. Absolute,
escaping and non-normalized paths are rejected. Units are metres, right handed,
Y up; rotations are normalized quaternion `[x,y,z,w]`, cameras face local -Z.

```json
{
  "schema": "zinc.scene", "version": 1, "id": "stable-scene-id",
  "revision": "SHA256 of canonical document excluding revision",
  "source": {"tool": "Blender 4.5", "file": "authoring/yard.blend", "scene": "Yard"},
  "assets": [{"id": "crate", "uri": "objects/HASH.glb", "hash": "SHA256", "dependencies": []}],
  "nodes": [{
    "id": "instance-1", "name": "Crate", "parent": null, "asset": "crate",
    "translation": [0,0,0], "rotation": [0,0,0,1], "scale": [1,1,1],
    "metadata": {}, "source": {"file": "authoring/yard.blend", "object": "Yard/Crate"}
  }]
}
```

IDs are explicit persistent authoring properties, independent of names, paths and
content hashes. Parent nodes preserve nested instances. Asset dependencies and
parent links must exist and be acyclic. Duplicate IDs are errors; publication
never silently repairs them. Mesh assets are GLB inputs to the existing Zinc asset
cache/pack pipeline; semantic hierarchy remains outside flattened `.zmesh` files.

Metadata is restricted to `camera:{fov,near,far}` (vertical FOV in degrees),
`collision:{shape:"box",size:[x,y,z]}`, `trigger:{shape:"box",size:[x,y,z],event}`,
`socket:{name}`, `spawn:{name}`, `gate:{name}`, `interaction:{event}`. Box size is
local full extent; scene TRS applies once. Unknown component kinds fail validation.
Gameplay behavior is supplied by Zinc, never by the authoring tool.

The authoring boundary accepts `world:{cell:<positive finite metres>,levels:["near","mid","far"]}` on a collection or parent. Levels are optional included names, following the existing world importer's contract. Blender publishes `{node,source,world}` source seeds without deleting authoring nodes. The asset build fuses static descendants through the existing world importer; dynamic/behavior descendants remain scene entities. See **Static world builds** below for the runtime manifest and picking API.

Canonical hashing uses UTF-8 JSON with sorted keys, no insignificant whitespace,
finite numbers, and excludes only the top-level `revision`. Exporters must omit
volatile timestamps and machine paths. Arrays use deterministic authoring order.
`tools/scene-exchange path/to/scene.json` verifies schema, hierarchy, typed
metadata, content hashes and revision. Exporters can import
`tools/scene_exchange` to validate/publish. Write immutable hash-named assets
before atomically replacing `scene.json`; a failed publication leaves the previous
record usable. Unreferenced content is retained to keep older revisions valid.

`import { SceneRevision } from 'zinc:3d/scene'` loads the format. Call
`revision.reload(text, baseDirectoryWithTrailingSlash)` at a frame boundary;
false leaves `scene`, `nodes`, `document` and `state` intact and sets `error`.
Assets are hash-checked before loading and shared across instances. Unchanged
asset IDs/hashes reuse existing mesh resources. Replaced mesh resources are freed.
The existing glTF texture decoder owns decoded image lifetime; repeated texture
replacement is not yet a bounded-memory guarantee. `cameraFor(id)` reconstructs
the authored camera including parent transforms. `state` is a string map owned
by gameplay: same scene/node ID, asset identity and component kinds preserve it;
incompatible/deleted records reset it. Authored transforms always update.
Runtime validation checks structure and asset hashes; publication revision
canonicalization is checked offline by `tools/scene-exchange` (Python and Zinc
number serialization are deliberately not assumed byte-identical).

## Skinned instances

Assets can declare `kind:"skin"`, `rootMotion:"controller"`, explicit
`events:[{clip,time,name}]`, `sockets:[{name,joint,translation}]`, and
`source:{file,object}`. Referencing nodes must be `dynamic:true`. The plain reader
rejects skins without a factory/disposer; it never substitutes a rigid pose.
Factories prepare independent instances after byte hashes validate and clean up
if they throw. Disposers must not throw. Failed candidates release new skins and
leave the previous revision live.

`import { AnimatedScene } from 'zinc:animation/scene'` supplies that boundary.
`animations` holds players by stable node ID; `sockets` uses keys such as
`companion/mouth`. Same scene/node/asset identity and compatible joint topology
preserve normalized clip phase. Event metadata updates without replay, and pending
transitions cancel. Changed asset identity makes a new player; changed topology
resets clip/phase. Gameplay reconciles actor positions/quests at that boundary.
[Lantern Post](../examples/lantern-post/README.md) executes the complete workflow.

## Static world builds

The `scene` asset importer routes a `zinc.scene` publication's `metadata.world` subtrees through the existing `world` importer. Set an explicit asset rule `{ "match": "scene.json", "as": "scene" }` to enable packed loading during `zinc run`, then load `scene.runtime.json`. The original scene remains an authoring source. `world.cell` is positive finite metres; optional `levels` is a nonempty unique subset of `near`, `mid`, `far`, matching the world's included-level option. Existing asset rule options `mid`/`far` remain the simplification ratios.

Static collision geometry is fused. Behavior, animation and explicit dynamic subtrees remain entities. Removed static IDs, source objects, collision metadata and global matrices remain in `worlds[].provenance.logicalNodes`; `sourceAssets` retains original asset IDs/hashes. The `.zworld.json` sidecar preserves the world builder's exact cell/level/chunk/batch tuples. `SceneRevision.sourcesForWorld` returns all matching authored candidates, since a fused batch may contain several objects. No per-triangle identity is inferred. See `examples/blender-world` for the actual editable project and exact commands.
