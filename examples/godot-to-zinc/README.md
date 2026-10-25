# Parcel Yard: Godot authoring → Zinc runtime

Open `godot/project.godot` in **Godot 4.6-stable**. The yard is a real editable
Godot scene: move or duplicate crates, assigning a fresh `zinc_id` to each new
node. Crates share one mesh resource with its own persistent `zinc_asset_id`.
Choose **Project → Tools → Publish Zinc scene**. Python 3 must be on PATH.

From the repository root on macOS:

```sh
GODOT=$(tools/godot/fetch)             # official pinned, checksum-verified tool
"$GODOT" --headless --path examples/godot-to-zinc/godot --script export.gd
tools/scene-exchange examples/godot-to-zinc/assets/scene.json
build/zinc check examples/godot-to-zinc
ZINC_BACKGROUND=1 build/zinc run examples/godot-to-zinc
GODOT="$GODOT" tests/run --only godot_export
```

The checked-in publication runs without Godot or Python. Arrow keys move the
courier; approach the gate and press A to deliver/open it. Godot supplies assets,
hierarchy, camera and typed markers; `src/state.ts` supplies gameplay. `src/main.ts`
routes input and frames, and `src/hud.ts` draws the readout. The shared
`zinc:3d/scene` loader validates a complete revision before swapping it.

This exports a deliberately restricted subset, not Godot games. Supported nodes:
Node3D, MeshInstance3D (shared static meshes), Marker3D and perspective Camera3D.
Local TRS, simple mesh materials and the typed components in
[`docs/scene-exchange.md`](../../docs/scene-exchange.md) survive publication.
Scripts, hidden nodes, ShaderMaterial, material overrides, unknown node/component
kinds and required glTF extensions are errors with source paths. Bake unsupported
visuals and implement behavior in Zinc. Physics semantics and PBR parity are not
transferred. Zinc uses its existing software 3D/glTF renderer.

Stable authored identities are separate from immutable SHA256-named GLB content.
The editor and command-line exporter call the same shared Python validator.
Only the validated `scene.json` rename publishes a revision; failures leave the
previous scene and immutable assets usable. An unchanged export keeps manifest
bytes/mtime. Temporary `.staging` output is ignored. No source writeback occurs.

Verified on the development Mac: Godot 4.6 official headless export, repeated
publication, shared mesh identity, duplicate ID/script/material rejection. Other
platforms and matching Godot/Zinc shading are not claimed.

For static-world authoring, set a parent node's `zinc_world` metadata dictionary
(e.g. `{"cell":16.0,"levels":["near","mid","far"]}`); `zinc_dynamic=true` keeps
an articulated subtree separate. Publication retains the exact world options
and per-static-object `worldSources` provenance. Gameplay markers remain dynamic
entities. This is source publication for the shared `.zworld` asset builder;
the raw world-marked document is intentionally rejected by `SceneRevision` until
compiled. It is never silently expanded into thousands of regular runtime nodes.
The ordinary playable Yard does not use world grouping.
