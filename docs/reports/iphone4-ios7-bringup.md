# Zinc on iPhone 4 / iOS 7 — 2026-10-31

The owner's iPhone3,1, iOS 7.1.2 (11D257), runs `hello` and `bouncing-ball` in the interpreter, and `rn-showcase` compiled ahead of time with the shared GLES2 renderer. The showcase remains too slow during interaction; the owner explicitly reports poor animations and responsiveness. The owner installed Lyncis and OpenSSH, and confirmed the initial native UIKit probe stays open. The application containing the engine is **Zinc Legacy** (`dev.zinc.legacy`), separate from **Zinc Legacy Probe**.

## Device evidence

- `examples/hello`: output between `zinc:start` and `zinc:exit 0` exactly equals `zinc run --interp examples/hello` on the Mac, including floating-point formatting.
- `bouncing-ball`, deterministic 120-frame run, 320×480: both devices report `bd21d35ce981f6d6`; `tools/pngdiff` reports **0 differing pixels**, tolerance 0. Evidence: `build/ios-legacy/evidence/{mac-frame-120,iphone-frame-120}.png` and `hello.txt`.
- `tests/native/ios_legacy_clock.c` was compiled for iOS 7, signed and run on the phone: monotonic/raw/wall clocks and invalid-argument checks passed.
- Ordinary real-time demo also ran and wrote a frame-120 screenshot. Its HUD showed 47 fps at that instant; this is not a controlled performance benchmark.
- Background/foreground test: launched Settings, then returned to Zinc Legacy; the process remained PID 747, with no restart. The logical clock excludes paused time.
- The final build has no frame limit or automatic capture enabled. The owner confirmed the running demo and touch interaction work. Touch maps to the pointer and one touch point.

The installed binary targets iOS 7.0, uses ARMv7, and embeds libc++/libc++abi statically. `otool -L` lists only Apple system libraries/frameworks; the phone's old libc++ is not used.

## Implementation

`targets/ios-legacy` embeds the existing console interpreter or AOT program and graphics host in UIKit. The engine runs on a background dispatch queue. The current showcase uses an EAGL GLES2 context and the existing display-gl command replay used on Pi and webOS, drawing into a nonzero drawable framebuffer. Its GPU is PowerVR SGX 535, at 640×960 pixels for a 320×480 logical surface. GPU initialization failure is an error, rather than a silent software fallback. UIKit supplies touch and the native keyboard; the owner confirmed the keyboard opens. Yoga, SVG and Lottie modules are linked for this showcase.

Lifecycle events stop input/frame polling and hold the HAL's logical clock, including the loop/timer clock. UIKit receives no image update while inactive. Storage and logs use the app's Library/Zinc directory, obtained from `NSHomeDirectory`, rather than assuming an unrestricted filesystem.

Stock Clang rejects `thread_local` for 32-bit iOS before 9, even with `-femulated-tls`. `include/zn/thread_local.h` preserves native TLS by default and provides opt-in `ZN_PTHREAD_TLS`: one POSIX key per state type, initialized with `pthread_once`, lazy per-thread allocation, and thread-exit destructors. Runtime state/counters/callbacks/worker buffers use this interface. No state was replaced by a process-wide variable. The old target also needs a POSIX clock entry point backed by Mach time/gettimeofday (`compat.c`).

The console host was missing newer graphics-host dependencies: assetsRoot, screencast installation and pause/step clock operations. These now follow its existing asset directory and stripped desktop-service conventions, with an actual pauseable clock rather than no-op timing hooks.

## Build again

Requires CMake, Ninja, Homebrew LLVM (tested 22.1.8), Xcode's `ld-classic`, the SDK below, and LLVM runtime sources pinned to **llvmorg-20.1.8**, commit `87f0227cb60147a26a1eeb4fb06e3b505e9c7261`.

For a sparse LLVM checkout include `libcxx`, `libcxxabi`, `libc`, `runtimes`, `cmake`, `llvm/cmake`, and `llvm/utils/llvm-lit`. The floating-point charconv implementation needs LLVM libc's shared support headers even though libc itself is not linked.

```sh
ZINC_IOS_LEGACY_SDK=/tmp/zinc-ios7-sdk-original/iPhoneOS7.1.sdk \
ZINC_IOS_LLVM_SOURCE=/tmp/zinc-ios7-llvm \
ZINC_IOS_LIBCXX_BUILD=/tmp/zinc-ios7-libcxx-build \
tools/build-ios-legacy examples/bouncing-ball
```

Output: `build/ios-legacy/ZincLegacy.app`. The script builds the static C++ runtime, builds the app through `tools/build`, then packs the original Zinc project into a fresh bundle. It resets temporary test environment flags. It does not sign or modify the phone.

SDK source: <https://github.com/Sn0wCooder/theos-sdks>, commit `3111c86f53b021dabee781aec3fb2d9fb8f3f862`, split ZIP under `iPhoneOS7.1.sdk/`. Join the parts and extract while preserving symbolic links (plain Python `ZipFile.extractall` loses them). SDK 10.3 from Theos failed this UIKit link with missing `_memset`; use the proven 7.1 SDK. Apple clang 17 failed the object alignment assertion for this ARMv7 ABI; Homebrew LLVM passes it, so the build uses that compiler without weakening the assertion.

## USB deployment

Pairing: `idevicepair -u <udid> pair`. USB forwarding: `iproxy -u <udid> 2244:22`. Transfer the `.app` into `/Applications`, set the executable to mode 755, run the phone's `ldid -S /Applications/ZincLegacy.app/ZincLegacy`, and `su mobile -c uicache` for a first installation. Launch from its home-screen icon. A temporary signed SpringBoardServices launcher was used for repeatable device tests.

The phone's old SSH server needs `HostKeyAlgorithms=+ssh-rsa`; this Mac also needs `PubkeyAcceptedAlgorithms=+ssh-rsa` for key authentication. Keep these options scoped to this phone. The dedicated private key is `~/.zinc/devices/iphone4/id_rsa`. Root and mobile default passwords were replaced; local recovery files are `root-password.txt` and `mobile-password.txt` in that directory, mode 600. Never commit credentials.

The paid Developer portal route was abandoned: the owner uses a free account, and Xcode 26 rejects iOS 7 as a destination. No Apple Developer registration or profile is required for this jailbreak path.

## Validation and limits

Passed: `thread_local` (native and POSIX, including a build without compiler-provided thread-safe static guards), `threads_two`, `console_clock`, `console_core`, `console_host`, and `n3ds_frame_profile` (a native Mac test, not a 3DS build). The console-core checks used a Mac build with `ZN_PTHREAD_TLS`, so they exercise the fallback with real programs. Reproducible tool build and the two device programs above passed.

No full tier sweep or claim of general iOS support. Audio, multitouch gestures, arbitrary native plugins and QuickJS remain unproven. Real iPhone 4S/iOS 9 criteria of ZN-461/462 remain open. The HTC HD2 is connected: Android 4.3/API 18, root ADB, 480×800, about 410 MiB RAM. The console engine executes `hello` with the expected output using the NDK r23c API 18 sysroot and modern static libc++; a graphical Android demo remains pending.

## Remote diagnostics and the unresolved interaction cost

`tools/ios-legacy-device` opens and closes its own USB/SSH tunnel. It supports `status`, `start`, `stop`, `tap x y`, `down x y`, `move x y`, `up`, `text`, `enter`, `backspace`, `shot path.png`, `info`, `sample`, `profile --seconds 3`, and `logs`. `gpu-time on` enables synchronized replay/copy/swap timing in the app log; turn it off after measuring, as GL completion barriers alter the pipeline. `install build/ios-legacy/ZincLegacy.app` preserves the previous app before signing and replacing it. These controls target this app, not arbitrary system touch injection.

The first GPU build copied and presented identical idle frames. Skipping those duplicate presentations reduced the measured idle interval median from 66,272 µs to 17,855 µs (180 recorded frames after 60 warm-up frames); presentation median fell from 65,287 µs to 25 µs. This proves the idle correction only. An earlier finite 240-frame profiling build stopped updating at its limit; the installed interactive app has no frame limit.

Remote input reproduced the owner's complaint: a drag on Forms recorded individual frames of 121–323 ms, overwhelmingly in presentation. Idle samples instead showed about 56 fps, 150 µs of frame work, roughly 2% engine CPU and 27–31 MB RSS. Idle fps must not be presented as interactive performance. Enabling the existing lean shaders specifically for SGX 535 did not materially improve the same drag (108–340 ms); that tuning change was reverted. Evidence for this rejected experiment is in `/tmp/iphone-scroll-lean.jsons`. No responsiveness fix is claimed.

## Rendering research: primary sources and source audit

Research requested by the owner after confirming animations and input remain poor. The synchronized replay timings include CPU submission plus GPU completion, not GPU-only hardware counters. At 640×960, the Forms drag measured 135–148 ms replay with one 371 ms spike, about 75 µs copy bookkeeping and 200–246 µs swap after completion. At 320×480, the same gesture measured 43–48 ms replay with one 221 ms spike. These diagnostic barriers serialize the pipeline; use them to locate cost, and measure normal frame latency separately. This scale-1 experiment was temporary. The installed app is now back at Retina scale 2, with GPU timing and verification switched off.

Priorities, grounded in the existing engine rather than a replacement renderer:

1. **Connect retained scroll and damage to display-gl.** `targets/macos/hal_sdl.cpp::gl_moved` uses `HalFrame.move`, `glr::scroll` and `glr::frame_rects`, while `gl_show` handles the rotated texture in pieces. `plugins/display-gl/src/display_gl.cpp::present` never invokes these paths. Its shared replay defaults damage limiting off and adaptive presentation therefore selects whole-screen direct replay. This is a concrete integration gap, not a proven speedup yet. Port the complete scroll/presentation path, including texture validity, unrotation, screenshot and resize behavior; do not merely turn on the ring buffer without presenting its pieces correctly. Keep Pi's documented partial-damage hang history in mind and scope capability policy per backend.

2. **Avoid redundant rounded clips.** [Skia ClipStack](https://github.com/google/skia/blob/main/src/gpu/ganesh/ClipStack.cpp) geometrically classifies draws and skips clips that cannot affect their output, retaining the scissor when needed. Zinc currently adds the rounded-clip shader block to all quads under an active rounded clip; `run_of` also excludes lean programs there. Classify containment conservatively in device space, preserving antialias coverage and nested clips. Test fractional edges and transforms before deployment. An exploratory local implementation was removed pending this proof.

3. **Specialize shader precision and texture coordinates for SGX.** [Imagination precision guidance](https://docs.imgtec.com/performance-guides/graphics-recommendations/html/topics/demystifying-precision.html) describes SGX-specific lowp colour representation and warns that Series5/5XT texture coordinates in varying `.zw` cause dependent reads. [Texture guidance](https://docs.imgtec.com/performance-guides/graphics-recommendations/html/topics/texture-sampling.html) explains why dependent reads prevent prefetch. Zinc's general fragment programs default to highp when supported and carry broad varyings; inspect texture-coordinate construction and use narrow colour/coverage precision where image comparisons permit. Do not transfer Rogue throughput claims to SGX535, and do not change all arithmetic to mediump blindly.

4. **Reduce tile loads/stores and unnecessary overdraw.** [Apple's iOS GLES performance guide](https://developer.apple.com/library/archive/documentation/3DDrawing/Conceptual/OpenGLES_ProgrammingGuide/Performance/Performance.html) recommends clearing new targets, grouping work per target, avoiding unnecessary synchronization and discarding disposable attachments. The EAGL host already has an opaque layer and non-retained backing, but does not discard its drawable depth/stencil attachments. Add `glDiscardFramebufferEXT` only when supported, after their last use, without discarding retained colour textures. Zinc already has opaque runs/occlusion; measure whether their policy is beneficial on this device. [Imagination](https://docs.imgtec.com/performance-guides/graphics-recommendations/html/topics/z-pre-pass-and-powervr.html) warns against redundant opaque Z prepasses on PowerVR; do not remove the engine's distinct occlusion strategy without an A/B measurement.

5. **Cache stable subtrees for transform/opacity animations, with a budget.** [Flutter's opacity layer](https://github.com/flutter/flutter/blob/master/engine/src/flutter/flow/layers/opacity_layer.cc) tracks invalidation and reuses cached content when appropriate, while directly inherited opacity avoids unnecessary caching. Apply this selectively: keys must include content, scale, clip and resources; enforce an eviction budget on the phone's limited memory. Group opacity must preserve overlap semantics. This is a larger engine improvement than the missing scroll connection.

6. **Batch uploads and filter redundant GL state changes.** [NanoVG's GLES2 backend](https://github.com/memononen/nanovg/blob/master/src/nanovg_gl.h) records calls, uploads frame vertex data together and caches texture/stencil/blend state. Zinc already batches runs and preloads glyphs; profile remaining flush boundaries before adding another batching layer. This is secondary while replay cost scales strongly with pixels.

Proof for each candidate: one fixed interaction trace, warm and cold runs, normal frame p50/p95/p99 and input-to-visible latency, then GPU captures versus a full replay. Track shader compilation, draw calls, uploaded bytes, retained texture memory and CPU/raster work separately. No projected speedups or 60 fps guarantee. The priority is the shared engine; the showcase source stays unchanged.

## Implemented renderer improvements

The iPhone uses retained partial replay through the shared display-gl driver. Vertical scrolls use the replay's existing circular texture and present its wrapped rows as pieces; horizontal or incompatible scrolls fall back to its existing pixel-copy operation. Only the exposed/damaged rectangles are replayed. Texture validity is reset on size changes, direct drawing invalidates the cache, and scaled/placed/layered presentations unrotate the texture first. Partial replay remains opt-in per backend (or explicitly through `ZINC_GL_DMG=1`); Pi's known partial-damage history does not change its default.

The opaque UIKit target disables colour-key transparency and uses a minimal texture-copy program without colour conversion, key-distance calculations or blending. Its copy diagnostic at 640×960 fell from about 60 ms to 9–11 ms. One-to-one copies use nearest sampling; scaled presentations retain linear filtering.

Shared replay geometry now conservatively skips rounded clip shader calculations for quads entirely inside the clip's fully covered central cross. The half-pixel margin preserves antialiased corners; every active nested clip must contain the quad. Such quads can use the existing lean shaders and opaque runs. Those shaders are enabled for SGX535 specifically; other PowerVR models retain their tuning. The standalone `gl_clip` test checks the geometric proof against coverage calculations, and `gl_caps` checks the model policy.

The latest Forms diagnostic (12 samples, native 640×960) measured a 14,287 µs replay median, 9,660 µs copy median and 24,226 µs total median, versus approximately 140 ms before these changes. The maximum of this small trace is 48,306 µs: there are still spikes, and this does not establish steady 60 fps or p95/p99. A normal, unsynchronized eight-sample trace recorded 5,178.5 µs median frame work (CPU submission/presentation); this is not GPU completion time.

Pixel evidence: a held, settled scroll was captured from the actual EAGL drawable, then compared with a full replay of the same state. The two 640×960 screenshots are byte-for-byte equal in RGB. The earlier moving-frame texture oracle found 53 differing pixels with maximum channel error 1/255, then zero on subsequent stable checks. Comparing the initial optimized Forms page with the earlier full renderer gives maximum error 8/255 and mean channel error 0.070, within the existing renderer tolerance. Captures taken while the scrollbar fades must not be compared as if the scene were static. Artifacts and raw logs: `build/ios-legacy/evidence/render-scroll/`.

The SDL display backend now preserves recorded input after the host applies it; previously the live mouse overwrote the scripted pointer and the driver scroll test moved nothing. `display_gl_scroll` runs the existing scroll oracle through the plugin, including an opaque target. `gl_scroll` retains the native-window comparison. On iPhone, `gpu-verify on|off` compares retained contents with a full redraw; this is intentionally expensive. Remote drags own pointer input until `up`, so manual touches cannot corrupt a measurement; backgrounding releases that ownership. No diagnostic frame limit is installed.

Remaining work: test more animation-heavy tabs and cold shader paths; evaluate colour/coverage precision and cached stable subtrees if measurements justify them. No global reduction in UI effects or resolution was kept.

Final targeted checks passed: `gl_clip`, `gl_caps`, `display_gl_scroll` (default and opaque plugin targets), `gl_scroll` (native window), and `gl_renderer` (software-reference pixel comparisons). The final installed app is foreground, GLES2/SGX535 at scale 2, with no test environment/frame cap. No other device was benchmarked in this rendering pass.


## Motion and native input follow-through (2026-10-31)

The Forms result above did not predict Motion: the user correctly reported an unusable swipe-card page. A synchronized GPU completion trace of the card spring measured a 485.101 ms replay median across its last ten animated frames, plus 9.22 ms for the copy. CPU layout/paint was a few milliseconds; the GPU replay dominated. Each variant below uses its own last ten animated samples, rather than the rolling profiler that also contains idle frames. These small traces are diagnostic comparisons, not sustained-FPS or percentile benchmarks.

| Variant | Pixel surface | Replay median | Copy median |
|---|---|---:|---:|
| Initial Motion | 640×960 | 485.101 ms | 9.220 ms |
| Conservative interiors and border bands under transforms | 640×960 | 429.327 ms | 9.190 ms |
| Lean shaders with rounded clips | 640×960 | 260.849 ms | 8.730 ms |
| Reusable corner coverage masks | 640×960 | 212.259 ms | 8.790 ms |
| Split large quads into unclipped centres and clipped rims | 640×960 | 163.123 ms | 8.690 ms |
| Cached polygon coverage instead of repeated stencil fills | 640×960 | 144.480 ms | 8.680 ms |
| Logical-density legacy drawable | 320×480 | 46.140 ms | 3.270 ms |
| Conservative opaque interiors in the depth pass | 320×480 | 39.044 ms | 3.283 ms |

The final policy is scoped to SGX535 through its existing tuning record: sampled rounded-clip coverage, centre/rim splitting, polygon coverage tiles and conservative opaque interior depth writes. Other GPUs keep their policies. An environment override permits comparing polygon and depth paths. The depth pass covers only opaque rectangle/linear-gradient interiors, intersected with conservative interiors of every clip; axis-aligned positive transforms are supported, other matrices stay in paint order. The normal pass uses LEQUAL so the primitive that wrote its depth still paints its own colour. Transparent artwork and antialiased rims never occlude.

The legacy UIKit drawable now defaults to scale 1 (320×480 logical dimensions and pixels), preserving layout and input coordinates. This sacrifices Retina detail; process environment `ZINC_SCALE=2` restores native density. It remains a GPU renderer. The polygon path caches CPU-generated coverage and composites it on the GPU; it is not a whole-frame software renderer. A separate experiment caching circle coverage brought no measurable benefit (39.846 ms replay) and was removed.

Pixel checks: `gl_clip_pixels` compares analytic clips, sampled clips/depth and cached polygon coverage against the software reference, including fractional/nested clips, unsupported mask radii, cache eviction and transformed fills/borders. It passes the repository's renderer tolerance. `gfx_transform` also passes. The actual EAGL retained-texture/full-redraw oracle reported zero differing pixels on the settled Motion scene at 320×480. This oracle checks retained replay correctness, not shader equality with software. Raw logs, screenshots and medians: `build/ios-legacy/evidence/motion-input/`.

Native input now publishes the actual iOS platform and maps keyboard traits, including field keyboard type and Return labels. A native Done accessory is available on every keyboard. Single-line Return defaults to blur-and-submit; multiline newline and explicit keep-focus policies are preserved. `submitBehavior` and legacy `blurOnSubmit` are supported; a submit callback focusing another input does not insert a newline into that new field. Keyboard notifications include native duration/curve, reused by KeyboardAvoidingView's existing layout animation. Interpreter/AOT/QuickJS `input_submit`, `keyboard_avoid` and `react_native_input` checks passed. The physical-device check confirms native Return and Done both dismiss, reopening still works, and email selects the email keyboard; observed states are saved with the artifacts.

Remaining limitation: the heavy card sequence still costs about 43 ms of synchronized GPU work, before CPU work. This is not smooth 60 fps, and this measurement does not prove all sliders or keyboard transitions free of stalls. `Canvas lazy` suppresses idle redraws, but does not cache a GPU subtree during transform animation. Correct GPU render-to-texture caching (with invalidation, transparency and memory limits) is the next substantial renderer improvement; do not disguise this gap with demo-specific artwork changes. No HTC/Pi/webOS benchmark was repeated in this pass. The original iPhone 4S/iOS 9 task criteria remain open.
