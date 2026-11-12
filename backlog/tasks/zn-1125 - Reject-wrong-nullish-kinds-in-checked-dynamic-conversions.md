---
id: ZN-1125
title: Reject wrong nullish kinds in checked dynamic conversions
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-12 09:46'
labels:
  - language
  - frontend
  - size-S
milestone: m-7
dependencies: []
ordinal: 17502
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks ZN-1037 older-daemon wire validation: interface Reply { value?: number; }; JSON.parse of {"value":null} silently accepts null as undefined on current interpreter. Preserve optional absence, explicit false/zero/empty and correct nullable values, but reject a wrong Dyn nullish kind before typed storage erases its distinction. D18 shared static representation is unchanged. Source seams frontend/dyn.cpp Union converter and QuickJS typed schema nullish converters; no runtime/IR/ABI/caller changes. Original mini and full production wire failures retained under .worktrees/1037-remote-wire/.logs/remote1037/optional-null.ts, optional-null-interp.log, wire.ts and wire-no-null.ts. Primary/source diagnosis .logs/research-next-l.txt.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Checked optional typed fields and values accept absence/undefined and reject explicit null, while nullable types accept null and reject undefined, on interpreter, AOT and QuickJS.
- [ ] #2 Focused nested record, array, primitive, callback/result and optional Dyn controls preserve legitimate values, explicit zero/false/empty, unknown additions and TypeError behavior without runtime storage changes.
- [ ] #3 Original ZN-1037 production decoder fixture rejects explicit optional mediaBits:null and rules:null, while older omissions and same-version payloads still pass on all three engines without caller workaround.
<!-- AC:END -->
