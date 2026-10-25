# Lantern Library

A real Blender → Zinc static scene workflow: two cottages instance the same
nested lantern library, with shared mesh buffers, an authored camera, gate box,
delivery trigger, courier spawn and light sockets. Zinc owns the gate's live
state. The scene is intentionally simple; it does not claim PBR or animation.

From the repository root:

```sh
build/zinc check examples/blender-library
ZINC_BACKGROUND=1 build/zinc run examples/blender-library
```

Click/tap the bottom actions or use Enter (reload), Space (gate), Right (next
source record), X (reject a malformed revision). The selected record shows its
exact authoring object and stable ID. No source link executes a command.
Idle frames retain the prior picture instead of redrawing the 3D scene.

To recreate the source project and publication with Blender 5.2.1 LTS:

```sh
blender -b --factory-startup -P examples/blender-library/authoring/build.py
blender -b examples/blender-library/authoring/library.blend -P examples/blender-library/authoring/verify.py
tools/scene-exchange examples/blender-library/assets/scene.json
build/zinc assets build examples/blender-library
ZINC=build/zinc tests/run --only scene_exchange
ZINC=build/zinc tests/run --only blender_library
```

The authoring check exports twice (identical revision and untouched commit-record
mtime), rejects a duplicated source ID without changing the active publication,
then moves the gate and proves unchanged mesh assets are reused. Content hashes
can differ with another Blender/glTF exporter version; the version is provenance.

For artist iteration, install the [extension](../../integrations/blender/README.md),
open `authoring/library.blend`, and run the viewer against live files:

```sh
ZINC_BACKGROUND=1 ZINC_SCENE_DIR="$PWD/examples/blender-library/assets" build/zinc run examples/blender-library
```

Open the gate in Zinc. Move the gate/cottages in Blender, publish to `assets/`,
then press Enter in Zinc. Authored placements update and gate progress survives.
Deliberately duplicate an ID and publish: Blender reports the two objects and
keeps the previous manifest. The X action separately demonstrates runtime failure
recovery. Reimport is explicit at a frame boundary; there is no partial-file watcher.

`src/main.ts` mounts the stage, `state.ts` owns revision/gate state and file input,
and `view.ts` displays the scene and provenance. `authoring/build.py` is the
reproducible original art source; `library.blend` is the actual generated editable
project. Blender and Zinc previews are separate captures, not a parity golden.
The generator creates original meshes without external art downloads.

Supported proof platform: development Mac. The existing Zinc asset cache and ZPK
builder pack the raw GLBs and manifest; the semantic scene is never flattened to
`.zmesh`. Mesh resource replacement is released; the existing glTF image decoder
does not yet guarantee bounded memory under repeated texture replacements. This
sample uses flat colors with no texture replacement. Other platforms and scene
resource budgets remain unverified.
