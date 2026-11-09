---
id: ZN-698
title: Native SHA-256 for bytes and files read in chunks
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 21:52'
updated_date: '2026-11-09 00:37'
labels:
  - std
  - size-S
dependencies: []
ordinal: 8300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Expose sha256 of bytes and of a file read in chunks (no whole-file load) from a std module; test vectors on 3 engines; short run, no 100 MB test now.

**What is left (review 2026-10-25):** Expose the vendored mbedTLS/Monocypher hash through a std module; AC: test vectors on 3 engines, 100 MB file without loading it whole. Already there: lib/std/web.ts:2007; src/cli_core.cpp:113.

Found by the pinball editor: a program has no hash function, so a package cannot carry a hash per file. Monocypher and mbedTLS are vendored: expose SHA-256 (and BLAKE2b if free) for bytes and for a file read in chunks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 sha256 of the test vectors equals the known digests on the interpreter, the AOT and QuickJS
- [x] #2 a 100 MB file is hashed without loading it whole
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. sha256 of bytes exists in pure Zinc (lib/std/web.ts:2007) and the CLI hashes files (zinc toolchain sha256). Left: a native, fast SHA-256 (mbedTLS) for bytes and for a file in chunks, on all three engines. Evidence: lib/std/web.ts:2007; src/cli_core.cpp:113
Review 2026-11-07: done-partly. sha256(bytes) exists in lib/std/web.ts:2034; left: a std-level chunked file hash and the 3-engine vector test. Evidence: lib/std/web.ts:2034

Done 2026-11-09 (worktree agent).
- Web search: mbedTLS 3 names are mbedtls_sha256_starts/update/finish (the _ret names were 2.x); the PSA hash API (psa_hash_setup/update/finish) is what src/host/crypto.cpp already uses, so the file digest streams through it. Read 64 KiB blocks; the digest does not depend on the block size. NIST vectors: empty, 'abc', the 448-bit message, one million 'a'.
- New std module zinc:hash (lib/std/hash.ts): sha256(bytes) (zinc:__crypto digest:sha-256, PSA), sha256File(path) (new row host.hashFile 'ss>B': the host reads the file in 64 KiB blocks through zn::crypto::digestStream, never whole; fs:read permission and scope checked; errors as zinc:fs's 'CODE: cannot open path'), toHex. Web target: lib/std/hash.browser.ts on web.browser.ts's JavaScript SHA-256 (the page has no host crypto). Documented in docs/guide/04-headless-services.md.
- Decision: a module of its own (zinc:hash) rather than more functions in zinc:fs/zinc:sys or zinc:web's pure-Zinc sha256: one obvious import for makers, native on every engine; zinc:web's sha256 stays the portable one for profiles without host crypto. BLAKE2b (Monocypher) not added: no caller.
- Proof: tests/t0/hash_sha256.sh (interp, default, QuickJS, AOT: the four vectors, one million 'a' as a file of sixteen blocks, the empty file, a missing file) passes. A sparse 100 MB file (mkfile -n, no disk blocks) hashed by sha256File: 324 ms, 16 MB peak RSS on the interpreter, 322 ms and 25 MB on QuickJS, digest equal to shasum -a 256.
- later.md: blake2b in zinc:hash when a caller needs it (Monocypher is vendored); an incremental hasher (update/digest, Node createHash) for data that arrives in parts (a download hashed as it streams).
Proposed tests: an AOT and QuickJS run of a hub or pinball package check using sha256File (seconds); the web export of a program importing zinc:hash (hash.browser.ts in a page: tools/web-real-test, ~1 min, headless Chrome).
<!-- SECTION:NOTES:END -->
