---
id: ZN-1030
title: 'Open records and interfaces: structural assignment and writes'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:37'
labels:
  - checker
  - records
  - size-M
milestone: m-13
dependencies: []
ordinal: 8900
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Interface-of-fields assignment gaps: `class Tag implements Labeled` assigned to `Labeled` (Z0103), a class whose getter supplies the field, a missing optional field or narrower type, writing through a non-record interface property, writing an optional field the class lacks (throws "object is not extensible"), a record literal printing `note: undefined`.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- Checker: an interface with only fields is treated as a record, so `class Tag implements Labeled { label: string }` assigned to `Labeled` is refused with Z0103; TypeScript accepts it.
- Structural assignment to a record does not accept an interface value, a class whose getter supplies the field, a missing optional field or a narrower field type; TypeScript accepts all four.
- Writing through a non-record interface property (`iface.prop = v`) is refused (interface properties are read-only getters); TypeScript allows it, it needs a setter selector.
- Open records (D193): writing an optional field the class lacks throws "object is not extensible" on interpreter and AOT (QuickJS adds it, as JavaScript); a narrower array or record field (`Dog[]` for `Animal[]`, a record with more fields) is refused (a copy would break sharing); writing a wrong-class value into a narrower field throws where JavaScript stores it; writes through a computed object (`list[i].name = v`) to a setter or interface property are refused; a class with a narrower field shared as a record satisfying an interface that needs a box conversion (`number|null`) gets no slot for that property.
- A record literal with an optional field left out prints `note: undefined`; JavaScript omits the key. An `any` view does not show methods (`(o as any).greet` is undefined).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each case runs on the three engines with the same output
- [ ] #2 optional-field write adds the field as JavaScript does
- [ ] #3 a regression file in tests/run
<!-- AC:END -->
