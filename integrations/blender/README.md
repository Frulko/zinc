# Zinc Scene Publisher

The extension publishes explicit identities, mesh references, nested collection
instances, local transforms, cameras and typed gameplay markers to `zinc.scene`
v1. It is an authoring tool, not a Blender runtime or an Eevee renderer.

From the Zinc checkout:

```sh
tools/build-blender-extension /tmp/zinc-scene.zip
```

In Blender 4.2 or newer, Preferences → Get Extensions → Install from Disk, select
the ZIP and enable it. In File → Export use **Zinc: Assign missing identities**
once, then **Zinc: Publish scene**. Set the publication directory and the
project-relative source path, for example `authoring/library.blend`. Save the
`.blend` after assigning identities. Publishing never changes source IDs.

Objects store `zinc_id`; mesh datablocks store `zinc_asset_id`; the scene stores
`zinc_id`. Linked instances share one mesh asset. Nested collection instances
retain distinct composite instance IDs (`instance-id/source-object-id`). Rename
and move preserve references. Duplicating objects also copies Blender custom
properties: deliberately assign a fresh UUID to the new object's `zinc_id` before
publishing; duplicate IDs are rejected rather than silently repaired.

Author metadata in the object's string custom property `zinc_metadata`, as JSON:

```json
{"collision":{"shape":"box","size":[2,1,0.2]},"gate":{"name":"courtyard"}}
```

Metadata dimensions use exchange coordinates: metres, Y up, full extents.
An object or collection can hold `{"world":{"cell":8}}` in `zinc_metadata`.
The publisher validates cell size, retains every static source identity in
`worldSources`, and preserves behavior/animated/dynamic descendants as entities.
Use the object boolean `zinc_dynamic` for an explicit dynamic subtree. Static
collision geometry is eligible for merging. World binary compilation is pending
the Tokyo `.zworld` importer integration; the current viewer refuses world-marked
publications and keeps its last valid revision. Optional `levels` remains opaque
until that importer defines its serialization. Do not use it as a working LOD
control yet.
[The contract](../../docs/scene-exchange.md) lists the allowed marker types.
Source transforms convert from Blender Z up exactly once. Perspective cameras
preserve their local -Z view direction and use the render aspect ratio for FOV.

The static profile supports meshes, empties/collection instances, perspective
cameras, flat Principled base color and double-sided geometry. Bake modifiers and
constraints explicitly before publishing; unsupported objects and shader graphs
fail with a source name. Metallic/roughness values have no PBR parity promise in
Zinc. Skins and animations require the separate animation pipeline, and are not
silently described as supported by this static publisher. Lights, particles,
nonzero collection instance offsets and executable author scripts are excluded.

All referenced bytes validate before `scene.json` is atomically replaced. Meshes
are immutable SHA256-named GLBs; unchanged bytes are reused. Old content is kept
so failed/older revisions remain usable. Publish to a dedicated directory; prune
unreferenced content only after old consumers have been closed.

The runnable [library project](../../examples/blender-library/README.md) includes
a saved `.blend`, deterministic authoring generator, actual Blender/Zinc captures
and exact headless exporter checks. No Blender installation is needed to run the
published Zinc app.

A skinned library instance uses string property `zinc_skin`, for example
`{"id":"companion-v1","file":"//dog.glb","metadata":"//dog.animation.json","source":"authoring/dog.blend"}`.
The GLB and metadata are published by the character library first; the scene
publisher copies immutable GLB bytes and embeds validated events/sockets/source
metadata in the same atomic scene revision. Its linked collection remains visible
in Blender but is not expanded into rigid runtime geometry. The
[Lantern Post](../../examples/lantern-post/README.md) source project demonstrates it.
