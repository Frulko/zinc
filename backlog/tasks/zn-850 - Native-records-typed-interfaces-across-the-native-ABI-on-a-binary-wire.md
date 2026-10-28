---
id: ZN-850
title: 'Native records: typed interfaces across the native ABI on a binary wire'
status: Backlog
assignee: []
created_date: '2026-10-28 21:20'
labels:
  - size-L
  - native
  - engine
milestone: m-9
dependencies: []
ordinal: 559460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A native spec may declare interface records and use them (and lists, optionals, nested records) as parameters and results, Promise results included. Wire: schema-driven little-endian binary on the u8[] letter, u32 length per record, append-only evolution. Generated C++ structs (std types, worker-safe) encode/decode; the interpreter, AOT and QuickJS decode in C++. Replaces the hand-made \x1e/\x1f strings. Research: docs/reports/native-record-wire-options-2026-10-28.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A spec record type crosses as a parameter, a result and a Promise result on the interpreter, AOT and QuickJS, with the same output (t0 test)
- [ ] #2 native-gen writes a C++ struct per record with encode/decode, usable on a worker thread
- [ ] #3 A record grown by a trailing field is read by an older reader, and an older record by a newer reader (defaults)
- [ ] #4 docs/guide/05-plugins.md documents records; the strict profile refuses them with a clear diagnostic
<!-- AC:END -->
