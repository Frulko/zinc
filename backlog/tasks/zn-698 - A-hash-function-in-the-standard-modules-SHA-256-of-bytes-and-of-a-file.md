---
id: ZN-698
title: A hash function in the standard modules (SHA-256 of bytes and of a file)
status: Backlog
assignee: []
created_date: '2026-10-10 21:52'
labels:
  - std
  - size-S
dependencies: []
ordinal: 468410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the pinball editor: a program has no hash function, so a package cannot carry a hash per file. Monocypher and mbedTLS are vendored: expose SHA-256 (and BLAKE2b if free) for bytes and for a file read in chunks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 sha256 of the test vectors equals the known digests on the interpreter, the AOT and QuickJS
- [ ] #2 a 100 MB file is hashed without loading it whole
<!-- AC:END -->
