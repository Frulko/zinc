# ZPK: packs of game data

A `.zpk` holds the data of a game or an app: textures, sounds, meshes, levels, bytecode. It is read **in place**: the engine maps the
file (or the member of a `.zapp`, which a ustar archive stores on a 512-byte boundary), finds an entry with a binary search in the
mapped index and decodes only what it reads. Opening a pack reads its index, never its data; an entry is checked against its SHA-256
when it is first read. The design and the measurements behind it are in `docs/reports/games/toolchain-assets-loading.md`, section 6.1.

The module is `next/src/zpk` (`zpk.h`): `zn::zpk::write` makes a pack, `zn::zpk::Reader` reads one. The asset build (`zinc assets
build`, ZN-434) writes packs and the asset manager (`zinc:assets` v2, ZN-436) mounts them; this page is the format they share.

## Layout

All integers are little-endian. A pack is the index (header, TOC, names, dictionary) followed by the data.

| Part | Size | Content |
|---|---|---|
| header | 32 B | below |
| TOC | 64 B per entry | one row per entry, sorted by name hash, then by name (bytes) |
| names | header | the entry names, UTF-8, concatenated, no terminator |
| dictionary | header | the zstd dictionary of the `zstd-dict` entries; absent when no entry uses one |
| data | | the entries in (group, name) order, each at a multiple of the alignment, zero padding between them |

Header:

| Offset | Type | Field |
|---:|---|---|
| 0 | 4 B | magic `ZPK1` |
| 4 | u16 | version: 1 |
| 6 | u16 | flags: 0 |
| 8 | u32 | entry count |
| 12 | u32 | data alignment: a power of two up to 1 MiB (16 by default; 2048 or 4096 where the target reads sectors: UMD, SD, flash pages) |
| 16 | u32 | TOC offset: 32 |
| 20 | u32 | names offset: 32 + 64 x count |
| 24 | u32 | names size |
| 28 | u32 | dictionary size; the dictionary follows the names |

TOC row:

| Offset | Type | Field |
|---:|---|---|
| 0 | u64 | name hash: FNV-1a 64 of the name's bytes (offset basis `0xcbf29ce484222325`, prime `0x100000001b3`) |
| 8 | u32 | name offset, in the names |
| 12 | u32 | name length (not 0) |
| 16 | u64 | data offset, from the start of the pack |
| 24 | u64 | stored size |
| 32 | u64 | size once decoded |
| 40 | u16 | group: entries loaded together (one sequential read on optical or SD media, one request in the browser) |
| 42 | u8 | kind: the asset kind, set by the asset build, opaque to the format |
| 43 | u8 | codec: 0 none, 1 lz4, 2 zstd, 3 zstd with the pack's dictionary |
| 44 | u32 | reserved: 0 |
| 48 | 16 B | the first 16 bytes of the SHA-256 of the stored bytes |

## Codecs

Each entry is compressed on its own, so reading one never decodes another:

- **none**: the bytes as they are; the reader hands out a pointer into the mapping (GPU block formats, Opus, data read in place from an
  ESP32's flash).
- **lz4** (1.10.0, a raw block; lz4hc at level 12 by default): a tiny decoder that allocates nothing, the codec of small targets.
- **zstd** (1.5.7, one frame with its content size; level 19 by default): raw layouts (RGBA, RGB565, meshes, tile arrays, ZBC).
- **zstd-dict**: zstd with the dictionary stored in the pack, for many small entries. The writer trains it (ZDICT, single-threaded,
  hence deterministic) from the entries that ask for it, about a hundredth of their bytes and 110 KB at most, unless the caller gives one.

An entry whose compressed form is not smaller than its bytes is stored as `none`, and so is an empty one.

## Reading and checking

Opening a pack checks the header and every TOC row: names inside the names, the hash of each name, the order of the rows, data inside the
file and aligned, a known codec, `stored size = size` for `none`, reserved fields 0. It does not read the data. `Reader::indexHash()` is the
SHA-256 of the whole index (header, TOC, names, dictionary): the value a signed manifest records for the pack, so that one hash covers every
row and every row covers its entry. Reading an entry hashes its stored bytes against its row the first time (later reads skip the hash),
decodes them and checks the decoded size. Errors name the entry: `the pack is corrupted: level1/map.bin does not match its checksum`.
`read()` takes an optional zstd decoder context that the caller owns: the asset manager keeps one per job in flight and reuses them
(small dictionary entries read about 30% faster than with a context made per read, ZN-433).

A row states the decoded size before anything is decoded: the asset manager checks it against its budget before it allocates.

## Determinism

The writer sorts what it is given; the same entries give the same bytes whatever their order, directory or machine (no time, no path, no
thread count in the output: `tests/t0/zpk.sh` packs one tree from two directories and two homes and compares the bytes).

## Size in the runtime

Bytes a program that reads packs gains, from the linker map of a reader-only program (macOS x86_64, the release flags of `zinc`, zero-fill
excluded, 2026-10-11). `zinc` links whole archive members, so the first column is what it would gain; a program linked with `-dead_strip`
gets the second.

| Part | Linked by member | Dead-stripped |
|---|---:|---:|
| reader (`src/zpk/zpk.cpp`) | 7.0 KB | 5.6 KB |
| lz4 (`lz4.c`: its compressor shares the object file) | 70.3 KB | 2.7 KB |
| zstd decoder, with its common files | 136.6 KB | 117.2 KB |
| SHA-256 (already in `zinc`) | 1.6 KB | 1.6 KB |
| **total** | **215.6 KB** | **127.0 KB** |

The writer adds 0.57 MB more where it is linked (the CLI): zstd's compressor 414 KB, lz4hc 63 KB, the dictionary builder 59 KB, the
writer 36 KB. The zstd decoder can shrink for small targets with `HUF_FORCE_DECOMPRESS_X1`, `ZSTD_FORCE_DECOMPRESS_SEQUENCES_SHORT` and
`ZSTD_NO_INLINE`, at some decoding speed; the ESP32 profile uses lz4 alone.
