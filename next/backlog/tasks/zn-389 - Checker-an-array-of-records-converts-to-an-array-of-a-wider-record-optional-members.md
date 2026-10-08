---
id: ZN-389
title: >-
  Checker: an array of records converts to an array of a wider record (optional
  members)
status: Backlog
assignee: []
created_date: '2026-10-08 22:45'
labels:
  - compiler
  - checker
  - size-M
dependencies: []
ordinal: 149000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-383: `const DATA = [{ title: 'A', data }]` is typed by the literal's own record; passing DATA where { title?: string; key?: string; data: T[] }[] is expected fails ('arrays of records cannot be converted'), so zinc:react-native's SectionBase<T> stays exactly { title, data }. TypeScript accepts it structurally. Either type such a const by its first use (contextual), or convert the array (copy each element into the wider record, members missing as undefined) at the call. Then SectionBase<T> takes title? and key? back.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/rn-tester and the react-native lists golden compile with SectionBase<T> = { title?, key?, data }
<!-- AC:END -->
