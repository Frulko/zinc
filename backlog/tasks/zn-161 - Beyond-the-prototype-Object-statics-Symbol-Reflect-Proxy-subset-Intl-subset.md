---
id: ZN-161
title: >-
  Beyond the prototype: Object statics, Symbol, Reflect/Proxy subset, Intl
  subset
status: Done
assignee: []
created_date: '2026-10-06 23:05'
labels:
  - language
  - stdlib
  - size-L
milestone: m-7
dependencies:
  - ZN-160
  - ZN-093
ordinal: 16500
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Object.assign/freeze/fromEntries/getOwnPropertyNames/defineProperty on typed records and Dyn objects, Symbol and well-known symbols used by iteration, Reflect, a Proxy subset on Dyn, Intl.DateTimeFormat/NumberFormat/Collator for en-US and the host locale only where an example or web API needs them (ICU4C subset is rejected for size: libunicode tables plus the OS formatter).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fixtures equal Node's output; a size budget recorded for each addition
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: split into subtasks (Object statics on records and Dyn (assign, freeze, fromEntries, getOwnPropertyNames, defineProperty); Symbol and the well-known iteration symbols; Intl.NumberFormat/DateTimeFormat subset (with the zinc:i18n line of backlog/later.md)). Five unrelated features in one task, too big for a session. Reflect and Proxy have no user: drop. Intl overlaps the later line for zinc:i18n.
<!-- SECTION:NOTES:END -->

2026-11-12 coordinator reconciliation: all three split children are Done and discharge this parent's single inherited criterion. Object statics14f12f075/D263 records Node24.14.0 output on all three engines and per-addition/unused budgets; Symbol1a717097f/D296 and Intl8e11bffb6/D301 retain Node26.5 comparisons and unchanged Hero/kit budgets. Source commits are ancestors of develop; both retained Symbol/Intl worker bundles verify. The read-only audit `.logs/parent161-audit-m.json` checks committed goldens against the successful archived Symbol stages and the Intl semantic/size summary. Intermediate files named final are not substituted for successful stages; the audit records their distinction. No program, test, benchmark or size measurement was rerun, and no new feature is claimed. Reflect and Proxy remain dropped by the explicit2026-10-25 review above; this closes the stale parent metadata, not an expansion of that scope.
