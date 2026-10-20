# Assets that exist exactly once: audit and design

Research report, 2026-10-18. No code changed. Code claims cite `file:line` read on this date; web claims cite a URL (all fetched or seen in search results on 2026-10-18; items marked (unverified) were not confirmed on the page). Paths are under the repository root; `next/` is Zinc Next. Not redone here: the OTA design (`docs/reports/zinc-app-ota-updates.md`), the museum measurements (`docs/reports/zinc-next-assets-outside-binary.md`, 2026-10-12), the pipeline design (`docs/reports/games/toolchain-assets-loading.md`).

Goal: an asset (image, font, audio, video, model, data, shader) is stored once, where it suits the target and its size, mapped or loaded lazily, identified by content hash, so OTA and dev reload move only what changed.

## 1. Exists

| Piece | Evidence |
|---|---|
| ZPK packs: per-entry codec (none, lz4, zstd, zstd+dict), group, kind, 16-byte SHA-256 per entry, index hash for signing, deterministic bytes, alignment up to 1 MiB | `docs/zpk.md` (Layout, Codecs, Determinism); decision D89, `docs/reports/zinc-next-decisions.md:159` |
| Packs are mapped read-only, never read into a buffer; an entry stored `none` is a pointer into the mapping | `src/host/assets_host.cpp:138` (`mmap(... PROT_READ, MAP_PRIVATE ...)`); `docs/zpk.md` ("read in place") |
| Asset build: import graph, XXH3-128 content-addressed cache (`~/.zinc/cache/assets`), one pack per group, rewritten only when its key changes; the same file under two names is imported once | D91 (`decisions.md:161`); `docs/reports/zinc-next-assets.md:220`; `src/assets/assets.cpp` |
| Per-target asset profile (texture format list, maxSize, audio codec, pack codec, budgets) | `targets/capabilities.json:3-19` (e.g. android `etc2\|etc1\|rgba8`, `pack: lz4`; ios `astc`; wasm `ktx2:uastc`, `pack: none`, `split: group`; esp32 `rgb565`, `lz4`, flash budget 2MB) |
| Texture importer to GPU block formats via pinned basisu (ZN-439, Review) | `src/assets/texture.cpp:47-54`; `backlog/tasks/zn-439*.md` status Review |
| The baker skips images that a `texture` rule takes (`o.leave`), so a compressed texture is not also baked as RGBA | `src/main.cpp:421-428` |
| Fonts subset to the characters the program can show (whole fonts only with `"text": "shaped"`) | `src/res/res.h:19`, `res.cpp:610` |
| System-font fallback for what the embedded faces do not cover (no embedding of emoji fonts) | `src/text/shaped_gfx.cpp:28-38` |
| Mounting order and overlays: later pack replaces earlier entry per name (patches, mods) | D92 (`decisions.md:162`), `assets_host.cpp:148` |
| Resident-set budgets enforced, refcounted handles, group load/release | D92; `assets_host.cpp:361,476` |
| `zinc dev` asset hot reload by entry hash: rebuild dev packs, send only entries whose hash changed (`ZINC_DEV_FD`), swap in place | D97 (`decisions.md:164`); `src/cli_core.cpp:2726-2754` |
| Boot splash as an uncompressed entry of `boot.zpk`, mapped before anything starts | D96; `src/host/splash.cpp:3,82-100` |
| Per-file SHA-256 in `.zapp` manifest; file-level delta idea for OTA | `docs/zapp.md`; OTA report section 5.4 |
| Dev vs release split: `zinc run`/`dev` mount dev packs from `build/assets/<target>` and read loose `assets/` (`ZINC_ASSETS`); `export` builds release packs | `src/main.cpp:681-695`; `cli_core.cpp:1753`; D66 / `docs/guide/07-distribution.md:186-201` |

## 2. Partial (works, but a second copy is possible or the check is missing)

Inventory of what lives where today, then every duplicate I found.

| Asset kind | Native AOT / `zinc build` | `.zapp` / fused | macOS `.app` | wasm export | Android / iOS | ESP32 |
|---|---|---|---|---|---|---|
| Images drawn by the UI, fonts | baked blob `kResources` in the executable (`aot.cpp:456-458`), copied to the heap at start (`resources.cpp:83-84,94-95`) | `resources.bin` member (`main.cpp:1744`) | in the executable | `app.res` (`cli_core.cpp:1650`) | in the shell binary | not supported (ZBC only, 48 KB cap, `cli_core.cpp:909`) |
| Everything else in `assets/` (audio, video, models, JSON) | loose `assets/` beside the exe (`cli_core.cpp:1763`) or ZPK groups | `assets/...` members (`main.cpp:1760-1765`) plus `packs/*.zpk` (`main.cpp:1767-1769`) | `Contents/Resources/assets` | loose `assets/` copy (`cli_core.cpp:1680`) | APK `zinc/assets`, then copied to disk (`cli_core.cpp:1404-1414`); iOS `assets/` in the bundle (`cli_core.cpp:1542`) | none |
| ZPK groups | `build/assets/<target>/*.zpk`, found beside the exe (`runtime/include/zrt_assets_dir.h:26-33`) | members `packs/*.zpk`, unpacked to cache | not copied by the export code I read | not copied; target says `pack: none, split: group` (`capabilities.json:14`) but no group files are written | not copied | no flash partition (`cli_core.cpp:921`) |

Duplicates, ordered by size of the effect:

1. **Baked RGBA and the source file.** The `.app`/dist keeps `assets/photo.jpg` and the baked RGBA of it in the executable. Measured on the museum build: executable 93.67 MB of which 87.35 MB is the `ZRS1` blob; 15 images become 75.60 MB of RGBA from 5.71 MB of JPEG; the `.app` holds both (`docs/reports/zinc-next-assets-outside-binary.md`, "Ce que contient actuellement le build"). Cause: `exportNative` always copies the whole `assets/` (`cli_core.cpp:1763`) and the baker bakes every image of it (`main.cpp:419-428` skips only `texture`-rule images).
2. **Baked blob embedded and then copied to the heap.** The blob lives in the binary's data segment and `installResources` mallocs and memcpys every image and font (`resources.cpp:83-84,94-95`): two copies in RAM terms (file-backed pages plus heap). The museum report counts 75.60 MB images + 11.61 MB fonts copied at start.
3. **`.zapp` unpacked into a cache.** `zinc run app.zapp` and a fused exe unpack all members to `~/.zinc/cache/zapp/<id>` (`main.cpp:1124-1132`); the archive and the cache hold the data twice on disk. The docs promise "read in place from the member" (`docs/zpk.md`, 1st paragraph) but the code unpacks; recorded as open in `backlog/later.md:43` (ZN-430). A fused exe also contains the whole engine (15 MB for a hello, `docs/zapp.md`).
4. **`.zapp` containing loose `assets/` and the packs.** `pack` adds every file of `assets/` as a member and, when `assets.packed()`, also the `packs/*.zpk` built from them (`main.cpp:1760-1769`). A packed project therefore ships each source and its pack entry.
5. **Android: APK `assets/` then copy to app storage.** The shell copies `zinc/assets/*` to disk once per version (`cli_core.cpp:1404-1414`, `src/app/shell_sdl.cpp:90-95`): APK copy plus filesystem copy. Compression is not controlled (no `noCompress`/`androidResources` found in `cli_core.cpp` or `templates/`), so an asset read through the APK cannot be mapped without inflating it.
6. **Web: `app.res` baked images and the loose `assets/` copy** (`cli_core.cpp:1650,1680`), and the page splash as a data URL in `index.html` (D96). Same file twice in the download; the 40 MB `download` budget (`capabilities.json:14`) does not see it.
7. **Texture-compressed and source image.** Avoided only if a `texture` rule exists; without it (the museum case, simple `"assets": "assets"`) no rule applies, so the RGBA bake and the file coexist (museum report: "cette exclusion n'a pas été appliquée").
8. **Fonts.** Subsets of `lib/fonts` Inter/JetBrains Mono are baked into every program (3 subsets 0.068 MB) plus 58 rasterized variants 11.69 MB in the museum build; with `"text": "shaped"` whole TTFs are embedded (`res.h:19`) and the system font fallback may load the same family from `/System/Library/Fonts` (`shaped_gfx.cpp:38`). Not a duplicate by design, but nothing checks it.
9. **`texture` + `leave` is by exact rule match only** (`main.cpp:427`): an image referenced from code that is also in a group via a second rule can land in two packs. No cross-group duplicate detection exists (compare Unity, section 5).
10. **ZPK entries are deduplicated by name only.** Two names with the same bytes in two groups are stored twice; the importer cache dedups work, not storage (`assets.cpp` keys by content, `zpk.cpp` has no content-addressed table).
11. **Native export may ship no packs at all (unverified).** `export` builds release packs into `build/assets/<target>` (`cli_core.cpp:1753`) but I found no copy of them into `dist/<name>-<target>/`; `zrt_program_packs_dir` looks for `<base>/assets/<target>/.packs` (`zrt_assets_dir.h:26-33`). A packed project exported natively would then run from the loose-file path or fail. Needs one run to confirm.

Other gaps in the pieces that exist:

- `zinc assets` implements `build|info` only (`cli_core.cpp:99`); `ls`, `report`, `check`, `clean`, `verify` are task ZN-437, status Backlog (`backlog/tasks/zn-437*.md`). The budgets in `capabilities.json` are therefore not enforced by any command.
- The pack codec per profile is not wired into release packs (`backlog/later.md:77`, ZN-435); `assets.dir` is ignored by the baker, export and `zinc:assets` (`later.md:76`).
- `report.json` has per-asset rows (`assets.h:58-60`) but no refcount, no location column and no duplicate section.

## 3. Missing

- A single rule for where each asset lives per target, enforced by the exporters. Today every exporter decides on its own (table in section 2).
- A resolver that returns a pointer into a pack instead of a copy for the baked fonts and images (the baker's blob is a private format, `res.h:7`, not a ZPK).
- Content-hash identity above the entry: pack file names include no hash (the research report proposes `level1.3f9a….zpk` for the browser, `toolchain-assets-loading.md:482-486`), so no cache, CDN or OTA step can say "same bytes".
- Build-time duplicate and dead-asset report (`--report-assets`), and unreferenced-asset stripping (references from code literals are known to the baker; dynamic names such as `project.json` entries need a manifest, as the museum report notes).
- Android `noCompress` for packs, and Play Asset Delivery / iOS ODR mapping of groups.
- ESP32 data partition for packs and `esp_partition_mmap` reader (design only, `toolchain-assets-loading.md:402-415`; nothing in `firmware/esp32`).
- Pack-level delta for OTA: no per-pack hash is exposed in a manifest (only per-file SHA-256 in `.zapp`, `docs/zapp.md`).

## 4. How others do it (sources)

| Product | Mechanism relevant to single-copy | Source |
|---|---|---|
| Godot | `.pck`/zip resource packs; a later pack replaces a same-path file; patch packs hold only differing resources; delta encoding makes patches smaller but slower to load. The page does not say whether sources or imported outputs are packed (unverified) | https://docs.godotengine.org/en/stable/tutorials/export/exporting_pcks.html |
| Unity Addressables / AssetBundles | An asset that is not addressable but referenced is copied into every bundle that references it (implicit assets); two loaded bundles can hold two instances. Fix: make shared assets explicit in one group; Analyze rule "Check Duplicate Bundle Dependencies" and Build Layout Report | https://docs.unity3d.com/Packages/com.unity.addressables@2.0/manual/AssetDependencies.html , https://docs.unity3d.com/cn/current/Manual/assets-avoid-duplication.html |
| Unreal | IoStore writes `.utoc` (table of contents) + `.ucas` (container) beside the `.pak`; paks and IoStore containers cannot be mixed. Zen loader and mmap details not confirmed (unverified) | https://www.slideshare.net/slideshow/ue425iostore/239108822 , https://www.fab.com/listings/ef814175-81dd-4ab5-af3e-56a80c1112c4?lang=es-mx |
| Android Play Asset Delivery | install-time (counts toward size, needs 2x free space), fast-follow, on-demand; packs are expanded to internal storage; "intended for games larger than 200 MB"; texture-format targeting gives one download per format. Mmap/uncompressed storage not covered on the page (unverified) | https://developer.android.com/guide/playcore/asset-delivery |
| Android `noCompress` | Gradle `noCompress` keeps listed extensions uncompressed in the APK; empty string equals aapt `-0`. That openFd/mmap needs a stored entry is common knowledge but this page does not say it (unverified) | https://developer.android.com/reference/tools/gradle-api/com/android/build/api/dsl/AndroidResources |
| iOS On-Demand Resources | Assets get tags; the app requests tags; the OS downloads and purges unretained packs when storage is needed; size limits are on another page (unverified) | https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/On_Demand_Resources_Guide/ |
| Electron asar | One archive treated as a directory; APIs needing a real path (`execFile`, `fs.open`, `dlopen`) force extraction to a temp file; `--unpack *.node` leaves native modules in `app.asar.unpacked`. Lesson: files a native API must open by path are the only ones to keep outside the archive | https://www.electronjs.org/docs/latest/tutorial/asar-archives |
| Tauri | Frontend assets embedded in the binary at compile time, Brotli-compressed by default; in dev mode `AssetResolver::get` reads the dist directory directly (same dev vs release split Zinc needs) | https://v1.tauri.app/zh-cn/v1/guides/building/app-size , https://v2.tauri.app/release/tauri-codegen/v2.0.0-rc.0/ |
| Bevy asset processor | Source assets processed into a separate output; hash of source+meta stored in the processed metadata, plus a `full_hash` including process dependencies; reprocessed only when changed; write-ahead transaction log | https://dev-docs.bevyengine.org/bevy/asset/processor/struct.AssetProcessor.html , https://doc.qu1x.dev/bevy_trackball/src/bevy_asset/meta.rs.html |
| ESP-IDF | `esp_partition_mmap()` maps a partition region through the flash cache into the CPU data space, any offset inside the partition (spi_flash_mmap needs 64 KB alignment), read-only, main flash only; with flash encryption it is the way to read decrypted data | https://docs.espressif.com/projects/esp-idf/en/v5.0/api-reference/storage/spi_flash.html , https://docs.espressif.com/projects/esp-idf/en/v4.4.7/api-reference/storage/spi_flash.html |
| zstd seekable format | Independent frames and a seek table in a trailing skippable frame; smaller frames = faster random access, worse ratio. Same idea as ZPK's per-entry codec; useful only for one huge entry (video, big audio) | https://cdn.jsdelivr.net/npm/cppzst@2.0.12/deps/zstd/contrib/seekable_format/zstd_seekable_compression_format.md |
| casync / desync | Content chunks in a store named by hash; client fetches only chunks missing from its index; identical content gives identical chunks at any offset. Hash algorithm differs between sources (sha256 vs SHA512-256): check before copying | https://en.wikipedia.org/wiki/Casync , https://github.com/kmeaw/desync |
| KTX2 / Basis Universal | One file transcodes at load time to BC7 on desktop, ASTC/ETC on phones; ETC1S for small, UASTC for quality; zstd supercompression by default on UASTC. Container details from the Khronos spec were not retrieved (unverified) | https://skia.googlesource.com/external/github.com/BinomialLLC/basis_universal/+/refs/tags/v2_0 |

Not searched or not confirmed this session (no claim made): Flutter assets, Git LFS, IPFS naming, WOFF2 subsetting numbers, Opus/ADPCM sizes, OSTree. Treat any design point resting on them as unsourced.

Two things follow from the sources without a web claim of their own: pages of a read-only mapped file are page cache, shared by processes and evictable, so a mapped pack is the one zero-copy form (that is how `assets_host.cpp:138` already behaves); and compression and mmap conflict (a compressed entry must be decoded into a new buffer), so the pack codec must be `none` for anything the consumer can use as stored (GPU block textures, Opus, glTF buffers, ZBC) and compression is for the transfer only.

## 5. Proposed

### 5.1 One rule: where each asset lives

| Target class | Rule | Why |
|---|---|---|
| Desktop (macOS, Linux, Windows), Pi, CHIP | External packs only: `<app>/Resources/*.zpk` (macOS), beside the exe elsewhere. Binary holds code, shaders and a boot set below 256 KB (splash, error font subset). No baked image or font blob | mmap shares the page cache; no heap copy; the museum case drops 87 MB from the executable |
| `.zapp` / fused | Packs are the members; read them in place at the member's offset (ustar stores members on 512-byte boundaries, `docs/zpk.md`); no cache unpack except for plugin libraries that need a real path (the asar lesson) | removes duplicate 3 |
| Android | Packs in `assets/` with `noCompress "zpk"`, opened with `AssetManager.openFd` and mapped, or Play Asset Delivery packs for large groups; no copy to app storage | removes duplicate 5. The openFd-needs-stored-entry rule: verify on the Nexus 7 rig before relying on it (unverified) |
| iOS | Packs in the app bundle (read-only bundle files map), big groups as ODR tags | same |
| Web | One file per group, content-hashed name, fetched on demand, cached by name (already designed, `toolchain-assets-loading.md:482-486`); no `assets/` copy, no `app.res` duplicate of the same image; splash inline is the boot set | removes duplicate 6 |
| ESP32 and other no-filesystem boards | Packs in a data partition, read with `esp_partition_mmap`; `pack: none` or lz4 for entries that are decoded once; boot set may be linked in | only place where "embed" is the right default |
| PSP, Vita, 3DS | Packs as files of the package; read, no mmap (research table, `toolchain-assets-loading.md:402-415`) | platform limit |

Rule for the exporter: **embed in the binary only when `fs` is false in `capabilities.json` or for the boot set; never embed anything that is also in an external pack**. The baker's blob becomes a ZPK group (`boot` for the engine fonts and the splash, `ui` for baked images), so one reader serves it; fonts and images are then pointers into the mapping instead of mallocs (fixes duplicate 2).

### 5.2 Identity by content hash

- Pack file name = `<group>.<first 12 hex of indexHash()>.zpk`; a small signed `assets.manifest` lists `name -> pack, indexHash, size` and, per entry, the 16-byte hash already in each TOC row (`docs/zpk.md`, TOC row offset 48). No new hash is needed; `indexHash()` is already the value a signed manifest should record.
- Dedup at write time: `zpk::write` keeps a table of entry hashes within a pack and stores identical bytes once, with two TOC rows pointing at the same offset (the format already has a data offset per row; no format change). Across packs, the build rejects or warns (5.3) instead of silently storing twice.
- The same hash drives: dev hot reload (already by entry hash, D97), OTA (send packs or entries whose hash changed; reuse `.zapp` per-file SHA-256 idea; casync-style chunking is not needed for assets that are already entry-sized), and the browser cache name.
- Variants (same texture at several sizes): produce them from one source in the import graph (cache key already includes options), store only the variants a target's profile asks for (`maxSize` in `capabilities.json`), never the full-size source next to a downsized texture.

### 5.3 `zinc build --report-assets` (also `zinc assets report`, ZN-437)

Output, text and `report.json` (extends `assets.h:58-60`):

```
asset                    kind    bytes   location               refs  hash
photos/irises.jpg        image   0.31MB  ui.3f9a1c.zpk          1     b41c...
photos/irises.jpg        image   4.06MB  <executable: baked>    1     e90d...   DUPLICATE of ui.3f9a1c.zpk
sfx/click.opus           audio   12KB    boot.77aa02.zpk        3     12ef...
totals: pack 38.2MB, executable-embedded 87.3MB (limit 0.25MB), duplicates 2 (4.06MB), unreferenced 3 (0.9MB)
```

- Location: pack file and offset, `<executable: baked>`, `<loose file>`, or `<system font>`.
- Refs: number of program references (literals, atlas members, group lists, manifest entries); an entry with 0 is "unreferenced" (dead-asset candidate); entries named only by a dynamic manifest are marked `dynamic`.
- Duplicates: (a) same content hash in two locations; (b) source file shipped loose and also in a pack or baked; (c) a baked image and a texture-rule image from the same source.
- Gate: error when anything is embedded beyond `boot` budget on a target with `fs: true`, when a duplicate exists, or when `capabilities.json` budgets (`boot`, `ram`, `gpu`, `download`, `flash`) are crossed; warning for unreferenced. CI uses the exit code (ZN-437's `check`).

### 5.4 Dev loop versus release

| | `zinc run` / `zinc dev` | release (`pack`, `export`, `build --release`) |
|---|---|---|
| Source of truth | loose `assets/` read through `ZINC_ASSETS`, dev profile packs in `build/assets/<target>` (`main.cpp:681-695`) | release packs only; source files are not shipped |
| Packing | none for loose files; dev packs for projects that declare groups | one pack per group, per-target codec/texture format, content-hashed names |
| Change | per-entry hash diff, swap in place (D97) | whole new pack set; OTA sends changed packs |
| Embedding | nothing embedded except the boot set, so the dev binary and the release binary load the same way | boot set only |
| Check | none | `--report-assets` gate |

Today the dev run bakes images into memory (`zinc run: baked in memory`, `res.h:5`) and the release embeds them; moving both to the `ui` ZPK group removes this difference as well.

### 5.5 Ordered work items

| # | Size | Item | Removes |
|---|---|---|---|
| 1 | S | Confirm and fix export of release packs: copy `build/assets/<target>/*.zpk` + `.packs` into `dist/...` (`cli_core.cpp:1763`) and into the `.app` Resources; add one T1 test that runs the export without `ZINC_PACKS` | duplicate 11, prerequisite for all |
| 2 | M | `zinc assets report/check/ls` (ZN-437) plus the `--report-assets` columns of 5.3 (location, refs, duplicates, unreferenced), wired into `build`/`pack`/`export` as a warning first | missing check |
| 3 | M | Stop shipping source files that a pack or the baker already carries: exporters copy only loose files that no importer consumed (`assets.dir`, `later.md:76`); `pack` drops `assets/` members that have a pack entry | duplicates 1, 4, 6 |
| 4 | L | Baker output as ZPK groups (`boot`, `ui`): fonts and images read through the mapping with no malloc/memcpy (`resources.cpp:83-95`), executable no longer carries `kResources`; AOT embeds only `boot` | duplicates 1, 2 (87 MB on the museum build) |
| 5 | M | `.zapp`: read members in place (ZN-430 follow-up, `later.md:43`); unpack only native libraries; fused exe maps the pack at its trailer offset | duplicate 3 |
| 6 | S | Content-hashed pack names + `assets.manifest` (name, indexHash, size) signed with the app key; ZPK writer dedups identical entries within a pack | identity, OTA, cache |
| 7 | M | Android: `noCompress` for `.zpk`, `openFd` mapping, drop the copy to app storage (verify on the Nexus 7 rig); iOS: packs in the bundle | duplicate 5 |
| 8 | M | Web: write the group files (`split: group`) with hashed names and a boot manifest, stop copying `assets/` and `app.res` of the same images; Cache Storage by name | duplicate 6 |
| 9 | M | Wire the profile's pack codec into release packs (`later.md:77`) and force `none` for GPU-block textures, Opus and ZBC so they stay mappable | compression vs mmap |
| 10 | L | ESP32 data partition for packs (partition table beyond `SINGLE_APP`, `esp_partition_mmap` reader, `zinc export` writes `packs.bin` and the flash offset); needs a board, goes under "Cross-platform pass" in `later.md` | embed-only default on flash targets |

Order logic: 1 and 2 make the problem visible and safe to fix; 3 and 4 give the large wins on desktop; 5 to 8 finish the other delivery forms; 9 and 10 are tuning and a board-bound item. Items 3 to 8 each ship with the check of item 2 failing before and passing after.

### 5.6 Risks and open questions

- Item 4 changes the pixel path of every demo that draws baked images; the 3-engine comparison (`tools/diff-matrix`) and the proto pixel goldens must stay identical (images are byte copies, so they should).
- Dynamic references (names built at run time, `project.json` lists) defeat dead-asset stripping; the report must mark them, not delete them.
- iOS App Store rule on downloaded code is unrelated to data packs, but a pack that carries ZBC counts as code (OTA report section 4).
- Pack alignment: Android mapping through the APK needs the entry's offset aligned for `mmap` (page offset); set ZPK alignment to 4096 for that target (header field exists, `docs/zpk.md`).
