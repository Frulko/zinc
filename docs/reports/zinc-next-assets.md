# Zinc Next: the asset build

`src/assets` (ZN-434) turns a project's `assets/` directory into ZPK packs (`docs/zpk.md`) and a report, through importers whose results are
kept in a cache shared by every project. The design is section 4 of `docs/reports/games/toolchain-assets-loading.md`; the run-time side
(mounting the packs, `zinc:assets` v2, ZN-436) is the section "At run time" below.

```sh
zinc assets build [dir] [--target T] [--release]   # build/assets/<target>/<group>.zpk and report.json (T: this machine by default)
zinc assets info [dir] [--target T]                # the asset profile and budgets in force on each target
```

`zinc pack` and `zinc build` run it for their machine or `--target`, `zinc export` with the release profile for its target. A project without
an assets directory (`assets/`, or `zinc.json` `assets.dir`) has nothing to build.

## zinc.json

The keys (ZN-435, `src/frontend/project.cpp`, design: section 10 of `docs/reports/games/toolchain-assets-loading.md`) are all optional; a
project without them builds the same packs as before. A malformed key stops `zinc run`, `build`, `pack`, `export` and `zinc assets` with its
line; an unknown key inside them is a warning.

```json
"assets": {
  "dir": "assets",
  "rules": [{ "match": "sprites/**/*.png", "as": "image", "format": "rgba4444" }],
  "groups": { "boot": { "include": ["fonts/**", "ui/**"], "exclude": ["ui/big/**"], "priority": 1 } },
  "profiles": { "pi": { "texture": "etc1|rgba4444", "maxSize": 1024, "pot": false, "audio": "vorbis:q2", "sfx": "adpcm", "pack": "lz4", "split": "none" } },
  "budgets": { "rpi1": { "download": "48MB", "boot": "4MB", "gpu": "40MB", "ram": "150MB", "flash": "2MB" } }
},
"splash": { "image": "assets/splash.png", "background": "#101418", "fit": "contain", "minMs": 0, "fadeMs": 150 },
"loading": { "screen": "default", "groups": ["boot"], "minMs": 300, "fadeMs": 150 },
"launcher": { "entry": "src/launcher.tsx", "skippable": true, "targets": ["macos", "linux"] },
"targets": { "rpi1": { "assets": { "profile": "pi", "maxSize": 512 }, "splash": "assets/splash-pi.png" } }
```

- `assets` may be a string, the directory (the prototype's form). A rule's keys other than `match` and `as` are the importer's options (arrays
  and objects kept as JSON text). Groups keep the manifest's order: the first that includes an asset and does not exclude it takes it.
- A profile names texture formats in preference order (`|`: the fallback; rgba8, rgb565, rgba4444, rgba5551, bc1, bc3, bc7, etc1, etc1a4,
  etc2, astc, pvrtc, clut4, clut8, ktx2), the music (`audio`) and effect (`sfx`) codecs (pcm, opus, vorbis, mp3, aac, qoa, adpcm, vag,
  dsp-adpcm, atrac3), a setting after `:` (`opus:96`, `ktx2:uastc`); `maxSize` 1 to 16384; `pack` none, lz4, zstd or zstd-dict; `split` none
  or group. Budgets are bytes or sizes with B, KB, MB, GB (1024-based).
- `loading.groups` must name groups of `assets.groups` (or `default`); `targets.<id>.assets.profile` a profile of `assets.profiles`.
- The profile in force on a target (`zinc assets info`): the target's default, the `assets` entry of `targets/capabilities.json` (formats its
  GPU takes, max texture size, POT, the audio codecs it decodes cheaply, the pack codec, budgets; section 3 and 6.6 of the design, starting
  values until measured on each device), then the profile `targets.<id>.assets` names, then that object's own keys; budgets: the default's,
  then `assets.budgets.<id>`, key by key.

The build uses `dir`, `rules` and `groups` now; the profiles drive the encoders when they come (ZN-439 textures, the audio importers, the pack
codec per target), the budgets `zinc assets check` (ZN-437), `splash` the engine splash (ZN-446), `loading` the loader stage (ZN-447),
`launcher` the pre-launcher (ZN-448).

## Importers, rules, groups

Every file under `assets/` (hidden files and directories excepted) goes to one importer. The built-in rules send PNG, JPEG, WebP and SVG to
`image` and everything else to `copy`; the project's rules (`zinc.json` `assets.rules`) come after them, and every rule that
matches a path applies in order, a later one overriding an earlier one's options. Globs: `*` and `?` within a name, `**` across directories,
`{a,b}` alternatives.

| Importer | Output |
|---|---|
| `copy` | the bytes as they are |
| `image` | decoded (stb_image, libwebp, the baker's SVG rasterizer), alpha premultiplied, in `format` `rgba8` (default), `rgb565` or `rgba4444`, after the 16-byte header below; an SVG is drawn at `scale` pixels per unit (2 by default, at most 1024 pixels wide), a raster image keeps its pixels and takes its scale from an `@2x` name |
| `sprite` | a frame of an atlas (below): no entry of its own; the atlas becomes `<atlas>.atlas` (its table) and `<atlas>.atlas.<n>` (its pages) |

Image header (little-endian): `ZIM1`, u8 format (1 rgba8, 2 rgb565, 3 rgba4444), u8 scale, u16 flags (bit 0: premultiplied), u32 width,
u32 height; then the rows top to bottom (16-bit pixels: red in the high bits, `RRRRRGGGGGGBBBBB` and `RRRRGGGGBBBBAAAA`). zinc:gfx `image(name)`
finds an image entry of the mounted packs when the baker did not embed that name: a runtime image with straight alpha (premultiplied texels
are divided back), made once per name.

### Sprites and atlases (ZN-438)

A rule `"as": "sprite"` makes its files frames of an atlas, `"atlas": "<name>"` (default `sprites`), drawn with `zinc:sprite`
(`docs/plugins/sprite.md`). `zinc run` builds the packs of a project that has rules or groups, so an atlas is there from the first run.

```json
"assets": { "rules": [{ "match": "sprites/**", "as": "sprite", "atlas": "sprites", "extrude": 1, "padding": 1, "maxSize": 2048, "pot": false }] }
```

- **Sources.** A PNG, JPEG, WebP or SVG file is one frame named by its path (`hero@2x.png` is `hero.png` at 2 texels a point; an SVG is
  drawn at 2, as the baker draws it; of two frames of one name the one with more texels a point wins). An Aseprite file (cute_aseprite)
  gives `file.aseprite#0`, `#1`... with their durations, the animation `file.aseprite` (every frame) and one per tag, `file.aseprite#tag`
  (forward, reverse, pingpong). A TexturePacker "JSON hash" or "JSON array" sheet, or Aseprite's `--data` export, gives its frames by their
  names, cut out of the image `meta.image` names (turned back when packed rotated, put back in their untrimmed size), its `pivot`s and
  `duration`s, and its animations (`meta.frameTags`, TexturePacker's `animations`); that image, when a sprite rule takes it too, is not a
  frame. Loose files whose names end in a number (`walk_1.png`, `walk_2.png`) are an animation, `walk`, of `fps` (10) frames a second.
- **Trim.** Each frame keeps what is not transparent and one transparent texel around it where its source has one (`"trim": false`: the
  whole image). With linear filtering at a fractional position an edge texel then blends with a transparent neighbour exactly as in the
  whole image, and the frame's rectangle covers every pixel the whole image would touch.
- **Pages.** stb_rect_pack (stable sort: the same pages with every C library) places every frame extruded by `extrude` points (its edge
  texels repeated outwards: what linear filtering reads beyond its rectangle is what the whole image clamps to) and `padding` texels apart;
  a page is the smallest power-of-two square that takes the frames left, cut to what it holds (`pot`: each side a power of two), at most
  `maxSize` texels a side; the frames that do not fit go to the next page, and a frame larger than a page is an error. Pages are `rgba8`
  with straight alpha, the texels the rasterizer samples, so a frame drawn at its size is the loose image's pixels.
- **Table** (`<atlas>.atlas`, text, tab-separated): `zinc-atlas 1`; `page <entry> <w> <h>`; per frame, by name, `frame <name> <page> <x> <y>
  <w> <h> <ox> <oy> <source w> <source h> <scale> <pivot x> <pivot y> <ms>` (texels; the pivot 0..1 of the source); `anim <name> <mode>
  <frame index>...`.
- **Cache.** The frames of one file are its artifact (trimmed, named relative to the file: a key covers bytes, not paths); an atlas is
  assembled from them when its pack is written. The frames of one atlas must be in one group and share its packing options.

The font baker (`src/res`, `zinc-next-resources.md`) is the third built-in importer: its inputs are the program's sources, so the program
build calls it (`bakeResources`: `zinc run`, `pack`, `build`, `export`, `bake`) through the same cache; its blob is not a pack entry yet.

Each group (`zinc.json` `assets.groups`) becomes `<group>.zpk`; an asset no group takes goes to `default.zpk`. The entries keep their
path as name and their importer's kind (0 data, 1 image, 2 fonts). Packs of groups that are gone are removed.

## The cache

An importer is a pure function of (its id and version, the engine's build, its options, the source bytes); the key of an artifact is the
XXH3-128 of those parts, each hashed on its own (xxHash 0.8.4, `third_party/xxhash`). Artifacts live in `~/.zinc/cache/assets/<2 hex>/<key>`
(`ZINC_HOME`), written aside and renamed, shared by every project and every directory; a hit touches the file, and a build that stored something
trims the cache to its budget (2 GiB, `ZINC_ASSET_CACHE_MB`), least recently used first. `ZINC_NO_CACHE=1` imports everything.

The engine's build is its executable's time and size, as for the program caches of `zinc run`: a new engine imports again, so a change to an
importer never meets a stale artifact. Paths are not part of a key, so the same file under two names or in two checkouts is imported once.

A pack is rewritten only when its key (the profile, each entry's name, key and kind) differs from the one `build/assets/<target>/.packs` recorded,
so an unchanged project rewrites nothing. The writer is deterministic (`docs/zpk.md`): the same project gives the same packs in any directory
and with any `ZINC_HOME` (`tests/t0/assets.sh`).

## Profiles

`dev` (the default) stores entries as they are; `release` compresses them with zstd (level 19). The encoder profiles of `zinc.json` and
`targets/capabilities.json` (above) are parsed and shown by `zinc assets info`; texture encoders and audio codecs come with ZN-439.

## The report

`build/assets/<target>/report.json`: the target and profile; one row per asset (name, importer, group, `sourceBytes`, `outputBytes`, `ms`,
`cached`); one row per pack (file, group, entries, bytes); totals (assets, imported, bytes, `ms`). `zinc assets build` prints one line with the
same totals.

## At run time: `zinc:assets` v2

`src/host/assets_host.cpp` (ZN-436, design: sections 6.3 to 6.6 of the report) mounts the packs and loads them by group; the API is in
`lib/modules.d.ts`.

```ts
import * as assets from 'zinc:assets';
await assets.loadGroup('level1', (p) => bar(p.done / p.total));   // bytes of the TOC sizes, monotone, the last call at done === total
const map = assets.get('level1/map.bin');   // a handle; throws when its group is not loaded
assets.prefetch('level2');                  // background priority; a loadGroup of the same group raises it
assets.unloadGroup('level1');               // frees what no handle holds; map keeps its bytes until map.release()
assets.mount('mods');                       // a .zpk or a directory of them, in front of the base packs
assets.stats();                             // resident bytes, peak, the ram budget, groups loaded, packs mounted, jobs pending
```

- **Mounts.** The packs are mapped (`mmap`) and searched in order: the program's mounts first (the last one first), then the base packs.
  A group is every mounted `<group>.zpk`; each of its entries is read from the first pack that has the name, so a mod's `level1.zpk`
  replaces some entries of the base one and leaves the others. The base packs: `ZINC_PACKS` (paths separated by `:`; empty: none), else
  `assets/<target>/` beside a built program (where `zinc build` writes them: `<project>/build/assets/<target>`, a directory the assets
  lookup no longer takes for the program's `assets/`). `zinc run` sets `ZINC_PACKS` to the project's dev packs, built at launch, when
  `zinc.json` has `assets.groups` or `assets.rules` (a project without either runs as before, from its directory); a `.zapp` of such a project carries
  them as `packs/<group>.zpk`.
- **The v1 calls** (`readText`, `readBytes`, `exists`, `list`) read the data entries of the mounted packs first, then the directory. An
  entry an importer changed (an image is ZIM1, not the PNG) is not the file's bytes: the v1 calls skip it and read the directory.
- **Loading.** A group's entries become jobs in one of two queues (group, background); four at a time go to the libuv thread pool, each
  job with a zstd context taken from the manager's free list. A turn of the loader runs on a timer of the program's loop (once per frame
  in a frame loop, every millisecond otherwise; promises settle there, never in a frame callback): it makes resident, in the order the
  jobs were queued, what the workers finished, up to 4 MB a turn (`ZINC_ASSET_TURN`; one entry at least). A deterministic run waits for
  those jobs, so its frames are the same on every run; with one core (or `ZINC_ASSET_THREADS=0`) the turn decodes them itself.
- **Budget.** The ram budget in force on the machine (`assets.budgets.<target>.ram` of zinc.json, else the target's default of
  `targets/capabilities.json`; `zinc run` and the `main` of a built program set `ZINC_ASSET_RAM`) bounds the resident bytes plus those
  being loaded: `loadGroup` is rejected first, `assets: group 'big' needs 300000 bytes: over the ram budget of 262144 bytes (155554 in use)`.
- **Memory.** Resident entries are the manager's, outside the program's objects; `zinc mem` prints them (`assets: peak N bytes resident,
  M at exit`). Unloading a group frees its entries at once, or with the last handle that holds one.

Measured (same machine, load 5.3 to 5.6: another agent building): a group of 64 text entries of 512 KB (32 MB, a 12 MB release pack,
zstd 19), `loadGroup` to its promise, median of 7 real runs: 62 ms on the libuv pool, 214 ms decoded on the main thread.

## Measured (macOS x86_64, i7-9750H, 2026-10-11, load 2.5 to 3.3: another agent building)

| Case | Time |
|---|---:|
| game-2d (two SVGs and a WAV), first `zinc assets build` | 13.5 ms |
| game-2d, a second build (no importer runs), the whole command, median of 21 | 9.5 ms (1 ms inside the build) |
| game-2d, first release build (zstd packs) | 20.5 ms |
| game-2d plus 100 MB of data, first build | 1.45 s |
| the same, a second build (each source read and hashed, no artifact read, no pack written) | 117 ms |
| `zinc bake` of game-2d (compile included), the bake from the cache / baked (`ZINC_NO_CACHE=1`) | 50.5 / 76.3 ms |
