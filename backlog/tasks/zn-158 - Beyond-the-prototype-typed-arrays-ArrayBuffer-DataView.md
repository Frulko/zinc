---
id: ZN-158
title: 'Beyond the prototype: typed arrays, ArrayBuffer, DataView'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-06 23:05'
updated_date: '2026-11-08 19:46'
labels:
  - language
  - size-M
milestone: m-7
dependencies:
  - ZN-155
ordinal: 1900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Uint8/16/32, Int8/16/32, Float32/64, BigInt64 arrays, ArrayBuffer (transfer, slice), DataView, TypedArray.from/of/set/subarray/fill/sort, backed by runtime byte arrays so u8[] and the web APIs share storage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fixtures equal Node's output; the web globals use them for Blob, TextEncoder and fetch bodies
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Handover (2026-11-08, worker after ZN-1003): not started in code; too big for the rest of this session. Found and decided:

State today: the interpreter and AOT have no typed arrays at all (lib/std/web.ts line 7: bytes are u8[]; fetch.ts/web.ts 'no ArrayBuffer in Zinc'); zinc:gl defines its own Int8Array..Float32Array (GLArray over number[], lib/std/gl.ts) that must move onto the global ones; QuickJS has them natively (strip.cpp runs the source as JS, no checker in between). There is no bit reinterpretation op and no element access on a class (the checker's N::Index takes arrays, tuples and strings only).

Design (reversible, pick it up from here):
1. Storage: ArrayBuffer holds bytes: u8[] (the runtime byte array, so a u8[] of the web APIs is shared without copy through an internal wrap); views keep buffer, byteOffset, length. transfer() moves the u8[] and detaches (byteLength 0, views length 0); slice() copies.
2. Kinds as classes of a Zinc prelude in src/frontend/modules.cpp, injected like kArenaPrelude when a program names one of them: Uint8/Int8/Uint8Clamped read bytes directly; 16/32-bit integers compose little-endian with shifts; Float32/Float64 through four pure ops added to include/zn/ops.h + opcodes.h (F32Bits, F32FromBits, F64BitsHi/Lo, F64FromBits), builtins in include/zn/builtins.h mapped in src/zbc/emit.cpp (the X-macros give the VM and AOT the same code). DataView: get/set Int8..Float64, big-endian by default (littleEndian flag).
3. Checker: ta[i], ta[i] = v, compound and ++ on a class that declares __at(i)/__setAt(i, v) are rewritten into calls (N::Index and the assignment paths); for-of through [Symbol.iterator]; console.log prints 'Uint8Array(3) [ 1, 2, 3 ]' and ArrayBuffer as Node does.
4. Methods: from, of, set (overlap copies the source first), subarray (shares), slice (copies), fill, sort (numeric, -0 before +0, NaN last), indexOf, includes, join, forEach, map, reduce, length/byteLength/byteOffset/buffer.
5. BigInt64Array/BigUint64Array: not offered (Zinc has no bigint, Z0005); the diagnostic names Float64Array or i64[]. Decision to record by the coordinator.
6. Web globals: TextEncoder.encode, Blob.bytes/arrayBuffer, Response.bytes/arrayBuffer return views over their u8[]; update web.ts header, docs/guide/09-web-apis.md, and zinc:gl's GLArray.
Research (quickjs-ng JSArrayBuffer: byte_length, max_byte_length, detached, shared, data, array_list of views; JSTypedArray: buffer, offset, length, track_rab; https://github.com/quickjs-ng/quickjs/blob/master/quickjs.c, https://tc39.es/ecma262/#sec-arraybuffer-objects, https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Resizable_buffers). Node gotchas for the fixture: Float32Array([0.1])[0] is 0.10000000149011612, Uint8Array stores 256 as 0, Uint8ClampedArray rounds half to even, a byteOffset must be a multiple of the element size (RangeError).
Next command: write tests/golden/lang/typed_arrays.ts and its Node output (node --no-warnings), then step 2.
<!-- SECTION:NOTES:END -->
