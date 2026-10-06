---
id: ZN-017
title: '`lang` conformance program passes'
status: Done
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 10:10'
labels:
  - size-S
milestone: m-2
dependencies: []
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Acceptance: byte-identical to the frozen golden from ZN-001.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 byte-identical to the frozen golden from ZN-001.
- [x] #2 M2 demo: examples/lang passes at tier t1 with quiet output
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. tour.ts byte-identical to corpus/conformance/tour.out; examples/lang runs and is frozen as tests/golden/lang/lang.out; both in tests/t1/conformance.sh. Added type assertions (as). ASan T1 green.
<!-- SECTION:NOTES:END -->
