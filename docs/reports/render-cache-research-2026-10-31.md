# Retained GPU paint: research, prototype and Retina proof

Owner request, 2026-10-31: retain Retina detail, target 60 fps on the iPhone 4, and improve the shared engine for every platform rather than simplify the showcase. A lower-resolution result is not acceptance. The previous scale-1 default has been removed.

## Budget and evidence

60 Hz gives 16.667 ms between presentations. CPU submission time, GPU completion time and presentation intervals are different measurements; none alone proves smooth animation. On the iPhone 4, the existing full Retina copy costs approximately 9 ms. That leaves less than 8 ms of serial GPU budget for replay; CPU and GPU can overlap, but cold shader/cache population and stalls must be reported separately.

The previous shader-only Motion trace was about 144 ms replay at 640×960 after several optimizations. Scale-1 numbers from the prior report are rejected as a solution to this request. Repeated idle frames must not inflate an animation FPS estimate. Measurements from different scroll positions are not comparable: retain a screenshot with each trace and separate the fully visible card from the reorder list below it.

## Primary implementations and research

| Source | What to reuse in Zinc | What not to infer |
|---|---|---|
| [Flutter raster cache](https://github.com/flutter/flutter/blob/master/engine/src/flutter/flow/raster_cache.cc) and [cache key](https://github.com/flutter/flutter/blob/master/engine/src/flutter/flow/raster_cache_key.h) | Rasterize stable expensive content into a transparent premultiplied GPU surface; omit translation from identity while retaining scale and other transform dependencies. | Recording a display list is not caching its rendered pixels. |
| [Flutter display-list admission](https://github.com/flutter/flutter/blob/master/engine/src/flutter/flow/layers/display_list_raster_cache_item.cc) | Admit repeatedly used, sufficiently complex content; limit population per frame and avoid caching continually changing work. | Caching every node does not make every scene faster. |
| [Qt Quick item layers](https://doc.qt.io/qt-6/qml-qtquick-item.html#item-layers) and [renderer](https://doc.qt.io/qt-6/qtquick-visualcanvas-scenegraph-renderer.html) | Retain an offscreen subtree until its contents change; account for width × height × 4 bytes and lost batching. | A layer can cost more memory, bandwidth and blending than direct drawing. |
| [WebRender picture caching](https://doc.servo.org/webrender/picture/index.html) and [original picture-cache RFC](https://github.com/servo/webrender/issues/2533) | Use local coordinate systems and track primitive, clip, resource, opacity and transform dependencies; isolate changing regions from stable content. | Copying the whole WebRender architecture is not required for a first useful cache. |
| [SkPicture API](https://api.skia.org/classSkPicture.html) | Keep the distinction between recorded commands and retained raster content explicit. | A reusable command list does not avoid GPU replay. |
| [Loop–Blinn vector art, GPU Gems 3](https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-25-rendering-vector-art-gpu) | Cheap interiors and small analytic boundary primitives can reduce repeated per-pixel curve work. | This is a future vector-path direction, not a reason to replace Zinc's renderer before measuring it. |
| [PowerVR sorting/render-to-texture guidance](https://docs.imgtec.com/performance-guides/graphics-recommendations/html/topics/sorting-geometry-effectively-on-powervr.html) | Populate cache targets before the main render pass; finish one FBO's work before switching targets. | Repeated main→cache→main switches can force tile stores/reloads and erase the gain. |
| [Apple SGX hardware guidance](https://developer.apple.com/library/archive/documentation/OpenGLES/Conceptual/OpenGLESHardwarePlatformGuide_iOS/OpenGLESPlatforms/OpenGLESPlatforms.html) | Measure bandwidth, submission and tile behavior on the actual older GPU. | Modern GPU assumptions and desktop timings do not establish SGX535 performance. |

These are mechanisms and implementations, not a ranking based on popularity. Flutter is the closest reference for a bounded raster cache; Qt clarifies its costs; WebRender provides the longer-term dependency model. Loop–Blinn informs boundary work. No new rendering library is needed for the first cache: Zinc already has GLES2 replay, FBOs, image sampling, premultiplied blending, damage and resource accounting.

## Tools and proof plan

- [Apple's archived OpenGL ES tools guide](https://developer.apple.com/library/archive/documentation/3DDrawing/Conceptual/OpenGLES_ProgrammingGuide/ToolsOverview/ToolsOverview.html): driver/analyzer instruments, frame capture and markers. The detailed program-performance analysis requires GLES3 hardware; do not promise it on iPhone 4. Old Xcode/device compatibility must be established before relying on an instrument.
- [Imagination performance tools](https://docs.imgtec.com/performance-guides/graphics-recommendations/html/topics/analysing-application-performance.html): PVRTune counters, PVRCarbon API capture and PVRShaderEditor analysis are useful candidates. Current tools do not establish support for iOS7/SGX535. They were researched, not claimed installed or working.
- Zinc's existing `tools/zbench` and completion-time diagnostics remain the portable baseline. `gpu-time` intentionally synchronizes; it finds expensive GPU work but changes pipeline behavior. The added `gpu-batch on|off` diagnostic isolates individual replay batches with `glFinish`, also perturbing timing. Disable both before normal presentation-rate measurements.
- Keep cached/uncached pixel comparisons at Retina density, with fractional translation, changed content, alpha and external clips. The retained-surface oracle checks partial-versus-full replay, which is a different question from cached-versus-uncached equality.
- Publish hits, populations, evictions, bytes and cold costs. Preserve traces and screenshots. No 60-fps claim until the moving scene is observed at normal presentation cadence without forced completion waits.

## First shared PoC

The shared replay recognizes a bounded, self-contained paint batch beginning with a large opaque two-colour gradient and followed by simple fills and polygons. This covers generative Canvas artwork without changing its callback or demo source. It deliberately excludes text, images, shaders, arbitrary matrices, external clips, non-normal blending and resource-dependent paints; they continue through the existing renderer. It is a first reusable mechanism, not a complete subtree cache.

- Content is normalized relative to the batch origin, so translation does not invalidate it. Scale changes alter physical geometry and invalidate it. Coordinates use a 1/1024 physical-pixel canonical grid to remove floating-point cancellation noise; pixel comparisons bound the resulting error.
- Identity includes geometry, colours, per-primitive alpha, polygon topology and bounds. A full structural comparison follows the hash, so collisions cannot return another picture.
- Cached contents are rendered to a transparent RGBA FBO at physical pixel density. External clips and original paint ordering apply when the premultiplied texture is composed. Per-primitive alpha is already part of the content; no group-opacity reinterpretation is introduced.
- Admission requires three observations and at least three commands. At most two entries are populated in one preparation pass. Sixteen entries and an 8 MiB GPU limit bound memory; LRU eviction and failed-allocation fallback preserve uncached rendering. Only visible batches are admitted.
- Targets are prepared before replay of the main framebuffer. Warm composition does not read pixels to the CPU or upload the picture again. Unsupported polygons may use the existing coverage tiles during cold population; the retained result and warm composition are GPU textures.
- The existing lean image shader now handles premultiplied images directly. Rounded-clip centre/rim splitting preserves image UVs as well as fill geometry, avoiding clip samples over the whole cached image.

Control: `ZINC_GL_PAINT_CACHE=0` disables admission/composition for comparison. Cache accounting is published with GL profile counters and renderer texture memory. Tests: `gl_paint_cache_key` verifies translation-independent identity and invalidation; `gl_paint_cache` compares cold/warm, translation and mutation snapshots against the uncached Retina renderer. Shader and existing clip tests remain applicable.

## Acceptance and remaining risks

The first PoC's correctness tests pass, but this alone does not meet the performance goal. The live iPhone measurements are still being investigated: cache hits are confirmed, yet a card drag remains costly. An apparently fast trace of the reorder section must not be reported as a full-card result. Per-batch diagnostics are being used to identify the remaining work.

Cold population can still exceed a frame budget. The current admission count is per replay preparation, not a visibility-duration estimate. Dynamic/resource-dependent Canvas content and full subtree invalidation require further work before expanding eligibility. Context-loss handling must be verified alongside the renderer's existing GL object lifecycle. Pi, Android and webOS need their own same-corpus measurements; Mac and iPhone results do not prove those platforms. The implementation lives in shared replay so each backend can use it, with an uncached comparison path.
