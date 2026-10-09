# Games: toolchain, assets, code and loading (research and design, 2026-10-09)

Scope: everything between the files an author makes (images, sounds, models, levels, fonts, code) and the first playable frame on each
target, from desktop to the Raspberry Pi 1, the NTC CHIP, PSP, Vita, 3DS, iPhone 4S, ESP32 and the browser. It covers the build-time
pipeline (convert, pack, cache), the run-time side (mount, stream, decode, budget), the start experience (splash, pre-launcher,
loader) and the command line, and maps all of it onto Zinc's rule "a minimal core, pluggable, with a suite of plugins or deps".

Evidence tags: **[M]** measured here on this Mac (M-series, macOS, `next/build/zinc` 0.0.1 of 2026-10-09), **[C]** read in the code
(file given), **[W]** from the web (source in section 13), **[I]** inferred or estimated, not measured.

## 0. Summary

1. **Today's pipeline is an app pipeline, not a game pipeline.** The baker (`src/res`) turns every image of `assets/` into raw
   RGBA and embeds three whole TrueType files: the game-2d template's 2 small sprites cost a 1.7 MB `resources.bin`, of which 23 KB are
   images [M]. A 5 MB PNG becomes 16.8 MB. There is no atlas, mipmap, GPU format, compression, cache, audio or async loading.
2. **Four measured problems have small fixes** (phase A, no new format): bake only the fonts used (`hb-subset` is already vendored),
   embed AOT data with `.incbin` (50 MB in 1.1 s and 142 MB of memory; today's decimal array costs 1.3 s and 227 MB for 1 MB), stop reading and hashing the whole
   `.zapp` at each launch (100 MB of assets: 2 s and 500 MB of memory per launch today), and drop unreachable functions from the ZBC
   (about 24 of 221 functions are reachable in game-2d, which is over the ESP32's 48 KB).
3. **Build-time pipeline:** an import graph driven by glob rules in `zinc.json`, a content-addressed cache keyed on (source, options,
   target profile, tool version), deterministic outputs, and importers that are pinned upstream tools (basisu, gltfpack, encoders) or
   Zinc scripts (Tiled, LDtk). basisu is the texture hub, transcoded at build time to each target's native format; the browser alone
   transcodes at run time.
4. **Run time:** an indexed pack (ZPK) mapped in place inside the `.zapp` or the app bundle, verified per entry on first read, lz4 or
   zstd per entry, groups as the unit of loading, mods and DLC as overlay mounts; `zinc:assets` v2 with async groups, byte-weighted
   progress, priorities, budgets per target, decoding on the libuv thread pool.
5. **Start experience:** one `splash` declaration feeds the OS splash (iOS launch screen, PSP PIC1, Vita LiveArea, inline HTML) and
   an engine splash drawn from pre-baked framebuffer pixels before compile, bake or pack mount; an optional pre-launcher stage
   (settings, updates through `zinc:system/update`, mods) and an optional loader stage with replaceable screens. No logo, no minimum time
   by default.
6. **Core stays small:** pack reader, scheduler, stages, lz4 (and zstd where size allows) in the core; every encoder, every optional
   decoder, sprites, tile maps, audio and the stock screens as plugins. 25 ordered tasks in section 11.

## 1. What Zinc does today

### 1.1 The pieces

| Piece | Where | What it does | Limits for games |
| --- | --- | --- | --- |
| Resource baker | `next/src/res/res.cpp` (`zn::res::bake`), called by `bakeResources` in `next/src/main.cpp` | Scans the program's text for text sizes, families and literal characters; rasterizes glyphs (own TrueType rasterizer, bit-identical port of the old `resources.ts`); decodes every PNG, JPEG, WebP and SVG of `assets/` (`@2x` variants); writes one blob `ZRS1` (fonts, images as **raw RGBA8**, the TrueType files) **[C]** | No atlas, no mipmaps, no GPU formats, no compression, no cache (re-baked on every `run`, `pack`, `build`); every image of `assets/` is baked whether used or not; the grid fonts of the legacy `gfx.text` are always baked; the TrueType files are embedded whole |
| `zinc:assets` | `lib/modules.d.ts`, `next/src/host/sys_host.cpp` | `readText`, `readBytes` (a copy into a `u8[]`), `exists`, `list`, synchronous, from the directory `ZINC_ASSETS` **[C]** | No async, no progress, no streaming, no mmap; an AOT binary does not find its assets (ZN-314); the guide's "assets compiled into the executable" (`docs/guide/07-distribution.md`) describes the old compiler, Next copies `assets/` beside the executable |
| `zinc:gfx` images | `lib/gfx.d.ts`, rows `host.gfxImage*` in `next/include/zn/runtime.h` | `image(name)` finds a baked image; `drawImage(img, x, y, w, h, alpha, radius)`; render targets **[C]** | No source rectangle (sprite sheets: `zinc:canvas` emulates it with a clip and a scaled whole-image draw, `plugins/canvas2d/index.ts`), no image from bytes at run time (only `three`'s native `T.decode`), no audio module at all (ZN-390) |
| `.zapp` | `next/src/zapp.cpp`, `docs/zapp.md` | Deterministic ustar: `manifest.json` (SHA-256 per file), `program.zbc`, `resources.bin`, `zinc.json`, `assets/` **[C]** | Each launch reads the whole archive into memory, untars it into a map of copies and hashes every member, even when it is already unpacked in `~/.zinc/cache/zapp` |
| Fused executable | `zinc fuse`, `fusedArchive` in `main.cpp` | The engine with a `.zapp` appended (15 MB for a hello) **[C]** | Same whole-archive read |
| AOT build | `zn::aot::emitCpp`, `next/src/aot/aot.cpp:279` | The baked blob becomes `static const unsigned char kResources[] = {12,34,...}` in the generated C++ **[C]** | A decimal array literal: compile time and memory grow with the assets (measured below) |
| wasm export | `next/src/cli_core.cpp` `exportWasm`, `next/targets/wasm/glue/*` | `index.html` + `app.js` + worker; fetches `app.wasm` and `app.zbc` whole, then `WebAssembly.compile`; draws `zinc:gfx` on an `OffscreenCanvas` 2D context **[C]** | The page shows nothing until both files arrived; no streaming compile; images are not drawn (`host.gfxImage` falls in the "not available in the browser" default of `worker.mjs`) and text uses the browser's fonts, not the baked ones; `assets/` is copied but unread |
| esp32 export | `exportEsp32` in `cli_core.cpp` | `core.bin` + `app.bin` (ZBC) at 0x300000 **[C]** | The program must fit 48 KB of bytecode |
| Templates | `templates/game-2d`, `templates/3d` | Scenes, input, SVG sprites, a saved score; three.js scene **[C]** | No sound, no loading, no atlas |
| 3D | `plugins/3d` (software), `plugins/three` (three.js API), cgltf 1.15 and meshoptimizer 1.3 vendored (D25) | glTF/GLB and OBJ through `zinc:assets` (`readFile` in `plugins/three/index.ts`), `TextureLoader` decodes PNG/JPEG at run time **[C]** | Synchronous loads, callbacks called inline; meshoptimizer is not used by any build step yet |
| WebGL | `next/src/gl` (D40: `libzn_webgl`) | WebGL 1/2 with S3TC, S3TC sRGB and RGTC compressed formats (`webgl_ext.h`) **[C]** | No ETC1/ETC2/ASTC/PVRTC extension yet; `display-gl` (the `zinc:gfx` GPU path) uploads only RGBA |

### 1.2 Measurements

**Baked blob of the game-2d template [M].** `zinc new game-2d g2d && zinc bake src/main.ts -o blob.bin` (92 ms), broken down with a
20-line reader of the `ZRS1` layout:

| Part | Bytes | Share |
| --- | ---: | ---: |
| TrueType files embedded whole (Inter Regular 411 640, Inter Bold 420 428, JetBrains Mono 273 900) | 1 106 009 | 65 % |
| Glyph tables of `sans` and `sans-bold` at 16, 18 and 40 px (6 tables) | 161 240 | 9 % |
| Glyph tables of the legacy grid font (8 to 64 px), baked though the game never calls `gfx.text` | 416 342 | 24 % |
| Images (`coin.svg` 40x40 and `player.svg` 64x64 at 2x, raw RGBA) | 22 834 | 1 % |
| **Total `resources.bin`** | **1 706 441** | |

The same blob compressed: zstd -3 513 601 B, zstd -19 426 986 B (4.0x), lz4 -1 868 052 B, lz4 -12 698 924 B, gzip -9 588 175 B.
The `.zapp` is 1 773 568 B, of which 60 181 B of ZBC; the ZBC compresses to 17 799 B (zstd -19). ZBC decode 0.14 ms, verify 0.83 ms
(`ZN_TIMING=1`).

**One large image [M].** A 2048x2048 PNG of 5 145 090 B (made with `sips` from a macOS wallpaper) bakes in 350 ms into
16 777 238 B of RGBA (3.3x the PNG); the blob compresses to 6 849 220 B (zstd -19). On a GPU that image is 16 MiB in RGBA8, 4 MiB
in BC7, ASTC 4x4 or ETC2 RGBA, 2 MiB in ETC1, BC1 or PVRTC 4 bpp, 1 MiB in ASTC 8x8, plus a third for mipmaps (arithmetic of the block sizes).

**Launch of a `.zapp` with 100 MB of assets [M].** The game-2d project plus 100 MB of random bytes in `assets/data/`: `zinc pack`
1.6 s; then three launches of `ZINC_HEADLESS=1 ZINC_FRAMES=1 zinc run build/g2d.zapp` (already unpacked in the cache after the
first): **2.0 to 2.3 s each, 450 to 520 MB peak resident memory**. The small `.zapp` launches in 40 to 50 ms; `zinc run` from the
sources in 80 ms (compile 45 ms of it, `zinc -vv`). The `zinc` process alone starts in 10 ms.

**Embedding data in an AOT program [M].** Same machine, Apple clang 21 and the pinned zig 0.15.2:

| Method | Payload | Compile time | Peak memory |
| --- | ---: | ---: | ---: |
| Decimal array literal (what `aot.cpp` writes): 3.66 MB of C++ per MB | 1 MB | 1.34 s | 227 MB |
| `#embed` (C23; accepted in C++ by clang and zig with `-Wno-c23-extensions`) | 1 MB | 0.18 s | 112 MB |
| `#embed` | 5 MB | 0.50 to 0.65 s | 347 to 367 MB |
| `.incbin` in a 7-line assembler file | 50 MB | 1.09 s | 142 MB |

The decimal array would need about 20 s and several GB for the 16.8 MB blob of one 2048 px image **[I]** (linear extrapolation).
`#embed` still builds an AST node per byte; `.incbin` streams the file in the assembler.

**Code that is never called [M].** The ZBC of game-2d holds 221 functions; a rough reachability walk over `zinc --emit=zbc` (calls,
plus the vtables of the classes the program constructs) reaches about 24 of them from `main`. Whole modules ride along: the 51
methods of `Date` (the game never uses dates), every `zinc:gfx` wrapper (touch, pen, clipboard), the promise machinery. The walk
ignores call-backs from runtime rows, so the real count is somewhat higher **[I]**, but the order of magnitude is clear, and the
60 KB of this 135-line game are already over the ESP32 core's 48 KB.

**Audio sizes [M].** A 1.49 s mono 44.1 kHz effect (`Submarine.aiff`) with the Homebrew ffmpeg: PCM WAV 131 714 B; IMA ADPCM
33 886 B (3.9x); IMA ADPCM at 22 kHz 17 502 B; AAC 64 kbit/s 13 494 B; Opus 48 kbit/s 6 467 B (20x).

### 1.3 Tasks already open that this work meets

ZN-390 (`zinc:audio`, miniaudio), ZN-182 (GPU atlas manager of the renderer), ZN-314 (AOT asset root), ZN-164 (host library split and
size gates for the Pi 1 and ESP32), ZN-348 (minimal zinc, parts fetched as plugins), ZN-391 (open `.zapp` by double-click), ZN-392
(prebuilt player runtimes for `zinc fuse`), ZN-372 (iOS/Android spike), ZN-194 (compact scene and RGB565 raster for ESP32), ZN-197
(PS2 GS sprite backend). The earlier tool-belt study (`docs/reports/research-2026-09-30/toolbelt-build-pipeline.md`) measured the
QuickJS side: parse time is about 45 ns per byte and almost insensitive to minification; minifying saves 45 % of bytes; bytecode
precompile is the start-up lever.

## 2. Goals and rules for the design

1. **Heavy at build time, light at run time.** Every conversion that can happen on the build machine happens there, into the exact
   layout the target's GPU, DMA engine or rasterizer consumes, so loading is "map, maybe decompress, upload". A run-time transcoder
   exists only where the target is unknown until run time (the browser).
2. **One source, many targets.** The author keeps lossless sources (PNG, SVG, WAV/FLAC, glTF, TTF, Tiled/LDtk) in the project; the
   per-target outputs are derived, cached and never committed.
3. **Core small, codecs as plugins.** The engine carries the pack reader, the manifest, the cache and the scheduler; encoders run as
   pinned tools fetched on use; decoders link only into programs and targets that need them (D40's logic: measured size, then
   the verdict).
4. **Deterministic bytes.** Same sources, same zinc, same tools: same packs, as `zinc` and plugins already are (ZN-333). Encoders are
   pinned by version and hash, run with fixed options and thread counts, and their version is part of every cache key.
5. **Everything optional and declared.** No splash, launcher, loader or pack unless `zinc.json` asks; the defaults of a target
   come from `targets/capabilities.json`, and a project overrides them per target.
6. **Measure, then gate.** Every build writes a size and time report; budgets in `zinc.json` turn it into a CI gate.

## 3. What each target wants

Facts from vendor documentation, homebrew SDK headers, the Mesa sources and web3dsurvey **[W]** (section 13); hardware-only
questions are marked unverified. None of PSP, Vita, 3DS, iPhone 4S or CHIP is a Zinc target yet (`targets/capabilities.json` has
macos, linux, rpi1, rmpp, esp32, ps1, ps2, wasm, sim): the table is what the pipeline must be able to produce when they come.

| Target | GPU / API | GPU texture formats | Size rules | Memory | Audio the hardware decodes | Cores for decoding | Storage, mmap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Desktop (macOS via GL 4.1 or ANGLE-Metal, D30; Linux Mesa) | GL 3.3 / GLES3 | BC1-3, BC7; ETC2 and ASTC on Apple Silicon (through ANGLE-Metal) | NPOT; 8192+ | GBs | none needed | many | mmap |
| Pi 1/Zero/2/3 (VideoCore IV, Mesa vc4) | GLES2 | **ETC1** (enabled when the kernel reports it) | NPOT allowed by Mesa; **2048** max | 256 MB to 1 GB shared; GPU buffers come from **CMA, 64 MB by default** | none | Pi 1/Zero: one ARM11 at 700 MHz; Pi 2/3: 4 cores | mmap |
| Pi 4/5 (V3D, Mesa v3d) | GLES 3.1 | **ETC2/EAC**, BC1-3; ASTC LDR in current Mesa | 4096 (7680 with a driconf option) | 1 to 16 GB, own GPU MMU | none | 4 | mmap |
| NTC CHIP (Mali-400, Mesa lima or the blob) | GLES2 | **ETC1 only** | NPOT (lima); 4096 | 512 MB shared | none | one Cortex-A8, 1 GHz | mmap (NAND, UBIFS) |
| iPhone 4S (SGX543MP2, iOS up to 9.3.6) | GLES2 | **PVRTC1 2/4 bpp only**; no ETC | NPOT without mipmaps; PVRTC square, power of two, at least 8; 4096 | 512 MB; plan for 200 MB or less (kill threshold unverified) | AAC, ALAC, MP3 in hardware, **one stream at a time**; IMA4/LPCM recommended for many effects | 2 x Cortex-A9 | mmap of the bundle |
| PSP | GU | DXT1/3/5 (slow: the 8 KB texture cache holds them decoded), **CLUT4/CLUT8**, 5650/5551/4444/8888; swizzled layout loads faster | power of two only; **512** max | 32 or 64 MB; 2 MB of VRAM | ATRAC3/3+, MP3, AAC on the Media Engine; VAG ADPCM mixed by sceSas | one CPU + the Media Engine (codecs only) | no mmap (no MMU); UMD about 1.4 MB/s with slow seeks |
| PS Vita | GXM | PVRTC, PVRTC-II, UBC1-5 (DXT/BC), ETC1 (extended-format flag); swizzled, tiled or linear | 4096 (from SDL, hardware unverified) | 512 MB + 128 MB VRAM | ATRAC9, MP3, AAC, CELP through sceAudiodec | cores 0-2 of 4 | no mmap; `ux0:` |
| 3DS / New 3DS | PICA200 (citro3d) | **ETC1, ETC1A4**, RGBA8/RGB8/5551/565/4444, LA8/L8/A8/LA4/L4/A4; 8x8 Morton tiles | power of two, **8 to 1024** | app region 64 MB (Old 3DS) or 124 MB (New 3DS); 6 MB VRAM | **DSP-ADPCM** (mono; stereo as two voices), PCM8/16 | Old: core 0 + a time-limited core; New: + core 2 | no mmap; RomFS |
| ESP32 | none (SPI panel, ST7789 RGB565) | n/a: the CPU blits | panel size | 520 KB SRAM, 160 KB of static DRAM; PSRAM up to 4 MB, not DMA-capable | none (I2S out) | 2 x LX6 240 MHz | `esp_partition_mmap`: read-only, 64 KB pages through the flash cache |
| Browser (WebGL 1/2) | WebGL | s3tc (Windows 99.96 %), bptc (99.7 %), etc1/etc/astc on Android and iOS (~99.9 %), pvrtc (iOS 98 %); ETC2 is an extension even in WebGL2 (2.6 % on Windows) | WebGL1 NPOT: clamp, no mipmaps; 4096 everywhere, 16384 on 86 % | the browser's | `decodeAudioData`: MP3/AAC everywhere; Opus and Vorbis reliable in Safari only from 18.4 | workers; shared memory needs COOP/COEP | fetch, Cache Storage, IndexedDB, OPFS |

**Default formats per target** (what `targets/capabilities.json` would declare; the "why" is in the table above):

| Target | Texture (fallback) | Music | Effects | Pack codec |
| --- | --- | --- | --- | --- |
| Desktop | BC7 with alpha, BC1 opaque (RGBA8) | Opus | Opus or QOA | zstd |
| Pi 1-3 | ETC1 opaque, RGBA4444/5551 with alpha (RGB565, RGBA8) | Vorbis, one stream | QOA or IMA ADPCM | lz4 |
| Pi 4/5 | ETC2 RGB8 / RGBA8-EAC (BC1/3, RGBA8) | Opus | QOA | zstd |
| CHIP | ETC1 + RGBA4444 for alpha (RGB565) | Vorbis | QOA | lz4 |
| iPhone 4S | PVRTC1 4 bpp, square power of two (RGB565/RGBA4444) | AAC (hardware) | IMA4 / LPCM | lz4 |
| PSP | CLUT8/CLUT4 swizzled, 5551/4444 palette (5650/4444 swizzled) | MP3 through sceMp3 (or ATRAC3+) | VAG/PCM through sceSas | lz4 |
| Vita | UBC1/UBC3 swizzled (RGBA8/RGB565) | MP3/AAC through sceAudiodec, or Opus in software | PCM/ADPCM | zstd |
| 3DS | ETC1/ETC1A4 in Morton order (RGB565/RGBA4/LA8/L8/A8) | DSP-ADPCM | DSP-ADPCM | lz4 |
| ESP32 | raw RGB565 byte-swapped for the panel, mapped from flash (4/8-bit indexed + RGB565 palette) | IMA ADPCM or QOA, 16 to 22 kHz mono | same | none for images and sounds (read in place from flash), lz4 for the rest |
| Browser | KTX2 (ETC1S/UASTC) transcoded in a worker to BC/ETC2/ASTC/PVRTC (RGBA8; power of two in WebGL1) | Opus via `decodeAudioData`, MP3/AAC fallback | QOA decoded in wasm | none (HTTP compression) |

What needs a device to confirm: ETC1 and NPOT on the Pi's legacy Broadcom driver, the Vita's real maximum texture size and
whether ATRAC9 decoding is hardware, read speeds of the 3DS SD card, Vita `ux0:` and PSP Memory Stick, usable memory (Vita split,
PSP-1000 user partition, iPhone 4S kill threshold), Vorbis cost on the ARM11 and the classic ESP32. A `glGetString` /
`glGetIntegerv` probe printed by `zinc doctor --gpu` on each GL target settles the GL side.

## 4. The asset pipeline (build time)

### 4.1 Shape: an import graph, a content-addressed cache, packs

```
 assets/ (sources)            importers (per rule)              per-target artifacts            packs
 sprites/*.png  ──► atlas ──► texture encode (profile) ──► sprites.<fmt>  + frames.bin ─┐
 music/*.flac   ──────────────► audio encode (profile)  ──► level1.opus                  ├─► boot.zpk, level1.zpk ──► .zapp / app bundle / flash image
 models/*.glb   ──────────────► gltfpack + texture enc  ──► truck.zmesh, truck.<fmt>     │
 levels/*.tmj   ──────────────► tilemap (Zinc script)   ──► level1.tiles                 ┘   + report.json
```

- **Rules, not per-file metadata.** `zinc.json` `assets.rules` map globs to an importer and options (section 10). Godot keeps one
  `.import` file per asset and Bevy one `.meta` file **[W]**; both are useful for editor UIs but double the file count. Zinc starts
  with globs (one place, reviewable in a diff) and accepts an optional sidecar `<file>.zinc.json` for the rare per-file override.
- **Importers are pure functions** of (source bytes, options, target profile, tool version) to artifact bytes. The cache key is the
  XXH3-128 of those inputs; the artifact is stored by its own hash under `~/.zinc/cache/assets/` (shared across projects) with a
  small per-project index in `build/.zinc-assets/`. A second build of an unchanged project runs no importer.
- **Two kinds of importer**: `tool` (a pinned native command, for codecs: basisu, gltfpack, astcenc, opusenc...) and `script` (a
  Zinc module run by the interpreter at build time, for data formats: Tiled, LDtk, CSV, dialogue). Both are plugins (section 9).
- **Groups** decide packing: each group becomes one pack file (or one contiguous range of one pack), loaded and unloaded as a unit.
  An asset in several groups is stored once in a shared group (what Unity's Addressables "Check Duplicate Bundle Dependencies"
  analysis recommends, unverified here).
- **`zinc run` uses the same pipeline with dev settings** (fast encoders, or none: RGBA on desktop), so development never waits for a
  quality encode; `zinc export` and `zinc pack --release` use the release profile.

### 4.2 Textures

Steps, in order (each optional per rule): decode (stb_image, libwebp, the SVG rasterizer: all vendored) → trim transparent borders →
pack into an atlas (4.3) → resize (max size, power of two where the target needs it) → **premultiply alpha** (Zinc's rasterizer
composites premultiplied; doing it at build time removes a per-pixel pass at load and the dark fringes of filtering straight alpha)
→ **mipmaps** (filtered in linear light for sRGB colour, alpha-weighted, with `stb_image_resize2`) → encode to the profile's format
→ container (KTX2 for GPU block formats, a 16-byte Zinc header for raw layouts).

Sizes of one 2048x2048 texture with mipmaps, by format (arithmetic): RGBA8 21.3 MiB, RGB565 or RGBA4444 10.7 MiB, BC7 / ASTC 4x4 /
ETC2 RGBA8 5.3 MiB, BC1 / ETC1 / ETC2 RGB / PVRTC1 4 bpp 2.7 MiB, ASTC 8x8 1.3 MiB, CLUT8 5.3 MiB + 1 KiB palette, CLUT4 2.7 MiB + 64 B.

Rules that follow from section 3:

- **Alpha on ETC1 targets** (Pi 1-3, CHIP): ETC1 has no alpha. Opaque art goes ETC1; art with alpha goes RGBA4444/5551, or ETC1
  colour plus a second ETC1 texture for alpha (one extra sample in the shader) when memory matters more; the 3DS has ETC1A4.
- **Power of two and squares**: the PSP, 3DS and PVRTC (square too) need them, WebGL1 needs them for mipmaps and repeat. Atlases make
  this nearly free (pages are allocated at the right size); single textures are padded, not stretched, and the UV scale is stored
  with the texture.
- **Normal maps and masks** take two-channel formats where they exist (BC5, EAC RG11) and stay linear (no sRGB).
- **Palettes** (PSP CLUT4/CLUT8, indexed ESP32 art): quantised with exoquant (MIT) at build; the palette in the target's 16-bit
  format; pixel art that is already indexed keeps its palette exactly.
- **Console layouts** (PSP swizzle in 16-byte by 8-row blocks, 3DS 8x8 Morton tiles, Vita swizzle) are a last, lossless pass
  after encoding, each tested against a reference decoder.
- **Dev profile**: `zinc run` uses RGBA8 (or etcpak for an ETC preview), so a change shows in milliseconds; quality encoders run on
  `export`, `pack --release` and in CI, where their cache is shared.

### 4.3 Sprites and atlases

- **Packer:** `stb_rect_pack` (public domain, same repository as the vendored stb headers) for the common case; rectpack2D (MIT) only
  if measured occupancy matters. Options: trim, extrude (repeat the border pixels 1 to 2 px against bleeding when filtered), padding,
  power-of-two pages, max page size per target (512 on PSP and 1024 on 3DS, their maxima; 1024 on Pi 1-3 for memory; 2048 or 4096 elsewhere), rotation off by default
  (rotated frames complicate every renderer).
- **Inputs:** loose PNG/SVG files (frame name = path), Aseprite (`aseprite -b --sheet --data` JSON, tags become animations) and the
  TexturePacker "JSON hash" format that Phaser, PixiJS and others read **[W]**, so existing art pipelines plug in.
- **Output:** one texture per page in the target format plus a frame table (name hash → page, rect, trimmed offset, original size,
  pivot) and animation table (frames, durations, loop), binary in the pack.
- **Run time:** `zinc:gfx` needs one new row, `drawImageRect(img, sx, sy, sw, sh, dx, dy, dw, dh, alpha, flags)` (flip x/y, nearest/linear),
  in the software rasterizer, `display-gl` (UVs into the existing batcher) and the wasm host; a small pure-Zinc `zinc:sprite` module adds
  frames and animations on top. This is independent of ZN-182, which is the renderer's own glyph and image cache.

### 4.4 Fonts

- **Bake only what is used.** The grid font tables (416 KB in game-2d) only when the program calls `gfx.text`; the TrueType files
  **subset** to the characters the scan found plus a declared extra set, with HarfBuzz's `hb-subset` (already vendored with HarfBuzz
  14.6.0, `third_party/harfbuzz/src/hb-subset*.cc`). Programs that ask for `"text": "shaped"` keep whole fonts (shaping needs them).
  Expected effect on game-2d: 1.7 MB to a few hundred KB **[I]**.
- **SDF/MSDF for scalable text.** Bitmap glyph tables stay the default (pixel-exact, the goldens depend on them). For GPU targets that
  scale or rotate text (3D labels, zoomable maps), an MSDF atlas made by `msdf-atlas-gen` with a 20-line fragment shader keeps edges
  sharp at any size. It is a texture rule (`"as": "font", "sdf": "msdf"`) in a plugin, not core.
- **Charset declaration** for text that comes from data (dialogue files, translations): `"charset": ["latin-1", "assets/i18n/*.json"]`,
  because the program scan cannot see it (`zinc-next-resources.md`, "Not covered").

### 4.5 Audio

- **Sources** stay lossless (WAV, FLAC; AIFF and MP3 accepted), read with dr_libs. The importer resamples (r8brain), downmixes
  effects to mono unless told otherwise, normalises loudness when a rule asks (`"loudness": -16`, EBU R128 through libebur128), and
  encodes per profile.
- **Two classes, two strategies.** Effects are short, many and must start at once: preloaded, decoded to PCM at load on fast targets,
  or kept in a codec whose decode is a few operations per sample (IMA ADPCM, 4:1; QOA, 3.2 bits per sample, "3x faster than Vorbis" by
  its author **[W]**) where memory is short. Music is long and single: streamed from the mapped pack through a small ring buffer, in the
  densest codec the target decodes cheaply.
- **Measured on one effect [M]** (1.2): 132 KB of PCM become 34 KB in IMA ADPCM, 13.5 KB in AAC 64 kbit/s and 6.5 KB in Opus 48 kbit/s.
  For a game with 200 short effects the difference between ADPCM and Opus is a few MB; for an hour of stereo music (PCM 635 MB, IMA ADPCM
  159 MB, Opus 96 kbit/s 43 MB, arithmetic) it decides whether the game fits.
- **Per target**: section 3. The hardware decoders (PSP Media Engine, Vita sceAudiodec, 3DS DSP, iOS AudioToolbox) take their own
  formats (MP3/ATRAC3+, ATRAC9/MP3/AAC, DSP-ADPCM, AAC/IMA4). Open encoders exist for MP3 (LAME is LGPL: run as a tool, never linked),
  AAC and IMA4 (Apple's framing of IMA ADPCM; the iOS target builds on a Mac, where `afconvert` is part of the OS), and DSP-ADPCM (community encoders,
  unverified); ATRAC3+ and ATRAC9 have no open encoder that this survey could confirm, so the PSP and Vita profiles default to MP3
  and PCM/ADPCM.
- **Run time**: miniaudio (ZN-390) for devices and mixing on desktop, Pi and CHIP; dr_wav for WAV and ADPCM; QOA's 758-line header;
  stb_vorbis or libopus as optional decoders plugged into miniaudio (miniaudio 0.11.25 does not build them in **[W]**); on the
  consoles and the ESP32 the platform's audio output behind the same `zinc:audio` API. In the browser, music goes through
  `decodeAudioData` (Opus, with MP3/AAC as the fallback for Safari before 18.4) and effects through QOA decoded in the wasm module, which
  behaves the same in every browser.

### 4.6 3D models

- **Interchange: glTF 2.0 only** (GLB or glTF + files). FBX and OBJ convert at import (OBJ is already read by `zinc:3d`; FBX through
  ufbx only if an author needs it).
- **Processing with gltfpack** (part of meshoptimizer, MIT; the library 1.3 is already vendored for D25): vertex cache and fetch
  optimisation, quantisation (`KHR_mesh_quantization`: 16-bit positions, 8-bit normals and UVs), `EXT_meshopt_compression`, simplification
  into LODs (`meshopt_simplify`, ratios per rule), texture handoff to the texture importer (KTX2). Draco is accepted as input
  (decoded at build) but not shipped: its decoder is 286 KB of wasm with no release since 2024 **[W]**, while the meshopt decoder is
  a few files of the library already vendored (`vertexcodec.cpp`, `indexcodec.cpp`, `vertexfilter.cpp`, built today as `zn_meshopt`
  for the ZN-119 cross-check only) that the three plugin can link.
- **Target-native meshes.** For the software `zinc:3d`, PSP, 3DS and the Pi 1, the importer writes a `.zmesh` that is directly the
  vertex layout the renderer wants (int16 positions with a scale, packed normals, strips for the PSP's GE if measured faster), so loading
  is a memcpy or nothing. three.js on WebGL keeps GLB (`GLTFLoader` reads it, with `EXT_meshopt_compression` decoded by the same library).
- **Skinning and animation**: kept as glTF data; resampling and compression of animation curves is a later option of gltfpack.

### 4.7 Shaders

D29 already fixes one GLSL ES source with a generated prelude for ES2, ES3 and GL 3.3. At build time the shader importer:
validates each variant with glslang (vendored, as the WebGL layer does), strips comments and unused code, and stores the variant per
profile. GLES2 has no portable binary format, so "precompiled" means validated and minimised at build, then **cached as a program binary
on the device** at first run (`GL_OES_get_program_binary` where present) to remove compile hitches on the next start. The consoles do
not run GLSL: the PSP's GE is fixed-function, the 3DS PICA200 takes assembled vertex shaders (`picasso`) and a fixed-ish fragment
combiner, the Vita compiles Cg to GXP offline. There the shading of `zinc:gfx` and `zinc:3d` is written per backend, and user
shaders are a GL/WebGL feature only.

### 4.8 Levels and tile maps

- **Tiled** (`.tmj` JSON preferred, `.tmx` XML accepted; the Tiled CLI can export from the command line, `tiled --export-map`) and
  **LDtk** (`.ldtk` JSON) import through a `script` importer: layers become `u16` tile arrays (run-length or zstd in the pack),
  objects become records with typed properties, tilesets go through the atlas and texture importers, so the level references texture
  pages and frame ids instead of file names.
- **Run time:** `zinc:tilemap` (pure Zinc plugin) draws visible chunks with `drawImageRect` or a cached `beginImage` layer per chunk
  (the render-target API exists), and exposes collision layers and objects. Big worlds load chunks by group or by region (6.5).

### 4.9 Determinism and the cache

- Cache key: XXH3-128 of (importer id, importer version, tool hash, options after defaults, profile, source bytes, and the keys of its
  inputs). Integrity of shipped data stays SHA-256 (it is what `manifest.json` and the update manifests already use).
- Tools pinned like zig (`src/tc`): archive name, SHA-256, downloaded on first use into `~/.zinc/toolchains`, mirrored by
  `ZINC_MIRRORS`. Multi-threaded encoders are run with a fixed thread count or a mode documented as deterministic; a test bakes the
  same project twice in two directories and compares every pack byte (the ZN-333 pattern).
- `SOURCE_DATE_EPOCH` and sorted order in every container (the ustar writer of `zapp.cpp` already does this).
- `zinc assets verify` re-imports a sample of cached artifacts and compares hashes (catches a corrupted cache or a non-deterministic tool).

### 4.10 Libraries and tools

Versions and licences checked on 2026-10-09 against each project's releases or tags **[W]** (links in section 13). "Baker" means the
build-time importer plugins (desktop only, never linked into a game); "runtime" means linked into programs that use the feature.

| Library or tool | Version (date) | Licence | Role in Zinc | Notes |
| --- | --- | --- | --- | --- |
| basis_universal (basisu) | v2.50 (2026-08-03) | Apache-2.0 | **Baker hub for GPU textures**: encodes ETC1S, UASTC LDR/HDR, ASTC LDR 4x4 to 12x12, XUASTC; writes KTX2; transcodes to BC1-5/6H/7, ETC1, ETC2, EAC, ASTC, PVRTC1/2, ATC, 565/4444/8888. **Runtime only in the browser** (transcoder, about 515 KB of wasm) | PVRTC1 output is power-of-two only and the lowest-quality format of the set |
| KTX-Software (libktx, `ktx`) | 4.4.2 (2025-10-04); 5.0.0-rc2 pre-release | Apache-2.0 | reference reader/validator in tests | v5 drops `toktx` and changes the Basis parameters; basisu writes KTX2 itself, so not needed in the baker |
| astc-encoder (astcenc) | 5.7.0 (2026-07-31) | Apache-2.0 | baker, when ASTC quality matters (Apple Silicon, Pi 4/5 on current Mesa, WebGL on phones) | slow in `-thorough` |
| etcpak | 2.1 (2026-02-22) | BSD-3 | baker, **dev profile** (very fast ETC1/ETC2/BC1-7) | quality below basisu/astcenc |
| bc7enc_rdo | commit 2026-07-31 | MIT or Unlicense | baker, BC7 with rate-distortion optimisation (smaller after zstd) | fast path needs ISPC |
| PVRTexTool / PVRTexLib | unverified (2025 R1) | proprietary EULA | **optional external tool** the user installs, for better PVRTC on the iPhone 4S | closed source: not vendorable, not buildable with zig |
| PVRTCCompressor (BSD-3), harumazzz/pvrtc (MIT) | 2015 / unverified | BSD-3 / MIT | fallback PVRTC1 encoders | crude; basisu's transcode is the default |
| stb_image_resize2, stb_rect_pack, stb_dxt | 2.18b, 1.01, 1.12 | MIT or public domain | baker (mipmaps, atlas packing); `stb_dxt` only for dev | same repository as the vendored `stb_image` |
| rectpack2D | 2026-08-09 | MIT | baker, if `stb_rect_pack` occupancy is measured short | header only |
| exoquant | 2018 | MIT | baker, palettes for CLUT4/CLUT8 (PSP) and indexed ESP32 art | libimagequant/pngquant are GPL-3 or commercial: excluded |
| msdfgen / msdf-atlas-gen | 1.13 / 1.4 | MIT | baker, MSDF font atlases | font loading needs FreeType (FTL licence chosen) |
| cute_aseprite | header | zlib or Unlicense | baker, reads `.aseprite` directly | the Aseprite CLI may not be redistributed (EULA): call it only if installed |
| meshoptimizer + gltfpack | 1.3 (2026-09-25) | MIT | **already vendored** (library); gltfpack built from the same tag as the model importer | gltfpack's `-tc` needs zeux's basisu fork: textures go through Zinc's own texture importer instead |
| cgltf | 1.15 | MIT | already vendored; runtime reader | does not decode meshopt or Draco itself |
| ufbx | 0.23.1 | MIT or Unlicense | baker, FBX/OBJ import if asked | pre-1.0 |
| Draco | 1.5.7 (2024-01-17) | Apache-2.0 | input only, decoded at build | 286 KB wasm decoder, no release since 2024: not shipped |
| libopus + libopusenc | 1.6.1 / 0.3 | BSD-3 + patent grants | baker (encode); runtime decode on desktop, Pi 3+, web | decode cost on Pi 1, PSP, ESP32 unverified |
| stb_vorbis / libvorbis | 1.22 / 1.3.7 | MIT-PD / BSD-3 | runtime decode (stb_vorbis) / baker encode | stb_vorbis has a history of fuzzing bugs: trusted input only |
| dr_libs (dr_wav, dr_flac, dr_mp3) | 0.14.5 / 0.13.3 / 0.7.3 | Unlicense or MIT-0 | baker input; runtime WAV and IMA/MS ADPCM decode | single headers |
| miniaudio | 0.11.25 (2026-03-03) | Unlicense or MIT-0 | **runtime** devices and mixer (ZN-390) | Vorbis and Opus are not built in: they plug in as custom decoders |
| adpcm-xq | 0.5 | BSD-3 | baker, best-quality IMA ADPCM | |
| QOA | spec 1.0 | MIT | baker + runtime (758-line header): 3.2 bits per sample with a trivial decoder | fixed bit rate |
| r8brain-free-src / libebur128 | 6.5 / 1.2.6 | MIT / MIT | baker: resampling, loudness normalisation | |
| zstd | 1.5.7 | BSD-3 (or GPL-2) | runtime decoder + baker; dictionaries for packs of small entries | |
| lz4 (lib/) | 1.10.0 | BSD-2 (the CLI is GPL-2: not vendored) | runtime decoder everywhere | |
| xxHash (XXH3) | 0.8.4 | BSD-2 | baker cache keys | not cryptographic |
| BLAKE3 | 1.8.7 | CC0 / Apache-2.0 | candidate for content addressing | Zinc keeps SHA-256 for shipped integrity (already in the signed manifests); BLAKE3 only if hashing time shows up |
| PhysicsFS | 3.2.0 (2022) | zlib | not adopted | a pack with an index and a mount order covers mods; no release since 2022 |
| glslang | 16.6.0 (vendored 15.1.0) | BSD-3 and others | already vendored; shader validation in the baker | |
| SPIRV-Cross + SPIRV-Tools | 1.4.363 / 2026.4 | Apache-2.0 | only if authors write GLSL 4.50 and Zinc down-converts to ESSL 1.00 | output on VideoCore IV, Mali-400 and SGX untested: D29's single-source prelude stays the default |
| glslx | 2026-08-30 | MIT | optional minifier of WebGL GLSL ES 1.00 | JS tool |
| Tiled / LDtk | 1.12.2 (GPL-2 editor, BSD-2 libtiled) / 1.5.3 (MIT) | | file formats read by `script` importers | never link the editor; LDtk had no release since 2024-01 |
| tmxlite / cute_tiled | 1.4.5 / 2026-08 | zlib | not needed: the formats are JSON (yyjson is vendored) | `.tmx` XML through tmxlite only if asked |
| QuickJS-ng | 0.17.0 (vendored) | MIT | `JS_WriteObject` / `JS_ReadObject` bytecode | rejected on any `BC_VERSION` mismatch, native-endian (every Zinc target is little-endian); trusted input only |
| esbuild | 0.28.2 | MIT | bundling, tree shaking and minifying npm dependencies for QuickJS | one Go binary, a pinned tool like zig |

## 5. Code: size and start-up

| Lever | State | Proposal |
| --- | --- | --- |
| **Whole-program dead code removal** | none: 221 functions emitted, ~24 reachable in game-2d [M] | After lowering, a reachability pass over the ZBC module from `main`, the vtables of constructed classes, closures and the functions runtime rows call back; drop the rest before encoding (interpreter and AOT both benefit). First lever for the ESP32's 48 KB. |
| **AOT or bytecode per target** | AOT through `zinc build`/`export`; ZBC for `run`, `.zapp`, ESP32, wasm [C] | Keep: AOT for exports on desktop, Pi, CHIP, iPhone and the consoles (no JIT anywhere, D13/D36; the App Store forbids downloading code that changes an app's features, guideline 2.5.2 **[W]**, so bytecode is bundled or compiled, and AOT is simpler and faster on an A5); ZBC for `zinc run`, `.zapp`, the ESP32 core and the browser (a wasm AOT build through `zig c++ --target=wasm32-wasi` is a later option once the browser host draws images). |
| **Compress the bytecode** | ZBC stored raw | ZBC as a pack member with zstd (60 KB → 18 KB measured) or lz4 on small targets. |
| **QuickJS sources** | stripped of types and parsed at every run (`src/qjs/strip.cpp`) [C] | For packed and exported apps: compile once with `JS_WriteObject` (bytecode, debug info stripped), store in the pack, load with `JS_ReadObject`; the bytecode is tied to the exact QuickJS-ng version, so the pack records it and falls back to the source when they differ. Minify (esbuild) only where bytes matter (wasm download, flash): the earlier study measured no parse-time gain from it. Tree-shake npm dependencies with the bundler (esbuild) at build. |
| **Chunks loaded on demand** | one ZBC module | Not now. Games load data on demand, rarely code; the browser is the only target where code size delays the first frame, and dead-code removal plus zstd attack that first. If a measured case appears, `import()` becomes the chunk boundary (one ZBC module per dynamic import, linked at load against the main module's tables). |

## 6. Loading at run time

### 6.1 The pack format: ZPK

The `.zapp` stays the distribution envelope (one file, `tar tf` lists it, signed manifest slot), but game data goes into **packs**:

```
ZPK1 header (32 B): magic, version, flags, entry count, TOC offset, string table offset, data alignment
TOC (sorted by name hash, 48 B per entry): name hash (64-bit), name offset, group, kind, codec (none|lz4|zstd|zstd-dict),
     offset, stored size, size, SHA-256 truncated to 128 bits... (full SHA-256 in the signed manifest)
string table: the names
data: entries in group order, each aligned (16 B default; 4 KiB or 2 KiB when the target reads sectors: UMD, SD, flash pages)
```

- **Lookup** is a binary search in the mapped TOC; **no full read, no full hash at launch**: an entry is verified when first read (its
  hash against the TOC, the TOC against the signed manifest), so the 2-second, 500 MB launch of 1.2 becomes a few `mmap` calls.
- **Per-entry codec.** GPU block formats and Opus/Vorbis are stored without a general compressor or with lz4 (fast, little gain on
  already-dense data); raw layouts (RGBA, RGB565, meshes, tile arrays, ZBC) with zstd, optionally a dictionary trained per pack for
  many small entries; the ESP32 profile uses lz4 only (tiny decoder, no window to allocate).
- **Group order** keeps what loads together contiguous: one sequential read per group on optical or SD media, one HTTP request per group
  in the browser.
- **Mounting and overlays:** the asset manager searches mounted packs in order (mods and DLC first, then patches, then the base), the
  same model as Godot's resource packs and Defold's Live Update **[W]**, without a VFS library.
- **Inside the `.zapp`** the pack is a stored ustar member: tar data starts on a 512-byte boundary, so the pack is mapped in place from
  the `.zapp` without unpacking; `program.zbc` and `resources.bin` become entries of the boot pack.

**Proposed decision (pack format).** Scored like the decision records (fit x3, performance x3, size x2, maintainability x2,
licence x2, portability x1, effort x1; 1 to 5):

| Option | Scores | Total |
| --- | --- | ---: |
| **ZPK: own indexed binary, stored inside the `.zapp`** | 5, 5, 5, 4, 5, 5, 3 | **66** |
| ustar only, plus an index member and lazy hashing | 4, 4, 3, 5, 5, 5, 5 | 60 |
| zip through miniz | 3, 3, 4, 4, 5, 5, 4 | 53 |
| PhysicsFS over zip | 3, 3, 3, 3, 5, 4, 4 | 48 |

The ustar option is the cheapest first step and is worth doing anyway for small apps (task G03), but a 512-byte header plus padding
per entry costs about 100 KB for 128 entries, which matters on a 4 MB ESP32 flash, and its headers are scattered through the data.
Zip reads deflate in practice (the zstd method is rarely implemented) and PhysicsFS has had no release since 2022 **[W]**. The ZPK
reader is a few hundred lines with no dependency beyond lz4 and zstd, which are needed anyway.

### 6.2 Where the packs live, per target

| Target | Location | Read path |
| --- | --- | --- |
| macOS | `Name.app/Contents/Resources/*.zpk` | `mmap` |
| Linux, Pi, CHIP | beside the executable (`/opt/<name>/`), or appended to a single-file executable | `mmap` |
| `.zapp` / fused | stored members of the archive | `mmap` of the archive at the member's offset |
| iPhone 4S | the app bundle | `mmap` (read-only bundle files map well on iOS) |
| PSP | `EBOOT.PBP` data section or files beside it on the Memory Stick; UMD ISO for discs | sector reads into RAM, no mmap |
| Vita | files in the VPK (`ux0:app/<id>/`) | `sceIoRead`, mmap not offered to homebrew **[I]** |
| 3DS | RomFS of the `.3dsx`/CIA | `fread` from `romfs:` |
| ESP32 | a data partition flashed beside `app.bin` | `esp_partition_mmap`: entries read through the flash cache with no RAM copy |
| Browser | one file per group, content-hashed URL | `fetch` with progress, kept in Cache Storage |

An AOT program that must be one file (bare-metal Pi, a Linux single binary) embeds its boot pack with `.incbin` (measured 50 MB in 1.1 s,
142 MB) instead of the decimal array; `#embed` is the fallback where an assembler file is impractical.

### 6.3 The run-time API (`zinc:assets`, version 2)

```ts
import * as assets from 'zinc:assets';

await assets.loadGroup('level1', (p) => bar(p.done / p.total));   // bytes, monotone, from the TOC sizes
const hero = assets.sprite('hero');          // handle; throws if its group is not loaded
const tiles = assets.tilemap('levels/level1');
const music = assets.sound('music/level1');  // streamed (rule "stream": true)
assets.prefetch('level2');                   // background priority
assets.unloadGroup('menu');                  // handles keep data alive until released
assets.stats();                              // resident bytes per kind and per memory pool, against the target's budget
if (DEV) assets.onReload('hero', () => { /* hot reload hook */ });
```

The version-1 calls stay (`readText`, `readBytes`, `exists`, `list`) and read through the packs. Handles are reference counted by the
runtime; an unloaded group frees what no handle holds. A zero-copy `bytes(name)` view over the mapped pack needs a runtime type for
external buffers and is a separate step.

### 6.4 Threads, priorities, upload budgets

- **Scheduler:** one queue per priority (critical: something the current frame waits for; group preload; background prefetch); requests
  are cancelled when their group is unloaded before they finish.
- **Decode off the main thread** where there are threads: the libuv thread pool already linked on desktop and the Pi (`uv_queue_work`);
  a worker in the browser (the export already needs `SharedArrayBuffer`); the second core on the ESP32 (FreeRTOS task) and the
  Vita/3DS extra cores; on one-core targets (Pi 1, PSP's main CPU) decode is sliced per frame under a time budget (2 ms default).
- **Upload budget per frame** for GPU textures and meshes (bytes per frame, per profile), so a level load never stalls one frame
  for 200 ms; the loader stage (7.5) lifts it because nothing else is drawn.
- **Completion** resolves promises on the main thread (the microtask queue of the interpreter), never inside a frame callback.

### 6.5 Streaming

Music and long voice lines stream from the mapped pack through a small ring (Opus/Vorbis pages or ADPCM blocks); textures and meshes
load whole (mip streaming and region streaming are later options with their own measured need). Big worlds are cut into groups per
region and loaded with `prefetch` as the player moves; that is a pattern in the template, not engine code.

### 6.6 Memory budgets per target

Starting values for `targets/capabilities.json` (to be replaced by measurements on each device; sources in section 3). "GPU" is
what textures, meshes and render targets may use; "boot" is what must be resident before `main`.

| Target | Program + assets RAM | GPU | Boot | Notes |
| --- | --- | --- | --- | --- |
| Desktop | 1 GB | 512 MB | 32 MB | soft limits, warnings only |
| Pi 1 (512 MB) | 150 MB | 40 MB | 4 MB | Mesa vc4 allocates from CMA (64 MB by default; raise with `cma=`) |
| Pi 3 | 500 MB | 40 MB (default CMA), up to 200 MB with `cma=256M` | 8 MB | |
| Pi 4/5 | 1 GB | 256 MB | 16 MB | |
| CHIP | 200 MB | 64 MB | 4 MB | |
| iPhone 4S | 200 MB in total | inside the 200 MB | 8 MB | the system kills above an unverified threshold |
| PSP | 20 MB (PSP-1000) / 48 MB (2000+) | 2 MB VRAM (+ textures from RAM) | 2 MB | user partition sizes unverified |
| Vita | 200 MB | 100 MB CDRAM | 8 MB | |
| 3DS / New 3DS | 48 MB / 100 MB | 6 MB VRAM + linear RAM | 2 MB | app region 64 / 124 MB |
| ESP32 | 96 KB heap; assets stay in flash | n/a | 16 KB | strip buffers in internal DMA RAM |
| Browser | 512 MB | 256 MB | 3 MB download | the boot download is what decides the time to first frame |

The asset manager counts what it loaded per pool (CPU, GPU, audio) against these numbers: `zinc assets check` fails the build when a
group cannot fit, and at run time `loadGroup` refuses a group that would cross the budget instead of letting the OS kill the game.

### 6.7 The browser

- **First paint before any script:** the splash is inline in `index.html` (7.3).
- `WebAssembly.compileStreaming(fetch('app.wasm'))` (it requires `Content-Type: application/wasm`, which `serve.py` already sends)
  instead of `arrayBuffer()` then `compile`, so compilation overlaps the download; V8 also caches the compiled code of a streamed
  module of 128 KB or more under its URL, so a versioned, unchanged `app.wasm` starts faster on the next visit **[W]**.
- Packs fetched per group, progress counted by a `ReadableStream` reader against the sizes of a small boot manifest (with
  `Content-Encoding`, `Content-Length` is the compressed size, which Godot and Defold also work around with their own size lists **[W]**),
  stored in Cache Storage under content-hashed names (`level1.3f9a…zpk`): the second visit loads from the cache with no network.
- Compressed transfer (Brotli or gzip) by the server for `app.wasm`, `app.zbc` and raw-layout packs; KTX2 and Opus gain nothing.
- Today's browser host draws through a 2D canvas and has no images (1.1); textures in the browser need either `drawImage` of decoded
  bitmaps in that canvas, or the WebGL path. The texture format there is KTX2 (ETC1S or UASTC) transcoded in the worker to what the
  browser's WebGL exposes (BC on desktops, ETC2/ASTC on phones), since the GPU is unknown until run time.

## 7. The start experience

### 7.1 Prior art

| Engine | Splash | Loading and packs | What Zinc takes | What Zinc avoids |
| --- | --- | --- | --- | --- |
| **Unity** | Player setting: logos (2 to 10 s each), background colour or image, static or animated; shown while the first scene loads asynchronously, the background stays until it is ready. iOS launch screen chosen per device (image, storyboard); on Android 12+ the splash background colour must match the system splash | Addressables: groups, labels (union/intersection), bundle modes (together, separately, by label), LZ4 (chunked, partial reads) for local content, LZMA only for remote; `GetDownloadSizeAsync` then `DownloadDependenciesAsync` with byte-weighted `GetDownloadStatus().Percent`; content updates through a catalog and its hash. Import keyed on importer version, platform and settings; Accelerator caches artifacts | groups and labels, byte-weighted progress, "download size first", local packs uncompressed or lz4, an import cache keyed on importer version and target | the `Resources` folder's global index loaded at start (seconds on low-end phones, deprecated by Unity); a forced branded splash |
| **Godot 4** | `application/boot_splash/*`: image (PNG), `bg_color`, `minimum_display_time` (ms), `stretch_mode` (4.6), `use_filter`; drawn as the engine's first frame once the display server runs; on iOS the default logo flashes before it unless the launch storyboard is edited | `.import` sidecar per asset (committed), artifacts in `.godot/imported/<name>-<md5>` (not committed); texture modes Lossless / VRAM compressed (S3TC/BPTC on desktop, ETC2/ASTC on mobile) / Basis; export presets with per-platform texture formats; PCK packs loaded with `load_resource_pack` (later overrides earlier: DLC, mods, patches; must be mounted before anything is cached); `load_threaded_request` + `load_threaded_get_status(progress)` | the boot-splash keys, the minimum display time, pack overlays mounted before first use, polling progress | a blocking `get` on a loader thread; encryption sold as protection; delta patches from non-deterministic exports |
| **Phaser 3/4** | (web page) | `preload()` queues files, the loader runs, `create()` follows; events `progress`, `fileprogress`, `filecomplete`, `loaderror`, `complete`; `maxParallelDownloads`; asset pack JSON (sections of `{type, key, url}`); the official template's `Boot` scene loads only the preloader's art, `Preloader` draws the bar | the Boot → Preloader idiom, the event set, named sections | count-based progress (`1 - pending/total`) that jumps unevenly |
| **Defold** | HTML5 `splash_image`; iOS launch storyboard copied in | archive `game.arcd` (data) + `game.arci` (index) + `game.dmanifest` (names, hashes); texture profiles: globs → profile → per platform format (BasisU, ASTC, uncompressed), mipmaps, premultiplied alpha, max size; Live Update moves excluded collections into archives mounted with a priority; collection proxies load asynchronously **without progress** | the index read first, glob → profile mapping, mounts with priority | async loads with no progress |
| **LÖVE** | none built in; `conf.lua` runs first and `t.window = nil` delays the window | `.love` is a zip; a fused game is `love.exe + game.love` concatenated; loading screens through `love.thread` libraries (love-loader) | the fused-executable idea (already `zinc fuse`) | the zip as run-time format (a whole-archive scan) |
| **PocketJS / Pocket3D** | Pocket3D: a licensed title card of 144 ticks (2.4 s) on every target; PocketJS documents no splash and no loader | `pocket.json` with required capabilities per target and a checksummed build plan; fonts baked as coverage atlases with only the glyphs found in the source (as Zinc's baker); images, atlases, styles and the JS bundle in `app.pak`, embedded in the PSP EBOOT (8 MB arena); textures uploaded power of two, at most 512, in the PSP's formats; Pocket3D cooks `.p3d` chunks (CLUT8 swizzled textures with mips) **linked into rodata and drawn in place**, no I/O, no decompression, no upload; the browser build reads packs with HTTP range requests | data in the GPU's layout read in place; range reads in the browser; capability checks per target (Zinc has `requires`) | a fixed-length branded card; no progress API |
| **Bevy** | none | `AssetPlugin { mode: Processed }` with `.meta` files per asset and a processed-asset folder; load states with and without dependencies | "processed" as a mode of the same server | |
| **Emscripten** | the shell page | `--preload-file` → a `.data` file + loader, `--lz4`, IndexedDB preload cache; `monitorRunDependencies` reports counts, not bytes | | count-based progress |

The shared lessons: one declaration feeds every start phase; the OS splash and the engine's first frame must match exactly; progress
is weighted by bytes and comes from an index read first; packs mount in priority order before anything is cached; local packs are
stored for direct use, strong compression is for downloads; the default is no branded delay.

### 7.2 Phases

```
OS launch ──► OS splash (optional, per platform) ──► engine splash (first frame) ──► pre-launcher (optional) ──► loader (optional) ──► app
              iOS LaunchScreen, Vita LiveArea,        window + one image, before      settings, updates, mods      preload groups,
              PSP PIC1, 3DS banner, web inline HTML   compile, bake or plugin load    (a Zinc stage)              progress UI
```

Each phase is declared in `zinc.json` and absent when not declared. The engine splash and the OS splash use the same image, so the
hand-over is invisible.

### 7.3 A splash within milliseconds, per target

The principle (Godot's boot splash, Pocket3D's rodata): the splash pixels are baked **in the target's framebuffer format** and placed
where the first instructions of the host can reach them (the head of the boot pack, or the executable's read-only data), so showing
them is a copy, with no PNG decode, no compile, no plugin load and no pack mount on the critical path. The `zinc` process starts in
10 ms on the Mac [M]; everything else of the engine (compile 45 ms for game-2d, bake, native plugins, packs) moves behind the splash.

| Target | OS-provided splash (generated by the export) | Engine splash (first frame) |
| --- | --- | --- |
| macOS | none | create the window hidden, draw the splash, then show it (no white flash); before `compileToZbc`, `bakeResources`, plugin loading |
| Linux desktop | none | same as macOS |
| Pi / CHIP without a desktop | firmware rainbow off (`disable_splash=1`), quiet console (`quiet loglevel=0 logo.nologo vt.global_cursor_default=0`); optionally a Plymouth theme for appliance images | blit to the KMS dumb buffer or `/dev/fb0` before EGL/GLES initialisation (the `display-fbdev` path); GL starts behind it |
| iPhone 4S | `UILaunchStoryboardName` (iOS 8+) or `Default@2x.png` 640x960; `UILaunchScreen` on iOS 14+ devices | the first GL frame draws the same image at the same place |
| PSP | `PIC1.PNG` (480x272), `ICON0.PNG`, optional `SND0.AT3` in the `EBOOT.PBP`, shown by the XMB while the item has focus | a pre-swizzled 480x272 image copied into the framebuffer on the first VBlank, before the runtime allocates its heap |
| Vita | LiveArea `bg.png` (840x500), `startup.png` (280x158), `icon0.png` (128x128) in `sce_sys/livearea` | the same image on the first GXM frame |
| 3DS | SMDH icon (24x24, 48x48); CBMD banner for CIA titles | top and bottom screens filled from pre-tiled RGB565 data before citro3d starts |
| ESP32 | n/a | raw RGB565 mapped from flash and pushed to the panel from an `ESP_SYSTEM_INIT_FN` hook or the first lines of `app_main`, backlight off until it is drawn (a 320x240 frame is 154 KB, about 31 ms at 40 MHz SPI, plus the panel's reset delays) |
| Browser | the splash inline in `index.html` (CSS background or a small inline image), painted before any script | the worker's first canvas frame replaces it with the same image, then the loader draws over it |

`minMs` (default 0) holds the splash for a minimum time; `fadeMs` cross-fades into the next phase. Zinc adds no logo of its own.

### 7.4 The pre-launcher

A **stage** that runs before the app in the same process: a Zinc module named by `zinc.json` `launcher.entry`, given the mounted packs, the
settings store and the update API, that returns a result (`play`, `quit`, or `play` with changed settings and an enabled mod list).
The engine then mounts the chosen mods (6.1 overlays) and starts the loader and the app. It is useful for desktop and kiosk
distributions (resolution, fullscreen, quality preset, language, audio, a "check for updates" through the existing
`zinc:system/update`, mod selection), and off by default on consoles, phones and the web, where the platform owns those decisions.
A stock implementation is a plugin (`zinc-launcher`, written with `zinc:ui`), so a game either uses it with its own colours or writes
its own stage. Rules: skippable (`--skip-launcher`, "do not show again" stored with `zinc:storage`), never between the splash and the
game when nothing needs choosing, and the app reads the settings through one API (`zinc:app/settings`) whether or not a launcher ran.
Prior art: Unity's resolution dialog was removed in 2019.3 and games rebuilt it as a first scene; Bethesda's launchers keep the mod
order in `plugins.txt`, Paradox's in exportable "playsets" **[W]**. Zinc's mod list is a JSON file of pack names in mount order,
written by the launcher and read by the engine before the first mount, so a mod never sees half-cached base data (Godot's lesson).

### 7.5 The loader

- **Declarative boot:** `zinc.json` `loading.groups` lists what must be resident before `main` runs (`boot` by default). The engine runs
  the loader screen module (`loading.screen`) every frame while the asset manager loads those groups, then hands over to `main`.
- **Loader screens** are ordinary Zinc modules: a `zinc:gfx` function `(progress, dt) => void`, or a `zinc:ui` component
  `<Loader progress={p} />`. Two defaults ship in a plugin: a progress bar with the app's colours, and the splash image with a thin bar.
  `minMs` holds the screen for a minimum time (a logo that should be seen), `fadeMs` cross-fades into the first app frame.
- **Imperative in game:** the same API (`await assets.loadGroup(name, onProgress)`) drives level transitions, which is the Phaser
  "preload scene" idiom **[W]**; the template shows both.
- **Honest progress:** weights are the bytes of the TOC plus a decode weight per kind recorded by the baker; the bar is monotone and
  never reaches 100 % before the last upload; when every group is already resident (second level load, cached web visit) the loader is
  skipped instead of flashing.

## 8. Command line and workflow

```sh
zinc assets build [--target T] [--release]     # import, pack; writes build/assets/<target>/*.zpk and report.json
zinc assets ls build/assets/rpi1/level1.zpk    # entries, codec, sizes, group
zinc assets info assets/sprites/hero.png       # what each target makes of one file (format, size, time, cache hit)
zinc assets report [--json] [--diff old.json]  # per group and kind: source bytes, output bytes, GPU bytes, time; diff against a previous report
zinc assets check [--target T]                 # budgets of zinc.json: exit 1 with the offending groups (the CI gate)
zinc assets clean | verify                     # drop the cache / re-import a sample and compare hashes
```

- `zinc build`, `zinc pack` and `zinc export` call `zinc assets build` for their target; `zinc run` and `zinc dev` use the dev profile.
- **Hot reload:** `zinc dev` already polls the project every 40 ms (D31) and restarts the program on a code change. For a change under
  `assets/` it re-imports only that file (the cache makes it milliseconds for RGBA; seconds for a quality encode, so dev uses fast
  settings), sends the new entry over the dev socket, and the running program swaps the data behind the handle and calls
  `assets.onReload`: no restart, the game state survives.
- **Build profiles** are named in `zinc.json` (`assets.profiles`) and bound to targets (`targets.<id>.assets.profile`); a target without
  one gets its built-in default from `targets/capabilities.json` (a new `assets` key per target: formats, max texture size, POT, audio
  codecs, pack codec, budgets).
- **Reports:** `report.json` per target (written by every export, next to `sbom.spdx.json`), and a short table on the terminal; Atelier
  can show it later. **CI:** `zinc assets check` in the project's workflow, and in the engine's own CI for the templates.

## 9. What is core, what is a plugin

| Part | Where | Why |
| --- | --- | --- |
| ZPK reader, mount table, TOC lookup, lazy verification | **core runtime** (rt/host) | every program with assets needs it; a few hundred lines |
| lz4 decoder | **core runtime** | small, the default codec of small targets |
| zstd decoder | core on desktop, Pi, CHIP, consoles; off for ESP32 | size measured at adoption (D40 rule) |
| Asset scheduler, budgets, `zinc:assets` v2, splash hook, loader stage, launcher stage | **core runtime** | the order of start-up is the engine's job; the screens themselves are plugins |
| Import graph, cache, ZPK writer, report, `zinc assets` CLI | **core CLI** (`src/res` grows into `src/assets`) | one pipeline for every importer |
| Built-in importers: copy, PNG/JPEG/WebP/SVG to raw layouts, the font baker | **core CLI** | today's baker, reused |
| Texture encoders (basisu/KTX2, astcenc, PVRTC, console layouts) | **importer plugins** (`tool`) | large, pinned upstream CLIs, fetched on use |
| Audio encoders (libopus, libvorbis, adpcm-xq, QOA) | importer plugin | same |
| gltfpack, msdf-atlas-gen, Aseprite/TexturePacker/Tiled/LDtk readers | importer plugins (`tool` or `script`) | same |
| Runtime decoders: basis transcoder (browser), Opus/Vorbis, meshopt (already vendored) | **module plugins** linked only by the programs that use them | D40 |
| `zinc:audio`, `zinc:sprite`, `zinc:tilemap`, loader screens, `zinc-launcher` | module plugins (mostly pure Zinc) | optional features |
| Compressed texture upload in `display-gl`, WebGL extensions | display plugin / `libzn_webgl` | already plugins |

**Proposed decision (how importers run).** Same scoring:

| Option | Scores | Total |
| --- | --- | ---: |
| **Pinned upstream command-line tools (basisu, gltfpack, astcenc, opusenc...) driven by a small recipe, run as subprocesses; data formats as Zinc `script` importers** | 5, 4, 5, 5, 5, 4, 5 | **66** |
| In-process importers behind a C table in a shared library (the plugin ABI, D2's dlopen path) | 4, 5, 3, 3, 5, 4, 2 | 55 |
| Everything as Zinc scripts run by the interpreter | 2, 1, 5, 4, 5, 5, 3 | 45 |

Subprocesses give crash isolation, parallelism by process (a `-j` that respects the 16 GB machines: `ZINC_ASSET_JOBS`), and zero
glue against library APIs that change between versions (the basisu 2.x and KTX 5 changes above); the cost of spawning a process is
milliseconds against encodes of seconds. The tools are built per host with the pinned zig by the plugin system (or fetched prebuilt
through the index, ZN-337) and listed in the SBOM of the build machine, not of the game. A `plugin.json` of kind `importer`:

```json
{
  "name": "tex-basis",
  "kind": "importer",
  "description": "GPU textures through basis_universal: KTX2, ETC1S/UASTC, transcoded per target",
  "importer": {
    "as": ["texture"],
    "extensions": [".png", ".jpg", ".webp", ".svg"],
    "tool": { "name": "basisu", "version": "2.50", "sources": "upstream", "sha256": "…" },
    "outputs": ["ktx2", "bc1", "bc3", "bc7", "etc1", "etc2", "astc", "pvrtc1"],
    "version": 1
  },
  "targets": { "macos": {}, "linux": {} }
}
```

**Proposed decision (texture strategy).**

| Option | Scores | Total |
| --- | --- | ---: |
| **basisu as the hub: encode once (UASTC for quality, ETC1S for size), transcode at build time to each target's native format; runtime transcoder only in the browser; astcenc / bc7enc_rdo as quality options** | 5, 5, 4, 4, 5, 4, 4 | **64** |
| A native encoder per format (astcenc, bc7enc, etcpak, PVRTexTool...) | 4, 5, 3, 2, 3, 4, 2 | 49 |
| KTX2 shipped everywhere, transcoded at run time | 3, 3, 2, 5, 5, 2, 5 | 49 |

ETC1S is "a supercompressed subset of ETC1" (basisu README **[W]**), so the ETC1 targets (Pi 1-3, CHIP, 3DS) get valid ETC1 blocks
without a second encode; the consoles still need their layout steps (swizzle, tiling, palettes) after it. The basisu compressor is
multithreaded by default and its README says nothing about deterministic output: the determinism test of 4.9 decides whether the
baker runs it with one thread.

## 10. `zinc.json` schema proposal

New top-level keys: `assets` (object; today a known key whose string value Next ignores, since the directory is always `assets/`
beside the entry file or its parent, `main.cpp`; the string form stays accepted as `dir`), `splash`, `launcher`, `loading`, and
`targets.<id>.assets`. Everything is optional; a project without them builds exactly as today (assets copied, fonts and images
baked into `resources.bin`).

```json
{
  "name": "coin-rush",
  "app": { "id": "com.example.coinrush", "name": "Coin Rush", "version": "1.0.0" },
  "entry": "src/main.ts",

  "assets": {
    "dir": "assets",
    "rules": [
      { "match": "sprites/**/*.{png,svg,aseprite}", "as": "sprite", "atlas": "sprites", "trim": true, "extrude": 1 },
      { "match": "textures/**/*.{png,jpg}",          "as": "texture", "mips": true, "srgb": true, "maxSize": 2048 },
      { "match": "textures/**/*_n.png",              "as": "texture", "mips": true, "srgb": false, "normalMap": true },
      { "match": "music/**/*.{wav,flac}",            "as": "audio", "stream": true, "loudness": -16 },
      { "match": "sfx/**/*.wav",                     "as": "audio", "stream": false },
      { "match": "models/**/*.{gltf,glb}",           "as": "model", "lods": [1, 0.5, 0.2], "quantize": true },
      { "match": "levels/**/*.{tmj,tmx,ldtk}",       "as": "tilemap" },
      { "match": "fonts/*.{ttf,otf}",                "as": "font", "sdf": false, "charset": ["latin-1", "assets/i18n/*.json"] },
      { "match": "shaders/**/*.glsl",                "as": "shader" },
      { "match": "data/**",                          "as": "copy" }
    ],
    "groups": {
      "boot":   { "include": ["fonts/**", "sprites/ui/**", "sfx/click.wav"] },
      "menu":   { "include": ["music/menu.flac", "sprites/menu/**"] },
      "level1": { "include": ["levels/level1.tmj", "sprites/level1/**", "music/level1.flac"] }
    },
    "profiles": {
      "dev":     { "texture": "rgba8", "audio": "pcm", "pack": "none" },
      "desktop": { "texture": "bc7|bc1", "audio": "opus:96", "sfx": "opus:64", "pack": "zstd" },
      "web":     { "texture": "ktx2:uastc", "audio": "opus:64", "pack": "none", "split": "group" },
      "pi":      { "texture": "etc1|rgba4444", "maxSize": 1024, "audio": "vorbis:q2", "sfx": "adpcm", "pack": "lz4" },
      "tiny":    { "texture": "rgb565", "maxSize": 320, "audio": "adpcm:16000", "pack": "lz4" }
    },
    "budgets": {
      "rpi1":  { "download": "48MB", "gpu": "40MB", "boot": "4MB" },
      "esp32": { "flash": "2MB", "ram": "96KB" },
      "wasm":  { "boot": "3MB", "download": "40MB" }
    }
  },

  "splash":   { "image": "assets/splash.png", "background": "#101418", "fit": "contain", "minMs": 0, "fadeMs": 150 },
  "launcher": { "entry": "src/launcher.tsx", "skippable": true, "targets": ["macos", "linux"] },
  "loading":  { "screen": "src/loading.ts", "groups": ["boot", "menu"], "minMs": 300, "fadeMs": 150 },

  "targets": {
    "macos": { "width": 960, "height": 540, "assets": { "profile": "desktop" } },
    "rpi1":  { "width": 640, "height": 400, "assets": { "profile": "pi" } },
    "wasm":  { "width": 960, "height": 540, "assets": { "profile": "web" } }
  }
}
```

| Key | Type | Meaning |
| --- | --- | --- |
| `assets.dir` | string | the source directory (default `assets`) |
| `assets.rules[]` | array | applied in order, every matching rule merges its keys and a later rule overrides an earlier one (so `*_n.png` after `*.png` turns sRGB off for normal maps); `match` (glob), `as` (importer kind: `sprite`, `texture`, `image`, `audio`, `model`, `tilemap`, `font`, `shader`, `copy`, or a plugin's kind), the other keys are the importer's options; a file no rule matches keeps today's behaviour (PNG, JPEG, WebP, SVG baked as images, TrueType as fonts, anything else copied) |
| `assets.groups.<name>` | object | `include` (globs of sources), optional `exclude`, `priority`; an unlisted asset goes to group `default`; `boot` is preloaded when `loading` is absent but the group exists |
| `assets.profiles.<name>` | object | the encoder choices: `texture` (formats in preference order, `\|` = fallback when the image does not suit the first, e.g. no alpha), `maxSize`, `pot`, `audio` (music) and `sfx` codecs with their rate or quality, `pack` (`none`, `lz4`, `zstd`, `zstd-dict`), `split` (`group`: one file per group) |
| `assets.budgets.<target>` | object | limits checked by `zinc assets check`: `download`, `boot` (bytes resident before `main`), `gpu`, `ram`, `flash`; units B, KB, MB |
| `targets.<id>.assets` | object | `profile` name, or inline profile keys that override the target's default |
| `splash` | string or object | an image path, or `image`, `background`, `fit` (`contain`, `cover`, `center`), `minMs`, `fadeMs`; per target under `targets.<id>.splash` |
| `launcher` | object | `entry` (a Zinc module exporting a stage), `skippable`, `targets` (where it runs; none means nowhere) |
| `loading` | object | `screen` (`default`, `bar`, or a module), `groups` to preload before `main`, `minMs`, `fadeMs` |

`targets/capabilities.json` grows an `assets` entry per target with the default profile (formats the GPU takes, max texture size,
power-of-two rule, audio codecs it decodes cheaply, pack codec) and the default budgets, so `zinc assets check` works without any
project configuration and a project only writes what differs.

## 11. Backlog

Ordered so that each phase is usable on its own: phase A fixes what was measured in 1.2 with no new format; phase B is the pipeline
and the run-time core; C adds formats; D the start experience; E the workflow (A: G01-G05, B: G06-G10, C: G11-G18, D: G19-G22,
E: G23-G25). Keys `G01..G25` are local to this report (the
`tools/tasks-import` step gives them ZN numbers); dependencies name keys or existing tasks.

| # | Key | Title | Depends on |
| ---: | --- | --- | --- |
| 1 | G01 | Bake only the fonts a program uses (grid fonts on demand, subset TrueType with hb-subset) | |
| 2 | G02 | AOT programs embed their resources with `.incbin` | |
| 3 | G03 | Launch a `.zapp` without reading or hashing the whole archive | |
| 4 | G04 | Remove unreachable functions from the ZBC module | |
| 5 | G05 | `zinc:gfx` source rectangles and images from bytes; the browser host draws images | |
| 6 | G06 | ZPK pack format, lz4 and zstd vendored (decision record) | |
| 7 | G07 | Asset build graph and content-addressed cache (`src/assets`, `zinc assets build`) | G06 |
| 8 | G08 | `zinc.json` keys `assets`, `splash`, `loading`, `launcher`; target defaults in capabilities | G07 |
| 9 | G09 | `zinc:assets` v2: mounts, groups, progress, budgets, threads | G06, G08, ZN-314 |
| 10 | G10 | `zinc assets` ls, info, report, check, clean, verify | G07, G08 |
| 11 | G11 | Sprite atlases and `zinc:sprite` | G05, G07 |
| 12 | G12 | Texture importer `tex-basis` and compressed uploads (decision record) | G07, G08 |
| 13 | G13 | Audio pipeline on `zinc:audio`: codecs, streaming, importer | ZN-390, G06, G07 |
| 14 | G14 | Model importer on gltfpack; meshopt decode in `three`, `.zmesh` for `zinc:3d` | G07, G12 |
| 15 | G15 | Font importer: subsets, charsets, MSDF option | G01, G07 |
| 16 | G16 | Tile maps: Tiled and LDtk importers, `zinc:tilemap` | G07, G11 |
| 17 | G17 | Shader validation at build, program binary cache on device | G07 |
| 18 | G18 | QuickJS bytecode in packs | G06 |
| 19 | G19 | Engine splash from the first frame | G08 |
| 20 | G20 | Loader stage and default loader screens | G09, G19 |
| 21 | G21 | Pre-launcher stage, `zinc-launcher` plugin, settings and mods | G09, G20 |
| 22 | G22 | Browser loading path: streaming compile, group packs, Cache Storage, KTX2 | G05, G06, G12, G19 |
| 23 | G23 | Asset hot reload in `zinc dev` | G07, G09 |
| 24 | G24 | Templates and guide chapter for games; budgets in CI | G10, G11, G13, G14, G20 |
| 25 | G25 | Console and legacy texture layouts (PSP, 3DS, Vita, iPhone 4S) | G12, target bring-up |

**G01. Bake only the fonts a program uses.** The grid font tables (416 KB in game-2d) are baked only when the program calls
`gfx.text`; the embedded TrueType files are subset with `hb-subset` (vendored with HarfBuzz) to the scanned characters, unless the
project asks for shaped text. HarfBuzz is built today as the separate shaped-text library (D40, ZN-330.04), so the subsetter links into
the CLI's baker only (it never reaches a game), and its size is recorded in the D40 table. AC: game-2d `resources.bin` at most 0.5 MB (1 706 441 B today); `tests/t0/res.sh` and every pixel golden
unchanged; a program that calls `gfx.text` still draws the grid font; a `"text": "shaped"` project keeps whole fonts.

**G02. AOT programs embed their resources with `.incbin`.** `aot.cpp` writes the blob to a file and a small assembler stub
(Mach-O `__DATA,__const`, ELF `.rodata`) instead of a decimal array. AC: a 50 MB blob builds in under 3 s and 300 MB peak on the Mac
(the spike: 1.1 s, 142 MB); the examples' frames are unchanged; works with clang and the pinned `zig c++` for macOS, Linux x86_64,
aarch64 and armhf.

**G03. Launch a `.zapp` without reading or hashing the whole archive.** Read the ustar headers (or an index member written first),
map members in place, verify a member's SHA-256 against `manifest.json` when it is first read; unpack to the cache only what must be
a file (native plugin libraries). AC: a `.zapp` with 100 MB of assets launches in under 100 ms with under 60 MB peak memory (today 2.0
to 2.3 s, 450 to 520 MB); a corrupted member is refused when read, with today's message; the zapp, fuse and update tests pass.

**G04. Remove unreachable functions from the ZBC module.** A reachability pass from `main`, the vtables of constructed classes,
closures and the functions runtime rows call back, before encoding. AC: game-2d ZBC at most 30 KB (60 181 B today); every T0/T1 golden
identical in the interpreter, AOT and the device core; a test with promise jobs, timers and `onFrame` keeps its call-backs; the ESP32
export of game-2d's logic fits 48 KB.

**G05. `zinc:gfx` source rectangles and images from bytes.** New rows `drawImageRect(img, sx, sy, sw, sh, dx, dy, dw, dh, alpha,
flags)` (flip, nearest or linear) and `imageFromBytes(u8[])`, in the software rasterizer, `display-gl` and the browser host, which
also draws baked images and fonts. AC: `zinc:canvas` 9-argument `drawImage` uses the row (pixel goldens unchanged); a sprite-sheet
frame is equal in the interpreter, AOT and the browser (headless Chrome, `tests/t1/export_wasm.sh`); game-2d's sprites show in the wasm
export.

**G06. ZPK pack format.** Writer and reader (mapped), sorted TOC, per-entry codec (none, lz4, zstd, zstd with a dictionary),
alignment per profile, lazy SHA-256 check, deterministic output; lz4 1.10.0 (`lib/` only) and zstd 1.5.7 vendored; `docs/zpk.md`; decision
record (section 6.1). AC: a 10 000-entry round trip; two packs of the same inputs byte-identical across directories and homes; a libFuzzer
target on the reader runs clean for 10 minutes (D15); the bytes the decoders add to the runtime are recorded in the D40 table.

**G07. Asset build graph and content-addressed cache.** `src/res` grows into `src/assets`: rules, importer registry, built-in importers
(copy; PNG/JPEG/WebP/SVG to premultiplied RGBA8, RGB565 or RGBA4444; the font baker), groups to packs, `report.json`, `zinc assets build`;
`zinc run`, `pack`, `build`, `export` call it. Decision record on importers (section 9). AC: a second build of an unchanged project runs no
importer (under 50 ms for game-2d); changing one image re-imports only that image; packs identical across two directories and two
`ZINC_HOME`s; the report lists every asset with source and output bytes and time.

**G08. `zinc.json` keys and target defaults.** Parse and validate `assets` (object form), `splash`, `loading`, `launcher`,
`targets.<id>.assets`; an `assets` entry per target in `targets/capabilities.json` (formats, max size, POT, codecs, pack codec, budgets).
AC: `parseProject` tests for each key and each error; `zinc assets info` prints the effective profile per target; projects without the keys
build byte-identical outputs to before.

**G09. `zinc:assets` v2.** Mount table and overlays, `loadGroup`/`unloadGroup`/`prefetch` with byte progress, handles with reference
counts, priority queues, accounting against the target budget, decode on the libuv thread pool (sliced per frame on one-core targets), an
upload budget per frame; the v1 calls read through the packs; AOT programs find their packs. AC: a headless test loads three groups with
monotone progress ending at 1; unloading frees the memory (`zinc mem`); a load over budget fails naming the group and the budget; frames
are deterministic under `ZINC_DETERMINISTIC=1`; the AOT build of examples/hero runs (ZN-314's AC).

**G10. `zinc assets` commands.** `ls`, `info`, `report` (`--json`, `--diff`), `check` (budgets, exit 1), `clean`, `verify`; `zinc export`
writes `report.json` beside `sbom.spdx.json`. AC: a T0 test per subcommand; `check` fails on a fixture over budget and passes under it;
`--diff` names the groups that changed.

**G11. Sprite atlases and `zinc:sprite`.** Vendor `stb_rect_pack` and `stb_image_resize2`; the sprite importer (trim, extrude, padding,
pages per max size, POT, `.aseprite` through cute_aseprite, TexturePacker JSON-hash input); a pure-Zinc `zinc:sprite` plugin (frames,
animations, pivots). AC: game-2d draws from one atlas page; frames at 1x are pixel-identical to the loose images; `display-gl` draw calls of
the play scene before and after are in the task notes.

**G12. Texture importer `tex-basis` and compressed uploads.** basisu 2.50 as a pinned tool; KTX2; mipmaps; premultiplied alpha; sRGB;
transcode per profile to BC1/BC3/BC7, ETC1/ETC2, ASTC, PVRTC1; `display-gl` uploads ETC1 (vc4) and BCn/ASTC (desktop); the WebGL layer gains
`WEBGL_compressed_texture_etc1`, `_etc`, `_astc`, `_pvrtc` where the driver has them; decision record (section 9). AC: for a 2048 px
texture the report gives pack and GPU bytes per profile; it renders in `display-gl` on macOS and on the Pi 3 (vc4) with ETC1 within a pixel
tolerance of the RGBA path; the determinism test passes (with the thread count it fixes).

**G13. Audio pipeline.** On ZN-390's `zinc:audio` (miniaudio): decoders as optional parts (WAV and IMA ADPCM through dr_wav, QOA, Vorbis
through stb_vorbis, Opus through libopus as a miniaudio custom decoder); streaming from packs; the audio importer (dr_libs input,
libopusenc, adpcm-xq, QOA, r8brain resampling, libebur128 loudness). AC: ZN-390's AC; music streams from a pack with under 64 KB resident;
effects start within 10 ms on macOS; the report gives bytes per codec; decode CPU per codec measured on the Pi 3 is in the notes.

**G14. Model importer.** gltfpack built from the vendored meshoptimizer 1.3 tag; quantisation, `EXT_meshopt_compression`, LODs; textures
through `tex-basis`; `three` decodes meshopt and quantised meshes with `zn_meshopt`; `.zmesh` for `zinc:3d`. AC: CesiumMilkTruck sizes
before and after in the notes; the gltf-viewer frame is within tolerance; `zinc:3d` loads a `.zmesh` with no parsing step.

**G15. Font importer.** Subsets (G01) as an importer with charset declarations (`latin-1`, files of strings); MSDF atlas option through
msdf-atlas-gen with its shader in `display-gl` and WebGL. AC: text from an i18n JSON file is baked; a label scaled 8x stays sharp (pixel
test against a reference).

**G16. Tile maps.** A `script` importer for Tiled `.tmj`/`.tmx` and LDtk `.ldtk` to binary layers and typed objects, tilesets through the
atlas; a pure-Zinc `zinc:tilemap` that draws visible chunks. AC: one Tiled and one LDtk level render like the editors' PNG exports
(tolerance); load time in the notes.

**G17. Shaders.** Build-time validation of each GLSL ES variant with glslang (D29 prelude), comment and whitespace stripping, per-profile
storage; a program binary cache on the device where `GL_OES_get_program_binary` exists. AC: an invalid shader fails the build with
file and line; the second start on the Pi 3 skips the compile (measured).

**G18. QuickJS bytecode in packs.** `JS_WriteObject` at pack and export time, the QuickJS-ng `BC_VERSION` and engine hash recorded, the
source kept as a fallback; esbuild (pinned) to bundle and minify npm dependencies when asked. AC: start time of the `3d` template on the Pi 3
before and after in the notes; a version mismatch falls back to the source with one log line.

**G19. Engine splash from the first frame.** The `splash` key; the baker stores the splash, pre-scaled for the target, as the first entry
of the boot pack (and inline in `index.html` for the browser); the host opens the window, presents it, then compiles, bakes, loads plugins
and mounts packs; no white flash (window shown after its first present). AC: the time from `exec` to the splash on screen is measured on
macOS, Linux and the Pi 3 and recorded; in the browser the splash is in the HTML before `app.js` runs; headless runs are unchanged.

**G20. Loader stage.** The `loading` key; the engine runs the loader module each frame while it preloads the groups, then starts `main`;
default screens in a plugin (bar; splash with a bar) for `zinc:gfx` and as a `zinc:ui` component; `minMs`, `fadeMs`; skipped when the groups
are resident. AC: game-2d has a loading screen; progress is monotone (test); the loader's frames are deterministic (golden).

**G21. Pre-launcher stage.** The `launcher` key; a stage API (mounted packs, settings, update check through `zinc:system/update`, mod
list as overlay packs); `zinc:app/settings`; a `zinc-launcher` plugin on `zinc:ui`; skippable. AC: a `zinc sim` scenario chooses fullscreen
and enables a mod, and the game sees the setting and the mod's replacement asset; `--skip-launcher` and "do not show again" work.

**G22. Browser loading path.** `compileStreaming`, one pack per group fetched with progress, Cache Storage under content-hashed names,
KTX2 transcoded in the worker, the inline splash. AC: in headless Chrome the splash is visible before `app.wasm` finishes; a second visit
fetches no pack from the network; a KTX2 texture draws.

**G23. Asset hot reload in `zinc dev`.** Re-import the changed asset, send it over the dev socket, swap it behind its handle, call
`assets.onReload`. AC: changing a sprite while game-2d runs updates the frame within 1 s with the score kept; a code change still restarts.

**G24. Templates and guide.** game-2d (atlas, sounds, groups, loader) and 3d (model importer, loader) templates; a guide chapter "Games:
assets and loading"; budgets in the templates' `zinc.json` checked by `tests/t1/templates_kickstart.sh`. AC: the templates test runs
`zinc assets check`; the chapter lists every command and key of this report that shipped.

**G25. Console and legacy texture layouts.** PSP (swizzle, CLUT4/CLUT8 through exoquant, DXT), 3DS (Morton tiling, ETC1/ETC1A4),
Vita, iPhone 4S (PVRTC1, square power of two), as `tex-console`, each with a reference-decoder test; parked until the target exists. AC: per
format, a decode of the output equals the emulator's or a reference decoder's (PPSSPP, Citra-family, Vita3K, PVRTC reference).

## 12. Risks and open questions

- **Pixel goldens.** Premultiplied alpha, mipmaps and block formats change pixels. The software rasterizer's path (raw RGBA, the
  baker's current output) stays the default of the dev profile and of the golden tests; compressed formats are compared with a
  tolerance, as D8/D23 already do for re-baked renderers.
- **Encoder determinism.** basisu, astcenc and gltfpack are multithreaded; byte-identical output across machines is not documented.
  The determinism test decides per tool whether it runs single-threaded (slower builds, shared cache makes it rare).
- **Tool weight on the build machine.** basisu, gltfpack and the audio encoders take up to a minute each to build with zig **[I]**, which
  adds to the first export of a project; prebuilt tools through the signed index (ZN-337) remove that, as for plugins.
- **Target bring-up comes first.** PSP, Vita, 3DS, iPhone 4S and CHIP are not Zinc targets yet; the console steps (G25) wait for them.
  The design keeps them possible (profiles, layouts as a last pass, sector-aligned packs) without building them now.
- **iPhone 4S distribution.** iOS 9.3.6 is its last system; whether current Xcode can still build for it, and the App Store path for
  such an old device, were not checked here (ZN-372 is the iOS spike).
- **Licences.** PVRTexTool and the Aseprite CLI are not redistributable: optional tools the user installs. LAME (MP3) is LGPL: a tool
  run at build time, never linked. libimagequant (GPL-3) is excluded. Every vendored library goes to `third_party/README.md` and
  `components.json` so the SBOM of an export lists exactly the decoders it links (the baker's tools are not in the game's SBOM).
- **Trust of importers.** An importer runs on the developer's machine with the project's files: importer plugins follow the plugin
  trust chain (lock, signatures, capabilities, ZN-328 to ZN-346); a `script` importer gets read access to its inputs and write access to
  its output only.
- **Untrusted packs.** Mods and downloaded packs are parsed by the engine: the ZPK reader and every decoder that reads them are fuzzed
  (D15). Mod packs hold the same built formats as the game's own (the mod author runs `zinc assets build`), so no general image or
  audio decoder (stb_image and stb_vorbis are not hardened) runs on mod content unless the game opts in; a game that wants only
  signed mods checks each pack's manifest against keys it trusts, with the Ed25519 code already in the engine.
- **Open questions for the owner:** should the browser target move from its 2D canvas host to WebGL before G22 (textures in the
  browser are much simpler on WebGL); is a Windows target expected before the consoles (it changes the desktop texture default only
  marginally: BC everywhere); should Zinc ship a stock pre-launcher at all, or only the stage API and a template.

## 13. Sources

Checked on 2026-10-09.

**Repository (read for this report):** `next/ARCHITECTURE.md`, `next/RESUME.md`, `docs/reports/zinc-next-decisions.md` (D2, D8, D11,
D13, D15, D23, D25, D29, D30, D31, D36, D40), `docs/reports/zinc-next-resources.md`, `docs/reports/zinc-next-packaging.md`,
`docs/reports/zinc-next-reproducible.md`, `docs/reports/gpu-renderer-design.md`, `docs/reports/research-2026-09-30/toolbelt-build-pipeline.md`,
`docs/guide/05-plugins.md`, `docs/guide/07-distribution.md`, `docs/plugins.md`, `docs/plugins/3d.md`, `docs/zapp.md`,
`next/src/res/res.cpp`, `next/src/res/codec.h`, `next/src/zapp.cpp`, `next/src/main.cpp` (`bakeResources`, `pack`, `fuse`, `unpackZapp`),
`next/src/cli_core.cpp` (`exportWasm`, `exportEsp32`), `next/src/aot/aot.cpp`, `next/src/host/sys_host.cpp`, `next/src/frontend/project.h`,
`next/src/gl/webgl_ext.h`, `next/targets/wasm/glue/*`, `lib/gfx.d.ts`, `lib/modules.d.ts`, `plugins/three/index.ts`,
`plugins/canvas2d/index.ts`, `templates/game-2d`, `templates/3d`, `targets/capabilities.json`, `next/third_party/README.md`,
backlog tasks ZN-164, ZN-182, ZN-314, ZN-348, ZN-390.

**Libraries and tools:**
[basis_universal](https://github.com/BinomialLLC/basis_universal) ·
[KTX-Software releases](https://github.com/KhronosGroup/KTX-Software/releases) ·
[astc-encoder](https://github.com/ARM-software/astc-encoder/releases) ·
[etcpak](https://github.com/wolfpld/etcpak/releases) ·
[bc7enc_rdo](https://github.com/richgel999/bc7enc_rdo) ·
[Compressonator](https://github.com/GPUOpen-Tools/compressonator/releases) ·
[PVRTexTool](https://developer.imaginationtech.com/solutions/pvrtextool/) and its [EULA](https://scancode-licensedb.aboutcode.org/powervr-tools-software-eula.html) ·
[PVRTCCompressor](https://github.com/brenwill/PVRTCCompressor) ·
[stb](https://github.com/nothings/stb) ·
[rectpack2D](https://github.com/TeamHypersomnia/rectpack2D) ·
[free-tex-packer](https://github.com/odrick/free-tex-packer) ·
[crunch](https://github.com/ChevyRay/crunch) ·
[Aseprite EULA](https://github.com/aseprite/aseprite/blob/main/EULA.txt) ·
[msdfgen](https://github.com/Chlumsky/msdfgen/releases) ·
[msdf-atlas-gen](https://github.com/Chlumsky/msdf-atlas-gen/releases) ·
[libspng](https://github.com/randy408/libspng/releases) ·
[lodepng](https://github.com/lvandeve/lodepng) ·
[wuffs](https://github.com/google/wuffs) ·
[libwebp](https://github.com/webmproject/libwebp/tags) ·
[oxipng](https://github.com/shssoichiro/oxipng/releases) ·
[libimagequant licence](https://github.com/ImageOptim/libimagequant/blob/main/COPYRIGHT) ·
[exoquant](https://github.com/exoticorn/exoquant) ·
[quantizr](https://github.com/DarthSim/quantizr) ·
[meshoptimizer and gltfpack](https://github.com/zeux/meshoptimizer/releases) ·
[Draco](https://github.com/google/draco/releases) ·
[cgltf](https://github.com/jkuhlmann/cgltf/releases) ·
[tinygltf](https://github.com/syoyo/tinygltf/releases) ·
[fastgltf](https://github.com/spnda/fastgltf/releases) ·
[ufbx](https://github.com/ufbx/ufbx/tags) ·
[Assimp](https://github.com/assimp/assimp/releases) ·
[KHR_texture_basisu](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_basisu) ·
[Opus](https://github.com/xiph/opus/tags) ·
[opusfile](https://github.com/xiph/opusfile) ·
[libopusenc](https://github.com/xiph/libopusenc/releases) ·
[libvorbis](https://github.com/xiph/vorbis/releases) ·
[minimp3](https://github.com/lieff/minimp3) ·
[dr_libs](https://github.com/mackron/dr_libs/tags) ·
[miniaudio](https://github.com/mackron/miniaudio) ·
[adpcm-xq](https://github.com/dbry/adpcm-xq) ·
[QOA](https://github.com/phoboslab/qoa), [qoaformat.org](https://qoaformat.org/), [QOA specification](https://phoboslab.org/log/2023/04/qoa-specification) ·
[libsamplerate](https://github.com/libsndfile/libsamplerate/releases) ·
[r8brain-free-src](https://github.com/avaneev/r8brain-free-src) ·
[libebur128](https://github.com/jiixyj/libebur128) ·
[zstd](https://github.com/facebook/zstd/releases) ·
[lz4](https://github.com/lz4/lz4/releases) ·
[miniz](https://github.com/richgel999/miniz/releases) ·
[libdeflate](https://github.com/ebiggers/libdeflate/releases) ·
[xxHash](https://github.com/Cyan4973/xxHash/releases) ·
[BLAKE3](https://github.com/BLAKE3-team/BLAKE3/releases) ·
[PhysicsFS](https://github.com/icculus/physfs) ·
[glslang](https://github.com/KhronosGroup/glslang/releases) ·
[SPIRV-Cross](https://github.com/KhronosGroup/SPIRV-Cross) ·
[SPIRV-Tools](https://github.com/KhronosGroup/SPIRV-Tools/releases) ·
[shaderc](https://github.com/google/shaderc/tags) ·
[glsl-optimizer](https://github.com/aras-p/glsl-optimizer) ·
[Shader_Minifier](https://github.com/laurentlb/Shader_Minifier/releases) ·
[glslx](https://github.com/evanw/glslx) ·
[Tiled](https://github.com/mapeditor/tiled/releases), [Tiled docs](https://doc.mapeditor.org) ·
[LDtk](https://github.com/deepnight/ldtk/releases), [LDtk JSON](https://ldtk.io/json) ·
[tmxlite](https://github.com/fallahn/tmxlite/releases) ·
[cute_headers](https://github.com/RandyGaul/cute_headers) ·
[FreeType](https://freetype.org) ·
[QuickJS-ng](https://github.com/quickjs-ng/quickjs/releases) ·
[esbuild](https://github.com/evanw/esbuild/releases) ·
[terser](https://github.com/terser/terser) ·
[swc](https://github.com/swc-project/swc/releases) ·
[Rollup](https://github.com/rollup/rollup/releases) ·
[#embed proposal N2898](https://open-std.org/jtc1/sc22/wg14/www/docs/n2898.htm) ·
[Clang 19 #embed (Phoronix)](https://www.phoronix.com/news/LLVM-Clang-19-C23-Embed).

**Targets:**
[Mesa vc4](https://docs.mesa3d.org/drivers/vc4.html) ·
[vc4_screen.c](https://chromium.googlesource.com/chromiumos/third_party/mesa/+/refs/heads/main/src/gallium/drivers/vc4/vc4_screen.c) ·
[Mesa issue 2280](https://gitlab.freedesktop.org/mesa/mesa/-/issues/2280) ·
[Pi legacy config.txt](https://www.raspberrypi.com/documentation/computers/legacy_config_txt.html) ·
[v3d_screen.c](https://android.googlesource.com/platform/external/mesa3d/+/refs/heads/main/src/gallium/drivers/v3d/v3d_screen.c) ·
[CHIP](https://en.wikipedia.org/wiki/CHIP_(computer)) ·
[lima_screen.c](https://chromium.googlesource.com/chromiumos/third_party/mesa/+/refs/heads/main/src/gallium/drivers/lima/lima_screen.c) ·
[iOS OpenGL ES platforms](https://developer.apple.com/library/archive/documentation/OpenGLES/Conceptual/OpenGLESHardwarePlatformGuide_iOS/OpenGLESPlatforms/OpenGLESPlatforms.html) ·
[PVRTC on iOS](https://developer.apple.com/library/archive/documentation/3DDrawing/Conceptual/OpenGLES_ProgrammingGuide/TextureTool/TextureTool.html) ·
[N94AP](https://theapplewiki.com/wiki/N94AP) ·
[iOS memory limits (community)](https://stackoverflow.com/questions/5887248) ·
[iOS audio](https://developer.apple.com/library/prerelease/ios/documentation/AudioVideo/Conceptual/MultimediaPG/UsingAudio/UsingAudio.html) ·
[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) ·
[pspgu.h](https://github.com/pspdev/pspsdk/blob/master/src/gu/pspgu.h) ·
[PPSSPP image formats](http://www.ppsspp.org/docs/psp-hardware/gpu/image-formats/) ·
[PPSSPP texture cache](http://www.ppsspp.org/docs/psp-hardware/gpu/texture-cache/) ·
[SDL PSP renderer](https://skia.googlesource.com/third_party/sdl/+/master/src/render/psp/SDL_render_psp.c) ·
[SIL PSP notes](https://achurch.org/SIL/current/README-psp.txt) ·
[PSP hardware](https://en.wikipedia.org/wiki/PlayStation_Portable_hardware) ·
[pspsdk build.mak](https://github.com/pspdev/pspsdk/blob/master/src/base/build.mak) ·
[PPSSPP Media Engine](http://www.ppsspp.org/docs/development/ppsspp-internals/media-engine/) ·
[UMD](https://playstationdev.wiki/pspdevwiki/index.php?title=UMD) ·
[PBP format](https://www.psdevwiki.com/ps3/PBP) ·
[gxm.h](https://github.com/vitasdk/vita-headers/blob/master/include/psp2/gxm.h) ·
[audiodec.h](https://github.com/vitasdk/vita-headers/blob/master/include/psp2/audiodec.h) ·
[sysmem.h](https://github.com/vitasdk/vita-headers/blob/master/include/psp2common/kernel/sysmem.h) ·
[vitasdk samples](https://github.com/vitasdk/samples) ·
[3DS GPU registers](https://www.3dbrew.org/wiki/GPU/Internal_Registers) ·
[citro3d texture.c](https://github.com/devkitPro/citro3d/blob/master/source/texture.c) ·
[tex3ds](https://github.com/devkitPro/tex3ds) ·
[3DS memory layout](https://www.3dbrew.org/wiki/Memory_layout) ·
[3DS multi-threading](https://www.3dbrew.org/wiki/Multi-threading) ·
[libctru NDSP channel](https://libctru.devkitpro.org/channel_8h_source.html) ·
[SMDH](https://www.3dbrew.org/wiki/SMDH) ·
[CBMD](https://www.3dbrew.org/wiki/CBMD) ·
[ESP32 memory types](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-guides/memory-types.html) ·
[ESP32 external RAM](https://docs.espressif.com/projects/esp-idf/en/v4.4.5/esp32/api-guides/external-ram.html) ·
[ESP32 SPI flash mmap](https://docs.espressif.com/projects/esp-idf/en/v5.0/esp32/api-reference/storage/spi_flash.html) ·
[ESP32 start-up](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-guides/startup.html) ·
[ESP32 bootloader](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-guides/bootloader.html) ·
[ESP decode benchmark](https://components.espressif.com/components/esphome/micro-decoder/versions/0.4.0/examples/decode_benchmark) ·
[web3dsurvey s3tc](https://web3dsurvey.com/webgl/extensions/WEBGL_compressed_texture_s3tc), [etc](https://web3dsurvey.com/webgl2/extensions/WEBGL_compressed_texture_etc), [astc](https://web3dsurvey.com/webgl2/extensions/WEBGL_compressed_texture_astc), [pvrtc](https://web3dsurvey.com/webgl/extensions/WEBGL_compressed_texture_pvrtc), [bptc](https://web3dsurvey.com/webgl2/extensions/EXT_texture_compression_bptc), [MAX_TEXTURE_SIZE](https://web3dsurvey.com/webgl/parameters/MAX_TEXTURE_SIZE) ·
[WEBGL_compressed_texture_s3tc](https://registry.khronos.org/webgl/extensions/WEBGL_compressed_texture_s3tc/), [_pvrtc](https://registry.khronos.org/webgl/extensions/WEBGL_compressed_texture_pvrtc/), [_etc1](https://registry.khronos.org/webgl/extensions/WEBGL_compressed_texture_etc1/) ·
[WebGL textures (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL) ·
[SharedArrayBuffer (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) ·
[OPFS (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) ·
[caniuse Opus](https://caniuse.com/opus), [Vorbis](https://caniuse.com/ogg-vorbis) ·
[WebKit bug 226922](https://bugs.webkit.org/show_bug.cgi?id=226922) ·
[Tremor on ARM](https://lists.xiph.org/pipermail/tremor/2002-September/000108.html).

**Prior art:**
[Unity splash](https://docs.unity.cn/Manual/class-PlayerSettingsSplashScreen.html) ·
[Unity SplashScreen API](https://docs.unity3d.com/ScriptReference/Rendering.SplashScreen.html) ·
[Unity iOS player settings](https://docs.unity3d.com/Manual/class-PlayerSettingsiOS.html) ·
[Unity Android splash colour](https://docs.unity3d.com/ScriptReference/PlayerSettings.SplashScreen-backgroundColor.html) ·
[Addressables packing schema](https://docs.unity3d.com/Packages/com.unity.addressables@2.3/manual/ContentPackingAndLoadingSchema.html) ·
[Addressables labels](https://docs.unity3d.com/Packages/com.unity.addressables@2.3/manual/Labels.html) ·
[DownloadDependenciesAsync](https://docs.unity3d.com/Packages/com.unity.addressables@2.2/manual/DownloadDependenciesAsync.html) ·
[Addressables content updates](https://docs.unity3d.com/Packages/com.unity.addressables@2.0/manual/builds-update-build.html) ·
[Unity asset database refresh](https://docs.unity3d.com/Manual/AssetDatabaseRefreshing.html) ·
[Unity Accelerator](https://docs.unity3d.com/Manual/UnityAccelerator.html) ·
[Unity Resources folder](https://learn.unity.com/topics/best-practices/resources-folder) ·
[Sprite Atlas v2](https://docs.unity3d.com/Manual/sprite/atlas/v2/sprite-atlas-v2.html) ·
[Godot ProjectSettings](https://docs.godotengine.org/en/latest/classes/class_projectsettings.html) ·
[Godot iOS splash (forum)](https://forum.godotengine.org/t/change-startup-godot-logo-on-ios/48170) ·
[Godot import process](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/import_process.html) ·
[Godot importing images](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_images.html) ·
[Godot exporting](https://docs.godotengine.org/en/stable/tutorials/export/exporting_projects.html) ·
[Godot Linux export options](https://docs.godotengine.org/en/4.3/classes/class_editorexportplatformlinuxbsd.html) ·
[Godot PCKs](https://docs.godotengine.org/en/stable/tutorials/export/exporting_pcks.html) ·
[Godot script encryption](https://docs.godotengine.org/en/stable/engine_details/development/compiling/compiling_with_script_encryption_key.html) ·
[Godot ResourceLoader](https://docs.godotengine.org/en/stable/classes/class_resourceloader.html) ·
[Godot web shell](https://docs.godotengine.org/en/stable/tutorials/platform/web/html5_shell_classref.html) ·
[Phaser loader](https://docs.phaser.io/phaser/concepts/loader) ·
[Phaser template scenes](https://github.com/phaserjs/template-vite/tree/main/src/game/scenes) ·
[Defold archive (arcdEx)](https://codeberg.org/cweiske/arcdEx) ·
[Defold texture profiles](https://defold.com/manuals/texture-profiles/) ·
[Defold Live Update](https://defold.com/manuals/live-update/) ·
[Defold collection proxy](https://defold.com/manuals/collection-proxy/) ·
[Defold HTML5](https://defold.com/manuals/html5/) ·
[Defold iOS](https://defold.com/manuals/ios/) ·
[LÖVE config](https://www.love2d.org/wiki/Config_Files) ·
[LÖVE distribution](https://love2d.org/wiki/Game_Distribution) ·
[fusing LÖVE games](https://jasonliang.js.org/fusing.html) ·
[love-loader](https://github.com/kikito/love-loader) ·
[PocketJS](https://pocketjs.dev/) ·
[PocketJS platform contracts](https://pocketjs.dev/docs/platform-contracts/) ·
[PocketJS architecture](https://pocketjs.dev/docs/architecture/) ·
[PocketJS on PS Vita](https://pocketjs.dev/blog/pocketjs-on-ps-vita/) ·
[PocketJS native contract](https://pocketjs.dev/docs/native-contract/) ·
[Introducing Pocket3D](https://pocketjs.dev/blog/introducing-pocket3d/) ·
[Shipping OpenStrike](https://pocketjs.dev/blog/shipping-openstrike/) ·
[pocket3d sources](https://github.com/pocket-nexus/pocketjs/tree/main/pocket3d) ·
[Bevy AssetPlugin](https://docs.rs/bevy/latest/bevy/asset/struct.AssetPlugin.html) ·
[Emscripten packaging](https://emscripten.org/docs/porting/files/packaging_files.html) ·
[Emscripten shell](https://chromium.googlesource.com/external/github.com/kripken/emscripten/+/HEAD/html/shell.html) ·
[instantiateStreaming (MDN)](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static) ·
[V8 wasm code caching](https://v8.dev/blog/wasm-code-caching) ·
[UILaunchScreen](https://developer.apple.com/documentation/bundleresources/information-property-list/uilaunchscreen) ·
[launch images](https://docs.coronalabs.com/guide/distribution/launchFile/) ·
[Android splash screens](https://developer.android.com/develop/ui/views/launch/splash-screen) ·
[Super Bubble Builder Vita (LiveArea sizes)](https://www.gamebrew.org/wiki/Super_Bubble_Builder_Vita) ·
[Nerves splash](https://forum.elixirforum.com/t/booting-the-rasperry-pi-with-a-splash-image-when-using-nerves/23891).
