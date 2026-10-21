# Test audit g4: GL/WebGL, webenv, web export, three.js, 3D, images, video, webrtc, camera, audio, JS libs, language conformance

Scope: 102 T1 tests (list in the audit scratchpad `g4.txt`). All scripts read in full (long ones to the end of their logic). CI status = v0.4.2 release run.
Rows with `SHORTEN` are valuable but over 60 s on CI or carry a build step that belongs in the CI build.

| test | verdict | target (dup/merge) | reason with file:line evidence |
|---|---|---|---|
| audio | KEEP | | Plugin on miniaudio null backend, exact samples, interp+AOT+deterministic stand-in (audio.sh:11-21); no hardware |
| breakout_pad | KEEP | | 900-frame scripted pad session, hash per console profile (breakout_pad.sh:9-13); 0 s, deterministic software raster |
| camera_pixels | LOCAL-ONLY | | Needs libgphoto2+turbojpeg (camera_pixels.sh:4) -> exit 77, SKIPs on CI (no libs on runner); could `brew install` them |
| camera | LOCAL-ONLY | | Same gate (camera.sh:4), SKIPs on CI; the fake-camera session + permission refusal are only proven where libgphoto2 exists. Permission part duplicated by webcam.sh:42-46 |
| canvas | KEEP | | zinc:canvas native plugin vs frozen conformance output interp+AOT (canvas.sh:7-8) |
| cli_tools | KEEP | | capture/bench/tsconfig/infer/deploy --print/export on a fresh project, output checked (cli_tools.sh:12-35); bench check is on the profile line, not a time |
| clock | KEEP | | Virtual clock unique (clock.sh:9-13). Caveat: wall-time bounds (<200 ms at :12, >=300 ms at :15) are timing asserts; loosen to 1 s on a loaded runner |
| conformance | KEEP | | Byte-compare to frozen corpus outputs (conformance.sh:17-19), the language core |
| corpus_complete | DELETE-WEAK | | Counts files of the frozen corpus (corpus_complete.sh:5-9) and `[ -s corpus/ui/clock-20.png ]`; checks repo layout, not behaviour. `conformance`/`oracle_diff` fail on a missing source anyway |
| date_zones | KEEP | | Date in 3 zones vs Node output (date_zones.sh:9-11); TZ database/abbreviation table, unique |
| example_js_gsap | KEEP | | Real GSAP 3.15 as a user runs it + `new URL` regression (example_js_gsap.sh:3-6). Needs download via tools/test-lib (network on first run, SKIP if absent) |
| example_js_p5 | SHORTEN | webenv_canvas2d_libs (2D part) | 19 s; the second block (sketch2d, :16-19) is p5 default 2D mode, already covered by webenv_canvas2d_libs.sh:25 (`page p5`) and webenv_p5 covers WEBGL boot. Keep WEBGL screenshot, drop the 2D run. Network download |
| example_js_phaser | KEEP | | Scripted game ends on "game over: 3 stars" (example_js_phaser.sh:15) + screenshot; webenv_phaser covers boot/shaders only |
| example_js_pixi | KEEP | | Pointer click + BlurFilter, ssim/tol screenshot (example_js_pixi.sh:13); webenv_pixi is API-level pixel reads. Minor overlap on pointer events, acceptable |
| example_js_three | KEEP | | GLTFLoader+lights+drag screenshot (example_js_three.sh:12); webenv_three has no glTF |
| example_output | KEEP | | Output of non-visual examples + two frozen prototype frames (example_output.sh:5-6); 30 s ok |
| examples | KEEP | | Smoke of ~30 examples (exit 0, 3 frames) + 3 pixel goldens (examples.sh:11-19). Smoke half overlaps tests/t2/examples_all.sh; if examples_all runs on CI, cut the exit-0 loop and keep the 3 goldens |
| fixed_verify | KEEP | | Verifier refuses f64 in fixed profile, with opt-in negative control (fixed_verify.sh:23-28) |
| gl_convex | KEEP | | GL replay vs software, 1%/mae1 (gl_convex.sh:14-18); needs Aqua session, so it runs on the hosted macOS runner (PASS 4 s) |
| gl_cube | KEEP | | GL cube interp==AOT frame hash + colour check + "no libzn_webgl loaded" (gl_cube.sh:14-30); exit 77 without context |
| gl_occlusion | LOCAL-ONLY | | Explicit `ZINC_CI` skip (gl_occlusion.sh:7); SKIPs on CI, honest |
| gl_offscreen | SHORTEN | | 64 s is the bare `cmake --build ... -j8` inside the test (gl_offscreen.sh:6, breaks the tools/build load rule). Build in the CI build step, test only runs `build/gl_offscreen`. Needs a real offscreen GL context (passes on CI via software GL) |
| gl_renderer | LOCAL-ONLY | | Explicit `ZINC_CI` skip (gl_renderer.sh:13); SKIPs. Inconsistent: gl_strips/image_rect_gl use the same 5%/3 tolerances and run on CI |
| gl_replay_es2 | SHORTEN | | glslang check of GLSL ES 1.00 shaders, no GPU needed: KEEP. 64 s is `tools/build gl_replay_es2` inside the test (gl_replay_es2.sh:7); move the build to CI build step |
| gl_scroll | LOCAL-ONLY | | `ZINC_CI` skip (gl_scroll.sh:11), real GL window + touch script |
| gl_strips | SHORTEN | gl_renderer (same method) | 93 s, 4 programs x 2 renders (gl_strips.sh:10-13). Same glcompare limits as gl_renderer. Cut to shapes.ts + navigation (the strips-specific ones); lottie/svg gallery are already frame-checked by svg_lottie. Passes on CI while gl_renderer is skipped there: decide one policy |
| gpu_strokes | SHORTEN | gl_strips (window half) | 95 s. Software half (hash equality ZINC_GPU_STROKES 0/1, :8-10) is cheap and unique. Window half (:12-18, navigation 60 frames, "0 LINE/POLY tiles") duplicates gl_strips.sh:15 assertion on the same program. Drop the window half |
| gsap | KEEP | | plugins/gsap core API golden, interp + AOT (gsap.sh:9-12); distinct from example_js_gsap (real lib) |
| image_rect_gl | KEEP | | GL sprite pipeline vs software at same density + texel checks (image_rect_gl.sh:30-45); 18 s; SKIP 77 w/o window |
| image_rect_wasm | KEEP | | Browser draw of baked images in Chrome vs interpreter within 2 + game-2d exported & played (image_rect_wasm.sh:21-43). 41 s, needs Chrome + pinned zig download; Chrome-flaky risk, runs on CI today |
| image_rect | KEEP | | Software sprite frames: interp/QuickJS/AOT, xform, tint/blend, damage (image_rect.sh:15-50) |
| image_reuse | KEEP | | Regression for image slot reuse (image_reuse.sh:8-12); GPU half skipped under ZINC_CI, software half still meaningful |
| jsontestsuite | KEEP | | JSONTestSuite y_/n_/i_ answers (jsontestsuite.sh:8-10) |
| leapmotion_demo | KEEP | | Session golden + fruit scene + interp==QuickJS==AOT (leapmotion_demo.sh:21-38); library forced missing, simulator only. 23 s |
| many_images | KEEP | | 1000 runtime images per cell, limit warning, interp/native (+GL if available) (many_images.sh:34-40) |
| marble | SHORTEN | | 91 s. Four console-size runs of 900 frames (marble.sh:49-52) + 1400-frame interp + native + QuickJS + 700-frame lose run. Keep win.log/frames/engines/lose/f32 rules; cut budgets to 480x272 and 960x544 only (the 400x240/640x448 budgets are the same tri-count class) |
| oracle_diff | KEEP | | Differential check vs reference tsc (oracle_diff.sh:9-14); SKIP 77 w/o Node; Node present on runner (PASS) |
| physics2d | KEEP | | Box2D golden on 3 engines + 10000 shots + dead-code check (physics2d.sh:20-35); 16 s |
| physics3d | KEEP | | Jolt golden incl. 4 threads, replays, shots (physics3d.sh:21-36); 37 s |
| platformer | KEEP | | Same scheme as marble, 25 s (platformer.sh:20-39) |
| qjs_demos | KEEP | | hero/rn-showcase/nuxt-ui/breakout/webcam QuickJS frame == interpreter frame (qjs_demos.sh:21-27); bundle part conditional on esbuild |
| quickjs | KEEP | | Golden corpus on QuickJS + shapes frame (quickjs.sh:10-20) |
| shader_gl | KEEP | | SHADER command GL vs CPU path, 0 % over 24 and mae<1, and "shader actually drew" check (shader_gl.sh:14-24); 12 s |
| sprite_atlas | KEEP | | Atlas packing tables + texel checks + engines + no-packs fallback (sprite_atlas.sh) |
| svg_lottie | KEEP | | Lottie conformance + 2 gallery goldens + "not linked into zinc" nm check (svg_lottie.sh:8-13) |
| test262_regexp | SHORTEN | | 68 s for 2557 test262 cases on QuickJS (test262_regexp.sh:6). Valuable (regex engine), but run on nightly/T2, or parallelize `tools/test262` over the 3 cores |
| texture | SHORTEN | | 159 s, longest of the group. 6 basisu release builds (texture.sh:36-39) + determinism double build + software + GL + webgl ext. Cut to macos, rpi1, wasm (drop rmpp/sim/ps2 format-table rows: arithmetic only) and drop the second-copy determinism for macos (keep wasm). The GL part SKIPs (not fails) without a window |
| three_3d | KEEP | | scene3d/three conformance + 4 golden frames with tol 1 / 8 px (three_3d.sh:9-14) |
| three_gpu | LOCAL-ONLY | | `ZINC_CI` skip (three_gpu.sh:7), SKIPs. Renderer-selection table (:last block) is hardware-free and could move to three_3d |
| three | KEEP | | Real three.js vs headless Chrome reference, SSIM>=0.90 via tools/three-compare (three.sh:3-4). Uses Chrome (flaky risk) but passes on CI at 11 s; cross-check with web_gl (examples/three/cubes in Chrome) |
| tilemap | KEEP | | Tiled/LDtk import vs editor renders + 3 engines + .tmx refusal (tilemap.sh) |
| tiles | KEEP | | Tiled painting == plain render() hashes, 6 frames (tiles.sh:7-9); 0 s |
| video_layers | KEEP | | Hardware layer path vs software with a test display driver (video_layers.sh:6-12), no GPU needed |
| video | LOCAL-ONLY | | Real decode only if FFmpeg libs present (video.sh:12); on CI (PASS in 0 s) it silently degrades to "3 examples exit 0 on the fake player" (video.sh:27-30), proving almost nothing. Make it exit 77 without FFmpeg, or install ffmpeg on the runner |
| web_caps | KEEP | | W0601/W0602 diagnostics, --werror, explain codes (web_caps.sh:11-26); Chrome part conditional. 47 s: SHORTEN candidate if the Chrome part is trimmed |
| web_dev | KEEP | | Fast Refresh/overlay/full-reload through tools/web-dev-test (web_dev.sh); 14 s Chrome; flaky risk, passing |
| web_dom_visual | LOCAL-ONLY | | Needs PIL+numpy+Chrome (web_dom_visual.sh:9-11), SKIPs on CI; thresholds are font/GPU dependent |
| web_dom | LOCAL-ONLY | | Explicit `ZINC_CI` skip (web_dom.sh:8): Chrome scroll position on loaded runner. Prerender half (:30-34) needs no scroll and could be split out |
| web_export | LOCAL-ONLY | | Explicit `ZINC_CI` skip (web_export.sh:7). The file-layout assertions (hashed names, headers, gz, size <600000, :18-30) are Chrome-free and could run on CI as a separate test |
| web_gl | LOCAL-ONLY | | Explicit `ZINC_CI` skip (web_gl.sh:12): Chrome hangs on context loss. `gen-web-gl --check` (:17) is a cheap CI-able staleness check worth splitting out |
| web_hw | SHORTEN | | 93 s on CI. Mock hardware APIs (serial/midi/osc/gphoto2 over WebUSB) + MapLibre map pixels (web_hw.sh). Split map part (5 s wait + pixel palette, font/GPU-dependent) from the mock part; two exports per run |
| web_libs | SHORTEN | | 71 s; installs real npm packages (zustand, zod, axios...) with `zinc install` on first run = external network (web_libs.sh:3-4). Cache or vendor the packages, run nightly |
| web_npm | KEEP | | First half (package-manager detection, error codes, explain) is network-free CLI checks (web_npm.sh:12-23); browser half uses a fixture. 52 s: could drop Chrome half to nightly |
| web_physics2d | SHORTEN | | 71 s, mostly the Box2D wasm build with the pinned zig; assertion web==native within 0.01 is unique (web_physics2d.sh:35-39). Cache the wasm or run nightly |
| web_plugins | LOCAL-ONLY | | Explicit `ZINC_CI` skip (web_plugins.sh:6), fake camera/mic WebRTC in Chrome |
| web_real | SHORTEN | | 88 s, 4 Chrome runs (canvas, dom, load, raw) at DPR 2 (web_real.sh). Real-input regressions are valuable; drop the second render pass and merge #2 (favicon) into #1. Passes on CI but timing-sensitive |
| web_video | LOCAL-ONLY | | `ZINC_CI` skip (web_video.sh:6): runner Chrome has no VP9 |
| web_vite | LOCAL-ONLY | | `ZINC_CI` skip (web_vite.sh:7) + node/npm install over network |
| webcam_demo | KEEP | | Per-state frame hashes + scripted sessions (photo 640x480, delete, permission screens) with fake camera (webcam_demo.sh); 37 s, no device |
| webcam | KEEP | | zinc:camera plugin session on interp/QuickJS, getUserMedia stream, permission refusal (webcam.sh:14-46); fake camera |
| webenv_audio | KEEP | | Web Audio shim on zinc:audio, mix log (webenv_audio.sh:19-37); 3 s |
| webenv_canvas | KEEP | | WebGL context of canvas element + frame golden (webenv_canvas.sh) |
| webenv_canvas2d_full | KEEP | | Path2D/blend modes vs Chrome-printed numbers (webenv_canvas2d_full.sh:17-23) |
| webenv_canvas2d_libs | KEEP | | pixi/phaser/p5 2D text vs Chrome PNGs by SSIM (webenv_canvas2d_libs.sh:25-29); p5 leg needs download, skipped if absent |
| webenv_canvas2d | KEEP | | Text metrics vs Chrome, scene SSIM, overlay (webenv_canvas2d.sh) |
| webenv_gamepad | KEEP | | Scripted pads, Phaser GamepadPlugin, SDL virtual pad on dummy driver (webenv_gamepad.sh:27-29); no hardware |
| webenv_image | KEEP | | Image elements as texture sources, per-format exact pixels (webenv_image.sh) |
| webenv_p5 | KEEP | | p5 WEBGL boot and pixel read-back (webenv_p5.sh:12-14); overlaps example_js_p5 only in "p5 runs", asserts differ |
| webenv_phaser | KEEP | | Phaser WebGL1 boot, loader, key and pointer (webenv_phaser.sh:10-13) |
| webenv_pixi | KEEP | | Pixi v7 and v8 pages + picture loading (webenv_pixi.sh:21-24) |
| webenv_three | KEEP | | three.js cube readback, OrbitControls drag azimuth, TextureLoader (webenv_three.sh:9-16) |
| webgl_conformance | LOCAL-ONLY | | `ZINC_CI` skip (webgl_conformance.sh:3): virtual GPU leaves buffers uninitialised (ZN-701). Honest SKIP |
| webgl_gizmo | KEEP | | OrbitControls/TransformControls via Surface events, text golden (webgl_gizmo.sh:3) |
| webgl_js | MERGE | webgl2_js, webgl2_tex, webgl_libs, webgl_present | Five 6-10 line scripts with the same shape (`run X.js --engine quickjs | diff golden`, e.g. webgl_js.sh:3-9, webgl2_js.sh:6-7, webgl2_tex.sh:5-6, webgl_libs.sh:15-19). Unique assertions all kept: fold into one `webgl_js.sh` looping over the goldens. Saves 4 runner entries, no coverage loss |
| webgl_libs | MERGE | webgl_js | See webgl_js row; unique: sibling_interfaces, essl1_define_in_out, essl1_texture_name, three context.js (webgl_libs.sh:20-23) |
| webgl_present | KEEP | | Sync vs async present frame mapping (webgl_present.sh:11-14); different mechanism (frame hashes). May fold into webgl_js group if wanted |
| webgl_studio | KEEP | | glTF truck scene text golden (webgl_studio.sh:3) |
| webgl_surface | KEEP | | WebGL in a Surface node, frame hash golden (webgl_surface.sh:5-7) |
| webgl1_core | SHORTEN | | 52 s is `cmake --build build --target webgl1_test -j8` inside the test (webgl1_core.sh:3); same fix as gl_offscreen: build in CI build step |
| webgl2_js | MERGE | webgl_js | One golden diff (webgl2_js.sh:6-7) |
| webgl2_tex | MERGE | webgl_js | One golden diff (webgl2_tex.sh:5-6) |
| webp | KEEP | | libwebp decode of asset == frozen frame, capture --format webp byte-equals asset (webp.sh:8-13) |
| webrtc_call | KEEP | | Call demo frame hashes + real-time echo-peer session (webrtc_call.sh:24-33); 55 s, real-time timeouts, fake devices |
| webrtc_chat | SHORTEN | | 68 s: hashes + session + spawns signalling server and two app copies in a room, 60 s timeouts each (webrtc_chat.sh:30-45). Real-time and port based = flaky on 3 loaded cores; keep the hashes+session, make the 2-peer room a nightly |
| webrtc_media | KEEP | | Audio/video RTP loopback on 4 engines/modes incl. VP8-only (webrtc_media.sh:20-30); 51 s. Could drop the QuickJS run since webrtc.sh already proves the plugin there |
| webrtc | KEEP | | Data-channel loopback, host candidates only, + permission refusal (webrtc.sh:16-29) |
| webview_hybrid | LOCAL-ONLY | | `ZINC_CI` skip (webview_hybrid.sh:1): no window frame for WKWebView |
| webview | KEEP | | Real WKWebView RPC + zinc:// assets in a moved .app, asserts "bundled|reply:rpc|rejected" (webview.sh:34-36); PASS on CI in 13 s |
| wpt_url | KEEP | | 896/896 + 278/278 WPT cases (wpt_url.sh:6); zbc-grep half (:9-13) is weak but cheap |
| zinc3d_aa | LOCAL-ONLY | | `ZINC_CI` skip (zinc3d_aa.sh:7), multisampling needs a real GPU |
| zinc3d_glow | KEEP | | Software frame == golden and flat-colour sums, GPU within 2 (zinc3d_glow.sh:8-22); skips only the GPU half |
| zinc3d_gltf | KEEP | | glTF GLB==OBJ, golden, warnings, required-extension error, 90601-vertex split (zinc3d_gltf.sh) |

## Counts

KEEP 66, SHORTEN 14, LOCAL-ONLY 17, MERGE 4 (webgl_js, webgl_libs, webgl2_js, webgl2_tex into one script), DELETE-WEAK 1, DELETE-DUP 0. Total 102.

## Cross-group duplicates and notes

- Chrome-driven web tests (web_*): CI policy is inconsistent. web_dom/web_export/web_gl/web_plugins/web_video/web_vite skip on `ZINC_CI` because headless Chrome is flaky on the runner, yet web_caps, web_dev, web_hw, web_libs, web_npm, web_physics2d, web_real, image_rect_wasm and three run Chrome and passed. Same flakiness risk; pick one rule (Chrome tests nightly only) and split Chrome-free assertions (export file layout, gen-web-gl --check, prerender index.html, W06xx diagnostics, P000x errors) into small CI tests.
- gl_renderer (skipped on CI as "virtual GPU: other pixels") vs gl_strips, gpu_strokes, image_rect_gl, shader_gl, many_images, gl_convex: all compare GL replay with the software frame and do run on CI. Either the virtual-GPU claim is wrong for the first or too loose for the rest.
- `examples` (t1) vs tests/t2/examples_all.sh and tests/t2/examples_pixels.sh: exit-0 smoke is duplicated.
- p5 appears in three tests: example_js_p5 (WEBGL + 2D), webenv_p5 (WEBGL boot), webenv_canvas2d_libs (2D). 2D is double covered.
- Camera permission refusal (`needs the permission "camera"`) is asserted in camera.sh:21-23 and webcam.sh:42-46 (two plugins, same mechanism); a permissions test in another group probably covers the mechanism.
- Frozen-corpus conformance: conformance.sh, quickjs.sh (same .out on QuickJS), fixed_verify.sh (same programs, other check), plus T2 diff-matrix compare interp/AOT/frozen for the whole corpus: check with the language group that conformance.sh is not a subset of diff-matrix.
- gl_offscreen, webgl1_core, gl_replay_es2 build their own binary inside the test (gl_offscreen.sh:6, webgl1_core.sh:3, gl_replay_es2.sh:7), 52-64 s each is compile time: move to the CI build step (tools/build) for all three. gl_offscreen and webgl1_core use bare `cmake --build -j8`, against the repo's own load rule.
- Network at test time: example_js_gsap/p5 (tools/test-lib), webenv_canvas2d_libs p5 leg, web_libs, web_vite, texture (basisu toolchain), web_physics2d/image_rect_wasm/web_plugins (pinned zig). All degrade to exit 77 offline but cost minutes when online; cache them as CI artifacts.
- Time asserts: clock.sh (200 ms / 300 ms wall), webrtc_* and webcam_demo real-time runs with `timeout`. Loosen or avoid on 3 shared cores.
