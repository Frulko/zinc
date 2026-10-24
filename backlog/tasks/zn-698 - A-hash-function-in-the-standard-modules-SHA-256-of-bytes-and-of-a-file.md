---
id: ZN-698
title: 'Native SHA-256 for bytes and files read in chunks'
status: Backlog
assignee: []
created_date: '2026-10-10 21:52'
labels:
  - std
  - size-S
dependencies: []
ordinal: 5000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Expose the vendored mbedTLS/Monocypher hash through a std module; AC: test vectors on 3 engines, 100 MB file without loading it whole. Already there: lib/std/web.ts:2007; src/cli_core.cpp:113.

Found by the pinball editor: a program has no hash function, so a package cannot carry a hash per file. Monocypher and mbedTLS are vendored: expose SHA-256 (and BLAKE2b if free) for bytes and for a file read in chunks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 sha256 of the test vectors equals the known digests on the interpreter, the AOT and QuickJS
- [ ] #2 a 100 MB file is hashed without loading it whole
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. sha256 of bytes exists in pure Zinc (lib/std/web.ts:2007) and the CLI hashes files (zinc toolchain sha256). Left: a native, fast SHA-256 (mbedTLS) for bytes and for a file in chunks, on all three engines. Evidence: lib/std/web.ts:2007; src/cli_core.cpp:113
<!-- SECTION:NOTES:END -->
