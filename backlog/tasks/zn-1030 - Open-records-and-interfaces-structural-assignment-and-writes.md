---
id: ZN-1030
title: 'Open records and interfaces: structural assignment and writes'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:37'
updated_date: '2026-11-10 08:28'
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

Handover 2026-11-09, second pass (worktree agent). Cases 1 and 4 fixed on the three engines; criterion #1 stays open for cases 2 and 3 below.

Done here:
- (1) Methods through an any: a DynFn kind (8) in the Dyn prelude (src/frontend/dyn.cpp): the get row of a class's any view returns, for each public method (overrides first) whose parameters and result convert, a function bound to the object (typeof 'function', prints [Function: greet], 'greet' in d, d.greet === d.greet by object and name, left out of JSON objects). The checker (src/frontend/check.cpp, call path) turns a call of an any (d.greet(), f(x)) into __dynCall(callee, [args], 'd.greet'): a DynFn runs, anything else throws 'd.greet is not a function'. unknown and optional calls (d?.f(), f?.()) keep Z0105 (docs/reference/syntax.md row updated). Limits: the method is bound (JavaScript's const f = d.greet; f() loses this; here it works); every parameter is passed, so a missing argument of a defaulted number parameter throws.
- (4) A record (or field-only interface) where a wider record is expected is shared, no longer copied (amends D215's copy): classToRecord accepts a record source, so the target becomes an open record over the source's literal class; finishDynViews closes openRecords transitively (Box shared as HasName, HasName as Named: Box reaches Named); the lowering uses newClassOf for record sources (openShapes, openIrClasses) and makes an open source record's interface implement the target; addedFields gives a record the optional fields of the wider record it is shared as, and console.log and JSON show them once set. Cost measured with a temporary print over hero, nuxt-ui, rn-showcase, zed-editor, breakout: only rn-showcase widens records (5 pairs, the DOM event init records), so few records turn open.
Proof: tests/golden/run/open_record_writes.ts same output on interpreter, --native and --engine quickjs (also scratch repros of each case); tests/run --only run, checker, ts_assignability, json_typed_shape, ir PASS; zinc check of hero, nuxt-ui, rn-showcase, zed-editor, breakout, rn-port ok; rn-showcase 5 headless frames.

Still open (criterion #1):
2. A narrower array field (DogZoo.animals: Dog[] for Zoo.animals: Animal[]) is refused with Z0103. Same root as a plain const as: Animal[] = dogs, which today is a copy (arrwiden): a push through as is not seen in dogs (QuickJS: 2 2 / 3 3; Zinc: 1 2 / 2 1), and as === dogs is Z0107. Design (too big for one session; IR, verifier, interpreter, AOT): (a) arrays of references share one runtime representation, so a refcast between ref-element arrays whose element classes are related (subclass, implementation, a class shared as an open record) is legal in the IR and a no-op in the interpreter and a reinterpret in AOT (single inheritance: the pointers are equal; check interface refs); (b) writes through the wider view check the element against the array's real element class, as Java's ArrayStoreException and Dart's covariant checks do: the array object already names its element class (ArrObj cls -> zbc ClassInfo elem), so the check is one class test, emitted only on arrays of an element type that some covariant conversion reaches (closed world, known after checking); a failed check throws the TypeError of case 3; (c) arrwiden and the record refusal then become that refcast; === between the two views compares identity. Start with the interpreter and the verifier, then AOT, then QuickJS needs nothing.
3. Storing a wider-class value into a narrower field through the record (z.star = new Cat() where DogZoo.star: Dog) throws 'Cannot store this value in star of DogZoo, a field of type Dog'; JavaScript stores it. A typed engine cannot hold a Cat in a Dog field (later dz.star reads are typed Dog): proposed decision to keep the TypeError (Java, C# and Dart check covariant stores at run time), its message naming the fix (declare the field with the record's type). If accepted, case 3 leaves criterion #1 as a recorded limit.
Next: work case 2 as designed above, or record case 3 as a decision and narrow criterion #1 to case 2.

Research (sonnet, 2026-11-09, second pass): Java/C# covariant arrays with a store check per write, skippable for final element types (https://blogs.msdn.microsoft.com/ericlippert/2007/10/17/covariance-and-contravariance-in-c-part-two-array-covariance); Dart checks covariant stores in forwarding stubs, not by widening the slot (https://dart.googlesource.com/sdk.git/+/edf7b0587a2feb725f57cedd16eed918cf3d3ea6/docs/language/informal/covariant-overrides.md); Dart's List.cast is a live view, not a copy (https://gist.github.com/munificent/6296132ac1d5179ebe9f98709bcea37b); Go itabs and Slang witness tables share the object under a structural type (https://research.swtch.com/interfaces). No prior art found for bound methods on an any view in AOT TypeScript compilers; dart2wasm closures carry a call entry (https://dart.googlesource.com/sdk/+/refs/heads/main/pkg/dart2wasm/lib/closures.dart).

Proposed tests: tools/diff-matrix at the milestone (records, any and classes over the corpus, ~10 min, <1 GB); tests/run --only json_large (serialiser of records with added fields, seconds); tests/t1 of rn-showcase (its DOM event init records are now shared, ~1 min).

2026-11-10 — Third pass in work/1030, based on fc26777c6. Backlog, AC1 remains open; AC2/AC3 retain their earlier proofs. This is a semantic repair checkpoint, not completion of structural covariance.

Research (primary sources, no dependency added): TypeScript documents structural compatibility (https://www.typescriptlang.org/docs/handbook/type-compatibility.html). ECMAScript EvaluateCall supplies a receiver for a property reference, undefined for an extracted value, evaluates arguments before checking callability (https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-evaluatecall). SerializeJSONProperty excludes callable values from object properties (https://tc39.es/ecma262/multipage/structured-data.html#sec-serializejsonproperty). V8's hidden classes/property transitions (https://v8.dev/blog/fast-properties) are prior art, not a reason to introduce a per-object map in this closed-world engine.

Before editing, reproduced all four original handover cases on interpreter, native and QuickJS using the common source3a87af69a binary, SHA2565917d26a7226ab2897827c4b697c0ff4ec368eb02f7752105dccafb91746e361 (adjacent native libraries intact):
1. `class G { name='g'; greet():string { return this.name; } }; const d:any=new G(); const f:any=d.greet; f()` returned g on interpreter/native, but QuickJS threw TypeError. `typeof d.greet`, repeated identity and direct `d.greet()` already worked. The old note saying methods are still undefined was stale.
2. `DogZoo.animals: Dog[]` shared as `{animals: Animal[]}` was Z0103 on interpreter/native; QuickJS printed 2 2 after a push through the wider view. Full source is now tests/data/open_record_methods/remaining-array.ts. Plain array widening is also still a copy: remaining-array-alias.ts prints 1 2 / 2 2 on interpreter/native and 2 2 / 3 3 on QuickJS.
3. `DogZoo.star: Dog` shared as `{star: Animal}`, then `z.star = new Cat()`: interpreter/native catch TypeError (true); QuickJS stores it and prints animal. Source: remaining-store.ts. D231 records the present safety check; it does not satisfy AC1.
4. `HasName` literal shared as `Named`, then writing size/note: all three already printed `3 new {"name":"a","size":3,"note":"new"}`. No copy repair was needed. New exact regression also proves nested narrower record-field identity and writes through both structural views.
Baseline source/logs: .logs/1030/{method,array,store,share}.ts and *-{interp,native,qjs}.log. No frozen corpus/golden output was regenerated.

Changed:
- Any member calls prepare the function reference and receiver before arguments; computed keys and temporary receivers evaluate once. Extraction uses undefined as its receiver. Method identity is keyed by declaring class/name, so two instances and an inherited method compare equal; overrides differ.
- Generated method adapters use the supplied declaring-class receiver when the body or defaults use this. Receiver-free methods remain callable after extraction. Per-arity calls honor omitted default arguments, including defaults using this. Source bindings can be cleared while method values survive without a dangling reference.
- Typed JSON serializers omit method/undefined payloads stored in any/unknown fields, including added optional fields, using the existing escaped-key generator and addedFields logic. The dynamic field is read once. Null in a required nullable dynamic field still serializes as null.
- Added one exact T0, tests/t0/open_record_methods.sh: all three engines on the focused fixture and unchanged tests/golden/run/open_record_writes.ts, both zinc check commands, and unknown/optional-call Z0105 diagnostics. Main fixture covers identity, inheritance/overrides, extraction, missing methods, omitted defaults, computed calls, temporary lifetimes, argument receiver replacement, nested record sharing, quoted keys and optional dynamic method/undefined omission.

Remaining, with committed minimal repros excluded from the passing T0:
- remaining-array.ts, remaining-array-alias.ts and remaining-store.ts still differ as above. No unchecked array cast, copied adapter or partially widened storage slot was introduced.
- remaining-borrowed.ts: a method assigned to `{name:'borrowed', greet:g.greet}` is callable with that unrelated structural receiver in JavaScript; native engines safely reject conversion to the declaring class. The repair removes forced binding but does not add arbitrary receiver adaptation.
- remaining-optional-any.ts: explicit null in an added optional any field still collapses to the absent slot and serializes as {}, while QuickJS prints {"value":null}. Boxing it alone would break the existing optional-Dyn comparisons/narrowing; no global conversion workaround was kept.
- Existing adapter limits remain: explicit undefined in a defaulted numeric argument, rest/generic/unsupported method signatures and arbitrary Function.call/apply/bind are not claimed fixed.

Next implementation: first run `ZINC_HEADLESS=1 build/zinc run tests/data/open_record_methods/remaining-array.ts --interp` and its QuickJS counterpart. Source roots are Checker::assignable/suppliesField/arrwiden (src/frontend/check.cpp), Lowering::newClassOf/openShapes/fieldChain/coerce (src/ir/lower.cpp), IR RefCast validation (src/ir/ir.cpp), and the typed array Get/Set/Push lowering. ArrObj already stores reference slots, but typed reads and AOT concrete field offsets still require a valid class. Reuse the concrete-allocation/open-interface split of records to carry a narrower class as a shared view with member-specific dispatch; keep constructor instanceof tied to its concrete class. Only then share a reference-array representation and permit wider stores. A Cat stored through an Animal view must allow the original alias's common .name read and both views' JSON/any output; Dog-only operations must fail at the member access safely. A mere broader slot plus early checked downcast only moves today's error to an ordinary read and is not an acceptable completion.

Proposed decision amendment for coordinator: refine D231's bound-method statement to member-call receiver versus unbound extraction, with stable declaration identity and omitted-default support; retain its checked representation boundaries as open work, not a waiver of AC1. No new decision number, later.md line or performance number is requested.

Proof/final compiler hash and exact command are appended below. Clean frontend/serializer files only: no IR, runtime, allocator/string, src/main.cpp, CMake, HAL, host, UI, shared records/perf/RESUME or owner WIP was edited. tools/build zinc succeeded; changed files compiled without warnings, initial fresh dependencies emitted existing asset, SDK and nanosvg warnings. Bounded headless work-run proofs only, no remaining owned process. usage: n/a (tools/usage).

Proposed tests: `tests/run --tier t0 --only json_quoted` — existing escaped serializers after dynamic omission, expected seconds/<1GB, owner selected; `tests/run --tier t0 --only class_runtime` — shared class/record adapter callers, expected seconds/<1GB, owner selected; `tools/diff-matrix` — broader records/classes corpus, milestone only, earlier estimate ~10min/<1GB. No suite, T1/T2, tests/demo, benchmark, pixel, conformance, fuzz, CI or cross-platform run.

Final proof: `/Users/mowmow/Lab/zinc/tools/work-run 60 env ZINC=<tree>/build/zinc ZINC_TEST_RESULTS=.logs/1030/results-final.txt tests/run --tier t0 --only open_record_methods` PASS, 7 seconds (all3 focused fixture + original caller, two checks, two negative diagnostics). Final build/zinc SHA256 a1f55907e44eedee9d00a2c4ccbba685b481136cee2eb4c7d6d86858549a504f, built from fc26777c6 plus this commit's source changes. Final source unchanged after this proof; final remaining-case all3 log .logs/1030/remaining-candidate.log records the same binary hash. Durable worker logs .worktrees/1030/.logs/1030; coordinator should archive before removing the tree. No throughput, memory, energy or cross-platform claim.
<!-- SECTION:NOTES:END -->
