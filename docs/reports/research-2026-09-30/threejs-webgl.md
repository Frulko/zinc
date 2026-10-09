# Running the complete Three.js + WebGL/WebGL2 API on the Zinc toolchain

Research only. Repo /Users/mowmow/Lab/zinc was read, not modified (working tree dirty; I read the working-tree files).
Date 2026-09-30. "V" = verified by reading code/docs or running something. "I" = inferred / recalled, not verified.

## 0. Executive summary

1. **Nothing WebGL-shaped exists in Zinc today (V).** `grep -i webgl` hits only reports/docs. The GL code (`plugins/display-gl`, 1075 lines in 4 files) is an internal 2D compositor in a GLSL ES 1.00 dialect (`zgl.h:2-3`, `display_gl.cpp:43-47`), on **GL 3.2 core (macOS, SDL3, `sdl.cpp:17-20`)** and **GLES 2.0 (Linux/Pi, EGL+GBM+KMS, `kms.cpp:193` `EGL_CONTEXT_CLIENT_VERSION, 2`)**. Three.js >= r163 needs WebGL2 (GLES 3.0), so **neither existing context is enough**.
2. **Zinc has no ArrayBuffer/typed arrays in the language (V, `docs/guide/09-web-apis.md:87`)** and the native ABI only moves *copied, read-only* byte/number snapshots (`docs/engines.md:93-95`, `zinc_abi.h:25-28`). Upstream Three.js is dynamic JS that lives on typed arrays (three r186 src: 84 Float32Array, 47 Uint32Array, 38 Uint16Array, 33 Uint8Array, 33 ArrayBuffer refs, V by grep). So the only credible host for **upstream** Three.js is a real JS engine. That is **QuickJS(-ng)**, already vendored (`plugins/script/vendor/quickjs`, v0.17.0) and already a Zinc engine (`--engine quickjs`, `runtime/vm/quickjs.cpp`).
3. **zinc-vm cannot run upstream Three.js**, honestly: it is a typed-language VM (`docs/engines.md:29-41`), Dyn shapes/ICs are still a plan (`docs/reports/zinc-vm.md:105-121, 421` "V4"), `zinc:script` is "still unavailable" in the VM (`engines.md:39`), and there are no typed arrays. What zinc-vm (and native) *can* do: run a **typed Zinc program that owns a QuickJS instance** (the `zinc:script` plugin pattern, ~1 MB) and/or call a typed WebGL2 API, once the ABI gets shared mutable buffers.
4. **Best architecture (recommendation):** one native "WebGL2 context" library (C++, ~224 methods, ~550 constants, ~25 extensions) on a **GLES3-native backend** (system GLES 3.x on Linux/Pi 4/5, **ANGLE** on macOS), bound *directly* to QuickJS-ng through its C API (zero-copy typed arrays, no Zinc ABI in the hot path), plus a small JS "browser host" bundle (canvas, Image, fetch, events, rAF, TextDecoder, URL/Blob, WebAssembly, Worker). Do **not** copy three-native's design (sokol_gfx + textual GLSL rewriting); it fights the WebGL state machine.
5. **Measured today (V, this machine, M-series Mac; scripts in scratchpad):** with a *mock* GL (no-op Proxy, so JS-side cost only), Three r186 `renderer.render()` for 500 MeshStandardMaterial cubes costs **0.81 ms in node/V8 vs 11.4 ms in QuickJS (14x)**, and 1000 cubes 1.9 vs 25.7 ms. A scene-graph-only benchmark (1000 animated objects, updateMatrixWorld + frustum cull) is **0.19 ms vs 5.7 ms (30x)**. GL calls per frame: ~6 per draw (about 2100 calls for 351 draws). **The JS<->native crossing is not the bottleneck; Three.js's own JS running on an interpreter is.** Expect a budget of a few hundred draw calls at 60 fps on desktop, far fewer on a Pi. A JIT engine (JSC/V8) or Three's own batching (InstancedMesh/BatchedMesh, static matrices) is the lever, not a fancier command buffer.
6. **Effort (one strong dev):** ~25-35 person-weeks to "Three r18x WebGLRenderer runs glTF/PBR/shadows/post-processing at real perf in QuickJS on macOS + Linux/Pi4-5 through native and quickjs engines"; +8-12 weeks for Khronos WebGL2 conformance-grade; +4-6 for a WebGL1/GLES2 (Pi 1-3, Three <= r162) profile. zinc-vm parity for *typed* WebGL use adds ~4-6 (ABI buffers).

## 1. What already exists in the repo (all V unless marked)

### 1.1 GL / canvas / audio surface

| Area | State | Ref |
|---|---|---|
| WebGL / WebGL2 context | none | `grep -ri webgl` = docs only |
| Internal GL | `display-gl` display driver: SDL3+GL 3.2 core on macOS, EGL/GBM/KMS + GLES 2 on rpi1 & linux | `plugins/display-gl/plugin.json`, `src/{display_gl,gl_renderer,kms,sdl}.cpp` |
| GL API used | ~60 calls: glTexImage2D/SubImage2D, glDrawElements/Arrays, VAO, FBO (glFramebufferTexture2D), glReadPixels, glCopyTexSubImage2D, glBlendFuncSeparate, scissor, no instancing/UBO/MRT/3D textures/queries/sync | grep of `gl[A-Z]*` over plugin sources |
| Shader dialect | GLSL ES 1.00 uber shader; `zgl_program` prepends `#version 150` + macros on mac or `#version 100` + precision on GLES | `display_gl.cpp:41-48`, `zgl.h:2-3,15` |
| Context sharing | `zgl_layers(w,h)` hook lets GPU plugins (`zinc:mapping`) draw under the UI in the *same* context; single context, no share-group | `zgl.h:11-12` |
| 2D GPU renderer | replays the retained command list (`CLEAR RECT BORDER SHADOW LINE TEXT IMAGE POLY CLIP UNCLIP`) into a texture; LINE/POLY not done; validated on Pi 3B+ (VC4, GLES 2.0, Mesa 25.0.7) | `docs/reports/gpu-renderer-design.md` (§2, §4, "Phase 1 validation", "Phase 1b") |
| Canvas 2D | `zinc:canvas` = CanvasRenderingContext2D in Zinc over the software rasterizer (typed Zinc API, not a JS global) | `docs/plugins/canvas2d.md` |
| 3D | `zinc:3d` software rasterizer; `three` plugin = *Zinc rewrite of a Three subset* on top (not upstream) | `docs/plugins/three.md:1-5` |
| Audio | none implemented (pinball has recipes only); design report says JUCE-like engine as plugin, miniaudio candidate | creative-runtime report §4 |
| Wasm | `zinc:wasm` = wasm3 interpreter, `WebAssembly` global for Zinc programs | `docs/plugins/wasm.md` |
| Web APIs | `zinc:web` (WinterTC: TextEncoder/Decoder, URL, Blob, Event, AbortController, crypto...) and `fetch` in *typed Zinc* with bytes as `u8[]` | `lib/std/web.ts:1-8`, `docs/guide/09-web-apis.md:87` |
| Existing plan | Creative report already concludes: two profiles (WebGL1/GLES2 for VC4, WebGL2/GLES3 elsewhere), ANGLE candidate on desktop, real Three.js in QuickJS to be tested, keep current `three` plugin as software path, "WebGL2 needs Khronos tests, not a triangle" | `docs/reports/creative-runtime-webgl-audio-2026-09-29.md` §2, §6, §7 (and creative-studio-compatibility-demo report §1) |

Backend summary: the current GL backend is **desktop GL 3.2 core (mac) / GLES 2 (Pi, Linux)**, i.e. one GLES2 and one GL3.2 code path, no GLES3. Pi 4/5 (Mesa V3D, GLES 3.1 conformant, I from Mesa docs/Phoronix) would run GLES3 through the *same* KMS code with `EGL_CONTEXT_CLIENT_VERSION 3`; Pi 1-3 (VC4) are GLES 2.0 only (V for Pi 3B+: `docs/plugins/display-gl.md` capability table; reports also say ANGLE is not a hardware upgrade for VC4).

Measured VC4 facts useful for a WebGL layer (V, `display-gl.md`): 2048 max texture, 16 units, NPOT ok, VAO/uint32 indices via extensions, **no** `GL_OES_standard_derivatives`, **no** `EXT_shader_texture_lod`, MSAA 4x on window configs only; tile-based GPU (mid-frame FBO switches cost a flush); one unexplained VC4 GPU hang on partially changing screens; DRM master needed (console only).

### 1.2 Engines (docs/engines.md, runtime/vm/quickjs.cpp, plugins/script)

- Three modes: native (AOT C++), zinc-vm (typed bytecode, Tier-0 interpreter + AArch64 baseline JIT), quickjs (application runner) — `engines.md:29-41`.
- QuickJS runner: registers modules through the shared C ABI, ES-module loader from the filesystem, bootstrap installs `process`, `performance.now`, `setTimeout/Interval/Immediate`, `queueMicrotask`, `console` only — `quickjs.cpp:143-177`. No window/document/canvas/fetch/Image/TextDecoder/URL/WebAssembly/rAF today.
- Emitted JS target is **ES2022** (`compiler/src/emit-js.ts:367,377`); QuickJS-ng handles it natively, so no ES5 down-levelling.
- Speed (V, `engines.md:226-243`, M1 Pro): fib native 10 ms / VM 130 / VM-JIT 62 / QuickJS 341; mandelbrot 22 / 385 / 85 / 745. 100k scalar native calls: 3.0 / 6.4 / 5.1 / 10.8 ms (spawn-to-exit; so per-call ABI cost is **under ~100 ns** in every mode). These are typed numeric kernels, not UI.
- Native ABI (`zinc_abi.h`): types VOID BOOL I32 U32 F32 F64 STRING RESOURCE CALLBACK BYTES RECORD NUMBERS ARRAY. Bytes/numbers are **borrowed for the call or copied snapshots**; "mutable user specs remain rejected" (`engines.md:93-95`). Callbacks take scalars only (`engines.md:107`). No shared mutable buffers, no async completion.
- `zinc:script` (QuickJS-ng 0.17.0 vendored, ~1 MB overhead, macos/linux/rpi1/rmpp; sim uses node:vm) sandboxes JS with typed `expose()` host fns; values cross as **Dyn copies** (`docs/plugins/script.md`, `plugins/script/native/quickjs.host.cpp`, 667 lines: no quickjs-libc, memory + interrupt limits). Right pattern for *embedding*, wrong for GL (no zero-copy typed arrays, Dyn conversion per call). It has no timers/fetch.
- mquickjs (Bellard's MicroQuickJS) is **not** in the repo (grep). QuickJS-ng is.

### 1.3 Gaps for "complete WebGL + Three.js"

1. GLES3/WebGL2-capable context (ES 3.00 shaders, UBOs, VAOs, instancing, MRT, 3D/array textures, transform feedback, sync, queries, sRGB/half-float/RGB9E5 formats, renderbuffer multisample, blitFramebuffer).
2. WebGL semantics layer (validation, getError, object lifetime, default drawing buffer, context loss, limits, extensions).
3. Shared mutable typed-array bridge (QuickJS: available via its C API; Zinc ABI: missing).
4. Browser host (canvas/DOM stubs, Image decode, fetch, events, rAF, TextDecoder, URL/Blob, Worker, WebAssembly).
5. Compositing a GL surface with the Zinc UI without CPU readback (needs an "external texture" command kind or a shared-context pass in display-gl).
6. Audio (Three's `AudioContext` use is only in `src/audio`, optional).
7. A test suite: Khronos WebGL2 conformance (not runnable without a DOM-ish harness).

## 2. Reference project: mattneel/three-native (read via gh api)

Repo facts (V): MIT, 18 stars, last push 2026-01-21, ~30 commits, Zig 0.15 + **mquickjs** (vendored) + **sokol-zig** (sokol_gfx/app/audio/fetch). Three.js is a git submodule. Sources: [README](https://github.com/mattneel/three-native), [KICKSTART.md](https://github.com/mattneel/three-native/blob/main/KICKSTART.md), [docs/design/src](https://github.com/mattneel/three-native/tree/main/docs/design/src), [src/shim](https://github.com/mattneel/three-native/tree/main/src/shim).

Architecture (V, docs/design/src/{architecture,shim,runtime}.md): Zig host -> one mquickjs runtime/context -> browser shim (WebGL, canvas, rAF, Image, fetch, input events) -> sokol_gfx backend (Metal/D3D11/GL). Single-threaded frame loop (poll events, dispatch, one rAF tick, translate GL to sokol, present). JS wrapper objects hold small numeric handles; host owns fixed-size handle tables (buffers 4096, textures 2048, programs 1024, FBOs 512, ...; shaders 128, max 64 KB source: `webgl_shader.zig`). `fetch` is local-file only, images PNG/JPEG decode.

Shim (V): `webgl.zig` 21 KB, `webgl_program.zig` 86 KB, `webgl_draw.zig` 47 KB, `webgl_texture.zig` 31 KB, `webgl_state.zig` 17 KB, `gl_uniforms.zig` 7 KB, `image_loader.zig` 7 KB, `runtime/js.zig` 179 KB (bindings). WebGL state is **re-assembled into sokol pipelines at draw time**; the GLSL is **rewritten line by line** (`webgl_program.zig:~1380-1470`): drops `#version`/`precision`, replaces `texture2D->texture`, `attribute->in`, `varying->out/in`, `gl_FragColor->fragColor`, prepends `#version 330`, extracts loose uniforms, re-declares them, filters unused ones. sokol needs `SG_MAX_UNIFORMBLOCK_MEMBERS` patched to 64 for Three's shaders (README).

Build (V, `build-three-es5.mjs`): esbuild (es2017 IIFE) -> Babel preset-env targets IE11 -> a hand-written `es5-shim.js` (Symbol stub, Object.assign, getOwnPropertyDescriptor(s)...) -> string patches (e.g. `generateDefines` null guard, no-op `_classCallCheck`, ASCII-escape). mquickjs is ES5-strict: no holes in arrays, arrays-only `for..of`, no boxing, no direct eval, only `Date.now()`, ASCII-only case mapping (README of deps/mquickjs, V); typed arrays and `globalThis` are supported. Three uses WeakMap heavily in `renderers/webgl/*` (V, grep) — mquickjs's README does not list Map/Set/WeakMap (I: so more shims).

Coverage (V/I): `webgl-api-coverage.csv` has 315 rows (unique `gl.*` identifiers found in the Three checkout; methods and constants). Counts: webgl1 methods 31 implemented / 33 partial / 41 missing; webgl2 methods 31 missing (0 implemented); constants ~71 of 121 (webgl1) done/partial, 57 of 58 webgl2 missing. Partial notes are telling: "always NO_ERROR", "LINK_STATUS only", "COMPILE_STATUS only", "returns empty list", "always null", "sampler units tracked only". **The CSV is stale vs the git log** (bindTexture/createTexture marked missing while the commit log says textured cube and fetch() work), so treat it as a lower bound. Roadmap state (V): M0-M1 done, M2 partly, M3 "Three loads" mostly unchecked in the roadmap doc while commits show "M3: input events", "M4: fetch() API", textured-cube and interactive-cube examples exist. No glTF/PBR/shadows evidence. No WebGL2 (`#version 300 es` not handled anywhere in src/shim: grep = 0 hits), so it is effectively a **WebGL1 shim, i.e. Three <= r162** (I: submodule commit not pinned in what I read).

What it proves: a small team can get Three's scene setup and a cube through a hand-written shim in mquickjs in weeks. What it does not: WebGL2, conformance, performance numbers (its perf doc is "napkin math" placeholders: 2-5k GL calls, 200-500 draws/frame budget; no measurements).

Takeaways for Zinc: (a) their surface list (canvas, rAF, performance.now, Image/createImageBitmap, fetch, FileReader, URL.createObjectURL, events, TextDecoder) matches my grep of Three (section 6); (b) the sokol layer is the wrong abstraction for WebGL (PSO-based, forces GLSL rewriting, fixed caps) — GLES3 passthrough is simpler and more faithful; (c) mquickjs+ES5 is a tax we should not pay.

## 3. Other approaches (web; sources inline)

| Approach | What it is | Fit / lesson |
|---|---|---|
| [headless-gl](https://github.com/stackgl/headless-gl) | Node addon, **WebGL 1.0.3** on ANGLE; WebGL2 "experimental"; few extensions (ANGLE_instanced_arrays, OES_texture_float, OES_vertex_array_object, standard_derivatives, WEBGL_draw_buffers, EXT_blend_minmax, anisotropic, shader_texture_lod); no Image/video | Proves ANGLE-as-WebGL-backend works; too old for Three >= r163 |
| node-canvas-webgl | glue of headless-gl + node-canvas (I, not fetched) | Same limits |
| [expo-gl](https://github.com/expo/expo/tree/main/packages/expo-gl) / react-native-webgl | JSI-bound **WebGL2** over GLES on iOS/Android. V: `EXGLNativeContext.h` has a **JS-thread batch queue -> GL-thread** design (`addToNextBatch`, `addBlockingToNextBatch`, `addFutureToNextBatch`, `endNextBatch`, `flush`), `EXWebGLMethods.def` ~138 method entries, `EXTypedArrayApi.cpp`, stb_image decode. Three via expo-three; known friction: asset paths, simulators, version skew | **Closest prior art for our design** (JS-side command batches + futures for objects) |
| [Ejecta](https://github.com/phoboslab/Ejecta) | iOS canvas+WebGL+audio on JavaScriptCore; uses system JSC so slow typed-array access; Three needs the canvas handed in | Old lesson: engine typed-array performance matters |
| [Babylon Native](https://github.com/BabylonJS/BabylonNative) | **Not a WebGL layer**: a native `NativeEngine` implements Babylon's own `Engine` API over **bgfx**; WebGL GLSL is transpiled at runtime; N-API subset to target V8/JSC/Chakra (see [NativeEngine.md](https://github.com/BabylonJS/BabylonNative/blob/master/Documentation/NativeEngine.md)) | Shows the alternative: replace the renderer's device layer instead of WebGL. For Three the equivalent is Three's own WebGPURenderer backend abstraction, not this |
| Deno WebGPU / [docs](https://docs.deno.com/runtime/desktop/webgpu/) | Native WebGPU (wgpu) with headless capture and native window; community demos run Three's WebGPURenderer | Separate contract from WebGL; viable for WebGPURenderer only |
| Dawn / wgpu-native | WebGPU implementations; **do not** implement WebGL (creative report §2 also says wgpu is not a WebGL implementation) | Use only if the goal shifts to WebGPU |
| [ANGLE](https://github.com/google/angle) | GLES 2/3 (3.1/3.2 on some) over Vulkan, **Metal (ES 3.0 complete)**, D3D11, desktop GL; also ships the WebGL-strict shader translator (GLSL out 130-450, HLSL, MSL, SPIR-V). BSD-3 | Best backend for macOS; on Linux/Pi4-5 native GLES3 is simpler. Build is gn/depot_tools, big; ANGLE cannot add GLES3 to VC4 |
| sokol / bgfx | Thin PSO-style cross-API layers | Fight WebGL's immediate state machine; unnecessary if GLES3 is native |
| Three r186 **WebGPURenderer** (+TSL) | Default backend WebGPU, **automatic WebGL2 fallback backend** (`src/renderers/webgl-fallback/` exists in r186, V); TSL compiles to WGSL or GLSL; WebGLRenderer "still maintained, no big new features" ([manual](https://threejs.org/manual/en/webgpurenderer.html), search summaries) | A **complete** WebGL2 also gets us WebGPURenderer-in-fallback-mode. It needs ~15 extra methods (below) |
| Three WebGL1 removal | WebGL1 unsupported since r163 ([docs](https://threejs.org/docs/pages/WebGLRenderer.html), [forum](https://discourse.threejs.org/t/r163-workaround-to-keep-supporting-webgl-1/63547)) | Pi 1-3 (VC4) => Three <= r162 or a Zinc-side renderer |

Shader translation options (`GLSL ES 3.00 -> platform`):
- **Passthrough (recommended)**: WebGL2 GLSL is GLES3 GLSL; on GLES3 drivers and ANGLE no translation by us.
- ANGLE translator standalone: WebGL-spec validation (`SH_WEBGL2_SPEC`), error logs, limits; can also emit GLSL 330/410 for desktop core on macOS if we refuse ANGLE's GL layer.
- glslang (ES 3.00 -> SPIR-V, Vulkan semantics: loose uniforms need UBO/push mapping) + [SPIRV-Cross](https://github.com/KhronosGroup/SPIRV-Cross) (SPIR-V -> GLSL/MSL/HLSL): heavy-ish pipeline, needed only for a non-GL backend.
- [naga](https://github.com/gfx-rs/naga) GLSL frontend: faster but subset; discussions mention WebGL2-specific tweaks (I). Rust dependency. Not recommended.

## 4. Size of the WebGL2 surface and what Three actually calls

Full surface (V, computed from `lib.dom.d.ts` TypeScript 6.0.3 in the repo's node_modules): WebGL1 context = **136 unique methods**, WebGL2 adds **88** (=> **224 unique methods**), ~**550 constants** (297 + 256 in the interface bodies), plus ~25-30 extensions and ~35 object types (Buffer, Texture, Program, Shader, Framebuffer, Renderbuffer, VAO, Query, Sampler, Sync, TransformFeedback, UniformLocation, ActiveInfo, ShaderPrecisionFormat, ...).

Three.js r186.1 (`npm i three`, V) `WebGLRenderer` path (`src/renderers/webgl/*.js` + `WebGLRenderer.js`): **142 distinct gl methods**, ~200 distinct constants. Extraction by regex, so a few items are noise (canvas, rAF, drawImage). WebGPURenderer's WebGL2 backend (`webgl-fallback/`) adds: beginQuery, endQuery, createQuery, deleteQuery, getQueryParameter, beginTransformFeedback, endTransformFeedback, createTransformFeedback, bindTransformFeedback, transformFeedbackVaryings, clearBufferfv, clearBufferfi, clientWaitSync, getSupportedExtensions.

### 4.1 Methods Three's WebGLRenderer calls (checklist; V by grep)

```
activeTexture attachShader bindAttribLocation bindBuffer bindBufferBase bindFramebuffer bindRenderbuffer
bindTexture bindVertexArray blendColor blendEquation blendEquationSeparate blendFunc blendFuncSeparate
blitFramebuffer bufferData bufferSubData clear clearBufferiv clearBufferuiv clearColor clearDepth
clearStencil colorMask compileShader compressedTexImage2D compressedTexImage3D compressedTexSubImage2D
compressedTexSubImage3D copyTexSubImage2D copyTexSubImage3D createBuffer createFramebuffer createProgram
createRenderbuffer createShader createTexture createVertexArray cullFace deleteBuffer deleteFramebuffer
deleteProgram deleteRenderbuffer deleteShader deleteSync deleteTexture deleteVertexArray depthFunc depthMask
detachShader disable disableVertexAttribArray drawArrays drawArraysInstanced drawBuffers drawElements
drawElementsInstanced enable enableVertexAttribArray fenceSync finish flush framebufferRenderbuffer
framebufferTexture2D framebufferTextureLayer frontFace generateMipmap getActiveAttrib getActiveUniform
getAttribLocation getBufferSubData getContextAttributes getError getExtension getParameter getProgramInfoLog
getProgramParameter getShaderInfoLog getShaderParameter getShaderPrecisionFormat getShaderSource
getUniformBlockIndex getUniformLocation invalidateFramebuffer lineWidth linkProgram pixelStorei polygonOffset
readBuffer readPixels renderbufferStorage renderbufferStorageMultisample scissor shaderSource stencilFunc
stencilMask stencilOp texElementImage2D texImage2D texImage3D texParameterf texParameteri texStorage2D
texStorage3D texSubImage2D texSubImage3D uniform1f uniform1fv uniform1i uniform1iv uniform1ui uniform1uiv
uniform2f uniform2fv uniform2i uniform2iv uniform2ui uniform2uiv uniform3f uniform3fv uniform3i uniform3iv
uniform3ui uniform3uiv uniform4f uniform4fv uniform4i uniform4iv uniform4ui uniform4uiv uniformBlockBinding
uniformMatrix2fv uniformMatrix3fv uniformMatrix4fv useProgram vertexAttrib1fv vertexAttrib2fv vertexAttrib3fv
vertexAttrib4fv vertexAttribDivisor vertexAttribIPointer vertexAttribPointer viewport
```

Notes: `texElementImage2D` is a new *optional* path (`WebGLTextures.js:1259`, guarded by `'texElementImage2D' in _gl`). `getBufferSubData` (async readback), `fenceSync/deleteSync`, `blitFramebuffer`, `renderbufferStorageMultisample`, `texStorage2D/3D`, `framebufferTextureLayer`, `readBuffer`, `drawBuffers`, `invalidateFramebuffer`, `clearBufferiv/uiv`, `uniformBlockBinding`/`getUniformBlockIndex`/`bindBufferBase` (UBOs), `drawArrays/ElementsInstanced`, `vertexAttribDivisor`, `vertexAttribIPointer` are the WebGL2-only items Three requires; all are plain GLES 3.0.

### 4.2 Extensions Three probes (V)

Requested at init in `WebGLExtensions.js`: EXT_color_buffer_float, WEBGL_clip_cull_distance, OES_texture_float_linear, EXT_color_buffer_half_float, WEBGL_multisampled_render_to_texture, WEBGL_render_shared_exponent. Queried elsewhere: EXT_texture_filter_anisotropic, WEBGL_compressed_texture_{s3tc,s3tc_srgb,etc,astc,pvrtc}, EXT_texture_compression_{bptc,rgtc}, EXT_texture_norm16, KHR_parallel_shader_compile, WEBGL_multi_draw, WEBGL_lose_context, EXT_clip_control, OVR_multiview2 (8 mentions), EXT_disjoint_timer_query(_webgl2), WEBGL_debug_shaders. All optional: returning `null` for unsupported ones is legal and Three degrades. A first milestone set: EXT_color_buffer_float, EXT_color_buffer_half_float, OES_texture_float_linear, EXT_texture_filter_anisotropic, KHR_parallel_shader_compile, WEBGL_lose_context, WEBGL_multi_draw; BC/ETC/ASTC follow GPU support (Apple: BC no, ASTC yes; VC4/V3D: ETC2 yes).

Shader side (V, `renderers/shaders`, `WebGLProgram.js`): Three emits `#version 300 es` and uses gl_FragColor via macro to a `layout(location=0) out`, gl_Position, gl_FragCoord, gl_FragDepth, gl_PointSize, gl_PointCoord, gl_InstanceID, gl_VertexID, gl_DrawID (multi-draw), gl_FrontFacing, ANGLE-specific hints. No compute, no geometry/tessellation: plain GLES 3.0.

### 4.3 Context/host surfaces Three touches (V by grep of src and examples/jsm, files matched)

| API | src | examples/jsm | Note |
|---|---|---|---|
| canvas.getContext('webgl2'), OffscreenCanvas | 8 (OffscreenCanvas) | 4 | Three checks `self`, `HTMLCanvasElement`, `ImageBitmap` |
| document.createElement (canvas/img) | 1 | 67 | |
| createImageBitmap / ImageBitmapLoader | 1 | 2 | glTF textures go this way in browsers |
| fetch | 2 | 9 | FileLoader |
| TextDecoder | 1 | 25 | GLTF/OBJ/etc |
| URL.createObjectURL | 1 | 14 | GLTFLoader for embedded images |
| getContext('2d') | 2 | 25 | CanvasTexture, font/text, PMREM helpers |
| new Worker / Blob workers | 0 | 17 | DRACOLoader, KTX2Loader, Basis |
| WebAssembly | 0 | 14 | draco, basis_transcoder, meshopt, zstddec, mikktspace |
| pointer events / setPointerCapture | 0 | 20 | OrbitControls and friends |
| AudioContext / AudioListener | 7 | 0 | `src/audio`, optional |
| WeakMap, Float16Array, DataView | many | | need engine support (QuickJS-ng ok) |

Bundle (V, esbuild 0.2x, minified, target es2020): full `import * as THREE` **743 KB (190 KB gzip)**; tree-shaken small scene (WebGLRenderer, Scene, Mesh, BoxGeometry, MeshStandardMaterial, DirectionalLight, PerspectiveCamera) **521 KB**. esbuild cannot target ES5 at all (errors on let/const), Babel would be needed as in three-native.

## 5. Design

### 5.1 Layering

```
 App (upstream Three.js r18x ESM, user JS, or typed Zinc)
 -------------------------------------------------------------------------
 L4 Zinc integration      zinc:webgl plugin (typed API for Zinc programs), quickjs/native/vm registration,
                          zinc.json "renderer/webgl": "webgl2" | "webgl1" | "off", capability check at startup
 L3 Browser host (JS)     window/document/canvas/Image/createImageBitmap/OffscreenCanvas/fetch/URL/Blob/
                          TextDecoder/rAF/perf/events/Worker/WebAssembly; small (~2-3k lines JS) + native helpers
 L2 Engine glue           QuickJS-ng C-API binding generated from one IDL table (like compiler/src/abi.ts does
                          for Zinc specs); zero-copy typed arrays; object handles = small ints in JS wrappers
 L1 WebGL2 core (C++)     ~224 methods, object tables + generations, state mirror, validation, getError queue,
                          limits/caps clamps, extension table, drawing buffer + context loss; engine-agnostic
 L0 GLES3 backend         Linux/Pi4-5: system GLES 3.x over EGL/GBM (kms.cpp, ctx version 3);
                          macOS: ANGLE (Metal) via EGL; optional Windows: ANGLE(D3D11);
                          Pi 1-3: GLES2 => WebGL1 profile only (Three <= r162)
 Present                  display-gl extended: WebGL canvas = FBO texture composited in the present pass
                          (existing key-colour/texture pass, display_gl.cpp) or an EXTERNAL_TEXTURE cmd kind
```

Why passthrough on GLES3: WebGL2 ~ GLES 3.0 with extra rules. The L1 layer only *validates and forwards*; no PSO reconstruction, no GLSL rewriting, uniforms/UBOs/samplers map 1:1. WebGL semantics that need real code: (a) default framebuffer emulation (render to an RGBA8 + depth/stencil FBO, MSAA renderbuffer when `antialias`, resolve at composite; `preserveDrawingBuffer`/`premultipliedAlpha`), (b) strict GLSL validation (ANGLE translator in WebGL spec mode; browsers do this), (c) error semantics (INVALID_ENUM/VALUE/OPERATION, no undefined behaviour reaching the driver, e.g. buffer bounds on draw), (d) uninitialised resource zeroing, (e) context loss/restore, (f) limits (clamp MAX_* to spec-friendly values), (g) readPixels/format rules, (h) `getUniformLocation` array names, `getActiveUniform` info, (i) sRGB/colorspace unpack flags, (j) `UNPACK_FLIP_Y_WEBGL`, `UNPACK_PREMULTIPLY_ALPHA_WEBGL`, `UNPACK_COLORSPACE_CONVERSION_WEBGL` done on the CPU for image sources.

Context sharing with existing display-gl: use a **separate EGL/GL share-group context** for WebGL rather than the single `display-gl` context, else the 2D uber renderer and WebGL trample each other's state (gl_renderer.cpp assumes ownership). On tile-based VC4/V3D, extra FBO passes cost (design report §11). Compositing: the WebGL drawing buffer texture goes to the present pass (already a texture pass with key colour and `zgl_layers` underneath, `display_gl.cpp`), or a new GPU-texture command kind inside the retained frame list (the report's `IMAGE` kind with `dyn` images and a version counter is the seam; `gpu-renderer-design.md` §2). CPU renderer / sim: show a placeholder or a readback (explicit cost).

### 5.2 Which engine hosts the JS

| Engine | Verdict | Reasoning |
|---|---|---|
| **QuickJS-ng 0.17 (vendored)** | **Primary.** | Full ES2023, typed arrays/WeakMap/Map/Float16Array, ESM, bytecode (qjsc) precompile, C API with ArrayBuffer pointers (zero-copy), already builds for macos/linux/rpi1(armv6 NaN-boxed)/rmpp, already an engine mode. Interpreter only: **~14-30x slower than V8 on Three's own code (measured above)**. |
| mquickjs | **No** for Three. | ES5 strict subset, no Symbol/Map/Set/WeakMap (I), arrays only for-of, moving GC makes retained JSValue bindings awkward (README: "address of objects can move"), forces Babel+shims as three-native shows. Its 10 KB RAM story is irrelevant when a GPU and 4 MB+ heap are required. |
| zinc-vm / JIT | **Not for upstream Three.** | Typed; no ArrayBuffer/typed arrays; Dyn/IC is planned V4 (`zinc-vm.md:421`); `zinc:script` unavailable in VM (`engines.md:39`); JIT is AArch64 baseline and still numerical/typed. It can host a *typed Zinc* program that calls WebGL (needs ABI buffers) or embeds QuickJS (needs `zinc:script` to be ported to the VM, listed as remaining work). Compiling Three to typed Zinc is a non-goal: generics unresolved, mixins, `any`-heavy; the existing Zinc `three` rewrite already shows the maintenance cost. |
| Native engine | Zinc app + embedded QuickJS through a `zinc:webgl-host`-style plugin (same as zinc:script's model, ~1 MB) | Native code stays fast for everything except Three's JS. |
| Faster JS (option, I) | JavaScriptCore (system on macOS/iOS; JIT policy applies), V8 (20-30 MB), Hermes (bytecode, no JIT) | Keep L2 engine-agnostic (Babylon Native's N-API-subset approach) only if the QuickJS budget proves insufficient. On Linux aarch64/Pi, QuickJS is the only realistic small option. |

Verified interpreter gap (numbers on this M-series Mac; qjs = Homebrew QuickJS 2026-06-04; Zinc vendors quickjs-ng 0.17.0, expected similar (I)). Scripts: `mock-render-bench.mjs`, `scenegraph-bench.mjs` in the scratchpad dir.

| Test (three r186.1, esbuild bundle) | node (V8) | QuickJS | ratio |
|---|---|---|---|
| updateMatrixWorld + frustum test, 1000 animated Objects | 0.19 ms/frame | 5.67 ms | 30x |
| `WebGLRenderer.render`, 100 lit PBR cubes, mock GL | 0.18 ms | 1.49 ms | 8x |
| 500 cubes (351 draws, 2119 GL calls) | 0.81 ms | 11.4 ms | 14x |
| 1000 cubes (851 draws, 5119 GL calls) | 1.88 ms | 25.7 ms | 14x |

Caveats: GL is a JS Proxy stub (its cost is included on both engines and is probably heavier under qjs, so real binding numbers should be a bit lower); no textures, shadows, real uniform locations, or post-processing; only ~10 uniform uploads per draw here; a single machine; frustum culling dropped ~30% of cubes. Order-of-magnitude only. Extrapolation to a Pi 4 (A72) at ~3-4x slower than M1 (I): ~35-45 ms for 500 cubes => 20-30 fps; Pi 3B+ worse. This is why the perf plan attacks Three's JS (below), not crossing cost.

### 5.3 JS <-> native crossing and command buffer

Facts: ~6 GL calls per draw in Three (enable/disable culling, 2-3 matrix uniforms, drawElements; more with textures, shadows, morphs); 2-5k calls/frame at a few hundred draws. QuickJS C-function call from JS costs on the order of 50-200 ns (I: from `bridge-bench` ~100k calls in 5-11 ms including process time, `engines.md:242`). 5000 calls = 0.25-1 ms. So:

- **Phase 1: direct calls** into L1 on the JS thread; GL executed synchronously. Typed arrays passed by pointer (JS_GetArrayBuffer): zero copy for bufferData/uniform*fv/texImage2D. Simplest, sync semantics (getError, readPixels, getUniformLocation, compile status) trivially correct. Also identical semantics for Zinc typed callers.
- **Phase 2 (only if measured):** a **command stream** for render-thread offload (design report phase 3 wants a render thread anyway, `gpu-renderer-design.md` §6). expo-gl's batch queue is the template (V). JS wrappers own handle ids allocated JS-side (create* returns immediately; no round trip), state mirror JS-side so that redundant calls are dropped (Three's own `WebGLState` already deduplicates); commands encoded into a preallocated Int32Array/Float32Array ring (opcode + args), data uploads copied into a byte arena (bufferSubData/texSubImage are the only bulk copies, memcpy speed); flush at `endFrame`/rAF end and before any *sync-return* call (getError/readPixels/getParameter of dynamic state/getBufferSubData/clientWaitSync/getShaderParameter(COMPILE_STATUS) unless KHR_parallel_shader_compile semantic used, getProgramParameter(LINK_STATUS)). Shader compile/link stays sync unless parallel-compile is exposed (Three probes it).
- Do not do Zinc-ABI marshalling per GL call: ABI has no mutable buffers and scalars-only callbacks; add an ABI type for **borrowed mutable buffer + length** if typed Zinc code (native/vm) must call WebGL, or expose L1 through the plugin's own C++ with typed arrays living in native memory.

### 5.4 ES5 vs ES2020

- QuickJS-ng: ship **ESM/IIFE ES2020-2022**, minified + tree-shaken (521-743 KB, 190 KB gzip), optionally precompiled to bytecode with qjsc (skip parse/compile on start; I: parse of 700 KB is on the order of 100+ ms on a Pi 3, needs measuring). Zinc's own emitter is already ES2022 (`emit-js.ts:367`).
- ES5 (mquickjs-style) requires Babel preset-env + shims + hand patches as `three-native/build-three-es5.mjs` shows, larger/slower output (helpers for classes, spread, generators), no WeakMap/Symbol, engine strictness bugs. Decision: no ES5 target. Keep Three unmodified.
- Keep an option to pre-bundle user code + Three once at build time (`zinc build`) so devices never ship Node/esbuild.

### 5.5 Browser host layer (what to build, ordered by need)

1. Must (M1-M3): `window`/`self`/`globalThis`, `devicePixelRatio`, `innerWidth/Height`, `requestAnimationFrame` bound to the HAL frame callback, `performance.now`, `document.createElement('canvas'|'img')`, `HTMLCanvasElement.getContext('webgl2'|'2d')` (2D via existing `zinc:canvas` or a small native 2D surface with `drawImage/getImageData`, because Three's CanvasTexture/PMREM/font code uses it), `Image` + `createImageBitmap` (decode PNG/JPEG/WebP through a native decoder, stb_image is what expo-gl and sokol use), `fetch` (file/asset root + HTTP(S) via existing `lib/std/fetch.ts` runtime), `TextDecoder/TextEncoder`, `URL/Blob/createObjectURL`, event targets (mouse/pointer/keyboard/wheel/resize from the HAL, pointer capture no-op), `console`, timers (exist).
2. Should (M4): `OffscreenCanvas`, `ImageBitmap` upload path (skip CPU round trip), `WebAssembly` global for QuickJS (`zinc:wasm` wasm3 exists: interpreter, so Draco/Basis/meshopt decode is slow but works; I), `Worker` (a second QuickJS runtime on a thread + structured clone of ArrayBuffers; DRACOLoader/KTX2Loader need it; or run decoders inline by patching the loader to call the wasm on the main runtime), `FileReader`, `AbortController` (`zinc:web` has it typed).
3. Later: `AudioContext` (Zinc audio plugin, Three Audio is optional), `HTMLVideoElement` (`zinc:video` exists), Gamepad, pointer lock, WebXR (out of scope).
Reuse: `lib/std/web.ts` and `fetch.ts` are typed Zinc, not JS globals for QuickJS; the JS-visible versions must be small JS/C++ bindings over the same native helpers (utf8, sockets/HTTP, hashing) rather than a second implementation.

### 5.6 Performance plan (targets are engineering guesses, to be measured)

1. Pin the workload (Three's `webgl_*` examples subset) and profile split: JS scene update / renderer JS / L2 crossing / L1 validation / driver / GPU. Zinc has stage profiling infra to extend (`engines.md` PocketJS lessons 3-4).
2. Cut Three's JS cost: static scenes (`matrixAutoUpdate=false`, `matrixWorldAutoUpdate`), `InstancedMesh`/`BatchedMesh`, merged geometry, fewer materials/programs, frustum culling off for known-visible, reuse render lists, no per-frame allocation (matters for QuickJS RC/GC). This is documentation + presets, not engine work.
3. L1: skip driver calls already in the right state; UBO/uniform caches; lazy validation with hot-path fast checks; precomputed caps.
4. Command stream + render thread (section 5.3 phase 2) only if the crossing shows >15% of frame time; otherwise skip.
5. Startup: bytecode-precompiled bundle, lazy shader compile with a program-binary cache (`glGetProgramBinary` GLES3, not on VC4) and `KHR_parallel_shader_compile`.
6. If QuickJS still misses budgets: swap engine behind L2 (JSC on macOS first), keeping L1 unchanged.
7. Report per-engine in the existing benchmark protocol (raw samples, p50/p99, RSS, bundle size), as `engines.md` already prescribes.

### 5.7 Engine modes: what "runs Three.js" means per mode

| Mode | Upstream Three (JS) | Typed Zinc calling WebGL2 |
|---|---|---|
| `--engine quickjs` | Yes: QuickJS runner registers `webgl` natively (C API) + host bundle; ES module loader loads Three | via emitted JS + same native module |
| native | Yes via embedded QuickJS plugin (`zinc:script`-like, ~1 MB); Zinc app owns window/HAL, feeds rAF | Direct C++ calls (fastest) |
| zinc-vm / JIT | Only by embedding QuickJS (needs `zinc:script` port to VM: listed as remaining work) | Needs ABI type for mutable buffers; then supported |
| sim / esp32 / ps1 / ps2 / wasm | No (no GLES3) | wasm: browser's WebGL2 natively; others: software `zinc:3d` / existing `three` rewrite |

## 6. Coverage checklist (what "complete" decomposes into)

- [ ] Context: getContext attributes (alpha, depth, stencil, antialias, premultipliedAlpha, preserveDrawingBuffer, powerPreference, failIfMajorPerformanceCaveat, desynchronized, xrCompatible), `drawingBuffer{Width,Height,ColorSpace}`, `unpackColorSpace`, `isContextLost`, `WEBGL_lose_context`, `contextlost/contextrestored` events, `getContextAttributes`.
- [ ] State: enable/disable, blend*, depth*, stencil*, cull/front face, scissor, viewport, polygonOffset, colorMask, sampleCoverage, lineWidth, pixelStorei (incl. UNPACK_* extras), hint, clear*, all with `getParameter` for every pname (Three reads ~30 of ~120).
- [ ] Objects: buffer, VAO, texture (2D, cube, 3D, 2D_ARRAY), sampler, framebuffer/renderbuffer (MRT, multisample, blit), program/shader (`getActiveUniform/Attrib`, UBOs, `getUniformBlockIndex`, `transformFeedbackVaryings`), query, sync, transform feedback.
- [ ] Data paths: `bufferData/SubData/getBufferSubData/copyBufferSubData` (ArrayBufferView + offset/length overloads), `texImage2D/3D` (ImageBitmap, HTMLImageElement, HTMLCanvasElement, OffscreenCanvas, VideoFrame, ImageData, ArrayBufferView, PBO offset), `compressedTex*`, `texStorage*`, `readPixels` (+PBO), `uniform*` incl. `*ui`, `uniformMatrix*`, `vertexAttrib*`, `vertexAttribIPointer`.
- [ ] Drawing: `drawArrays/Elements(+Instanced, RangeElements)`, `WEBGL_multi_draw`, `gl_DrawID`, `OVR_multiview2`.
- [ ] Shaders: ES 3.00 and ES 1.00 (WebGL1 profile) pass-through with WebGL-strict validation, `getShaderPrecisionFormat`, `getShaderInfoLog`, `getShaderSource`, `WEBGL_debug_shaders`, `KHR_parallel_shader_compile`.
- [ ] Extensions (mandatory-for-Three first): EXT_color_buffer_float, EXT_color_buffer_half_float, OES_texture_float_linear, EXT_texture_filter_anisotropic, KHR_parallel_shader_compile, WEBGL_multi_draw, WEBGL_lose_context; then compressed textures (s3tc/etc/astc/bptc/rgtc/pvrtc as the GPU supports), EXT_disjoint_timer_query_webgl2, EXT_texture_norm16, WEBGL_clip_cull_distance, EXT_clip_control, WEBGL_render_shared_exponent, WEBGL_multisampled_render_to_texture, OVR_multiview2.
- [ ] Conformance: pin a Khronos [WebGL conformance2](https://github.com/KhronosGroup/WebGL/tree/main/sdk/tests) revision; run in QuickJS with a tiny DOM harness; publish pass/fail/skipped matrix (the creative report requires this, §2, §6.2).
- [ ] Three targets: `webgl_geometries`, `webgl_materials_*` (PBR, transmission), `webgl_shadowmap*`, `webgl_loader_gltf` (+ Draco/KTX2/meshopt), `webgl_postprocessing_*`, `webgl_instancing_*`, `webgl_multiple_render_targets`, `webgl_buffergeometry_*`, `webgpu_*` with WebGL2 fallback (TSL). Compare pixels against a reference browser (`scripts/pixel-diff.mjs` exists, tolerance-based).

## 7. Milestones and effort (one experienced dev; estimates, not measurements)

| # | Milestone | Weeks | Exit criterion |
|---|---|---|---|
| M0 | Spike: QuickJS runner + native GLES3 (ANGLE-Metal on macOS) triangle through hand-written `gl.*`; keep the mock-GL harness in CI | 1-2 | shader, VBO, draw in a window; decide ANGLE vs GL 4.1 on mac |
| M1 | L1 core + L2 binding generator (IDL table -> QuickJS C glue), 60-70 methods, error queue, object tables, default drawing buffer, present via display-gl pass | 4-5 | Three BoxGeometry + MeshBasic + textured cube run |
| M2 | Full method/constant set Three uses (142+15) with validation, UBO/MRT/3D tex/instancing/sync/queries, extension table, ANGLE translator for WebGL validation | 6-8 | Three PBR + shadows + instancing + post-processing examples |
| M3 | Browser host bundle (section 5.5 items 1 and 2), image decode, fetch, events, rAF, 2D canvas | 3-4 | glTF (+textures) + OrbitControls interactive |
| M4 | Linux/Pi 4-5: `kms.cpp` GLES3 context (`EGL_CONTEXT_CLIENT_VERSION 3`), cap detection, hardware run, Pi-specific quirks | 2-3 | Three demo on Pi 4/5 (Pi 3 = WebGL1 profile, next) |
| M5 | Zinc integration: `zinc:webgl` plugin + `zinc.json` option, `--engine` matrix, canvas-in-UI compositing (EXTERNAL_TEXTURE cmd or share-group texture), ABI buffer type, docs | 4-6 | hero-style UI with a live 3D panel, no readback, native + quickjs; VM only for typed API |
| M6 | Performance pass (profiling stages, precompiled bytecode, optional command stream + render thread, Three presets) | 3-4 | published per-engine numbers |
| M7 | Conformance push: Khronos WebGL2 suite subset, Worker, WebAssembly binding, Draco/KTX2/meshopt, WebGPURenderer-on-WebGL2 fallback | 8-12 | matrix published, documented gaps |
| M8 | WebGL1/GLES2 profile for Pi 1-3 (Three <= r162 or Zinc renderer variants), sim/wasm decisions | 4-6 | light-profile demo on Pi 3B+ |

Total M0-M6 ~ 23-32 weeks (the "Three works well on modern targets" number quoted in the summary as 25-35 with slack); M7 to conformance-grade +8-12; M8 optional +4-6. Parallelisable: M3 (host) with M2 (L1); M4 with M3.

## 8. Risks and open questions

1. **Interpreter speed** (measured 14-30x behind V8 on Three's code). Mitigation: Three presets, batching, engine swap seam. Might cap Pi 3 to "small scenes". This is the biggest risk to "real performance".
2. **macOS backend choice**: SDL3 GL 3.2 core (`sdl.cpp:17-20`) cannot run ES 3.00 shaders unmodified; Apple GL tops at 4.1 and is deprecated. ANGLE brings a large build (gn/depot_tools), BSD-3 license and a binary in tens of MB range (I: not measured); alternatives are ANGLE's translator + GL 4.1 (drift risk) or a Metal backend (huge). Decide in M0. SDL3 can load an ES/EGL driver (I: hint-based), to verify.
3. **VC4 (Pi 1-3) = WebGL1 only.** Three >= r163 impossible; light profile needs older Three or Zinc-side renderer (already documented in the creative report). Pi 3B+ also had an unexplained VC4 GPU hang (`gpu-renderer-design.md` phase 1b).
4. **Tile-based GPUs**: Three's frequent FBO switches (shadow maps, post-processing) cost flushes on VC4/V3D; MSAA render-to-texture unavailable on VC4.
5. **Conformance vs "Three works"**: the coverage list Three uses is 142 of 224 methods; the remaining ~80 exist for other libraries. "Complete WebGL2" is a separate, larger goal (M7).
6. **Zinc ABI**: no shared mutable buffers, scalar-only callbacks, no async completion (`engines.md:103-108, 292`). Typed-Zinc users of WebGL depend on that work; upstream-JS users do not.
7. **Threading**: ABI callbacks only on the engine thread (creative report §1); command-stream/render-thread needs care with the single-thread engine assumptions and the existing 3-slot plan.
8. **Security**: WebGL content is web-like untrusted input; `zinc:script` has memory/time limits and no I/O by design, the app runners do not (`engines.md:57-59`). A WebGL host must keep the same trust model (asset root, no arbitrary file reads, buffer-bounds validation before the driver).
9. **Maintenance**: Three r186 is moving (new `texElementImage2D` path, WebGPU-first roadmap; WebGLRenderer "maintained, no big new features"). Pin a version, publish the matrix.
10. **Unverified here**: quickjs-ng vs Homebrew qjs speed parity; Pi timings; ANGLE-on-SDL3 path; expo-gl performance; three-native's actual Three revision and current working state; Mesa V3D GLES level on a real Pi 4/5 in this stack; how many Khronos WebGL2 tests need a browser-only feature.

## 9. Key file references

- Repo: `docs/reports/gpu-renderer-design.md`, `docs/reports/render-perf-options.md`, `docs/plugins/display-gl.md`, `plugins/display-gl/{plugin.json,zgl.h,src/*.cpp}`, `runtime/vm/quickjs.cpp`, `docs/engines.md`, `runtime/include/zinc_abi.h`, `compiler/src/emit-js.ts:367`, `plugins/script/`, `docs/plugins/{script,three,canvas2d,wasm}.md`, `lib/std/{web,fetch}.ts`, `docs/guide/09-web-apis.md`, `docs/reports/creative-runtime-webgl-audio-2026-09-29.md`, `docs/reports/creative-studio-compatibility-demo-2026-09-29.md`.
- Scratchpad (not in repo): `mock-render-bench.mjs`, `scenegraph-bench.mjs` (benchmarks), `thr/` (three@0.186.1 install, `gl-idents.txt`), `tn/` (three-native docs and shim files pulled with gh api).
- External: [three-native](https://github.com/mattneel/three-native), [mquickjs README as vendored](https://github.com/mattneel/three-native/tree/main/deps/mquickjs), [expo-gl common/](https://github.com/expo/expo/tree/main/packages/expo-gl/common), [ANGLE](https://github.com/google/angle), [headless-gl](https://github.com/stackgl/headless-gl), [Babylon Native](https://github.com/BabylonJS/BabylonNative), [Three WebGLRenderer docs](https://threejs.org/docs/pages/WebGLRenderer.html), [Three WebGPURenderer manual](https://threejs.org/manual/en/webgpurenderer.html), [Mesa V3D](https://docs.mesa3d.org/drivers/v3d.html), [Mesa VC4](https://docs.mesa3d.org/drivers/vc4.html), [WebGL2 spec](https://registry.khronos.org/webgl/specs/latest/2.0/), [Khronos tests](https://github.com/KhronosGroup/WebGL/tree/main/sdk/tests), [SPIRV-Cross](https://github.com/KhronosGroup/SPIRV-Cross), [naga](https://github.com/gfx-rs/naga).
