# Resource lifetime across views in Zinc Next

Research and implementation proposal, 2026-10-12. Audience: the owner and engine contributors. No engine change or new benchmark is part of this report.

## Recommendation

Connect view-owned lifetime scopes to Zinc's existing resource handles, and connect those handles to complete plugin/renderer destruction. Share immutable assets by identity; keep unused assets only within an explicit byte budget. A view's visibility and its ownership are separate concepts.

This is the smallest approach that covers native, interpreted, QuickJS, UI and immediate-mode programs without making the engine depend on one UI framework. It is a design recommendation based on the references below, not a claim that one algorithm benchmarks fastest on every target.

## What already exists

- `include/zn/native.h`: resource kinds with finalizers, `res_new`, `res_get`, `res_retain`, `res_release`.
- `src/rt/native.cpp`: indexed resource table, generation checks to reject stale handles, and finalization at the last release. Reuse this mechanism; do not create a parallel native handle registry. Audit kind allocation/namespacing and adapter support before migrating plugin APIs.
- `zinc:assets` v2: ZPK mappings, asynchronous loading on libuv, group release, reference-counted handles and a resident-byte budget (`src/host/assets_host.h`).
- Solid owners/`onCleanup`, React effect cleanup/unmount, and UI node destruction.
- Native video `close`, 3D mesh/camera `dispose` and graphics image destruction.

The missing connection is from owner lifetime to resource acquisition/release and from logical release to every CPU/GPU allocation. Asset-manager resident statistics do not currently cover all decoded raster images, GPU textures or decoder buffers.

## Evidence and useful references

| Primary source | Mechanism worth using | Constraint for Zinc |
| --- | --- | --- |
| [Godot Resource](https://docs.godotengine.org/en/stable/classes/class_resource.html) | Shared resources are reference-counted; the path cache drops them when references disappear. | A lookup cache should not automatically pin all resources forever. Explicit owners decide residency. |
| [Unity Addressables memory management](https://docs.unity3d.com/Packages/com.unity.addressables@2.7/manual/memory-assets.html) | Balance acquisition with release; dependencies have lifetimes; avoid unloading/reloading shared assets between adjacent scenes. | Bundle ownership can retain unrelated assets. Do not confuse archive/group boundaries with each decoded resource's lifetime. |
| [libGDX AssetManager guide](https://libgdx.com/wiki/managing-your-assets) and [source](https://github.com/libgdx/libgdx/blob/master/gdx/src/com/badlogic/gdx/assets/AssetManager.java) | Dependency tracking, shared references, asynchronous work and graphics-thread completion; unload releases dependencies. | Keep Zinc's workers and graphics host. A time budget cannot make one indivisible upload arbitrarily short. |
| [Solid onCleanup](https://docs.solidjs.com/reference/lifecycle/on-cleanup) | Cleanup follows reactive ownership, including effect reruns. | Register cleanup synchronously, before awaiting a load. Distinguish an effect lifetime from a whole page lifetime. |
| [Qt object ownership](https://doc.qt.io/qt-6/objecttrees.html) | Object parent ownership is separate from visual parenting. | Hiding, moving or overlaying a view must not imply destroying shared media. |
| [three.js disposal](https://threejs.org/manual/pages/how-to-dispose-of-objects.html) and [ResourceTracker](https://threejs.org/manual/pages/cleanup.html) | Removing a scene object does not dispose GPU resources; loaders can track acquired resources and destroy them together. | Track dependencies when acquired. A late traversal of the scene cannot reliably infer who owns a shared texture. |
| [Unity engineering blog](https://unity.com/blog/engine-platform/extended-q-a-optimizing-memory-and-build-size-with-addressables) | Shared asset grouping and memory/build inspection expose implicit duplication. | Address Zinc's old baked RGBA payload and newer pack payload as one resource pipeline. |
| [BitSquid developer blog: ID lookup tables](https://bitsquid.blogspot.com/2011/09/managing-decoupling-part-4-id-lookup.html) | Indexed IDs with generations make lookup fast and identify stale references. | Zinc already uses this pattern. Keep ownership counts distinct from the identity/generation itself. |
| [WHATWG cancellation](https://dom.spec.whatwg.org/#aborting-ongoing-activities) | Cancellation requires cooperation from the operation; promises alone do not cancel native work. | Cancel the consumer, then cancel shared work only when no other consumer needs it. |
| [Khronos synchronization and streaming](https://docs.vulkan.org/tutorial/latest/Building_a_Simple_Engine/Advanced_Topics/Synchronization_and_Streaming.html) | Uploads and reuse must respect outstanding GPU work. | Follow each existing backend's rules. Fixed delays such as "two frames" are not a proof of completion. |
| [Filament Engine configuration](https://github.com/google/filament/blob/main/filament/include/filament/Engine.h) | Explicit resource tracking and bounded retention policies for resource/program caches. | Cache retention is a performance policy; it must be visible and independently bounded. |

These are implementation references, not proposed engine dependencies.

## Ownership and transitions

An application scope holds common UI assets, necessary fonts and long-lived services. A view scope holds its acquisitions, exclusive players/targets, subscriptions and outstanding work. A loader returns ownership of the dependencies it acquired: model geometry, materials and textures, for example.

Releasing a scope must be idempotent. Release dependencies in a defined order. Shared asset handles decrement references; exclusive players and targets shut down. Finalizers enqueue graphics destruction on the graphics thread where needed. Reference counting needs an acyclic ownership graph: listeners and callbacks must not accidentally retain their own scope forever.

Use the following transition contract:

1. Acquire the incoming view's required assets within the existing memory budget.
2. Keep the outgoing view's references until its final transition frame.
3. Reuse shared assets through the resource identity table rather than loading a second copy.
4. Release the outgoing scope after its last use. Dispose obsolete render targets and idle video decoders by default.
5. Physically retire CPU/decoder/GPU resources when their users and outstanding operations finish. Count pending retirement against the budget until it finishes.

If two views cannot fit together, trim unused cache first. Then use a shorter transition, a lower-resolution preview, or a loading screen. Do not blindly preload an entire museum collection to guarantee a fade.

A temporarily hidden view can pause. A view actually removed from navigation releases its scope. Keep navigation state separately from heavyweight native media so going back restores the state without retaining every decoder and framebuffer.

## Asynchronous loading and caching

A load belongs to its consumer scope before it starts. On quick navigation, cancel queued work and cooperative decoding. A completion that arrives after its owner closes must release its result rather than insert it into a dead view. Generation/owner checks supplement cancellation; they do not interrupt work themselves. Shared loads need per-consumer acquisition counts, so one navigation cancellation does not cancel another view's request.

Decode on workers; upload through a graphics-thread queue with a per-frame work budget. Respect the largest indivisible operation: streaming chunks or mip levels may be necessary if one upload exceeds the frame budget. Avoid synchronous worker joins or a global GPU idle wait on each view exit; retire those resources through the existing loop and backend completion rules.

Start with immediate release of unused video decoders and heavy 3D targets. A small optional warm cache can retain reloadable images/geometry when measurements justify it. Evict only resources with no active owners, using byte-bounded LRU initially. TTL alone cannot bound memory. Count CPU data, GPU storage and retiring resources; peak overlap during transitions matters as much as steady state. Advanced eviction or cost-aware admission should follow measurements, not precede the ownership fix.

Prefer one packed source of assets and demand loading. GPU-capable targets can use Zinc's existing texture-import path and supported block formats; [Basis Universal](https://github.com/BinomialLLC/basis_universal) is a proven encoding/transcoding reference already relevant to that work. Keep a CPU representation only while a software renderer, a reader or context-recreation strategy requires it. Never discard pixels unconditionally on software targets. Immutable mapped assets can avoid heap copies when format, alignment and backing lifetime permit it; mapping compressed bytes does not eliminate decoding.

## Choice assessment

Subjective 1–5 scores using RULES.md weights: fit ×3, performance ×3, size ×2, maintainability ×2, licence/supply ×2, portability ×1, effort ×1. Performance is expected suitability, not a new benchmark. Higher effort scores mean less work.

| Option | Fit | Perf | Size | Maintain | Supply | Portable | Effort | Weighted |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Per-demo cleanup patches only | 3 | 4 | 5 | 2 | 5 | 4 | 5 | 54 |
| Scopes connected to existing native/asset handles | 5 | 5 | 5 | 4 | 5 | 5 | 3 | 66 |
| Inactivity-based texture collection alone | 2 | 3 | 4 | 3 | 5 | 4 | 4 | 47 |
| Import a separate asset/runtime framework | 2 | 3 | 2 | 2 | 4 | 2 | 1 | 34 |

Choose connected scopes and handles. Small museum cleanup patches are the first integration and proof, not a substitute for fixing image/texture destruction in the shared host and plugins.

## Tools and acceptance proof

Use the current tools first: `tools/resmon`, `zinc mem`, profiling traces and the in-app HUD. Extend resource diagnostics to report owner, kind, identity/generation, active references, CPU bytes, GPU estimates, cache age and pending destruction. The inspector should answer "which owner keeps this resource alive?".

[Apple Instruments Allocations/VM inspection](https://developer.apple.com/documentation/xcode/gathering-information-about-memory-use) separates heap allocations and mappings; [Apple's graphics-memory guide](https://developer.apple.com/documentation/xcode/analyzing-the-memory-usage-of-your-metal-app) explains footprint and graphics tracks. Metal-specific instruments apply to Metal resources, not universally to Zinc's OpenGL backend. [Tracy](https://github.com/wolfpld/tracy) is an optional profiler if allocation stacks and cross-thread timelines outgrow the current tools. It is not required to implement ownership.

The regression is a repeatable `home → model → video → home` session. After the transition, no exclusive media from old views should remain. After warm-up, repeated visits should reach a stable plateau in live handles, decoded bytes, decoder buffers, targets and GPU texture counts. Check shared assets, outgoing fades, failed loads, quick navigation and late completion. Record peak memory and frame latency; existing platform budgets govern acceptable values. RSS need not immediately return to exactly its initial value because allocators and drivers may reserve freed capacity.

First implementation step: instrument resource acquisitions/destructions and make museum sequence exit release heavy media after transitions. Then connect decoded image ownership to GPU destruction and asset handles; finally converge the baked-image/pack pipeline. No implementation, new profiler dependency or cross-platform validation was performed for this research.
