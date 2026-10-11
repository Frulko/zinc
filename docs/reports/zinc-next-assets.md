# Zinc Next: the asset build

`src/assets` (ZN-434) turns a project's `assets/` directory into ZPK packs (`docs/zpk.md`) and a report, through importers whose results are
kept in a cache shared by every project. The design is section 4 of `docs/reports/games/toolchain-assets-loading.md`; the run-time side
(mounting the packs, `zinc:assets` v2) is ZN-436.

```sh
zinc assets build [dir] [--target T] [--release]   # build/assets/<target>/<group>.zpk and report.json (T: this machine by default)
```

`zinc pack` and `zinc build` run it for their machine or `--target`, `zinc export` with the release profile for its target. A project without
an `assets` directory has nothing to build.

## Importers, rules, groups

Every file under `assets/` (hidden files and directories excepted) goes to one importer. The built-in rules send PNG, JPEG, WebP and SVG to
`image` and everything else to `copy`; the project's rules (`zinc.json` `assets.rules`, parsed from ZN-435) come after them, and every rule that
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

Each group (`zinc.json` `assets.groups`, ZN-435) becomes `<group>.zpk`; an asset no group includes goes to `default.zpk`. The entries keep their
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

`dev` (the default) stores entries as they are; `release` compresses them with zstd (level 19). Texture encoders, audio codecs and the profiles
of `zinc.json` (`assets.profiles`, per-target defaults in `targets/capabilities.json`) come with ZN-435 and ZN-439.

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
