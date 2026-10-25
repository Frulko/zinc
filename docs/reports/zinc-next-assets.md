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
  and objects kept as JSON text). A rule's `targets` object holds options for one target only, merged over the rule's own when the packs
  of that target are built (`zinc assets build --target psp`, `zinc pack --profile psp`): `{ "match": "city/*.near.glb", "targets": { "psp":
  { "skip": true } } }` leaves the near models out of the PSP's packs, `{ "match": "city/*.png", "targets": { "n3ds": { "maxSize": 128 } } }`
  makes the 3DS's pictures smaller (examples/tokyo). `"skip": true` leaves a file out of the packs. Groups keep the manifest's order: the first that includes an asset and does not exclude it takes it.
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
codec per target), the budgets `zinc assets check` (ZN-437), `splash` the engine splash (ZN-446, below), `loading` the loader stage (ZN-447),
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
| `tilemap` | a Tiled or LDtk map (below): its table `<map>.tilemap`; the tiles it uses are frames of an atlas |
| `texture` | a GPU texture (below): resized for the target, mipmapped, premultiplied, in the format the target's profile prefers (a block format through basisu) |
| `model` | a glTF or GLB model (below) through gltfpack: a quantised GLB compressed with `EXT_meshopt_compression` for three, or a `.zmesh` for zinc:3d; its embedded images become texture entries of their own; `lods` adds simplified copies |

Image header (little-endian, `include/zn/zim.h`): `ZIM1`, u8 format (1 rgba8, 2 rgb565, 3 rgba4444, 4 rgba5551; the texture importer's block
formats 8 bc1, 9 bc3, 10 bc7, 11 etc1, 12 etc2 (RGBA8 EAC), 13 astc (4x4), 14 pvrtc and 15 pvrtca (PVRTC1 4 bpp, RGB and RGBA)), u8 scale,
u16 flags (bit 0: premultiplied, bit 1: every mipmap level down to 1 x 1 follows, bit 2: sRGB colour), u32 width, u32 height; then the levels,
the largest first, each its rows top to bottom (16-bit pixels: red in the high bits, `RRRRRGGGGGGBBBBB`, `RRRRGGGGBBBBAAAA`, `RRRRRGGGGGBBBBBA`;
blocks: their rows of 4 x 4 blocks, PVRTC1 at least 8 x 8 texels a level). zinc:gfx `image(name)`
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

### Tile maps (ZN-443)

A rule `"as": "tilemap"` imports a Tiled map (`.tmj`, its tilesets embedded or external `.tsj`) or an LDtk project (`.ldtk`) into the
entry `<map>.tilemap`, read by the pure-Zinc `zinc:tilemap` (`docs/plugins/tilemap.md`); the tiles it uses become frames of the atlas
`"atlas"` (default `tiles`, packed like the sprites' with the rule's `extrude`, `padding`, `maxSize`, `pot`), so a level draws from atlas
pages. The importer is built in (yyjson, as the sprite sheets), not a Zinc script: see the task notes of ZN-443.

```json
"assets": { "rules": [{ "match": "levels/**/*.{tmj,ldtk}", "as": "tilemap", "atlas": "tiles" }] }
```

- **Tiled**: orthogonal, finite maps; tile layers in any of Tiled's JSON encodings (array, base64 plain, zlib, gzip, zstd: stb_image's
  inflate and the vendored zstd), group layers (offsets, opacity, visibility, parallax and tint applied to their layers), object layers
  (rectangles, ellipses, points, polygons, polylines, text boxes, tile objects) with their properties; a tile stands on its cell's bottom
  left corner plus its tileset's `tileoffset`. Not yet: the XML formats `.tmx`/`.tsx` (no XML parser is vendored; the importer says to save
  as JSON or run `tiled --export-map json`), infinite maps, isometric and hexagonal maps, image layers (skipped), tilesets that are
  collections of images, tile animations and per-tile properties.
- **LDtk**: every level of the project and of its worlds; IntGrid (values and auto-layer tiles), AutoLayer and Tiles layers, Entities
  (records placed by their pivot, fields as properties). A cell with several tiles (stacked auto-layer rules) adds layers of the same name
  in display order. Not yet: levels in separate files (`.ldtkl`), level background images, per-tile alpha.
- **Tiles**: each tile a map uses is cut from its tileset image as a frame named `<image>#x,y,w,h` (`,t` when Tiled's diagonal flip
  transposes its texels, so a cell only mirrors at run time); maps that share a tileset share its frames. A tileset image stays an image
  entry of its own unless a rule says otherwise.
- **Table** (text, tab-separated, escapes `\\`, `\t`, `\n`): `zinc-tilemap 1`; `atlas <name>`; `tile <frame> <dx> <dy>` (tile 1, 2...:
  drawn (dx, dy) from its cell's top left corner); per level `level <name> <x> <y> <w> <h> <background 0xRRGGBB or -1>`, then its layers
  bottom first: `layer <name> <cols> <rows> <cell w> <cell h> <x> <y> <opacity> <visible 0|1> <parallax x> <parallax y> <tint>`, `cells`
  (comma-separated, row by row: tile index times 4, plus 1 mirrored in x, 2 in y; 0 empty), `ints` (IntGrid values), `object <id> <name>
  <type> <shape> <x> <y> <w> <h> <rotation> <tile> <points>`; `prop <name> <type> <value>` after the level, layer or object it belongs to.
- **Cache**: the key of a map covers its bytes and the path and bytes of every file it names (its tiles are named by their image's path).

### Textures (ZN-439)

A rule `"as": "texture"` makes GPU textures, for games and 3D: `zinc:gfx` `image(name)` draws one as it draws any image (the baker leaves
the files texture rules take to the packs, so the name finds the texture), and its levels are there for the 3D renderers.

```json
"assets": { "rules": [{ "match": "textures/**", "as": "texture", "linear": false, "mipmaps": true }] }
```

- **Format.** A release build takes the `texture` list of the target's profile (`zinc assets info`: macos and linux `bc7|bc1|rgba8`, rpi1
  `etc1|rgba4444|rgba5551|rgb565|rgba8`, wasm `ktx2:uastc|rgba8`); a dev build (`zinc run`) makes `rgba8`, so a change shows without an
  encode; a rule's `format` (one name or a list) wins in both. An image with alpha takes the first format of the list that has alpha; an
  opaque one the first, or a later one without alpha that takes fewer bits (`bc7|bc1`: BC7 with alpha, BC1 opaque). Formats: `rgba8`,
  `rgb565`, `rgba4444`, `rgba5551` (made here), `bc1`, `bc3`, `bc7`, `etc1`, `etc2` (RGBA8 EAC; opaque art is ETC1 data, which ETC2 decoders
  read), `astc` (4x4), `pvrtc` (PVRTC1 4 bpp, RGB or RGBA), `ktx2` (`ktx2:uastc` or `ktx2:etc1s`, transcoded in the browser by ZN-449); the
  console layouts `clut4`, `clut8`, `etc1a4` are ZN-452's and are refused with that name.
- **Steps.** Decoded (stb_image, libwebp, the SVG rasterizer), resized to `maxSize` (the aspect kept) and with `pot` to powers of two
  (stretched, not padded: draw it with its size; PVRTC1 is made square), mipmaps down to 1 x 1 (`mipmaps`, true) each from level 0 with
  stb_image_resize2 2.18, alpha-weighted and in linear light for sRGB colour (`linear: true` for data such as normal maps), then alpha
  premultiplied (`premultiply`, true; opaque art is unchanged), then encoded: the 16- and 32-bit layouts here; the block formats by basisu,
  each level encoded to UASTC (the quality hub of basis_universal: it transcodes to every block format) and transcoded with `-export_ktx`,
  one KTX1 file a level read back; `ktx2` is basisu's own file (its mipmaps, from the premultiplied level 0).
- **basisu** 2.50 is a pinned tool (`src/tc`, `zinc toolchain basisu`): the project publishes no binaries, so its source archive (SHA-256
  checked before it is unpacked) is built once with the pinned zig, without SSE, OpenCL or astcenc, into `~/.zinc/toolchains/basisu-<host>-2.50`;
  `ZINC_BASISU` names another. A build fetches it only when a texture needs a block format. It runs with 4 threads, a fixed count: UASTC and
  ETC1S gave the same bytes with 1, 4 and 8 threads, and `tests/t1/texture.sh` builds a project twice with two caches and compares the packs.
- **At run time** (`src/host/sys_host.cpp`): a block format is decoded on the CPU (bcdec: BC1, BC3, BC7; etcdec: ETC1, ETC2) for the
  software raster, and its level 0 is kept beside the texels: the GL renderers (display-gl and the macOS window, `runtime/gl_replay.cpp`) upload
  the blocks with `glCompressedTexImage2D` when the driver lists the format (`GL_COMPRESSED_TEXTURE_FORMATS`, and on GLES
  `GL_OES_compressed_ETC1_RGB8_texture`; ETC1 goes up as ETC2 RGB8 where only ETC2 is there), else the decoded texels; premultiplied texels are
  divided back in the shader, so a texture draws as the RGBA path within the codec's error. ASTC and PVRTC1 have no CPU decoder here: only a GPU
  that takes them draws them (the software raster leaves them transparent, with one warning). `ZINC_GL_STATS=1` prints the driver's formats and
  how many textures went up as blocks. macOS's GL 4.1 (Intel) lists DXT1, DXT3 and DXT5 only: BC1 and BC3 go up as blocks, BC7 and ETC are decoded.
- **WebGL** (`src/gl`): `WEBGL_compressed_texture_etc1`, `_etc`, `_astc` (with `getSupportedProfiles()`) and `_pvrtc` join S3TC and RGTC,
  offered where the driver has them (ETC1 and ETC through GLES 3 or GL 4.3 too); none of them on this Mac's GL 4.1.

### Models (ZN-441)

A rule `"as": "model"` runs glTF 2.0 files (`.glb`, or `.gltf` with its buffers) through gltfpack, for three (`GLTFLoader`) or for zinc:3d
(`loadModel`). Design: section 4.6 of `docs/reports/games/toolchain-assets-loading.md`.

```json
"assets": { "rules": [{ "match": "models/*.glb", "as": "model" }, { "match": "props/*.glb", "as": "model", "format": "zmesh", "lods": "0.5,0.25" }] }
```

- **gltfpack** 1.3 is a pinned tool (`src/tc`, `zinc toolchain gltfpack`): built once with the pinned zig from the meshoptimizer 1.3 archive
  whose library `third_party/meshoptimizer` vendors (the same SHA-256), without Basis or WebP, into `~/.zinc/toolchains/gltfpack-<host>-1.3`
  (0.6 MB of sources, 46 s on the Intel Mac); `ZINC_GLTFPACK` names another. It is single-threaded and writes the same bytes for the same input.
- **Textures.** Before gltfpack runs, every image embedded in the model (a GLB buffer view, a `data:` URI) goes through the texture importer
  (`texture.*` options: `texture.format` follows the target's profile as a texture rule's `format` does, so `rgba8` in dev and BC1/BC7, ETC1
  or KTX2 in release; normal, occlusion and metal-roughness maps are made `linear`) and becomes an image entry beside the model,
  `<model file>.<n>.<png|jpg|webp>`, which the model names by URI (gltfpack keeps URIs, `-tr`): `zinc:gfx` `image(name)` and the loaders
  find it in the packs. An image the model names as a file of its own stays a reference to that asset, imported by its own rule.
- **`format: "glb"`** (the default), for three: `gltfpack -cc -kn`: positions, normals and uvs quantised (`KHR_mesh_quantization`, 14, 8 and 12
  bits; the dequantisation in the nodes and in a `KHR_texture_transform`), vertex cache and fetch order optimised, buffer views compressed
  with `EXT_meshopt_compression`; named nodes keep their place (`keepNodes`, true). The entry keeps the source's name, so a program loads it
  unchanged. `compress: false` keeps the quantisation without the compression; `gltfpack` adds arguments of its own (`"-vp 16"`).
- **`format: "zmesh"`**, for zinc:3d: `gltfpack -noq` (float attributes, optimised and merged), then the default scene read with cgltf and
  flattened (world transforms applied; mirrored nodes turn their triangles over; `KHR_texture_transform` applied to the uvs), its triangles
  grouped by material into parts of at most 65535 vertices. ZMS1 (`include/zn/zmesh.h`): a 16-byte header, the texture names, then each part:
  a 24-byte header (vertices, indices, flags, colour 0xAARRGGBB, texture) and the arrays zinc:3d keeps (f32 positions, f32 normals, f32 uvs,
  u32 colours, u16 indices), so `loadModel` hands them to the renderer as they are. The entry is the source's name with `.zmesh`.
- **`simplify`** (a ratio of the triangles, `meshopt_simplify` through `-si`) and **`lods`** (ratios: an entry `<stem>.lod<n>.<glb|zmesh>`
  each, from the same textures).
- **At run time**: the three plugin decodes `EXT_meshopt_compression` and `KHR_meshopt_compression` views once per document with the meshopt
  decoder of `third_party/meshoptimizer` (`vertexcodec.cpp`, `indexcodec.cpp`, `vertexfilter.cpp`, compiled into the plugin: plugins may include
  the engine's vendored libraries by directory), after checking the sizes the decoder only asserts; zinc:3d's `loadGltf` reads them through
  the same reader.
- The artifact is a bundle (`ZAB1`, `src/assets/model.h`): a directory of entries (name, kind, size) then their bytes; the pack takes each
  entry, and the report's row (`format` glb or zmesh) adds up their pack bytes and the GPU bytes of the textures, read from the directory.

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
importer never meets a stale artifact. Paths are not part of a key, so the same file under two names or in two checkouts is imported once;
a file that names others (a sprite sheet, a tile map) has its own path and theirs in its key, as they are found from its place.

A pack is rewritten only when its key (the profile, each entry's name, key and kind) differs from the one `build/assets/<target>/.packs` recorded,
so an unchanged project rewrites nothing. The writer is deterministic (`docs/zpk.md`): the same project gives the same packs in any directory
and with any `ZINC_HOME` (`tests/t0/assets.sh`).

## Profiles

`dev` (the default) stores entries as they are; `release` compresses them with the target's `pack` codec (lz4 on the Pi profiles, none for
the browser, zstd level 19 elsewhere and by default) and makes textures in its `texture` formats, within its `maxSize` and `pot`. The profiles
of `zinc.json` and `targets/capabilities.json` (above) are shown by `zinc assets info`; the audio codecs come with their importers.

## The report

`build/assets/<target>/report.json`: the target and profile; one row per asset (name, importer, group, `sourceBytes`, `outputBytes`, `ms`,
`cached`, `packBytes`: what its entry takes in its pack; for an image, `format` and `gpuBytes`: what its levels take on the GPU, a KTX2 file
counted as transcoded to 16-byte blocks, 8 for opaque ETC1S); one row per pack (file, group, entries, bytes); totals (assets, imported, bytes,
`gpuBytes`, `ms`). `zinc assets build` prints one line with the
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

### Hot reload in `zinc dev` (ZN-450)

A save that changes files under the assets directory alone, in a project that packs them (`assets.rules` or `assets.groups`), does not
restart the program. `zinc dev` builds the dev packs again (the cache imports only the changed files: an atlas is packed again, its other
images come from the cache), compares each entry with the bytes it had, and writes those that differ on the running version's dev socket
(a socket pair; the program's end is `ZINC_DEV_FD`): `asset <kind> <size> <name>\n` and the bytes, each, then `end\n`. At `end` the
program (`src/host/assets_host.cpp`) puts them in front of the packs: a resident entry takes the new bytes in place (its handles read
them), a zinc:gfx image made from an image entry (an atlas page) takes the new pixels under the same id, and each name becomes a host
event that runs the callbacks of `assets.onReload(name, cb)`; `zinc:sprite` re-reads its table there and moves the frames it handed out.
A code change, a change outside the assets directory, a project that does not pack its assets, or a program that does not read its
socket (2 s) restarts the program as before; an asset that fails to import leaves the old one on screen with the error printed.

```
zinc dev: sprites.atlas.0, sprites.atlas rebuilt and sent (41 ms after the save)
zinc dev: sprites.atlas.0, sprites.atlas swapped in
```

Measured on game-2d (`tests/t1/asset_reload.sh`, headless, load 3.3): the new sprite reaches the program 40 ms after the save (the poll,
30 ms for the editor to finish writing, the import and the pack); the test sees it swapped in 110 to 170 ms after its write.

## The engine splash (ZN-446)

`zinc.json` `splash` (`targets.<id>.splash` replaces it on that target; design: 7.2 and 7.3 of the report) is the first frame of the window,
shown before anything else of the engine runs: the compile, the bake of the fonts and images, the native plugins, the packs, the program.

```json
"splash": { "image": "assets/splash.png", "background": "#101418", "fit": "contain", "minMs": 0, "fadeMs": 150 }
```

- **The entry.** The asset build writes it as `.splash` of `boot.zpk` (a hidden name: no asset has it; a pack of its own when no group is
  named boot, and even without an assets directory), stored uncompressed in dev and release packs so the host maps it in place. Its bytes,
  ZSP1 (little-endian): `ZSP1`, u32 background `0xAARRGGBB` (opaque black when only an image is given), u8 fit (0 contain, 1 cover, 2
  center: the image at its own size), three zero bytes, u32 `minMs`, u32 `fadeMs` (20 bytes); then the image as the image importer writes it
  (ZIM1 rgba8, premultiplied; an SVG drawn at 8 pixels a unit, 1024 wide at most), absent for a background alone. Made through the asset cache.
- **Who shows it** (`zn::host::showSplash`, `src/host/splash.cpp`): the `main` of a built program first thing, from the `.splash` of the
  base packs' `boot.zpk`; `zinc run` of a .zapp or a fused app before it loads the program, from the packs it carries; `zinc run` of sources
  (and `--engine quickjs`) before the compile when it runs the program itself (interpreted), from `ZINC_SPLASH`, a file of the entry it makes
  from zinc.json. A compiled run (the default for a program that draws) leaves it to the executable it starts, which shows it as it starts:
  shown by zinc too, the window would close at the exec and come back with the executable's. Nothing in a headless or deterministic run, with
  a display plugin, or without a splash.
- **The frame.** The window opens as the program's first graphics call would open it (size, zoom and window keys of zinc.json), and the
  splash is composed for its surface, the image scaled bilinearly into the fitted rectangle over the background, then presented through the
  window HAL's own present (rows, no command lists, so the GL replay is set up later, by the program's first frame). The window HAL creates
  every main window hidden and shows it after its first present, then presents that frame again: a window never appears blank (a fullscreen
  window is shown at once). `minMs` holds the splash: the next present waits until then. `fadeMs` is carried for the loader stage (ZN-447).
- **The browser.** `zinc export --target wasm` puts the splash in `index.html` as the canvas's CSS background (the colour, the image inline as
  a data URL, the fit as `contain`, `cover` or `auto`): painted with the page, before any script runs; the worker's first opaque frame covers it.
- **Measuring.** `ZINC_LOG=run=info` prints `splash on screen at <wall clock>, after start N ms`; `tools/splash-time` starts a project's
  `zinc run` and its built executable N times and prints the time from the exec to that line (median, min, max), with the load average.

Measured (macOS x86_64, i7-9750H, a 640x400 window at 2x, 2026-10-11, load 4.4: other agents building; `tools/splash-time --runs 11`): exec to
splash 407 ms for `zinc run` (390 to 440) and 425 ms for the built executable (405 to 456). Nearly all of it is the window: SDL's video init
about 200 ms and the GL window and context about 110 ms (`ZINC_LOG=run=debug`: "splash: window open" 277 to 314 ms), then 55 ms to present
(the first present into the hidden window 35 ms with the GL warm-up, the show 5 ms, the second present one vsync, 16 ms); zinc itself reaches
the splash 13 to 20 ms after its start. The first launch of a newly built binary adds about 800 ms before `main` (the system checks it).

## The loader stage (ZN-447)

`zinc.json` `loading` (design: 7.5 of the report; the keys and the screens: `docs/plugins/loader.md`) runs a screen every frame while asset
groups load, before the program's own modules start.

- **A generated module.** `zn::cli::loaderStageFor` (`src/cli_core.cpp`: the frontend names no plugin) writes the stage as Zinc source when
  the file compiled is the project's entry, and `zn::frontend::setLoaderStage` hands it to the compile: the loop, the screen's import (`zinc:loader` `bar` or `splash`, or the project's module) and one call with the groups,
  `minMs` and `fadeMs`. Its path is `zinc.json.loading.ts` in the project's directory (no such file: diagnostics name it, a screen module
  resolves against the project). `loadProgram` initialises it before every module of the entry, as if the entry began with an import of it;
  the QuickJS engine evaluates it as a module before the entry. Tests and other files of the project compile without it. A built program
  carries it like any module, so the interpreter, a built executable and QuickJS run the same frames.
- **The loop** uses the asset scheduler's host calls and zinc:gfx only: it requests the groups (none resident: no loader), turns once (a real
  run waits up to 16 ms for the first jobs on the loop, so a load done within a frame shows nothing), then each frame polls, turns, gives the
  screen the bytes done over the bytes of every group, and stops once all are resident and `minMs` has passed, or when the run's frames are
  spent (`ZINC_FRAMES` counts the stage's: the host's frame count is now the frames left). Closing the window ends the program.
- **The fade.** With `fadeMs`, the last frame is also drawn into an image (logical pixels) that zinc:gfx `overlay` draws over the program's
  frames with a falling opacity; while an overlay draws, zinc:ui paints its frame instead of keeping the last one (`overlaid()`).
- **The splash screen** draws `image('.splash')`: the image of the splash entry (ZN-446), placed as `src/host/splash.cpp` places it, so the
  engine splash hands over with no visible change.

## Measured (macOS x86_64, i7-9750H, 2026-10-11, load 2.5 to 3.3: another agent building)

| Case | Time |
|---|---:|
| game-2d (two SVGs and a WAV), first `zinc assets build` | 13.5 ms |
| game-2d, a second build (no importer runs), the whole command, median of 21 | 9.5 ms (1 ms inside the build) |
| game-2d, first release build (zstd packs) | 20.5 ms |
| game-2d plus 100 MB of data, first build | 1.45 s |
| the same, a second build (each source read and hashed, no artifact read, no pack written) | 117 ms |
| `zinc bake` of game-2d (compile included), the bake from the cache / baked (`ZINC_NO_CACHE=1`) | 50.5 / 76.3 ms |

### Textures, 2048 x 2048 with mipmaps (ZN-439, `TEXTURE_SIZE=2048 tests/t1/texture.sh`, 2026-10-11, load 6 to 8: other sessions building)

The two textures of `tests/data/texture` (tiles of gradients with fine stripes; one with a soft transparent edge), a release build per
profile. Pack: the entry in its pack (the profile's codec); GPU: every level as uploaded; time: the import, basisu with 4 threads included
(each profile encodes again: the UASTC step is not shared yet). rgba8 for comparison: 22,369,620 bytes on the GPU.

| Target (profile) | Texture | Format | Pack bytes | GPU bytes | Import ms |
|---|---|---|---:|---:|---:|
| macos | alpha | bc7 | 1,258,382 | 5,592,432 | 12,156 |
| macos | opaque | bc1 | 586,403 | 2,796,216 | 17,535 |
| rpi1 (lz4) | alpha | rgba4444 | 1,445,085 | 11,184,810 | 844 |
| rpi1 (lz4) | opaque | etc1 | 1,211,201 | 2,796,216 | 19,268 |
| wasm (no codec) | alpha | ktx2:uastc | 1,861,396 | 5,592,432 (as BC7/ASTC) | 15,104 |
| wasm (no codec) | opaque | ktx2:uastc | 1,592,918 | 5,592,432 (as BC7/ASTC) | 18,923 |
| pi4 profile (etc2) | alpha | etc2 | 983,643 | 5,592,432 | 14,826 |
| pi4 profile (etc2) | opaque | etc1 | 616,752 | 2,796,216 | 18,677 |
| apple profile (astc) | alpha | astc | 1,245,185 | 5,592,432 | 12,091 |
| apple profile (astc) | opaque | astc | 649,814 | 5,592,432 | 16,769 |
| iphone4s profile (pvrtc, lz4) | alpha | pvrtca | 1,173,394 | 2,796,288 | 12,876 |
| iphone4s profile (pvrtc, lz4) | opaque | pvrtc | 1,573,910 | 2,796,288 | 15,708 |

Against the rgba8 frame (glcompare: pixels more than 24 apart, mean error): the software raster draws the macos packs at 0.000% / 0.56,
the rpi1 packs at 0.065% / 1.70, the etc2 packs at 0.120% / 0.77; display-gl on this Mac's GL 4.1 draws the macos packs (BC1 uploaded as
blocks, 2,097,152 bytes; BC7 decoded) at 0.000% / 0.58 and the rpi1 packs (ETC1 decoded: the driver has no ETC) at 0.043% / 1.81. basisu
2.50 alone on one 2048 x 2048 level, UASTC: 37 s with one thread, 11 s with four, the same bytes; built once in 353 s (zig, 6 jobs, the
machine at load 7).

### Models: CesiumMilkTruck.glb (ZN-441, `tests/t1/model.sh` and a release build by hand, 2026-10-11, load 4.4 to 5.5: other sessions building)

The gltf-viewer's truck: 369,980 bytes, of which 151,001 of geometry and JSON and a 2048 x 2048 JPEG of 218,979.

| Entry | Dev pack (stored as is) | Release pack, macos (zstd) | GPU bytes (dev / release) |
|---|---:|---:|---:|
| `CesiumMilkTruck.glb` (gltfpack `-cc -kn`) | 30,560 | 20,396 | |
| `CesiumMilkTruck.glb.0.jpg` (the texture importer) | 22,369,636 (rgba8, mipmaps) | 293,945 (bc1, mipmaps) | 22,369,620 / 2,796,216 |
| `zm/truck.zmesh` (3 parts, 3,624 triangles) | 131,676 | 49,007 | |
| `zm/truck.lod1.zmesh` (`lods` 0.5: 1,946 triangles) | 79,704 | 29,435 | |

The geometry goes from 151,001 bytes to 30,560 (20,396 in a release pack); the whole truck for three, 369,980 bytes as a GLB, takes
314,341 bytes of a release pack and 2.8 MB of GPU memory instead of 22.4 MB. The import: 0.6 s in dev, 6.7 s in release (basisu's BC1 of the
2048 texture). three reads the packed truck as cgltf reads the original (5 meshes, 2,856 triangles, the same bounding box to 1/1000; 3,564
vertices after gltfpack's welding against 4,823); the viewer's frame 30 from the packs is 0.033% of pixels more than 24 apart (mae 0.044) from
the frame from the files. zinc:3d draws the .zmesh 0.021% / 0.082 from loadGltf's frame in software, 0.083% / 0.104 on the GPU.

Loads in zinc:3d (interpreter, `performance.now()`, not deterministic): `loadModel` of the .zmesh 244 to 263 ms the first time (its 22 MB
rgba8 dev texture read and made an image), 8.6 to 8.8 ms again with the texture made, of which `readBytes` of the 131,676 bytes takes 5.6 to
5.9 ms (one host call a byte); `loadGltf` of the GLB 102 to 110 ms, 62 to 64 ms again (the JPEG decoded each time; `readBytes` of its 369,980
bytes 16.6 to 17 ms). gltfpack 1.3 built once in 46 s.
