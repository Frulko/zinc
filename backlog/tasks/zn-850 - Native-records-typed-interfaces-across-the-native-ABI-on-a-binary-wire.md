---
id: ZN-850
title: 'Native records: typed interfaces across the native ABI on a binary wire'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-28 21:20'
updated_date: '2026-10-28 21:49'
labels:
  - size-L
  - native
  - engine
milestone: m-9
dependencies: []
ordinal: 559460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A native spec may declare interface records and use them (and lists, optionals, nested records) as parameters and results, Promise results included. Wire: schema-driven little-endian binary on the u8[] letter, u32 length per record, append-only evolution. Generated C++ structs (std types, worker-safe) encode/decode; the interpreter, AOT and QuickJS decode in C++. Replaces the hand-made \x1e/\x1f strings. Research: docs/reports/native-record-wire-options-2026-10-28.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A spec record type crosses as a parameter, a result and a Promise result on the interpreter, AOT and QuickJS, with the same output (t0 test)
- [x] #2 native-gen writes a C++ struct per record with encode/decode, usable on a worker thread
- [x] #3 A record grown by a trailing field is read by an older reader, and an older record by a newer reader (defaults)
- [x] #4 docs/guide/05-plugins.md documents records; the strict profile refuses them with a clear diagnostic
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worktree agent). Wire: include/zn/rec.h (Writer/Reader, put/get, fields(), encode/decode, Schema parse; std only). Schema text {name:T,...}, T = d i u b s B *T ?T {..}; a record travels on the B letter (promise: PB), so the C ABI table, the registry and the engines keep their letters.
Frontend: recordSchema (native_gen.cpp) from the spec file's interfaces/aliases; lowerRequireNative wraps record params in __recEnc(p, schema) and results in __recDec(r, schema) as T (Promise: in the resolve closure); strict profiles refuse with Z5010 naming the member. Prelude __recEnc/__recDec (dyn.cpp) over two Rt rows appended at the end (RecDecode Bsx>r, RecEncode xs>B, isCoreTailRow); interpreter and AOT share rtcalls.cpp (RecDyn builds the Dyn tree in one pass; AOT goes through rtCall, no zrt json mirror needed). ZBC verifier: the r result takes the class of the last x argument, and a B result is the u8 array class.
Choice (reason): typed values reach the encoder as DynRefs, which the runtime cannot walk, so __recEnc goes through JSON.stringify/parse first (ponytail comment: NaN/Infinity become null; a typed encoder per record is the upgrade). Decoding: Dyn tree then the checked conversion (ponytail: two passes; decoding into the record class is the upgrade).
QuickJS: toJavaScript (strip.cpp) rewrites requireNative<Spec>('X') to requireNative<Spec>('X', {member: [schemas]}) via recordSchemasForJs; zinc:native wraps those members; __recDecode/__recEncode are Node-API functions in native_js.cpp (one native call, same property order per record). The web zinc:native ignores the table: its JS impls return objects (gphoto2.js does).
native-gen: one struct per record (nested first) with encode/decode, zn::rec::array/read helpers for zrt::Array<uint8_t>, ZRT_HOSTED_CPP defined first (std placement new); PB in the thunk; rec.h in the plugin cache key. Mobile glue: a record member gets mobileNote (letter B is not carried).
gphoto2: detect() returns CameraInfo[] (spec, host.cpp worker encodes with the generated struct, sim.ts, index.ts, web/gphoto2.js); golden tests/golden/native_gen/zinc_native_gphoto2.h regenerated.
Proof: tests/run --only native_records PASS (interp, zinc build, --engine quickjs same 9 lines incl. promise from a worker and evolution Old/New both ways in engines and C++; esp32 refusal); native_gen, qjs_native, native_call, dyn_function, camera, web_hw PASS. native (t0) not run: build/native_test not built in this tree (registry untouched).
Measured (machine loaded by other builds, indicative): T.list(10000) of 8-field Track records incl. C++ encode: interp 20 ms, AOT 14.4 ms, QuickJS 12.5 ms; echo of 1000 (encode+decode): 5.8 / 4.5 / 1.8 ms.
later.md: Cross-platform pass: native records on the phone glue (Java ByteBuffer LE / Swift Data readers) and a check on a 32-bit ARM board; Native: generate a typed encoder per record instead of the JSON hop of __recEnc, and decode straight into the record class (one allocation per record).
<!-- SECTION:NOTES:END -->
