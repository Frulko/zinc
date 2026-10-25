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

Canonical hashing uses UTF-8 JSON with sorted keys, no insignificant whitespace,
finite numbers, and excludes only the top-level `revision`. Exporters must omit
volatile timestamps and machine paths. Arrays use deterministic authoring order.
`tools/scene-exchange path/to/scene.json` verifies schema, hierarchy, typed
metadata, content hashes and revision. Exporters can import
`tools/scene_exchange` to validate/publish. Write immutable hash-named assets
before atomically replacing `scene.json`; a failed publication leaves the previous
record usable. Unreferenced content is retained to keep older revisions valid.
