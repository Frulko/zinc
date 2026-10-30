# Later: what is not a task yet

The backlog is frozen (AGENTS.md, "Keep the backlog shrinking and the sessions cheap", owner, 2026-10-11): an idea, an improvement, hardening, a measure
to take or a check on another target is one line here, not a task. `- ZN-n: what, and why it matters` (ZN-n is the task that found it).
The next backlog review turns lines into tasks or deletes them.

## Engine and tools

- zinc:system simulator: `ZINC_SYSTEM_SCRIPT` splits a line's arguments on spaces, so `dialog-answer /Users/me/Pictures/Trieur test` answers `/Users/me/Pictures/Trieur`; a quoted or rest-of-line path would let a test pick a folder with a space.
- QuickJS: no Intl, so `toLocaleDateString('fr-FR', { month: 'long' })` gives the en-US form; examples/photo-sorter names its months itself (a `ponytail:` comment marks it).
- zinc:ui: a width given as a string decided at run time (`width: `${n}%``) is not read as a percent; `pct(n)` is the way, and the diagnostic could say so.
- photo-sorter: dropping folders on the window to add them as sources (`drop` events of zinc:system), and a grid to sort several pictures at once.
- ZN-862: the imageio thumbnail cache is never pruned; a size cap or an LRU sweep, or a large library grows `cache/thumbnails` without end.
- ZN-862: the portable imageio reader decodes the whole JPEG before downscaling (about 96 MB per 24 MP picture per worker, 2.8 s for 24); libjpeg-turbo's scaled decode would cut both on Linux and the Pi.
- ZN-862: `trash()` returns false for a file on another disk (freedesktop's `$topdir/.Trash-$uid`) and on Windows (`IFileOperation`).
- ZN-862: a headless run without `ZINC_DETERMINISTIC` runs its frames faster than real time, so a program waiting on threads or timers can end before their results arrive.
- trieur (typed engine): trieur's TypeScript does not pass the interpreter/AOT checker yet: `import type` cycles (Z0005 on core/src/plugin.ts), index signatures and `Record<string, V>` as objects, object literals given to a method interface, generic arrows, `for await`; filling them lets examples/trieur leave QuickJS.
- jsx: a style object built in another file (`style={tokens.card(on)}` imported) is not lowered (only the file's own functions and constants are); on QuickJS it fails as "cannot read property 'length' of undefined" in setStyles: say "a style must be a style object or StyleSheet entry" there.
- QuickJS: a string colour in a runtime style (`ui.setNumber(n, 'backgroundColor', '#fff')`, `color: someString`) is ignored without a word.
- icons: `<Icon name="trash-2">` with a name Lucide renamed (now `trash`) draws nothing and says nothing; warn with the closest name.
- text: CJK text (木, き) draws as '?' in zinc:ui while Arial Unicode is among the system fallbacks (examples/trieur flashcards, Japanese deck).
- cli: `zinc run --engine quickjs file.tsx` prints the usage; only `zinc run file.tsx --engine quickjs` works.
- trieur: the palette follows zinc.json "scheme" at start; with "auto" a change of the system's appearance while the app runs restyles `dark:` classes but not THEME (no scheme-change hook in zinc:ui).
- D178: QuickJS turns binary bodies of zinc:net (`Response.bytes()`, `Request.rawBody`, and `fs.writeText` of them) into U+FFFD past 0x7f, because strings cross into QuickJS as UTF-8: binary downloads and uploads served under `--engine quickjs` break (the iPod app's remote covers and songs); a host row that returns bytes on QuickJS fixes it.
- D178: a typed `JSON.parse` with a missing field gives `undefined` on QuickJS where the interpreter and compiled program throw "cannot convert Dyn (undefined)"; the three engines should agree.
- D178: `?:` with `await` in one branch and `null` in the other, or an await inside a larger expression of a branch, is still Z0005; it needs the branch types in the desugar, and the plain branch's extra microtask should go too.
- D178: in an async `Promise<void>` function, `return voidPromise()` resolves at once instead of waiting for that promise (`src/frontend/desugar.cpp` `fix()`, the `vp` path).
- qjs_demos: rn-showcase on QuickJS ignores the prefs (language, notes) saved by earlier runs that the interpreter reads (French and 2 notes against English and 3 on 2026-10-29): zinc:storage seems keyed per engine, and the test runs in the user's ZINC_HOME; give the test its own ZINC_HOME and make the store the same on every engine.
- ZN-856: fill `plugins/<name>/docs/` for every plugin (overview, a tutorial with `<Steps>`, a screenshot, notes), following docs/reports/plugin-docs-audit/; most engine plugins fall back to `docs/plugins/<name>.md` or the `plugin.json` description.
- ZN-856: MDX components written in Zinc and rendered at build time, so a plugin can add its own (an unknown component keeps its text with a warning).
- ZN-856: an API reader over the parser if the token-based reader (an ASI rule of thumb) misreads real code.
- ZN-856: links from docs to source files (`.ts`, `.tsx`) lose their link; point them at the repository when zinc.json names one.
- ZN-856: the engine site's search index is 1.2 MB; measure it on a Pi or an old tablet, then split it per section or vendor minisearch.
- ZN-856: translate the doc theme's interface strings (Search, On this page, Copy, Previous/Next) into the five languages.
- ZN-856: decide whether `site/` (Astro) keeps publishing the docs or uses `zinc doc --std`.
- ZN-852: `n.toString(r)` with r outside 2..36 throws no RangeError as in JavaScript (it returns digits).
- ZN-852: `p.then(onFulfilled, onRejected)` with two arguments is refused (Z0104); JavaScript allows it.
- ZN-852: a generic Promise<void> converted to PromiseV settles one microtask later than Node; and `await fail<void>()` used as a value has the type `__Void`, which can show in messages. Merging Promise and PromiseV would remove both.
- ZN-855: `resolve(undefined)` on a `new Promise<void>` is refused (its resolve is `() => void`) though TypeScript accepts it; let the call drop an extra null or undefined argument.
- ZN-855: a generic function with a parameter of type T and T = void (`ok<void>(undefined)`, `Promise.resolve<void>(x)`) is still refused with Z0103 'null' to 'void'; instantiating functions with `__Void` as classes are would need void-returning callbacks to fit `__Void`-returning ones.
- ZN-855: the Promise constructor does not reject when its executor throws, as JavaScript does.
- ZN-855: `then(f)` where f returns a Promise is not flattened although lib/zinc.d.ts says so: implement it or fix the typings.
- ZN-855: `mqtt` (T0) failed once with "cannot connect" while three trees built: a retry, or tests/ci/off.txt.
- ZN-853: a component declared in a file with the name of a host component (`function Button`) renders the host one (the kits rely on it: kit/button.tsx wraps `<Button>`); its error "unknown attribute 'icon' on <Button>" should say so and name the fix (rename it).
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
- ZN-851: plugin_manifest fails since 3d3b59dc: zinc:carplay is not in tests/data/plugins-added-table.txt.

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
- ZN-844: `charCodeAt(i)` (and the other UTF-16 index reads) on a non-ASCII string converts the whole string with `toU16` at each call (src/rt/rtcalls.cpp), so a charCodeAt loop over accented text is quadratic: 90 KB took 19 s in JSON.stringify before it got a native quote. Keep a UTF-16 view or a byte cursor per string.
- ZN-792: list n3ds/psp/vita in the "targets" of the plugins the console cores link (3d, audio, physics2d), so zinc lint --target n3ds stops warning about them; dev and deploy already filter them out using the player's list.
- ZN-792: give the bytecode's native imports the plugin they come from, so the console's runtime error names the plugin (canvas2d), not only the module (Canvas2D).
- ZN-792: list zinc:gl (and other host modules) per profile in targets/capabilities.json, so the lint and the pre-send warning catch gl-cube before it is sent to a console.
- 3DS AOT: an AOT build keeps a 16 MB zrt heap Tokyo leaves almost empty (1 KB used, largest free block down to 1.3 MB on a long flight); measure the other compiled demos and size it to what they use.

- ZN-829: measure asynchronous staging and paged provenance for large scene reimports; the demonstrated world slice eagerly validates its small chunk set.
- ZN-828: extend native embedding adapters with IME, clipboard, accessibility and gamepad support before treating the demo bridge as a production UI SDK.
- ZN-830: measure representative animated-character CPU skinning and memory before choosing a GPU palette path; current proofs establish structural limits and correctness.

- ZN-162: a self-referential closure cycle leaks (tests/t1/rc.sh:7, closure_names.ts): needs escape analysis or a cycle collector; nothing else tracks it.
- ZN-571: D103 kept canvas_ity for Canvas 2D on the condition that no JIT engine runs; JSC and V8 now run on macOS: check the condition again.
- ZN-677: draw_boxed's drawImageRect path has no bench/render case; add one if a profile shows image rectangles cost.
- ZN-774.20: fill_rrect computes its anti-aliased top and bottom rows per pixel; small cost, measure before changing.
- ZN-676: write in its test why the line order is what it is.
- ZN-147: tests/t0/fuzz_regress.sh only checks the exit code is below 124, so the duplicate-names finding (internal error: invalid IR after reference counting) passes; make it fail on an internal error once ZN-147 is fixed.

- ZN-775: support component/fragment roots directly in VirtualList; virtual positioning needs a host box (Kanban uses a View row), whereas layout flattens JSX fragments and drops their position.
- QuickJS: a browser `WebSocket` global (binary frames as ArrayBuffer) for libraries that expect one (@nbe/collab's connectToRelay); examples/carnet-nbe/src/services/sync.ts carries the adapter over zinc:socket, the web environment could give it to every program.
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
- ZN-726, seen outside the task: `ui_alloc_text` counts 6 allocations above its golden on main; `font('mono', 16)` returns -1 in a program without a `font-mono` class although `type.ts` relies on it; display-gl on a Retina Mac replays logical-pixel frames into a 2x window (text from logical glyphs, 1 px lower than the software frame); `phys_font` drops the synthetic italic of a run-time font on HiDPI (read, not tested).

- ZN-722: budget the full-resolution DevTools capture/encoding/transport buffers before continuous profiling; captures perturb process RSS strongly (separate memory-path investigation).

- ZN-721: connect view lifetimes to existing native/asset resource handles and complete CPU/GPU destruction; research and validation plan in docs/reports/zinc-next-resource-lifecycle.md, addressing the museum's persistent model/video caches.

- ZN-720: let the renderer consume packed image resources instead of embedding the same decoded images again; museum-table carries 75.60 MB of RGBA pixels in its executable as well as its adjacent pack.

- ZN-569: a Worker in the web environment, and `createImageBitmap` with it; PixiJS `Assets.load` takes that path when both exist.
- ZN-569: images read and decoded off the frame in the host; a large image stalls the frame that loads it.
- ZN-430: a .zapp's members are still unpacked once into the cache (its size again on disk); reading assets in place from the archive needs zinc:assets and the readers by path (video, sqlite, zinc:fs) on an archive source, the ZPK design of docs/reports/games/toolchain-assets-loading.md 6.1.
- ZN-583.01: zinc:physics2d steps on one thread; Box2D's task callbacks would spread a step over workers (drop.out must stay identical with 1 and 4 workers).
- ZN-583.01: zinc:physics2d has no shape casts, overlap queries, distance/weld/wheel joints or queries of contacts in progress yet; add them when a program needs them.
- ZN-433: the first read of a ZPK entry hashes at 169 MB/s (third_party/sha256); use mbedTLS's or a SHA-extension SHA-256 when large packs are verified at launch.
- ZN-433: link zinc with -dead_strip / --gc-sections: lz4.c drops from 70 KB to 2.7 KB and the zstd decoder from 137 KB to 117 KB (D40).
- ZN-354: plugin.yml rebuilds zinc in every leg and in the release job (5 to 10 min each): use a release package when zinc-ref is a tag, or cache the build by commit.
- ZN-354: the path filters of zinc-next.yml miss templates/** and .github/workflows/plugin.yml, so a change there runs no CI test.
- ZN-354: `zinc test` in a project also runs the tests its plugins/ carry (a plugin added from the starter brings tests/): skip plugins/ as build/ is skipped?
- ZN-274: ease the opaque hover:/focus:/active: text and border colours at paint time, like the background.
- ZN-274: transition keys in style objects (Reanimated 4's CSS transitions) and arbitrary values such as duration-[2s].
- ZN-327: `zinc export --target linux` builds aarch64-linux; add an x86_64-linux target (zinc publish labels the aarch64 build Linux (ARM64), channel linux-arm64).
- ZN-327: release builds have none of the prototype's hardening (stack protector, FORTIFY, RELRO); decide, measured with tools/bench-m4.
- ZN-434: importer versions instead of the engine's executable stamp in the asset keys once the importers settle, so CI shares ~/.zinc/cache/assets across engine builds and `zinc assets verify` can compare.
- ZN-581: the browser host (targets/wasm/glue/worker.mjs) ignores drawImageRect's new rotation, tint and blend arguments.
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
- ZN-262: zinc:react-native has no ImageBackground and Image takes no source={{ uri }}; a View with backgroundImage: 'url(..)' covers the first.
- ZN-438: `zinc export` (native targets) should copy `build/assets/<target>` into dist; exported games use the loose-image fallback today.
- ZN-438: atlas page format, `maxSize` and POT should come from the target's asset profile (rgb565/rgba4444 with ZN-439's encoders).
- ZN-438: zinc:assets v2 image handles should free pack images with their group; they live for the program's lifetime today.
- ZN-446: `zinc run` of a natively built program shows no splash during its first native build (seconds); only the executable shows it as it starts.
- ZN-450: QuickJS has no host events (`__addEvHandler`): assets.onReload, zinc:sys signals and stdin, and zinc:process events never fire on `--engine quickjs`.
- ZN-160: an object literal with accessors prints as its generated class (`__object0 { n: 2 }`, Node `{ n: 2, v: [Getter] }`); for...in, JSON.stringify and `{...o}` leave its accessors out.
- ZN-160: getters and methods of object literals cannot read variables of the function around them (Z0005); needs methods that carry a closure.
- ZN-160: still refused: `console.log(...a)`, push with several arguments, a tuple spread of an expression that is not a variable or property, a rest element of a tuple value.
- ZN-443: not supported yet: Tiled infinite, isometric and hexagonal maps, image layers, image-collection tilesets, tile animations, per-tile properties; LDtk `.ldtkl` level files, level backgrounds, per-tile alpha, layer parallax.
- ZN-443: no hot reload of a map's table under `zinc dev` (the atlas pages reload); reuse Level objects by name on onReload.
- ZN-443: `.tmx`/`.tsx` through a vendored XML parser (tmxlite or pugixml) if users ask.
- ZN-443: QuickJS's `Date.now` stayed frozen in a headless run; check whether the virtual clock should advance with the frames.
- ZN-439: share a texture's UASTC encode across profiles in the cache; each profile encodes again today (12 to 19 s per 2048 texture).
- ZN-439: free a texture's CPU texels after its GPU upload on GL-only targets (the Pi); both copies are kept today.
- ZN-439: basisu fetched prebuilt through the signed index (ZN-337); its first use downloads 190 MB of sources and builds for about 6 minutes.
- ZN-441: zinc:assets `readBytes` (and `fs.readBytes`, `utf8Encode`, `randomBytes`) fill a u8[] one host call per byte: 5.6 of the 8.6 ms of the truck's .zmesh load; a runtime call that copies the entry at once makes a .zmesh load a memcpy.
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
- ZN-732: zinc lsp publishes the diagnostics of the changed document only: re-publish the open documents that import it, then Atelier can drop `zinc check` after a save; ModuleInfo keeps no `import * as ns` alias, so the server finds the module of `ns.` by its path.
- ZN-732: completion inside the braces of an import, of JSX element and attribute names, and of string and array members with their signatures (a fixed list of names today); several signatures for overloads; signature help inside an object literal argument.
- ZN-732: auto-import in zinc lsp and Atelier: a name that is not imported is not proposed today (`rr` gives no `rrect`; `gfx.rr` after `import * as gfx` does, with signature and doc): list the exports of the zinc:* modules, of the sketch's files and of the added plugins, show where each comes from, and add or extend the import line on accept (`additionalTextEdits`); also the module names inside `from '…'`.
- ZN-733: `zinc build` and packaged apps still name their window "zinc" unless zinc.json sets window.title; old links stay in `~/.zinc/cache/run/names`: clear them with the run cache.

- ZN-729.05: `zinc device deploy --inspect`, a pack with `import 'zinc:devtools'` in front as `zinc dev` does, so any app can be inspected (today only an app that imports it has an inspector).
- ZN-729.05: `zinc device debug <app>`, the app restarted under `zinc debug --cdp` with its port forwarded (today: `zinc device forward` by hand).
- ZN-729.04: the engine update of `zinc device update` stops at "downloaded and verified": put the package in place and restart the agent, with a way back.
- ZN-729.03: `zinc dev --device` beside a deployed app of the same project: both run; stop the app for the session on a one-screen device.
- ZN-729.06: a sketch started from Atelier keeps running on the device when Atelier quits: offer to stop it.
- ZN-728: with a sketch that prints without pause (230 lines a second), Stop had no effect in 50 s; cause not looked for, the console rebuilding its rows at each line is where to look first.
- ZN-728: owner's idea (2026-10-12): in Atelier, a first-start assistant, a doctor step by step, and a Preferences panel in the macOS app menu (Cmd+,) that set up what building and playing with Zinc need: download the latest prebuilt engine (ZN-718, `zinc update`), plugins on demand (the signed index), the pinned tools (`zinc doctor` and `zinc toolchain` already list and fetch zig, esptool, QEMU, basisu, gltfpack with their SHA-256) and what cross-compiling needs, each with its state, size and progress. Build Atelier's app with `tools/package` (ZN-053: zinc, modules, lib/std, templates in the bundle) rather than app/atelier/package-macos.sh, which points at a checkout.
- ZN-734: zinc:platform's SCREEN_W and SCREEN_H are the size known at compile time (320x240 for a sketch): on a device that gives its own size they differ from width() and height(); two examples read them. A large screen (1080p on a Pi 3) is now drawn whole by the software rasterizer for a sketch without a size: measure, and consider a cap or a scale for slow boards.
- ZN-736: a `zinc project --json` that prints the parsed project (name, app, targets, permissions in force, plugins used), so Atelier stops reading zinc.json as text (a zinc.json with comments or a BOM shows the plain-sketch card); from the card: the app's id, the icon (a file dialog), the entry, per-target sizes, Build App for another target and for a paired device; Tab does not go from the width to the height field; Show Folder was not run on a desktop.
- ZN-729: the agent hands its own environment to the apps it starts: under `tests/run` that is `ZINC_DETERMINISTIC=1`, and a timer then fires without pause (found by ZN-729.06, whose test unsets it; `agent_apps` and `agent_inspect` pass `ZINC_REALTIME` by hand). Decide what an app inherits.
- ZN-729.08: `info` gives the kernel's architecture, so a 32-bit system on a 64-bit kernel (Pi OS 32-bit on a Pi 4) says `aarch64` and gets an export it cannot run; report the agent's build architecture.
- ZN-729.08: move the fbdev default for a Pi into `zinc export --target rpi*`, so export and deploy agree (today deploy alone sets `ZINC_DISPLAY=fbdev` for a project that names no display).
- ZN-729.08: deploy sends the whole export each run (hero-rpi is 58 MB, not stripped); send only changed files, and strip.
- ZN-729.07: the Linux arm64 package is 42.7 MB against the 40 MB budget of `tools/package`: trim it or raise the budget before a Linux release.
- ZN-729.07: Wayland cannot be built from `third_party/SDL3` (no `wayland-protocols`): a Linux desktop without X11 gets no window.
- ZN-735: RGB565 buffers for the flip while no video picture is shown: the 32 bpp buffers cost 3.5 to 5% of hero's navigation on a Pi 3B+.
- ZN-735: `tools/device shot` reads black while a flipping program runs (`/dev/fb0` is under its plane); read the plane's buffer, or ask the program.
- ZN-737: `h-full` / `w-full` along the main axis grows past its parent in the classic layout (CSS: 100%); fixing it in the core moves pixels and needs the prototype goldens. hero's shell was the case seen (fixed there with `absolute inset-0`).
- ZN-737: a row child with `basis-N` is measured for the offered width, not its basis (scroll range 30 for 170 on a probe).
- ZN-737: the classic layout never shrinks a growing column whose content is wider than its siblings leave (310 px in a 220 px slot).
- ZN-737: scroll areas take no key (Page Down, End, the arrows).
- ZN-729: `zinc deploy --device <paired name>` through the agent, next to the ssh form; `tools/device` (push, run, shot, profile, stacks) moved onto `zinc device` so a board needs no ssh key.
- music (2026-10-15): mbedTLS 4.0's TLS 1.3 client is dropped by api.spotify.com and upload.wikimedia.org after the request (no answer, no alert; OpenSSL's TLS 1.3 works): http.cpp retries once over TLS 1.2. Find the root cause (a local server reproducing it, then a regression test in t0/tls) and remove the retry. hp-touchpad-webos.md section 14.
- music (2026-10-15): headless runs (ZINC_HEADLESS) run tens of thousands of frames a second, so a program waiting on the network needs ZINC_FRAMES of 200000 for a few seconds of wall time; a ZINC_REALTIME that paces headless frames would make scripted captures of networked programs simple.

- display-gl webOS (2026-10-15): the Matériel page full frame is 38 ms on the TouchPad (115 draw calls, 1716 quads, 14 ms of CPU to submit, the rest GPU; ZINC_GL_TIME and ZINC_GL_STATS through /tmp/zinc/env): 24 frames a second at best whatever the CPU clock. Occlusion, fringes and split change nothing; the gain is fewer draw calls (one program for the box kinds) and redrawing only the cards that change.
- zinc:storage: one file for every program on a desktop (~/.zinc/storage.kv): localStorage and AsyncStorage of two apps share it (the
  async-storage plugin prefixes its keys so its clear() stays its own); a store per program (by the project's name or bundle id) is the fix.
- ZN-742: Fast Refresh on QuickJS, through a module transform with Vite-style bindings, so JS programs keep their state too.
- ZN-742: Fast Refresh over `zinc dev --device`, sending the ZBC instead of `reload`, so devices keep their state as the Mac does.
- ZN-742: a parse cache for unchanged files and compiling on a thread, to bring a save under 200 ms.
- JSX (aabbf0fb): a prop that calls a function but reads no signal (`size={buttonIconSize(size)}`) keeps its `_comp` effect alive, one Computation per instance; re-parent the owned effects when nothing was tracked, for ESP32 heaps.
- JSX (aabbf0fb): a prop that reads a signal remounts the component and loses its local state, where Solid updates in place; real getter props need typed records to accept getter objects (Z0103 today).
- ZN-620: zn_app runs AOT programs only; a bundled .zapp (interpreter + ZBC, the player of mobile-core §6) needs zn_vm in zn_app and the zapp reader moved out of zn_tc.
- ZN-618: a press and release between two frames (`adb shell input tap`, a quick finger) is not seen by a program that reads `pointerDown()` once per frame; it should still count as a tap.
- ZN-622: hero needs zinc:video without FFmpeg system libraries before it can be exported to Android (ZN-628).
- ZN-622: Android shows the status and navigation bars; immersive full screen for games belongs with ZN-625.
- ZN-742: `if (import.meta.hot)` blocks are not type-checked by `zinc check` or the LSP (removed before checking outside hot mode); check them in hot mode too, or warn.
- tools/diff-matrix: on `conf:async errors modules features generic_static` gives interp=DIFF (aot ok) on main, seen by ZN-742.01.
- ZN-742.02: compile a save on a thread while frames continue (frames pause 100-450 ms during the in-process compile today).
- ZN-742.02: side-effect-only imports (`import './x'`) are not in the importer graph, so editing such a module does not re-run its importer.
- ZN-742: the in-process red box: keep the paused program and draw the diagnostics over its window, so a typo does not lose the state.
- D123: zinc:video should hold the screen wake lock while it plays, as a browser does: Android apps no longer keep the screen on by default.
- D123: the plugins webos, gsap, async-storage and svg run on Android but their plugin.json targets do not list it, so `zinc lint` warns "not made for this target" (examples/music: 7 warnings).
- ZN-743: the KMS dumb buffer and fbdev could take HalFrame.render_box and draw the damage straight into the scanout buffer, as the Android window buffer does now.
- ZN-746: the software raster at 30 fps on the lava face of a Nexus 7 (11 to 22 fps): the CPU path at a lower resolution, or the smooth stretch on NEON.
- ZN-746: a SHADER under a matrix (setTransform) or inside a rounded clip on the Android GPU layer (the hole is square there); several shader programs per frame at different scales.
- ZN-746: an Android window cannot switch to GL after its first frame: a program that makes its first shader later keeps the CPU path.
- zinc:camera: QR and barcode decoding on the frames (a vendored decoder such as quirc or ZXing-C++ over snapshot()), the common reason a maker app opens a webcam. Face tracking stays out of scope.
- zinc:webrtc: echo cancellation and noise suppression for calls without a headset (WebRTC's AEC3 is part of libwebrtc; speexdsp's AEC is BSD and small): today the call demo keeps the speaker off in its echo mode.
- zinc:webrtc: TURN for a classroom or a workshop: a guide page for coturn (static auth secret, time-limited TURN REST credentials in iceServers), and a test against a local coturn in a container, no Internet.
- zinc:webrtc: events come by polling the native queue every 5 ms; cb_post of native.h from libdatachannel's threads would wake the loop instead, once generated thunks take callbacks, and spare the CPU on QuickJS where a program that does not draw runs its timers on a virtual clock (the poll spins there, and a setTimeout used as a time limit fires early).
- plugins: zig adds DWARF by default, so every plugin's plugin.a and vendor.a carry debug information (webrtc's vendor.a was 35 MB before -g0, miniaudio's 3.2 MB against 0.8 MB); -g0 in the plugin build for all would shrink the prebuilt libraries of the CLI archive.
- package: the CLI archive ships no mbedTLS headers, so zinc:webrtc cannot be rebuilt on a user's machine when its prebuilt key does not match (other options); ship third_party/mbedtls/{include,tf-psa-crypto/include,tf-psa-crypto/drivers/builtin/include} (about 400 KB compressed) or say why it cannot be built.
- Native fidelity: the kit ContextMenu uses menu.popup when menu.native, as MenuBar does (lib/std/kit/menubar.tsx:136) (docs/reports/native-fidelity-and-plugins.md §5).
- zinc bundle: `zinc pack` / `export` of a QuickJS project could ship the minified bundle (or its .qbc, same engine build) instead of the sources, and `zinc dev` on QuickJS could swap modules instead of restarting.
- ZN-623: a launch screen from zinc.json's splash (UILaunchScreen colour and image).
- ZN-624: iOS safe areas: content and the perf panel scroll under the status bar and the Dynamic Island (ZN-625).
- ZN-624: HTTPS root certificates on an iOS device (SecTrust, or a cacert.pem in the bundle).
- ZN-746: the GPU-layer path renders the damage twice even where there is no shader: render the rest once and upload only the changed rectangles (music carousel swipe frames 160-250 ms on the Nexus 7).
- ZN-628: zinc:video on phones (Android AMediaExtractor + AMediaCodec, NV12 converted as the webOS backend does; iOS AVAssetReader in 32BGRA; both behind player.h, about one session each): then examples/hero exports to Android and iOS (plan in the task notes).
- ZN-628: zinc:webview on WKWebView and the Android WebView through the NativeView overlay (ZN-749).
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
- ZN-631: a custom component taking several children through children?: () => i32 rendered a stray "18" in the first Zinc Go home screen: look at the JSX lowering.
- ZN-477: re-aim the Vita's zinc:3d from GLES 2 to our own GXM back end (docs/reports/games/console-2d-3d-frameworks.md: vitaGL is LGPL-3 and needs the user to extract libshacccg; PVR_PSP2 has no licence).
- ZN-754: zinc's model importer caches a bundle by its bytes but keeps the first file's entry name: two identical GLBs under different names give "two entries are named ..." in the pack (examples/marble/assets/blender/build.py works around it).
- ZN-457: zinc run --target psp|vita|ps2|n3ds --emu, wrapping tools/console-run with a prebuilt core per console published like the ESP32 image.
- ZN-754: zinc:audio and zinc:3d have no psp/ps2 target: importing them under those profiles fails with Z0101 '__T7' instead of a "not available on this target" message; a silent audio backend would let games run before console audio arrives.
- ZN-754: the "grid" font of text() draws narrower than textWidth reports from about 96 physical px, so centred titles drift left (both games cap title text at scale 5).
- ZN-754: the asset build packs every file under assets/ (marble's Blender previews and scripts) and has no per-target pick of low/high model variants: consoles need an exclude rule and a variant choice to stay within ~8 MiB.
- ZN-746: the music carousel at 20-30 fps on the Nexus 7 is a full-screen raster every frame (32 ms p50 on four A9 cores: rounded rectangles blended over the screen, glyph sweep); a slide kept as a layer and moved by the compositor or GL would reach 60.
- raster: NEON for draw_dyn (covers with rounded corners compute rr_sdf per pixel: 13 ms of CPU a frame for 57 kpx) and a 16-bit tint path (8 pixels a vector).
- music (2026-10-17): the release APK is 15.4 MB, almost all libmain.so (4.9 MB of code, 9.5 MB of embedded data in .rodata: fonts, icons, resources, Unicode tables), stored uncompressed for mmap (3.9 MB gzipped): subset the fonts to the glyphs a program uses and keep only the icons it names, to halve phone APKs.
- music (2026-10-17): at rest on the clock slide the app uses ~8% CPU on the Nexus 7 (and SurfaceFlinger ~11%), PSS ~62 MB: draw one frame a second when only the clock changes (a program-declared frame rate or damage-driven idle).
- ZN-756: zinc:link across networks through zinc:webrtc, following the plan in docs/plugins/link.md ("Across networks").
- ZN-756: zinc:link's outgoing buffer grows without bound when a peer stops reading: a high-water mark and Channel.bufferedAmount.
- ZN-755: some geocoding names show "?" (Persian and similar letters): the bundled Inter has no glyph for them; a fallback font.
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
- ZN-774.06: Atelier should read a `--json` form of the CLI's output (diagnostics, steps, the plugins table) instead of parsing text, now that the CLI translates its messages.
- ZN-774.16: separate compilation of lib/std (a linkable ZBC per module, or the checked and lowered std kept between compiles), so the first run of a zinc:ui program and each Fast Refresh stop paying about 330 ms for lib/std (a 7-line zinc:ui program compiles in 337 ms); needs generics instantiated per module, inlining after the link and one string and class table built at the link.
- ZN-774.16: a windowed `zinc run` whose native build fails (a Mac without the Command Line Tools) compiles and tries the C++ build at every run before interpreting: remember the failure beside the run cache and start from the cached ZBC.
- ZN-774.14: when a native plugin fails to compile, auto mode falls back to the simulation with only a warning (a broken canvas2d.host.cpp went unnoticed until ZINC_NATIVE=real): a test or `zinc doctor` should report it.
- ZN-774.18: UiNode carries about 30 text-only fields on every node (1,376 B each); a cold text record like `BorderX` would shrink View, Button and Image nodes.
- ZN-774.18: the Solid model has no unstyled Switch, Modal or ActivityIndicator (React Native's core has them; zinc:react-native gives them only in the React model).
- ZN-774.11: on a shallow clone the "English changed" notice is skipped silently (the `source` commit is missing): the Pages workflow needs `fetch-depth: 0`.
- ZN-774: a step and variable view in Atelier with live editing of numbers and colours by dragging in the code (Thonny, Swift Playgrounds; docs/reports/onboarding-benchmark.md): large, the most useful tool for teaching after the lessons with checks.
- ZN-774: one real app grown across the lessons, the changed lines highlighted at each step, its final source in examples/ (Next.js Learn, Expo tutorial).
- ZN-774.18: a text size a program never names in its source falls back to the nearest baked face (a field drawn at 16 px in a 14 px line, selection boxes off the letters): bake on demand or warn.
- ZN-774.18: `zIndex: -1` (and `-z-1`) goes behind its parent's fill on the web DOM (CSS stacking) but stays above it natively; dom.js should make such a parent a stacking context so the two match.
- ZN-774.18: the class `text-transparent` writes colour -1, which zinc:ui reads as inherited, so the text stays visible while `color: 'transparent'` hides it; the class should hide it too.
- ZN-774.18: on the web page a transition ignores the delay and the property list (always `all`, classes and style keys alike) and may run on top of zinc:ui's own frame-by-frame transition; decide which one runs on the web so the timing matches the desktop.
- ZN-774.18: zinc:react-native's Button keeps zinc:ui's 0.6 pressed dim; React Native's Button uses TouchableOpacity (0.2) on iOS and a ripple on Android: give each platform look its own feedback so Button matches the platform it draws.
- ZN-774.18: Pressable takes `style` and `children` functions only as inline arrows; `style={fn}` fails to type-check with an error naming `styleFn`, a name the user never wrote: a union prop type, or a clear error.
- ZN-774.18: a keyboard press (Enter, Space) fires Pressable's onPress but does not set `pressed`, so keyboard users see no pressed style (React Native Web sets it, and adds hovered and focused).
- ZN-774.18: Pressable still lacks hitSlop, pressRetentionOffset, delayLongPress and android_ripple; ported screens that use them lose those behaviours.
- ZN-774.18: SafeAreaView (lib/std/react-native.tsx) pads itself through `pt-[env(safe-area-inset-*)]` classes, so a React Native program that uses it (zinc-go, rn-showcase) still compiles in the class parser, about 11 % of its code; padding from the safe-area signal as style keys removes it.
- ZN-774.19: a lazy Canvas holding a stage (`style={{ lazy: 1 }}`) is not repainted when the scene changes; `Stage.drawIn` asking zinc:ui for a repaint when the scene is dirty would let an idle scene inside an interface cost nothing on old tablets (today the Canvas paints every frame).
- pi-image: the Linux SDL window should try GLES 2 when OpenGL 3.2 core fails (a Pi offers GL 2.1/GLES 2 on vc4, 3.1 on v3d) and its fallback must not panic (`Parameter 'props' is invalid`, hal_sdl.cpp; `No available video device` for a program the agent starts): today the image sends every app to display-fbdev.
- pi-image: display-fbdev should take the KMS plane back, and redraw whole, when the program that held it leaves: the image's session kills its player to hand the screen to a program of `zinc dev --device` (a plain exit copies the player's last frame into /dev/fb0, over the program's).
- pi-image: display-fbdev text from a physical keyboard and a drawn mouse cursor: the Pi image's player navigates with the keys but types only on its on-screen keyboard, and HDMI with a mouse shows no pointer.
- pi-image: the engine says READY=1 to systemd after its first frame (sd_notify), instead of zinc-session's 2 s guess, so the units that wait for the session start as soon as the screen shows.

- zinc:lvgl without mquickjs, on an AOT ESP32 firmware (owner 2026-10-22: keep both paths): docs/reports/esp32-aot-lvgl.md lists the eight pieces; the AOT ESP32 target itself does not exist yet (docs/reports/zinc-next-esp32-aot.md).
- ESP32 mquickjs: a hang in C (a plugin's native loop) is still silent; the JavaScript one is stopped after 10 s. The task watchdog on the main task, with a panic and released while the update server writes the flash (zn_pause), would turn it into a crash the next start tells.
- ZN-790: QuickJS's `zinc:platform` has no `TOUCH` export, so examples/pinball and n3ds-pinball do not run with `--engine quickjs`.
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
- ZN-790: `zinc pack`/`zinc check` say so when zinc.json's `assets` is a string or points outside the project: n3ds-pinball's `"assets": "../hardware-n3ds/assets"` was dropped silently and the ball was missing on the 3DS.

- ZN-477: `vita-elf-create` fails with "Cannot allocate N bytes for SCE data at end of segment 0; segment 1 overlaps" when the text segment ends less than ~2.7 KiB before a 4 KiB page (seen on a gl-check core, 2026-10-25): any program size can hit it. Reserve the room in vita.cmake (a second link with padding, or a linker script) instead of luck.

- ZN-820: show SVG app icons in the player's tiles (zinc:svg) and pack app.icon for JavaScript-engine projects; today they fall back to the default glyph.
- ZN-821: `zinc device bench` on a machine like this one installs the suite as a .zapp (interpreter), so its numbers do not compare with `zbench run mac` (AOT); a --target or AOT option for the agent device would make them comparable.
- ZN-821: when 9229 is taken, `zinc dev --device` prints the forward's "cannot listen on port 9229" before falling back; probe the port quietly first.
- ZN-823: tools/linux-sysroot fails on an existing sysroot without a stamp (copytree raises "File exists" on symlinks): replace existing links, so a second run or a hand-filled sysroot works.
- ZN-823: plugins/camera's Linux source does not compile with zig for aarch64 (stb_image.h typedef redefinition): fix the double include, else a Pi fails the same way.
- ZN-823: the plugin stamp does not list prebuilt/<target>/key among its inputs: a changed key is not seen until plugin.so changes.
- ZN-823: zinc:loro (cargo) is not cross-built, so a Pi still compiles it with Rust at first use.
- Pi updates (docs/reports/pi-updates-design.md): the Pi release assets come from the linux-cross job, which may fail; it should fail the release for aarch64 and armhf.
- Pi updates: the update catalog uses the unauthenticated GitHub API (60 requests per hour per IP), which a classroom behind one network will hit.
- reMarkable bridge (docs/reports/remarkable-bridge-design.md): re-measure qtfb with AppLoad >= 0.6.0 on the Paper Pro; its partial-update bug (fixed in PR #55) may explain the 125 ms paints.
- ZN-833: run tablet plan T5/T6 (10 lease cycles in the budget; app SIGKILL, hang, power press, systemctl stop zinc-lease, 2-minute RuntimeMaxSec) and log stop->inactive, start->active and NRestarts in zinc-next-perf.md.
- ZN-833: check on the tablet that stock xochitl reports StartLimitIntervalUSec=10min and WatchdogUSec=1min (the lease refuses any other text); rows for the Move and the Pure.
- ZN-833: build lease with zig for aarch64-musl and run lease status on the tablet (cross-platform pass).
- ZN-833: zinc.json display.lease_max for the dead-man time instead of the fixed 30 minutes.
- ZN-833: ink session tries the in-process lane first and re-execs through lease launch (design §7) instead of pointing the manifest at lease.
- ZN-833: five-finger tap escape in the lease supervisor (design §3.3); only the power long press is handled.
- ZN-833: zinc deploy --target rmpp copies to ~/<name> and runs run.sh; make it run the exported deploy.sh (AppLoad directory).
- ZN-834: the in-xochitl ink lane cannot find the engine on OS 3.27.3.0 (linked into the stripped xochitl, libqsgepaper not mapped; remarkable-bridge-design §11): research per-OS addresses in /usr/bin/xochitl (rm2fb, qt-resource-rebuilder hashtable) before any new tablet test; until then L2 (lease + Quill) is the fast ink.
- ZN-834: on the tablet, T2-T4 of remarkable-bridge-design §9: one xovi/start and lane ready in the journal, camera latency, the colour settle (else the full-update flag on the box).
- ZN-834: on failure the lane repaints the item but requests no full refresh; needs AppLoad's full-refresh function or the vendor full-update flag value.
- ZN-839: measure zinc-canvas on the Paper Pro, OS 3.29 (camera pen-to-glass vs xochitl, the colour settle, whether our Pen ScreenModeItem wins over AppLoad's UI one) and log the numbers in zinc-next-perf.md.
- ZN-839: if the canvas item's first transparent full paint refreshes the screen on the tablet, create the item at the first StrokeBegin instead of at Hello.
- ZN-839: on 2026-10-28 (OS 3.29) zinc-canvas loaded cleanly, no app said Hello, yet ~20 min later AppLoad windows stopped reaching the panel (Hub launched and repainted, LCDIF count frozen); removing it and one xochitl restart fixed it. Unproven cause (one sample; only the socket server and documents() ran): retry with documents() off before anything else, and keep it off the tablet until then.
- ZN-839: the zinc-ink lane has no 3.29 row (libqsgepaper 07aa9327..., abi 328); retire the lane if the canvas proves enough.
- ZN-839: reopen uses "last opened" for "open now"; check on 3.29 that a lease started from the home screen does not reopen a document unexpectedly.
- ZN-839: on the tablet the canvas was worse than plain qtfb ufast (UI mode at 8 Hz, a UI-waveform repaint at every pen-up: flashes everywhere). Keep qtfb in ufast while the canvas inks, and settle with Pen/Mono instead of UI, then measure again; else retire the canvas and make ink: native mean qtfb ufast.
- ZN-842: a per-server body-size option in zinc:net; 64 MiB times 32 connections is the memory ceiling on a Pi or a reMarkable.
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
- ZN-844: `finally` is skipped after `return await` in an async function (interpreter and native): a cleanup in a `finally` never runs; found in app/web-relay, reproduced in 5 lines.
- ZN-844: a `zinc:net` Reply needs a bytes body (like `RequestInit.bodyBytes`): binary replies go through a temporary file today (web relay PNGs, hub `.zapp`).
- ZN-844: web relay: dither to the Paper Pro's colour e-ink palette (Floyd–Steinberg on the PNG) and measure whether it reads better than plain grey.
- ZN-844: web reader: forms and JavaScript clicks (only `<a href>` is followed today); send a tap to the relay as a CDP mouse event.
- ZN-844: web reader: draw only the new pen segment instead of redrawing every stroke each frame, to cut pen latency on pages with many strokes.
- ZN-844: the web dashboard stops while the tablet sleeps: render once on wake-up, or keep a wake lock while it is shown, so a wall dashboard stays current.
- ZN-844: the web dashboard's widget halves the full-page picture; a relay `/shot` at zoom 0.5 would give sharper text if it reads soft on the panel.
- ZN-844: desktop packages (macOS, Linux `tools/package`) do not ship libpdfium, so `zinc:pdf` there needs `plugins/pdf/vendor/fetch`; ship `vendor/pdfium/<platform>` in `share/zinc` for PDF reading from an install.
- ZN-844: Zinc PDF: text search (FPDFText) and thumbnails in the library.
- ZN-844: an italic face (Inter Italic) for `*emphasis*` in Zinc Read and in the gfx fonts.
- ZN-844: key iteration on parsed JSON (`Object.keys`), so a Notion page title is found under any property name (Zinc Read reads `title` or `Name` only).
- ZN-844: Zinc Read: download Notion images into the library during sync (Notion's file links expire after an hour), so pictures read offline.
- ZN-844: a web or wasm build of `zinc:markdown`, and move `lib/std/markdown.ts` (the hand-written subset the chat uses) onto md4c.
- ZN-844: the iOS export's SVG icon goes through the fill-only `res::rasterizeSvg`: stroked icons (Lucide) come out as filled blobs; render it with nanosvg as `appIconPng()` of `src/cli_core.cpp` does.
- ZN-834: pluginOptions drops zinc.json display options when ZINC_DISPLAY is set; apply them when the env names the same driver, then rmpp_sim.sh uses display.ink.
- ZN-835: Move and Paper Pure vendor rows (hash, swap ABI), evdev ranges and xochitl unit limits, read on a tablet.
- ZN-835 (cross-platform pass): armv7 export for the rM2 (-mcpu=cortex-a7) and the rm2fb client against a real rm2fb server.
- tokyo: zinc:3d on the Vita and 3DS: a render target made after textures filled GPU memory fails silently (nothing drawn): report it or reserve targets first.
- tokyo: zinc:assets `readBytes` is one host call per byte: a bulk read for every program (zinc:3d bypasses it now).
- tokyo: zinc:3d's software fog ignores `material.fog` and fogs blended pixels by depth.
- tokyo: a .zapp carries the raw assets beside the imported ones (size).
- ZN-480: the native call path costs about 12 us a call on the PSP (rtcalls nativeCall parses the signature and builds two std::deque per call, stubs.cpp finds the export by strcmp, the thunk copies every array in and out). Caching the signature and the export alone gave nothing measurable in PPSSPP (5.91 vs 6.16 ms, 2026-10-25): the array copies of the thunk are left to try, measured on a real PSP.
- ZN-480: tools/console-run vita keeps only the first line of a multi-line printf chunk from Vita3K's log (examples/lang prints nothing through it; its text is in the log).

- IR: "field access on a non-ref" inside an object-literal method: `const w = world(id); if (w !== null && k >= 0 && k < w.chunks.length) { w.chunks[k].loaded = false; w.chunks[k].b.length = 0; }`; render3d.sim.ts works around it with early returns.
- zinc pack: a plugin whose native build fails still falls back to its stand-in with only a warning; auto mode should fail loudly.
- zinc pack: under a console profile it hardcodes the Render3D and Physics2D modules; the list should come from the console core.
- zinc:3d: the consoles check the x/z uv fit of Top grounds over a whole batch, so two Top grounds with different uv lines in one mid or far chunk fall back (PSP keeps uvs, 3DS draws a wall); fit per cell.
- zinc:3d: render3d.sim.ts has no sectors and no slots.
- zinc:3d: World.select keeps interpreted overhead around it (mat4LookAt) on the consoles.
- zinc pack: when zinc.json `app.icon` is itself `icon.png`, the 150 px launcher tile overwrites the project's own file in the .zapp (docs/zapp.md says the file is also packed at its own path); name the tile apart or keep the original, since a program that loads its icon at runtime gets the tile.
- Sidecar: the stream (stream.h: hello with caps, RECT/COPY/POINTER/SET, the tablet's ACK/INPUT/PROFILE) is not tied to the reMarkable; a receiver for any screen on Wi-Fi or Ethernet (Pi + IT8951 7.8", an old Kindle or Kobo, an ESP32 e-paper, a TouchPad) is a new HAL behind the same serve loop, and the Mac picks depth, size and lz4 from the hello. Write the wire as docs/sidecar-protocol.md first; over Wi-Fi it needs a pairing key and the Mac to find receivers (mDNS). docs/reports/pi-sidecar-receiver-research.md.
- Sidecar over USB to a Linux screen: an Apple Silicon Mac's USB-C port shows itself to a Linux host as CDC NCM (05ac:1902 "MacBook Pro", two NCM functions, no notification endpoint), and Linux's cdc_ncm refuses it ("bind() failure": FLAG_LINK_INTR wants a status endpoint; only iPhone and iPad ids get apple_private_interface_info). A cdc_ncm table entry (or a rule for Apple NCM without status endpoint) in the Pi image's kernel, upstreamed, makes the Mac a network card on the cable. Done in the Pi image as a rebuilt module (image/files/usr/lib/zinc/zinc-mac-usb, measured 245 Mbit/s TCP, 2 ms on a Pi 3B+); left: send the cdc_ncm entry upstream (linux-usb) so no module is built, and DKMS so a kernel update rebuilds it.
- Sidecar's Mac receiver (app/sidecar/mac/receiver.swift) is Swift beside the engine: a Zinc app on macOS would need a display driver that serves stream.h (stream.listen) and shows hardware layers (HalDisplay.layers with a VideoToolbox picture), as display-fbdev does on the Pi. Then the same app/sidecar-screen runs on a Pi, a Mac and later Windows.
- Sidecar on a Pi 3B+: the H.264 decoder takes 25 ms a 1080p picture at gpu_freq=300 (tools/v4l2dec-probe.cpp); gpu_freq=450 with over_voltage=2 in the Pi image's config.txt should cut it to ~17 ms, to measure with a good power supply (the rig reports under-voltage) before the image takes it. And a 25 or 24 fps film on a 60 Hz HDMI screen shows each picture 2 or 3 refreshes: switching the mode to 50 Hz (or 48) while a VIDEO region plays at that rate, as Kodi does, removes the judder (some TVs blank 1-2 s).

- JSON.parse: a Table's keys, values and dead flags in one block (6 allocations per JSON object today), toward 3x faster than 2026-10-29 (it is 2x now).
- mimalloc: MI_TLS_SLOT on macOS without MI_MALLOC_OVERRIDE (_tlv_get_addr is ~5% of allocation-heavy work).

- QuickJS: do the checked copy where `any` meets a typed target (D179: drop undeclared properties, TypeError on a wrong type), so JSON.parse into an interface agrees with the interpreter and AOT; the QuickJS transform needs the checker's conversion sites.
- zinc:system/media on the web target: forward to navigator.mediaSession in plugins/system/web/system.js; accept http(s) artwork URLs.
- Z5006's lists of system features (include/zn/diagnostics.h, i18n/*/diag.json, docs/diagnostics.md) miss share, update and media: build them from systemFeatures().
- zinc:fs has no appendBytes nor a write at an offset: the iPod demo's jukebox source joins its Range slices in memory (2.3 s per 40 MB on the interpreter).
- Checker: Z0005 for an await in a nested ternary branch (`c ? await a() : d ? await a() : []`); Z0103 for `.then` returning a Promise (no flattening to Promise<T>).
- threads (D181): an interpreter back-edge interrupt check so Worker.terminate() stops a busy worker at once (measure with bench-gate first); share a module's fusedCode and string constants across its workers' Machines if the Pi's RSS asks for it; SharedArrayBuffer and Atomics only when a user needs them; Map as a sendable type (sent as pairs).
- `.then` callbacks returning `T | Promise<T>`, or then(f, g) with only one returning a promise, are not flattened; the adoption takes one microtask where Node takes two.
- `new Set('abc')` and `new Map(generator)` are not supported (arrays and same-kind collections are).
- The ir and zbc goldens of `exceptions` (__log47 vs __log48) and lint's rules.expect (ProgressRing's svg import) are stale on develop.
- Async functions: a loop whose awaits complete at once (no real suspension) recurses instead of looping; a trampoline in desugar.cpp loop() would keep the stack flat for long sliced work.
- Checker: `.then(async () => ...)` on a `Promise<void>` gives Z0103 (the async callback's Promise is not flattened).
- Checker: destructuring in a `for (const [k, v] of ...)` whose body awaits gives Z0005.
- Set and Map are not iterable directly in `for (const x of set)` as the slicing agent of the iPod demo met it (it went through Array.from): check and fix on every engine.
- Workers (D183): QuickJS workers need one JSRuntime per thread (gMapFile, gTraceName, napi per thread) and a record codec in JS; then the untyped `Worker` for JS libraries.
- Workers: plugins with `"worker": true` (a per-thread native registry and per-thread zn_native_poll queues); zero-copy transfer of `u8[]`; an inline mode for profiles without threads; `addEventListener('message')` and a global `onmessage`; a worker's console lines in the inspector's Console.
- Workers: measure the cost of thread_local gAllocs/gFrees with tools/bench-gate on a quiet machine; re-run busy_spinner and busy_worker alone (measured at load 25-58).
- `zbc_test` is not built by `tools/build zinc`.
- Build speed (D184), the largest win left: stable C++ units after an edit. Adding one element to hero renumbers classes, strings and functions, so all 37 units recompile (13-25 s); keep the previous numbering (hot mode's Module::key) or emit table indexes as link-time constants, for 1-3 units (~3 s) per edit.
- Build speed: build the plugins a project imports concurrently with each other and with the frontend (ipod cold 75 s toward ~30 s, sqlite3.c's 20 s the floor); the baked resources (~1.4 MB) in their own unit keyed by content, not in unit 0 (~1 s per rebuild).
- Build speed: profile the frontend's single-threaded phases on ipod (parse 1.1 s, optimise 0.65 s, rc 0.38 s; std::map<std::string> lookups, isSubtype) and QuickJS's warm 'prepare' (0.3 s with every cache hit).
- Build speed (owner's call, changes D43): run a stale native program on the interpreter at once while its native build continues in the background for the next run (hero edit-and-run ~1.5 s instead of 13-25 s).
- Inspector (ZN-373): Network initiator file:line (needs per-call-site line tables in the interpreter and AOT); the console line at the Runtime.enable replay boundary shows twice; `zinc debug` does not set ZINC_DEV (no component names); component names on --engine quickjs untested; DOMStorage polls every 500 ms instead of a zinc:storage hook; class completion is a generated list, not the style engine's tables; no image request in the Network fixture.
- UI fonts: no glyph fallback, so ▾▸↑↓ show as "?" in the UI font (the inspector uses + - >> << for now).
- Headless runs: ZINC_REALTIME does not pace frames, so ZINC_FRAMES is not a duration for screenshot tooling.
- Threads debugger (D185): `zinc debug` (command line) and `--dap` do not stop in workers yet (DAP could show each worker as a thread); the Inspector's Sources view does not open worker sessions yet (the protocol is there); a worker paused in the debugger keeps the main program from ending (resume or detach it at shutdown).
- Threads profiler: in `zinc profile --trace`, sampled slices can overlap a worker's onmessage span edges by one sample period, and worker tracks get their name event twice.
- Render thread, once it lands: record zn_frame_trace stages as a "zinc render" track at the hook point in runtime/gfx.cpp trace_json.
- Types-only modules (D188): `import type` of a function, or a const used through `typeof`, from a module no value import loads is refused (needs ambient function and variable declarations in the types view); a types-only class drops an untyped field whose initializer is not a literal.
- Covariant arrays (D188) copy instead of sharing: true aliasing (`Dog[]` as `Animal[]`) needs an array reference cast in the IR and AOT; `T[] | null` covariance is not handled yet.
- Checker: Z0005 "async function without a Promise<T> return type" for async arrow functions and object-literal methods without an annotation (photo-sorter and trieur stop on it, now that their circular-import error is gone).
- i18n: the German Z5012 and Z5013 entries are missing from i18n/de/diag.json.
## Demos
- D178: ipod-web's `/api/devices` gives the volume name, not the iPod's (the master playlist's), so the Mac app shows "ZINCPOD" for a remote iPod; `/api/add` takes no media kind (a podcast added remotely keeps the file's tags); photos and notes are not served.
- D178: ipod-web streams uploads to disk instead of holding the whole body in memory (`req.rawBody`), so a Pi with little RAM takes large files from the page.
- D178: ipod-web's management page on a Raspberry Pi with thousands of songs (paging, search speed, lazy covers) and in phone browsers; one more Chrome step for a real drag and drop and for eject from the page.
- D178: ipod-web honours `size` for covers (scale or a cache per size), and a test of `/api/eject` on a fake disk image; the Subsonic methods getArtist, getSong, getPlaylist, search2, getAlbumList, getUser, getStarred and scrobble have no test yet.
- ZN-857: the iPod demo's album grid should take its column count from the window width (fixed at 4 now); a wider window wastes space.
- ZN-857: the Optimise page could offer one-click fixes for its other findings (fill missing tags or covers from a duplicate or online, delete empty playlists).
- ZN-857: `ZINC_NATIVE=sim` with `--engine quickjs` does not use a plugin's stand-in (the iPod demo stops on "/Volumes/ZINCPOD does not exist"); make QuickJS load `native/<name>.sim.ts` as the other engines do.
- examples/carnet-nbe: run against Carnet's own repository (link.sh's default) once the frontend reads a generic method with a default type parameter, a computed key with a rest element in a destructuring, and an inline `type` in an export list; until then node_modules/@nbe points at a patched copy (.nbe-dev, ignored by git).
- examples/carnet-nbe: what Obsidian has that the vault does not yet: a completion list after `[[`, renaming and deleting a folder, inline formatting (bold, code), and code fences (Carnet's blocks-code plugin is not linked: a fence reads as a paragraph).

- ZN-649.14: a rule of a pinball table can listen to the plunger, so a skill shot needs no hidden sensor.
- ZN-650.10: the museum editor offers `accessibility.descriptions` and plays a description.
- ZN-650.10: at the two larger text sizes the button rows lie over the lowest cards; lay the table out above them.
- ZN-650.10: zinc:audio decodes nothing in a deterministic run, so a test cannot read a sound log there.
- ZN-650.08: zinc:video has no sound; a film with a sound track needs audio played in step.
- ZN-650.08: film decoders are never closed (16 at most).
- ZN-650.08: zinc:assets gives no path, so a film is copied to the temp directory at first play.
- ZN-650.08: the museum editor does not play a film or offer poster, loop and subtitles.
- ZN-650.08: museum_visit (62 s) and museum_editor (123 s) still last over a minute.
- ZN-650.12: the staff summary shows today only (week, month); a packaged table needs a default statistics directory; a visit under way at switch-off is not counted.
- ZN-650.13: storyboard miniatures ignore item rotation, and `table.visitors` is read and unused.
- ZN-650.13: the attract loop loads the model and the panorama a second time; share mesh and texture.
- ZN-650.13: a scripted drag on the panorama from a short side.
- ZN-649.14: narrow a rule's `event` by its `on` (and multiball's `jackpotOn`/`jackpotEvent`); it changes every session that chooses an event.
- ZN-649.14: a deletion could hand the rules to another thing of the same kind; a list `do` on a mission; lights or elements chosen by a click on the top view; a renamed counter is not renamed in the rules that use it; the scores grid needs a horizontal scroll under 1440 wide.
- ZN-649.17: a table or package dropped on the window could join the list (zinc:system `drop`); free the scene and sounds of the table that leaves.
- ZN-649.18: a clip to a path in zinc:gfx (raster and GL), after which `drawInside` in topview.tsx goes; a visible handle for the field of view.
- ZN-649.16: keep the editor's mirror axis and view with the table folder; today they are recomputed at each open.
- ZN-649.16: remove the Latin characters constant (`widgets.tsx` DRAWN) by loading the font at run time (ZN-669).
- ZN-649.16: Save as and Open a package have no button (a button changes every golden frame of the top bar); the file-dialog path and the refusal of entry names that leave the folder (`..`, absolute) have no test.
- ZN-649.06: measure what `assets.writePack` (zstd compressor) adds to an AOT binary; move the rows behind a plugin if it is large.
- ZN-649.06: a package among the game's assets is copied to a temporary file to be mounted; mount from bytes would avoid it.
- ZN-650.14: `gfx.loadFont` on a missing asset file leaves its fs error pending and the next zinc:assets call throws it; fix in `zn_asset_font`.
- ZN-650.14: the editor's problems panel does not report a theme font or logo file that left the folder.
- ZN-650.07.06: the refusal of a default language shows the loader's field path (`media[1].title.en`); say it in the author's words.
- ZN-650.07.06: measure `museum_editor_views` (93 s under load) on a quiet machine and cut it again if over a minute.
- ZN-711: no installer or release download: the first step is a 6 to 8 minute source build with CMake and a C++20 compiler.
- ZN-711: open `zinc new game x && zinc run` and `zinc dev` in a window once by hand (only run headless).
- ZN-650.07.04: subtitle cues or a waveform on the narration's bar and a film preview in the medium's panel, so an author times items against what is said.
- ZN-650.07.04: `lengthOf` keeps a replaced file's first length until the editor restarts; look at the file's date.
- ZN-650.07.04: a French frame of the narration and film panels in `museum_editor_views` when that test is next touched.
- ZN-712: `zinc run --engine quickjs` ignores the window size of zinc.json, so the JS examples open at 320x240.
- ZN-712: a JS project cannot name its engine in zinc.json, so `zinc run <dir>` without `--engine quickjs` fails with a compile error.
- ZN-712: importmap.json maps exact names only; a prefix such as `three/addons/` fails, so each addon needs its line.
- ZN-712: ZINC_INPUT has no key release, so a scripted key stays down in the web environment.
- ZN-712: js-p5 (144 lit boxes) measured alone on the M1 Pro, 2026-10-12: 17 ms of script a frame on QuickJS, 40 fps on a 120 Hz display; the engine is the bound (D110, ZN-723). The canvas goes to the window through a read and an upload (1.7 ms at 1600 x 1000): draw a full-window WebGL canvas straight into the window.
- ZN-712: when ZN-570 lands, add Text to js-pixi and js-phaser and a 2D sketch to js-p5; when ZN-573 lands, listen to js-phaser's sounds and tick criterion 2.
- ZN-712: the figures of anatomy-figures 0.1.0 (MIT, npm; each has a framework-free `element/<name>` entry with `render(host)`) as a JS demo without a webview: Canvas 2D already paints their paths (watch 859, turbofan 4,149, taken from the markup); what is missing is an SVG scene in the web environment (innerHTML of SVG, the figure's stylesheet with attribute selectors and `var()`, `use`, gradients, clipPath, mask, hit test, shadow root) painted from the tree each frame; a full repaint at 900x810 took 48 ms (watch) and 73 ms (turbofan) under a load of 8 on 2026-10-12, bound by the painted area, so the parts that do not move need a cached layer.
- ZN-570: showing a 2D canvas reads the whole bitmap back every frame (1.7 ms at 640 x 480); a dirty flag in `canvas2d.cpp` would skip unchanged frames.
- ZN-570: a 640 x 480 fill costs 4 to 5 ms in canvas_ity (float RGBA, one thread); measure a full-screen p5 sketch before ZN-571 decides.
- ZN-570: `drawImage` is always bicubic; pixel-art games need nearest-neighbour when `imageSmoothingEnabled` is false.
- ZN-570: no `Path2D`, no italic or bold synthesis, no bold monospaced face, no `toDataURL` (ZN-572).
- ZN-570: the js-pixi, js-phaser and js-p5 examples can now use Text and a p5 2D sketch.
- ZN-574: embed SDL_GameControllerDB (Zlib) in the window host; today an unknown pad is not seen.
- ZN-574: read gamepads in display-gl's own event loop (`plugins/display-gl/src/sdl.cpp`); a program on that driver sees none.
- ZN-574: Kaplay's `onGamepadButtonPress` (criterion 1) needs Kaplay in `tools/test-lib`.
- ZN-650.07.05: check the museum editor's menu bar, context menus, key equivalents and drag and drop on a real macOS window; give Undo/Copy/Paste their keys in the menu once zinc:system edit roles reach text fields.
- ZN-650.07.05: ZINC_SYSTEM_SCRIPT counts loop passes, not frames (2 per frame, late once: `museum_editor_tools` failed once in eight runs); give it frame numbers like ZINC_INPUT.
- ZN-650.07.05: ZINC_INPUT "down" takes no modifier: Shift-click selection of the museum editor is not scripted.
- ZN-650.07.05: museum editor: drag a multi-selection together, a rubber band on the table, enabled/disabled menu items, copying a medium's file when pasting into a project in another folder.
- ZN-719: js-phaser opens at 320x240, its game size, small on a desktop; try a `zoom` in its zinc.json without moving the golden.
- ZN-719: a zinc.json with only `app.window` (no other `app` key) was answered "no project here" by `zinc run`; seen once, not investigated.
- ZN-650.14: a museum project opened by a relative path shows only the font families in the editor's sample; make the folder path absolute.
- ZN-650.14: the font refusal is proven interpreted only (same host code compiled); the fs-scope (`user-picked`) path for fonts is not tested.
- ZN-712: a webenv.js that calls a host function missing from an older binary dies on the first frame; test for the function before using it.
- ZN-572: a direct loop for an unrotated `drawImage`; a sprite still goes through `paint_pixel` and the general blend for each pixel (Phaser CANVAS is 4.5 times its floor).
- ZN-572: Phaser's canvas renderer builds an Error (stack) every frame, seen in the sample, source not found.
- ZN-571: take the p5 and Phaser CANVAS frame times again on a quiet machine, and p5 2.3 once `tools/test-lib` has it.
- ZN-716: one `zinc:osc`: the plugin (`zinc:osc/full`) takes over the built-in of ZN-085 (compat `send`/`listen`/`close`, `src/host/osc.cpp` and its three host rows removed); two modules for one protocol confuse a first user.
- ZN-716: `zinc:osc/full` (OSC over TCP/SLIP) on QuickJS, not checked since `zinc:socket` runs there (examples/carnet-nbe, 2026-10-21).
- ZN-717: ports on the libuv loop instead of the 5 ms timer if the wake-ups show in resmon.
- ZN-715: a `zinc:audio` tone in `examples/midi` so a first run is heard.
- ZN-573: a web program that makes sound builds plugins/audio at its first run (the QuickJS engine has no stand-in for a native module); without a compiler it prints one line and stays silent: first-run experience.
- ZN-573: OscillatorNode is silent, loopStart/loopEnd are not read, suspend() mutes without pausing, the audio element decodes whole files (no streaming): what ZzFX-style synths, Howler sprites and long music need.
- ZN-573: ZINC_AUDIO_LOG prints one peak for both channels (pan cannot be proven); a sound-only script opens a window (the web audio clock needs frames).
- ZN-573: listen to `zinc run examples/js-phaser` on Core Audio; Howler and Kaplay through `tools/test-lib`.
- ZN-718: a project that sets a plugin's options misses the prebuilt key and the install has no C++ for it: ship every plugin's sources or use the index.
- ZN-718: `zinc:webview` does not compile on macOS, in the tree either (`operator new` redefined via `zrt.h`); display-st7789 does not link with zig; imu-qmi8658 and script have no thunk.
- ZN-718: `zinc doctor` prints 35 plugin lines in a source build: shorten; `zinc update` downloads but does not install: reuse `install.sh`'s swap.
- ZN-718: the plugin libraries travel inside the archive (27 MB), not through the signed index, which does not exist yet and needs the owner's keys; decide at the review whether criterion 2 is accepted as it stands.
- ZN-718: five plugins have no prebuilt in the archive: video (FFmpeg), webview (SDL3) and gphoto2 need system libraries; imu-qmi8658 and script have no thunk. The museum table's films therefore need FFmpeg installed on the visitor's machine.
- ZN-572: web environment: a script element added right after Phaser runs between the two data: pictures of Phaser's blend-mode probe, so a CANVAS game draws MULTIPLY and SCREEN source-over; settle picture loads before the next script element runs.
- ZN-572: the direct drawImage loop converts a row of the picture to float colours for every row drawn (half the time with the nearest pixel); keep converted pictures by stamp, or blend from bytes.
- ZN-572: a pattern under a scale is filtered over 16 pixels where Chrome takes 4; CanvasPattern.setTransform does nothing; the CSS filter subset; a shadow under a blend mode is not blended; a sprite under a blend mode or a clip takes the general loop.
- ZN-572: p5 2.3 through `tools/test-lib`; the WPT subset (criterion 1); every number on a quiet machine.
- ZN-713: profile launch to first frame of the exported app (about 0.5 s under load); retake every time and memory figure alone on the machine (`ZINC=<main>/build/zinc ./measure.sh build measure` in `bench/vs-electron`); report physical footprint beside the RSS sum.
- ZN-203: webgl_conformance: glsl/bugs/sampler-struct-function-arg.html and sampler-array-struct-function-arg.html report PASS, then zinc aborts (SIGABRT, exit 134) while the QuickJS run ends; reproduce with `WGC_BUNDLE=/tmp/w.js python3 tools/webgl-conformance <page>`, then `zinc run /tmp/w.js --engine quickjs`; on the runner misc/uninitialized-test.html also fails (non-zero bytes in an uninitialised buffer).
- ZN-: getUserMedia never asks for the camera (unlike a browser): on a Mac where access was never given it fails with NotAllowedError; it should call requestPermission first.
- ZN-: zinc:ui layout: a `w-full max-w-[440px]` child of an `items-center` parent is placed left, not centred (CSS and Yoga centre it).
- ZN-: JSX lowering prints `{helper(p.children)}` as text unless the helper is named `render*` or returns JSX directly; content silently disappears.
- ZN-: webcam demo: photos taken in the same second get a `-2` suffix that sorts before the first name, so the strip order is off after a restart.
- music: deliver the Spotify login to an Android device without root (adb push to Android/data/<id>/files, read by zinc:spotify as a fallback, or an in-app PKCE login with the device's browser and the 127.0.0.1:8765 redirect): today the Nexus 7 got it through su.
- ZN-758: mute from the tablet (`{t:"mute", app|domain}` on a long press) is not built; the Mac side applies it already.
- ZN-758: no way to forget a paired Mac on the tablet (`link.forget`); the header names only the last Mac that said hello.
- ZN-758: StandBy over the lava face has 183-226 ms p99 frame intervals on the Nexus 7 (first use of the large glyph sizes plus the full-screen veil blend): pre-warm the fonts or a cheaper veil.
- ZN-758: the notification list rows could show the sender's avatar for messages.
- ZN-757: avatars from WhatsApp's own cache (group.net.whatsapp.WhatsApp.shared/Media/Profile + ChatStorage) are not built.
- ZN-757: the banner-capture avatar source (Accessibility + ScreenCaptureKit, off by default) and its assistant step are not built.
- ZN-757: check real Chrome, Firefox, Safari web notifications and real Messages/WhatsApp records with `zinc run examples/notify-relay -- --inspect 30` once Full Disk Access is granted; whether a scheduled Focus writes an assertion is unverified.
- ZN-791: smooth the other players' movement in Paint Arena between the 20 Hz snapshots.

- tokyo: `ZINC_3D=software` on the desktop falls back to `render3d.sim.ts`, which no longer type-checks (`??` on `number`, typed arrays passed as number[] at plugins/3d/index.ts:78); the software fallback is broken.
- tokyo: the Vita at a 2000 m mid reach did not finish in Vita3K under load; measure on a quiet Mac whether it is memory (more mid chunks resident).
- tokyo: the first frame after loading takes 26 to 62 ms on the consoles (269 ms on the Mac); warm it up behind the loading screen.
- tokyo: the World selection costs 3.9 ms a frame on the PSP and 5.1 on the 3DS; sort ranges incrementally or select every other frame on the handhelds.

- tokyo PSP: CLUT8 pictures with day and night palettes mixed by the hour (Pocket P4); needs `worldNight(id, amount)` as a number; a smooth dusk and a quarter of the texture memory.
- tokyo PSP: shadows from the height-grid sweep in bit 7 of the ground indices and the palettes' upper half (Pocket P4/C5), the last visible gap after the near level.
- zinc:3d PSP: ordinary draws after a World in the same frame use the full depth range, not the World's split ranges; give them the far range if a scene mixes both.
- zinc:3d select: per-sector ranges cost 0.4 ms of selection on the PSP; a cheaper facing() (four atan2f per cell) wins it back.
- zinc:3d PSP: the pre-World-GE PSP renderer crashed PPSSPP on tokyo from a fresh build dir; check memory (72 bytes a vertex) if the old path is ever used again.

- tokyo 3DS: stream the near level (`c*.near.zwc`, 15 MB) from the SD card or romfs like Pocket's 40 slots: embedded beside the 12.7 MB pack it does not fit an Old 3DS's 64 MB; needs the console core's pack reader to read from the card.
- zinc pack: in auto mode tokyo's pack falls back to `plugins/3d/native/render3d.sim.ts`, which no longer compiles (`??` on a number, meshCreate array types); fix the sim or why auto skips the native plugin (`ZINC_NATIVE=real` works).
- tokyo 3DS: selection is still 3.6 ms in Azahar (cells 1.8, ranges 0.8, chunk reads 0.8); skip the read-ahead points' boxDist for cells far past the mid reach.
- n3ds: a develop baseline build of tokyo hit svcBreak in GPUCMD_AddInternal (command buffer full) at 5.9 s in Azahar; raise C3D_Init's command buffer size if it shows on hardware.

- world rule: night pictures and night glow per material (material extras), so a glTF city lights up like Tokyo's.
- world rule: a far chunk per region for very large worlds (one chunk for the whole world today), and a per-cell reach for landmarks.
- world rule: emit `TOP` batches for textured grounds whose uvs follow x/z, so the PSP and 3DS compact layouts apply.
- defaults3D: zinc.json `"3d": {...}` overrides, and measured rows for Android, iOS and web.

- zinc:3d: `World` needs a real shadows on/off; tokyo fakes "off" with a flat height field and re-reads `hmap.bin` to turn them on (freeing the old map while a frame may draw it is unchecked).
- tokyo: the panel's map is a 24 m-per-pixel height relief; Pocket's far ground pictures would read better.

- tokyo PSP: a PSP-1000 fit needs a smaller runtime heap (the psp profile's 16 MB) and the pack read from the memory stick instead of embedded; the heights also cost 1.5 MB twice (pack and the heap copy from zn_asset_bytes).
- tokyo PSP: run the shadow sweep on a low-priority thread during the vblank and GE wait as Pocket does, to remove its 1 ms a frame.
- tokyo PSP: CLUT8 mipmaps (Pocket's down to 16 texels) with bit 7 set per level, against far-ground shimmer.
- zinc:3d PSP: clut8 pictures are never freed; free a world's pictures when it closes.

- n3ds: a mid chunk read from the pack inside the .3dsx takes 15-70 ms in Azahar, so the frame that reads one is late; move those reads to the SD reader thread or make them cheaper.
- tokyo PSP and Vita: stream the near level from the memory card as the 3DS does (the PSP-1000 needs it for memory too).
- zinc:3d: `zn_asset_image_free` also frees a near picture a program took by name itself; pictures need a reference count.
- n3ds: night pictures go to the GPU at load even by day (about 5 MB of GPU memory); upload them when the dusk starts.
- docs: with neither a launcher path nor `ZINC_SD_DIR`, the 3DS looks for its packs in `sdmc:/3ds/zinc/`; say so in the 3DS target doc.

- tokyo PSP: CLUT8 mipmaps for the ground pictures, against far-ground shimmer.
- tokyo PSP: a 13 ms read in the 5th frame after loading is the run's max (19 ms); send that entry to the reader thread.

- console player: the waiting screen has no font on PSP and Vita until a program has run (the 3DS now embeds player_font.zrs); the shared fix is in core_main's playerLoop (install zn_console_resources or a built-in grid font).
- n3ds: render3d.n3ds.cpp does not check its linearAlloc results; drop far-level pictures instead of exiting when linear memory runs out.
- tokyo 3DS: mid chunks now come from the card, so the loading takes 175 frames instead of 32; read the chunks the loading needs in larger batches.
- consoles: `console host: host.assetsStat is not available on n3ds` (n3ds-platformer).

- iPod Sonos: queue the songs before the one picked too (add at a position), so previous works across the whole list.
- iPod Sonos: carry the position over when switching output (seek after the first play); try Sonos's batch add (16 songs per call) on a real speaker for long lists.
- iPod Sonos: cover remote-iPod mode in tests/t1/ipod_sonos.sh (daemon on a free port, the speaker receives the /api/file?token= URL).
- zinc:sonos: let a speaker's address carry a port, so tests no longer patch :1400 (SoCo parity batch 1, docs/reports/sonos-soco-parity.md).
- zinc:sonos: docs/plugins/sonos.md says the plugin needs the process permission, plugin.json asks only for net: check and fix.

- TypeScript: `arr.sort()` without a comparator is refused (Z0104 "expected 1, got 0"); the default order compares elements as strings. Fix in the engine with a test.
- zinc:sonos events: no ContentDirectory (queue, favorites) or AlarmClock subscription yet; `subscribe` accepts them, `apply` ignores them (queue and alarms batches of docs/reports/sonos-soco-parity.md).

- iPod demo: the arrows of an album's or playlist's rows show progress during a whole-album download (needs per-track progress from ipod.onProgress).
- iPod demo: "Show details" on a failed toast opens the failed job's row on Transfers, not just the page.
- kit: toast() and addToast return a handle that can be updated (title, progress, actions), so apps do not each rebuild a live toast like the iPod demo's.

- QuickJS: strings of raw bytes (Response.bytes(), an event's rawBody) turn UTF-8 bytes into U+FFFD; the same gap as the zinc:subtle one fixed on 2026-10-29.
- iPod demo: covers in the cache are not invalidated after setArtwork (one size per album); invalidate by track when the cover changes.
- iPod demo: the listening service (listening.ts) has no headless test: a scripted session that plays past half a song and checks plays.json and history.jsonl.
- iPod demo: the opener scope for Last.fm sign-in was dropped at integration because it would also limit Reveal in Finder; scope both (https://www.last.fm/* and the user's folders) once opener scopes take paths.
- zinc:ui swipe back/forward gives no live feedback (Safari slides the page with the fingers); it acts on release only.
- QuickJS: sys.clock() read 0 ms around a sub-millisecond loop; check its resolution.
- iPod demo: history entries survive opening another iPod; reset the history when a device opens.
- iPod demo: the Linux right-click menu needs a stand-in (no native popup menu there).
- zinc:system: the Dock's Quit and a logout arrive as a window close; tell them apart (applicationShouldTerminate).
- iPod demo: the Devices page does not show the "waiting for the iPod" line yet (the signal exists).
- iPod demo: the queue copied to a Sonos speaker is capped at 1,000 entries; page it in.
- iPod demo: a running transfer cannot be cancelled midway (a half-written file the database does not know); design a safe cancel.
- zinc:system: ZINC_SYSTEM_SCRIPT ticks run faster than frames in a UI app, though docs/plugins/system.md says a tick is a frame.

- zinc:ipod: ensureSysInfoExtended built from SysInfo never writes the SQLiteDB key; a Nano 5G-7G set up that way would get a plain iTunesDB and lose its SQLite database. Write the key for those generations.
- zinc:ipod: libgpod logs g_utf8_casefold assertions when a text smart rule meets a track without that tag; patch the vendored itdb_splr_eval.
- iPod demo: the remote mode's JSON parse throws on a missing Track/Playlist field, so an older daemon without bpm/rules breaks the Mac app; default missing fields.
- iPod Genius batch B: setSmartRules cannot write back a rule it has no name for (album rating, loved); the editor keeps those playlists read-only or keeps the raw rule.
- zinc:ipod: expose Track.checked, grouping and compilation so smart previews cover those fields.

- TypeScript: Number.prototype.toLocaleString is missing; the iPod Settings shows plain numbers.
- zinc: no zip or inflate API; the iPod's ListenBrainz zip import uses the system unzip (Windows lacks it).
- iPod history: matching by MBID needs MUSICBRAINZ_TRACKID read from the files (the iPod database has none).

- TypeScript: the checker refuses `x instanceof C` when x is `string[] | C` (Z0107); TypeScript accepts it.
- iPod daemon: examples/ipod-web/zinc.json declares only net; reading iPod_Control and writing the cache need fs, which an exported daemon would refuse (before zinc build on the Pi).
- iPod app sharing: Subsonic scrobbles could feed listening.ts; Subsonic writes bypass the transfers queue and could interleave with an app job.
- iPod daemon: --log-requests masks query parameters only, not a POSTed form body.
- iPod daemon: OrbStack containers reach it as 127.0.0.1, so without --token /api is open to any container; require --token when the request comes through a container gateway, or document it loudly.

- iPod Genius: build the model and mixes off the UI thread (1.7 s on the first Playlists open for 10k songs / 100k listens), or cache them on disk per history version.
- iPod Genius: loudness through libebur128 in a native zinc:ipod analysis pass (only native code gets PCM of AAC/ALAC); zinc:audio.decode lacks AAC/ALAC.
- iPod Genius: ListenBrainz similar artists (labs API) once listens carry artist MBIDs.
- iPod daemon: serve /api/genius and /api/mixes from services/genius.ts.
- TypeScript: a Dyn JSON.stringify writes integer-like keys in insertion order; JavaScript writes them first, ascending.
- TypeScript: JSON.stringify with a replacer function is refused.

- iPod For you: the daily mixes block the UI about 1.4 s at 10k songs (genius.mixes); split them into chunks or run them in a worker.
- iPod For you: time a cached open and a full recompute on AOT on the owner's real library; log both.
- iPod For you: the "For this time of day" and "Loved but not on this iPod" shelves of the Genius study are not built.
- iPod tests: the folder-based fixture iPods (ipod_nav, ipod_foryou) show the host disk's fullness in the sidebar storage bar, so their golden hashes depend on the machine's free space; pin the reported capacity in the fixture.

- iPod daemon: no smart playlist API (create, set rules, refresh), so the app refuses Save on a remote iPod; add it and enable Save there.
- zinc:ipod: Track lacks file kind, grouping, compilation and modified, so smart previews and the editor skip those fields.
- zinc:ipod: the smart preview maps mediaType to a single libgpod bit; a track with several media bits could differ from libgpod.

- iPod AudioMuse: pull the MusiCNN embeddings (include_embeddings=true) into a deep.v1.bin for a true cosine kNN and Daily Mixes clustered on sound.
- iPod AudioMuse: read AudioMuse's own clustering playlists (/api/playlists) as more Mood mixes once a library is analysed.
- iPod AudioMuse: an "Analyse new songs" button on For you when songs are not analysed yet (today only on the Settings card).

- ipod_deep: one QuickJS run of 3 gave the From X to Y path one song short (AAAAABBBBBBC instead of AAAAABBBBBBCC) while AudioMuse loaded the machine; find what in the path build depends on timing.

- iPod demo: the track tables at 1180 px leave the Title column a few characters wide beside Artist and Album/Why; give Title a minimum width or narrow the fixed columns.
- iPod daemon: smart playlists cannot be saved to a remote iPod yet (smart.ts refuses); a rules route beside /api/playlist would close it.
- iPod demo: ipod_deep's find_path line came out AAAAABBBBBBCC once (equally close songs ordered by the fake iPod's ids); order ties by title to make it stable.
- iPod demo: ipod_demo uses a fixed /tmp/zinc-ipod-demo disk image, so two trees running it at once collide; use a per-run path.
- iPod demo: AudioMuse auto-sync only follows analysis tasks; a clustering run that ends after one does not sync again.

- iPod demo: the Info window cannot send a cover to a remote iPod (the daemon needs a cover upload route); an album grid on screen keeps the old cover until shown again.
- tests/t1/ipod_web.sh: a curl -d with nested braces inside "$(...)" reached the daemon cut; bodies go from a file now, the cause was not looked at.

- iPod radio on Sonos: "Start radio" before the group's queue was read can mirror the first append wrongly; read the group first.
- iPod radio: queue.dropUpcoming filters the context but ignores the shuffle order; check a thumbs down while shuffle is on.
- iPod demo: "From A to B" drafts last only for the run (not kept in genius.json like the Genius lists).
- iPod moods: moodMix ranks energy with indexOf per song, O(n^2); sort once with indices for 10,000 analysed songs.
- iPod demo: the mood mixer's tempo bar and the volume bar are click-only; add dragging to both.

- iPod satellite: POST /devices/:id/jobs (pull with Range, one addWith, remove, committing), GET and DELETE of a job, fingerprints in the track list; then play-count deltas to jukebox once its plays endpoint exists (docs/reports/ipod-jukebox-interconnect.md §7).
- iPod jukebox source: ALAC rather than AAC 256k for a roomy Classic; covers for remote adds (/api/update takes none); a virtualised browse list with multi-select.

- iPod daemon: no lyrics nor cover writes for a remote iPod yet (a writeLyrics route, a cover upload for artworkFile); both refuse with a clear error.
- iPod demo: the LRCLIB and MusicBrainz caches live under the backups folder, shared by all iPods; decide per iPod or shared on purpose.
- iPod demo: check the MusicBrainz pace (1 request/s) once in real time (ZINC_DETERMINISTIC runs a virtual clock).
- iPod demo: the now-playing display is crowded at 1180 px (the time label touches the cover).
- iPod demo: Discover as a For you shelf; a QuickJS smoke run of Discover, Repair and Lyrics; a test of the Lyrics panel scrolling long lyrics.
- iPod sleep timer: zinc:sonos SetSleepTimer/GetRemainingSleepTimerDuration so a Sonos keeps the timer if the app quits; keep the app in the menu bar while an alarm is set (closing the window quits it today); tests of the alarm on wake and of the end-of-song/end-of-list modes.
- ipod_deep: its auto-sync step polls in real time and fails under load; drive it by the virtual clock.
- iPod demo: Genius, For you and the cache parsing on a zinc:worker (D181 step 4) once workers land; the slices only spread the work over frames.
- iPod demo: For you's final write (JSON.stringify of the shelves and the drafts) is not sliced; genius() and the mood mixes are still synchronous.
- iPod demo: measure For you's frame gaps again now that a timer set in a frame waits for the next one (the slices were measured before that fix).
- Inspector: measure the Elements tree and rendered-only filter on examples/ipod's Songs page (VirtualList) with the fake iPod env.

## Cross-platform pass
- Threads profiler: check on Linux that `zinc profile` puts samples on each worker thread (SIGPROF delivery; older kernels favour the main thread).
- Workers: worker.cpp is in the esp32, console and wasm source lists, unbuilt; prove pthread_attr_setstacksize and thread names there.
- threads (D181): RSS per idle worker and the Genius build time in a worker on the Pi 3B+ and the Nexus 7.

- ZN-862: build plugins/imageio on Linux, Windows and iOS; check WebP and EXIF in a Linux AOT build (libwebp's symbols exported).
- Run ipod_jukebox and ipod_satellite on Linux (afconvert is missing there; the test uses ffmpeg, else skips).
- zinc:system/media: a Linux backend (MPRIS over D-Bus) and a Windows one (SystemMediaTransportControls), then turn on mediasession for those profiles.
- iPod AudioMuse over the LAN from the Pi daemon, with the same client.
- iPod: run ipod_smart on Linux.
- iPod Genius timings on the Pi 3B+ and 4, and a Linux AAC/ALAC decoder for the daemon.
- iPod history import and its timings on the Pi daemon.
- zinc:ui scrollKey on the web target (DOM render): the browser owns the scroller there; verify the restore.
- zinc:sonos events on webOS, the Pi and Android: the firewall must let the app's server port in (the webOS helper opens only the SSDP port today).
- D178: the Mac app's remote iPod against an ipod-web daemon on a Raspberry Pi over a real network (large files, timeouts, Wi-Fi).
- D178: the iPod daemon (examples/ipod-web) on a Raspberry Pi and a C.H.I.P.: build zinc:ipod's dependencies (glib, libplist, taglib, libusb) for armv6/armv7 with the pinned zig, serve a real iPod (an HFS+ one mounts read only: browse and stream only), stream to a Subsonic client on the LAN, and measure a hard-disk iPod's USB power on the C.H.I.P.'s host port (a powered hub if it browns out); it matters because that is what the daemon is for.

- ZN-857: iPod audio fingerprints on Linux need a decoder (miniaudio of plugins/audio covers WAV, MP3, FLAC; AAC and ALAC need another); until then `analyze()` on Linux matches by tags and files only.
- ZN-856: `zinc doc --serve` on Windows (the Winsock path is built, never run) and on Linux.
- ZN-853: `ipod.mount('')` finds iPod partitions by media name with diskutil (macOS only); on Linux it needs a partition name (`udisksctl`) and a way to find iPod partitions by themselves.
- zinc:video on a Pi 4 and a Pi 5: HEVC goes through the stateless V4L2 interface (rpi-hevc-dec). Measure with tools/h264dec-bench.cpp (extended to HEVC) FFmpeg of Pi OS (the Raspberry Pi fork has v4l2-request) against GStreamer's upstream v4l2slh265dec, and that the Pi 5 (no H.264 chip) takes libavcodec's software H.264; GStreamer becomes a way of the plugin only where it is the one door to the chip (docs/reports/video-zero-copy.md section 10).
- ZN-851: zinc:ipod on Linux and the Pi (apt packages of docs/plugins/ipod.md; TagLib 1 reads no embedded cover, udisksctl eject, an HFS+ iPod read-only), then Windows (glib, libplist, TagLib from MSYS2; the eject through DeviceIoControl).
- ZN-850: records over the phone glue (Android JNI, iOS) and rec.h checked on a 32-bit ARM (unaligned little-endian reads).

- ZN-846: launch the delivered CLI and signed Atelier on the networked Intel Mac running Catalina 10.15; only modern macOS/Rosetta execution is proven locally.

- ZN-845: launch the legacy Intel runtime on real macOS 10.12, check dyld imports, hello and bouncing-ball pixels, game keys/mouse/close; modern macOS under Rosetta and the 10.12 deployment target do not prove Sierra compatibility.

- ZN-844: run app/web on the reMarkable Paper Pro and the Move (954x1696): pinch from AppLoad's touches, pen ink, link taps and Refresh.
- ZN-844: try the web dashboard on the tablet: a 5-minute period while minimized and as a widget, and whether the full refresh after a swap leaves no ghost.
- ZN-844: check that `tools/package --linux-arch aarch64` builds `plugins/pdf/prebuilt/linux`, that the tablet loads `lib/libpdfium.so` and draws a page; time one page render at 1620x2160 on the A53.
- ZN-844: add the x86_64, Windows and armv7 archives of PDFium `chromium/8100` to `plugins/pdf/vendor/PIN` and `fetch`.
- ZN-844: Zinc Read on the tablet: swipes, the pen, task ticks and a real Notion sync over Wi-Fi (HTTPS through mbedTLS).
- ZN-844: run `rmpp_lease` (zig cross build) and check that `zinc export --target rmpp` writes the app's SVG icon as the tile's icon.png.
- ZN-844: compiler: in JSX, `{f()}` where `f: () => i32` is a component held in a variable or a field renders the element's handle as text ("98"), silently; `<F />` works. Either mount it or refuse it with a diagnostic (found in zinc:remarkable RemarkableApp).
- ZN-844: the hub app installed web 0.1.1 packed by zinc 0.9.1 on a tablet running engine 0.8.2, which refuses the archive: the catalog should carry the engine version a .zapp needs and the hub refuse (or say "update the engine") before installing.
- ZN-844: during a pinch or drag in Zinc Web or PDF, draw the scaled picture directly instead of rebuilding the ink's baked image every frame, if pinching feels slow on the reMarkable.
- ZN-844: Zinc Web: lighter pictures from the relay (a PNG screen is ~500 KB, ~0.5 s to reach the tablet), and fetch the screen above too.
- ZN-649.12: run web_physics2d after rebuilding browser WASM to verify Hit events and packed snapshots end-to-end; C/JS shim regression passes on the development Mac.

- ZN-825/ZN-826: verify the C offscreen host/linker on Windows, then a real iOS SwiftUI/UIView lifecycle and input integration; only macOS native windows were proved.
- ZN-827/ZN-828/ZN-832: build and exercise the pinned Godot exporter, GDExtension and LibGodot hosts on each supported desktop platform; embedding does not confer Zinc console/MCU support on Godot.
- ZN-830/ZN-831: verify the animation plugin, deformation backend and authoring-scene reimport on later targets, preserving explicit unsupported-feature diagnostics.

- ZN-649.12: rebuild graphics console cores with Physics2D, verify the Box2D pinball on the physical 3DS/other consoles and Pi, and measure frame time/memory; the registration and packed invariants pass only on the Mac so far.

- ZN-477: run examples/3d/orbit, cubes and gl-check on the owner's Vita with the GXM core (watch SDL's texture fragment program paired with the psp2spvc vertex program, the transposed Wvp), and log the ms in zinc-next-perf.md.
- ZN-476/ZN-478: run examples/3d/orbit on a real PSP (Adrenaline) and 3DS, Old and New, with the slider up; log the ms.
- ZN-102: sqlite, wasm, process and ffi conformance in the Linux container.
- ZN-126: the hw.h drivers built with ESP-IDF on a board, same frames as before.
- ZN-136: ESP-IDF images per board booted in QEMU, their module list reported.
- ZN-631: rn-showcase in Zinc Go on the Nexus 7 crashes when the tablet turns to portrait (array index out of bounds, in the task notes).

- ZN-774.02: run `install.sh`, `install.ps1` and the Homebrew install end to end and read their last lines (`zinc --next-steps`).

- Live resize (owner, 2026-10-16): Android and iOS send no live resize; the watcher stays off the UI thread (ZN-622): rotate a phone with a zinc:ui app and check one frame at the new size, no frame drawn from the UI thread.

- ZN-722: optional resource diagnostic hooks and CDP snapshots on Windows/Linux/mobile during the final target pass; only the development Mac was checked.

- ZN-576: tests/golden/webgl/antialias.js expects a multisampled canvas; on a GLES 2 context (Pi 3) antialias is reported false, so the golden needs a GLES 2 variant there.
- ZN-438: sprite atlas sources build warning-free under `zig c++` (cross builds).
- ZN-446: the splash on display plugins (display-fbdev before EGL/GLES, the panels, ESP32 RGB565 from flash); `showSplash` skips runs with a display plugin today.
- ZN-446: OS splashes from the exports (iOS launch storyboard, PSP PIC1, Vita LiveArea, 3DS banner) once those exports exist.
- ZN-447: run the loader stage in the browser export (the worker's blocking frame loop should run it like the gfx loop) and on the ESP32 device core (it needs the asset host rows).
- ZN-574: gamepads on Linux and Windows (frameworks and link line of the SDL joystick build, a real pad), with ZN-552's evdev hub.
  profile refuses; there it needs a typed JSON walk or mergeItem left out.
  proves the card is placed 14 px low), then try re-sending fullScreen false/true on libnapp's IPC channel after the card is maximized.
- Fonts: an engine-level tabular-figures feature (OpenType tnum through HarfBuzz in src/text/layout.cpp, chosen per font like the size) so any text can ask for fixed-width digits; Musique draws its clock digit by digit meanwhile (examples/music/src/ui.ts tabular).

- D119: back ends of the GPU layer for the connected platforms the owner named (CHIP Mali-400 on the GLES 2 base; PS Vita GXM; 3DS citro3d; Wii GX; Wii U GX2; Switch deko3d or NVN), one small back end per GPU as PocketJS does; and the extraction of the layer as a project of its own once a second back end exists.
- ZN-718: zinc lint: an opt-in `zinc lint --js` running a pinned oxlint for generic hygiene rules; pin ast-grep if users ask for their own codemod rules (docs/reports/zinc-lint-migrate.md).
- ZN-718: zinc lint: a rule for zinc.json dependencies that nothing imports (the knip idea).
- ZN-718: zinc lint: JPEG and WebP pixel sizes in the asset estimate (only PNG reads its size from the header).
- ZN-718: zinc lint: target rules in the LSP (`--json` is the hook), and a `boot` budget estimate from assets.groups.
- ZN-701: webgl_conformance on a GPU that does not zero new memory (the AMD driver of an Intel Mac, a hosted runner's virtual GPU): our WebGL layer leaves new textures, renderbuffers and the area outside a copyTexImage2D source to the driver; WebGL says zeros. 61 pages differ on the hosted runner (list: docs/reports/ci-run-38901269935/trace-webgl_conformance.log): zero-initialise explicitly; the hosted runner then proves it (ZINC_CI skip to remove).
- ZN-718: `zinc device update` (the agent's engine update on a device) still only downloads and verifies; it could reuse `updateCommand` of src/tc/selfupdate.cpp to install and roll back.
- ZN-718: zinc:socket speaks ws:// only: no public wss echo for the live feed of rn-showcase (TLS WebSocket).

- Mobile feel: a canvas (`onDraw`, `<Icon>`) draws at full alpha inside a fading or scaled view; the navigation stack works around it for its back arrow (`Navigation.alphaOf`), the icons do not.
- Mobile feel: React Native's `Modal` positions its host with the object style `position: 'absolute'`, which the classic layout ignores: in a classic-layout app the host has no size and its outside-press dismissal fires on any press (the navigation test runs in the rn layout for it).

- ZN-?: rerun `examples/perf-compare` on a quiet machine (Flutter list CPU and frame times gated), then add PocketJS desktop and react-native-macos to complete the table
- ZN-?: add a 100000-row virtualised list to the perf screen, Flutter's `ListView.builder` as reference

- ZN-?: `three` from npm in a web project resolves to the zinc:three plugin; the web backend of zinc:three (plugins agent) decides, or npm three wins on the web target
- ZN-?: Rspack and webpack recipe (a loader calling `zinc dev --prepare`) is documented, not run
- ZN-?: the dev pre-bundle does not watch workspace packages; reload on a workspace package edit
- ZN-?: publish @zinc/vite to npm (owner step; the package is ready)
- ZN-?: semantic DOM on Firefox and Safari (macOS, iOS), phone measurement before choosing the web default render, screen reader and IME pass, code-editor TextArea extensions in the page, lottie cacheBg on the web, deep links for Stack path, prerender at several widths

- ZN-?: web `zinc dev --target web` for vendored UMD/addon libraries (three addons, MapLibre) once the unbundled dev server can load them
- ZN-?: an OSC relay shipped with Zinc (WebSocket to UDP) for `zinc:osc/full` on the web
- ZN-?: real-device pass for web serial, MIDI and gphoto2 (Arduino, MIDI keyboard, PTP camera) and Firefox/Safari runs of the WebGL tests
- ZN-?: libgphoto2 through `web-gphoto2` for live view and vendor widgets on the web
- ZN-?: web `zinc:3d` and `zinc:physics3d`, or a documented "use three" answer
- ZN-?: OffscreenCanvas worker renderer for three.js on the web; a WebGPU renderer
- ZN-?: silence W0603 for `zinc:map` on the web (lazy network calls in index.ts or a browser shim for zinc:net)
- ZN-?: a DOM-mode program that draws with gfx alone and has no zinc:ui tree yields no elements; export it in canvas mode or make DOM mode mount a canvas

- ZN-?: web-real-test: per-demo scripted interactions (rn-showcase, nuxt-ui, webrtc-chat) and a screenshot diff against the desktop render at DPR 2; a headful run on the owner's Mac as a milestone check (Firefox and Safari still untested)
- ZN-773.04: `zinc export --dmg`, `--key` signatures and the SBOM for jsc/v8 projects (the engine-app export returns before those steps).
- ZN-773.04: `zinc pack` and `zinc fuse` of jsc/v8 projects: a .zapp carries typed .zbc only today.
- ZN-773.04: notarize an exported engine app signed with a Developer ID (the packs are re-signed with that identity; unproven).
- ZN-773.04: run tests/t1/package_app.sh once index/root.json exists (tools/package copies index/ into the package then).
- ZN-773.07: Hermes's CDP inspector (API/hermes/cdp) behind src/dbg/ws.cpp, as V8's, for --engine hermes --inspect.
- ZN-773.07: precompile .hbc at zinc build --engine hermes through hermes_run_bytecode; optimising at run time costs 1.2 s on hero's bundle.
- ZN-773.07: the Hermes adapter keeps one handle scope open for the whole run (its Node-API roots values only inside a scope): check long programs do not grow.
- ZN-773.08: measure hero CPU on Hermes built with and without its debugger on a quiet machine; if the debugger costs, ship two libhermesvm builds and load the debugger one only for --inspect.
- ZN-773.08: Hermes's DevTools agent does not report which breakpoint was hit and lists possible breakpoints as empty: check Chrome DevTools' breakpoint UI on Hermes.
- ZN-773.08: zinc export of a Hermes or V8 project should prefer the downloaded pack over the module beside a source-built zinc, whose library points at the local SDK.
- ZN-773.06: WASI preview1 on the wasm pack, so wasm programs built for WASI run on QuickJS.
- ZN-773.06: share an imported Memory, Table and mutable Global instead of copying them into the instance (WAMR multi-module or a host-memory hook); funcref and externref parameters of an import arrive as null today.

- ZN-785: evaluate a separately flashed A/B Pi OS image with RAUC, persistent app/settings storage, signed boot+rootfs bundles and tryboot health confirmation on Pi 3 B+; prove power-cut rollback before offering whole-system updates. Current engine generations do not update the OS.
- ZN-790: play n3ds-pinball, n3ds-platformer and n3ds-starfall on a real 3DS (stereo depth comfort, stylus, frame time).
- ZN-792: the device player on a real PSP, Vita, 3DS and the TouchPad over Wi-Fi; EC J-PAKE pairing time on each; iPhone signing and the local network permission prompt.
- ZN-791: Paint Arena on a real PSP, Vita and 3DS on real Wi-Fi (PSP WPA limits, routers that block client broadcasts).
- ZN-792: the phone player on a real iPhone (signing, the local network prompt, Bonjour on Wi-Fi) and the TouchPad player (`tools/webos-player install/start`, pair, deploy hello).
- ZN-820: on a Pi, tap an app in the player and check zinc-session starts it from next-app (app.zapp and run.sh) and that a crash names it.
- ZN-822: on the Pi's touch screen, check the dev bar takes a finger (touch[0]) and its X brings the player back.
- ZN-821: run `zinc device <pi> profile/bench` and `zinc dev --device <pi>` with the inspector on a real Pi through its agent (source deploy, --no-run, report pull).
- ZN-823: prebuilt plugins of the armhf, armv7, x86_64 and i686 packages and the release linux-cross CI job (it now builds a host zinc first) are not proven.
- tokyo: a Pi profile (a Pi 3/4 on Linux takes the desktop settings), the Pi build and real PSP/Vita/3DS measurements.
- ZN-480: --aot on a real PSP, Vita and 3DS (orbit's frame rate, the owner's PSP first) and graphics programs on the PS2.
- tokyo: measure the native World on the real PSP, 3DS and Vita.
- tokyo PSP: measure on a real PSP-2000 the GE time of 38,900 triangles and 1,451 draws (Pocket estimates ~26 ms) and the 30.3 MB heap (too much for a PSP-1000).
- tokyo 3DS: time the frame on the real Old 3DS XL (Azahar does not time the PICA200); if it misses 30 fps, lower the n3ds budget in devices.ts from 60,000 toward Pocket's 40,000.
- tokyo 3DS: if ETC1 blocks show on the windows on hardware, make the facades RGB565 as Pocket does.
- zinc:3d: run `zinc3d_world_build`'s world with `--profile psp`, n3ds and vita on the real consoles.
- tokyo: stereo on the 3DS is unproven (Azahar runs with the slider at 0): check the right-eye shot on hardware, measure the second render (~0.6 ms), tune `STEREO_SPREAD` (1.5 m).
- tokyo: run the PSP and Vita overlay panel with `ZINC_TOKYO_TAP` in PPSSPP and Vita3K, and the pad navigation on a real pad.
- tokyo PSP: time the GE with CLUT8 swizzled pictures and shadows on a real PSP (PPSSPP does not time the GE).
- tokyo 3DS: measure the SD read time and the memory peak of near streaming on the real Old 3DS.
- zinc:3d: re-measure select-bench on a quiet Mac and on a real PSP.
- tokyo PSP-1000: the 17,000 KB heap fit in PPSSPP only (peak 15.8 of 16.6 MiB); try a real PSP-1000 and time the stick's reads on hardware.
- tokyo 3DS: linked-pack read-ahead costs 36-47 ms an entry on core 1 at an 80% limit in Azahar; measure on a real Old 3DS, where core 1 is shared with the system.
- tokyo Vita: Vita3K follows the Mac's load (p95 12-23 ms); remeasure on a quiet Mac or a real Vita.
- tokyo 3DS: on the real Old 3DS XL read the `n3ds:` and `sd packs` lines of sdmc:/zinc.log; the heap margin is about 4 MB (34.2 of 38), lower the 16 MB zrt heap if Tokyo uses much less.
- tokyo 3DS: confirm on the real Old 3DS that the white ground blocks are gone (ZINC_PROFILE=1 counters `draws without their picture`, `chunk loads held back`); Azahar never showed them.
