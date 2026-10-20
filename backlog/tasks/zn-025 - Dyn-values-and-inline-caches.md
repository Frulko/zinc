---
id: ZN-025
title: '`Dyn` values and inline caches'
status: Done
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 14:06'
labels:
  - size-L
milestone: m-4
dependencies: []
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Acceptance: the `Dyn` conformance program passes; strict profiles reject `any` with Z1006.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the Dyn conformance programs pass (dyn, dyn_literals, dyn_unknown, literal_errors); strict profiles (the line // zinc-profile: strict, or --strict) reject any and the untyped result of JSON.parse with Z1006
- [x] #2 JSON.parse is a native runtime call and Dyn property reads and additions have native fast paths (dynsum 393 ms to about 35 ms); the remaining gap to QuickJS is ZN-026's
<!-- AC:END -->
