---
id: ZN-147
title: 'Fuzzing: parser, checker, ZBC decoder and verifier, native ABI'
status: Backlog
assignee: []
created_date: '2026-10-06 23:03'
labels:
  - security
  - tests
  - size-M
milestone: m-12
dependencies: []
ordinal: 40890
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
libFuzzer targets with ASan/UBSan for the lexer/parser, the checker (on mutated corpus programs), zbc::decode+verify and the native ABI argument decoding; a corpus built from tests/golden; a short run gate in T2 (60 s per target) and a documented long-run recipe; crashes become regression tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each target runs 10 minutes clean on the corpus; every crash found is fixed with a regression fixture
- [ ] #2 docs/reports/zinc-next-fuzzing.md
<!-- AC:END -->
