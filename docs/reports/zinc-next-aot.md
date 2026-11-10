# Zinc Next: AOT C++ output

`src/aot` emits the verified ZBC program as C++ over the shared runtime and
`zn::ops` semantics. The interpreter, AOT and QuickJS must keep the same visible
behaviour. Allocation, reference ownership and failures are not optional size
optimisations.

## Generated files and caching

A small program remains one standalone C++ file. A large native build writes its
entry unit, groups of function units, and one generated `zn-aot-*.hpp` containing
the common declarations. The first unit contains the tables, resource reference
and entry point. Every unit includes the header by its safe filename and records
its SHA-256 in its own contents. Changing declarations therefore invalidates all
cached objects; changing a function body can still reuse the other units.

`ZN_KEEP_CPP=1` retains the complete source set, including that header. Normal
builds remove it with the other generated sources, including compiler failures.
`ZN_AOT_CPP_ONLY=1` retains it for the exported project. Mobile and console
projects compile their units beside this header. Source-size accounting includes
**every C++ unit and generated header**.

The bytecode verifier invalidates a call window after the call. A compiled caller
copies its arguments into that window and copies only a successful, non-void
return back. Explicit RC operations own references; dead window slots are not GC
roots. Native array output parameters modify the existing array object, and
promise exports have no immediate return slot.

## Embedded bytes

`tableBytes()` serializes the metadata with a single Trap placeholder per compiled
function, without its code, constants or exception handlers. Worker tables keep
their existing separate representation.

Default native graphics builds can additionally compress their table bytes and
embedded fonts/images with the existing zstd codec, only when smaller. The
original size is compiled into the entry point. Decoding checks both the frame's
advertised size and the actual result against that size before using the bytes.
No external wire format changes. The existing resource installer copies the
unpacked data, so its temporary buffer ends immediately afterwards. The unpacked
table buffer remains alive through `runProgramPacked()`; this trades a small
private buffer for a smaller executable.

Packing is excluded for cross targets, stdout C++, `ZN_AOT_CPP_ONLY`, `.app`
bundles and `--no-embed`. Their existing raw tables/resource paths remain valid.
The codec header is part of the installed SDK (`tools/package` copies `src` headers),
and native graphics already links the codec and zstd archives.

Audited native plugins can declare `native.systemHost: "lite"`. SVG, Lottie and
video need no opaque access to the full system host; video still uses its native
decoder libraries. A program that calls network or pack-writing rows still selects
the full host, including rows in nested typed workers. Unknown plugins and
undecodable worker modules retain the conservative default.

## Focused checks

- `aot_native_args`: native callbacks/promises plus reference returns, void side
  effects, virtual calls, exceptions and explicit leak checks.
- `aot_declarations`: actual split programs, declaration changes invalidating
  every unit, retained exports and cleanup on success/failure.
- `aot_embedded_blob`: byte-for-byte resource/table roundtrips, tables-only
  metadata, truncated frames and incorrect original sizes.
- `aot_blob_routes`: native versus stdout, C++ export, bundle and external-resource
  emission; rejected compiler commands avoid unnecessary native compilations.

Hero's task notes hold the exact source/artifact hashes, complete byte totals and
bounded feature proofs. Build durations observed on the shared development Mac
are indicative; they are not quiet-machine performance rankings.
