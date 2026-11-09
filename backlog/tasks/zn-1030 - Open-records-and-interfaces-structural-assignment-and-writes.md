---
id: ZN-1030
title: 'Open records and interfaces: structural assignment and writes'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:37'
updated_date: '2026-11-09 01:15'
labels:
  - checker
  - records
  - size-M
milestone: m-13
dependencies: []
ordinal: 8900
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
- [x] #2 optional-field write adds the field as JavaScript does
- [x] #3 a regression file in tests/run
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Handover 2026-11-09 (worktree agent). Criteria #2 and #3 pass; #1 stays open for the cases below.

Already working on develop before this task (probed on the three engines, now in tests/golden/run/open_record_writes.ts): `class Tag implements Labeled` assigned to `Labeled`; a record from an interface value, from a class whose getter supplies the field, with a missing optional field, with a narrower (literal) field; `iface.prop = v`; writes through a computed object to a setter (`temps[i].celsius = 30`) and to an interface property; a narrower `number` field shared as a `number | null` record field.

Done here:
- An optional field a write through a record adds (D193 threw "object is not extensible"): frontend::addedFields(c, cls) (src/frontend/inspect.cpp) lists the optional fields of the open records a class is shared as (directly, or through an interface it implements) that the class and its ancestors lack; Lowering::layoutOf appends them to the class layout (zero = undefined), so fieldChain reads and writes them like any field and subclasses inherit them. console.log and JSON.stringify of the class show them once set (after the class's own fields, as JavaScript's insertion order puts them), through `(v as Record).field` in the generated formatter and serialiser.
- A record literal leaves an optional field it lacks out of console.log (JSON already did).
Proof: open_record_writes.ts same output on interpreter, --native and --engine quickjs; tests/run --only run, checker, ts_assignability, json_typed_shape PASS.

Decision to record (proposed): a class shared as an open record gets a slot for each optional field of that record it lacks (closed world: known after checking), rather than a per-object property map; an explicit `undefined` stored in an optional field reads as absent, so `{ b: undefined }` prints `{}` where JavaScript prints `{ b: undefined }` (absent and undefined are one null in the IR). Why: no hidden class or side table, no cost for classes never shared, reads stay one field access.

Still open (criterion #1):
1. `(o as any).greet` is undefined: the `any` view (src/frontend/dyn.cpp, DynRefT get) has no function values; Dyn needs a function kind (typeof 'function', calling it with any arguments). Next: a DynFn class in dynPrelude and a get case per public method returning a bound DynFn.
2. A narrower array or record field (`animals: Dog[]` for `Animal[]`) is refused with Z0103 (arrays of different element types are different IR types; covariance is a copy, which would break sharing through the record).
3. Writing a value of the wider class into a narrower field through the record (`z.star = new Cat()` where the class says Dog) throws a TypeError where JavaScript stores it.
4. A record-like interface (`interface HasName { name; size }`, fields only, so a record) assigned to a wider record is a copy (D215): `r.note = ...` is not seen through the first value, where TypeScript shares it.
Repro: the cases are in /private/tmp scratch only; write them as rec3-style programs (Zoo/DogZoo/Cat) and compare `zinc run` with `zinc run --engine quickjs`.

Research (sonnet, 2026-11-09): hidden classes and shape transitions add properties in V8/JSC; in a closed-world static compile a per-class slot or a property map; absent vs undefined needs a presence bit or a shape without the key; getters satisfy interface fields by dispatch, setters per itable slot (Static TypeScript paper, https://www.microsoft.com/en-us/research/uploads/prod/2019/09/static-typescript-draft2.pdf).

Proposed tests: tools/diff-matrix at the milestone (records and classes over the corpus, ~10 min, <1 GB); tests/run --only json_large (serialiser change, seconds).
<!-- SECTION:NOTES:END -->
