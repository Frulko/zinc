# @nbe/core and @nbe/markdown on the Zinc compiler

2026-10-21. This report measures what the typed Zinc engine (not `--engine quickjs`) lacks to compile, unchanged, `notion-block-editor/packages/core/src` and `packages/markdown/src`. These two packages hold 6,299 lines across 30 files. The notion-block-editor repository was not modified.

## Method

- Binary: `build/zinc`, `zinc-next 0.4.0+7.g7157543e`, at HEAD `3f230aed`. It was rebuilt at 11:48 from a tree that holds another session's uncommitted frontend work (`parser.cpp`, `check.cpp`, `desugar.cpp`, `jsx.cpp`, `ast.h`). The early rounds ran on the previous binary. Every repro below was checked again on the current one.
- Copies: `$S/carnet-gaps/{orig,core,markdown}`, where `$S` is the session scratchpad. `orig/` is pristine. `core/` and `markdown/` hold the workarounds, each marked `// GAP` (215 markers).
- `@nbe/core`: mapped through tsconfig `paths` in `carnet-gaps/tsconfig.json` (`"@nbe/core": ["core/index.ts"]`). Zinc honours `paths`, so no import was rewritten.
- Loop: `zinc check entry.ts`. Each error was recorded, reduced to a repro in `carnet-gaps/repro/`, and worked around in the copy.
  - 145 of the 401 errors in round 3 were mechanical: 70 truthiness and 75 `!` for out-of-range reads. `autofix.py` handled those.
- Counts are grep counts over the original sources, so they are approximate (±10%).

## Result

- `zinc check` passes on the worked-around copy. One exception: `formula.ts`, 900 lines, is stubbed with the same exported API. On its own it needs recursive aliases, a `Record<string, Fn>` table of closures and forward references between parse closures. With those workarounds applied it still reported 84 errors.
- `smoke.ts` does the following:
  1. Creates an `Editor` and inserts a paragraph.
  2. Types "Hello" and " world", bolds 0–5, splits the block and types "Second line".
  3. Round-trips through `docToJSON` → `blocksToMarkdown` → `markdownToBlocks`.
  4. Runs undo ×2, redo and `mergeBackward`.
- Inside `smoke.ts`, two vitest files were hand-translated: `core/test/richtext.test.ts` (6 cases) and `core/test/ops.test.ts` (the round trips plus the throw on deleting a non-leaf).
- The output is byte-identical to node/tsx on the original sources, both on the interpreter and as an AOT executable (`zinc build smoke.ts`, 12.5 s). Key lines:
  - `markdown: "**Hello** world\n\nSecond line"`
  - `parsed back: paragraph:**Hello** world | paragraph:Second line`
  - every richtext and ops check prints `ok`.
- The unchanged copy stops on its first level:
  - 4 circular imports: `migrate.ts:3`, `commands.ts:8`, `commands.ts:9` and `plugin.ts:4`.
  - The generic method `get<T>` at `markdown/frontmatter.ts:204`.

So the runtime and AOT are sound for this code. Almost every gap is in the frontend (checker, inference, narrowing, typings).

## Gaps

"Ban" means the guide forbids the construct on purpose. "Missing" means no document justifies the refusal. Sizes are S (under a day), M (a few days) and L (a week or more). File references are under `src/frontend/` unless a path is given.

### Parser and modules

| Gap | Count | Repro | Where to fix | Size | Kind |
|---|---|---|---|---|---|
| Method named `get<T>(...)` parsed as a getter | 1 | `class A { get<T>(k: string): T \| null { return null } }` | `parser.cpp` `classDecl` (~892): `get`/`set` followed by `<` or `(` is a method name | S | missing |
| `export type { X } from './m'` | 1 | `export type { Block } from './types'` | `parser.cpp` `exportDecl`: fixed by the uncommitted work in the main tree | S | missing (fixed) |
| Indexed access types `T['k']` | 3 | `type K = Block['type']` | now parsed (`parser.cpp` ~303 → TypeOther); `check.cpp` `annotation()` says "Syntax not supported yet: indexed access types". Resolve against the record or interface field | S–M | missing |
| Index signatures `{ [k: string]: V }` | 2 | `interface M { [k: string]: number }` | `check.cpp` `annotation()`: map to the Record dictionary type (below) | S | missing |
| Import cycles through `import type` | 5 edges | `a.ts: import type {B} from './b'`; `b.ts: import {A} from './a'` | `modules.cpp` Loader `visiting` (~1681, 1709, 1756): a type-only edge should not count as a cycle; then support value cycles of declarations, as TS/ESM do | M | missing |
| `export *` plus a named re-export of the same name, reported as duplicate | 2 | `export * from './a'; export { x } from './a'` | `check.cpp` duplicate export (~4674): same binding, same origin = no error | S | missing |
| Error location points into generated code | 1 seen | `plugin.normalize?.(doc, tx)` with `tx: any` reports `editor.ts:16:12` | `desugar.cpp`/`check.cpp`: carry the caller's span onto synthesized nodes | S | missing |

### Type system

| Gap | Count | Repro | Where to fix | Size | Kind |
|---|---|---|---|---|---|
| `Record<K, V>` | 37 | `const m: Record<string, number> = {}; m['a'] = 1` | `check.cpp` `annotation()` (~459–560): lower to a string-keyed dictionary (Map-backed) with `obj[k]` get/set and `Object.keys/entries` | M | missing |
| `Partial`, `Readonly`, `ReadonlySet`, `IterableIterator` | 1+1+1+1 | `function f(p: Partial<Opts>) {}` | `annotation()`: `Partial` = all fields optional; `Readonly*` = alias of the mutable type | S | missing |
| `this` as a return type (`): this`) | 7 | `class B { add(): this { return this } }` | `annotation()` plus `ir/lower.cpp` ~203 "this type in the IR": treat as the enclosing class type | S | missing |
| Recursive type aliases | 2 (FormulaValue, Expr) | `type V = number \| string \| V[]` | `check.cpp` `resolveAlias`/`instantiateAlias` (~3872–3884) "refers to itself": needs a named (nominal) node for the alias | L | missing |
| Discriminated unions of interfaces | ~20 uses (`Selection`) | `interface A {kind:'a'; x:number}`, `interface B {kind:'b'}`, then `if (s.kind === 'a') s.x` | `check.cpp` `narrowByLiteral` (~3177): `hasLiteral` is not set on interface members (~4304). Only inline record unions narrow | S–M | missing |
| Object literal for an interface that has method signatures | 5 interfaces | `interface S { get(id: string): T \| null }`, then `const s: S = { get(id) { return null } }` | `objectLit` (~3669), `objAssignable` (~201): treat a method signature as a function-typed field | M | missing |
| Class assignable to a structural interface | 1 (`BlockStore` ← `Map`) | `interface Store { get(k: string): B \| undefined }`, then `const s: Store = new Map()` | `assignable` (~218): structural check of class members against an interface | M | missing |
| Generic instance methods | 2 | `class C { get<T>(k: string): T \| null { ... } }` | `check.cpp` ~4491: monomorphize per call site as for free functions | M–L | missing |
| Optional `any`/Dyn fields and params | ~10 | `function f(a?: any) { return () => a }` and `{ attrs?: any }` with `attrs` omitted | `ir/lower.cpp` ~1442/~2473 "uses a missing value" (internal error): the default for an omitted Dyn is not materialized | S–M | missing (bug) |
| The `undefined` type name in files that use `any`/`unknown` | 8 | `let x: string \| undefined` in a file with `: unknown` | `modules.cpp` ~3323 rewrites `undefined`→`null` only in files without Dyn. `annotation()` should accept it everywhere | S | missing |

### Inference

| Gap | Count | Repro | Where to fix | Size | Kind |
|---|---|---|---|---|---|
| Recursive `const` arrow with no return type | 8 | `const walk = (b: B) => { b.kids.forEach(walk) }` | `varDecl` (~2575) / `resolvePending` (~3017): infer from the non-recursive returns, or `void` | S | missing |
| Forward reference between local `const` arrows | 2 (+ all of formula.ts) | `const a = () => b(); const b = () => 1` | `usedBeforeDeclaration` (~203): allow it inside a function body that runs later | S | missing |
| Callback returning an object literal, not typed from context | 12 | `const xs: P[] = ys.map(y => ({ id: y }))` | `arrayHof` (~1067) / `funcExpr` (~3324): push the expected element type into the arrow's return | M | missing |
| Object-literal method params from context | 3 | `const s: S = { get(id) { ... } }` (id: Dyn) | `objectLit`: take the param types from the expected interface | S | missing |
| `new Map(iterable)`, `new Set(iterable)` | 7 + 9 | `new Map(pairs)`, `new Set(arr)` | `newCollection` (~1369–1384): constructor args and type-argument inference | S–M | missing |
| Empty `[]` with no annotation | ~6 | `let out = []; out.push(x)` | `check.cpp` ~1994: infer from the first use, or from the declared target | S | missing |
| Heterogeneous array literals | ~5 | `[{text:'a'}, {text:'b', marks:['bold']}]` as `Run[]` | best common type in `arrayLit`: use the contextual type | S | missing |
| Conditional spread | 5 | `{ ...base, ...(c ? { a: 1 } : {}) }` | `objectLit` (~3564 "spread of a non-object"): spread of a union of records = optional fields | M | missing |

### Narrowing and truthiness

| Gap | Count | Repro | Where to fix | Size | Kind |
|---|---|---|---|---|---|
| Truthiness of a non-null `string`/`number`/object/Dyn | ~70 | `if (s) ...`, `if (!arr.length) ...`, `if (dyn) ...` | `truthiness()` (~2434), `condition()` (~2461): JS truthiness for every type | M | missing |
| `a && b` / `a \|\| b` returning a value of non-boolean operands | ~15 | `const t = s \|\| 'default'`, `x && x.y` | `binaryExpr` (~674): the result type is the union of the operands | M | missing |
| Narrowing of a `const` captured by a closure | ~25 | `const b = get(); if (!b) return; xs.map(x => b.id)` | `markNested`/`isNestedFunction` (~3312): a `const` keeps its narrowed type in closures | S | missing |
| Assignment in a condition | 8 | `while ((m = re.exec(s)) !== null) m[1]` | `factsOf` (~3187): narrow the assigned variable | S | missing |
| `x?.f === y` narrows `x` | 10 | `if (last?.kind === 'text') last.text` | `factsOf`: an optional chain compared to a non-undefined value implies non-null | S | missing |
| `typeof` on a union of primitives | 15 | `(v: string \| number) => typeof v === 'string' ? v.length : v` | `factsOf` / `narrowByInstanceOf` (~3165): add a `typeof` fact | M | missing |
| `Array.isArray` on `unknown` | 18 | `if (Array.isArray(v)) v.length` | `factsOf`: narrow Dyn to Dyn array | S | missing |
| Optional function field | 4 | `if (p.normalize) p.normalize(doc)` | `factsOf` for a member path | S | missing |
| Exhaustive `switch` on a property path | 3 | `switch (f.op) { case 'eq': return ..; case 'ne': return .. }` with no default | `terminates` (~2398), missing return (~3069/3449) | S | missing |
| `??` or `?.` on an array element (`noUncheckedIndexedAccess`) | 15 + 4 | `const x = arr[i] ?? def`, `arr[i]?.id` | `binaryExpr` (~701) rejects `??` on a non-null element. Same root cause as the runtime row "out-of-range read" | M | design question |
| User type guard plus `in` on a generic union | 1 | `byPrecedence<T>` in `markdown/index.ts` | `narrowByInstanceOf` | M | missing |

### Standard library and typings

| Gap | Count | Repro | Where to fix | Size | Kind |
|---|---|---|---|---|---|
| `Object.keys/entries/fromEntries/assign` | 17 | `Object.entries(rec)` | `libraryCall` (~1421), on top of the Record dictionary | S (after Record) | missing |
| `?.method()` and `?.[i]` on a nullable array or string | 7 + 7 | `xs?.map(f)`, `m?.[1]` | `optionalCall` (~1590), member at ~2255–2262 | S | missing |
| `sort()` with no comparator | 3 | `keys.sort()` | `arrayHof`/`libraryCall`: default string compare | S | missing |
| `flatMap` | 5 | `xs.flatMap(x => x.kids)` | `arrayHof` (~1067) | S | missing |
| `splice(i, 0, x)` insert, `unshift(...xs)`, `push(a, b)` | 2 + 2 + 1 | `a.splice(i, 0, x)` | `libraryCall` | S | missing |
| `Array.from(x, fn)`, `filter(Boolean)` | 2 + 1 | `Array.from(set, f)` | `libraryCall`, `arrayHof` | S | missing |
| `n.toString(16)` | 1 | `(255).toString(16)` | `libraryCall` | S | missing |
| `String(x)` / `Number(x)` of a union or Dyn | 28 / 7 | `String(v)` where `v: string \| number` | ~1454 | S | missing |
| `RegExpExecArray` type and `.index` | 7 | `const m: RegExpExecArray \| null = re.exec(s); m.index` | `annotation()` plus the regex builtin | S | missing |
| `RegExp` type name when no regex literal is present | 1 | `function f(r: RegExp) {}` | name registration | S | missing |
| `Intl.Segmenter` (graphemes) | 5 | `new Intl.Segmenter(undefined, {granularity:'grapheme'})` | runtime builtin over libunibreak, which is already vendored | M | missing |
| `Uint8Array` + `crypto.getRandomValues`, `structuredClone`, `Symbol()` | 1 + 1 + 1 | `crypto.getRandomValues(new Uint8Array(16))` | `structuredClone` is mapped to zinc:web (`modules.cpp` ~1237) but is not available to native programs | S each | missing |
| Indexing an object literal by a string key | 1 | `({a:1,b:2})[k]` | Record dictionary | S | missing |

### Runtime semantics

| Gap | Count | Repro | Where to fix | Size | Kind |
|---|---|---|---|---|---|
| Out-of-range array read panics instead of yielding `undefined` | many sites, critical | `const last = undo[undo.length - 1]` on an empty stack (editor, first dispatch) | IR array get (`ir/lower.cpp`): `T \| undefined` on reads typed by `noUncheckedIndexedAccess`, or `arr.at()` | M | design question |
| `Math.random` gives the same sequence on every run | 1 (uuidv7) | `console.log(Math.random())` twice | seed from the OS outside `ZINC_DETERMINISTIC` | S | missing (bug) |
| `JSON.stringify` writes `null` for an undefined field (Dyn files) | 2 | `JSON.stringify({a: undefined})` → `{"a":null}` | `undefined`→`null` rewrite (`modules.cpp` ~3323) | M | missing |
| `"x" + undefined` gives `"xnull"` | 1 | same | same root cause | M | missing |
| `delete obj.k` | 3 | `delete rec[k]` | Z1007 | – | **ban**: "`delete` on a typed field (Z1007)". With Record as a dictionary, `delete rec[k]` would be `Map.delete` |
| `k in obj` | 4 | `if ('x' in o)` | Z9026 (`binaryExpr` ~678) | – | **ban**: "`in` (Z9026 — use `Map.has`)". The guide's way out works only after Record exists |

Both bans quote the "forbidden JS" table of `docs/guide/02-language.md`. No other refusal met here is justified by a document.

## Plan, in order

Each step names what it unblocks. Steps 1–6 make both packages pass `zinc check` without edits, except formula.ts. Steps 7–8 make the smoke script run unchanged.

1. **Modules**: type-only import edges are not cycles, plus value cycles of declarations. Also `export *` with a named duplicate. M. Unblocks the first-level errors.
2. **Record as a typed dictionary**: index signatures, `Object.keys/entries/fromEntries/assign`, and `delete rec[k]` / `k in rec` on dictionaries only. M. 60+ sites.
3. **JS truthiness and `&&`/`||` values** for every type. M. About 85 sites, the largest single family.
4. **Narrowing**: captured `const`, interface discriminants (`hasLiteral`), assignment in condition, `x?.f === y`, `typeof`, `Array.isArray`, optional function fields, exhaustive switch on a path. S–M each, 100+ sites in total.
5. **Contextual typing**: arrow returns, object-literal methods, interfaces with method signatures, class-to-interface assignability, `[]`, heterogeneous literals, conditional spread. M.
6. **Small typings**: Partial/Readonly/`this`, `undefined` everywhere, indexed access, `get<T>`, Map/Set constructors, sort, flatMap, splice, unshift, push, `Array.from`, `filter(Boolean)`, `toString(16)`, String/Number of unions, `RegExpExecArray.index`, `?.` calls. S each, one batch.
7. **Lowering bugs**: optional Dyn fields and params (internal errors), and error spans in generated code. S–M.
8. **Out-of-range reads**: yield `undefined` (the `noUncheckedIndexedAccess` model), which also makes `arr[i] ?? d` legal. M. Without it, `Editor` panics on the first dispatch.
9. **Generic instance methods**. M–L. Needed for frontmatter.ts.
10. **Recursive type aliases and forward references between closures**. L. Needed for formula.ts.
11. **Library**: `Intl.Segmenter` over libunibreak, `Uint8Array` plus `crypto.getRandomValues`, `structuredClone`, and a seeded `Math.random`. S–M.

## Outdated statements in `docs/guide/02-language.md`

- "compiles … to C++17": the engine is IR plus interpreter plus AOT to C++20.
- The "sim oracle": it was removed with the prototype on 2026-10-20.
- Generics "compiled to C++ templates": they are monomorphized in the checker. Generic instance methods are refused.
- "discriminated unions": only inline record unions narrow. Interface unions do not.
- "`lib/zinc.d.ts` is the exact standard library": the checker does not read it. It declares Record, Partial, Readonly and Symbol, which the checker rejects.
- Regex is "forbidden (Z1008)": regex works, and `zinc explain Z1008` reports an unknown code.
- Codes that do not exist (`zinc explain` → unknown): Z1016, Z5001, Z5002, Z5003, Z9034, Z9040, Z9041, Z9042.
- "`finally` not supported in async (Z9034)": it works.
- "`await` in a loop condition not allowed": it works.
- "Calling through a Dyn rejected (Z9042)": the error is now Z0005 "conversion of function to Dyn" or Z0105.
- "`any` is Z1006 in the strict esp32 profile": `zinc run --profile esp32` accepts `const a: any`.
- The `@weak accessor owner: N | undefined` example fails with Z0111.
- `zinc infer`: it now only lists the Z0109 sites. It has no `--write` and does not type `.js` into `.ts`.
- `--no-float` and `--no-dyn`: they are not in `zinc build` usage.
- The status-return claims of ADR 0006/0007 date from the prototype. They were not verified.

Still true: the TLSF heap (`runtime/zrt.cpp`, `ZRT_HEAP_BYTES`), numeric-only enums (string enums are refused), `using`/`Symbol.dispose`, and accessors.

Related: `docs/reports/research-2026-10-20-js/typescript-as-written.md` (the kirari probe) found the same families: truthiness, `&&` values, Record, inference, narrowing, `export type from` and indexed access.
