# Test the Swift, Godot and Blender workflows on macOS

This guide is for developers and artists trying the workflow demos from a Zinc
checkout. Start with the published scenes and built apps; then edit a source
project or collect performance data. Run commands from the repository root.

## Choose a demo

| Demo | What runs | What to try |
|---|---|---|
| [Swift Observatory](../../examples/swift-observatory/README.md) | Native SwiftUI shell hosting Zinc | Native controls, Zinc selection, resize, pause and hide/show |
| [Godot Warehouse](../../examples/godot-zinc-ui/README.md) | Godot game with a Zinc UI through GDExtension | Collect a parcel, search inventory, change speed, return keyboard focus to the game |
| [Pocket Rally](../../examples/zinc-libgodot/README.md) | Zinc host embedding real LibGodot | Play the game and interact with the surrounding Zinc navigation |
| [Parcel Yard](../../examples/godot-to-zinc/README.md) | Zinc game using a published Godot scene | Move the courier and deliver at the gate; edit the source scene and republish |
| [Blender Library](../../examples/blender-library/README.md) | Zinc scene using published Blender assets | Shared assets, nested instances and source identities |
| [Animation Lab](../../examples/animation-lab/README.md) | Zinc with a real skinned Blender companion | Clip blending, pause, seek, pose stepping, events and mouth attachment |
| [Lantern Post](../../examples/lantern-post/README.md) | Playable Zinc courier game authored in Blender | Deliver parcels, inspect collisions and animation, reload an artist revision |
| [Blender World](../../examples/blender-world/README.md) | Zinc scene with static descendants baked into `.zworld` | Source provenance and retained scene entities |

Exporting a Godot scene transfers the supported scene data; its GDScript gameplay
does not become Zinc code. Embedding LibGodot runs the actual Godot engine.

## Prepare the checkout

You need macOS, Xcode command-line tools and CMake to build the native hosts.
Published standalone scenes do not require Blender or Godot to play.

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
tools/build zinc zn_app
```

If the apps already exist, skip their build steps below. Build one host at a time.
Close each demo before starting the next. Click its window when you want to
interact. `ZINC_BACKGROUND=1` keeps Zinc and Swift windows from taking focus.

## Launch the native apps

Swift Observatory:

```sh
examples/swift-observatory/build.sh
ZINC_BACKGROUND=1 'examples/swift-observatory/build/Native Observatory.app/Contents/MacOS/Observatory'
```

Change speed, pause the animation, select a Zinc object, resize the native window,
and hide/show the surface. Controls should continue to work after showing it again.

Godot Warehouse:

```sh
GODOT=$(tools/godot/fetch)
examples/godot-zinc-ui/build.sh
GODOT="$GODOT" examples/godot-zinc-ui/package.sh
ZINC_BACKGROUND=1 examples/godot-zinc-ui/build/Warehouse.app/Contents/MacOS/Warehouse
```

Arrow keys move; Space collects a nearby parcel. Click the Zinc search field,
filter the catalogue, use a collected parcel, drag the speed slider and reset.
While the UI has focus, typing must not move the player. Escape returns keyboard
focus to gameplay. The 3D scene remains visible behind the translucent UI.

Pocket Rally:

```sh
examples/zinc-libgodot/build.sh
examples/zinc-libgodot/package.sh
ZINC_BACKGROUND=1 'examples/zinc-libgodot/build/Zinc Pocket Rally.app/Contents/MacOS/Launcher'
```

Its first build downloads pinned Godot sources and builds a shared engine; this
is substantially larger than building the Zinc host. Reuse the existing build
when available. See the demo README for library/cache overrides.

## Launch the published scenes

Run one command at a time, closing its window before the next:

```sh
ZINC_BACKGROUND=1 build/zinc run examples/godot-to-zinc
ZINC_BACKGROUND=1 build/zinc run examples/blender-library
ZINC_BACKGROUND=1 build/zinc run examples/animation-lab
ZINC_BACKGROUND=1 build/zinc run examples/lantern-post
```

In Parcel Yard, move with the arrows and press A near the gate to deliver/open it.

In Animation Lab, Enter switches clips, Space pauses, Left/Right seeks, X steps
one pose, Up/Down changes speed and C toggles looping. Watch the skin deform and
the stick follow the mouth. Seeking must not replay gameplay events.

In Lantern Post, use arrows/WASD to move, X to run and Space to open/deliver.
Complete the three deliveries. C opens the in-demo Inspector, Tab cycles sources,
Q pauses the pose, E steps it, and Enter reloads. V exercises rejection of a bad
revision; the last valid scene should remain playable.

For Blender World, build the packed scene before launching:

```sh
tools/scene-exchange examples/blender-world/assets/scene.json
build/zinc assets build examples/blender-world
ZINC_BACKGROUND=1 build/zinc run examples/blender-world
```

Press Right to cycle source records. The fixture has 26 authored nodes: 14 static
descendants become world geometry/provenance, leaving 12 scene entities. Source
records show the original Blender file and object. This is a small integration
fixture, not a production-scale streaming benchmark.

## Edit in Blender and reload Lantern Post

1. Build the extension ZIP: `tools/build-blender-extension /tmp/zinc-scene.zip`.
2. In Blender, install and enable the ZIP through Preferences → Get Extensions →
   Install from Disk. See the [publisher instructions](../../integrations/blender/README.md).
3. Open `examples/lantern-post/authoring/lantern.blend`. Keep linked library files
   at their repository-relative locations. Move an existing object to preserve its identity.
4. Start the live-file viewer:

   ```sh
   ZINC_BACKGROUND=1 ZINC_SCENE_DIR="$PWD/examples/lantern-post/assets" build/zinc run examples/lantern-post
   ```

5. Use File → Export → Zinc: Publish scene, publishing to
   `examples/lantern-post/assets/`. Press Enter in the game to reload.
6. Inspect the changed placement and retained delivery progress. Publish character
   library changes before the scene that references them. Keep stable IDs; copied
   objects need new IDs, and duplicate IDs are rejected.

For a repeatable animation-and-scene edit using the saved `.blend` projects,
follow [Real artist iteration](../../examples/lantern-post/README.md#real-artist-iteration).
Those generator/revision scripts rewrite demo authoring outputs; they are not
required for an ordinary play test.

For world publication, put this JSON in a collection or parent object's string
custom property `zinc_metadata`:

```json
{"world":{"cell":4,"levels":["near","mid","far"]}}
```

Publish, validate with `tools/scene-exchange`, then run `zinc assets build` on the
project. Static descendants become `.zworld` geometry instead of SceneRevision
entities. The provenance maps Blender sources to cells/chunks/batches; a merged
batch may have several source objects. See the [world demo](../../examples/blender-world/README.md)
for dynamic descendants, collision metadata and the exact source-map API.

## Run the automated proofs

Run these sequentially; each covers a different integration boundary:

```sh
tests/run --only swift_observatory
tests/run --only godot_zinc_ui
tests/run --only godot_export
tests/run --only animation_lab
tests/run --only lantern_post
tests/run --only blender_world
```

The native-window proofs are separate from compilation/headless checks:

```sh
tests/run --tier demo --only swift_observatory_native
tests/run --tier demo --only godot_zinc_ui_visual
tests/run --tier demo --only zinc_libgodot_native
```

A passing graphical script checks its assertions and clean shutdown; inspect its
capture as directed by the demo README. On failure, keep the test log under
`.logs/` and the launch command. Run from Terminal to see native launch errors.

## Reproduce the macOS measurements

Prepare all three native hosts and the standalone world assets first. Finish
builds and close other demo instances before measuring. Use a fresh output path:

```sh
GODOT=$(tools/godot/fetch)
GODOT="$GODOT" tools/bench-workflows-macos --out /tmp/zinc-workflows.json
```

The tool runs finite background windows sequentially: three passages per case,
330 callbacks with the first 30 excluded, then separate live physical-memory
snapshots. It waits for build-free gaps and rejects passages when it observes a
build. Logs go to `.logs/workflow-perf/`; results go to the requested JSON file.
Use `--resume` with the same output/counts after an interruption. For one integration,
use e.g. `--cases swift-idle,swift-active`.

Read the [measured baseline and boundaries](../reports/workflow-macos-performance-2026-10-25.md)
before comparing results. Callback cadence is not displayed FPS; CPU spans do not
measure GPU completion. Physical footprint differs from peak RSS, and package
size measures neither. LibGodot cadence varies between passages. The optional
Godot editor-import documentation-cleanup crash remains a known issue; do not
run an editor import as a prerequisite for the ordinary packaged game.
