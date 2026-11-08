# Later: what is not a task yet

The backlog is frozen (AGENTS.md, "Keep the backlog shrinking and the sessions cheap", owner, 2026-10-11): an idea, an improvement, hardening, a measure
to take or a check on another target is one line here, not a task. `- ZN-n: what, and why it matters` (ZN-n is the task that found it).
The next backlog review turns lines into tasks or deletes them.

## Engine and tools
- A native spec cannot carry `Promise<...>` through the plugin thunk (Z5011 "no thunk") although docs/guide/05-plugins.md shows one: zinc:monitors uses a callback instead; found by app/lumen.

- Owner audit 2026-10-31: promote proven app/demo primitives (delay, atomic text replacement, key/value config, native token comparison, CLI) and Last.fm/Hub domain services with real consumers; reconcile acceptance, permissions, units and ownership first. Evidence and order: `docs/reports/app-demo-reuse-audit-2026-10-31.md`.

- Owner memory pass 2026-10-31: measure portable JPEG subsampling and safe bounded residency for shared named asset handles; JPEG/WebP source/bundle storage is now lazy, while decoded named handles remain cached and stb JPEG still has full-size temporary decode peaks.

- zinc:system simulator: `ZINC_SYSTEM_SCRIPT` splits a line's arguments on spaces, so `dialog-answer /Users/me/Pictures/Trieur test` answers `/Users/me/Pictures/Trieur`; a quoted or rest-of-line path would let a test pick a folder with a space.
- photo-sorter: dropping folders on the window to add them as sources (`drop` events of zinc:system), and a grid to sort several pictures at once.
- ZN-862: the imageio thumbnail cache is never pruned; a size cap or an LRU sweep, or a large library grows `cache/thumbnails` without end.
- ZN-862: the portable imageio reader decodes the whole JPEG before downscaling (about 96 MB per 24 MP picture per worker, 2.8 s for 24); libjpeg-turbo's scaled decode would cut both on Linux and the Pi.
- ZN-862: `trash()` returns false for a file on another disk (freedesktop's `$topdir/.Trash-$uid`) and on Windows (`IFileOperation`).
- trieur (typed engine): trieur's TypeScript does not pass the interpreter/AOT checker yet: `import type` cycles (Z0005 on core/src/plugin.ts), index signatures and `Record<string, V>` as objects, object literals given to a method interface, generic arrows, `for await`; filling them lets examples/trieur leave QuickJS.
- trieur: the palette follows zinc.json "scheme" at start; with "auto" a change of the system's appearance while the app runs restyles `dark:` classes but not THEME (no scheme-change hook in zinc:ui).
- ZN-856: an API reader over the parser if the token-based reader (an ASI rule of thumb) misreads real code.
- ZN-852: `n.toString(r)` with r outside 2..36 throws no RangeError as in JavaScript (it returns digits).
- ZN-852: `p.then(onFulfilled, onRejected)` with two arguments is refused (Z0104); JavaScript allows it.
- ZN-855: a generic function with a parameter of type T and T = void (`ok<void>(undefined)`, `Promise.resolve<void>(x)`) is still refused with Z0103 'null' to 'void'; instantiating functions with `__Void` as classes are would need void-returning callbacks to fit `__Void`-returning ones.
- ZN-855: `then(f)` where f returns a Promise is not flattened although lib/zinc.d.ts says so: implement it or fix the typings.
- ZN-855: `mqtt` (T0) failed once with "cannot connect" while three trees built: a retry, or tests/ci/off.txt.
- ZN-853: nested `<Text>` inside `<Text>` is refused (Z0005); React Native styles a part of a text that way, Zinc only through ui.setTextRuns.
- ZN-853: zinc:audio's Music position counts the frames the mixer pulled (up to a block ahead); read the sound's own cursor for an exact one if a karaoke or a lyrics view needs it.
- ZN-853: zinc:audio's Music on the web environment (an audio element) and in the Zinc stand-in beyond a fixed 180 s; zinc:video plays no sound yet (its follow-up in docs/plugins/video.md).
- ZN-853: libgpod reads an iPod Classic's TV-out photo size (I420, interlaced by iTunes) as stripes and asserts on its size; zinc:ipod reads the RGB sizes instead. A fix upstream would deinterlace it.
- ZN-853: VirtualList rows resolve a percentage width (`w-[22%]`) against another base than the row (about 51 px off in the iPod demo's table); the demo uses fixed widths until it is fixed.
- ZN-853: libgpod prints GLib warnings (an unknown smart-playlist action) on stderr; route them to the plugin's log, and keep unknown smart rules intact (checked on a real iPod written by iOpenPod/Finder).
- ZN-853: in headless deterministic runs a `ZINC_SYSTEM_SCRIPT` event tick is one pass of the event loop (about 3 to 3.5 per frame), so a drop at a given frame is found by trial (ipod_demo drops at tick 1330 for frame 372); a `frame` unit for the script would make these tests readable.
- ZN-853: zinc:ipod backups record the wall time, so a backup taken in a deterministic test makes its frame non-reproducible; a way to pin the plugin's clock in tests would allow a golden of the Backups list with rows.
- ZN-851: the loader's memo of a failed plugin build lives for the process; a long-lived compiler (zinc dev, the LSP) that must retry a fixed plugin clears it per compile.
- ZN-850: records decoded straight into the class (no Dyn tree) and a typed encoder instead of the generic one; and the plugins' hand-made worker threads moved to runtime/zrt_jobs.h (gphoto2, video, sqlite...).

- ZN-846: make WAMR select the requested macOS architecture slice instead of the ARM build host when CMAKE_OSX_ARCHITECTURES=x86_64; disabled in the Catalina preview after its ARM assembly failed in the Intel build.
- ZN-844: a `kZbcVersion` bump still breaks every packed app: the `.zapp` could carry its sources (as JavaScript projects do) so a newer engine recompiles instead of refusing.
- ZN-844: `needs` could also name the `resources.bin` / `.zpk` format versions and the native plugin ABI, which a change would break with its own load error today.
- ZN-844: `hub-server` reads every stored `.zapp` when it rebuilds the catalog; store the needs at publish time if catalogs get large.
- ZN-844: stream the hub's engine download to a file instead of holding it in memory (39 MB against the 64 MB fetch limit).
- ZN-844: the hub keeps only the current engine bundle; keeping the previous one would allow a rollback from the admin page.
- ZN-844: offer an engine with a new zbc together with repacked apps (today it stays with deploy.sh).
- ZN-844: mechanical pencil, paintbrush and shader ink tools (one segWidth/segColor rule each, after rmc's writing_tools.py), as xochitl has.
- ZN-844: lasso selection of strokes (move, resize, copy) in InkPalette, as xochitl has.
- ZN-844: highlighter over highlighter should multiply (a raster blend mode); alpha blending also darkens the PDF text under it.
- ZN-844: pen tilt in the gfx pen queue (rmpp Marker) so marker, pencil and calligraphy follow it.
- ZN-844: InkML or Xournal++ .xopp export of zinc:ink when a user asks (lossless pressure for desktop apps).
- ZN-844: check the highlighter of <name>.annotated.pdf (/CA, no /AP) in Preview, Acrobat and Firefox; add appearance streams if one hides it.
- ZN-844: InkPalette in examples/remarkable/notes (replaces its DrawingBar; regenerate the rmpp_sim goldens).
- ZN-844: try the Running page and zinc-watch on the Paper Pro: minimize an app (it stays OK), hang one (kill -STOP), check the banner, AppLoad's X stopping it and the journal lines; tune zinc-watch.c's thresholds after a week of use.
- ZN-844: a hang before the first frame is not detected (no heartbeat yet); a start-up deadline in zinc-watch.
- ZN-792: give the bytecode's native imports the plugin they come from, so the console's runtime error names the plugin (canvas2d), not only the module (Canvas2D).
- 3DS AOT: an AOT build keeps a 16 MB zrt heap Tokyo leaves almost empty (1 KB used, largest free block down to 1.3 MB on a long flight); measure the other compiled demos and size it to what they use.

- ZN-829: measure asynchronous staging and paged provenance for large scene reimports; the demonstrated world slice eagerly validates its small chunk set.
- ZN-828: extend native embedding adapters with IME, clipboard, accessibility and gamepad support before treating the demo bridge as a production UI SDK.
- ZN-830: measure representative animated-character CPU skinning and memory before choosing a GPU palette path; current proofs establish structural limits and correctness.

- ZN-162: a self-referential closure cycle leaks (tests/t1/rc.sh:7, closure_names.ts): needs escape analysis or a cycle collector; nothing else tracks it.
- ZN-571: D103 kept canvas_ity for Canvas 2D on the condition that no JIT engine runs; JSC and V8 now run on macOS: check the condition again.

- ZN-775: support component/fragment roots directly in VirtualList; virtual positioning needs a host box (Kanban uses a View row), whereas layout flattens JSX fragments and drops their position.
- ZN-772: a WebGL canvas of the web environment is shown opaque over black (`present` in `lib/std/webenv.js`); a browser composites its alpha over the page's background (white by default), so Spline scenes with a transparent background (3d-modal, octopus, domino of `examples/js-spline/showcase.txt`) are black here and white in Chrome. Present with alpha over the body's background colour, then update the web goldens that change.
- ZN-772: QuickJS has WebAssembly now (the `wasm` pack, WAMR): give js-spline Spline's own modules (physics, bevel, boolean, process, Draco from `@splinetool/runtime`, by `tools/test-lib`) under its `wasmPath` and drop the refusal of `main.js`; 33 of the 58 public scenes tried need them (`docs/reports/spline-scenes.md`). Today a bevel scene stops on the module's `export` ("unsupported keyword: export") or on the refusal.
- ZN-764: the macOS window could show the raster with no drawable at all: two IOSurfaces as the layer's contents, drawn in turn (one window buffer less, ~14 MB at 1180x760 density 2, against the frame plus 2 drawables plus the one WindowServer holds today).

- Live resize (owner, 2026-10-16): the frame drawn from the watcher resets the HAL's per-frame input (keys, clicks) that the outer poll had read before AppKit's loop began: a key pressed in the same 8 ms as the mouse-down on the edge is lost. Keep the outer poll's events for the nested frame.

- ZN-731: a picture with rounded corners of its own or an alpha on a hardware layer too (the two renders already give each pixel's alpha), so a film that fades in stays off the CPU; a part of a picture (drawImageRect) on a layer, through the plane's source rectangle.
- ZN-731: zero-copy on macOS: VideoToolbox's CVPixelBuffer (an IOSurface) to the window behind `HalDisplay.layers`; today the frame is copied back and converted by swscale.
- ZN-731: the frame on a KMS plane with page flips for every fbdev program, not only while a film plays: a true vertical blank and no tearing (it costs holding the DRM master and a second buffer).
- ZN-731: a capture (ZINC_SHOT, tools/device shot) shows a hole where a hardware picture is: compose the picture for it.
- ZN-731: a film in a turned card still costs 38 ms of CPU a picture on a Pi 3: an EGLImage in display-gl, or a card kept upright while its film plays; display-gl's KMS backend takes `HalDisplay.layers` as well.

- ZN-730: a film decoded at the size it is drawn (museum-table makes its decoder at the poster's 854x480 and the raster scales it to 500x281): the IMAGE would be a row copy instead of 13.5 ms of CPU a picture on a Pi 3.
- ZN-730: the direct scaled image paths (`draw_dyn`, `draw_image`) are float bilinear loops, 135 cycles a pixel on a Cortex-A53; an integer version would bring a film frame's raster clearly under 8 ms, and changes every golden with a scaled image.
- ZN-730: a gradient paint record (RECT grad 5) under a scaling matrix still goes through the XFORM; a film in a card with an angle still costs 51 ms of CPU a picture on a Pi 3 (the XFORM path).

- ZN-726: once a zoom rests, set the glyphs at the exact size and on whole pixels when the matrix does not turn: the last 17 to 23% of edge contrast against text set directly.
- ZN-726: free the fonts made for scaled text that were not drawn for a while (an LRU over `ZRT_SCALED_FONTS`); today they are never freed.
- ZN-726: zinc:ui inputs and the selection highlight in a scaled view still take the nearest font (`paintEdit`, `fontAtScale`).
- ZN-726: museum-table's other views (dock, titles, storyboard, viewer and panorama panels) still multiply by k and take ladder fonts; a matrix there would let `type.ts` drop its ladder of 26 sizes.

- ZN-722: budget the full-resolution DevTools capture/encoding/transport buffers before continuous profiling; captures perturb process RSS strongly (separate memory-path investigation).

- ZN-721: connect view lifetimes to existing native/asset resource handles and complete CPU/GPU destruction; research and validation plan in docs/reports/zinc-next-resource-lifecycle.md, addressing the museum's persistent model/video caches.

- ZN-720: let the renderer consume packed image resources instead of embedding the same decoded images again; museum-table carries 75.60 MB of RGBA pixels in its executable as well as its adjacent pack.

- ZN-430: a .zapp's members are still unpacked once into the cache (its size again on disk); reading assets in place from the archive needs zinc:assets and the readers by path (video, sqlite, zinc:fs) on an archive source, the ZPK design of docs/reports/games/toolchain-assets-loading.md 6.1.
- ZN-583.01: zinc:physics2d steps on one thread; Box2D's task callbacks would spread a step over workers (drop.out must stay identical with 1 and 4 workers).
- ZN-583.01: zinc:physics2d has no shape casts, overlap queries, distance/weld/wheel joints or queries of contacts in progress yet; add them when a program needs them.
- ZN-433: the first read of a ZPK entry hashes at 169 MB/s (third_party/sha256); use mbedTLS's or a SHA-extension SHA-256 when large packs are verified at launch.
- ZN-433: link zinc with -dead_strip / --gc-sections: lz4.c drops from 70 KB to 2.7 KB and the zstd decoder from 137 KB to 117 KB (D40).
- ZN-354: plugin.yml rebuilds zinc in every leg and in the release job (5 to 10 min each): use a release package when zinc-ref is a tag, or cache the build by commit.
- ZN-354: the path filters of zinc-next.yml miss templates/** and .github/workflows/plugin.yml, so a change there runs no CI test.
- ZN-354: `zinc test` in a project also runs the tests its plugins/ carry (a plugin added from the starter brings tests/): skip plugins/ as build/ is skipped?
- ZN-274: transition keys in style objects (Reanimated 4's CSS transitions) and arbitrary values such as duration-[2s].
- ZN-327: `zinc export --target linux` builds aarch64-linux; add an x86_64-linux target (zinc publish labels the aarch64 build Linux (ARM64), channel linux-arm64).
- ZN-327: release builds have none of the prototype's hardening (stack protector, FORTIFY, RELRO); decide, measured with tools/bench-m4.
- ZN-434: importer versions instead of the engine's executable stamp in the asset keys once the importers settle, so CI shares ~/.zinc/cache/assets across engine builds and `zinc assets verify` can compare.
- ZN-581: zinc:canvas could map globalCompositeOperation lighter, multiply and screen onto the new blend modes.
- ZN-435: zinc.json assets.dir is honoured only by zinc assets build/info; the baker (bakeResources), zinc export's copy of assets/ and zinc:assets still use assets/ beside the entry.
- ZN-435: wire the effective asset profile's pack codec into release packs (lz4 on rpi1/esp32/ps1/ps2, none on wasm) with ZN-436/ZN-439.
- ZN-436: make asset handles engine resources (native ABI R<k>) so a dropped handle releases itself.
- ZN-436: zinc export should ship the packs beside the program; its zinc build child rebuilds dev packs over the release ones export just built, and a cross child names them by the zig target (build/assets/aarch64-linux).
- ZN-436: zn_asset_font (gfx loadFont) and webview zinc:// URLs still read only the assets directory; read them through the packs.
- ZN-436: the browser host, the device core and the ESP32 (esp_partition_mmap) serve no zinc:assets v2 rows yet.
- ZN-261: gradients in state variants (hover:from-*, hover:bg-linear-*) are refused; per-corner radii (rounded-tl-*) are not followed under a gradient (it takes the box radius).
- ZN-261: canvas2d createConicGradient through paint kind 4 (the raster and the GL shader have it).
- ZN-262: the GL replay keeps rounded CLIPs above CORNER = 32 device px square, so object-cover rounded-full images (and overflow-hidden rounded-full avatars) wider than 32 px at scale 2 lose their round corners on the GL renderer; an SDF clip in the shader would lift it.
- ZN-438: `zinc export` (native targets) should copy `build/assets/<target>` into dist; exported games use the loose-image fallback today.
- ZN-438: atlas page format, `maxSize` and POT should come from the target's asset profile (rgb565/rgba4444 with ZN-439's encoders).
- ZN-438: zinc:assets v2 image handles should free pack images with their group; they live for the program's lifetime today.
- ZN-446: `zinc run` of a natively built program shows no splash during its first native build (seconds); only the executable shows it as it starts.
- ZN-160: an object literal with accessors prints as its generated class (`__object0 { n: 2 }`, Node `{ n: 2, v: [Getter] }`); for...in, JSON.stringify and `{...o}` leave its accessors out.
- ZN-160: getters and methods of object literals cannot read variables of the function around them (Z0005); needs methods that carry a closure.
- ZN-160: still refused: `console.log(...a)`, push with several arguments, a tuple spread of an expression that is not a variable or property, a rest element of a tuple value.
- ZN-443: not supported yet: Tiled infinite, isometric and hexagonal maps, image layers, image-collection tilesets, tile animations, per-tile properties; LDtk `.ldtkl` level files, level backgrounds, per-tile alpha, layer parallax.
- ZN-443: no hot reload of a map's table under `zinc dev` (the atlas pages reload); reuse Level objects by name on onReload.
- ZN-443: QuickJS's `Date.now` stayed frozen in a headless run; check whether the virtual clock should advance with the frames.
- ZN-439: free a texture's CPU texels after its GPU upload on GL-only targets (the Pi); both copies are kept today.
- ZN-439: basisu fetched prebuilt through the signed index (ZN-337); its first use downloads 190 MB of sources and builds for about 6 minutes.
- ZN-441: dev builds turn a model's 219 KB JPEG into a 22 MB rgba8 entry, so the first `loadModel` takes 244 ms against 102 ms decoding the JPEG; cause not measured (D89's SHA-256 check is a suspect): keep dev model textures as their source image or measure the entry read.
- ZN-441: int16 positions with a scale and packed normals in .zmesh for the Pi 1, PSP and 3DS, once the software renderer reads them.
- ZN-441: .zmesh flattens the scene; moving a named part (the truck's wheels) needs a node table.
- ZN-724: from docs/reports/microts-vs-zinc.md, worth a task at the next review: programs generated at random and run on the interpreter, AOT and QuickJS with an input tape (today a fixed corpus in `tools/diff-matrix` and crash-only libFuzzer); the `requires` of a program inferred from what it uses and checked against `targets/capabilities.json`; a bounded `Cap<T, N>` string and array type for boards.
- ZN-728: port Atelier's `app/edit.ts` and `app/cursors.ts` back to examples/zed-editor (Tab on a selection, several cursors, comments, pairs): the example still replaces a selection by two spaces on Tab.
- ZN-728: zinc:ui `anchorOf(h)`, `caretBox(h, offset)` and a typed-text hook for `<TextArea>`, so an editor neither guesses the selection anchor nor places carets with font metrics.
- ZN-728: Atelier: stop a running sketch when Atelier quits (a windowed child may outlive it); Stop was shown on an interpreted child only, check a native one.
- ZN-728: Atelier: Alt or Cmd+Backspace with several cursors deletes one character, up and down keep no column memory, no box selection; ANSI colours in the console, soft wrap, a font size setting.
- ZN-728: Atelier: Add Library from the signed index (`zinc add` fails with no trusted root today, the import line is written instead); the Profile and Frames views of the old shell (ZN-143) are out of the window.
- ZN-732: zinc:ui `select()` and `setValue()` should reset a field's `goalX` (the column of up and down), and `caretBox(h, offset)` / `offsetAt(h, x, y)` for a text field: Atelier moves up and down itself and places its popup, cards and hover with font metrics meanwhile.

- ZN-729.05: `zinc device deploy --inspect`, a pack with `import 'zinc:devtools'` in front as `zinc dev` does, so any app can be inspected (today only an app that imports it has an inspector).
- ZN-729.05: `zinc device debug <app>`, the app restarted under `zinc debug --cdp` with its port forwarded (today: `zinc device forward` by hand).
- ZN-729.04: the engine update of `zinc device update` stops at "downloaded and verified": put the package in place and restart the agent, with a way back.
- ZN-729.03: `zinc dev --device` beside a deployed app of the same project: both run; stop the app for the session on a one-screen device.
- ZN-729.06: a sketch started from Atelier keeps running on the device when Atelier quits: offer to stop it.
- ZN-728: owner's idea (2026-10-12): in Atelier, a first-start assistant, a doctor step by step, and a Preferences panel in the macOS app menu (Cmd+,) that set up what building and playing with Zinc need: download the latest prebuilt engine (ZN-718, `zinc update`), plugins on demand (the signed index), the pinned tools (`zinc doctor` and `zinc toolchain` already list and fetch zig, esptool, QEMU, basisu, gltfpack with their SHA-256) and what cross-compiling needs, each with its state, size and progress. Build Atelier's app with `tools/package` (ZN-053: zinc, modules, lib/std, templates in the bundle) rather than app/atelier/package-macos.sh, which points at a checkout.
- ZN-734: zinc:platform's SCREEN_W and SCREEN_H are the size known at compile time (320x240 for a sketch): on a device that gives its own size they differ from width() and height(); two examples read them. A large screen (1080p on a Pi 3) is now drawn whole by the software rasterizer for a sketch without a size: measure, and consider a cap or a scale for slow boards.
- ZN-729: the agent hands its own environment to the apps it starts: under `tests/run` that is `ZINC_DETERMINISTIC=1`, and a timer then fires without pause (found by ZN-729.06, whose test unsets it; `agent_apps` and `agent_inspect` pass `ZINC_REALTIME` by hand). Decide what an app inherits.
- ZN-729.08: `info` gives the kernel's architecture, so a 32-bit system on a 64-bit kernel (Pi OS 32-bit on a Pi 4) says `aarch64` and gets an export it cannot run; report the agent's build architecture.
- ZN-729.08: move the fbdev default for a Pi into `zinc export --target rpi*`, so export and deploy agree (today deploy alone sets `ZINC_DISPLAY=fbdev` for a project that names no display).
- ZN-729.08: deploy sends the whole export each run (hero-rpi is 58 MB, not stripped); send only changed files, and strip.
- ZN-729.07: the Linux arm64 package is 42.7 MB against the 40 MB budget of `tools/package`: trim it or raise the budget before a Linux release.
- ZN-729.07: Wayland cannot be built from `third_party/SDL3` (no `wayland-protocols`): a Linux desktop without X11 gets no window.
- ZN-735: RGB565 buffers for the flip while no video picture is shown: the 32 bpp buffers cost 3.5 to 5% of hero's navigation on a Pi 3B+.
- ZN-735: `tools/device shot` reads black while a flipping program runs (`/dev/fb0` is under its plane); read the plane's buffer, or ask the program.
- ZN-729: `zinc deploy --device <paired name>` through the agent, next to the ssh form; `tools/device` (push, run, shot, profile, stacks) moved onto `zinc device` so a board needs no ssh key.
- music (2026-10-15): mbedTLS 4.0's TLS 1.3 client is dropped by api.spotify.com and upload.wikimedia.org after the request (no answer, no alert; OpenSSL's TLS 1.3 works): http.cpp retries once over TLS 1.2. Find the root cause (a local server reproducing it, then a regression test in t0/tls) and remove the retry. hp-touchpad-webos.md section 14.

- display-gl webOS (2026-10-15): the Matériel page full frame is 38 ms on the TouchPad (115 draw calls, 1716 quads, 14 ms of CPU to submit, the rest GPU; ZINC_GL_TIME and ZINC_GL_STATS through /tmp/zinc/env): 24 frames a second at best whatever the CPU clock. Occlusion, fringes and split change nothing; the gain is fewer draw calls (one program for the box kinds) and redrawing only the cards that change.
  async-storage plugin prefixes its keys so its clear() stays its own); a store per program (by the project's name or bundle id) is the fix.
- ZN-742: Fast Refresh on QuickJS, through a module transform with Vite-style bindings, so JS programs keep their state too.
- ZN-742: Fast Refresh over `zinc dev --device`, sending the ZBC instead of `reload`, so devices keep their state as the Mac does.
- JSX (aabbf0fb): a prop that calls a function but reads no signal (`size={buttonIconSize(size)}`) keeps its `_comp` effect alive, one Computation per instance; re-parent the owned effects when nothing was tracked, for ESP32 heaps.
- JSX (aabbf0fb): a prop that reads a signal remounts the component and loses its local state, where Solid updates in place; real getter props need typed records to accept getter objects (Z0103 today).
- ZN-620: zn_app runs AOT programs only; a bundled .zapp (interpreter + ZBC, the player of mobile-core §6) needs zn_vm in zn_app and the zapp reader moved out of zn_tc.
- ZN-618: a press and release between two frames (`adb shell input tap`, a quick finger) is not seen by a program that reads `pointerDown()` once per frame; it should still count as a tap.
- ZN-622: hero needs zinc:video without FFmpeg system libraries before it can be exported to Android (ZN-628).
- ZN-622: Android shows the status and navigation bars; immersive full screen for games belongs with ZN-625.
- D123: zinc:video should hold the screen wake lock while it plays, as a browser does: Android apps no longer keep the screen on by default.
- ZN-743: the KMS dumb buffer and fbdev could take HalFrame.render_box and draw the damage straight into the scanout buffer, as the Android window buffer does now.
- ZN-746: the software raster at 30 fps on the lava face of a Nexus 7 (11 to 22 fps): the CPU path at a lower resolution, or the smooth stretch on NEON.
- ZN-746: a SHADER under a matrix (setTransform) or inside a rounded clip on the Android GPU layer (the hole is square there); several shader programs per frame at different scales.
- ZN-746: an Android window cannot switch to GL after its first frame: a program that makes its first shader later keeps the CPU path.
- zinc:camera: QR and barcode decoding on the frames (a vendored decoder such as quirc or ZXing-C++ over snapshot()), the common reason a maker app opens a webcam. Face tracking stays out of scope.
- zinc:webrtc: echo cancellation and noise suppression for calls without a headset (WebRTC's AEC3 is part of libwebrtc; speexdsp's AEC is BSD and small): today the call demo keeps the speaker off in its echo mode.
- zinc:webrtc: TURN for a classroom or a workshop: a guide page for coturn (static auth secret, time-limited TURN REST credentials in iceServers), and a test against a local coturn in a container, no Internet.
- zinc:webrtc: events come by polling the native queue every 5 ms; cb_post of native.h from libdatachannel's threads would wake the loop instead, once generated thunks take callbacks, and spare the CPU on QuickJS where a program that does not draw runs its timers on a virtual clock (the poll spins there, and a setTimeout used as a time limit fires early).
- package: the CLI archive ships no mbedTLS headers, so zinc:webrtc cannot be rebuilt on a user's machine when its prebuilt key does not match (other options); ship third_party/mbedtls/{include,tf-psa-crypto/include,tf-psa-crypto/drivers/builtin/include} (about 400 KB compressed) or say why it cannot be built.
- Native fidelity: the kit ContextMenu uses menu.popup when menu.native, as MenuBar does (lib/std/kit/menubar.tsx:136) (docs/reports/native-fidelity-and-plugins.md §5).
- zinc bundle: `zinc pack` / `export` of a QuickJS project could ship the minified bundle (or its .qbc, same engine build) instead of the sources, and `zinc dev` on QuickJS could swap modules instead of restarting.
- ZN-623: a launch screen from zinc.json's splash (UILaunchScreen colour and image).
- ZN-624: iOS safe areas: content and the perf panel scroll under the status bar and the Dynamic Island (ZN-625).
- ZN-624: HTTPS root certificates on an iOS device (SecTrust, or a cacert.pem in the bundle).
- ZN-746: the GPU-layer path renders the damage twice even where there is no shader: render the rest once and upload only the changed rectangles (music carousel swipe frames 160-250 ms on the Nexus 7).
- ZN-628: zinc:video on phones (Android AMediaExtractor + AMediaCodec, NV12 converted as the webOS backend does; iOS AVAssetReader in 32BGRA; both behind player.h, about one session each): then examples/hero exports to Android and iOS (plan in the task notes).
- ZN-748: the OS's own UI font at run time (CoreText on iOS and macOS, /system/fonts through fonts.xml on Android), after variable-font support in runtime/ttf.cpp.
- ZN-751: zinc:video audio on phones (AAudio / AVAudioEngine) with the video clock slaved to it.
- ZN-751: zinc:video seek(seconds) on every backend (av_seek_frame, AMediaExtractor_seekTo, AVAssetReader timeRange, GStreamer seek); today jump(i) restarts an entry.
- ZN-751: pause zinc:video players on the Android lifecycle pause (hero kept decoding behind another app).
- ZN-751: hero on a phone is laid out wider than the screen (the Video card is cut at the right on the Pixel 10 emulator and the iPhone 17 simulator).
- ZN-627: build the Metal back end of the command lists (D119) from the plan in the ZN-627 notes, when a device misses frames or SHADER is needed on iOS; it would also replace the deprecated OpenGL replay on macOS.
- ZN-630: a macOS NSAccessibility bridge over the same device('a11y') lines (or AccessKit for macOS, Windows, Linux).
- ZN-625: document.visibilityState and visibilitychange on phones should follow background/foreground (web.ts polls device('visibility') every 500 ms and never sees a background).
- ZN-631: an on-device red box for compile errors (today the program keeps running and the error goes to the terminal and the device log).
- ZN-631: React-model effects have no cleanup, so Fast Refresh does not re-run them; add cleanups, then re-run effects as React Fast Refresh does.
- ZN-477: re-aim the Vita's zinc:3d from GLES 2 to our own GXM back end (docs/reports/games/console-2d-3d-frameworks.md: vitaGL is LGPL-3 and needs the user to extract libshacccg; PVR_PSP2 has no licence).
- ZN-754: zinc's model importer caches a bundle by its bytes but keeps the first file's entry name: two identical GLBs under different names give "two entries are named ..." in the pack (examples/marble/assets/blender/build.py works around it).
- ZN-457: zinc run --target psp|vita|ps2|n3ds --emu, wrapping tools/console-run with a prebuilt core per console published like the ESP32 image.
- ZN-754: the "grid" font of text() draws narrower than textWidth reports from about 96 physical px, so centred titles drift left (both games cap title text at scale 5).
- ZN-754: the asset build packs every file under assets/ (marble's Blender previews and scripts) and has no per-target pick of low/high model variants: consoles need an exclude rule and a variant choice to stay within ~8 MiB.
- ZN-746: the music carousel at 20-30 fps on the Nexus 7 is a full-screen raster every frame (32 ms p50 on four A9 cores: rounded rectangles blended over the screen, glyph sweep); a slide kept as a layer and moved by the compositor or GL would reach 60.
- music (2026-10-17): the release APK is 15.4 MB, almost all libmain.so (4.9 MB of code, 9.5 MB of embedded data in .rodata: fonts, icons, resources, Unicode tables), stored uncompressed for mmap (3.9 MB gzipped): subset the fonts to the glyphs a program uses and keep only the icons it names, to halve phone APKs.
- music (2026-10-17): at rest on the clock slide the app uses ~8% CPU on the Nexus 7 (and SurfaceFlinger ~11%), PSS ~62 MB: draw one frame a second when only the clock changes (a program-declared frame rate or damage-driven idle).
- ZN-756: zinc:link across networks through zinc:webrtc, following the plan in docs/plugins/link.md ("Across networks").
- ZN-756: zinc:link's outgoing buffer grows without bound when a peer stops reading: a high-water mark and Channel.bufferedAmount.
- ZN-753: the console core should carry the 8x8 font itself, so a program compiled without `zinc pack` (no resources) still shows its text screen.
- ZN-759: serve asset groups (`<group>.zpk`, `loadGroup`) and `assets.stat` on the console cores.
- ZN-759: `Math.*` take `number`, so under the psp/ps2 profiles any f64 above 2^24 rounds; a per-kind Math overload would fix every caller.
- ZN-759: `zinc pack` bakes only font sizes written literally in `font()` calls; a computed size gets 16.
- ZN-471: rounded rectangles, borders, shadows and gradients on the Vita's GXM replay (a corner coverage texture, nine quads per rounded rectangle, a ring for borders; gradients as vertex colours), so UI kits stop falling back to the software raster on the Vita.
- 9b4290a3: e-ink displays (display-rmpp, other e-paper panels) should turn the pressed dim fade off by default (or report reduce motion), so every e-ink app avoids ghosting and a dozen partial refreshes per tap, not only the dashboard.

- zinc:loro: generic instance methods in the engine (Z0005 today), so `setContainer<T>` returns `T` as in loro-crdt and Carnet's collab code needs no casts.
- zinc:loro: in a file with Dyn, `f() === undefined` compares against the Dyn undefined (pureCallee in check.cpp); assigning to a variable first works around it.
- zinc:loro integration (2026-10-21): the AOT prelude's precompiled header (`~/.zinc/cache/aot-obj/prelude-<hash>.pch`) is keyed without the engine headers it includes (src/frontend/ast.h): an edited header makes every `zinc build` fail with "has been modified since the precompiled header" until the .pch is deleted; key it on those files' sizes and times, or rebuild it on that error.

- third_party: keep the vendored copies (no submodules: patches, offline first build, worktrees), but tool them: a machine-readable third_party/vendor.json (url, version, sha256, kept files, patches) and tools/vendor check|update <lib> <version> (check on CI: each directory equals its source plus its patches). Owner, 2026-10-21.
- mquickjs on the ESP32 (owner, 2026-10-21, firmware/esp32-mquickjs): run the bytecode from the memory-mapped flash instead of a RAM copy (relocate it once on the board to the mapped address and write it back): 11.8 KB of RAM for the breakout demo, the size of any program.
- mquickjs on the ESP32: an upload over the UART into the js partition (as the Zinc core's `ZN load`), so `zinc run --engine mquickjs` needs no esptool write and no reset into the bootloader (the error mapping to the .ts is done, src/cli_mqjs.cpp).
- mquickjs on the ESP32: more of zinc:gfx on the board (line, polygon, circle, drawText with a baked font, images from the flash) before the prototype's widgets demo (examples/boards/esp32-2432s022) can be rewritten on zinc:gfx.
- mquickjs on the ESP32: the native bridge (main/zn_native.c) carries no callbacks, promises or resources: cb_post into the event queue (ZN_EV_NATIVE) and resource handles, so a sensor plugin can report by itself.
- mquickjs on the ESP32: ~/.zinc/esp32/firmware keeps one build directory per configuration (100 to 400 MB each) and never removes one; evict the least recently used past a size, and say how much `zinc doctor` sees there.
- mquickjs on the ESP32: two zinc processes building the same native firmware at once write the same ~/.zinc/esp32/firmware/<key>; a lock as plugin_build's.
- ESP32 light (owner 2026-10-22): the rest of item 4. Replace the dense dispatch tables (about 550 KB on the widgets demo, 32-bit) with a row-displacement table, and benchmark `CallVirt` with `zbench --suite boundary`.
- ESP32 light: `zinc run --qemu` copies its flash to the shared `~/.zinc/cache/esp32-flash.bin`, so two sessions running QEMU overwrite each other's image; use a per-run file.
- ESP32 light: `site/public/play/*/app.zbc` and `vm.wasm` are still ZBC 7 (consistent with each other); rebuild both together at the next site publish.
- zinc:device (plugins/device) has no native ABI code, so a program on it does not run under `--engine mquickjs`; port it as zinc:qrcode was.
- Module resolution: a tsconfig `paths` entry wins over a plugin for the same specifier, which on the web profile would hide the plugin's "web" entry (the examples map `three` to `plugins/three/index.ts`); drop those entries or let plugins win.
- ZN-774: dead links left in `docs/studio.md` (apps/studio), `docs/engines.md` (runtime/include/zinc_abi.h, compiler/src/abi.ts, zinc_vm.h), `docs/pinball-make-a-table.md` (examples/pinball3d/tools/), and the docker and "sim oracle" mentions of `docs/boards.md` (82, 238, 319) not checked.
- ZN-774: templates `solid-app`, `react-app`, `kit-app`, `rn-app` and `js` would remove the "none yet" rows of `docs/start/choose.md`.
- ZN-774.12: `stroke()` draws a larger start cap on some lines (640x400, `stroke([380,100,460,160,540,120], 12, 0x5746e0, 255, false)` against the same line at y 250); a drawing app shows it at once.
- ZN-774.16: separate compilation of lib/std (a linkable ZBC per module, or the checked and lowered std kept between compiles), so the first run of a zinc:ui program and each Fast Refresh stop paying about 330 ms for lib/std (a 7-line zinc:ui program compiles in 337 ms); needs generics instantiated per module, inlining after the link and one string and class table built at the link.
- ZN-774.11: on a shallow clone the "English changed" notice is skipped silently (the `source` commit is missing): the Pages workflow needs `fetch-depth: 0`.
- ZN-774.18: a text size a program never names in its source falls back to the nearest baked face (a field drawn at 16 px in a 14 px line, selection boxes off the letters): bake on demand or warn.
- ZN-774.18: `zIndex: -1` (and `-z-1`) goes behind its parent's fill on the web DOM (CSS stacking) but stays above it natively; dom.js should make such a parent a stacking context so the two match.
- ZN-774.18: the class `text-transparent` writes colour -1, which zinc:ui reads as inherited, so the text stays visible while `color: 'transparent'` hides it; the class should hide it too.
- ZN-774.18: on the web page a transition ignores the delay and the property list (always `all`, classes and style keys alike) and may run on top of zinc:ui's own frame-by-frame transition; decide which one runs on the web so the timing matches the desktop.
- ZN-774.19: a lazy Canvas holding a stage (`style={{ lazy: 1 }}`) is not repainted when the scene changes; `Stage.drawIn` asking zinc:ui for a repaint when the scene is dirty would let an idle scene inside an interface cost nothing on old tablets (today the Canvas paints every frame).
- pi-image: the Linux SDL window should try GLES 2 when OpenGL 3.2 core fails (a Pi offers GL 2.1/GLES 2 on vc4, 3.1 on v3d) and its fallback must not panic (`Parameter 'props' is invalid`, hal_sdl.cpp; `No available video device` for a program the agent starts): today the image sends every app to display-fbdev.
- pi-image: display-fbdev should take the KMS plane back, and redraw whole, when the program that held it leaves: the image's session kills its player to hand the screen to a program of `zinc dev --device` (a plain exit copies the player's last frame into /dev/fb0, over the program's).
- pi-image: display-fbdev text from a physical keyboard and a drawn mouse cursor: the Pi image's player navigates with the keys but types only on its on-screen keyboard, and HDMI with a mouse shows no pointer.
- pi-image: the engine says READY=1 to systemd after its first frame (sd_notify), instead of zinc-session's 2 s guess, so the units that wait for the session start as soon as the screen shows.

- zinc:lvgl without mquickjs, on an AOT ESP32 firmware (owner 2026-10-22: keep both paths): docs/reports/esp32-aot-lvgl.md lists the eight pieces; the AOT ESP32 target itself does not exist yet (docs/reports/zinc-next-esp32-aot.md).
- ESP32 mquickjs: a hang in C (a plugin's native loop) is still silent; the JavaScript one is stopped after 10 s. The task watchdog on the main task, with a panic and released while the update server writes the flash (zn_pause), would turn it into a crash the next start tells.
- ZN-790: the n3ds HAL's `ZINC_PROFILE` work counts the bottom window's wait for the refresh inside endWindow: time that wait apart, the profile of two-screen programs reads too high.
- ZN-476/ZN-478/ZN-477: a console frame whose 2D commands fall back to software (a radial gradient, a rounded clip, a rotation) shows the zinc:3d GPU target black; read the target back only in that case.
- ZN-476: the PSP's VRAM is a bump allocator in render3d.psp.cpp, a target that grows leaks its old space unless it was the last made; and a failed zn_gu_init/zn_c3d_init leaves the 3D blank instead of falling back to software.
- ZN-477: Vita zinc:3d lights per vertex on the CPU (psp2spvc has no branches, division or sampling); per-pixel specular and mipmaps on PSP, 3DS and Vita once a fuller shader path exists.
- ZN-791: an mDNS answer from the Paint Arena host, so other tools find a match without the broadcast.
- ZN-792: mDNS discovery for the console players (they are paired by address today).
- ZN-792: the PSP player's entropy from KIRK through a kernel PRX instead of the jitter pool.
- ZN-792: a `touchpad` profile (1024x768, GLES 2) in src/frontend/profile.cpp; the webOS player says `linux` for now.
- ZN-792: targets/webos/hal_webos.cpp (SDL 1.2 + PDL) so `tools/webos-player` draws, as a PDK app with the consoles' waiting screen.
- ZN-792: the iOS player updates its Bonjour TXT `pair` flag (DNSServiceUpdateRecord) when a pairing opens or closes.
- ZN-792: run zinc_go_device on an Android emulator (arm64 API 37 image) beside the Nexus 7.

- ZN-477: `vita-elf-create` fails with "Cannot allocate N bytes for SCE data at end of segment 0; segment 1 overlaps" when the text segment ends less than ~2.7 KiB before a 4 KiB page (seen on a gl-check core, 2026-10-25): any program size can hit it. Reserve the room in vita.cmake (a second link with padding, or a linker script) instead of luck.

- ZN-820: show SVG app icons in the player's tiles (zinc:svg) and pack app.icon for JavaScript-engine projects; today they fall back to the default glyph.
- ZN-821: `zinc device bench` on a machine like this one installs the suite as a .zapp (interpreter), so its numbers do not compare with `zbench run mac` (AOT); a --target or AOT option for the agent device would make them comparable.
- ZN-823: tools/linux-sysroot fails on an existing sysroot without a stamp (copytree raises "File exists" on symlinks): replace existing links, so a second run or a hand-filled sysroot works.
- ZN-823: plugins/camera's Linux source does not compile with zig for aarch64 (stb_image.h typedef redefinition): fix the double include, else a Pi fails the same way.
- ZN-823: the plugin stamp does not list prebuilt/<target>/key among its inputs: a changed key is not seen until plugin.so changes.
- ZN-823: zinc:loro (cargo) is not cross-built, so a Pi still compiles it with Rust at first use.
- Pi updates (docs/reports/pi-updates-design.md): the Pi release assets come from the linux-cross job, which may fail; it should fail the release for aarch64 and armhf.
- Pi updates: the update catalog uses the unauthenticated GitHub API (60 requests per hour per IP), which a classroom behind one network will hit.
- reMarkable bridge (docs/reports/remarkable-bridge-design.md): re-measure qtfb with AppLoad >= 0.6.0 on the Paper Pro; its partial-update bug (fixed in PR #55) may explain the 125 ms paints.
- ZN-833: build lease with zig for aarch64-musl and run lease status on the tablet (cross-platform pass).
- ZN-833: zinc.json display.lease_max for the dead-man time instead of the fixed 30 minutes.
- ZN-833: ink session tries the in-process lane first and re-execs through lease launch (design §7) instead of pointing the manifest at lease.
- ZN-833: five-finger tap escape in the lease supervisor (design §3.3); only the power long press is handled.
- ZN-833: zinc deploy --target rmpp copies to ~/<name> and runs run.sh; make it run the exported deploy.sh (AppLoad directory).
- ZN-834: the in-xochitl ink lane cannot find the engine on OS 3.27.3.0 (linked into the stripped xochitl, libqsgepaper not mapped; remarkable-bridge-design §11): research per-OS addresses in /usr/bin/xochitl (rm2fb, qt-resource-rebuilder hashtable) before any new tablet test; until then L2 (lease + Quill) is the fast ink.
- ZN-834: on failure the lane repaints the item but requests no full refresh; needs AppLoad's full-refresh function or the vendor full-update flag value.
- ZN-842: run the hub on --engine quickjs (byte-for-byte strings not proven there).
- ZN-842: forget a paired device from the admin page.
- ZN-842: HTTPS for a hub outside the LAN (serveAsync's tls option).
- ZN-842: run the hub on a Pi and on a reMarkable (cross-platform pass).
- ZN-841: notes' RmppRefresh project native module falls back to its sim stand-in on the tablet engine; move the refresh switch into display-rmpp (a zinc:gfx/plugin API) so packed apps keep Colour preview.
- ZN-841: zinc-tile could take the app's own icon from the .zapp (zinc.json app.icon) instead of the shared one.
- ZN-841: on a reMarkable the engine takes the display size from zinc.json targets.linux and runs headless without it; default to the model row's size.
- ZN-843: compiler: `d.field = f(await x)` with a `const d` fails with Z0108 on a hidden temporary (`__vN`); worked around in app/hub/src/services/server.ts.
- ZN-843: the hub protocol has no manifest expires/seq, the protection against a server freezing updates (zinc-app-ota-updates.md §5.3).
- ZN-843: the hub cannot remove an installed app yet (zinc-tile --remove plus deleting the package).
- ZN-843: a text field's placeholder is slate grey, which shows grey on e-ink.
- ZN-844: web relay: dither to the Paper Pro's colour e-ink palette (Floyd–Steinberg on the PNG) and measure whether it reads better than plain grey.
- ZN-844: web reader: forms and JavaScript clicks (only `<a href>` is followed today); send a tap to the relay as a CDP mouse event.
- ZN-844: web reader: draw only the new pen segment instead of redrawing every stroke each frame, to cut pen latency on pages with many strokes.
- ZN-844: the web dashboard stops while the tablet sleeps: render once on wake-up, or keep a wake lock while it is shown, so a wall dashboard stays current.
- ZN-844: the web dashboard's widget halves the full-page picture; a relay `/shot` at zoom 0.5 would give sharper text if it reads soft on the panel.
- ZN-844: desktop packages (macOS, Linux `tools/package`) do not ship libpdfium, so `zinc:pdf` there needs `plugins/pdf/vendor/fetch`; ship `vendor/pdfium/<platform>` in `share/zinc` for PDF reading from an install.
- ZN-844: Zinc PDF: text search (FPDFText) and thumbnails in the library.
- ZN-844: an italic face (Inter Italic) for `*emphasis*` in Zinc Read and in the gfx fonts.
- ZN-844: Zinc Read: download Notion images into the library during sync (Notion's file links expire after an hour), so pictures read offline.
- ZN-844: a web or wasm build of `zinc:markdown`, and move `lib/std/markdown.ts` (the hand-written subset the chat uses) onto md4c.
- ZN-844: the iOS export's SVG icon goes through the fill-only `res::rasterizeSvg`: stroked icons (Lucide) come out as filled blobs; render it with nanosvg as `appIconPng()` of `src/cli_core.cpp` does.
- ZN-834: pluginOptions drops zinc.json display options when ZINC_DISPLAY is set; apply them when the env names the same driver, then rmpp_sim.sh uses display.ink.
- ZN-835 (cross-platform pass): armv7 export for the rM2 (-mcpu=cortex-a7) and the rm2fb client against a real rm2fb server.
- tokyo: zinc:3d on the Vita and 3DS: a render target made after textures filled GPU memory fails silently (nothing drawn): report it or reserve targets first.
- tokyo: zinc:3d's software fog ignores `material.fog` and fogs blended pixels by depth.
- tokyo: a .zapp carries the raw assets beside the imported ones (size).
- ZN-480: the native call path costs about 12 us a call on the PSP (rtcalls nativeCall parses the signature and builds two std::deque per call, stubs.cpp finds the export by strcmp, the thunk copies every array in and out). Caching the signature and the export alone gave nothing measurable in PPSSPP (5.91 vs 6.16 ms, 2026-10-25): the array copies of the thunk are left to try, measured on a real PSP.
- ZN-480: tools/console-run vita keeps only the first line of a multi-line printf chunk from Vita3K's log (examples/lang prints nothing through it; its text is in the log).

- IR: "field access on a non-ref" inside an object-literal method: `const w = world(id); if (w !== null && k >= 0 && k < w.chunks.length) { w.chunks[k].loaded = false; w.chunks[k].b.length = 0; }`; render3d.sim.ts works around it with early returns.
- zinc:3d: the consoles check the x/z uv fit of Top grounds over a whole batch, so two Top grounds with different uv lines in one mid or far chunk fall back (PSP keeps uvs, 3DS draws a wall); fit per cell.
- zinc:3d: render3d.sim.ts has no sectors and no slots.
- zinc:3d: World.select keeps interpreted overhead around it (mat4LookAt) on the consoles.
- zinc pack: when zinc.json `app.icon` is itself `icon.png`, the 150 px launcher tile overwrites the project's own file in the .zapp (docs/zapp.md says the file is also packed at its own path); name the tile apart or keep the original, since a program that loads its icon at runtime gets the tile.


- zinc:system/media on the web target: forward to navigator.mediaSession in plugins/system/web/system.js; accept http(s) artwork URLs.
- Z5006's lists of system features (include/zn/diagnostics.h, i18n/*/diag.json, docs/diagnostics.md) miss share, update and media: build them from systemFeatures().
- threads (D181): an interpreter back-edge interrupt check so Worker.terminate() stops a busy worker at once (measure with bench-gate first); share a module's fusedCode and string constants across its workers' Machines if the Pi's RSS asks for it; SharedArrayBuffer and Atomics only when a user needs them; Map as a sendable type (sent as pairs).
- `new Set('abc')` and `new Map(generator)` are not supported (arrays and same-kind collections are).
- Async functions: a loop whose awaits complete at once (no real suspension) recurses instead of looping; a trampoline in desugar.cpp loop() would keep the stack flat for long sliced work.
- Set and Map are not iterable directly in `for (const x of set)` as the slicing agent of the iPod demo met it (it went through Array.from): check and fix on every engine.
- Workers: plugins with `"worker": true` (a per-thread native registry and per-thread zn_native_poll queues); zero-copy transfer of `u8[]`; an inline mode for profiles without threads; `addEventListener('message')` and a global `onmessage`; a worker's console lines in the inspector's Console.
- Workers: measure the cost of thread_local gAllocs/gFrees with tools/bench-gate on a quiet machine; re-run busy_spinner and busy_worker alone (measured at load 25-58).
- Build speed (D184), the largest win left: stable C++ units after an edit. Adding one element to hero renumbers classes, strings and functions, so all 37 units recompile (13-25 s); keep the previous numbering (hot mode's Module::key) or emit table indexes as link-time constants, for 1-3 units (~3 s) per edit.
- Build speed: profile the frontend's single-threaded phases on ipod (parse 1.1 s, optimise 0.65 s, rc 0.38 s; std::map<std::string> lookups, isSubtype) and QuickJS's warm 'prepare' (0.3 s with every cache hit).
- Inspector (ZN-373): Network initiator file:line (needs per-call-site line tables in the interpreter and AOT); the console line at the Runtime.enable replay boundary shows twice; `zinc debug` does not set ZINC_DEV (no component names); component names on --engine quickjs untested; DOMStorage polls every 500 ms instead of a zinc:storage hook; class completion is a generated list, not the style engine's tables; no image request in the Network fixture.
- Threads debugger (D185): `zinc debug` (command line) and `--dap` do not stop in workers yet (DAP could show each worker as a thread); the Inspector's Sources view does not open worker sessions yet (the protocol is there); a worker paused in the debugger keeps the main program from ending (resume or detach it at shutdown).
- Threads profiler: in `zinc profile --trace`, sampled slices can overlap a worker's onmessage span edges by one sample period, and worker tracks get their name event twice.
- Render thread, once it lands: record zn_frame_trace stages as a "zinc render" track at the hook point in runtime/gfx.cpp trace_json.
- Types-only modules (D188): `import type` of a function, or a const used through `typeof`, from a module no value import loads is refused (needs ambient function and variable declarations in the types view); a types-only class drops an untyped field whose initializer is not a literal.
- Covariant arrays (D188) copy instead of sharing: true aliasing (`Dog[]` as `Animal[]`) needs an array reference cast in the IR and AOT; `T[] | null` covariance is not handled yet.
- Covariant promise (D189): the converted promise settles one microtask later than Node's; share the instance if the IR gets a reference cast.
- iPod worker (D181 step 4): drafts.ts posts 10k tracks as full Track records once per model, so measure the main thread's encode cost (a subset interface may be cheaper); run the Genius bench (GENIUS_BENCH) in the worker and compare the 20-seed ids with the main-thread build.
- Unions of primitives (`string | number`, `boolean | string`) have no IR type: a variable, parameter, return or field of such a type is refused on the interpreter and AOT (Z0005 "this type in the IR") while TypeScript and QuickJS accept it; needs a representation (tagged box, or Dyn) with conversion and narrowing in the lowering (shared core). Then drop the console.log branch-text special case of D190 (it prints -0 as 0).
- Checker: a method call on a union of classes sharing the method (`(Dog | Cat).name()`) is refused as "must be narrowed first"; the IR already types the union as the common base class.
- D190: an `export * from` a module of the same import cycle copies its partial export table, so values it declares later are not re-exported.
- ZN-850 native records: plugin calls with records (`__recEnc`/`__recDec`, src/frontend/dyn.cpp) still go through Dyn and JSON at ~1 µs per record; reuse D191's recLayout + planFor/encodeValue/decodeValue (src/rt/worker.cpp).
- zinc:worker (D191): a message interface that is not a record (no fixed class) gets "has no message form" at run time (would need candidate classes in the layout); i8/i16/u8/u16 fields travel as 32-bit, so a narrower receiver is not truncated; encode is ~40 ns per record, mostly rec::Writer's small vector inserts (a pre-sized buffer would halve it).

- Checker: the conversion of an `any` back to a base class lists the subclasses when it is generated, so one declared in a later module is not matched; same fix as the `__dynSub` route.
- Inspector, zinc:stage: the tree is sent whole on DOM.getDocument with no DOM mutation events (nodes added later show on the next getDocument); the highlight ignores rotation and pivots; a program with a zinc:ui tree and a stage drawn in a `<Canvas>` shows only the zinc:ui tree.

- Open records (D192): an instance assigned to an interface of fields prints, serialises to JSON and views as `any` with the record's fields only; JavaScript shows the class and all its fields (`Tag { label: 'x', n: 2 }`). Route it like `__dynSub` and the inspect formatters.
- An open record's literal class gets no vtable getter entries for non-record interfaces with properties it satisfies (rare).




- Inspector zinc:stage pick mode: a scene that reads the pointer itself (fatty, music-tree) still gets the clicks during the pick; `Stage.update` could skip its routing while picking, a program routing the pointer itself needs a host-level gate.

- Inspector Storage, SQLite grid: no detail pane for a selected cell (full long text or blob), no in-place cell edit (writes go through the query bar), blob hex limited to 16 bytes; `app/inspector/table.tsx`'s Grid could become a kit DataTable in `lib/std/kit` with its own test.


- Inliner: mutually recursive functions are no longer inlined (D193); measure recursive-descent code with bench-gate.




- ZN-864: a scene window (`open()` with no draw callback) runs `drawScene` every frame even when the scene is unchanged (sprite-studio's paused preview redraws ~2,000 shapes a frame).
- sprite-studio: export a PNG sprite sheet or GIF; selection with move/copy/paste; zoom input in the preview once scene windows take input.
- iPod remote: "Read the library again: cannot convert Dyn (undefined) to string" against the running daemon on 8686 (a field the old daemon lacks); make the remote decode tolerate a missing field.
- ZN-587: QuickJS worker schemas cannot name generic interfaces (`Envelope<T>`), interfaces with `extends` or `zinc:` types; such messages are cloned untyped, without receiver-side truncation and defaults.
- ZN-587: `process.exit` inside a QuickJS worker exits the whole process; on the typed engines it ends only the worker.
- ZN-587: `zinc bundle`/`zinc export` for QuickJS does not bundle a worker's entry file.
- ZN-774.32: measure the `zinc dev` save-to-frame refresh on a quiet machine and correct the guide's "96 ms" (command in the task notes).
- ZN-774.33: Atelier thumbnails for the 22 new catalogue entries.
- ZN-774.33: fold duplicate catalogue entries (the same idea in Atelier and in a lesson).
- ZN-774.35: link each cheat sheet line to the catalogue examples that use it, and `zinc help <module>.<name>` for one entry.
- ZN-774.26: lessons 06 to 20 in the exercise format, and a check that runs the program headless a few frames (output or a pixel) to judge what it does, not only its source.
- ZN-711: first_run gives each template 5 s; the 3d template exits 124 on a fresh ZINC_HOME while its first run fills the plugin cache. Warm the cache first or scale the timeout on a cold cache.
- ZN-774.36: the site's Pages workflow could run `tools/site-examples` with the release's zinc, so the 3.8 MB of exports in `site/public/play` stop being committed and cannot go stale.
- ZN-774.36: each gallery export carries its own `zinc.<hash>.js` runtime (38 KB) and ~210 KB of `zinc:ui`; one shared copy would cut `site/public/play` by about two thirds.
- ZN-774.36: the browser interpreter (`zinc export --target wasm`) lacks Canvas2D and Audio (8 of the 35 graded examples), which `--target web` runs.
- ZN-563.03: zinc:3d worlds in the browser (worldOpen/worldSelect/worldDraw in plugins/3d/web/render3d.js answer nothing), for a web program that streams a world.
- ZN-563.03: plugin options (zinc.json "plugins": {"3d": {msaa, filter}}) do not reach a web export's page; render3d.js uses 4x MSAA and mipmaps.
- ZN-563.03: zinc:3d in the semantic DOM render (render: dom) is untested; only the canvas render ran in Chrome.
- ZN-563.03: web_3d's SSIM is measured with headless Chrome's GL; check it on a CI runner before the release tier, or list it in tests/ci/off.txt like three_gpu.
- ZN-864: Elements of a window drawn by a worker Scene (sprite-studio's preview) shows one `<window>` node; list the Scene's shapes once devtools can read them without linking zinc:system's native code.
- ZN-864: picking in a side window is proven only through DOM.getNodeForLocation; add a scripted pick with pointer input sent to that window.
- ZN-864: cdp.host.cpp (the rpi1 transport) lists the main window only; add the per-window targets of cdp.next.ts.
- Frontend: in a module read only for its types, a method with no return type that returns a value (or an async one) still fails with Z0109 once its body is dropped; the shape could keep the type the full check infers.
- ZN-877: `{ b: null }` into `b?: unknown` stores null and reads back as undefined (typeof 'undefined'); the `Dyn | null` slot cannot tell null from undefined, so null should be stored as `__null` and `=== null` on that union taught to see it.
- ZN-867: `setTextRuns` could take a background colour per run, so Discord spoilers draw as a dark box instead of bullets.
- ZN-866: tls::read stalled on a TLS 1.3 record holding several post-handshake messages (Cloudflare's coalesced NewSessionTickets, gateway.discord.gg one connection in two); fixed by reading while mbedTLS holds bytes, proven against the real gateway only. A regression test needs a server that packs both tickets in one record (BoringSSL's behaviour; mbedTLS and OpenSSL send one record each), and the TLS 1.2 fallbacks for api.spotify.com and upload.wikimedia.org (http.cpp, tls.h) are probably the same bug: check them over TLS 1.3 and remove the fallback if they answer.
- ZN-868: images inline in Text runs (custom emoji inside a sentence) are drawn as separate views; a run kind for an image would keep them on the line.
- ZN-868: shaped text (D32) could be the default on desktop; the Discord client opts in with `"text": "shaped"`.
- ZN-868: profile `settleVirtuals`/`syncVirtual` in layout on a long channel; they lead the frame profile.
- ZN-878: the GL replay (runtime/gl_replay.cpp) draws text from the glyph tables only, with no shaping hook: emoji and complex scripts would be '?' there.
- ZN-878: a 6 MB WebSocket message still takes 0.7 s natively (slices and the byte-by-byte join of plugins/socket); a native frame reader would make it a few ms.
- ZN-880: style runs and inline pictures in the rn layout engine (Yoga, LY.text), which ignores setTextRuns: React Native apps on ui.layout "rn" cannot nest inline images.
- ZN-880: each line as high as its own tallest picture, instead of every line taking the paragraph's tallest; matters for long paragraphs with one tall picture.
- ZN-880: inline pictures under numberOfLines, truncate, whitespace-* and text-balance, where runs are off and the U+FFFC shows as a character.
- ZN-880: a line break between two adjacent inline pictures with no space (`:a::b:`), as CSS allows; today they wrap as one word.

- ZN-881: Solid's `_append` should skip a null child as React does, so a component returning null works under Solid too.
- ZN-882: the default layout still fails 139 Yoga conformance cases; negative space and auto margins are the next easy ones.

- ZN-883: border-transparent seemed to draw a light border on a call tile; check the colour is honoured.
- ZN-883: zinc:audio could list and choose output devices for every program, not only discord-voice.

- ZN-885: zrt's TLSF heap never returns pages; madvise(MADV_FREE_REUSABLE) the inside of large free blocks (11 MB touched in a Discord call).
- ZN-885: Discord's 618 Mach ports and 15 threads were not reproduced with the fake session; count ports per kind (lsmp) on a real session.
- ZN-889: a plain `zinc publish` of a .zapp with native plugins is labelled `any`; name the host target when the pack carries `native/`.
- ZN-889: the Pi player shows no permission consent screen before a hub install or update (app/hub has one).
- ZN-889: rollback and uninstall from the Pi player's hub page.

- ZN-869: zinc:subtle RSA keys could also import and export pkcs8 and jwk, for Web Crypto compatibility (spki and raw-private PKCS#1 today).
- ZN-869: making the 2048-bit RSA key blocks the UI thread a moment when the login screen opens; measure it on a Pi and the handhelds.

- ZN-873: answer NACK with RTX and send RTCP sender reports for our camera (lossy Wi-Fi repairs only by key frames today).
- ZN-873: offer a low-quality simulcast layer of our camera when op 15 asks for little.
- ZN-873: docs/ui.md "System signals" should say that minimize and hide on desktop send background/foreground.
- ZN-874: hand a screen capture's IOSurface to the GPU compositor and the VideoToolbox encoder without a CPU read (4K at 30 fps).
- ZN-874: system audio in getDisplayMedia (ScreenCaptureKit capturesAudio), for Go Live with sound.
- ZN-874: the web build of examples/webrtc-call shows "Camera off" in place of a shared screen's preview (browser tracks have no .image).
- deploy delta (`zinc device deploy` sends changed .zapp members): a t1 case in tests/t1/agent_deploy.sh (second send much smaller; a corrupt installed zapp falls back to the whole file).
- deploy delta: stream the agent's rebuild through zapp::unpackTo instead of three in-memory copies (~70 MB for a 23 MiB app on a Pi).
- deploy delta: describe the `delta` install exchange in docs/reports/zinc-next-agent.md; apply it per file to export directories (run.sh) as zinc dev's `there` map does.
- D195: wire `zinc device <dev> update <bundle.raucb>` into src/agent: push the bundle and its .sig, run zinc-system-update install as root (sudoers rule), reconnect after the reboot and report status (updated or rolled back).
- D195: commit the release CA certificate beside update.pub and build and sign a .raucb per release in CI (ZINC_UPDATE_SEED and the RAUC key as secrets).
- D195: a data partition (apps, /home, network) grown on first boot instead of copying state at install time.

- ZN-891: simulate a lossy link (drop or delay RTP in the plugin under an env var) to prove the automatic low data switch and FEC recovery end to end.

- ZN-890: a native module's error (SecureStore.remove, keychain OSStatus -25244) seems to escape .catch and end the app as "runtime error"; reproduce with a native that fails safely and check it throws a catchable Error as include/zn/native.h says.
- ZN-890: Z0005 "conversion of '() => void' to Dyn" on `const next = waiting.pop(); if (next !== undefined) next();` in the Discord guard's download(); not reproduced in a small program yet.

- ZN-891: map zinc:webrtc/quality in plugins/webrtc's web.modules so it resolves on the web target.

- GPU on the Pi 3: `zbench --set ZINC_DISPLAY=gl` gave no result for any scene (2026-10-31), the report says software raster; the GL display path under KMS on a Pi 3 needs a session of its own (EGL on GBM, the vc4 driver).
- Package size: macOS packages are 48-51 MB (budget raised to 55 on 2026-10-31); discord-voice (5.7 MB) and webrtc (7.1 MB) could be fetched on first use instead of shipped.

- ZN-899: under loss, raise the audio bitrate above the DRED/LBRR thresholds (~20 kbit/s) instead of lowering it: the remaining route to <=3% concealed at 10% loss.

- Compiler: a closure call is devirtualized speculatively to the program's only lambda of that type even when that lambda's function is never reached (knownClasses' `add` pulled the class parser into every UI program, 2026-10-31); count only reachable lambdas.

- zinc dev / devtools: a zinc:stage program that imports zinc:devtools gets a 320x240 headless surface despite `ZINC_SIZE=640x400` (`width()` says 640); asset_reload is off the CI until fixed. Repro: `import 'zinc:devtools'; import '../src/main';` in a game-2d project, `ZINC_HEADLESS=1 ZINC_FRAMES=2 ZINC_FRAMEHASH=last zinc run other/y.ts`.
- webenv: Phaser sees the scripted pointerdown and keydown one frame earlier than tests/golden (plain rAF timing unchanged); webenv_phaser is off the CI until explained.
- webrtc: `pc.close()` fires the data channels' close events with setTimeout(0), so a program that quits right after loses them ("A chat closed"); webrtc_chat is off the CI until the close events fire before close() returns.

- ZN-905: the class checker's var(--...) regex accepts only lowercase and hyphens; accept the CSS identifier set.
- ZN-908: a DOM-render code-editor case in tools/web-dom-test (click sets the caret, typing, no outline).
- ZN-908: zed-editor could use zinc:editor-lsp for completion and diagnostics, as Atelier does.
- ZN-893: permessage-deflate and UTF-8 validation of text frames (1007); memory per idle WebSocket (~10 KiB, wslay's buffers); TLS handshakes ~3x slower than Node and Bun (mbedTLS portable P-256: an assembly P-256 PSA driver); bulk u8[] for binary payloads (one host call per byte today); net_acme on QuickJS and AOT.
- Release 0.10: inspector_pause hung once on a hosted runner (v0.10.4 run 41169674268): with --engine quickjs, the first DOM.getDocument after Zinc.setPaused got no WebSocket handshake for 20 s; the paused loop may not serve the inspector at pause entry. Off the CI until found.
- Release 0.10: photo_sorter (clicks land elsewhere on the hosted macOS runner) and headless_close (one empty output) are off the CI; find why and put them back.

- ZN-899: RFC 2198 RED for Opus, sent and decoded, so a browser peer survives burst loss (FEC alone repairs one packet per run).
- ZN-899: a 120 ms Opus packet at 15 kbit/s with LBRR was 100% concealed by our receiver in an experiment; check the decode path in case a peer sends it.
- ZN-899: the first second of a lossy call goes unrepaired until the first receiver report; send reports sooner.
- ZN-871: `getUserMedia({ audio: { echoCancellation, noiseSuppression, autoGainControl } })` constraints, on by default as in browsers, with `played` wired automatically; use the processing in the Discord voice plugin.

- ZN-901: transport-cc with an acked bitrate instead of REMB-only, to cut the 2-4 s freezes at big rate steps; parse the H.264 slice QP in the VideoToolbox encoder for the ladder; libdatachannel's receiver report shows a spurious 50% loss once early in a call.
- ZN-902: prove the Galène criterion once ZN-897 and ZN-895 land (publish `sendEncodings [{rid:'h'},{rid:'l',scaleResolutionDownBy:2,maxBitrate:100000}]`, a second client asks `video-low`, check its inbound `frameWidth`); simulcast with H.264; a Zinc-to-Zinc peer taking the rid streams.
- ZN-901: `tests/t1/webrtc_bwe.sh` measures time: run it alone on a quiet machine to trust its numbers.
- ZN-918: `imageFromBytes` decodes on the calling thread (`attachmentPicture`, `mediaPicture` in cdn.ts): decode thumbnails with `zinc:imageio` `load` too, on modest machines.
- ZN-919: cap the enlargement of a small picture and hide the thumbnail while the viewer is open; preload neighbour pictures; tests for drag-down dismiss, swipe, save and copy through the gesture API and simulated dialogs; the `thumbs` map can keep a stale key when a message id changes.

- ZN-921: the engine refuses `'xxxxxxxx-xxxx'.replace(/[xy]/g, (c: string): string => {...})` in a plugin (internal error "invalid IR after reference counting: const of a non-scalar type" in the lambda); written as a loop for now, reproduce in the smallest program and fix on every engine.
- ZN-921: audit the plain camera path (`voice video` in a call) with the same native extension ids: the camera sends them too (same code), check a viewer sees it.
- ZN-?: `max-w-full` with a fixed `w-[N]` does not clamp inside an absolute `inset-0` root with padding (use `w-full max-w-[N]`), and `max-h-full` with a shrinking `h-[372]` ScrollView does not keep a centred absolute dialog inside the window height.
- ZN-next: a trap names its source location and values without `ZN_TRAP_TRACE` (file:line, `index 36, length 36`); today `runtime error: array index out of bounds` alone sent the owner a crash with nothing to chase (murdoku, 2026-11-01); needs a pc-to-line table in ZBC.
- ZN-next: `zinc:ui/solid` batches every event handler and `onTick` by default (as Solid 2): a handler that sets several signals (murdoku `fresh`) renders no state in between; the unbatched writes made a bounds-checked crash only on the default engine, not on QuickJS.
- ZN-?: `examples/ipod-web/src/services/api.ts` (`fs.writeText(file, req.rawBody)`) and `examples/discord/tests/fake-discord.ts` read `rawBody` for binary uploads: use `rawBytes` and `fs.writeBytes` (strings lose 2 bytes per surrogate pair).
- ZN-?: every engine bundle published to the hub must be checked to hold no `ED A0..AF xx ED B0..BF xx` pair until all deployed tablets run a client with the byte-exact `fetch().bytes()`; `tools/rmpp-engine --publish` could recompress by itself.


- async-hot-paths: `Promise.all` of promises of different types stops at six (`__all2` to `__all6` of the prelude); above that the error is still Z0103, which should name the limit.
- async-hot-paths: `plugins/sonos/index.ts` has UPnP event subscriptions; music-tree could use them instead of its 2 s and 4 s polls, which would save more than reading in parallel.
- Engine: `zinc:gfx` startImageDecode needs a real or stub host on the console and web targets (the console stub always refuses).

- zinc device: `update --local` replaces the engine but leaves the shell on the old binary, so a deployed app can run on a mismatched engine until the session restarts; restart it, or say so.

- ZN-995: screen-capture holds a raw `Session*` in the startCapture completion and polls `open()` every 10 ms with no timeout; harden with the generation scheme if a late start completion is seen.
- ZN-993: `swapSurface` keeps per-window gesture fields that `release(h)` does not clear for a background window; `releaseAt` early returns, `grabKind===3 && !pinching` freezing pan and releases while backgrounded remain (docs/reports/implicit-state-machines.md #17).
- ZN-994: wire the zinc.json "crash" policy (exit/redbox/restart) to ZRT_CRASH and zrt::app_main, or drop the key and its docs/dev-mode.md section; today it is accepted and ignored, and the runtime's restart path runs only in tests/t0/zrt_restart.sh.
- ZN-994: if the crash policy is wired, unwind hal_sdl in_watch/in_poll after a longjmp out of the live-resize watcher (a depth counter reset from the guard point).
- ZN-996: a program that ends through a host-side `std::exit(1)` (not `zinc:sys exit` nor the end of the run) still counts as healthy for an app update on trial.
- ZN-997: navigation.tsx Stack rerender uses a version captured at render time; use a functional update (v => v + 1) once react.ts useState takes one.
- ZN-997: kit/imageviewer.ts: gestures still act during the 165 ms paging window of go(), and pinch and drag share the startPan* fields.
- ZN-998: the unmatched-closing-tag check runs only with JSX lowering; a file whose only JSX is a lone </X> gets a generic parser error.
- ZN-1001: a terminated worker's record stays in tOwned() (about 0.4 KB, walked at every delivery turn) because the handle is its index; a free list of handles would remove both.
- ZN-1001: a worker thread that ends with a DNS lookup in flight leaves its loop open (uv_loop_close refuses while a request is pending).
- TouchPad (2026-11-07): music-tree ran ~4 days to 216 MB (webOS quota 160), then a touch started kgsl MMU page faults and the Adreno 220 hung (ringbuffer protected mode error, LunaSysMgr frozen, reboot needed); 22 min of scripted navigation plateaus at 123 MB, so the growth is time or event driven (track changes, Last.fm, listening log, Sonos events): read /media/internal/music-tree-res.jsonl and music-tree-watch.log after a few days.
- TouchPad: a runtime image drawn by the GL renderer keeps its CPU pixels beside its texture (30 MB + 20 MB for music-tree's 120 pictures); dropping the CPU copy of an image never written again would halve picture memory on 1 GB devices.
- TouchPad: zgl_backend_trace has no webOS definition (ZINC_GL_TRACE's per-frame GPU line never prints there); ZINC_TRACE works. A ZINC_INPUT script runs faster than real time between painted frames, so a scripted scroll does not measure what a finger feels.
- chat-10m: a `VirtualList` with `estimatedItemHeight` keeps `hs`, `known` and `tree` per row (24 bytes, 340 MB at 10 M rows); the Fenwick tree alone gives a row's height (two prefixes) and a negative value can mark unmeasured, one array instead of three.
- chat-10m: scrolling a 1200x760 @2x window costs 38 % of a core on the CPU raster against 9 % on `ZINC_RENDERER=gl`, which in turn costs 4.7 % at rest (0.3 % raster) and 100 MiB more: profile both.
- ZN-799: an outer box-shadow on a `bg-transparent` box paints under the whole box (CSS paints it only outside the border box), so shadcn's `shadow-xs` stays off the kit fields until fixed.
- ZN-799: `zinc tsconfig` writes no `paths` for `zinc:ui/solid`, `zinc:ui/kit` and the other std modules, and omits the `zinc-ts-plugin` entry `docs/guide/01` describes: editors cannot resolve them.
- ZN-863.02: a removed project file comes back in the web page (nothing hides the read-only layer); a folder index for apps that write thousands of files; `readTextAsync`/`writeTextAsync` in the page.
- ZN-863.05: the web demo bar is English only (`zinc:i18n` exists); a plugin-level replay of recorded native answers would give samples without app code.
- ZN-863.07: pin the resolved address in `serve.py`'s proxy (DNS rebinding); list the hosts of `examples/music` and `maps/explorer` in their zinc.json.
- ZN-794: a `catch` callback that returns both a literal and a promise is still refused (TypeScript gives `Promise<T | U>`); typing its result as `T | Promise<T>` covers it. Also `Promise<i32>.catch(e => someCall())` returning a plain number is now typed open and can stop matching `i32`.
- ZN-794: adopting a promise returned by `then` takes one extra microtask where the spec takes two; ordering tests (test262) could tell.
- ZN-699: `Math.f16round` and `Math.sumPrecise` (ES2025+) are missing; add them when TypeScript's lib has them.
- ZN-793: `zinc lint` of a JavaScript program skips the `@requires` and plugin target rules; give the QuickJS check the plugin list.
- ZN-1007: `tools/site-examples` copies each sketch to a temp folder so it does not take Atelier's `zinc.json`; `zinc export <dir>` now stops at the folder (`ZINC_PROJECT_ROOT`), so the copy can go (keep the SKIP_DIRS filter).
- ZN-1007: `zinc run <dir>` of a folder without a `zinc.json` still climbs to a parent's (window size, permissions); setting `ZINC_PROJECT_ROOT` in `discoverEntry` for a directory entry would match `zinc export`.
- ZN-733: old links stay in `~/.zinc/cache/run/names` (one symlink per app name) and nothing prunes them.
- ZN-802: `number | undefined` prints as `null | number` in Z0103 (undefined and null are one type); print the spelling the declaration used.
- ZN-963: an exported desktop app could keep its `dataDir()` where the OS expects it (~/Library/Application Support/<app.id>, %APPDATA%, $XDG_DATA_HOME), as Electron and Tauri do, so backups and uninstallers find it; today it is ~/.zinc/apps/<name>.
- ZN-795: zinc:telemetry has no `udp://` sink in this engine, so `zinc monitor --udp` only receives from other senders; docs/prototype.md still shows `ZINC_TELEMETRY=udp://`.
- ZN-1003: a function value with default parameters that is not a named declaration (`const g = note; g()`) gets null for the parameters left out and traps: defaults are filled only at direct call sites; the callee or the closure's call entry should fill them.
- ZN-1003: QuickJS drops the trailing space of `console.log('x ')` while Node and the other engines keep it.
- ZN-1003: a Map or Set of a class passed where one of its interface is expected is a copy (writes not seen by the original), as arrays already are; TypeScript shares the collection.
- ZN-774.22: site search does not work in `astro dev` (the index exists only after a build); check the dark theme's search focus colour.
- ZN-774.27: translate `zinc help`'s own lines; an Atelier session test of how the help box ranks fuzzy matches.
- ZN-774.24: the What's New card shows the changelog in English only; the docs/i18n translations of guide/01-getting-started are stale; docs/start/styles.md translations lag one sentence.
- ZN-1004: a style object imported from another file fails on QuickJS with "cannot read property 'length'"; say "a style must be a style object or StyleSheet entry".
- ZN-1004: Pressable `style={fn}` fails with an error naming `styleFn`, a name the user never wrote; give the prop a union type or a clear error.
- ZN-1004: typed engines report a string style value as a bare Z0103; the message could name `pct(n)` or `0xrrggbb`.
- ZN-1004: `nearest()` breaks ties poorly ('bel' suggests 'bed' rather than 'bell'); prefer insertions.
- ZN-1006: choose the fallback font by language (Hiragino for ja, PingFang for zh) instead of Arial Unicode's Han forms.
- ZN-1006: CBDT/COLR colour emoji (Noto Color Emoji on Linux) are still not drawn.
- ZN-1010: an async function declaration or class method without `Promise<T>` is still refused.
- ZN-1010: in `c ? await a() : b` the plain branch costs an extra microtask, and `c ? await a() : null` is still Z0005.
- ZN-1010: `.then` callbacks that return `T | Promise<T>` are not flattened, and Promise and PromiseV are not merged.
- ZN-1010: variables declared after a top-level `await` are locals of the wrapper, so an exported variable after the `await` is refused.
- ZN-1025: a dashed key on a record that does not declare it is dropped silently; a diagnostic would help.
- ZN-1050: the zip/inflate API named in the task description is not done.
- ZN-1050: `toLocaleString` formats every locale as US English (digits from `toFixed`: 1.005 to 2 digits gives 1.00 where V8 gives 1.01; `style` and `currency` ignored); real locales need ICU data.
- ZN-1021: `--json` (JSON lines) for the build steps (`zn::log::step`), so Atelier's console stops classifying text; the QuickJS check (`zinc check` of a .js program) has no `--json` form yet.
- ZN-1021: the `fix` of `check --json` is the English registry text; a translated fix could sit beside `text`.
- ZN-1027: `zinc doctor` could list the plugins whose native build fails (ZN-774.14).
- ZN-1044: `zinc device update` could reuse `updateCommand` of src/tc/selfupdate.cpp to install and roll back (it still only downloads and verifies).
- ZN-1044: plugin options passed at load time instead of compile-time defines would remove the rebuild a project's options cause.
- ZN-1017: `typeof` does not narrow unions (`number | string`, `number | Insets` give Z0103); a union of primitives has no IR type. It blocks React Native's `hitSlop: number | Rect`, handled now only for literal numbers.
- ZN-1023: the checker refuses callback refs on host elements, `ref={(h) => ...}` (Z0103); React accepts them.
- ZN-1023: still open from ZN-917: dragging a text selection from Text into an input, Cmd+A on static text, Text in overlay layers or virtual rows not yet built.
- ZN-1023: a Pressable inside an ancestor that has its own `onKeyDown` now takes the keys after it (the walk stops at the first handler).
- ZN-1017: the Solid model still has no unstyled Switch, Modal or ActivityIndicator; SafeAreaView still pads through `env()` classes (move it to style keys from the safe-area signal); `android_ripple` is not drawn.
- ZN-1038: Lumen: a box's `shadow-*` is painted under its whole box and shows through a translucent background; clip it to the outside of the box (same as the ZN-799 kit field line).

## Demos
- D178: ipod-web's management page on a Raspberry Pi with thousands of songs (paging, search speed, lazy covers) and in phone browsers; one more Chrome step for a real drag and drop and for eject from the page.
- examples/carnet-nbe: run against Carnet's own repository (link.sh's default) once the frontend reads a generic method with a default type parameter, a computed key with a rest element in a destructuring, and an inline `type` in an export list; until then node_modules/@nbe points at a patched copy (.nbe-dev, ignored by git).
- examples/carnet-nbe: what Obsidian has that the vault does not yet: a completion list after `[[`, renaming and deleting a folder, inline formatting (bold, code), and code fences (Carnet's blocks-code plugin is not linked: a fence reads as a paragraph).

- ZN-650.10: zinc:audio decodes nothing in a deterministic run, so a test cannot read a sound log there.
- ZN-650.08: zinc:video has no sound; a film with a sound track needs audio played in step.
- ZN-650.08: film decoders are never closed (16 at most).
- ZN-650.08: zinc:assets gives no path, so a film is copied to the temp directory at first play.
- ZN-649.18: a clip to a path in zinc:gfx (raster and GL), after which `drawInside` in topview.tsx goes; a visible handle for the field of view.
- ZN-649.16: remove the Latin characters constant (`widgets.tsx` DRAWN) by loading the font at run time (ZN-669).
- ZN-649.06: measure what `assets.writePack` (zstd compressor) adds to an AOT binary; move the rows behind a plugin if it is large.
- ZN-649.06: a package among the game's assets is copied to a temporary file to be mounted; mount from bytes would avoid it.
- ZN-711: no installer or release download: the first step is a 6 to 8 minute source build with CMake and a C++20 compiler.
- ZN-712: js-p5 (144 lit boxes) measured alone on the M1 Pro, 2026-10-12: 17 ms of script a frame on QuickJS, 40 fps on a 120 Hz display; the engine is the bound (D110, ZN-723). The canvas goes to the window through a read and an upload (1.7 ms at 1600 x 1000): draw a full-window WebGL canvas straight into the window.
- ZN-712: when ZN-570 lands, add Text to js-pixi and js-phaser and a 2D sketch to js-p5; when ZN-573 lands, listen to js-phaser's sounds and tick criterion 2.
- ZN-712: the figures of anatomy-figures 0.1.0 (MIT, npm; each has a framework-free `element/<name>` entry with `render(host)`) as a JS demo without a webview: Canvas 2D already paints their paths (watch 859, turbofan 4,149, taken from the markup); what is missing is an SVG scene in the web environment (innerHTML of SVG, the figure's stylesheet with attribute selectors and `var()`, `use`, gradients, clipPath, mask, hit test, shadow root) painted from the tree each frame; a full repaint at 900x810 took 48 ms (watch) and 73 ms (turbofan) under a load of 8 on 2026-10-12, bound by the painted area, so the parts that do not move need a cached layer.
- ZN-570: the js-pixi, js-phaser and js-p5 examples can now use Text and a p5 2D sketch.
- ZN-574: Kaplay's `onGamepadButtonPress` (criterion 1) needs Kaplay in `tools/test-lib`.
- ZN-650.07.05: ZINC_SYSTEM_SCRIPT counts loop passes, not frames (2 per frame, late once: `museum_editor_tools` failed once in eight runs); give it frame numbers like ZINC_INPUT.
- ZN-650.14: the font refusal is proven interpreted only (same host code compiled); the fs-scope (`user-picked`) path for fonts is not tested.
- ZN-572: Phaser's canvas renderer builds an Error (stack) every frame, seen in the sample, source not found.
- ZN-716: one `zinc:osc`: the plugin (`zinc:osc/full`) takes over the built-in of ZN-085 (compat `send`/`listen`/`close`, `src/host/osc.cpp` and its three host rows removed); two modules for one protocol confuse a first user.
- ZN-716: `zinc:osc/full` (OSC over TCP/SLIP) on QuickJS, not checked since `zinc:socket` runs there (examples/carnet-nbe, 2026-10-21).
- ZN-718: `zinc:webview` does not compile on macOS, in the tree either (`operator new` redefined via `zrt.h`); display-st7789 does not link with zig; imu-qmi8658 and script have no thunk.
- ZN-203: webgl_conformance: glsl/bugs/sampler-struct-function-arg.html and sampler-array-struct-function-arg.html report PASS, then zinc aborts (SIGABRT, exit 134) while the QuickJS run ends; reproduce with `WGC_BUNDLE=/tmp/w.js python3 tools/webgl-conformance <page>`, then `zinc run /tmp/w.js --engine quickjs`; on the runner misc/uninitialized-test.html also fails (non-zero bytes in an uninitialised buffer).
- music: deliver the Spotify login to an Android device without root (adb push to Android/data/<id>/files, read by zinc:spotify as a fallback, or an in-app PKCE login with the device's browser and the 127.0.0.1:8765 redirect): today the Nexus 7 got it through su.
- ZN-758: mute from the tablet (`{t:"mute", app|domain}` on a long press) is not built; the Mac side applies it already.
- ZN-758: no way to forget a paired Mac on the tablet (`link.forget`); the header names only the last Mac that said hello.
- ZN-758: StandBy over the lava face has 183-226 ms p99 frame intervals on the Nexus 7 (first use of the large glyph sizes plus the full-screen veil blend): pre-warm the fonts or a cheaper veil.
- ZN-758: the notification list rows could show the sender's avatar for messages.
- ZN-757: avatars from WhatsApp's own cache (group.net.whatsapp.WhatsApp.shared/Media/Profile + ChatStorage) are not built.
- ZN-757: the banner-capture avatar source (Accessibility + ScreenCaptureKit, off by default) and its assistant step are not built.
- ZN-757: check real Chrome, Firefox, Safari web notifications and real Messages/WhatsApp records with `zinc run examples/notify-relay -- --inspect 30` once Full Disk Access is granted; whether a scheduled Focus writes an assertion is unverified.
- ZN-791: smooth the other players' movement in Paint Arena between the 20 Hz snapshots.




- world rule: a far chunk per region for very large worlds (one chunk for the whole world today), and a per-cell reach for landmarks.
- defaults3D: zinc.json `"3d": {...}` overrides, and measured rows for Android, iOS and web.







- zinc:sonos events: no ContentDirectory (queue, favorites) or AlarmClock subscription yet; `subscribe` accepts them, `apply` ignores them (queue and alarms batches of docs/reports/sonos-soco-parity.md).


- iPod demo: the opener scope for Last.fm sign-in was dropped at integration because it would also limit Reveal in Finder; scope both (https://www.last.fm/* and the user's folders) once opener scopes take paths.
- zinc:ui swipe back/forward gives no live feedback (Safari slides the page with the fingers); it acts on release only.
- iPod demo: the Linux right-click menu needs a stand-in (no native popup menu there).
- zinc:system: the Dock's Quit and a logout arrive as a window close; tell them apart (applicationShouldTerminate).
- iPod demo: a running transfer cannot be cancelled midway (a half-written file the database does not know); design a safe cancel.
- zinc:system: ZINC_SYSTEM_SCRIPT ticks run faster than frames in a UI app, though docs/plugins/system.md says a tick is a frame.


- zinc: no zip or inflate API; the iPod's ListenBrainz zip import uses the system unzip (Windows lacks it).
- iPod history: matching by MBID needs MUSICBRAINZ_TRACKID read from the files (the iPod database has none).

- iPod app sharing: Subsonic scrobbles could feed listening.ts; Subsonic writes bypass the transfers queue and could interleave with an app job.


- iPod For you: the "For this time of day" and "Loved but not on this iPod" shelves of the Genius study are not built.


- iPod AudioMuse: pull the MusiCNN embeddings (include_embeddings=true) into a deep.v1.bin for a true cosine kNN and Daily Mixes clustered on sound.
- iPod AudioMuse: read AudioMuse's own clustering playlists (/api/playlists) as more Mood mixes once a library is analysed.
- iPod AudioMuse: an "Analyse new songs" button on For you when songs are not analysed yet (today only on the Settings card).




- iPod radio: queue.dropUpcoming filters the context but ignores the shuffle order; check a thumbs down while shuffle is on.

- iPod satellite: POST /devices/:id/jobs (pull with Range, one addWith, remove, committing), GET and DELETE of a job, fingerprints in the track list; then play-count deltas to jukebox once its plays endpoint exists (docs/reports/ipod-jukebox-interconnect.md §7).
- iPod jukebox source: ALAC rather than AAC 256k for a roomy Classic; covers for remote adds (/api/update takes none); a virtualised browse list with multi-select.

- iPod demo: Discover as a For you shelf; a QuickJS smoke run of Discover, Repair and Lyrics; a test of the Lyrics panel scrolling long lyrics.
- iPod sleep timer: zinc:sonos SetSleepTimer/GetRemainingSleepTimerDuration so a Sonos keeps the timer if the app quits; keep the app in the menu bar while an alarm is set (closing the window quits it today); tests of the alarm on wake and of the end-of-song/end-of-list modes.
- ZN-868: animated emoji show their first frame only.
- ZN-872: Opus loss concealment and FEC, and reordering in the jitter buffer: real calls over Wi-Fi will show whether gaps are audible.
- ZN-872: DAVE verification codes (daveSessionGetPairwiseFingerprint) in the call bar, as the official client shows them.
- ZN-872: READY_SUPPLEMENTAL's voice_states (capability bit 5 not asked): who is already in voice channels at start shows only after a VOICE_STATE_UPDATE.

- ZN-881: Discord interactive components (buttons, selects) behind a setting, since they act on a bot for the user.
- ZN-881: Discord inline video and voice-message playback, Lottie stickers, archived threads, role colours on names, fetching an absent referenced message, burst reactions.



- ZN-869: try the QR and password+TOTP logins with a spare real account (AC1, AC2); check Discord still accepts remote-auth v2 and the Origin header.

- ZN-875: send screen audio with Go Live (ScreenCaptureKit SCStreamOutputTypeAudio through zinc:screen-capture).
- ZN-875: adapt the Go Live and camera bitrate to RTCP receiver reports (loss, REMB) on the voice UDP path (criterion #3).
- ZN-875: watch several Go Live streams at once (one at a time today).
- ZN-875: show the stream preview (GET /streams/{key}/preview) on a stream tile before watching; check its rate limits first.

- ZN-890: pace the voice gateway of plugins/discord-voice through the Discord guard's gateway budget.

- ZN-891: check on a real Discord call that the UDP voice server answers our RTCP sender reports; without them the round trip shows "--" and Go Live never adapts.
- ZN-891: a lossy phase in the fake Discord (loss on the voice stream) so the session covers the automatic ultra low data switch; read REMB for the video bitrate.

- ZN-907: show my own status on my avatar in the user bar (the status picker stays in the official app).
- ZN-907: guild channels whose permissions differ share one member list (Discord's list id is not read).

- ZN-909: playout-delay extension ID 5 vs 6 (docs.discord.food table): settle it from the owner's DISCORD_LOG of a real call.
- ZN-909: read RTX (PT 102, OSN) and answer NACK with RTX instead of only asking for key frames.

- ZN-910: "shares a server" knows only people seen this session; a cold DM is judged by the channel's last message, not mine.

- ZN-904: animated WebP/APNG off macOS (vendor libwebp demux and an APNG reader); animated custom emoji inside text; Tenor mp4 renditions through zinc:video; standard sticker packs; a GIF sticker downloaded twice.
- ZN-905: switching themes live was proven only through the scripted session.
- ZN-912: discord-voice: map received RTX (PT 102 on a stream's `rtx_ssrc`) back to its primary SSRC and original sequence before the reassembler; today they are counted and dropped.
- ZN-912: discord-voice: header-extension IDs experiment (`DISCORD_VIDEO_EXT=6`, RID ID 11) if the official client still does not show our camera after a call log.
- ZN-912: discord-voice: handle op 24 with epoch > 1 and echo `experiments: ['fixed_keyframe_interval']` in Select Protocol when Ready lists it.
- ZN-912: discord-voice: a DAVE test with real libdave vectors (two-epoch group, a third member joins) if an MLS fixture can be generated.
- ZN-912: examples/discord: check the main gateway's fresh IDENTIFY versus RESUME against `Voice disconnected` in `call.ts`.
- ZN-913: examples/discord passes no `devices`, so Go Live has no Devices tab; wiring cameras into it needs the call to send a camera as a stream.
- ZN-920: Go Live ignores op 15 `pixelCounts`, so it cannot scale down for a small viewer; delay op 12 active until DAVE is keyed (only the encoding is held now); a T1 check with a static fake screen source that must yield at least 4 fps and a key frame per second.
- ZN-920: show the ultra low data state plainly in the call bar (the owner's real call ran in it without noticing: 640x360 at 5 fps, 150 kbit/s).
- ZN-914: zinc:editor tokenizes only TS/JS, JSON, Markdown and CSS: add py, rust, c/cpp, go, sh, sql, html, diff (proven grammars, e.g. Prism or highlight.js) so the picker's other languages highlight; the code panel is a fixed 160 px (grow with its lines) and the folded block assumes 18 px lines.
- ZN-916: Slack theme lacks square avatars, the Lato font and the 3-section sidebar (Channels / Direct messages / Apps) with a workspace menu; Teams lacks its left activity rail and the purple selected-channel bar.
- ZN-?: Discord voice AEC: replace the `isHeadphones` name guess with the device type or transport that miniaudio/CoreAudio reports; add a T1 loopback with a simulated room in the fake microphone path.
- ZN-707: boot tests for Babylon 9, LittleJS and Kaplay (vendored or pinned in tools/test-lib), with Kaplay text() and onGamepadButtonPress and LittleJS overlay text against headless Chrome: left by ZN-570 and ZN-574 when ZN-707 kept PixiJS, Phaser and p5.
- ZN-700: a shared kit for the editors written in Zinc (the pinball and museum editors repeat panels, lists and inspectors); worth it when a third editor appears.

## Cross-platform pass

- ZN-1027: an export with a broken plugin to a Linux target fails as on the Mac.

- ZN-1006: bundle an OFL Noto subset (Symbols 2, Arabic) for machines without system fonts (Pi OS Lite, ESP32), and prove the new Linux Noto paths on the Pi (spark@192.168.2.31).
- ZN-764: validate lazy raster/HTTP scratch, display-gl splash-buffer release and encoded-input lifetime on Windows, iOS/Android, KMS/webOS, consoles and actual WASM; measure pixels, CPU and RAM. Audit 3DS/Vita software-only rows/framebuffer allocation against GPU fallback and diagnostic frames (see engine-memory-hal-2026-10-31.md).

- iPod AudioMuse over the LAN from the Pi daemon, with the same client.
- zinc:ui scrollKey on the web target (DOM render): the browser owns the scroller there; verify the restore.


- ZN-846: launch the delivered CLI and signed Atelier on the networked Intel Mac running Catalina 10.15; only modern macOS/Rosetta execution is proven locally.

- ZN-845: launch the legacy Intel runtime on real macOS 10.12, check dyld imports, hello and bouncing-ball pixels, game keys/mouse/close; modern macOS under Rosetta and the 10.12 deployment target do not prove Sierra compatibility.

- ZN-844: the hub app installed web 0.1.1 packed by zinc 0.9.1 on a tablet running engine 0.8.2, which refuses the archive: the catalog should carry the engine version a .zapp needs and the hub refuse (or say "update the engine") before installing.
- ZN-844: during a pinch or drag in Zinc Web or PDF, draw the scaled picture directly instead of rebuilding the ink's baked image every frame, if pinching feels slow on the reMarkable.
- ZN-844: Zinc Web: lighter pictures from the relay (a PNG screen is ~500 KB, ~0.5 s to reach the tablet), and fetch the screen above too.
- ZN-649.12: run web_physics2d after rebuilding browser WASM to verify Hit events and packed snapshots end-to-end; C/JS shim regression passes on the development Mac.

- ZN-827/ZN-828/ZN-832: build and exercise the pinned Godot exporter, GDExtension and LibGodot hosts on each supported desktop platform; embedding does not confer Zinc console/MCU support on Godot.
- ZN-830/ZN-831: verify the animation plugin, deformation backend and authoring-scene reimport on later targets, preserving explicit unsupported-feature diagnostics.



- ZN-774.02: run `install.sh`, `install.ps1` and the Homebrew install end to end and read their last lines (`zinc --next-steps`).



- ZN-438: sprite atlas sources build warning-free under `zig c++` (cross builds).
- ZN-446: the splash on display plugins (display-fbdev before EGL/GLES, the panels, ESP32 RGB565 from flash); `showSplash` skips runs with a display plugin today.
- ZN-446: OS splashes from the exports (iOS launch storyboard, PSP PIC1, Vita LiveArea, 3DS banner) once those exports exist.
  profile refuses; there it needs a typed JSON walk or mergeItem left out.
  proves the card is placed 14 px low), then try re-sending fullScreen false/true on libnapp's IPC channel after the card is maximized.

- D119: back ends of the GPU layer for the connected platforms the owner named (CHIP Mali-400 on the GLES 2 base; PS Vita GXM; 3DS citro3d; Wii GX; Wii U GX2; Switch deko3d or NVN), one small back end per GPU as PocketJS does; and the extraction of the layer as a project of its own once a second back end exists.
- ZN-718: zinc lint: an opt-in `zinc lint --js` running a pinned oxlint for generic hygiene rules; pin ast-grep if users ask for their own codemod rules (docs/reports/zinc-lint-migrate.md).
- ZN-701: webgl_conformance on a GPU that does not zero new memory (the AMD driver of an Intel Mac, a hosted runner's virtual GPU): our WebGL layer leaves new textures, renderbuffers and the area outside a copyTexImage2D source to the driver; WebGL says zeros. 61 pages differ on the hosted runner (list: docs/reports/ci-run-38901269935/trace-webgl_conformance.log): zero-initialise explicitly; the hosted runner then proves it (ZINC_CI skip to remove).
- ZN-718: zinc:socket speaks ws:// only: no public wss echo for the live feed of rn-showcase (TLS WebSocket).




- ZN-?: real-device pass for web serial, MIDI and gphoto2 (Arduino, MIDI keyboard, PTP camera) and Firefox/Safari runs of the WebGL tests

- ZN-?: web-real-test: per-demo scripted interactions (rn-showcase, nuxt-ui, webrtc-chat) and a screenshot diff against the desktop render at DPR 2; a headful run on the owner's Mac as a milestone check (Firefox and Safari still untested)
- ZN-773.04: run tests/t1/package_app.sh once index/root.json exists (tools/package copies index/ into the package then).

- ZN-785: evaluate a separately flashed A/B Pi OS image with RAUC, persistent app/settings storage, signed boot+rootfs bundles and tryboot health confirmation on Pi 3 B+; prove power-cut rollback before offering whole-system updates. Current engine generations do not update the OS.
- Inspector Info: check by hand that moving the window to a screen of another refresh rate updates the rate (SDL_EVENT_WINDOW_DISPLAY_CHANGED, no automatic test).
- D195 Pi A/B image: build an "ab": true image and its bundle (tools/pi-image keys, build, bundle); on a Pi 3B+ and a Pi 4/5 run zinc-system-update install: tryboot into B, mark-good commits config.txt, a failing session, pulled plug or watchdog in B returns to A; users, Wi-Fi, SSH keys, apps and pairing survive; verity bundles work on the Pi kernel.

- ZN-462: cache stable Canvas/subtree contents in bounded GPU textures during transform animations, with correct transparency and invalidation; iPhone 4 Motion still costs about 43 ms GPU at 320×480 after the measured shader/occlusion improvements (iphone4-ios7-bringup.md).

