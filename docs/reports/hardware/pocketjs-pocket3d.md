# PocketJS and Pocket3D on PSP, PS Vita, Nintendo 3DS and iPhone 4S: analysis and plan for Zinc

Date: 2026-10-09. Status: research report, no code changed. Audience: the Zinc owner and the Zinc Next backlog.

Question asked: Zinc should reproduce the PocketJS / Pocket3D demos on the same hardware (PSP, PS Vita, Nintendo 3DS,
iPhone 4S). What are they, how do they get their speed, what does Zinc lack, and in which order should the work run so
that the first demo runs as early as possible.

Method: the blog post [Introducing Pocket3D](https://pocketjs.dev/blog/introducing-pocket3d/) and the rest of
pocketjs.dev, the Pocket3D site [3d.pocket.nexus](https://3d.pocket.nexus/), the game pages of
[Pocket Studio](https://studio.pocket.nexus/), and a read-only study of the public repositories of the
[pocket-nexus](https://github.com/pocket-nexus) organization (nothing in them was built or run). Pocket Maneuver and
Pocket Requiem have no public repository; what is said about them comes from their Studio pages and the Pocket3D site.

## 0. Summary

- **PocketJS** is a UI runtime: TypeScript components (Solid, Vue Vapor, Octane) run in a **QuickJS interpreter**
  (Bellard QuickJS "2026-06-04", evaluated from source at every boot, no bytecode, no JIT); a **Rust `no_std` core**
  does layout (taffy 0.11), baked Tailwind styles, baked keyframes and emits a 10-op DrawList that a small per-device
  backend draws (sceGu sprites on PSP, vita2d/GXM on Vita, citro3d on 3DS, OpenGL ES 1.1 on the iPhone 4S).
- **Pocket3D is not an engine.** It is a set of thin **device kernels** (GE memory/swizzle/display lists, GXM memory and
  shader patching, PICA texture storage) plus a method: each game owns **its own scene DSL, IR, compiler ("cooker") and
  one renderer per GPU**. Scenes are authored in Three.js, compiled ahead of time to per-console packs, and drawn by
  native Rust/C renderers. PocketJS draws every 2D pixel (title, menus, HUD) over the 3D frame.
- **The demos**: Pocket Tokyo (city around Tokyo Tower, sun shadows three different ways; Vita 60 fps, PSP 30, 3DS 30,
  iPod touch 4 60), Pocket Atlas (seven real places: rain, wet reflections, 52,000 point-sprite lights; 30 fps),
  Pocket Maneuver (wire-hook traversal of a 5,400-house town, 60 fps on Vita, PSP, 3DS, iPod touch 4), Pocket Requiem
  (4,053 knights, up to 1,750 in a Vita frame at 30 fps), OpenStrike (Counter-Strike-like FPS, locked 60 fps on PSP),
  Pocket Voxel (Game Boy RPG as a voxel diorama, 30 fps outdoors on PSP), Pocket Island (3DS social island, rigid GPU
  skinning, 60 fps on New 3DS), and the PocketJS 2D apps (Hero, Motion Lab, Figma viewer, YouTube over USB, Talk...).
- **The iPhone 4S** runs PocketJS only as a UI host (iOS 6.1.3 downgraded and jailbroken, OpenGL ES 1.1, Hero demo,
  no frame-rate numbers published). Every Pocket3D game targets the **iPod touch 4** instead (iOS 6.1.6, A4/SGX535,
  256 MB). It is a weaker machine than the 4S and uses the same armv7 sysroot, so iPod packs are a valid lower bound for
  the 4S.
- **Their speed comes from the compiler, not the runtime**: quantized 8–20-byte vertices (i16 positions, no normals on
  handhelds), u16 indices in ≤65,535-vertex batches, CLUT8 swizzled textures with palette tricks on PSP, Morton-tiled
  ETC1/565 on 3DS, vertex-baked lighting everywhere, cells/blocks/regions LOD with streaming, PVS for BSP maps, budgets
  checked at compile time, pipelined present (CPU frame N+1 while GPU draws N), and QuickJS kept out of the hot path
  (2.2 ms of JS per 60 fps frame in OpenStrike).
- **Zinc's position is strong on the language side**: its AOT C++ is 5–20× faster than QuickJS on kernels (M4 bench:
  nbody 111.9 ms AOT vs 2,637.7 ms QuickJS), its memory is reference-counted (PocketJS fights 35–175 ms GC pauses), and
  game logic, renderer orchestration and UI can all be TypeScript in one program, with no JSON bridge between a Rust game
  and a JS UI. `examples/pocket-hero` (the PocketJS Hero compiled by Zinc through `lib/compat/pocketjs`) already exists.
- **Zinc's gaps are on the device side**: no PSP/Vita/3DS/legacy-iOS target in Zinc Next (the PS1/PS2 targets exist only
  in the prototype), AOT on 32-bit untested (ZN-145), no emulator runners for these consoles, no GPU 2D backends for
  GE/GXM/PICA, no 3D device kernels, no scene cooker or pack format, no texture encoders (CLUT8+swizzle, Morton/ETC1),
  no per-device frame bench, no second-screen UI surface.
- **Emulators**: PPSSPPHeadless is excellent (software GE, deterministic, byte-exact goldens) but misses data-cache and
  GPU-race bugs and accepts float 3D vertices that real hardware misreads. Vita3K runs homebrew but its macOS Vulkan
  readback is incoherent (PocketJS uses a CPU oracle). Azahar works with its software renderer and an isolated SD card.
  No usable emulator exists for 32-bit iOS 6/9: acceptance there is a device receipt.
- **Plan**: 40 tasks. The first demo (PocketJS Hero on PSP in PPSSPP, via `examples/pocket-hero`) needs 6 tasks,
  about 4 weeks. The first 3D demo (a cooked diorama flythrough on PSP with a zinc:ui overlay) comes at about 8–10 weeks.
  The four-device diorama comes at about 5–6 months. Full parity with the six Pocket3D games is about 45–60
  engineer-weeks of serial work. Much of it can run in parallel, but the hardware acceptance steps need the owner's
  consoles.
- **Licensing**: the game repositories (Tokyo, Atlas, OpenStrike, Voxel) and the PocketJS runtime are MIT. The Pocket3D
  device kernels (`pocket3d/`, `devices/`, `engine/pocket3d/` of the PocketJS repository) are under the Pocket3D License
  1.0: MIT plus a mandatory title card for any distributed product that draws 3D with them. Zinc should write its device
  code clean-room and take only MIT code, with attribution. GoldSrc maps and the Pokémon ROM are copyrighted. Use free
  maps and tilesets.

## Sources

| Key | Source | Revision read |
|---|---|---|
| PJ | [pocket-nexus/pocketjs](https://github.com/pocket-nexus/pocketjs) (runtime, hosts, Pocket3D kernels, site and blog sources in `site/content/`) | `2f0c201`, 2026-10-09 |
| TK | [pocket-nexus/pocket-tokyo](https://github.com/pocket-nexus/pocket-tokyo) | `444fd8d`, 2026-10-07 |
| AT | [pocket-nexus/pocket-atlas](https://github.com/pocket-nexus/pocket-atlas) | `7557a73`, 2026-10-07 |
| OS | [pocket-nexus/open-strike](https://github.com/pocket-nexus/open-strike) | `8f1b58c`, 2026-10-07 |
| VX | [pocket-nexus/pocket-voxel](https://github.com/pocket-nexus/pocket-voxel) | `903f516`, 2026-10-07 |
| IS | [pocket-nexus/pocket-island](https://github.com/pocket-nexus/pocket-island) | `c1dcda3`, 2026-10-05 |
| OW | [pocket-nexus/pocket-openworld](https://github.com/pocket-nexus/pocket-openworld) | `5a53739`, 2026-10-07 |
| Blog | [pocketjs.dev/blog](https://pocketjs.dev/blog/) (19 posts, mirrored in `PJ/site/content/blog/*.md`) | 2026-07-06 to 2026-10-07 |
| 3D | [3d.pocket.nexus](https://3d.pocket.nexus/) (mirrored in `PJ/site/pocket3d/public/index.html`) | 2026-10-09 |
| Studio | [studio.pocket.nexus/games/tokyo](https://studio.pocket.nexus/games/tokyo), [/atlas](https://studio.pocket.nexus/games/atlas), [/maneuver](https://studio.pocket.nexus/games/maneuver), [/requiem](https://studio.pocket.nexus/games/requiem) | 2026-10-09 |
| Zinc | this repository: `next/ARCHITECTURE.md`, `docs/targets/playstation.md`, `docs/reports/zinc-next-*.md`, `docs/plugins/{3d,three}.md`, `next/backlog/` | working tree 2026-10-09 |

A citation such as `TK/README.md:7` means the file in that repository. Numbers are quoted as the sources give them.
Where the sources contradict each other, the code is preferred and the conflict is noted.

---

## 1. What PocketJS and Pocket3D are

### 1.1 The machines

| | PSP | PS Vita | Nintendo 3DS (Old / New) | iPhone 4S | iPod touch 4 (Pocket3D's iOS device) |
|---|---|---|---|---|---|
| CPU | Allegrex MIPS32, 1–333 MHz, single-precision FPU + VFPU; Media Engine | 4× Cortex-A9; games up to 444 MHz (Atlas/Tokyo set 444/222/222/166) | 2× ARM11 MPCore 268 MHz / 4× 804 MHz + L2 | Apple A5, 2× Cortex-A9 ~800 MHz | Apple A4, Cortex-A8 |
| GPU | GE 166 MHz, fixed function, 2 MiB eDRAM | PowerVR SGX543MP4+, GXM | PICA200 268 MHz, 6 MB VRAM | PowerVR SGX543MP2 | PowerVR SGX535 |
| RAM | 32 MB (PSP-1000, ~24 MB user) / 64 MB (2000/3000, ~52 MB with `MEMSIZE=1`) | 512 MB + 128 MB CDRAM | 128 MB FCRAM (64 MB app mode) / 256 MB | 512 MB | 256 MB |
| Screens | 480×272 | 960×544, front touch, rear pad | 400×240 top (800×240 stereo) + 320×240 touch | 640×960 (320×480 points) | 640×960 |
| API | sceGu/sceGe: T&L, ≤8 skinning weights, ≤8 morph targets, CLUT4/8, DXT | GXM, Cg → GXP, 4× MSAA | citro3d: vertex programs (picasso), up to 6 combiner (TEV) stages, fog LUT, no fragment shaders | OpenGL ES 1.1 and 2.0; no Metal (A5), no ES 3 | OpenGL ES 1.1 and 2.0 |
| Homebrew path | CFW (6.61) + PSPLINK | HENkaku/Ensō + VitaShell | Luma3DS + Homebrew Launcher (.3dsx) or CIA | developer signing on iOS 9.3.6, or downgrade to 6.1.3 + jailbreak | jailbreak (p0sixspwn) + AppSync |

Sources: [PSP hardware](https://en.wikipedia.org/wiki/PlayStation_Portable_hardware) (333 MHz, 166 MHz GPU, 2 MiB eDRAM,
32/64 MiB), [PS Vita](https://en.wikipedia.org/wiki/PlayStation_Vita), [Nintendo 3DS](https://en.wikipedia.org/wiki/Nintendo_3DS),
[iPhone 4S](https://en.wikipedia.org/wiki/IPhone_4S) (iOS 5.0 to 9.3.6), 3D site (GE/PICA/GXM feature lines),
`PJ/engine/pocket3d/backends/citro3d/README.md` (96 float uniform registers), `TK/vita`, `AT/vita/src/profile.rs`
(clocks), `TK/README.md` (PSP `MEMSIZE=1`: 53.7 MB free at start), `PJ/docs/IPHONE4S.md`, `PJ/docs/IPODTOUCH4.md`.

### 1.2 PocketJS: the runtime

```
TSX (Solid | Vue Vapor | Octane)
  └─ build, pass 1: framework JSX transform + harvest class strings and text codepoints (Babel)
  └─ build, pass 2: Bun.build iife bundle  →  app.js  +  app.pak (styles.bin, font atlases, images, sprites, tiles)
device, one process, one thread:
  QuickJS guest (source evaluated at boot) ── ui.* ops (codes 1–56) ──▶ pocketjs-core (Rust no_std)
      node arena, baked style table, baked keyframes, taffy 0.11 flexbox, 2D physics, text
      └─ DrawList: 10 ops (rect, gradRect, glyphRun, texQuad, scissor, scissorPop, tri, texTri, textRun, surfaceQuad)
          └─ backend: sceGu sprites (PSP) | vita2d over GXM (Vita) | citro3d (3DS) | GLES 1.1 (iPhone 4S, iPod 4)
                      | software raster + damage regions (iPhone 2G, iPod 6, ESP32, PocketBook)
```

- **Engine.** Bellard QuickJS ("2026-06-04", ~ES2023) from the `pocket-nexus/quickjs-rs` fork pinned at `ba5bdd0d…`
  on PSP, Vita, 3DS and legacy iOS. quickjs-ng 0.14.0 is used only on ESP-IDF (`PJ/docs/DESIGN.md:51`,
  `PJ/hosts/*/Cargo.toml`). The bundle is evaluated from source with `JS_Eval` (`PJ/hosts/psp/src/main.rs:597-603`); `JS_WriteObject`/`JS_ReadObject`
  appear nowhere. On PPSSPP the Hero bundle takes 319,884 µs to evaluate and 648,975 µs from boot to frame 0
  (`PJ/docs/bench/three-frameworks-ppsspp-2026-07-30.md`). No JIT anywhere.
- **One FFI crossing per steady frame.** The guest keeps a JS mirror of the tree, so reads never cross the FFI. A
  steady frame is one call, `frame(buttons, analog?, touches?, …)` (`PJ/site/content/docs/native-contract.md`).
- **Baked styling and motion.** Tailwind class literals compile to integer style ids in `styles.bin`. `focus:` and
  `active:` switch inside the core. Keyframes compile to per-property segment timelines that run with no per-frame
  JS. `translateX(-50%)` and `calc()` are compile errors (`Blog/introducing-pocketjs`, `Blog/baking-motion`).
- **Determinism.** A virtual clock at a fixed tick rate (default 60 Hz; the bundle refuses to mount on a `__tickHz`
  mismatch). Network results arrive at frame boundaries. Input tapes replay sessions byte-exactly
  (`Blog/ui-runtime-that-cant-flake`, `PJ/docs/DETERMINISM.md`).
- **Contracts.** `contracts/spec/*.ts` generate the Rust and C op tables, with drift checks. `pocket.json` declares
  `requires`/`enhances` capabilities and a logical viewport. Target profiles give `hostAbi`, the physical viewport and
  `rasterDensity` (1 on PSP, 2 on Vita and iPhone). Constant `hasFeature()` calls are folded away at build time
  (`Blog/pocketjs-on-ps-vita`, `PJ/contracts/`).
- **Memory.** The public "8 MB" figure is the PSP app arena budget. The PSP host takes one kernel block of
  `sceKernelMaxFreeMemSize − 2 MB` and serves Rust, QuickJS and newlib from 32 power-of-two size classes, O(1)
  (`PJ/hosts/psp/src/arena.rs:84-118`, `PJ/docs/PSP_ALLOCATOR.md`). On PPSSPP Hero shows an arena of 17.07 MiB with a
  2.94 MiB bump.

### 1.3 PocketJS hosts on the four devices

| | PSP | PS Vita | 3DS | iPhone 4S |
|---|---|---|---|---|
| Host | Rust (`hosts/psp`) on the rust-psp fork `2cbaf8c9…`, SDK tag `sdk-noabicalls-normalized-2026-06-19`, target `mipsel-sony-psp` (`mips2`, `+single-float`) | Rust std, VitaSDK, cargo-vita 0.2.2, vita2d-sys 0.1.1 with precompiled shaders | C (libctru, citro3d, picasso in docker `devkitpro/devkitarm@sha256:116afba8…`) + Rust core staticlib (`armv6k-nintendo-3ds`); QuickJS built with `-DJS_NO_NAN_BOXING` (mandatory) | C UIKit host with no ObjC metadata (`hosts/ios-legacy/runtime.c`), Rust core for a custom `armv7-apple-ios` target (cortex-a8, NEON) |
| GPU path | sceGu `TRANSFORM_2D` sprites, i16 vertices, batched runs, per-batch dcache writeback, `sceGuTexFlush` on bind; textures power of two ≤512, unswizzled in main RAM; CLUT8, 5650, 4444, 8888 | vita2d over GXM, 2 MiB pool, vblank wait, 16 MiB recycled texture budget | citro3d, one TEV modulate stage, textures Morton-tiled 8..1024, no palette format | OpenGL ES 1.1 fixed function on a 640×960 `CAEAGLLayer`; whole DrawList each frame, no damage tracking on GL |
| Screen | 480×272 PSM8888, stride 512, double-buffered | 480×272 logical at density 2 → 960×544 | 400×240 + 320×240 auxiliary, density 1 | 320×480 logical, density 2 → 640×960 |
| Frame loop | 333/333/166 MHz; pipelined present; JS on a 1 MB `USER|VFPU` thread (256 KB main stack overflows) | CPU N+1 overlaps GPU N | `osSetSpeedupEnable`, `gspWaitForVBlank`, 60 Hz | `CADisplayLink`; defaults to 2 ticks per callback (see below) |
| Measured | Hero (Solid) on PPSSPP: JS 2,147 µs, avg work 3,663 µs; OpenStrike HUD 2.2 ms JS | no fps in repo; Vita3K goldens "44 frames across eleven demos" | Pocket Nexus on Old 3DS 34.6 → 16.7–17.0 ms | none published; receipt checks `gles1`, density 2, 640×960 |

Sources: `PJ/hosts/{psp,vita,3ds,iphone4s,ios-legacy}`, `PJ/docs/IPHONE4S.md`, `PJ/docs/IPODTOUCH4.md`,
`PJ/site/content/changelog.md`.

About the iPhone 4S: the validated tuple is exactly `iPhone4,1`, iOS 6.1.3 `10B329`. The phone is restored with
Legacy iOS Kit to 6.1.3, keeping the 9.3.6 baseband, and jailbroken with Aquila (`PJ/docs/IPHONE4S.md`). Modern Xcode
has no armv7 iOS libraries, so `prepare-sysroot` extracts the 6.1.3 dyld shared cache from the owner's IPSW with
Apple's `dyld-210.2.3` extractor and generates TAPI linker stubs. The build uses `xcrun clang -target
armv7-apple-ios6.0`, `ld-classic` and `ldid -S`, and deploys over SSH through `iproxy` with a transactional install
and rollback. The 4S target is private, outside `POCKET_TARGETS`, and its only demo is `apps/iphone4s-demo`
(Hero, "JSX on A5.").

Possible PocketJS bug, inferred and not measured: `ios-legacy/runtime.c:105-106` defaults to 2 core ticks per display
link callback. The iPod touch 4 wrapper overrides this to 1, because animations ran at twice their speed. The 4S
wrapper does not override it. This is a lesson for Zinc: tie the tick count per callback to the measured display rate.

### 1.4 Pocket3D: device kernels and purpose-built engines

From `PJ/pocket3d/README.md`, `PJ/devices/README.md` and the blog post:

- **Hardware-native.** "A game gets a renderer for each machine. GE, PICA200 and GXM are not normalized into one GPU
  API." Rule in `PJ/devices/README.md`: "Do not normalize GE, PICA and GXM into one GPU API. Compilers must be able to
  see their costs and constraints." The caller owns GPU completion; no kernel inserts an implicit wait.
- **Compiler-first.** A game is modelled once as Three.js content that runs in a browser. A per-game compiler lowers it
  to one console's texture formats, vertex layouts and draw structure. The output can include baked lighting,
  visibility, LOD, texture encodings and vertex layouts.
- **Purpose-built engines.** Each game owns its IR: CityIR (Tokyo), PlaceIR (Atlas), WorldIR (Maneuver), MapIR/BSP
  (OpenStrike). Games share only the kernels:

| Kernel | Mechanism | Used by |
|---|---|---|
| `devices/psp/pocket-psp-ge` | GE texture swizzle (16-byte × 8-row blocks), retained aligned frame pools, 64-byte-aligned display lists, dcache publication | PocketJS PSP host, Atlas, OpenStrike, Tokyo |
| `devices/vita/pocket-vita-gxm` | CDRAM/uncached memory blocks, arenas, frame rings, GXP storage and patching, render targets, texture descriptors, optional runtime Cg compiler (SceShaccCg) | Atlas, OpenStrike, Tokyo |
| `devices/3ds/pocket-3ds-pica` | header-only C: linear-memory texture allocation, mip payloads, cache flush, explicit release | PocketJS 3DS host, Atlas, OpenStrike |
| `devices/web/pocket-web-wgpu` | WebGPU device, handheld shells, UI overlay pass, ranged pack reads | Tokyo (browser player) |
| `engine/pocket3d/backends/citro3d` | colored triangle streams and rigid indexed skins on PICA200 (≤29 joints = 87 uniform vectors) | Island, OpenStrike 3DS |

- **UI over 3D.** The game draws no text. A PocketJS app runs in the same process and talks to the game over an
  in-process `pocket.overlay` service: JSON lines, the game sends only the state fields that changed, the UI sends
  commands (`PJ/docs/POCKET3D-UI-OVERLAY.md`, `AT/ui/app/protocol.ts`). The UI turn rate is below the frame rate:
  Tokyo runs 10 turns/s on PSP, 15 on 3DS and 13 on iPod.
- **Browser.** Each game also has a wgpu-over-WebGPU renderer that reads a handheld pack and shows it in that
  handheld's shell (Pocket Studio).
- **Agent workflow.** Every step is a command: write the scene → `cook` → `native` (replace the binary on the
  console) → `bench` (fly a fixed route, read back the late frames) (3D site; `AT/tools/atlas.ts`).

How the games use each GPU:

| GPU | What Pocket3D games do with it |
|---|---|
| **GE (PSP)** | One display list per frame, written while the GE draws the previous one (Atlas `DisplayList<262144>`, Tokyo 98,304 words). Positions are i16 with a ×32768 model scale because the GE normalizes 16-bit positions to [-1,1). Index lists are u16. Textures are CLUT8 (`PsmT8` + `sceGuClutLoad(32)`), swizzled, sampled from main RAM; the hottest texture is copied into spare eDRAM. Depth is inverted 16-bit (`sceGuDepthRange(65535,0)`, `GreaterOrEqual`). Fog is linear. Lighting is one ambient colour per draw (`LightMode::SingleColor`). Characters use GE morphing of two baked poses (`VERTICES2`); sprites are placed by 3 bone weights (`WEIGHTS3`); ground UVs come from the texture matrix. No back-face culling. Framebuffers are 5650 with ordered dither (Tokyo, OpenStrike) or 8888 (Atlas, UI). |
| **GXM (Vita)** | Cg programs compiled on the console by SceShaccCg, cached as GXP by source hash, and shipped as GXP in releases (Atlas: 864 programs). vita2d display surface created with 4× MSAA and drawn into directly, because an off-screen copy costs 3.75 ms. Parameter buffer raised from 16 MB to 32 MB (at 16 MB it overflows near 150k triangles). BC1/BC3/BC5 textures, R32F/RG16 shadow maps, `SCE_GXM_PRIMITIVE_POINTS` light fields, post chain (bloom, haze, AgX LUT grade). |
| **PICA200 (3DS)** | picasso vertex programs: sector light indexed with `mova a0.x`, rigid skinning, camera-facing sprite expansion. TEV: 2–3 stages (modulate, interpolate, multiply-add for glow). Fog LUT (`FogLut_Exp`). ETC1 / RGB565 / RGBA8 textures in bottom-up Morton tiles. D24S8, reversed depth (`GPU_GEQUAL`), optional 2× SSAA via `GX_TRANSFER_SCALE_XY`. Bottom screen for UI and maps. **No stereo 3D** in any game (`gfxSet3D(false)`). |
| **GLES 2 (iPod touch 4)** | 7 GLSL programs (Tokyo), 4× MSAA via `glRenderbufferStorageMultisampleAPPLE`, RGB565 textures, attributes on 4-byte boundaries, `lowp` colours, UI composited inside the scene shaders (`texture2DProj(uOver, …)`). |
| **GLES 1.1 (iPhone 4S UI, OpenStrike iPod)** | Fixed function: `glOrthof`, `GL_MODULATE`, `GL_SHORT` positions, static VBO/IBO, alpha test `GL_GREATER 0.5`. |

### 1.5 The demos

#### PocketJS (2D) demos

| Demo | Devices | Demonstrates | Numbers given |
|---|---|---|---|
| Hero (Solid, Vue Vapor, Octane) | PSP, Vita, 3DS (dev), iPhone 4S (dev), iPod touch 4 | JSX components, baked Tailwind, focus navigation, sprite-atlas spinner | PSP (PPSSPP) avg work 3.66 ms (Solid), 3.61 (Vue Vapor), 6.53 (Octane); 42 nodes, 9 draws; classic Vue with a virtual DOM 90.75 ms vs Solid 15.15 ms |
| Motion Lab (yui540 studies: menu, d-pad, reload arc, circular reveal, 3D cubes/room) | PSP | compile-time keyframes, arc primitive, painter-sorted 3D quads, pipelined present | busiest page 17.4/21.7 ms → 13.9 ms CPU overlapped with GPU, every frame < 16.7 ms (`Blog/baking-motion`) |
| Octane app suite (hero, cards, stats, library, settings, notifications, music, gallery) | PSP | React-style hooks without React's runtime | hero 387.8 → 6.5 ms after a missing `-O2` was found; 23 byte-exact PPSSPP goldens (`Blog/octane-on-psp`) |
| Pocket Talk, Cover Flow launcher, Text Lab | PSP (+Vita) | on-screen keyboard, virtual list, 1,000 runtime song titles | — |
| Pocket Figma | PSP, Vita | 14,430-node Figma file baked to streamed CLUT8 tile pyramids, 60 fps panning in 32 MB | EBOOT 9.1 MB (6.2 MB of pyramids), arena ~4 MB, ~11 MB free (`Blog/pocket-figma`) |
| Pocket YouTube | PSP, Vita, New 3DS | Mac companion runs yt-dlp/ffmpeg; video streamed over USB as 512×128 CLUT8 at 12 fps, 44.1 kHz stereo | ~0.87 MB/s over the cable; 11 bugs found on hardware, 0 by the emulator |
| Pocket Map / Doc / Term / Vault | 3DS | companion-backed apps, 10,000-row virtual list | — |
| Pocket Nexus | 3DS, iPod touch 4 | 2D physics bodies (`ui.physics`) | Old 3DS 34.6 → 16.7–17.0 ms; iPod 60 fps at 1.4 ms guest+core |
| Pocket Café, DevTools | PSP, all | deterministic replay; on-screen inspector, time travel over PSPLINK | 10 min of input ≈ 70–144 KB |

#### Pocket3D demos

**Pocket Tokyo** ([Studio](https://studio.pocket.nexus/games/tokyo), TK). A flight over Shiba around Tokyo Tower:
14,753 buildings from Project PLATEAU, OSM roads and rails, GSI elevation, 9,128 street lamps, about 3 km across.
It demonstrates one effect written three ways per machine (3D site):

| Effect | PS Vita (GXM) | 3DS (PICA200) | PSP (GE) |
|---|---|---|---|
| Shadows follow the sun | 16-bit height texture; each fragment compares its height with one texel | 8-bit shade texture over the city, multiplied by one of three TEV stages | top bit of a CLUT8 index: palette entries 128–255 are entries 0–127 in shadow; a worker thread sets bit 7 where the ground is shaded |
| City lights up at dusk | rooms switch on at their own moment; bright pixels blurred and added to the next frame (bloom) | lamp light as one texture over the city; facades carry a second emission picture | each picture has a day and a night palette; the CPU mixes them by the hour (64 steps) |
| A wall faces the sun or not | normal per vertex, `dot(N, sun)`, then the shadow lookup | one byte per vertex names the compass sector; the vertex program picks one of 17 lights | walls sorted into 16 direction groups; each group drawn with the GE ambient colour as its light (hence 1,255 draws) |

| Device | Screen | fps | Budget | Measured (TK/README.md:7-14) | Package |
|---|---|---|---|---|---|
| PS Vita | 960×544, 4× MSAA | 60 | 200k triangles | 150 s tour: 9,010 frames, **0 late**, worst 17.6 ms, mean 158,200 triangles, 222 draws | 76 MB |
| PSP | 480×272 | 30 | 42k | 4,500 frames, 5 late, worst 50 ms, mean 37,600 triangles, 1,255 draws | 43 MB |
| Old 3DS | 400×240 + 320×240 | 30 | 60k | 90 s: 2,728 frames, 0 late, mean 40,000 triangles, 276 draws, 17.1 ms CPU / 17.5 ms GPU | 32 MB |
| iPod touch 4 | 480×320, 4× MSAA | 60 | 24k | 8,965 frames, 37 late (0.41 %), worst 39.8 ms, mean 22,200 triangles, 205 draws | 72 MB |

**Pocket Atlas** ([Studio](https://studio.pocket.nexus/games/atlas), AT). Seven real places on a globe, each with its own
hour and weather: Rainy Night Konbini (planar wet reflection, 7,000 rain streaks, haze, interior-mapped windows, a taxi,
skinned pedestrians), Suga Shrine Stairs (sun shadow map, baked sky occlusion, alpha-tested foliage), Radio Kaikan at
blue hour (twilight sky, animated LED flipbook signs, 25 panel + 22 point/spot lights baked into vertices), Kamakura
crossing (open water with Fresnel and a glitter path to a 16 km horizon, 120 s crossing loop), Sangubashi in bloom
(petals as ≤24-joint skins, an eight-car train), Griffith Observatory at blue hour (**52k city lights as GXM point
sprites**, 5k moving, inversion haze to a 71 km horizon), Lombard Street (surveyed switchbacks, two robotaxis).
All profiles target 30 fps. Vita: 33.3–33.4 ms per frame on most places at step 0 with 4× MSAA; Sangubashi misses
(37.3–41.3 ms) and is waived. PSP Konbini: 15–30 fps depending on the shot. Packages: PSP 33 MB, Vita 115 MB, 3DS
55 MB, iPod 77 MB (`AT/README.md:179,312-331`).

**Pocket Maneuver** ([Studio](https://studio.pocket.nexus/games/maneuver), no public repo). Two wire hooks pull the
player through a walled town of about 5,400 houses, with a town hall, a cathedral, a canal ring, eight bridges and 32
giants 10–16 m tall. **60 fps on PS Vita, PSP, Nintendo 3DS and iPod touch 4.** WorldIR holds cells, levels of
detail and a collision world. Renderers: GXM, PICA200 and GE, with "runs of cells in one draw, clip groups on the PSP"
(3D site). Packages: PSP 13 MB, Vita 14 MB, 3DS 30 MB, iPod 12 MB.

**Pocket Requiem** ([Studio](https://studio.pocket.nexus/games/requiem), no public repo). A battlefield 2 km across
with 4,053 knights in 133 cohorts and no loading. A Vita shows up to 1,750 knights per frame at 30 fps. Each knight's
motion is stored as placed frames, and a console draws a knight as a blend of two of them. On the smaller machines
nearby detailed meshes give way to cheap silhouettes at distance (blog). Packages: PSP 8 MB, Vita 36 MB, 3DS 19 MB.

**OpenStrike** (OS). A round-based Counter-Strike-like FPS on GoldSrc BSP maps ("from your own copy of the game").
Rules (`game/rules.ts`, 49 lines) and a Solid HUD (`game/hud.tsx`, 687 lines) are in TypeScript on QuickJS; movement,
weapons, bots and collision are in Rust (`openstrike-core`, no_std).
- **PSP (the headline):** locked 60 fps. JS ~2.2 ms, total CPU 6.8–8.4 ms, worst frame 9.7 ms. `de_dust2.p3d` is
  3.8 MB with 58k vertices × 20 B. A 28,243-triangle map holds 59.9 fps on a physical PSP (changelog 0.13.0).
- **Characters on PSP:** 1–6 actors at 59.22–58.91 fps (`OS/docs/PSP_CHARACTER_ACCEPTANCE.md`).
- **Other targets:** Vita (vita2d GXPs, no MSAA), 3DS (citro3d), iPod touch 4 (GLES 1.1), Nokia E7 (GLES 2). No fps
  receipts are published for them.

**Pocket Voxel** (VX). A Gen-1 creature RPG rebuilt as a voxel diorama (bring your own ROM). All game state (~11k
lines of TS, battle engine ported formula by formula) runs in QuickJS; a Rust core presents. On a PSP-2000 outdoors went
from 102–128 ms frames to 27.8–34.2 ms, shipped as an even 30 fps present with 60 Hz logic (150 presents per 300
ticks). Interiors run at 59–65 fps (`Blog/pocket-voxel`). Vita: GXM backend, no fps numbers.

**Pocket Island** (IS). A standalone 3DS social island: Rust sim at 30 Hz, C citro3d renderer, QuickJS only for a
hot-reloadable `app.js` (8,192-byte source, 4 MiB context). Rigid GPU skinning (29 joints × 3 rows = 87 uniforms, 0 B
of vertex upload per frame) took a New 3DS from 8.92 fps to 59.8 fps once the pose was sampled per 30 Hz step and
interpolated (`IS/evidence/3ds-crowd-report.md`).

(Pocket Character and Pocket Openworld are desktop-only and out of scope. Android/Redmi 1S builds exist for Tokyo and
Atlas but are not on the owner's list.)

### 1.6 Asset and pack formats

All packs share a shape: a magic, a 16-byte section table `(tag, offset, size, pad)`, little-endian, every section
16-byte aligned, unknown tags ignored, zero-copy reads on device, and a deterministic compile receipt with hashes and
no timestamps.

| Pack | Game | Sections and per-target layouts |
|---|---|---|
| `TKPK` v3 | Tokyo | META, CITY, REGN/BLCK/CELL (3 LOD levels), BTCH, VTOP/VWAL/VSOL vertices, IDX0, SPAN (index groups by cell and 16 compass sectors), FACD/FACN facades, GTEX ground, HMAP heights, LAMP, NEAR (streamed cell records), LANE/LPTS traffic, TOUR. Vertices: Vita 12/20/16 B; **PSP 8/12/8 B** (565 colour × AO, s16 positions); 3DS/iPod 8/16/12 B (s16, AO, sector byte). Textures: Vita BC1/BC3; PSP CLUT8 day+night palettes, swizzled; 3DS ETC1 in PICA tile order + Morton RGB565; iPod RGB565 rows (`TK/crates/tokyo-pack/src/lib.rs`, `TK/crates/tokyo-cook`). |
| `PLCE` v7 / `PLPS` v4 | Atlas | Vita: META, TEXD (RGBA8/BC1/BC3/BC5/RGBA16F), GEOM (static vertex 24 B, skinned 32 B, baked 28 B with sqrt-RGBM irradiance), ANIM, octahedral environment. PICA: 120 B header, 24 B vertex, Morton RGBA8/565/4444. PSP `PLPS`: 176 B header, GE-swizzled RGBA4444/8888, 24 B float vertex, ≤24 MiB. |
| `P3D1` | OpenStrike | WVTX 20 B (`u,v f32 · ABGR · x,y,z i16`), WIDX u16, WBAT batches, WFAC/WRUN face runs, WTEX (swizzled CLUT8 + 256-entry palette + full mips), WVIS (BSP nodes, leaves, PVS), WCLP (clip hulls), WENT, WSKY (`OS/domain/crates/pocket3d-bsp/src/cooked.rs`). |
| `VXPK` v9 | Voxel | META, CHNK (16×16-tile chunks with i16 AABB), ATLS (pre-swizzled CLUT8), VPAL/VCOL, STMP, CMAP, GAME (JSON for the guest), AUDI. Vertex 16 B: u16 UV, ABGR (shade × AO), i16 xyz. Final cook 29,689,744 bytes. |
| `P3M1` | Island | nodes with TRS, vertices pos/normal/colour + u16 joint, u32 indices, 24 fps clips. |
| `DCPK` pak | PocketJS | `ui:styles`, `ui:font.<slot>`, `ui:img.*`, `ui:sprite.*`, `ui:tile.*`, sorted, 16-byte aligned. |

Authoring formats: Three.js scenes (Tokyo reuses the MIT [Procedural Tokyo](https://github.com/jeantimex/tokyo) model
and exports its meshes through headless Chrome; Atlas has its own place-kit DSL with `material.userData.pocketAtlas`
annotations exported as glTF `extras`), GoldSrc BSP v30 + WAD3 (OpenStrike, also Blender → Valve 220 `.map` → SDHLT),
Game Boy ROM data (Voxel), glTF → P3M1 (Island).

### 1.7 Budgets at a glance

| | PSP | PS Vita | 3DS | iPod touch 4 / iPhone 4S |
|---|---|---|---|---|
| Resolution used | 480×272 | 960×544 (Atlas scales 480×272..960×544 with a governor) | 400×240 top + 320×240 | 480×320 + 4× MSAA (Tokyo iPod); PocketJS UI 640×960 |
| Frame rate | 60 (OpenStrike, Maneuver), 30 (Tokyo, Voxel outdoors, Atlas) | 60 (Tokyo, Maneuver), 30 (Atlas, Requiem) | 30 (Tokyo, Atlas), 60 (Maneuver, Island on New 3DS) | 60 (Tokyo, Maneuver) |
| Triangles per frame | 37–42k (Tokyo), ~37–40k (Voxel route), 28k map at 60 fps (OpenStrike) | 158k mean / 200k budget (Tokyo), ~130k after LOD (Atlas guide) | 40k mean / 60k budget (Tokyo); 30–40k provisional (Island) | 22k mean / 24k budget (Tokyo iPod) |
| Draws per frame | 1,255 (Tokyo, sector ambient) | 222 | 276 | 205 |
| GPU cost model | 1.5 ms + 0.63 ms per 1k triangles per list; ~0.7 µs per triangle cold; fetch-bound | 3.0 ms + 0.053 ms per 1k triangles; 2 µs GPU / 4 µs CPU per draw | — | 5.9 ms + 0.39 ms per 1k triangles; ~10 µs CPU per draw |
| Memory | PSP-1000: ~24 MB user; Tokyo needs `MEMSIZE=1` on 2000+ (53.7 MB free, 21.7 MB arena after load); OpenStrike arena high-water 15.2 MB; eDRAM: 2×512×272 framebuffers + Z | Tokyo newlib heap 48 MB, 69 MB VRAM reserved (65 MB city); Atlas heap 96 MiB | Tokyo guest 4.5 MB heap + 5 MB linear, 12.3 MB linear free; `.3dsx` 32 MiB limit | Tokyo iPod process 72 MB |
| JS per frame | 2.2 ms (OpenStrike HUD); 6.4 ms script + 2.9 ms layout at 10 turns/s (Tokyo UI) | 1.0 ms (Tokyo UI) | 12.3 ms at 15 turns/s (Tokyo UI) | 1.0 ms at 13 turns/s |

Sources: TK READMEs and `TK/*/src/main.*`, `AT/README.md`, `AT/profiles/*.json`, `OS/docs/*`, `Blog/pocket-voxel`,
`IS/evidence/3ds-crowd-report.md`.

---

## 2. Techniques and compromises

### 2.1 Architecture

1. **Do the work ahead of time.** Lighting, visibility, LOD, texture encoding and vertex layout are decided by a
   desktop compiler per device profile. The device reads a pack in place: OpenStrike once embedded its map in
   `.rodata` and published it with one `sceKernelDcacheWritebackRange` at boot (`PJ/engine/pocket3d/PSP.md` §4).
2. **Budgets are compile errors.** Profiles carry triangle budgets, texture caps (PSP 128–512, PICA/iPod ≤1024, Vita
   ≤4096), pack size limits (PSP 24 MiB, 3DS sections in MiB) and `maxMeshVertices = 65535`. A failed budget keeps
   the previous pack (`AT/src/profile.rs`, `AT/src/recipe.rs`).
3. **Do not flatten the GPUs.** Each machine gets its own technique for the same idea (the three shadow
   implementations above). The IR keeps meaning (heights, footprints, facade kinds, light records), not GPU data.
4. **A runtime governor.** Tokyo Vita scales near/mid distances (300/1,300 m × 0.25–1.0) against a 200k-triangle
   budget, and pulls them in when the GPU wait exceeds 6 ms. Atlas Vita steps resolution down after 10 late frames and
   back up after 2 s under 80 %. Android resizes the buffer from 720 to 540 lines.
5. **Measure on the device, on a fixed route.** `bench` flies a scripted tour and reports late frames, worst frame,
   triangles and draws. Emulator numbers are never quoted as hardware proof (`PJ/engine/pocket3d/PSP.md` §8).

### 2.2 Geometry and vertex formats

- **Quantize everything.** Positions are i16/u16 over a block or chunk box: Tokyo y spans −16..496 m in 7.8 mm steps,
  Atlas uses 25 cm in a 16 km cell. Normals are i8 or absent. On handhelds Tokyo drops normals and stores a **compass
  sector byte** that selects one of 16/17 lights. Colours are RGB565 (PSP) or RGBA8 with AO folded in. Vertex sizes:
  PSP 8/12 B, 3DS 8–16 B, Voxel 16 B (from 20 B: "a flat −20%" of fetch bytes), OpenStrike 20 B.
- **GE specifics.** 16-bit positions need a ×32768 model scale (the GE divides them by 32768 in 3D mode). Float
  positions "sample garbage on the real GE" while PPSSPP accepts them (`Blog/pocket-voxel`). Draw indices in place from
  16-byte-aligned ranges: splicing through the frame pool made the GE 17 ms faster but cost 25 ms of CPU.
- **u16 indices, batches ≤65,535 vertices,** index ranges ordered by cell and by wall direction so that culling becomes
  range selection (Tokyo `SPAN`).
- **No back-face culling** on GE (mixed winding in GoldSrc and Voxel; "culling and instancing buy nothing" because the
  GE is fetch-bound) and none on PICA in Island.
- **Cook-time diets:** Voxel's hidden-face cull (−5.2 % quads), coplanar same-shade quad merge, three tree LODs,
  stratified bit-reversed detail streams (any prefix is a uniform thinning), oblique ground bake into 128×128 CLUT8
  pages. Tokyo's "prisms": roofs rasterized into a 1 m grid, terraces straightened (RDP) into walls plus a flat top;
  mid level has 1/4 of the near triangles and far 1/20.
- **Constant depth bias** in the projection instead of moving vertices on the CPU (Voxel grass: 65–73 ms of CPU
  removed).

### 2.3 Visibility, LOD and streaming

- **Hierarchical cells:** Tokyo tile 256 m, cell 128 m (near), block 512 m (mid), region 1–2 blocks (far). Atlas uses
  32 m cells within 140 m, 256 m beyond, octave cells to 64 km, with meshoptimizer LOD at 6 cm / 25 cm error.
- **Frustum culling per cell/cluster,** plus a facing test: Tokyo draws only the arc of wall sectors that can face the
  eye, so a third of the walls in view are never sent.
- **PVS for BSP maps** (OpenStrike): point→leaf walk, RLE row decoded when the leaf changes, leaf AABB frustum test,
  Morton-ordered cluster cache. "Fill rate is the constraint; PVS is what caps overdraw" (`PSP.md` §5).
- **Streaming:** handhelds keep everything resident except `NEAR` cell records (≤126 KiB on PSP, ≤227 KiB on iPod).
  40 slots are filled by a lower-priority reader thread. A cell is read 48 m before its LOD distance; an unread cell
  is drawn at mid level (`TK`).
- **Two depth ranges** for 16-bit Z: Tokyo PSP gives three quarters of the range to near cells and one quarter to
  mid/far; Atlas uses a vista range from 361 m to 139 km. Reversed depth on PICA, GE and Vita vistas.
- **No change of representation inside the visible field:** distance-threshold switches flickered on the device
  (Voxel rule).

### 2.4 Textures

- **PSP: CLUT8 + swizzle** (16-byte × 8-row blocks). CLUT8 is 4× smaller than RGBA, sampled straight from main RAM,
  with full mip chains, LOD bias −1.0 and a 512 texel ceiling. Palette tricks:
  - day/night palettes mixed by the CPU;
  - shadow in the index's top bit, so ground textures stay at 128 colours;
  - palette group in the index (`texel = group*4 + shade`, Voxel);
  - tint as a CLUT rewrite;
  - animation by re-binding one atlas copy per frame.
- **PSP rules learned on hardware:** CLUT8 pages must be at least 64 px wide. Call `sceGuTexFlush` on every bind,
  because `sceGuTexImage` does not invalidate the texture cache and emulators hide the bug. Masked texels take the mean
  colour of the visible texels, to avoid fringes.
- **3DS:** ETC1 for ground (PICA order: last row first, 8×8 tiles in Z order, bytes reversed), RGB565/RGBA8 Morton-tiled
  elsewhere. There is no palette format, so CLUT8 is expanded at cook time.
- **Vita:** BC1/BC3 via texpresso with mips averaged in linear light (Tokyo, Atlas), or RGBA8 linear (OpenStrike,
  Voxel). The transfer engine swizzles on upload.
- **iPod/iPhone:** RGB565 for opaque surfaces, RGBA8 for alpha and sky. No PVRTC anywhere.
- **Residency:** PSP framebuffers in 565 free about 1.26 MB of eDRAM for the hottest textures (OpenStrike); Vita keeps
  the city in CDRAM (65 MB).

### 2.5 Lighting and effects

- **Vertex-baked light everywhere.** OpenStrike subdivides faces on a 32-unit world grid (crack-free after i16 snap)
  and samples the GoldSrc lightmap per vertex with 2× overbright: "one pass, zero extra texture memory". Atlas bakes
  rect panels, spots, hemisphere and environment per vertex with adaptive edge splits. Sky occlusion is ray-cast
  against a BVH (48 rays). Vita stores sqrt-RGBM irradiance.
- **Moving sun shadows** come from a height-field horizon sweep on a worker thread: 2,048×1,536 cells in 410 ms on
  Vita, 320 ms on a 4 m grid on PSP, re-run when the sun moves 0.1–1°. Each target then applies it its own way (§1.5).
- **Sector lighting** replaces normals on handhelds (16 directions plus up/down; 17 lights on PICA).
- **Dusk:** lamp textures, night facades with per-building "late" bits, bloom on the previous frame at quarter
  resolution (Vita: 240×136, bright pass, separable 9-texel Gaussian, all tap coordinates computed in the vertex stage).
- **Light fields:** GXM point sprites (≤16,384 per draw, 1.3–1.5 ms per 10k visible lights on Vita). PICA expands
  sprites in the vertex program. PSP places sprite corners with 3 bone weights (34,925 sprites in 268 groups).
- **Fog:** GE linear fog fitted to where exp² fog goes from 5 % to 95 %; PICA fog LUT; Vita per-vertex
  `1-1/(1+x+x²/2)`.
- **Wet surfaces and reflections:** a stencil wet mask plus a mirrored pass on GE; a 128×256 reflection target with TEV
  interpolate on PICA; a planar reflection plus blur on Vita.

### 2.6 Animation and crowds

- **GE morphing instead of skinning:** OpenStrike caches pairs of adjacent baked poses (12 B vertices) and draws each
  actor with `sceGuMorphWeight` and `VERTICES2`. Six actors went from ~30 fps (CPU skinning, 8.24 ms) to 58.91 fps
  (0.412 ms of actor CPU).
- **PICA rigid GPU skinning:** one bone per vertex, an affine palette in vertex uniforms, a zero matrix as the
  "hidden" flag (expressions swap with no upload), visible index ranges coalesced.
- **Crowds as blends of two placed frames** (Requiem) with silhouettes at distance.
- **30 Hz simulation, 60 Hz presentation:** sample the pose once per sim step, interpolate, skin once per display
  frame (Island: 8.92 → 59.8 fps).

### 2.7 Frame pacing, display lists and GPU memory

- **Pipelined present:** record frame N+1 while the GPU executes N. On the PSP the sync wait fell from a 4.9 ms GPU
  tail to 42 µs (`Blog/baking-motion`). Vita overlaps the CPU of N+1 with the GPU of N, with two uniform fences.
- **Even frame locks:** 30 fps as two vblanks with 60 Hz logic (Voxel, Tokyo PSP/3DS). OpenStrike adds a vcount
  guard, which lifted its combat runs from 58.83 to 59.41 fps.
- **Display lists are memory with their own cache lines.** `DisplayList<WORDS>` is 64-byte aligned and sized in whole
  lines. A 16-byte-aligned list shared a line with a CPU-written static, and its write-back replaced the first 12 GE
  commands. PPSSPP has no data cache, so it drew the build correctly (`PJ/devices/psp/pocket-psp-ge/README.md`).
- **Explicit GPU lifetime:** pools reset only after `sceGuSync`. `C3D_FrameSync` "is a VBlank wait, not a retirement
  fence". Vita frees programs only after the GPU has finished.
- **Sizing:** the Vita GXM parameter buffer goes to 32 MB (at 16 MB, frames ran 3× slower beyond ~150k triangles). The
  vita2d pool is split in two halves per frame. On iPod, attributes must sit on 4-byte boundaries (242 draws: 34.7 ms
  → 3.3 ms of CPU).
- **Clocks:** set 333/333/166 MHz on the PSP (the PSPLINK harness boots at 222 MHz, and OpenStrike's first hardware run
  was 25 fps because of it); 444 MHz on the Vita; `osSetSpeedupEnable(true)` on the New 3DS.

### 2.8 JavaScript and memory

- **QuickJS is kept for UI and rules.** OpenStrike runs 2.2 ms of JS per 60 fps frame; Voxel runs the whole game in JS
  but moved audio synthesis to Rust, because JS synthesis cost ~2.3 s of CPU per second of audio. A host call costs
  ~1.7 µs on the PSP, about 8k calls per frame.
- **No state updates for continuous animation:** native sprite atlases, baked keyframes, `hot.text`/`setTextContent`
  paths. Per-field, equality-gated signals took OpenStrike's HUD from 20.6 ms to 2.2 ms of JS.
- **GC scheduling:** QuickJS's own threshold (live × 1.5) is "far too lazy" for a fixed arena. The PSP runs `JS_RunGC`
  once the bump pointer has grown 256 KiB. Tokyo Vita sets `JS_SetGCThreshold(MAX)` and collects only at load ends,
  title returns and every 256th list (35 ms). Voxel collects on warp landings behind a fade, with the audio ring
  pre-filled to cover the 175 ms pause. GC pauses are 35–80 ms on PSP (Atlas).
- **Build flags matter:** every PSP QuickJS until 2026-07 was built at `-O0` because `CRATE_CC_NO_DEFAULTS=1` dropped
  `-O`. One `-O2` took Hero from 387.8 to 154.4 ms per frame (`Blog/octane-on-psp`).
- **Big data stays out of the heap:** packs live in dedicated kernel blocks (a 21 MB pak would have taken a 32 MB size
  class).

### 2.9 Threading

PSP: frame thread (priority 32, 1 MB stack, VFPU attribute, the only allocator), cell reader (36), shadow sweep (44),
audio. 3DS: one worker for cell reads and shadows (32 KB stack, any core). Vita: render thread, shadow thread, shader
compile worker. iPod: UIKit main thread for touches, a render thread that owns GL and the guest, a reader/shadow thread.
Voxel pumps audio synthesis inside the GE wait after `sceGuFinish`.

### 2.10 Determinism, testing and measurement

- PocketJS and the games run a virtual clock with input tapes and seeded RNGs, so a session replays byte-exactly.
- **PPSSPP goldens:** `PPSSPPHeadless --graphics=software`, byte-exact PNGs pinned to a PPSSPP commit (`676724ee5e02`).
- **Vita3K goldens:** a CPU DrawList oracle inside the capture build, because Vita3K's macOS Vulkan readback is not a
  coherent GXM framebuffer.
- **Azahar goldens:** the software renderer only (`graphics_api=0`) with `GX_TRANSFER_FMT_RGB8` readback; Vulkan
  differs on 5.1 % of pixels.
- **Hardware receipts:** bench JSONL over PSPLINK/USB/LAN, status files with heartbeats, `glReadPixels` captures on iOS.
- No emulator runs in their CI: OpenStrike's maps are copyrighted, and the device checks run locally.

### 2.11 What they do not use

No JIT, no QuickJS bytecode, no fixed-point arithmetic (fixed point appears only as quantized storage and in the integer
shadow sweep), no explicit VFPU or NEON math (VFPU is only a thread attribute that `sceGum` requires), no PVRTC, no DXT on
PSP, no stereo 3D on the 3DS, no GE hardware skinning (≤8 bones was planned and replaced by morphing).

### 2.12 Bugs found only on hardware

| Device | Bug | Why the emulator missed it |
|---|---|---|
| PSP | float positions in `TRANSFORM_3D` draws sample garbage | PPSSPP accepts them |
| PSP | CLUT8 pages under 64 px wide | the e2e fuzz tolerance absorbed it |
| PSP | display list sharing a cache line with a static | PPSSPP has no data cache |
| PSP | texture overwritten while the GE samples it | PPSSPP executes lists synchronously |
| PSP | 25 fps at 222 MHz; `-O0` QuickJS | — |
| PSP | Atlas stalls when launched from the Memory Stick, but not via PSPLINK | different launch path |
| Vita | destroying live vita2d textures faults (in Vita3K too); "fd out of range" after 40 minutes | — |
| iPhone 2G/4S | ObjC1 relocations crash `ld-classic`; missing `glEnable(GL_TEXTURE_2D)` | no emulator at all |

PocketJS's lesson: "Cross-executor comparison proves consistency, not correctness". A person holding the device still
finds what the goldens miss.

---

## 3. Gap analysis against Zinc

### 3.1 What Zinc already has that matters

- **Three engines.** The interpreter, **AOT C++** (ZBC → C++ calling `include/zn/ops.h`, linking `src/rt`) and QuickJS-ng
  0.17.0 (desktop/Pi only). D36 is a no-go on JIT, which matches the consoles' rules.
- **Speed.** M4 benchmarks (ms):

  | | interpreter | AOT | QuickJS | native |
  |---|---|---|---|---|
  | fib | 45.3 | 21.0 | 247.2 | 14.1 |
  | nbody | 485.5 | 111.9 | 2,637.7 | 39.2 |
  | mandelbrot | 103.5 | 31.3 | 700.9 | 25.7 |

  AOT stays within 1.15–2.68× of native (`docs/reports/zinc-next-m4-benchmarks.md`, `zinc-next-perf.md`).
- **Small footprint.** The ESP32 core is 690 KB with ~280 KB of heap left out of 320 KB. The Thumb-2 core is ~125 KB.
  The prototype's PS1 breakout is 231 KiB of text+rodata in a 256 KiB TLSF heap (`docs/targets/playstation.md`).
- **Number profiles.** f64, f32 (`ps2`, `esp32`) and fx12 (`ps1`), with `noFpu`/`strict` flags (ZN-121, ZN-229). The
  PSP needs **f32**: the Allegrex FPU is single precision, so f64 would be software-emulated.
- **A console HAL pattern from the prototype.** `targets/ps1/hal_ps1.cpp` (121 lines), `targets/ps2/hal_ps2.cpp`,
  docker SDKs, a PCSX-Redux runner, and a conformance suite byte-identical with the fx12 simulator (9/9). Decision 0012
  records it.
- **2D stack.**
  - `zinc:gfx` (immediate mode) and `zinc:ui` (retained, Tailwind-like classes, classic layout or Yoga 3.2.1).
  - The software rasterizer `runtime/raster.cpp`: 10 command kinds, float coverage AA, damage rectangles, bands.
  - The `HalCmdList` interface for GPU displays.
  - The GLES2 UI renderer in `plugins/display-gl`: GLSL ES 1.00 uber shader, 1024² glyph atlas, 4–6× less CPU than the
    software path on a Pi 3B+. **This renderer can run on the iPhone 4S almost as is.**
- **PocketJS compatibility.** `lib/compat/pocketjs` (mount, components, animation, clock, lifecycle) and
  `examples/pocket-hero`, the PocketJS Hero compiled by Zinc (ZN-076, ZN-312).
- **3D on desktop.**
  - three.js r186 on QuickJS over Zinc's WebGL 1/2 (`libzn_webgl`): SSIM 1.000 against Chrome, conformance 695 of 787.
  - `zinc:3d`, a software z-buffer rasterizer with 16.16 edges.
  - `plugins/three`, a three.js API subset with a glTF loader.
  - Vendored `cgltf` and `meshoptimizer`.
  - This is the authoring and preview side Pocket3D gets from Three.js in a browser.
- **Tooling.**
  - Toolchain manager `src/tc`: pinned, checksum-verified downloads, no Docker for the zig toolchain.
  - Profiles and capabilities (`targets/capabilities.json`, `requires`).
  - The baker `src/res`: fonts at 4×4 supersampling, PNG/SVG/WebP images.
  - `zinc test` runners (interp, aot, quickjs, esp32-qemu, devicesim).
  - Headless Chrome tooling (`tools/cdp.py`).
  - Packaging (`zinc pack`, `zinc fuse`, signing).
- **Memory model.** Reference counting with pools, arenas, TLSF and weak references. There are no tracing-GC pauses, so
  the 35–175 ms stalls PocketJS schedules around do not exist.

### 3.2 Where Zinc can be simpler than PocketJS/Pocket3D

| PocketJS/Pocket3D | Zinc equivalent | Consequence |
|---|---|---|
| Game core in Rust/C, UI in QuickJS, JSON-lines `pocket.overlay` bridge, UI turn rate 10–30 Hz | One TypeScript program compiled AOT: game state, renderer orchestration (culling, LOD, governor) and zinc:ui share memory | No bridge, no second language. The UI can run every frame. Only GPU submission and cook-time heavy lifting are native C++. |
| QuickJS ~1.7 µs per host call, 2.3 s of CPU per second of JS audio | AOT calls `ops.h` directly; host calls go through `hostFast` rows | Logic Pocket3D had to move to Rust can stay in TS. |
| QuickJS GC pauses scheduled behind fades | Reference counting | No GC scheduling. Cycles must be avoided or weak, as already in Zinc. |
| Bundle evaluated from source at boot (0.65 s for Hero on PPSSPP; ~1 min for Voxel's data) | Compiled code, baked resources | Boot is limited by I/O, not parsing. |
| Three.js in a browser + headless Chrome export | three.js on Zinc's QuickJS + WebGL on the desktop, or plain TS scene code | The cooker can be a Zinc program on the desktop with no browser. |

What Zinc must copy rather than reinvent: the per-device renderer principle, compile-time budgets, quantized formats,
the palette and TEV tricks, pipelined present, explicit GPU lifetimes, fixed-route benches and the emulator rules of
§2.12.

### 3.3 Cross-cutting gaps

| Area | Zinc today | Needed | Effort |
|---|---|---|---|
| AOT on 32-bit consoles | proven only through the prototype's AOT (`compiler/`) on PS1/PS2; Next's AOT is untested on 32-bit; ZN-145 (32-bit refs) and ZN-156 (freestanding PS1 runtime) are Backlog | Next AOT + `src/rt` + `runtime/` built with psp-gcc, arm-vita-eabi-gcc, devkitARM gcc and Apple clang armv7, with f32 numbers on PSP | M per target after the first (L) |
| Console targets in Next | none (ZN-157, the ps1 target, is Backlog) | `psp`, `vita`, `n3ds`, `ios-legacy` profiles, packaging (EBOOT.PBP, VPK, 3DSX/CIA, IPA) | M–L each |
| Toolchains | zig for desktop/Pi; prototype Docker for PS1/PS2 | pspdev tarball (macOS arm64 and Linux published), VitaSDK (arm64-apple-darwin packages exist), devkitPro (pacman or the pinned docker image), Xcode clang + ld-classic + armv7 sysroot | M each |
| Emulator runners | PCSX-Redux in the prototype; QEMU for ESP32 | PPSSPPHeadless built from a pinned commit; Vita3K (`--console`, firmware installed from the user's PUP); Azahar (software renderer, isolated SD); none for iOS | M each |
| 2D on GPU | display-gl (GL 3.2 / GLES2) | GE sprites renderer, GXM renderer (vita2d precompiled shaders), PICA renderer (citro3d), GLES2 reuse on iOS | L, M, L, M |
| Input and screens | `Btn`, touch, keys | analog sticks (PSP nub, Vita two sticks, 3DS circle pad and C-stick), Vita front touch, 3DS bottom-screen touch, **a second zinc:ui surface** (3DS) | M |
| Density | `ZINC_SCALE`, pixel scale (ZN-385) | Vita and iPhone at density 2 with @2x resources and fonts baked at 2× | S |
| 3D device kernels | none | GE: display-list ring, frame pool with dcache writeback, CLUT binding. GXM: memory, GXP patching, MSAA surface. PICA: linear memory, TEV setup, Morton textures. GLES2: buffers, programs | L each |
| Pack format | none (only the `src/res` blob) | a sectioned zero-copy pack with per-target layouts and receipts | M |
| Cooker | none (glTF is parsed at run time) | glTF/three.js → quantized, chunked, LOD'd, light-baked meshes; texture encoders: CLUT8 median cut + GE swizzle, Morton tiling, ETC1 (etcpak, BSD), RGB565, BC1/3 (rgbcx/bc7enc, public domain or MIT) | L + L |
| Measurement | frame profiler, `zinc -v` logs | per-device bench on a fixed route: late frames, worst frame, triangles, draws, receipts; emulator numbers marked as such | M |
| Determinism for goldens | `ZINC_FRAMES`, sim oracle, fixed 1/60 virtual step (ps1) | input tapes with analog and touch; byte-exact emulator goldens per pinned emulator commit | M |

### 3.4 Per target

| | PSP | PS Vita | 3DS | iPhone 4S |
|---|---|---|---|---|
| Toolchain | pspdev `v20261001` tarballs (`pspdev-macos-latest-arm64`, Linux x86_64/arm64), GCC + newlib + libstdc++ | VitaSDK (autobuilds; `arm64-apple-darwin` vdpm packages), arm-vita-eabi GCC | devkitARM (devkitPro pacman; PocketJS pins docker `devkitpro/devkitarm@sha256:116afba8…`), libctru 2.7.0, citro3d, picasso | Xcode clang (`-target armv7-apple-ios6.0` or `ios9.0`), `ld-classic`, an armv7 sysroot (old SDK `.tbd` stubs or stubs derived from an IPSW like PocketJS), `ldid` or `codesign` |
| Package | EBOOT.PBP (PARAM.SFO, ICON0, `MEMSIZE=1` for 2000+) | VPK (eboot.bin SELF, param.sfo, LiveArea) | `.3dsx` (≤32 MiB over the wire) or CIA (`SystemMode 64MB/124MB`) | `.app`/IPA |
| Runner without hardware | PPSSPPHeadless `--graphics=software --screenshot`, stdout via `printf`/TTY, exit code | Vita3K `--console`, app path, firmware PUP installed once; capture through an in-app CPU oracle | Azahar 2126.2 with the software renderer, isolated user/SD dir; the app writes captures to SD and exits | none credible (see §3.6): desktop GLES2 build of the same renderer as oracle; device receipts |
| Hardware loop | CFW + PSPLINK/usbhostfs (`host0:` logs) | HENkaku/Ensō, VitaShell FTP/USB, optional `libshacccg.suprx` extracted from the user's console | Luma3DS, 3dslink or FTP (FBI for CIA) | SSH via `iproxy` (jailbreak) or `ideviceinstaller` (developer-signed, iOS 9.3.6) |
| Shaders | none (fixed function) | Cg → GXP: SceShaccCg on the console at dev time (the Sony offline compiler is not redistributable), GXPs cached and shipped; vita2d's precompiled GXPs suffice for 2D | picasso (open source) | GLSL ES 1.00 at run time |
| Numbers | f32 profile (single-precision FPU) | f64 fine | f64 fine (VFP11) | f64 fine |
| Owner prerequisites | which model (1000: ~24 MB user; 2000+: `MEMSIZE=1`), CFW installed | firmware ≤3.74 with HENkaku/Ensō | Old or New 3DS (Island-class work assumes New), Luma3DS | iOS version on the phone, Apple developer account or jailbreak |

### 3.5 Emulators: what each can and cannot prove

| Emulator | Status (checked 2026-10-09) | Use | Limits |
|---|---|---|---|
| **PPSSPP** (`headless/Headless.cpp`) | v1.20.4 released 2026-05-16; headless built from source; options include `--graphics=software`, `--screenshot`, `--timeout`, `--compare`, `--root`, `--state` | `zinc run/test --target psp`, byte-exact goldens per pinned commit (PocketJS pins `676724ee5e02`) | no data cache, synchronous lists, accepts float GE positions, timing not cycle-accurate; 24 MB mode for PSP-1000 (`--small` in Tokyo's harness) |
| **Vita3K** | continuous builds (2026-10-08); CLI: `content-path`, `--console`, `--installed-path`, `--firmware`, `--recompile-shader`, `--backend-renderer` | boot tests, input journeys, GXM program coverage | needs the user to install a firmware PUP; macOS Vulkan readback incoherent (PocketJS: CPU oracle); faults on texture destroy and teardown on macOS; no performance meaning |
| **Azahar** | 2126.2 released 2026-10-08; standalone app plus a libretro core that loads `.3dsx` | goldens with the software renderer, isolated SD, PICA readbacks (Pocket3D `backends/citro3d/example/capture.ts`) | Vulkan readbacks striped or misregistered; timing "proves nothing" (Atlas); no headless flag confirmed: drive through config and app-side exit |
| **iOS** | the Xcode simulator runs only modern arm64/x86_64 iOS; [touchHLE](https://github.com/touchHLE/touchHLE) emulates early iPhone OS apps (GLES 1.1 era, a subset of UIKit) | a desktop build of the iOS host's renderer through SDL3 + GLES2 is the practical oracle | touchHLE's API coverage is too narrow for an iOS 6/9 UIKit + GLES2 app (to verify); acceptance is a device receipt |

### 3.6 iPhone 4S and iOS 9

- The 4S ships iOS 5 and ends at **iOS 9.3.6** (32-bit armv7, A5, SGX543MP2, 512 MB). OpenGL ES 2.0 and 1.1 are
  available. Metal is not (it needs A7), and neither is ES 3.0.
- **Current Xcode cannot build for it.** Recent SDKs reject an iOS 9 deployment target (the supported range starts at
  11) and refuse armv7. clang rejects 32-bit targets above iOS 10. The SDKs no longer ship armv7 libraries. The
  workable routes:
  1. **Keep stock iOS 9.3.6.** Link armv7 against an old SDK's `.tbd` stubs (an iPhoneOS 10.x SDK from Xcode 8/9) or
     stubs derived from the 9.3.6 IPSW. Sign with a development certificate and a provisioning profile that names the
     UDID. Install with `ideviceinstaller` (libimobiledevice). Modern Xcode will not pair with or debug the device;
     logs come from `idevicesyslog`.
  2. **Do what PocketJS and Pocket3D do.** Downgrade to iOS 6.1.3 (OTA-signed for `iPhone4,1`) with Legacy iOS Kit,
     jailbreak with Aquila, then use `ldid -S`, SSH over `iproxy` and `uicache`. The iPod touch 4 toolchain (iOS 6.1.6)
     and the 4S toolchain share the sysroot, so Pocket3D's iPod renderers are proven on this path.
- An armv7 binary with `-miphoneos-version-min=6.0` runs on both 6.1.3 and 9.3.6, so the binary can be the same and
  only signing and deploy differ. This is a decision for the owner (task 24).
- **The linker is fragile.** PocketJS uses Xcode's `ld-classic`, which Apple is retiring. Pin the Xcode version that
  still has it, and keep an `ld64` fallback documented. The pinned zig toolchain has no 32-bit Darwin libc, so Apple
  clang is required (zig cannot sign either; ZN-372 already notes this).
- **GPU budget.** Pocket3D's weakest iOS device, the iPod touch 4 (SGX535), holds Tokyo at 60 fps with 24k triangles
  at 480×320 + 4× MSAA. The SGX543MP2 has about twice the cores and a newer architecture, so the iPod packs are a safe
  start. Rendering natively at 640×960 is a later lever.
- **Rules from the iPod work:** 4-byte-aligned attributes, `lowp` colours, one tick per `CADisplayLink` callback,
  quarter-turn matrices for a portrait drawable, `EXT_discard_framebuffer` and no `glReadPixels` except for captures
  (the tile-based GPU).

### 3.7 Per-demo gap and effort

Effort is in engineer-weeks of serial work. An agent loop compresses the writing, but not the hardware acceptance. Each
figure assumes the shared foundation is done (the "Foundation" rows).

| Demo | Devices to match | Zinc needs beyond the foundation | Effort |
|---|---|---|---|
| Foundation A: PSP target + Hero in PPSSPP | PSP | toolchain, AOT on MIPS/f32, PPSSPP runner, HAL, EBOOT, `examples/pocket-hero` | 4 |
| Foundation B: GPU 2D on PSP | PSP | GE sprite renderer, pipelined present, hardware loop | 2–3 |
| Foundation C: 3D pipeline | all | pack format, cooker (geometry + textures), desktop pack viewer, GE 3D kernel | 6–8 |
| Foundation D: Vita, 3DS, iPhone 4S bring-up | each | target, runner, HAL, 2D renderer, 3D renderer | 5–6 each |
| PocketJS Hero, Motion Lab, Talk, launcher | all four | baked keyframes are already in zinc:ui animation (ZN-364); painter-sorted 3D quads; virtual list (FlatList exists) | 2–3 |
| Pocket Figma-class viewer | PSP, Vita | tile pyramids, CLUT8 RLE tiles, streaming decode budget | 2 |
| OpenStrike-class FPS | PSP 60 fps first | BSP cook (free maps: Blender → SDHLT, or LibreQuake BSP29), PVS, hull collision, vertex-baked light, CLUT8 mips, GE morph characters, rules + HUD in TS; then the ports | 5–7 + 3 for ports |
| Pocket Tokyo-class city | Vita 60, PSP 30, 3DS 30, iPhone 60 | open-data pipeline (PLATEAU/OSM/GSI or Procedural Tokyo's MIT exporter through headless Chrome), prisms LOD, cell streaming thread, shadow sweep, three shadow and dusk implementations, sector lights, governor | 8–10 |
| Pocket Maneuver-class traversal | all four at 60 | town generator, cells and LOD, collision world, wire-hook physics; public information only | 4–6 |
| Pocket Requiem-class crowd | Vita 30 (1,750 visible), PSP, 3DS | baked pose frames, two-frame blending per GPU (GE morph, PICA/GXM/GLES vertex programs), far silhouettes, cohort culling | 4–5 |
| Pocket Atlas-class places | Vita 30, PSP, 3DS, iPhone | wet reflections, rain, haze, flipbook signs, point-sprite light fields, Vita post chain (MSAA, bloom, haze, LUT), resolution governor; start with 2 places | 6–9 |
| Pocket Voxel-class diorama | PSP 30 outdoors, Vita | tile map → voxel chunks (open tileset), CLUT8 palette-group atlases, hidden-face cull, quad merge, stratified detail | 3–4 |
| Pocket Island-class 3DS scene | New 3DS 60 | rigid GPU skinning on PICA, 30 Hz sim with interpolation, two-screen chat UI | 2 |

### 3.8 Licensing and data

- **MIT, reusable with attribution:** the PocketJS runtime (the repository root licence), Pocket Tokyo, Pocket Atlas,
  OpenStrike, Pocket Voxel, and Procedural Tokyo (`TK/web/`).
- **Pocket3D License 1.0** covers `pocket3d/`, `devices/` and `engine/pocket3d/` of the PocketJS repository. It is MIT
  plus a condition: a distributed product that draws 3D using the software, "or a work derived from" it, must show the
  unmodified Pocket3D title card for its full length (≥2 s) at every start. Several MIT game crates depend on these
  kernels (for example `pocket_psp_ge::swizzle`).
  - Recommendation: write the device kernels clean-room. The GE swizzle, Morton tiling and GXM patching are public
    knowledge in PSPSDK, libctru and VitaSDK samples.
  - Take MIT game code only where it does not pull in Pocket3D-licensed crates.
  - Record the provenance in each task's notes, as `docs/engines.md` already does for PocketJS ("no PocketJS
    implementation code was copied").
- **Data:**
  - PLATEAU (MLIT open data with attribution).
  - OpenStreetMap: ODbL, and a compiled area is a derived database.
  - GSI tiles (attribution).
  - Poly Haven (CC0), Kenney (CC0).
- **Copyrighted content to avoid:**
  - GoldSrc maps and WADs: use maps built from Blender through SDHLT, or LibreQuake's BSD-licensed BSP29 maps.
  - The Pokémon ROM: use an open tileset and Tiled maps.

### 3.9 Risks

1. **32-bit AOT runtime:** `Slot` is 8 bytes, pointers are 32 bits, and alignment differs on MIPS. Expect a spike
   (task 3) to find fixes in `src/rt`. ZN-145 is the performance follow-up.
2. **f32 numbers on PSP** change results against the f64 oracle. The simulator must run the same `psp` profile to stay
   the oracle, as fx12 does for PS1.
3. **Emulator fidelity:** see §2.12. Every 3D milestone needs a hardware receipt before it counts as done.
4. **Vita shader compiler:** releases ship cached GXPs. New shaders need the owner's console, or Vita3K's
   `--recompile-shader` for inspection only.
5. **iOS toolchain decay:** `ld-classic`, old SDK stubs, signing. Mitigate by pinning and by building the sysroot from
   the owner's IPSW, as PocketJS does.
6. **Machine limits (16 GB):** building PPSSPP, Vita3K or Azahar from source is heavy. Prefer pinned releases, build
   PPSSPPHeadless once into the toolchain cache, and run one heavy job at a time.
7. **Scope:** six purpose-built games are more than a year of serial work. Run the plan by milestones, and stop where
   the owner's goal is met.

---

## 4. Plan

### 4.1 Ordering principles

1. **The PSP first.** It has the best emulator (deterministic, headless, byte-exact), the most published numbers, the
   strictest constraints, and Zinc already has a console HAL pattern for PS1/PS2.
2. **The first demo is 2D.** `examples/pocket-hero` already compiles with Zinc: putting it on a PSP in PPSSPP needs
   only the target. GPU 2D comes next, because every 3D demo needs a UI overlay.
3. **One cooked diorama before any specific game.** A small CC0 scene authored in three.js/TS, cooked for four
   profiles and flown on rails with a zinc:ui overlay. It proves the whole chain (author → cook → device renderer →
   UI → bench) on each machine before game-specific work starts.
4. **Bring up Vita, 3DS and iPhone after the PSP 3D path** and in parallel with each other. Their 2D and 3D renderers
   reuse the pack and the cooker.
5. **Reproduce the games in order of cost:** Strike (PSP 60 fps, one map), City, Maneuver, Requiem, Atlas, Voxel,
   Island.
6. **Placement in the backlog.** New console tasks fall into the last group of `next/backlog/priority.json`
   ("deferred: cross builds and simulators"). If the owner wants this work early, create a milestone (suggested:
   "m-21 handhelds: PocketJS/Pocket3D parity") and place its group explicitly.

### 4.2 Critical path

```
1 decision ─ 2 pspdev ─ 3 AOT spike ─ 4 PPSSPP runner ─ 5 psp target ─ 7 Hero demo (first demo, ~4 weeks)
                                                              └─ 6 bench/tapes        └─ 8 GE 2D ─ 9 PSP hardware
1 ─ 10 pack ─ 11 cooker geometry ─┐
          └─ 12 cooker textures ──┴─ 13 pack viewer ─ 14 GE 3D ─ 15 diorama on PSP (first 3D demo, ~8–10 weeks)
15 ─┬─ 16..19 Vita ───┐
    ├─ 20..23 3DS ────┼─ diorama on all four (~5–6 months) ─ 28 2D parity, 29..40 game-class demos
    └─ 24..27 iPhone ─┘
```

### 4.3 Task list

Sizes: S ≤1 day, M 2–4 days, L 1–2 weeks (labels `size-S/M/L` in `tools/tasks-import`). The full descriptions and
acceptance criteria are in Appendix A as JSON for `next/tools/tasks-import`. Deps are task titles from this list or
existing `ZN-` ids.

| # | Title | Size | Deps |
|---|---|---|---|
| 1 | Decision record: handheld targets for PocketJS/Pocket3D parity | S | — |
| 2 | PSP toolchain in zinc tc: pinned pspdev SDK without Docker | M | 1 |
| 3 | Spike: Zinc Next AOT and runtime on the PSP (32-bit MIPS, f32 numbers) | M | 2 |
| 4 | PPSSPP headless runner: zinc run and zinc test --target psp | M | 3, ZN-124 |
| 5 | psp target: profile, HAL, EBOOT packaging and software-raster present | L | 4 |
| 6 | Handheld bench and input-tape harness with receipts | M | 5 |
| 7 | Demo: PocketJS Hero on PSP in PPSSPP (examples/pocket-hero) | M | 5 |
| 8 | GE 2D renderer for zinc draw lists (60 fps UI on PSP) | L | 7 |
| 9 | PSP hardware loop: PSPLINK deploy, host0 logs and on-device bench | M | 6, 8 |
| 10 | zinc pack container: zero-copy sectioned packs with receipts | M | 1 |
| 11 | Cooker v1 geometry: glTF to quantized, chunked, LOD meshes with baked vertex light | L | 10 |
| 12 | Cooker v1 textures: CLUT8 and GE swizzle, PICA Morton and ETC1, RGB565, BC1/BC3 | L | 10 |
| 13 | Pack viewer on desktop: reference renderer for cooked packs | M | 11, 12 |
| 14 | GE 3D kernel and renderer v1 for cooked packs (PSP) | L | 8, 13 |
| 15 | Demo: diorama flythrough on PSP with a zinc:ui overlay (first 3D demo) | M | 6, 14 |
| 16 | Vita toolchain, vita target, VPK packaging, HAL and Vita3K runner | L | 1, 6 |
| 17 | GXM 2D renderer for zinc draw lists at density 2 (Vita) | M | 16 |
| 18 | GXM 3D renderer and Cg shader pipeline with a cached GXP set | L | 13, 17 |
| 19 | Demo: diorama on PS Vita at 60 fps with 4x MSAA | M | 15, 18 |
| 20 | 3DS toolchain, n3ds target, 3DSX packaging, HAL and Azahar runner | L | 1, 6 |
| 21 | Two-screen zinc:ui and PICA 2D renderer (3DS top and bottom screens) | L | 20 |
| 22 | PICA200 3D renderer: picasso programs, TEV stages, fog LUT, tiled textures | L | 13, 21 |
| 23 | Demo: diorama on Nintendo 3DS at 30 fps with a touch map on the lower screen | M | 15, 22 |
| 24 | Spike: iPhone 4S OS, signing and armv7 sysroot (iOS 9.3.6 or 6.1.3) | M | 1 |
| 25 | ios-legacy target: armv7 UIKit host with GLES2, CADisplayLink and touch | L | 6, 24 |
| 26 | GLES2 renderers on iPhone 4S: zinc:ui through display-gl and cooked 3D packs | M | 13, 25 |
| 27 | Demo: diorama and pocket-hero on iPhone 4S at 60 fps | M | 15, 26 |
| 28 | PocketJS 2D demo parity on the four devices: Motion Lab, Talk, launcher, gallery | L | 9, 17, 21, 26 |
| 29 | BSP map pipeline: free maps, PVS, hull collision and vertex-baked light | L | 11, 12 |
| 30 | Strike-class FPS demo on PSP at 60 fps | L | 15, 29 |
| 31 | Strike-class FPS on Vita, 3DS and iPhone 4S | L | 19, 23, 27, 30 |
| 32 | City pipeline: open city data to a city IR and per-target packs | L | 11, 12 |
| 33 | City demo on PSP at 30 fps: palette shadows, day/night palettes, sector ambient | L | 15, 32 |
| 34 | City demo on Vita, 3DS and iPhone 4S: height shadows, shade textures, dusk lights | L | 19, 23, 27, 33 |
| 35 | Town traversal demo at 60 fps: 5,400 houses, cells, LOD, collision, wire hooks | L | 19, 23, 27 |
| 36 | Crowd battlefield demo: 4,000 units from blended baked poses, far silhouettes | L | 19, 23 |
| 37 | Places demo: wet reflections, rain, haze, flipbook signs, point-sprite light fields | L | 19, 23, 27 |
| 38 | Voxel diorama demo: tile map to voxel chunks with CLUT8 palette tricks | L | 15, 19 |
| 39 | 3DS rigid GPU skinning and 30 Hz simulation with interpolated presentation | M | 23 |
| 40 | Tile-pyramid viewer: streamed CLUT8 tiles at 60 fps on PSP and Vita | M | 9, 17 |

Totals: 1 S, 17 M, 22 L, about 230 engineer-days serial (45–60 weeks once the large city and places tasks are
counted at their real size). First demo: tasks 1–5 and 7, about 4 weeks. First 3D demo: task 15, about 8–10 weeks with
the cooker in parallel. Diorama on all four: about 5–6 months.

### 4.4 What the owner needs to provide

- The PSP model (1000 vs 2000/3000) and its CFW. PSPLINK and usbhostfs on the Mac.
- The Vita firmware and HENkaku/Ensō. A `libshacccg.suprx` extracted on the console if custom Cg shaders are compiled
  there. A firmware PUP for Vita3K.
- 3DS: Old or New, with Luma3DS. A Wi-Fi link for 3dslink or FTP.
- iPhone 4S: the iOS version, and the chosen path (developer signing on 9.3.6, or downgrade and jailbreak). The IPSW if
  the sysroot is derived from it.
- For the hardware acceptance criteria: time with each device. Every task has an emulator-checkable part, so the loop
  can go on without the device, and the device receipt closes the task.

---

## Appendix A: tasks as JSON

`deps` uses task titles from this appendix or existing `ZN-` ids. Add `key`, `size` and `milestone` when importing with
`next/tools/tasks-import` (sizes are in §4.3).

```json
[
  {
    "title": "Decision record: handheld targets for PocketJS/Pocket3D parity",
    "description": "Record the strategy for PSP, PS Vita, Nintendo 3DS and iPhone 4S (report docs/reports/hardware/pocketjs-pocket3d.md): AOT only on consoles (no QuickJS, no JIT), f32 numbers on PSP, one renderer per GPU over thin clean-room device kernels (GE, GXM, PICA, GLES2 are not normalized), one shared pack container with per-target sections, a cooker that runs on the desktop, game logic + renderer orchestration + zinc:ui in one TypeScript program (no overlay bridge), licensing rules (Pocket3D License title card on devices/ and engine/pocket3d/, MIT game code with attribution only when it does not pull Pocket3D-licensed crates), data sources (PLATEAU, OSM ODbL, GSI, CC0 assets; no GoldSrc maps, no ROMs), the iPhone 4S OS policy (open, closed by the iPhone spike), and the milestone/priority group for this work.",
    "ac": [
      "A D-numbered entry in docs/reports/zinc-next-decisions.md states each decision above with its reason",
      "A licence table lists every external source the plan may reuse, its licence and the rule for using it",
      "A target matrix gives profile name, number type, logical viewport, density, package format, runner and hardware path for psp, vita, n3ds and ios-legacy",
      "next/backlog/priority.json places the new milestone in an explicit group (owner choice recorded)"
    ],
    "deps": []
  },
  {
    "title": "PSP toolchain in zinc tc: pinned pspdev SDK without Docker",
    "description": "Add the pspdev SDK (GCC, newlib, libstdc++, PSPSDK, pack-pbp, mksfoex, psp-fixup-imports, prxgen) to next/src/tc as a pinned, checksum-verified download: release v20261001 publishes pspdev-macos-latest-arm64, pspdev-ubuntu-latest-x86_64 and pspdev-ubuntu-24.04-arm-arm64 tarballs. No Docker and no manual install, like the pinned zig. zinc doctor reports it.",
    "ac": [
      "zinc doctor lists the psp toolchain with version and sha256, and installs it on first use on macOS arm64 and Linux x86_64",
      "A tampered archive is rejected (checksum test in tests/t0 or t1)",
      "psp-g++ compiles a C++20 hello into an EBOOT.PBP through the managed tools only",
      "third_party/README.md or the toolchain doc records the licence and version"
    ],
    "deps": ["Decision record: handheld targets for PocketJS/Pocket3D parity"]
  },
  {
    "title": "Spike: Zinc Next AOT and runtime on the PSP (32-bit MIPS, f32 numbers)",
    "description": "Build the AOT C++ of a few programs plus src/rt and the runtime/ raster with psp-g++ (-O2, -G0, single float), add a psp profile mirroring ps2 (f32 numbers, 480x272), and list what breaks on a 32-bit little-endian MIPS with newlib: 8-byte Slot alignment, pointer width, libm f32, number to string conversions, stack size (run on a 1 MB thread with the VFPU attribute). Run the result in PPSSPPHeadless by hand. Compare the binary size with the prototype PS1/PS2 builds.",
    "ac": [
      "fib and at least 10 conformance programs build as PSP executables and print the same output as the interpreter under the psp profile in PPSSPPHeadless",
      "A table records binary size (text, data, bss) and peak heap for each program",
      "Every source change needed in src/rt or runtime/ is either made with a T0 test or filed as a follow-up task (ZN-145 for 32-bit references)",
      "The notes say whether the device core interpreter (src/dev) also builds for PSP, as a fallback"
    ],
    "deps": ["PSP toolchain in zinc tc: pinned pspdev SDK without Docker"]
  },
  {
    "title": "PPSSPP headless runner: zinc run and zinc test --target psp",
    "description": "Build PPSSPPHeadless from a pinned PPSSPP commit into the toolchain cache (macOS and Linux, one heavy build, -j3), and add a psp runner to zinc test and zinc run: software GE (--graphics=software), stdout captured from printf/TTY, exit code, --timeout, frame budget baked at build time like ZINC_FRAMES on PS1, and a screenshot of frame N (--screenshot) saved as PNG. The oracle is the interpreter running the same psp profile.",
    "ac": [
      "zinc test --target psp runs the conformance subset from the spike in PPSSPPHeadless and passes byte-identical against the psp-profile oracle",
      "zinc run --target psp with ZINC_FRAMES and ZINC_SHOT writes a 480x272 PNG",
      "The PPSSPP commit is recorded in the cache and in each golden directory (PPSSPP-COMMIT.txt)",
      "A T1 test covers the runner; docs/targets/psp.md documents it"
    ],
    "deps": ["Spike: Zinc Next AOT and runtime on the PSP (32-bit MIPS, f32 numbers)", "ZN-124"]
  },
  {
    "title": "psp target: profile, HAL, EBOOT packaging and software-raster present",
    "description": "Make psp a real Zinc Next target: HAL in the style of targets/ps1 and ps2 (TTY, vcount clock, 333/333/166 MHz via scePowerSetClockFrequency, pad with analog nub exposed in zinc:gfx, heap from sceKernelMaxFreeMemSize minus a margin for the GE list), present the software raster by uploading damaged bands as a texture drawn with sceGu sprites into a 512-stride double buffer, and package EBOOT.PBP (PARAM.SFO with MEMSIZE=1 option for 2000+, ICON0). Buttons map Cross=A, Circle=B, Square=X, Triangle=Y, L/R, Start, Select.",
    "ac": [
      "zinc build --target psp writes EBOOT.PBP for examples/hello and examples/breakout; both run in PPSSPPHeadless with screenshot goldens",
      "Analog input is readable from Zinc code and covered by a conformance program with a scripted input",
      "The heap size and the MEMSIZE choice are set from zinc.json targets.psp and documented",
      "docs/targets/psp.md documents build, run, memory map and verification status"
    ],
    "deps": ["PPSSPP headless runner: zinc run and zinc test --target psp"]
  },
  {
    "title": "Handheld bench and input-tape harness with receipts",
    "description": "One harness for every handheld target: input tapes (frame, buttons, analog, touches) baked into a capture build, a fixed camera route for 3D demos, and per-frame records (CPU work, GPU wait, vblanks, late frames against the period, triangles, draws, heap high-water) written as JSONL to the host (stdout on emulators, host0:/USB/LAN on devices). Receipts carry build hashes and mark emulator numbers as not hardware. Replaces ad-hoc timing in each target.",
    "ac": [
      "zinc bench --target psp --tape <file> produces a JSONL log and a summary (frames, late, worst, p50/p99) from PPSSPPHeadless",
      "The schema is documented and versioned; vita, n3ds and ios-legacy targets reuse it",
      "A replayed tape gives byte-identical goldens on two runs",
      "Emulator receipts are labelled emulator and never compared with hardware budgets"
    ],
    "deps": ["psp target: profile, HAL, EBOOT packaging and software-raster present"]
  },
  {
    "title": "Demo: PocketJS Hero on PSP in PPSSPP (examples/pocket-hero)",
    "description": "First demo. Build examples/pocket-hero (the PocketJS Hero compiled by Zinc through lib/compat/pocketjs) for psp, 480x272, and run it in PPSSPPHeadless with the software raster present. Record frame work against PocketJS's published numbers (Hero, Solid, PPSSPP: JS 2,147 us, average work 3,663 us).",
    "ac": [
      "pocket-hero renders in PPSSPP and its frame N matches the psp-profile simulator byte for byte",
      "Focus navigation with the d-pad and a press with Cross change the state in a scripted run (goldens before and after)",
      "Frame work per frame is logged and compared with the PocketJS numbers in the task notes",
      "A screenshot is added to docs/targets/psp.md"
    ],
    "deps": ["psp target: profile, HAL, EBOOT packaging and software-raster present"]
  },
  {
    "title": "GE 2D renderer for zinc draw lists (60 fps UI on PSP)",
    "description": "Draw HalCmdList on the GE, as display-gl does on GLES2: TRANSFORM_2D sprites with i16 vertices, runs batched per texture and scissor, glyph pages (4444 or T8 with a coverage CLUT), rounded corners from baked anti-aliased disc textures (radius <= 32), gradients as vertex colours, scissor clipping, per-frame bump vertex pool reset after sceGuSync, dcache writeback per batch, display lists 64-byte aligned and sized in whole cache lines, sceGuTexFlush on every bind, pipelined present (record N+1 while the GE draws N). renderer: cpu|ge|auto in zinc.json.",
    "ac": [
      "pocket-hero and examples/ui kit screens render with renderer ge in PPSSPP within mean RGB <= 8 and IoU >= 0.995 of the cpu renderer",
      "No more than about 40 GE draw calls and 2,000 quads per frame on pocket-hero (logged)",
      "PPSSPP goldens committed for the ge renderer",
      "Hardware frame time measured in the PSP hardware loop task before marking Done"
    ],
    "deps": ["Demo: PocketJS Hero on PSP in PPSSPP (examples/pocket-hero)"]
  },
  {
    "title": "PSP hardware loop: PSPLINK deploy, host0 logs and on-device bench",
    "description": "zinc run --target psp --device: load the build over PSPLINK/usbhostfs_pc, stream stdout and bench JSONL to host0:, set 333 MHz (PSPLINK starts at 222), check MEMSIZE on PSP-1000 vs 2000+, and record a hardware receipt. Document the CFW prerequisites and the Memory Stick launch path (launch from the XMB too, not only from PSPLINK).",
    "ac": [
      "pocket-hero runs on the owner's PSP from PSPLINK and from the Memory Stick through the XMB",
      "A hardware bench receipt (150 s tape) reports frames, late frames and worst frame for renderer cpu and ge",
      "docs/targets/psp.md lists the device prerequisites and known hardware-only pitfalls (dcache, texture flush, float 3D vertices, 64 px CLUT8 pages)"
    ],
    "deps": ["Handheld bench and input-tape harness with receipts", "GE 2D renderer for zinc draw lists (60 fps UI on PSP)"]
  },
  {
    "title": "zinc pack container: zero-copy sectioned packs with receipts",
    "description": "A pack format for cooked 3D content and large assets: magic, version, 16-byte section table (tag, offset, size, flags), 16-byte aligned payloads, little-endian, unknown tags ignored, readable in place (mmap on desktop, a dedicated block on consoles), plus a deterministic receipt (input hashes, cooker hash, profile, section sizes, no timestamps). Writer on the desktop, reader in C++ with no allocation for every target, and a TS view for Zinc code.",
    "ac": [
      "Spec in docs/ with the section table and alignment rules",
      "T0 tests: round trip, truncated file, unknown section, misaligned section rejected",
      "Two writes of the same input are byte-identical and give the same receipt",
      "The reader builds with psp-g++ and the desktop compilers"
    ],
    "deps": ["Decision record: handheld targets for PocketJS/Pocket3D parity"]
  },
  {
    "title": "Cooker v1 geometry: glTF to quantized, chunked, LOD meshes with baked vertex light",
    "description": "zinc cook, a desktop program (Zinc code AOT-compiled plus C++ helpers): read glTF (cgltf) or a three.js scene exported by Zinc's three.js, split into cells, simplify per level with meshoptimizer, quantize positions to i16/u16 over the cell box (PSP: signed with a x32768 model scale), pack per-profile vertex layouts (PSP 8-12 B, 3DS/iOS 8-16 B, Vita 12-20 B), u16 indices in batches <= 65,535 vertices, and bake light into vertex colours (sun + ambient + AO by BVH ray casts, adaptive edge splits). Profiles psp30, vita60, n3ds30, ios60 carry triangle budgets and fail the cook with the section named.",
    "ac": [
      "A sample CC0 scene cooks for the four profiles; two cooks are byte-identical",
      "Budgets per profile are enforced and a failure names the cell and section",
      "Quantization error and triangle counts per LOD are in the receipt",
      "No float positions are emitted for the psp profile (checked by a test)"
    ],
    "deps": ["zinc pack container: zero-copy sectioned packs with receipts"]
  },
  {
    "title": "Cooker v1 textures: CLUT8 and GE swizzle, PICA Morton and ETC1, RGB565, BC1/BC3",
    "description": "Texture lowering per profile: PSP CLUT8 by median cut (palette-aware resampling, power-of-two, <= 512, pages >= 64 px wide, full mips, masked texels coloured with the visible mean) swizzled in 16-byte x 8-row blocks; 3DS bottom-up 8x8 Morton tiling for RGBA8/RGB565/RGBA4 and ETC1 (etcpak, BSD) in PICA order; iOS RGB565/RGBA8 rows; Vita RGBA8 linear and BC1/BC3 (rgbcx/bc7enc). Optional day/night palette pairs and a reserved shadow half for later city work. Clean-room: no Pocket3D-licensed code.",
    "ac": [
      "Unit tests compare swizzle and Morton outputs against independently written reference loops",
      "ETC1 and BC outputs decode back within a stated PSNR on a test set",
      "A texture budget (bytes per profile) is enforced in the receipt",
      "Encoders are vendored under third_party with licences, or written here with the reason in the notes"
    ],
    "deps": ["zinc pack container: zero-copy sectioned packs with receipts"]
  },
  {
    "title": "Pack viewer on desktop: reference renderer for cooked packs",
    "description": "A desktop Zinc tool that draws any cooked pack (psp30, n3ds30, ios60, vita60) with Zinc's GL path, decoding each target's vertex and texture layouts, so cook errors are seen before a device or emulator is involved, like Pocket3D's browser player. Fly a fixed route and capture frames; compare with the source scene rendered by three.js on Zinc.",
    "ac": [
      "zinc run tools/packview <pack> displays each of the four profiles of the sample scene",
      "Captures at three route marks reach SSIM >= 0.9 against the three.js source render",
      "A T1 test renders one pack headless and checks a golden"
    ],
    "deps": ["Cooker v1 geometry: glTF to quantized, chunked, LOD meshes with baked vertex light", "Cooker v1 textures: CLUT8 and GE swizzle, PICA Morton and ETC1, RGB565, BC1/BC3"]
  },
  {
    "title": "GE 3D kernel and renderer v1 for cooked packs (PSP)",
    "description": "Native module for the GE (clean-room): display-list ring double-buffered and 64-byte aligned, frame pool with dcache writeback and explicit retirement after sceGuSync, CLUT8 and 565 texture binds with sceGuTexFlush, matrices. Renderer in TS on top: inverted 16-bit depth, two depth ranges (near cells and far levels), i16/u16 vertex types with the x32768 model scale, per-cell frustum culling, linear fog fitted to exp2, sky gradient, 5650 dithered framebuffers to free eDRAM, hottest textures copied to eDRAM, UI pass last with the GE 2D renderer.",
    "ac": [
      "The sample pack renders in PPSSPP within tolerance of the pack viewer at three route marks",
      "Display list <= 256 KiB per frame; no float positions in 3D draws",
      "Bench on hardware: 30 fps with 0 late frames over the route at <= 40k triangles, or the receipt and the cause recorded",
      "A hardware pitfall checklist (dcache lines, texture flush, CLUT width) is run and recorded"
    ],
    "deps": ["GE 2D renderer for zinc draw lists (60 fps UI on PSP)", "Pack viewer on desktop: reference renderer for cooked packs"]
  },
  {
    "title": "Demo: diorama flythrough on PSP with a zinc:ui overlay (first 3D demo)",
    "description": "First 3D demo: a small CC0 scene (for example a Kenney city or town kit) authored in TS with three.js on Zinc, cooked for psp30, flown on a fixed route at 30 fps with a zinc:ui title, menu and HUD drawn over it in the same program (no bridge). Reference for every later target.",
    "ac": [
      "PPSSPP goldens at three route marks with the UI over the scene",
      "Hardware receipt: 150 s route, 0 late frames at 30 fps (or recorded with cause), worst frame logged",
      "Package fits PSP-1000 user memory (about 24 MB) or the MEMSIZE requirement is stated",
      "Source, cook command and receipts documented in examples/ and docs/"
    ],
    "deps": ["Handheld bench and input-tape harness with receipts", "GE 3D kernel and renderer v1 for cooked packs (PSP)"]
  },
  {
    "title": "Vita toolchain, vita target, VPK packaging, HAL and Vita3K runner",
    "description": "Pinned VitaSDK (vdpm arm64-apple-darwin and Linux packages) in src/tc, a vita profile (f64, 480x272 logical at density 2 = 960x544), HAL (GXM display through vita2d or raw GXM, two sticks, front touch in logical pixels, 444 MHz, newlib heap size), VPK packaging (SELF, param.sfo, LiveArea), and a Vita3K runner (--console, content path, firmware PUP installed once by the user) whose goldens come from an in-app CPU render because the macOS Vulkan readback is not coherent.",
    "ac": [
      "zinc build --target vita writes a VPK for hello and pocket-hero; both boot in Vita3K",
      "zinc test --target vita runs the conformance subset in Vita3K and matches the oracle",
      "Hardware: the VPK installs through VitaShell and runs on the owner's Vita (receipt)",
      "docs/targets/vita.md documents toolchain, runner limits and prerequisites"
    ],
    "deps": ["Decision record: handheld targets for PocketJS/Pocket3D parity", "Handheld bench and input-tape harness with receipts"]
  },
  {
    "title": "GXM 2D renderer for zinc draw lists at density 2 (Vita)",
    "description": "Draw HalCmdList on GXM with vita2d's precompiled shaders (no libshacccg needed): textured and coloured quads, 1-byte coverage glyph textures baked at 2x, scissor, recycled textures instead of destroying live ones, CPU frame N+1 overlapped with GPU frame N.",
    "ac": [
      "pocket-hero at 960x544 matches the CPU renderer within mean RGB <= 8",
      "No texture is destroyed while in flight (recycler test)",
      "Hardware receipt: 60 fps, 0 late frames on the pocket-hero tape"
    ],
    "deps": ["Vita toolchain, vita target, VPK packaging, HAL and Vita3K runner"]
  },
  {
    "title": "GXM 3D renderer and Cg shader pipeline with a cached GXP set",
    "description": "GXM device kernel (clean-room): CDRAM and uncached blocks, frame rings released after the GPU, program registration and patching, MSAA 4x display surface drawn into directly, parameter buffer raised to 32 MB. Shaders written in Cg, compiled on the owner's console with SceShaccCg (libshacccg.suprx) at development time, cached as GXP keyed by source hash and shipped. Renderer: pack layouts for vita60, per-vertex sun lighting with normals, fog, sky, governor on near/mid distances.",
    "ac": [
      "The sample pack renders in Vita3K with scene counters (draws, triangles) matching the pack viewer",
      "Cached GXPs are versioned; a missing GXP fails the build with the shader named",
      "Hardware: 60 fps at 960x544 with 4x MSAA on the route, receipt recorded"
    ],
    "deps": ["Pack viewer on desktop: reference renderer for cooked packs", "GXM 2D renderer for zinc draw lists at density 2 (Vita)"]
  },
  {
    "title": "Demo: diorama on PS Vita at 60 fps with 4x MSAA",
    "description": "The PSP diorama cooked for vita60 with the same TS program and UI at density 2, plus one Vita-only enhancement (bloom on the previous frame at quarter resolution) to prove per-target techniques.",
    "ac": [
      "Same source as the PSP demo; only the profile differs",
      "Hardware receipt: 150 s route, 0 late frames at 60 fps",
      "Vita3K goldens of the UI (CPU oracle) and scene counters"
    ],
    "deps": ["Demo: diorama flythrough on PSP with a zinc:ui overlay (first 3D demo)", "GXM 3D renderer and Cg shader pipeline with a cached GXP set"]
  },
  {
    "title": "3DS toolchain, n3ds target, 3DSX packaging, HAL and Azahar runner",
    "description": "devkitARM, libctru, citro3d and picasso pinned (devkitPro pacman packages, or the digest-pinned devkitarm image as a fallback), an n3ds profile (400x240 top, 320x240 bottom, f64), HAL (circle pad, C-stick and ZL/ZR on New 3DS, touch on the lower screen, osSetSpeedupEnable, 1 MiB stack, linear heap), .3dsx packaging (CIA later), and an Azahar runner: software renderer, isolated user and SD directories, the app writes captures to SD and exits, the log is checked for unmapped accesses.",
    "ac": [
      "zinc build --target n3ds writes a .3dsx for hello and pocket-hero; both run in Azahar with goldens",
      "zinc test --target n3ds runs the conformance subset in Azahar",
      "Hardware: the .3dsx runs from the Homebrew Launcher on the owner's 3DS (receipt, Old or New noted)",
      "docs/targets/n3ds.md documents toolchain, runner and prerequisites"
    ],
    "deps": ["Decision record: handheld targets for PocketJS/Pocket3D parity", "Handheld bench and input-tape harness with receipts"]
  },
  {
    "title": "Two-screen zinc:ui and PICA 2D renderer (3DS top and bottom screens)",
    "description": "zinc:ui gains a second surface (auxiliary screen with its own size and touch), and a citro3d 2D renderer draws HalCmdList for each screen: Morton-tiled textures, one TEV modulate stage with a white texture for untextured runs, batches by texture and scissor, the lower screen redrawn only when it changes.",
    "ac": [
      "An example with UI on both screens renders in Azahar with goldens for each screen",
      "Touch on the lower screen hits the right node (scripted test)",
      "Hardware receipt: 60 fps for pocket-hero on the top screen"
    ],
    "deps": ["3DS toolchain, n3ds target, 3DSX packaging, HAL and Azahar runner"]
  },
  {
    "title": "PICA200 3D renderer: picasso programs, TEV stages, fog LUT, tiled textures",
    "description": "PICA kernel (clean-room): linear-memory buffers and textures with explicit release after the GPU, cache flushes, C3D frame handling. Renderer: picasso vertex programs for the pack layouts (s16 positions, colour, sector byte selecting one of 17 lights with mova), up to three TEV stages, fog LUT, reversed depth, ETC1/565 textures, lower screen for a map or UI. No stereo in v1.",
    "ac": [
      "The sample pack renders in Azahar (software renderer) within tolerance of the pack viewer",
      "Hardware: 30 fps with 0 late frames on the route on the owner's 3DS, CPU and GPU ms recorded",
      "Uniform usage stays within 96 float vectors (checked at build)"
    ],
    "deps": ["Pack viewer on desktop: reference renderer for cooked packs", "Two-screen zinc:ui and PICA 2D renderer (3DS top and bottom screens)"]
  },
  {
    "title": "Demo: diorama on Nintendo 3DS at 30 fps with a touch map on the lower screen",
    "description": "The diorama cooked for n3ds30, same TS program, with a top-down map and the controls on the lower touch screen.",
    "ac": [
      "Same source as the PSP demo with a 3DS layout of the UI",
      "Hardware receipt: 90 s route, 0 late frames at 30 fps",
      "Azahar goldens for both screens"
    ],
    "deps": ["Demo: diorama flythrough on PSP with a zinc:ui overlay (first 3D demo)", "PICA200 3D renderer: picasso programs, TEV stages, fog LUT, tiled textures"]
  },
  {
    "title": "Spike: iPhone 4S OS, signing and armv7 sysroot (iOS 9.3.6 or 6.1.3)",
    "description": "Decide and prove the path for the owner's iPhone 4S: (a) stock iOS 9.3.6 with an armv7 binary linked against old SDK stubs, developer signing and ideviceinstaller, or (b) downgrade to 6.1.3 with Legacy iOS Kit and a jailbreak, ldid and SSH over iproxy, as PocketJS does. Pin the Xcode with ld-classic, build the sysroot stubs (from an old SDK or from the owner's IPSW, never committed), and run a minimal armv7 GLES2 app on the device.",
    "ac": [
      "A decision entry names the path, the minimum iOS (6.0 binary floor) and why",
      "A minimal armv7 app clears the screen with GLES2 on the owner's 4S and writes a status file or syslog line",
      "The sysroot is reproducible from documented inputs and hash-pinned; no Apple binaries in the repository",
      "ZN-372 is updated with the findings that apply to modern iOS"
    ],
    "deps": ["Decision record: handheld targets for PocketJS/Pocket3D parity"]
  },
  {
    "title": "ios-legacy target: armv7 UIKit host with GLES2, CADisplayLink and touch",
    "description": "An ios-legacy target: a C host that reaches UIKit through the Objective-C runtime (classes registered at run time, no ObjC metadata to avoid ld-classic relocation crashes), a CAEAGLLayer GLES2 context at contentScaleFactor 2 (320x480 logical, 640x960), CADisplayLink at 60 Hz with exactly one tick per callback, 8 touch slots, AOT app and resources embedded, .app/IPA packaging, deploy and status receipt, frame capture with glReadPixels on request only.",
    "ac": [
      "zinc build --target ios-legacy produces an app that installs by the chosen path and runs hello and pocket-hero on the 4S",
      "The status receipt reports renderer gles2, density 2, 640x960, an advancing frame counter and the measured display rate",
      "Animations run at authored speed (tick-per-callback test)",
      "docs/targets/ios-legacy.md documents build, deploy and prerequisites"
    ],
    "deps": ["Spike: iPhone 4S OS, signing and armv7 sysroot (iOS 9.3.6 or 6.1.3)", "Handheld bench and input-tape harness with receipts"]
  },
  {
    "title": "GLES2 renderers on iPhone 4S: zinc:ui through display-gl and cooked 3D packs",
    "description": "Reuse plugins/display-gl's GLSL ES 1.00 UI renderer on iOS, and add a GLES2 3D path for the ios60 pack layout: VBO/IBO, attributes on 4-byte boundaries, lowp colours, RGB565 textures, 4x MSAA with the APPLE resolve, discard of depth after the frame. The same renderer builds on macOS through SDL3 + GLES2 as the oracle, since no emulator exists.",
    "ac": [
      "The desktop GLES2 build and the device produce matching captures of pocket-hero within mean RGB <= 8",
      "The sample pack renders on the device within tolerance of the pack viewer",
      "Hardware receipt: pocket-hero at 60 fps with CPU time per frame recorded"
    ],
    "deps": ["Pack viewer on desktop: reference renderer for cooked packs", "ios-legacy target: armv7 UIKit host with GLES2, CADisplayLink and touch"]
  },
  {
    "title": "Demo: diorama and pocket-hero on iPhone 4S at 60 fps",
    "description": "The diorama cooked for ios60 with touch controls laid out for fingers, plus pocket-hero, on the owner's iPhone 4S.",
    "ac": [
      "Hardware receipt: 150 s route at 60 fps, late frames < 0.5 %",
      "Same TS source as the console demos with a touch layout",
      "Captures from the device added to docs/targets/ios-legacy.md"
    ],
    "deps": ["Demo: diorama flythrough on PSP with a zinc:ui overlay (first 3D demo)", "GLES2 renderers on iPhone 4S: zinc:ui through display-gl and cooked 3D packs"]
  },
  {
    "title": "PocketJS 2D demo parity on the four devices: Motion Lab, Talk, launcher, gallery",
    "description": "Port the PocketJS showcase set to Zinc on PSP, Vita, 3DS and iPhone 4S: Motion Lab studies (baked keyframes, arcs, painter-sorted 3D quads with affine UVs), a chat app with on-screen keyboard and virtual list, a Cover Flow launcher, a gallery. Compare with PocketJS's published numbers (Motion Lab busiest page under 16.7 ms on PSP).",
    "ac": [
      "Each demo runs on the four devices with emulator goldens where an emulator exists",
      "PSP hardware receipts at 60 fps for each demo, or the gap recorded with its cause",
      "A comparison table with PocketJS numbers is added to this report's follow-up notes"
    ],
    "deps": ["PSP hardware loop: PSPLINK deploy, host0 logs and on-device bench", "GXM 2D renderer for zinc draw lists at density 2 (Vita)", "Two-screen zinc:ui and PICA 2D renderer (3DS top and bottom screens)", "GLES2 renderers on iPhone 4S: zinc:ui through display-gl and cooked 3D packs"]
  },
  {
    "title": "BSP map pipeline: free maps, PVS, hull collision and vertex-baked light",
    "description": "For a Strike-class FPS: read BSP (GoldSrc v30 from Blender through SDHLT, or LibreQuake BSP29, both free), subdivide faces on a world grid before i16 snapping, sample lightmaps per vertex with overbright, keep textures CLUT8 with mips, cook PVS (nodes, leaves, RLE rows) and clip hulls into the pack, and provide point-to-leaf, PVS decode and hull traces as runtime code. No copyrighted maps in the repository or packages.",
    "ac": [
      "At least one free map cooks for psp30 with counts (faces, vertices, leaves, PVS bytes) in the receipt",
      "Hull traces match a reference implementation on a scripted set of moves (T1)",
      "PVS visible sets match the reference for 100 sample points",
      "The pack viewer flies the map"
    ],
    "deps": ["Cooker v1 geometry: glTF to quantized, chunked, LOD meshes with baked vertex light", "Cooker v1 textures: CLUT8 and GE swizzle, PICA Morton and ETC1, RGB565, BC1/BC3"]
  },
  {
    "title": "Strike-class FPS demo on PSP at 60 fps",
    "description": "A round-based FPS against bots on a free map, all in TypeScript (movement, weapons, bots, rounds, HUD) compiled AOT, with a 60 Hz fixed clock, analog movement, GE rendering of the PVS-visible batches with alpha-tested CLUT8, characters as GE morphs of two baked poses (VERTICES2), additive effects, viewmodel after a depth clear, vcount guard. Target: OpenStrike's locked 60 fps on PSP.",
    "ac": [
      "PPSSPP goldens for spawn, walk, fire",
      "Hardware receipt: >= 59 fps over a 7,200-frame combat tape with 6 bots, worst warm frame recorded",
      "CPU per frame split (game, UI, draw build) logged and compared with OpenStrike's 2.2 ms JS / 8.4 ms CPU"
    ],
    "deps": ["Demo: diorama flythrough on PSP with a zinc:ui overlay (first 3D demo)", "BSP map pipeline: free maps, PVS, hull collision and vertex-baked light"]
  },
  {
    "title": "Strike-class FPS on Vita, 3DS and iPhone 4S",
    "description": "Port the Strike-class FPS renderers: GXM (two passes or one Cg program), PICA (TEV modulate, alpha test, character blend in the vertex program, touch map on the lower screen), GLES2 on the 4S with touch controls. Same TS game.",
    "ac": [
      "Each port runs the combat tape with a hardware receipt (60 fps target on Vita and 4S, 30 or better on 3DS recorded)",
      "Emulator goldens on Vita3K and Azahar",
      "No game logic differs between targets (shared source)"
    ],
    "deps": ["Demo: diorama on PS Vita at 60 fps with 4x MSAA", "Demo: diorama on Nintendo 3DS at 30 fps with a touch map on the lower screen", "Demo: diorama and pocket-hero on iPhone 4S at 60 fps", "Strike-class FPS demo on PSP at 60 fps"]
  },
  {
    "title": "City pipeline: open city data to a city IR and per-target packs",
    "description": "For a Tokyo-class city: fetch and pin open data (PLATEAU buildings, OSM roads and rails, GSI elevation) for one district, or reuse the MIT Procedural Tokyo exporter through tools/cdp.py; build a city IR (buildings with footprints and heights, facade kinds, lamps, roads); cook prisms LOD (roof grid, straightened terraces, mid 1/4 and far 1/20 of near), cells/blocks/regions, index groups by cell and 16 wall sectors, height map, lamp map, facade atlases (day and night), streamed near-cell records. Attribution and ODbL obligations documented.",
    "ac": [
      "The district cooks for psp30, vita60, n3ds30 and ios60 within each profile's pack budget",
      "The pack viewer flies the city tour; triangle counts per LOD in the receipt",
      "Data licences and attribution are in the receipt and the demo credits"
    ],
    "deps": ["Cooker v1 geometry: glTF to quantized, chunked, LOD meshes with baked vertex light", "Cooker v1 textures: CLUT8 and GE swizzle, PICA Morton and ETC1, RGB565, BC1/BC3"]
  },
  {
    "title": "City demo on PSP at 30 fps: palette shadows, day/night palettes, sector ambient",
    "description": "PSP city renderer: a worker thread sweeps the height field when the sun moves and sets bit 7 of ground indices in place (palette upper half = shaded lower half), the CPU mixes day and night palettes by the hour, walls drawn per compass sector with the GE ambient colour as light, near/far depth split, cell reader thread with prefetch, governor on distances, 2-vblank lock with 60 Hz logic.",
    "ac": [
      "Hardware receipt: 150 s tour at 30 fps with <= 5 late frames, triangles and draws logged",
      "PPSSPP goldens at three times of day",
      "Shadows move with the clock (goldens at two sun positions differ only in shaded regions)"
    ],
    "deps": ["Demo: diorama flythrough on PSP with a zinc:ui overlay (first 3D demo)", "City pipeline: open city data to a city IR and per-target packs"]
  },
  {
    "title": "City demo on Vita, 3DS and iPhone 4S: height shadows, shade textures, dusk lights",
    "description": "Vita: 16-bit height texture compared per fragment, normals with dot(N, sun), night facades with per-building late bits, bloom on the previous frame at quarter resolution, traffic ring buffer; 3DS: L8 shade texture multiplied in a TEV stage, lamp texture, 17 sector lights selected in the vertex program, fog LUT; iPhone 4S: GLES2 programs implementing the 3DS math with a luminance shadow texture uploaded in strips.",
    "ac": [
      "Hardware receipts: Vita 60 fps 0 late, 3DS 30 fps 0 late, iPhone 4S 60 fps < 0.5 % late over the tour",
      "Emulator goldens where available",
      "The same city IR and TS program drive the three renderers"
    ],
    "deps": ["Demo: diorama on PS Vita at 60 fps with 4x MSAA", "Demo: diorama on Nintendo 3DS at 30 fps with a touch map on the lower screen", "Demo: diorama and pocket-hero on iPhone 4S at 60 fps", "City demo on PSP at 30 fps: palette shadows, day/night palettes, sector ambient"]
  },
  {
    "title": "Town traversal demo at 60 fps: 5,400 houses, cells, LOD, collision, wire hooks",
    "description": "A Maneuver-class demo from public information: a procedural walled town (bands, blocks, row houses, one strip atlas, about 5,400 houses, landmarks, bridges, a few giants), cooked into cells with LOD and a collision world, runs of cells drawn in one draw (clip groups on PSP), and wire-hook movement at speed. Target 60 fps on PSP, Vita, 3DS and iPhone 4S.",
    "ac": [
      "Hardware receipts at 60 fps (or the measured rate with cause) on the four devices over a fixed traversal tape",
      "No representation switch visible inside the field of view (reviewed on device)",
      "Collision and hook physics are deterministic on the tape (byte-identical state hash)"
    ],
    "deps": ["Demo: diorama on PS Vita at 60 fps with 4x MSAA", "Demo: diorama on Nintendo 3DS at 30 fps with a touch map on the lower screen", "Demo: diorama and pocket-hero on iPhone 4S at 60 fps"]
  },
  {
    "title": "Crowd battlefield demo: 4,000 units from blended baked poses, far silhouettes",
    "description": "A Requiem-class crowd: about 4,000 units in cohorts on a 2 km field, motion baked as placed pose frames, each unit drawn as a blend of two frames (GE morph on PSP, vertex-program blend on PICA and GXM), cheap silhouettes at distance on the smaller machines, cohort-level culling. Target: up to 1,750 units visible at 30 fps on Vita; record PSP and 3DS rates.",
    "ac": [
      "Vita hardware receipt: 30 fps with >= 1,500 units in view on the tape",
      "PSP and 3DS receipts with units in view and fps recorded",
      "Emulator goldens for one frame per target"
    ],
    "deps": ["Demo: diorama on PS Vita at 60 fps with 4x MSAA", "Demo: diorama on Nintendo 3DS at 30 fps with a touch map on the lower screen"]
  },
  {
    "title": "Places demo: wet reflections, rain, haze, flipbook signs, point-sprite light fields",
    "description": "An Atlas-class demo with two places first (a rainy night street and a dusk vista): planar wet reflection (stencil mask and mirrored pass on GE, reflection target with TEV interpolate on PICA, reflection pass on GXM), rain streaks, haze, flipbook signs from material annotations, light fields as GXM point sprites, PICA vertex-expanded sprites and GE bone-weighted sprite groups, Vita post chain (4x MSAA, bloom, haze, LUT grade) with a resolution governor. Target 30 fps.",
    "ac": [
      "Hardware receipts at 30 fps for both places on Vita and 3DS, and recorded rates on PSP and iPhone 4S",
      "The scene annotations (wet, sign, lights) are read by the cooker from glTF extras",
      "Emulator goldens for each place where an emulator exists"
    ],
    "deps": ["Demo: diorama on PS Vita at 60 fps with 4x MSAA", "Demo: diorama on Nintendo 3DS at 30 fps with a touch map on the lower screen", "Demo: diorama and pocket-hero on iPhone 4S at 60 fps"]
  },
  {
    "title": "Voxel diorama demo: tile map to voxel chunks with CLUT8 palette tricks",
    "description": "A Voxel-class demo on free content: a Tiled map with an open tileset turned into 16x16-tile voxel chunks, CLUT8 atlases with the palette group in the texel index, cook-time hidden-face cull and coplanar same-shade quad merge, stratified detail streams, 16-byte vertices, constant depth bias in the projection, 30 fps outdoors with 60 Hz logic on PSP, Vita at 60.",
    "ac": [
      "PSP hardware receipt: outdoor tape at an even 30 fps, interior at 60",
      "Vita hardware receipt at 60 fps",
      "Cook receipt shows the cull and merge savings"
    ],
    "deps": ["Demo: diorama flythrough on PSP with a zinc:ui overlay (first 3D demo)", "Demo: diorama on PS Vita at 60 fps with 4x MSAA"]
  },
  {
    "title": "3DS rigid GPU skinning and 30 Hz simulation with interpolated presentation",
    "description": "An Island-class 3DS scene: rigid indexed skins with an affine palette in vertex uniforms (<= 29 joints, 87 vectors), a zero matrix to hide parts, visible index ranges coalesced, simulation at 30 Hz with poses interpolated and skinned once per display frame, two screens with a chat-style UI.",
    "ac": [
      "New 3DS hardware receipt: 60 fps with 2 animated characters and the island",
      "No per-frame vertex upload for skins (counted)",
      "Azahar goldens for both screens"
    ],
    "deps": ["Demo: diorama on Nintendo 3DS at 30 fps with a touch map on the lower screen"]
  },
  {
    "title": "Tile-pyramid viewer: streamed CLUT8 tiles at 60 fps on PSP and Vita",
    "description": "A Figma-class viewer: a large image or vector document baked to CLUT8 tile pyramids (one palette per page, RLE tiles, solid-tile markers, dedupe), at most two tile decodes per frame nearest to the centre first, a one-tile prefetch ring, levels at x2 spacing, analog panning at 60 fps.",
    "ac": [
      "PSP hardware receipt: 60 fps while panning and zooming over the tape",
      "Memory high-water stays within the PSP-1000 budget",
      "Vita receipt at density 2"
    ],
    "deps": ["PSP hardware loop: PSPLINK deploy, host0 logs and on-device bench", "GXM 2D renderer for zinc draw lists at density 2 (Vita)"]
  }
]
```
