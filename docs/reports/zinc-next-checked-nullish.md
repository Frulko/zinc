# Checked nullish conversion

Checked copies out of dynamic values validate their target type before erasing a nullish tag into typed storage. A pure `T | undefined` admits the dynamic undefined tag; `T | null` admits the null tag. Wrong tags reach the existing primitive, array or object conversion and throw `TypeError`.

The frontend retains `bothNullish` as type metadata when a declaration admits both, including an optional nullable field, an alias and `Partial` of a nullable record. The type interning key includes it and union construction carries it. This changes admission only: the established static representation and its `undef` printing flavour remain unchanged. Optional dynamic/unknown values keep their existing distinction because their non-sentinel value remains a Dyn.

QuickJS checked-copy schemas use `~T` for undefined, `?T` for null and nested `~?T` for both. These markers are only for the checked JSON-copy schema. Native record wire schemas remain unchanged; a focused native assertion compares the old and new schema bytes. The existing QuickJS transform still covers JSON.parse declarations and assertions whose schemas can be resolved; unsupported schemas and other dynamic conversion sites are not migrated by this repair.

The exact `checked_nullish` T0 covers primitive, record, array, nested-list rejection, explicit zero/false/empty values, optional unknown, direct and aliased optional-nullable fields and Partial. It executes actual interpreter, AOT and QuickJS paths, and rejects native fallback to interpretation. Shared `try_flow` remains green.

An actual iPod production decoder probe revealed another pre-existing boundary: QuickJS schema collection follows relative imports only and cannot resolve `ipod.SmartRules` from `zinc:ipod`. It therefore leaves the whole playlist JSON copy unchecked, including required identity fields. No app workaround is added and the production all-three criterion remains open until the schema-resolution engine gap is repaired.

References: [strictNullChecks](https://www.typescriptlang.org/tsconfig/strictNullChecks.html), [JSON.parse](https://tc39.es/ecma262/multipage/structured-data.html#sec-json.parse), D18 (shared static storage), D179 (checked copies), D231 (optional Dyn distinction).

A follow-up keeps standalone `undefined` aliases in union annotations precise: the checker follows a non-generic alias in its declaration scope before the fixed null type erases its flavour. Checked QuickJS schemas follow the same alias only in checked mode; native wire support/output stays unchanged. The exact regression proves missing acceptance and null rejection on all three engines.
