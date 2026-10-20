---
id: ZN-433
title: ZPK pack format with lz4 and zstd vendored
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:35'
updated_date: '2026-10-11 10:00'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies: []
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Writer and mapped reader: sorted TOC, per-entry codec (none, lz4, zstd, zstd with a dictionary), alignment per profile, lazy SHA-256 check, deterministic output. Vendor lz4 1.10.0 (lib/ only) and zstd 1.5.7. Write docs/zpk.md and the decision record. Report: docs/reports/games/toolchain-assets-loading.md (6.1).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a 10 000-entry round trip passes
- [x] #2 two packs of the same inputs are byte-identical across directories and homes
- [x] #3 a libFuzzer target on the reader runs clean for 10 minutes
- [x] #4 the decoder bytes added to the runtime are recorded in the D40 table
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-11, worktree agent). New module src/zpk (zpk.h; zpk.cpp the reader, write.cpp the writer, so a reader-only program links no compressor), format in docs/zpk.md. Vendored lz4 1.10.0 (lib/lz4.c, lz4.h, lz4hc.c, lz4hc.h, LICENSE; archive sha256 53751290..., equal to the release's .sha256) and zstd 1.5.7 (lib/common, compress, decompress without the .S, dictBuilder, zstd.h, zdict.h, zstd_errors.h, LICENSE; archive sha256 eb33e51f..., equal to the release's .sha256), unmodified, rows in third_party/README.md; targets zn_lz4, zn_zstd (ZSTD_DISABLE_ASM), zn_zpk; sha256.c moved out of zn_tc into its own zn_sha256 (zn_tc and zn_zpk link it). zig cc / zig c++ compile every file of the module and both libraries with no warning (host target only).

Format decisions (reversible, behind zpk.h; DECISION RECORD for the coordinator, from report 6.1: ZPK 66, ustar + index 60, zip/miniz 53, PhysicsFS 48 -> ZPK): 32-byte header (ZPK1, version 1, flags 0, count, alignment, TOC offset 32, names offset, names size, dictionary size); TOC rows of 64 B, not the sketch's 48 (one cache line, u64 offset/stored/size, u16 group, u8 kind, u8 codec, u32 reserved, 16 B of the SHA-256 of the STORED bytes: checked before any decoder sees them); rows sorted by FNV-1a 64 of the name then the name bytes (two lines to specify for the browser loader; not a security property, open() recomputes each row's hash); names, then the zstd dictionary, both part of the index; Reader::indexHash() = SHA-256 of header+TOC+names+dictionary, the value the signed manifest will record (authenticity), the per-entry hashes are integrity only. Data in (group, name) order, aligned (16 default, power of two up to 1 MiB). Writer: lz4hc 12, zstd 19, ZstdDict trained with ZDICT_trainFromBuffer (single-threaded, deterministic; capacity samples/100 clamped to 1 KB..110 KB) unless given; an entry that does not shrink is stored as None; the same inputs give the same bytes in any order. Reader: open(ptr, size) over the caller's mapping (mmap is ZN-436's mount), checks header and every row (bounds, order, hash, codec, alignment, reserved 0), never the data; read()/view() verify an entry once (atomic flag), decode, check the size. Revisit: a faster SHA-256 if first reads show up in launch times; zstd's size macros where its decoder is too big.

AC1: tests/t0/zpk.sh -> zpk_test: 10 000 entries (text, records, noise, zeros, empty, 200 KB ones; codecs none/lz4/zstd/zstd-dict; 7 groups), every entry found, its row and bytes equal, read twice, views of None entries, data in (group, name) order, offsets aligned, inputs reversed give the same bytes; 4096 alignment; refusals (duplicate/empty names, bad alignments, magic, version, flags, count, alignment, name hash, name length, reserved, codec, four truncations, a flipped data byte refused by name while its neighbour reads, an lz4 row whose size lies, the index hash covering the TOC but not the data). 'all checks passed' in the release build and under ASan+UBSan (build-fuzz/zpk_test). AC2: zpk.sh packs tests/data/images + lib/std copied into two directories, run from two working directories with two HOME/ZINC_HOME, relative and absolute paths: cmp identical. PASS zpk. AC3: tests/fuzz/fuzz_zpk.cpp (sets every row's checksum to its mutated bytes before reading, so the lz4/zstd decoders and the dictionary get fuzzed; rows over 16 MB skipped), tools/fuzz zpk 600 (ASan+UBSan, seeded corpus): 1 494 556 runs in 601 s, clean, corpus 4 -> 1625 packs; -print_coverage shows LZ4_decompress_safe, ZSTD_decompressDCtx/_usingDDict, ZSTD_createDDict_byReference, ZSTD_loadDEntropy, the Huffman 1X/4X and sequence decoders all reached. This Mac has no Homebrew llvm (its keg is empty): tools/libfuzzer builds libFuzzer once from compiler-rt 19.1.7 source (sha256 c12b6e76..., recorded at download, the release has no published digest) for Apple clang 17 into ~/.zinc/cache/libfuzzer-19.1.7; CMake -DZN_LIBFUZZER=<archive> links it; tools/fuzz uses it when no LLVM clang exists, seeds zpk from 'zpk_test seeds', builds through tools/build; tests/t2/fuzz.sh no longer skips on macOS. AC4: linker map of a reader-only program (release flags, zero-fill excluded): reader 7.0 KB, lz4 70.3 KB (lz4.c holds the compressor too; 2.7 KB dead-stripped), zstd decoder with its common files 136.6 KB (117.2 KB dead-stripped), sha256 1.6 KB (already in zinc): 215.6 KB as zinc links (by archive member), 127.0 KB with -dead_strip; the writer adds 0.57 MB where linked (zstd compressor 414 KB, lz4hc 63 KB, ZDICT 59 KB, writer 36 KB). In docs/zpk.md; D40 ROW for the coordinator (this worktree leaves zinc-next-decisions.md alone): 'ZPK reader and decoders (ZN-433): 215.6 KB as zinc links them (reader 7.0, lz4 70.3, zstd decoder 136.6), 127.0 KB dead-stripped; core (lz4 everywhere, zstd off for ESP32); the writer's 0.57 MB only in the CLI'.

Measured (indicative, load 3.2 to 4.2 with other agents building; scratchpad bench, 10 000 JSON-like entries of 200-3200 B, 17.3 MB): open 0.32 ms, 10 000 finds 1.9 ms; packed none 18.2 MB, lz4 3.7, zstd 2.8, zstd-dict 2.2; first read (SHA-256 + decode) none 102 ms (169 MB/s: the SHA-256 bound), lz4 20.7 ms, zstd 38.6 ms, zstd-dict 19.5 ms; later reads none 2.0 ms, lz4 2.8 ms, zstd 24.8 ms, zstd-dict 9.8 ms; writing at zstd 19 6.5 s, lz4hc 12 0.5 s. A per-thread ZSTD_DCtx made zstd-dict reads 9.8 -> 6.9 ms and zstd 24.8 -> 23.2 ms: not kept (a thread_local is a global, ARCHITECTURE.md); ZN-436's workers can own and pass one.

Tests run: zpk, zapp, tc, update_sign, ci_plan, affected_paths, build_inputs_tracked: PASS. later.md lines (for the coordinator): ZN-436 asset workers own a ZSTD_DCtx each (30% on small dictionary entries, measured ZN-433); first-read SHA-256 runs at 169 MB/s (third_party/sha256): mbedTLS's or a SHA-extension SHA-256 when large packs are verified at launch; link zinc with -dead_strip / --gc-sections (lz4.c 70 KB -> 2.7 KB, zstd decoder 137 -> 117 KB); zstd decoder size macros (HUF_FORCE_DECOMPRESS_X1, ZSTD_FORCE_DECOMPRESS_SEQUENCES_SHORT, ZSTD_NO_INLINE) measured on the consoles and the Pi 1; cross-platform pass: zpk_test and fuzz_zpk on Linux x86_64/arm64 and a zig cross build of zn_zstd/zn_lz4. usage: n/a (worktree agent)
<!-- SECTION:NOTES:END -->
