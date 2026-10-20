---
id: ZN-094
title: 'Diagnostics parity: codes, wording, --json, ts-ignore policy'
status: Done
assignee: []
created_date: '2026-10-06 22:54'
updated_date: '2026-10-07 06:19'
labels:
  - language
  - tools
  - size-M
milestone: m-13
dependencies:
  - ZN-062
ordinal: 40360
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Table C of audit 01: add the Z1xxx codes for var, regex (until supported), dynamic import, holey array literals, `in` on non-objects, labeled statements with the prototype's wording; one error per cause; `zinc check --json` in the LSP diagnostic shape (docs/guide/06-testing.md); document the differences from tsc and decide `// @ts-ignore` handling (honour it or refuse it, recorded).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tests/golden/diagnostics fixtures for each code (message, line, column)
- [x] #2 `zinc explain Z....` prints the page for every code (docs/diagnostics.md regenerated)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. New registry codes with the prototype's numbers and wording: Z1001 var, Z1002 arguments, Z1003 eval, Z1005 with, Z1007 delete, Z1009 import(), Z1010 prototype/__proto__, Z1011 holey arrays, Z1015 globalThis, Z9011 labels, Z9026 in (Z1008 regex is gone: regular expressions are supported). Parser: with, import(, holes, labels; checker: var, unknown names arguments/eval/globalThis, delete, in, prototype; #x outside its class is Z0117; one error per cause (a repeated code at the same place is dropped). zinc check --json <file> prints the prototype's LSP-shaped array (uri, range.start 0-based, code, severity 1, message), exit 1 on errors. Fixtures: tests/golden/checker/errors/{forbidden_*,unsupported_*,private_hash_outside,no_cascade_*}; docs/diagnostics.md regenerated; docs/diagnostics-vs-tsc.md; decision D20: // @ts-ignore is not honoured. Not done: the cascades of rest parameters, spread arguments, destructuring rest and string enums (Z0005 plus follow-up errors) stay until ZN-160 implements those forms; the object type (Z9001 in the prototype); the parity table C of the audit (docs/reports/parity/01) is untracked and not updated.
<!-- SECTION:NOTES:END -->
