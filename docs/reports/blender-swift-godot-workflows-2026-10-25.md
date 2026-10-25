# Blender, Swift and Godot workflows for Zinc

Date: 2026-10-25. Requested by the owner: investigate native Swift apps containing Zinc, Godot games exported to Zinc, Zinc UI inside Godot, and a production workflow broader than DOGWALK's Blender/Godot pipeline, with a demonstration of each integration.

Status: research completed; **implementation launched by the owner on 2026-10-25**. The specifications below describe the required outcome, not completed capabilities. Three implementation agents work in separate branches after three research agents examined Swift embedding, Blender production, and Godot interoperability. Actual implementation/test evidence belongs to the task files below; this report does not itself establish compatibility or performance.

## Implementation workstreams

The owner's delivery requirement is explicit: every demonstration is a real runnable project with source files, the native or authoring project files, a README containing exact build/run/test commands, and execution evidence. A design document or mock alone does not satisfy a task.

| Agent branch | Tasks in delivery order | Real projects to deliver |
|---|---|---|
| `feat/workflow-swift` | ZN-825 embedded surface; ZN-826 Swift host | Native embedding harness and Swift Observatory |
| `feat/workflow-godot` | ZN-827 restricted scene export; ZN-828 Zinc UI in Godot; ZN-832 LibGodot in Zinc | Parcel Yard, Godot Warehouse and a separately labelled LibGodot experiment |
| `feat/workflow-blender` | ZN-829 scene publication; ZN-830 skeletal animation; ZN-831 production showcase | Blender authoring project/add-on and scene viewer, animation lab, Lantern Post |

The Swift agent owns the common embedding ABI and implementation. The Blender agent owns the common versioned scene contract and reader; the Godot agent supplies an exporter for that contract. Dependency integration precedes acceptance of dependent features. Workers commit separately per task; the coordinator integrates and runs windowed tests alone. macOS is the initial proof platform, following repository policy.

## Recommendation

Build two reusable boundaries: an embeddable Zinc surface, and a versioned asset/scene exchange contract. Swift and Godot should share the former; Blender and a deliberately restricted Godot scene exporter should share the latter. Keep authoring data, optimized assets and runtime state separate.

Use Blender for art, level assembly, rigs and animation; Zinc for gameplay and execution; extend the existing Inspector for runtime debugging. Godot remains an optional scene authoring tool or host engine. Do not make Godot a required intermediate step between Blender and Zinc.

## What exists

| Area | Evidence | Present limitation |
|---|---|---|
| Engine embedding | `include/zn/app.h`, `src/app/app.cpp`, CMake target `zn_app`; init, tick, event and quit entry points | One active program per process; public events are SDL events; no ready-made Swift view or Godot extension |
| External display | `runtime/include/hal.h`: `HalDisplay`, `HalFrame`, `HalInput`; dispatch in `runtime/gfx.cpp` | An embedding driver and host integration still need implementing; display callbacks are global |
| Native Swift modules | `src/frontend/native_gen.cpp`, `tests/data/mobile-plugin/plugins/beep/native/ios/BeepModule.swift` | A useful application bridge, not an arbitrary public API to invoke all Zinc functions |
| iOS presentation | `targets/macos/hal_metal.mm`, `docs/reports/zinc-next-ios.md` | CPU raster with Metal presentation is not a Metal 3D renderer; native Swift embedding has not been demonstrated |
| Blender export | `examples/marble/assets/blender/build.py`, `make.sh`, `viewer.ts` | Demo-specific static art workflow; LDtk supplies Marble's gameplay level |
| Asset processing | `src/assets`, `docs/reports/zinc-next-assets.md` | Existing cache/packs/profiles do not constitute a scene editor or transactional live scene reimport |
| glTF scene loading | `plugins/3d/gltf.ts` | Preserves hierarchy, basic geometry/materials; ignores skins and animation |
| Optimized models | `src/assets/model.cpp`, `include/zn/zmesh.h` | `.zmesh` flattens model hierarchy; cannot carry articulated scene semantics unchanged |
| Zinc three compatibility | `plugins/three/addons/GLTFLoader.ts` | Its loader ignores animation, skins and morph targets; this is distinct from real three.js on QuickJS/WebGL |
| Runtime inspection | `app/inspector`, `plugins/devtools`, `src/dbg` | UI/code debugging is a base to extend, not an existing 3D scene/animation inspector |
| Physics | `plugins/physics3d` wraps Jolt | Its current manifest names desktop targets; do not promise the same physics backend on every Zinc target |

Some older reports describe states superseded by later code. In particular, do not infer that every iOS path is untested on hardware from the first simulator report, or that current 3D rendering lacks every feature listed in an old limitations paragraph.

## 1. Swift owns the native application; Zinc owns a region

The useful hybrid is a SwiftUI/AppKit or UIKit application with native navigation, documents and OS services, containing one coherent Zinc canvas, game or editor region. Zinc widgets remain Zinc-rendered widgets; embedding them does not turn them into native SwiftUI controls.

Swift can call a small C-compatible boundary. Keep C++ runtime types private; `app.h` currently uses an unguarded `extern "C"`, so provide a genuinely C-importable wrapper or guard before exposing it to Swift. Direct Swift/C++ interoperability exists, but it is unnecessary for a lifecycle and scalar-message boundary.

First investigate a `HalDisplay` embedding driver, reusing frame/input dispatch rather than introducing another rendering architecture. The Swift adapter presents its buffer in an actual native child view. Reuse the existing Metal presenter where feasible, separating its SDL-created surface from the host-provided surface. This is proposed work, not an existing surface-injection API.

The host owns ticks and serializes calls; do not call blocking `zn_app_main` from the application UI thread. Forward input in local coordinates with display scale, handle resize and suspension, and shut down predictably. Native keyboard/IME, clipboard, accessibility and safe-area handling must follow the embedded region rather than assume Zinc owns the application's key window. Reuse the existing native module bridge for a small typed command/event protocol.

Start with one instance. Supporting independent Zinc views requires removing global program, display and host assumptions, not just allocating another Swift view. A computation-only Zinc module is a smaller variant if shared business logic is the actual need. A separate desktop process is another isolation option, but does not prove in-window embedding.

### Demo A: Native Observatory

Proposed path: `examples/swift-observatory/`.

- Native Swift sidebar, toolbar and details panel surrounding a Zinc-rendered interactive observatory scene.
- Swift changes simulation speed, pauses and selects an object. Clicking an object inside Zinc updates the native details panel.
- Resize and hide/show the embedded region while the application remains responsive; use a native text field beside a Zinc input field to expose focus ownership errors.
- Acceptance: one application window and no hidden secondary Zinc window; correct Retina coordinates; pointer capture released on focus loss; no double handling of shortcuts; stopped ticks while hidden when no work is required; clean shutdown and documented supported remount behavior.
- First proof on macOS. iOS is a separate integration proof, not inferred from the existing standalone Zinc iOS export. Do not make an XCFramework a prerequisite before the integration works.

## 2. Godot owns the game; Zinc supplies its UI

Use a native GDExtension hosting the Zinc runtime and an offscreen `HalDisplay` driver. A Godot `Control` displays a persistent texture, routes local input and exchanges typed game data with Zinc. Godot owns the 3D scene, physics, audio and authoritative game state. Zinc owns its widget tree and UI interaction state.

Initial presentation can rasterize Zinc's damaged regions into an owned CPU buffer and upload to a Godot `ImageTexture`. Retain the texture and buffer; do not recreate either every frame. Damage-aware CPU rendering does not imply a partial GPU texture upload. Measure uploads separately. Share GPU resources only after a working baseline shows the copy is a material cost; Metal/Vulkan/OpenGL resource sharing is a separate backend problem.

Important alpha constraint: `HalFrame` describes `0x00RRGGBB` pixels, not ordinary RGBA output. An opaque inventory panel is easier than a transparent HUD. The demo must also prove a semitransparent panel over moving Godot geometry, including antialiased text and shadows. Establish premultiplied versus straight alpha and channel order explicitly. Existing hardware-layer compositing helpers are useful evidence, not proof that generic offscreen UI already exports alpha correctly.

Input must cover press/release, drag outside bounds, wheel, key repeats, focus transfer, text and IME. Return whether Zinc consumed the event, then let Godot handle unconsumed gameplay input. Also gate gameplay that polls Godot's global input state: accepting a UI event alone does not prevent `Input.is_action_pressed` from observing a key. A focused Zinc text field must not move the player. Use state snapshots/deltas and actions such as `useItem(id)`; do not expose raw runtime objects or serialize the entire game every frame. Godot validates actions and owns the result.

### Demo B: Godot Warehouse + Zinc UI

Proposed path: `examples/godot-zinc-ui/`.

- A small Godot 3D warehouse with pickup objects, plus Zinc inventory, searchable item list, settings and a transparent interaction HUD.
- Picking up a box in Godot updates Zinc; selecting an inventory action updates Godot; a Zinc slider changes a game setting.
- Include keyboard/gamepad focus navigation, text entry, pointer capture and a reset/reload action with defined state ownership.
- Acceptance: state changes travel both ways; no gameplay input during UI typing; transparent edges composite correctly over a moving background; correct scaling and resize; no redraw/upload for a truly unchanged UI; errors appear in Godot's console; release package works without a separately installed Zinc CLI.
- Record CPU raster, texture upload, input-to-visible-update latency and memory. No speed or footprint claim until measured.

The GDExtension and its Zinc dependencies need a build for each supported OS/architecture. Using a texture does not automatically carry native accessibility semantics, screen keyboard or clipboard integration across the boundary. Document and test these host responsibilities.

## 3. A Godot-authored game exported to the Zinc runtime

Distinguish three products:

| Product | What runs | Compatibility consequence |
|---|---|---|
| Restricted scene/asset export | Zinc gameplay and renderer | Good bounded asset reuse; Godot behavior must be explicitly mapped or rewritten |
| Godot runtime embedded in a Zinc application | Godot plus Zinc | Preserves supported Godot behavior but also Godot's runtime, renderer and platform requirements |
| General Godot-to-Zinc translator | Zinc with a Godot compatibility implementation | Requires scene tree, scripts, resources, signals, physics, animation and shader semantics; a major compatibility project |

Recommend the first as a demo; the second is an optional separate experiment. Do not promise the third as an export preset. Godot's glTF export does not transfer an executable game. Its documentation excludes 2D scenes, particles and ShaderMaterials. A `.pck` is a Godot resource pack, not Zinc bytecode or a portable game runtime.

A useful export plugin would declare a small supported set of scene nodes and properties, produce glTF plus a scene manifest, and issue a compatibility report. Transforms, mesh instances, explicitly supported materials and authored markers can map; Godot scripts, autoloads, signal wiring, CharacterBody semantics, AnimationTree, navigation, physics tuning and shaders require separate work. Pin the Godot export version and validate required glTF extensions against Zinc's actual supported set; the shared file extension is not a compatibility guarantee. Identical assets do not imply identical gameplay or rendering.

### Demo C: Parcel Yard, Godot authoring → Zinc runtime

Proposed path: `examples/godot-to-zinc/`.

- Author the same small yard in Godot: nested repeated crates, a gate, camera, spawn and interaction/collision markers.
- Export a restricted scene with shared assets and stable object identities; Zinc reconstructs it and runs Zinc-written movement and gate logic.
- Move and duplicate crates in Godot, export again, and verify transforms, sharing and identity behavior in Zinc.
- Include one deliberately unsupported shader or script. Export reports the exact node/property and fails or requires an explicit asset-only export; it must not silently discard requested game behavior.
- Acceptance: supported scene properties survive; gameplay visibly runs without Godot; missing references and incompatible features are actionable; exporting twice without changes is stable; unsupported components are never reported as compatible.

### Optional demo D: Godot game hosted by Zinc

Proposed path: `examples/zinc-libgodot/`, after the main integration demos.

Run a small existing Godot game inside a Zinc-owned desktop application, with Zinc navigation around it. This tests runtime embedding, not translation. LibGodot is experimental in the verified upstream documentation, with desktop support; mobile integration/restart coverage must be checked for the pinned release rather than assumed from conference demos or pending patches. It will not confer Zinc's older-console or MCU reach on Godot. Begin with one pinned engine version and one instance.

## 4. Blender at the center of a production workflow

The reference article uses Blender for authoring and explicit publication, glTF for exchange and custom code for asset references and game metadata. Its retrospective identifies centralized identity indexes, duplicated IDs and import-order-dependent materials as trouble spots. Preserve explicit publication while making identity validation and deterministic dependency resolution part of the design.

The goal here is broader: library management, assembled levels, animated characters, reproducible builds, safe reimport, runtime inspection and diagnosable target constraints. A static model viewer or a rigid puppet alone would not prove that workflow.

### Authored data and ownership

| Domain | Authoritative owner | Exchange/runtime contract |
|---|---|---|
| Models and materials | Blender libraries | Stable asset ID, dependency list, geometry/material definitions and target variants |
| Scene assembly | Blender collections and instances | Object IDs, parent/reference IDs, transforms, cameras, lights, collision shapes, sockets, triggers and spawn markers |
| Rig and animation clips | Blender | Skeleton identity/rest pose, weights, named clips, time units, interpolation, loop policy and optional event tracks |
| Gameplay | Zinc code | Validated behavior identifiers and typed exported properties; no arbitrary Python/script execution from art metadata |
| Live gameplay state | Runtime | Position/velocity, quest progress, transient animation state and player inventory; not written into the source `.blend` |
| Build artifacts | Asset pipeline | Content hashes, dependency versions, importer/tool versions, target profile, packs and source map |

Keep asset identity distinct from content hash: editing an asset changes its content without changing every reference. Generate local IDs at creation/publication, detect duplicate IDs and cyclic/missing dependencies, and build the searchable index from individual manifests. A name or path is useful for display, not the sole identity. Regenerating duplicated identities needs explicit source ownership; never repair a referenced identity arbitrarily.

Preserve nested asset references rather than expanding every collection instance into copied geometry. Share meshes/textures between instances; merge only compatible static geometry into chunks as a build optimization. Keep articulated transforms, sockets, collisions and debug identities outside flattened `.zmesh` data. Ship a source map from runtime entities and optimized draws back to Blender file, collection, object and asset revision.

### Publish, validate, build and reimport

1. Artist edits a work `.blend` and previews using an agreed material/light subset.
2. A Blender extension validates selected assets/scenes and previews the export plan, dependency changes and warnings.
3. Explicit Publish writes exchange assets and versioned manifests to staging; unsupported constructs require a bake or a clear error. Generated geometry/constraints can be evaluated/baked; Blender Python, arbitrary node graphs and simulation do not become runtime features automatically.
4. Reuse Zinc's content-addressed asset cache, importers, target profiles and ZPK grouping. Include tool versions and dependencies in cache keys; add animation/scene importers where existing importers do not cover them.
5. Validate the complete revision before committing it to the running scene. Failed import leaves the previous playable revision active.
6. Apply supported changes by stable IDs. Preserve compatible gameplay state, selection and unaffected animation instances; explicitly reset incompatible skeleton/collision/topology state rather than claiming universal seamless reimport.
7. Retain diagnostics and a reversible revision boundary. Disk watchers should consume completed publication records, not partially written GLB/JSON files.

Runtime Inspector edits are temporary overrides by default. Applying an override back to Blender is an explicit later operation with source-revision checks; two-way automatic writeback would otherwise introduce competing sources of truth.

### Animation is a necessary engine feature

Implement skeletal glTF import and playback rather than designing the showcase to avoid it. Keep authoring rigs separate from exported deform skeletons: constraints/IK can be baked, but a runtime IK feature needs its own implementation. Define coordinate/scale conventions, bind matrices, joint limits per profile, weight normalization and supported interpolation. Validate negative/nonuniform scales and skeleton compatibility rather than silently producing broken poses.

Evaluate **ozz-animation** as the runtime/offline foundation. Its upstream features include glTF conversion, compressed animation, sampling, blending, masks, additive animation, motion extraction and IK helpers, under MIT. It is not a renderer, mesh/material importer or high-level animation state graph. Zinc would still need its scene/skin integration, GPU or CPU vertex deformation, transition policy, event dispatch and tooling. It is a candidate to pin and measure, not an installed capability of Zinc.

The first production slice needs idle/walk/run/interaction transitions, synchronized locomotion, a clip timeline, attachment sockets and events. Export event markers explicitly in metadata rather than assuming Blender glTF or ozz transfers them automatically. Define event behavior across loops, reverse/seek, skipped frames and live replacement; scrubbing must not repeatedly fire gameplay actions. Separate animation preview time from simulation time. Root motion needs a declared owner: the animation or character controller, never both applying displacement. A robust character motor also remains work: Zinc's vendored Jolt subset excludes the upstream character subsystem.

Stop-motion playback can quantize visual pose sampling while movement, camera and collision remain responsive. This is a style option on top of real skeletal animation, not a substitute for it. DOGWALK's animation article explicitly discusses the tension between 8–12 fps poses and responsive gameplay.

### Material and target contract

The present Zinc renderer is not an Eevee/Godot PBR equivalent. Define a small documented preview/export contract and bake unsupported procedural effects; label approximations. Material sharing must resolve to one authoritative definition, independent of import order. Test base color, color space, alpha, normals and lighting separately before claiming visual correspondence.

Generate target reports for triangles, draws, texture dimensions/memory, skeleton/joint/weight limits, active animated characters, pack sizes and unsupported features. Desktop is the first implementation/proof platform under the current repository policy. Variants can reduce geometry, texture size and animation cost, but do not promise this full scene on every console/MCU. Missing skinning or physics backends require explicit incompatibility, not an unexplained fallback.

### Runtime debug workflow

Extend the existing Inspector/DevTools transport with namespaced scene and animation operations; do not pretend 3D objects are existing DOM nodes. Provide:

- Select in the running game, inspect hierarchy/provenance, and locate the source Blender object; Blender selection can request runtime highlighting in the connected dev session.
- Show collision shapes, trigger volumes, joints, attachments, bounds, LODs and missing assets/material fallbacks.
- Pause simulation, step a fixed tick, orbit the debug camera, scrub a selected clip, inspect blend weights/current state and visualize root motion.
- Inspect CPU/GPU/frame costs, allocations, asset residency and import/cache decisions with object/asset attribution where available.
- List reload revision, changed dependencies and rejected changes; compare before/after captures with the same camera and declared renderer settings.
- Record a small input/reload scenario for regression replay. Fixed inputs are not a guarantee of bit-identical physics across every backend.

Development control stays local or on an explicitly paired device session. Source selection/writeback is a tool capability with path validation, not arbitrary file execution from a downloaded scene.

### Demo E: Lantern Post, Blender × Zinc production showcase

Proposed path: `examples/lantern-post/`.

A hand-crafted dusk village with a small courier and an animated animal companion. Deliver three parcels: open a gate, cross a moving bridge and attach a lantern to the companion's harness. Keep a compact 3–5 minute route so the demonstration exercises the pipeline rather than spending the effort on a large game.

Everything visual and spatial is authored in Blender: nested house/prop libraries, instanced trees, the level, collision primitives, triggers, cameras, skeletons, sockets and named clips. Zinc supplies movement, interaction, game rules and UI. The animal has an actual deforming skeleton; visual pose stepping is optional. Include a compact asset browser/animation preview in the tools rather than only the final playable route.

The scripted presentation demonstrates the complete workflow:

1. Browse a model library, inspect dependencies/variants and preview the companion's clips.
2. Publish the assembled level and play it in Zinc.
3. Select an in-game gate, highlight its Blender source, move it in Blender and republish. Preserve completed deliveries when the change is compatible.
4. Edit the companion's walk clip, republish, observe the new revision and inspect idle/walk/run blending and attachment behavior.
5. Pause, step and scrub in the Inspector; show collisions, skeleton, event markers and asset costs.
6. Break an asset reference or export a forbidden material; show an actionable error while the last valid world remains playable.
7. Build a reduced desktop profile and compare budgets, clearly separating that from unperformed console/mobile verification.

Acceptance: instances share assets; nested transforms survive; skeletal animation really deforms the mesh; scene/clip changes reimport safely; events are not duplicated by seeks; unsupported data is diagnosed; the source map survives optimization; an unchanged second publication produces stable artifacts and no unnecessary import; a failed publication does not destroy the playable revision. Add a targeted scripted game session, visual golden and importer/identity/reload failure tests.

## Delivery order and demo gates

| Order | Deliverable | Gate |
|---|---|---|
| 1 | Embedding/display spike | One offscreen runtime, externally driven ticks/input, explicit pixel/alpha format, no unexpected window |
| 2 | A and B | Real Swift child view and real Godot UI integration; lifecycle, focus, two-way state and packaging proven |
| 3 | Shared scene contract and C | Stable identities/references, compatibility report and validated reconstruction |
| 4 | Blender library/scene publication | Nested assets, source mapping, deterministic incremental builds and atomic failed-import behavior |
| 5 | Skeletal animation vertical slice | One real character, clips/blends/events/sockets and Inspector playback controls |
| 6 | E | Complete artist-to-runtime iteration and playable showcase, including intentional errors |
| Optional | D | Pinned LibGodot desktop embedding, clearly separated from Godot-to-Zinc conversion |

These are delivery slices, not estimates or completed backlog tasks. Avoid a universal Godot translator, a second full scene editor duplicating Blender, an unmeasured shared-GPU-texture layer and a multi-instance runtime rewrite as prerequisites. Keep the broad production goal; prove it through complete vertical slices.

## Primary references

- [Blender Studio: Our Workflow with Blender and Godot](https://studio.blender.org/blog/our-workflow-with-blender-and-godot/) — explicit publication and asset interchange; retrospective lessons. The summary in this report is deliberately brief; the remaining pipeline is a Zinc proposal.
- [Blender Studio: Playable Stop Motion in Godot](https://studio.blender.org/blog/playable-stop-motion-in-godot/) — stepped pose sampling and responsive movement.
- [Godot: Exporting 3D scenes](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/exporting_3d_scenes.html) — glTF export and limitations.
- [Godot: GDExtension](https://docs.godotengine.org/en/latest/engine_details/engine_api/gdextension/index.html) — native extension boundary.
- [Godot: FAQ, using Godot as a library](https://docs.godotengine.org/en/4.6/about/faq.html#is-it-possible-to-use-godot-as-a-library) — experimental LibGodot desktop support.
- [Godot: Custom platform ports](https://docs.godotengine.org/en/4.6/engine_details/engine_api/custom_platform_ports.html) — platform/renderer work remains necessary.
- [Godot: Packs, patches and mods](https://docs.godotengine.org/en/stable/tutorials/export/exporting_pcks.html) — PCK resource packs.
- [Apple: UIViewRepresentable](https://developer.apple.com/documentation/swiftui/uiviewrepresentable) — native view lifecycle within SwiftUI; does not itself supply a Zinc surface adapter.
- [Swift: Mixing Swift and C++](https://www.swift.org/documentation/cxx-interop/) — language interoperability.
- [ozz-animation: Features](https://guillaumeblanc.github.io/ozz-animation/documentation/features/), [Overview](https://guillaumeblanc.github.io/ozz-animation/documentation/) — candidate animation foundation and explicit boundaries.
