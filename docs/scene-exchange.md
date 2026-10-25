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

The authoring boundary also accepts `world:{cell:<positive finite metres>}` on a
parent or instanced collection. Optional `levels` is preserved as authoring data;
its meaning/validation must come from the upcoming `include/zn/zworld.h` importer,
not from this publisher. It is not currently executable world configuration.
`dynamic:true` on a node keeps that subtree as normal runtime entities. Blender
sets it for `zinc_dynamic`, animated objects and active rigid bodies. Trigger,
socket, spawn, gate, interaction and camera subtrees also remain entities; ordinary
static collision geometry can be merged. `partition_world` prepares static source
records without deleting any authored nodes and emits `{node,source,world}` seed
provenance. Blender includes it as `worldSources` in the publication when needed.

**World baking is pending the Tokyo `.zworld` importer integration.** The builder
must supply actual cell/batch ranges and retain every source ID before static
records can be removed from the runtime scene. The current runtime rejects a
raw world-marked publication atomically, keeping the previous scene, rather than
creating thousands of individual nodes or pretending a world was compiled. No
new world binary, batch identity scheme or level thresholds are defined here.

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
