# Lazy photograph assets and presentation stability — 2026-10-31

## Storage and loading

Source runs and native app bundles now use the existing file-backed JPEG/WebP loader. Their resource blob no longer contains every
photograph expanded to RGBA. Bundles already transport the original compressed files in their signed assets directory. Plain standalone
builds, explicit resource baking, constrained profiles and hot resource reload retain their existing embedded-image behavior. Photographs outside the runtime decoder/image-size limits retain their embedded representation rather than becoming unloadable. Linux
exports and desktop `.zapp` packages already used file-backed photographs.

Museum's `Contents/Resources/zinc.res` decreases from **92,376,618 B to 16,780,031 B**: **75,596,587 B / 81.8% removed**. This is a resource
file reduction, not an 81.8% claim for total process memory. The old baked image payload was 75,596,032 B across 15 photographs. Fonts
remain in the resource blob. Original JPEG/WebP files are not recompressed and image dimensions stay unchanged.

The existing loader now caches more than 64 names, accepts long asset names, keys by assets root and checks image lifetime identity
before reusing a handle. A destroyed/reused slot therefore reloads the original asset instead of returning another image. The photo cache reuses its path records on hits. Both the gfx API and native texture readers route through `zn_asset_image`; native texture release also reaches file-backed
images. No new runtime opcode or dependency was introduced. QuickJS now receives the existing resource-statistics host row too.

Embedded and file-backed assets share their raster sampling routine. Their previous sampling paths evaluated source coordinates with a
different multiplication/division order, enough to change pixels under fractional scaling. The shared asset path preserves the embedded
reference arithmetic, including opacity and rounded bounds. Generated surfaces, video buffers and other mutable runtime images retain
their optimized raster path.

Museum also defers constructing its storyboard thumbnails until the map is opened, instead of decoding photographs for a hidden map during startup. Preparation happens in the open event, before drawing or animation.

Decoded named assets remain cached for handle stability until explicitly released or process exit. This removes eager startup allocation
and duplicated expanded package data; it does not introduce automatic eviction for raw shared `image(name)` handles. The first access
still pays synchronous decoding cost. The portable JPEG decoder still allocates full-size RGBA temporarily.

## Black-flash regression

The adaptive macOS presenter removed the IOSurface view before the first Metal drawable was presented. Surface resizing also cleared the
previous layer contents before the new image was ready. Both could expose an empty frame.

The default now stays on Metal. `ZINC_PRESENT=auto` remains an explicit experimental mode; its transition is not claimed flicker-free.
Resizing keeps the last published snapshot until replacement. Continuous Metal presentation retains more idle GPU resources than the
experimental snapshot mode. Historical adaptive memory measurements describe the opt-in mode, not the current default. Existing apps
must be restarted, and statically linked `.app` bundles rebuilt, to use the corrected presenter.

## Proof

- `surface_present`: real background window; old layer contents retained over resize, immutable published images, explicit adaptive
  allocation cycles, default Metal retained over 60 idle calls.
- `window_live_resize`: passed with the rebuilt window library.
- `photo_files`: 100 JPEG assets, including a long filename; repeated lookups, destroyed/reused handle reload, traversal refusal. Identical
  pixel hashes under interpreter, AOT, QuickJS, standalone embedded build and a self-contained macOS bundle launched outside its project.
  The image uses fractional scaling, partial opacity and rounded bounds. Source/bundle runs externalize the 100 runtime-sized photographs and retain one 20,000 × 1 compatibility fixture embedded; standalone
  builds retain all 101 photographs.

Local evidence: `.logs/memory-pass4/`, resource-size baseline in `before.json`; the rebuilt Museum probe uses the shared scenario including
model, video and panorama. Other operating systems and devices were not built or tested. No quiet-machine CPU benchmark was performed.

## Measured memory

With continuous Metal presentation in both cases, `tools/window-memory --wait 8` reports **209 MiB** for the embedded-resource control
and **161 MiB** for the optimized app: **48 MiB / about 23% less physical footprint** in these two local snapshots. The tool labels the
integer output MB but divides bytes by 1,048,576. Both runs are sequential, use the same final program/source assets and presenter, and
run in background. The control is a plain `build --no-embed` with expanded resources; the optimized bundle uses encoded photo files.
These are observations on this Mac, not a statistical guarantee or a comparison with the experimental adaptive presenter.

A separate native GL route, three cycles home → model → video → panorama → home, starts with **7 decoded photos / 31,262,720 B**,
instead of **75,596,032 B** eagerly baked: **44,333,312 B less photo payload at startup**. The closed storyboard previously triggered
14 photos / 66,158,848 B even after file externalization. After three visits, 10 named photos remain cached / 50,728,192 B; opening the
storyboard later can load the remaining pictures. Baked image bytes are zero throughout this route, and hidden targets, video buffers
and video source contexts are zero at each return home. RSS reads 65.8 MiB initially and 70.4 MiB finally; it is not physical footprint
and no RSS percentage reduction is claimed. Raw data: `museum-final/samples.jsonl`, `footprint-before.log`, `footprint-after.log` under
`.logs/memory-pass4/`.

`museum_visit` retains all existing frame/story goldens, including the native overlay; `museum_probe` now also checks that a closed
storyboard stays below 40 MiB of decoded image payload.
