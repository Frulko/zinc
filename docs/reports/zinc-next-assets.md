# Zinc Next: the asset build

`src/assets` (ZN-434) turns a project's `assets/` directory into ZPK packs (`docs/zpk.md`) and a report, through importers whose results are
kept in a cache shared by every project. The design is section 4 of `docs/reports/games/toolchain-assets-loading.md`; the run-time side
(mounting the packs, `zinc:assets` v2) is ZN-436.

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

Image header (little-endian): `ZIM1`, u8 format (1 rgba8, 2 rgb565, 3 rgba4444), u8 scale, u16 flags (bit 0: premultiplied), u32 width,
u32 height; then the rows top to bottom (16-bit pixels: red in the high bits, `RRRRRGGGGGGBBBBB` and `RRRRGGGGBBBBAAAA`).

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

## Measured (macOS x86_64, i7-9750H, 2026-10-11, load 2.5 to 3.3: another agent building)

| Case | Time |
|---|---:|
| game-2d (two SVGs and a WAV), first `zinc assets build` | 13.5 ms |
| game-2d, a second build (no importer runs), the whole command, median of 21 | 9.5 ms (1 ms inside the build) |
| game-2d, first release build (zstd packs) | 20.5 ms |
| game-2d plus 100 MB of data, first build | 1.45 s |
| the same, a second build (each source read and hashed, no artifact read, no pack written) | 117 ms |
| `zinc bake` of game-2d (compile included), the bake from the cache / baked (`ZINC_NO_CACHE=1`) | 50.5 / 76.3 ms |
