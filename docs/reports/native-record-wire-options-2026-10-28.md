# Native record wire: prior art and recommendation (2026-10-28)

Scope: how a plugin's native side hands records (objects, arrays of objects) to Zinc's engines (interpreter, AOT C++, QuickJS/Node-API), plus Android JNI and iOS bridges. Note: written from established knowledge of these designs; the URLs are the canonical specs, not re-fetched in this session. Verify any detail before quoting it in a decision record.

## Constraints that decide the answer

1. Data is produced off-thread with malloc only, then consumed once on the event loop. It is a one-shot "result", not a long-lived shared structure.
2. Every consumer ends up with engine objects (interpreter heap, AOT structs, JS objects). A zero-copy view only helps if the consumer keeps reading the buffer. Zinc's consumer wants real objects, so object creation dominates, not parsing.
3. Android JNI and iOS ObjC/Swift must read the same contract; both are happiest with a plain byte buffer (`byte[]`/`NSData`), and bad with a custom object graph.
4. Small code on embedded targets: no runtime schema compiler, no reflection.
5. Plugin and engine ship separately (signed plugin index), so version skew is real.

## Prior art

| System | Layout | Zero-copy | Evolution | Verdict for Zinc |
|---|---|---|---|---|
| FlatBuffers (https://flatbuffers.dev/internals/) | vtable per table, offsets, aligned, builder builds back to front | yes, lazy accessors | add fields at the end, deprecate; vtable gives optional/default for free | Lazy views are wasted: we copy into objects anyway. Builder is heavy and needs a `flatc`. Borrow: per-record "length known, missing = default" idea. Do not adopt. |
| Cap'n Proto (https://capnproto.org/encoding.html) | 64-bit aligned words, pointers, struct data/pointer sections sized in the pointer | yes | struct size in pointer: old reader ignores extra, new reader sees zeros for missing | Best evolution model: "a record carries its own size; missing means zero". Borrow exactly that. Pointers/segments are too heavy. |
| Bebop (https://docs.bebop.sh/) | fixed-width LE, no keys, u32 length prefix for strings/arrays, message type has u32 length + tagged fields | no (eager) | structs frozen, `message` types tagged (1-byte tag, end marker 0) | Closest in spirit to the plan (LE, no padding, length-prefixed). Its `message` tagging is stronger than needed. Borrow: LE, no alignment, u32 lengths. |
| Karmem (https://github.com/inkeliz/karmem) | fixed-size root plus offset to variable data, LE, aligned | yes | append-only via a size header per struct | Designed for Go/Wasm host boundaries; confirms "size header per record" is enough for append-only evolution. Not worth adopting. |
| SBE (https://github.com/real-logic/simple-binary-encoding) | fixed block per message, `blockLength` in header, groups with `numInGroup`, var-data at end | yes | `blockLength` + `sinceVersion` per field: old readers skip, new readers default | Same trick (`blockLength`) as the plan; proven in finance. Borrow: group header = (blockLength, count), so a list of records costs one header, not one per record. |
| Protobuf wire (https://protobuf.dev/programming-guides/encoding/) | varint tag + value, keys on wire | no | best-in-class (unknown fields skipped by tag) | Tag per field and varints cost decode time and code per field; we do not need unknown-field forwarding. Reject. |
| MessagePack / CBOR (https://msgpack.org/ , RFC 8949) | self-describing, keyed maps | no | schema-less | Keys repeated per record, dynamic typing; bad for typed subset. Fine only as a debug dump. Reject. |
| Wasm Component Model canonical ABI (https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md) | records are flattened to scalars, or in memory aligned with natural alignment; string = (ptr, len) in UTF-8/16; list = (ptr, len); `option` = discriminant byte + payload; `realloc` provided by callee side | copy in/out | none (types must match exactly; versioned by interface name) | Right model for "lift/lower": host reads the guest's memory and builds its own values in one pass. Borrow: option = 1 tag byte + payload, strings = len + UTF-8, list = count + elements. Do not borrow alignment (its cost is padding and per-field alignment math). |
| UniFFI (https://mozilla.github.io/uniffi-rs/latest/internals/lifting_and_lowering.html) | records/lists/strings serialized into a `RustBuffer` (ptr, len, cap) as big-endian, length-prefixed, option = 1 byte + value, no keys; scalars cross as plain args | no (copy) | none on wire; generated code on both sides must match, checked by a per-function checksum at load time | Very close to the plan, and the bindings run on Kotlin (JNA), Swift and Python with the same bytes. Borrow: checksum/contract-version check at load time, and the "records are just a buffer through a bytes arg" approach. Differences: UniFFI is big-endian; we choose LE (all our targets are LE). |
| napi-rs / node-addon-api (https://napi.rs/ , https://github.com/nodejs/node-addon-api) | one `napi_create_object` + `napi_set_named_property` per field | n/a | n/a | Per-field boundary crossing is the slow path (known cost: each property set is an API call). Reason to decode in one native call building the whole graph, not one call per field from script. |
| React Native JSI / TurboModules codegen (https://reactnative.dev/docs/the-new-architecture/pillars-turbomodules , https://github.com/facebook/react-native/tree/main/packages/react-native-codegen) | Flow/TS spec -> C++ header + ObjC/Java glue; records become `jsi::Object` built with `setProperty` per field; JNI converts via `ReadableMap`/`WritableMap` | no | none; app and native ship together | This is the Zinc `Spec` model already. Lesson: the per-field copy through JNI maps is the known cost on Android; a single `byte[]` avoids it. |
| Hermes (https://github.com/facebook/hermes) | hidden classes for objects of same shape, objects created via literal-shape cache | n/a | n/a | Lesson for JS decoding: create all records of one list with the same property order so engines reuse one shape. QuickJS has shapes too (same effect with identical add-order). |
| Flutter dart:ffi + ffigen (https://dart.dev/interop/c-interop), Pigeon (https://pub.dev/packages/pigeon) | ffigen: C structs as views over native memory. Pigeon: `StandardMessageCodec`, type byte + length-prefixed, aligned numerics, generated codec per platform (Kotlin/Swift/ObjC) | views for ffi; copy for Pigeon | Pigeon: positional list, append-only by convention; a mismatch is a runtime error | Pigeon proves the generate-both-sides-from-one-spec approach works for JNI/ObjC at scale. Its alignment padding in the codec is a known annoyance. Borrow: generated reader and writer per platform from the same spec. |
| Swift-Java / JNI bridges (https://github.com/swiftlang/swift-java) | per-call JNI field access, or `ByteBuffer` for bulk | direct ByteBuffer is zero-copy | n/a | `ByteBuffer.order(LITTLE_ENDIAN)` over a `byte[]` is trivial on Android; `Data` + `loadUnaligned` on Swift. Fine without alignment. |

## What matters most (criteria)

- Decode cost: in all consumers it is dominated by creating objects and strings, not by reading ints. Lazy views (FlatBuffers/Cap'n Proto) win only if the script reads a fraction of the fields; here the plugin result is consumed whole. So prefer the simplest eager decoder.
- Alignment: costs padding bytes and generator logic. LE unaligned reads are free on arm64/x86 and fine on the other targets with `memcpy` loads. Skip alignment. (Cortex-M and ESP32 core: use `memcpy` for loads; compilers fold it.)
- Varint: saves bytes only for small ints, costs a branchy loop per field in an interpreter. Use fixed widths, except one place (see below).
- Strings: UTF-8, u32 length + bytes, no terminator. QuickJS takes UTF-8 directly (`JS_NewStringLen`); the interpreter's strings are presumably UTF-8; JNI needs a `new String(bytes, UTF_8)`; Swift `String(decoding:as:)`. Everything else (UTF-16, Modified UTF-8) is worse.
- Optional: one presence byte (0/1) followed by the payload only when 1. Avoids bitmaps whose size depends on the field count and that must be extended when fields are appended.
- Nested lists: u32 count + elements, each element a record with its own byte length (below). List of scalars: count + packed values (can be a typed-array view).
- Versioning: separate two questions. (a) Additive evolution of a record: handled by the per-record length. (b) Detecting an incompatible plugin/engine pair (field renamed, retyped, reordered, removed): needs a schema hash.

## Recommendation

Adopt none outright. Take the plan as written, with UniFFI's transport shape, SBE/Cap'n Proto's "size in the header, missing = default" evolution, the Component Model's option/list/string layouts, and a UniFFI-style checksum.

### Wire layout

- Little-endian, no alignment, no padding. Fixed widths: `bool` u8 (0/1), `i8..i64`, `u8..u64`, `f32`, `f64` as declared in the spec (default `number` = f64, `int` = i32).
- Field order: declaration order. No keys, no tags.
- Record: `u32 byteLen` (bytes after this prefix) then the fields. A reader reads known fields, then jumps to `start + byteLen`. If the buffer ends before a known field (`pos + width > end`), that field and all after it take their default (0, false, "", empty list, null). Rule: fields may only be appended at the end of a record, and never retyped. Nested record fields are records with their own `byteLen`, so appended fields work at every level.
- Why u32 and not a varint for `byteLen`: constant 4 bytes lets the writer reserve and backpatch (`memcpy` a u32 at the end), one load for the reader. Varints would force a length pre-pass or a shift. Cost: 4 bytes per record; acceptable (a track with a title is 100+ bytes). If a plugin ever returns million-element lists of tiny records, offer a `packed` struct (no prefix, frozen) as an opt-in. Do not build it now.
- String: `u32 len` + UTF-8 bytes. No NUL. Null string is not allowed; use `string | null`.
- Optional/nullable (`T | null`, `x?: T`): `u8 present` then the payload if 1. Appended fields that are scalars are not optional by default: missing -> zero value.
- List `T[]`: `u32 count` then elements back to back (scalars packed; records each with their `byteLen`). No total-bytes prefix on lists: the element prefixes already allow skipping, and it makes writers simpler. If a skippable list is needed (field added to a record is after a list), the record's `byteLen` already covers it.
- Enums: `u8`/`u16` by declaration, unknown value is delivered as is (reader of an old engine maps to the first member or number).
- Maps and unions: not supported in v1 (use arrays of records, or a tag field plus optional fields).
- Top level: the call returns/delivers one value encoded the same way (a record, or `T[]` with `u32 count` first). A top-level buffer is `u8[]` on the existing letter. No envelope header, apart from the hash below.

### Schema hash (versioning detection)

- Generator computes a 32-bit FNV-1a (or first 4 bytes of SHA-256 if one is already vendored) over a canonical string of each record: `Name{field:type,...}` in declaration order. This captures renames-as-breaks, retypes, reorders; appended fields change the hash too, so split two values:
  - `abi hash` over the field-prefix known to the plugin: used by the engine to check that the engine's spec is a prefix-compatible extension of the plugin's (the plugin build records the hash of its own spec; the engine compares at plugin load using the spec in the plugin manifest, as UniFFI compares function checksums).
  - Simplest workable v1: store in `plugin.json` the full hash and a `specVersion` integer bumped on any additive change. Engine rule: same hash = fine; different hash but same record layout prefix (checked by comparing the canonical strings by prefix per record, which the engine has because the plugin ships its generated spec) = fine; otherwise refuse to load with a clear error naming the record and field. No hash on the data buffer itself.
- Put the hash in the signature letters module-wide (one per plugin, one load-time check), not per call. A per-call hash costs bytes and a compare on the hot path for no benefit once the load-time check passed.

### Writer (plugin side)

- Generated C++ `struct Writer { uint8_t* p; size_t n, cap; }` growing with `realloc`; `put_u32`, `put_str`, `begin_record()` returns the offset of the length slot, `end_record(off)` backpatches. Pure malloc, no engine types: usable on a worker. Hand the finished `{ptr,len}` over on the event loop; the engine copies/decodes and frees with the plugin's `free` (or via a release callback in the existing u8[] ownership contract).
- Generated typed structs (`Track`) plus `encode(const std::vector<Track>&)` for C++; Kotlin and Swift get a generated writer with `ByteBuffer`/`Data` on the same layout if plugins on those platforms produce records. Reading records on the plugin side (arguments from script to native): same layout, generated reader; start with native -> script only, add the reverse when a plugin needs it (YAGNI).

### Decoder (engine side)

- Decide per engine; do not share a JS decoder:
  - Interpreter and AOT: a generated (or table-driven) C++ decoder that builds the engine's record values in one pass. AOT can emit straight-line code per record; the interpreter can walk a compact field-kind table (one byte per field). No DataView involved.
  - QuickJS: one native call, `decode(spec, buf)` building the object graph with `JS_NewObject` + `JS_DefinePropertyValue` using atoms cached once per record type, fields in the same order every time so QuickJS reuses one shape. Do not expose a JS DataView decoder: per-field calls to DataView getters from script cost an interpreter dispatch plus a bounds check each, plus string slicing through `TextDecoder`; a single native call was the lesson from napi-rs/JSI (per-property boundary crossing is the cost).
  - Exception: for `number[]`/`i32[]` lists, keep the existing typed-array path (zero-copy view or one memcpy), not per-element objects.
- Lazy views: skip in v1. Add later only for very large lists consumed partially (e.g. a 100k-row table), as a `ReadonlyArray`-like proxy; the layout permits it only by scanning record lengths (O(1) per record skip), which is another reason for the per-record length.
- Android/iOS: JNI gets `byte[]`, wrap with `ByteBuffer.order(LITTLE_ENDIAN)`; Swift reads from `Data`/`UnsafeRawBufferPointer` with `loadUnaligned`. A generated reader per platform from the same spec, or just hand them the bytes if the plugin only produces records (the engine decodes).

### What not to do

- No FlatBuffers/Cap'n Proto dependency: build tools plus a lazy-view model we would immediately defeat.
- No varints or tags: more decode work than the size they save.
- No per-field engine API calls from plugin code.
- No self-describing format on the hot path (MessagePack/CBOR); keep a text dump for debugging only.

## Open points to check in the code before building

- Who frees the buffer on each engine path (add a `release` convention next to the existing u8[] ownership).
- Whether the interpreter's string type is UTF-8 and whether its records are shape-based or slot arrays (decides the table-driven decoder's output).
- Whether Node-API (not QuickJS-native) is the real QuickJS entry point here: if the same decoder must be exposed through Node-API, `napi_create_object` + `napi_define_properties` batch (one call for all fields of a record) is the best available; measure against the plan's cost model.
