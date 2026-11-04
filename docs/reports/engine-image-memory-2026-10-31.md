# Image lifetime and Museum memory — 2026-10-31

The UI image cache is now shared standard-library code, with Discord as its first integration. Runtime image destruction also releases
its GL replay texture. Museum's repeated visit exposed a separate lifetime problem: hidden model/panorama output targets and stopped
video decoders remained allocated. These are now released after transitions, while the small scene/view state remains available.

## Implementation and ownership

- `zinc:ui/image-cache`: byte and entry limits, byte accounting, LRU eviction, explicit reservations for handles held outside UI nodes.
  Live nodes protect image handles, inline text pictures and backgrounds, including layers and detached trees. Eviction takes one snapshot
  of those references and sorts cold candidates once. It does not scan every frame. Fresh loads receive a 250 ms mounting grace period;
  explicit clearing bypasses the grace period. The live working set can exceed either limit. Cache ownership is a transfer: callers must
  not destroy those images themselves. Mutable surfaces, decoder outputs and animation frames are not cache entries.
- Discord: 16 MiB / 512-entry decoded cache, maintenance every two seconds, unused-entry clearing on background, original compressed
  files retained in the existing disk cache, existing request deduplication and signed-URL refresh preserved. Disk hits no longer create
  a Zinc byte array before decoding. `zinc:imageio.load` decodes on its existing bounded worker pool at the physical display size. Network
  media dimensions now follow pixel scale; avatars remain capped at 128 px. Failures and in-flight loads remain separate from residency.
- Portable WebP: use the already-linked libwebp advanced decoder with an external, target-sized RGBA output buffer. It avoids allocating
  full-resolution RGBA before resizing. Existing Apple ImageIO decoding already supports thumbnail/subsampled decode. JPEG/PNG in the
  portable stb reader still decode fully before resizing; this change does not claim to solve their temporary peak.
- ImageViewer: owns fresh `sharper()` results, releases them after detaching on navigation/close, and destroys stale async completions.
  Thumbnail reservations cover the whole viewer list, not only the currently displayed image.
- GL replay: each renderer observes the runtime destruction epoch and collects its own textures with its context current, on active or
  idle frames. A separate image identity distinguishes a destroyed/reused slot from an updated live image. No scan occurs without a
  destruction. CPU IDs and existing rendering versions keep their meaning.
- QuickJS: canonicalize standard-library file imports to the corresponding `zinc:` module identity, preserving plugin overrides. The
  cache regression exposed duplicate UI state when `./ui` and `zinc:ui` instantiated separately. The fix belongs in module resolution.
- Museum: hidden cameras dispose their render targets only after both sides of a transition finish drawing. Camera rendering already
  recreates those targets lazily. Active overlay/background stages stay protected. Stopped films close their native player and source
  contexts; subsequent playback opens the original file again. Models, geometry, view objects and embedded source images remain cached.

These choices follow the same separation as [Flutter's live images and bounded cache](https://api.flutter.dev/flutter/painting/ImageCache-class.html)
and [Fresco's decoded/encoded/disk levels](https://frescolib.org/docs/caching.html). The WebP implementation uses the existing
[advanced decoding API](https://developers.google.com/speed/webp/docs/api#advanced_decoding_api). No dependency was added.

## Museum: native window, before/after

AOT bundle, macOS arm64, real GL renderer, real FFmpeg, Retina 3840 × 2160 window. Both runs use five complete cycles:
home (`ukiyo-e`) → model (`porcelain`) → video (`wave`) → panorama (`garden`) → home, two-second dwell after settled transitions.
No screenshots were taken during sampling. CPU timing and system memory pressure were not controlled; these are resource-lifetime
measurements, not a speed benchmark. RSS is resident memory, not macOS physical footprint.

Raw evidence (local, ignored): `.logs/memory-pass3/museum-full/samples.jsonl` before Museum cleanup;
`.logs/memory-pass3/museum-after/samples.jsonl` after. Each contains 21 samples and the endpoint's native PID.

| Resource at home after a complete visit | Before cleanup | After cleanup, every cycle |
|---|---:|---:|
| 3D output targets | 2 | 0 |
| Target CPU pixels | 31,680,000 B | 0 |
| Target GPU payload estimate | 380,160,000 B | 0 |
| Video output buffers | 8,198,400 B | 0 |
| Open video source contexts | 2 | 0 |
| Replay textures | 11 | 8 |
| Replay texture GPU payload estimate | 66,222,080 B | 32,902,400 B |
| Retained model / panorama view objects | 1 / 1 | 1 / 1 |

The cleanup releases 39,878,400 B of CPU output buffers. GPU figures describe requested allocations, not measured physical VRAM; on
Apple unified memory they must not be blindly added to RSS. Image `borrowedBytes` references those same target/decoder pixels and is
not another allocation. Source textures and meshes remain reusable. The remaining extra replay texture is a baked image loaded during
the visit, not a dead output target.

| Return home after cycle | Before RSS (MiB) | After RSS (MiB) |
|---:|---:|---:|
| 1 | 73.9 | 70.0 |
| 2 | 71.9 | 55.3 |
| 3 | 71.9 | 53.8 |
| 4 | 69.9 | 53.8 |
| 5 | 55.7 | 52.2 |

RSS varies with macOS compression, paging and driver reuse, even with unchanged live resource counters. The zero target/source counts
prove release more directly than an RSS percentage. Active scenes still allocate their required output targets, and returning to them
works over all five cycles. The baked image provider still reports 75,596,032 B of image payload; externalizing/lazily decoding this
embedded payload is a distinct remaining opportunity, not a benefit claimed for this cache.

Reproduce after building:

```sh
ZINC_BACKGROUND=1 build/zinc build --bundle examples/museum-table/src/main.ts -o examples/museum-table/build/museum-probe.app
ZINC_BACKGROUND=1 ZINC_RENDERER=gl tools/museum-probe --launch examples/museum-table/build/museum-probe.app/Contents/MacOS/zinc --port 19329 --cycles 5 --dwell 2 --output .logs/museum-memory
```

The checked-in scenario now includes the panorama. The probe stops the app it starts.

## Validation

- `image_cache`: interpreter, AOT, QuickJS; byte/count LRU, 100 repeated navigation/unmount cycles, live/detached nodes, inline pictures,
  nested reservations, duplicate insertion and explicit clearing. Cache-owned pixel bytes return to zero after unmount and trim.
- `image_lifetime`: real background GL window; three upload/destruction cycles, idle-frame cleanup and slot reuse before collection.
- `viewer_lifetime`: interpreter/AOT/QuickJS; navigation, current and next thumbnail reservations, displayed/stale high-resolution results, repeated close.
- `discord_viewer`: isolated fake server and disk cache, normal picture interactions plus five channel round trips; decoded cache counts
  and pixel bytes stabilize at the same home state. No real account or user session is used.
- `imageio`: portable and system decoders, downscaled WebP, orientation, pixel assertions, animation, cancellation and QuickJS.
- `discord`, `qjs`, `display_gl_scroll`, `museum_visit`, `museum_video`, `museum_panorama`, `museum_probe`: passed. The Museum probe regression now requires zero hidden
  targets and stopped decoder/source objects at home over repeated visits, while active 3D views still allocate targets.

The full Discord session was compared with a temporary copy using the previous CDN loader in the same working tree. Its old showcase
hash reproduced. The new hash changes 2,810 pixels out of 5,760,000, confined to downscaled embed thumbnails (bounding box 423,405–1136,599);
both full screenshots were inspected. Session text, main-window hash and showcase interactions match. Two duplicate CDN GETs disappear
because still/animation loads now share download deduplication. Only those request counts and the showcase hash were updated. The test
normalizes both event multisets with C collation, removing an existing machine-locale ordering dependency. Local captures and temporary
reference outputs are under `.logs/memory-pass3/discord-baseline*` and `discord-current*`.

Only the development Mac was exercised. Other operating systems and devices remain for the cross-platform pass. Visible animation
frames are still owned by their components and released on unmount; this static cache is not an animation streaming system. Cold
images and stopped videos may pay a decode/reopen cost when revisited. The working tree contains unrelated ongoing changes; no commit
or push was made as part of this pass.
