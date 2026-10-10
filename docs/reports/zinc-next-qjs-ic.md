# Inline caches in the QuickJS interpreter (ZN-600)

After the no-go on compiling QuickJS bytecode to C (D55), D44 left inline caches in the interpreter as the next lever. The gate:

- at least 15% on two of the four workloads of `bench/qjs`, and no workload slower;
- run-once code pays nothing, thanks to a warm-up.

**Result: not adopted (D56).** The caches hit 89% to 99.9% of the time and the workloads do not move.

## What was measured

The patch is [zinc-next-qjs-ic.patch](zinc-next-qjs-ic.patch). It applies to `third_party/quickjs-ng` with `patch -p1` and builds with
`-DZN_QJS_IC`.

- **Sites.** `get_field`, `get_field2`, `put_field` and `get_var` get a per-function table of cache entries, keyed by the site's
  bytecode offset. A function gets its table after 32 calls or backward jumps, so run-once code pays nothing.
- **Own properties.** An own property is checked by its atom at the cached index. A shape only grows in place, and a deleted property
  loses its atom, so the check needs no reference.
- **Prototype properties.** A prototype property, up to three prototypes deep, also checks the path. The entry references the hashed
  shapes of the receiver and of the prototypes before the holder. A referenced hashed shape is cloned instead of changed in place
  (`add_property`, `js_shape_prepare_update`), so equal pointers mean the same properties and the same next prototype.
- **Globals.** `get_var` caches a lexical of `global_var_obj`, or a property of the global object while `global_var_obj` is
  unchanged.
- **Polymorphic sites.** A site refilled 16 times is left to the normal lookup.
- **GC.** The collector marks the referenced shapes, and freeing a function frees its table.

## Numbers

Intel Mac, interpreter with and without the caches, alternated, 3 runs. Ranges are the per-run ratios, each being time without the
caches divided by time with them, so above 1.00 means faster with the caches.

| Workload | Without (ms) | With (ms) | Ratio | Hits |
|---|---:|---:|---:|---:|
| three.js, 500 meshes | 7.32-7.60 | 7.48-7.63 | 0.98-1.00 | 89% of reads, 95% of writes |
| sprite, 10,000 sprites | 10.37-10.86 | 10.69-11.04 | 0.97-0.98 | 96%, 99.9% |
| objects, 2,000 entities | 1.21-1.36 | 1.20-1.28 | 1.01-1.06 | 99.9%, 99.7% |
| matter-js, 300 bodies | 9.61-10.19 | 9.65-10.07 | 0.98-1.02 | 97%, 92% |

The classic monomorphic variant was worse. In that variant, an own property of a referenced hashed shape hits on a single shape
pointer comparison: sprite 0.94-0.95, three.js 0.96-0.98, objects 0.97-1.02, matter-js 1.01-1.02.

Correctness holds: the test262 regexp subset (2,533 of 2,557, the same failures) and the QuickJS T1 programs are unchanged with the
caches on.

Memory: a warmed function holds about four 48-byte entries per site. That is 1.6 KB to 5 KB per function: 114 KB for the 61 warmed
functions of three.js, 370 KB for the 74 of matter-js.

## Why it does not pay

QuickJS already inlines a cheap lookup in the interpreter loop: `find_own_property` hashes the atom into the shape's own table and
follows a short chain, a few loads. A cache check costs about as much. It computes the slot, compares the site, compares the shape
or the atom at the index, and reads the value. The interpreter's time is in the dispatch, the operand stack and the reference counts
(`docs/reports/zinc-next-qjs2c.md`). The larger `JS_CallInternal` costs a few percent of its own, which is why the variant with fewer
checks is the slower one. Upstream reached the same result twice:

- inline caches merged in 2023 were removed in February 2025, at 1.037x on average on web-tooling;
- a monomorphic read cache was closed in May 2026 for flat results.

So the patch is not proposed upstream. The web-tooling benchmark was not run: a change that does not speed up the hot loops it targets
cannot pass that gate.

## What carries QuickJS speed instead

Native accelerators of library hot spots. three.js's `multiplyMatrices` takes 23% of samples, and one native version cut the frame by
24% in the report.

The arm64 machines differ in branch prediction and caches. The criterion named the M1 Pro, so ZN-600.01 remeasures this patch there,
in the cross-platform pass.
