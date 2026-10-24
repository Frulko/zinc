---
id: ZN-159
title: 'Beyond the prototype: BigInt'
status: Backlog
assignee: []
created_date: '2026-10-06 23:05'
labels:
  - language
  - size-M
  - parked
milestone: m-7
dependencies:
  - ZN-155
ordinal: 90600
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BigInt literals and operations with libbf (MIT, from QuickJS) as a vendored library; BigInt64Array interplay; mixing rules and errors as in the spec.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 test262 BigInt subset at the recorded rate; fixtures equal Node's
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. (drop proposed, corrected by the verifier) This is far, not useless. docs/reports/parity/01-language-cli-std.md:116 lists BigInt as 'Beyond prototype, requested' (libbf is the cheap route), and plugins/wasm/index.ts:5 says WebAssembly i64 values lose precision without it. No decision supersedes it. Evidence: `10n*3n` is Z0005 not supported; no example or plugin needs BigInt
<!-- SECTION:NOTES:END -->
