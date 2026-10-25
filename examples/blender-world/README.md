# Blender world publication

An editable Blender collection becomes a streamed Zinc world. This example reopens the real Lantern Library project, marks its square collection with `world: {cell: 4, levels: ["near", "mid", "far"]}`, and saves `authoring/world.blend`. No external art downloads are required.

From the repository root:

```sh
/opt/homebrew/bin/blender --background --python examples/blender-world/authoring/build.py
tools/scene-exchange examples/blender-world/assets/scene.json
build/zinc assets build examples/blender-world
ZINC_BACKGROUND=1 build/zinc run examples/blender-world
ZINC=build/zinc tests/run --only blender_world
```

The explicit `scene` asset rule enables packed asset loading for `zinc run`. Read `scene.runtime.json` in Zinc; `scene.json` stays the editable authoring publication. The existing world importer emits ZWD1/ZWC1 geometry, cell/material batches and near/mid/far chunks. `levels` includes named levels; the existing `mid`/`far` asset rule options control simplification ratios. This is Zinc's material renderer, without Blender/Eevee lighting parity.

The source has 26 nodes. Its 14 static descendants become world geometry and provenance, leaving 12 entities and four retained mesh assets. Static wall collision metadata is retained in the provenance logical nodes; cameras, sockets, triggers, gates and dynamic subtrees remain scene entities. When a retained descendant's parent was fused, its global transform becomes its root TRS; shear is rejected with a diagnostic.

`SceneRevision.updateWorlds(camera, aspect, dt)` selects and loads visible chunks. The initial import validates all chunks before swapping the scene, and keeps the coarsest available chunks resident. Dispose the revision when finished. Identical worlds reuse handles; failed imports retain the last valid scene and failed asset builds retain the previous pack.

The importer-produced `<world>.zworld.json` keeps its authoritative `sources[].in` tuples `[cell, level, chunkFilename, batch]`, plus `logicalNodes` (authored IDs, source Blender object, metadata and global matrix) and `sourceAssets` (original asset IDs/hashes). `sourcesForWorld(worldId, chunkIndex, batchIndex, cellIndex)` returns Inspector candidates. Fused batches can contain several objects; this API does not claim per-triangle identity. Logical nodes without triangles remain in provenance with no invented cell mapping.

Current budget: provenance is loaded with the small scene manifest and every chunk is validated synchronously on import. Large production scenes need measured background staging; no large-world timing or memory claim is made by this fixture. The renderer and streaming format are the existing Tokyo world implementation.
