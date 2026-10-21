# TypeScript as written: what the typed engines need to compile a real library

Status: research, with a first implementation (2026-10-21, last section). Date 2026-10-20, Zinc at `8c264f96`. Tags: **[V]** run here, **[I]** inference.

## The probe [V]

[kirari](https://github.com/vortexkit/kirari) (`@vortexlabs/kirari` 1.0.5, commit `0d33bf4`): a DOM-free syntax highlighter in TypeScript, about 1,800 lines of core (`packages/kirari/src`, `tokenize.ts`, `grammars/`) plus 48 language grammars (mostly regex tables). No dependency, no `any`, nothing dynamic. A small `main.ts` called `highlight()` and `tokenize()` with the TypeScript grammar; only the files it reaches were checked (about a third of the code: `languages.ts` and the 48 grammars were not).

| Engine | As is | After two one-line edits |
|---|---|---|
| `zinc run --engine quickjs` | fails to parse | runs, output correct (tokens and HTML) |
| `zinc check` (interpreter / AOT) | 2 parse errors | 78 errors |

The two parse errors fail on both engines, so they are in the shared parser: `export type { A, B } from './types.js'` (`index.ts:16`) and `(typeof tokenTypes)[number]` (`types.ts:7`). Both are valid, common TypeScript; many npm packages contain them.

## The 78 errors by family

| Family | Errors | Example | Where in the engine |
|---|---:|---|---|
| `&&` / `||` yield a value, truthiness of non-booleans | ~25 with cascades | `const identifier = language.identifier && sticky(...)` is typed `boolean`, then `tokenize.ts:215-242` fail ("length on boolean") | `check.cpp:782`; `truthiness()` at `check.cpp:2434` only handles nullable names and property paths |
| Narrowing of nullable values | ~17 | `previous?.type`, `if (!x) return`, captures | the checker's narrowing |
| Utility types | 11 (+8 cascades) | `Record<string, V>`, `Readonly<T>`, `Object.entries` | not declared |
| Inference | ~10 | `new Set(readonlyArray)`, parameter typed by its default `= new Set<number>()`, `[]` from context, defaults in lambda parameters (`check.cpp:3385`) | checker |
| Generators that receive a value | 1 (central) | `const resume = yield token`, callers use `scanner.next(offset)` (markup, shell, python, csharp, hcl, makefile) | `desugar.cpp:183` refuses; `Generator<T>` only (`desugar.cpp:436`) |
| Small strict rules | ~10 | module `const` used inside a function before its line (`appendToken`), `delete o.p` on an optional field, `??` on a non-null `string`, `exec().index` | checker, `lib` types |

Nothing in the list is dynamic: every construct stays statically typable, so the AOT path is not weakened.

## Changes, by yield per effort [I]

1. **`&&`/`||` with value semantics and general truthiness.** Extend `truthiness()` to non-null numbers (`x !== 0 && x === x`, the test it already generates), strings, and impure operands through a temporary.
2. **Utility types.** Erase `Readonly<T>`/`ReadonlyArray<T>`; lower `Record<string, V>` to a dictionary (a `Map`, `o[k]` and `Object.keys/entries/fromEntries` rewritten onto it; insertion order kept as for an object).
3. **Generators with a sent value.** The generators are a source desugaring, so: accept `Generator<T, R, N>`; the `Generator` class (`modules.cpp:2909`) gets a `sent: N | null` field and `next(v?: N)` stores it before `step()`; `const r = yield e` becomes `yield e; const r = __g.sent;`, as `lin()` already does for `await` (`desugar.cpp:172-181`). A `.next()` without argument delivers `null` (D16: `undefined` reads as `null`), which scriptc refuses (SC1071) and we can accept.
4. **Inference gaps**, measured against `tsc` with `tools/oracle`.
5. **Small rules**: two passes over module declarations, `delete` of an optional field as `= null`, `??` on a non-null value as a warning, a real `RegExpExecArray`.
6. **The parser**: `export type … from`, indexed access types, `as const` arrays as unions. One fix serves both engines.
7. **Narrowing** through `?.`, early returns and captures; part of it will disappear with 1 and 4.

## Method

A corpus of real DOM-free TypeScript libraries (kirari, then two or three more) with the error count of `zinc check` as the gauge, driven to zero family by family, each fix with its regression test. A guard in the spirit of scriptc's zero-cost gate ([scriptc-lessons.md](scriptc-lessons.md)): the AOT C++ of the corpus that does not use a construct must not change.

## Side findings

- `docs/guide/02-language.md` still says regular expressions are refused (Z1008); `zinc explain Z1008` says "unknown diagnostic code" and regexes work (`RegExp`, sticky `y`, `lastIndex`, libregexp per D10).
- In a Zinc UI, use `tokenize()` (a token array mapped to coloured `<Text>`), not `highlight()` (an HTML string).

## Second probe and first changes: Athena Crisis (2026-10-21) [V]

[Athena Crisis](https://github.com/nkzw-tech/athena-crisis) (commit `1d7033d`): an open-source strategy game in TypeScript and React. Its game engine is DOM-free: `athena` (map, units, rules, about 20,000 lines), `apollo` (actions, 7,000), `dionysus` (the AIs, 8,000), `hermes`; npm dependencies `@nkzw/core`, `@nkzw/immutable-map` (ES modules), `array-shuffle`, and two CommonJS packages, `fastpriorityqueue` and `skmeans`. The UI (`hera`, `ui`) is React DOM with Emotion and Framer Motion. The probe: a `main.tsx` that builds a 10x10 map with two HQs and four units and lets the `DionysusAlpha` AI play against `EndTurn` until the game ends (5 turns, 36 actions); its output under Node (tsx) is the reference. `apollo/EncodedActions.tsx` comes from their codegen (`codegen/generate-actions.tsx`, run once).

Before: 66 of the 293 files did not parse (first error per file), so neither engine ran it. The missing grammar, by count: indexed access types (`T['type']`, `(typeof x)[number]`), `import type X from`, generic arrow functions (`<T extends U>(x: T) =>`, also misread as JSX in `.tsx`), labelled and optional tuple elements, method signatures in object types, intersections with object types, `keyof typeof`, negative literal types, conditional, mapped and template literal types, comma-separated object type members, number keys in object literals, string-named enum members, destructured parameter defaults, object rest patterns, holes in assignment patterns.

What was changed (not committed at the time of writing):
- **The parser takes TypeScript's whole type grammar.** What the checker does not type yet is a `TypeOther` node (`intersection`, `conditional`, `mapped`, `indexed access`, `rest element`, `index signature`, `call signature`, `constructor`, `generic function`...); the checker reports it as Z0005 "<what> types". The parser's other refusals of valid TypeScript moved to the checker the same way (generic instance methods, generic methods of interfaces, generic arrows, destructured parameter defaults, object rest, holes), and top-level `await` to the desugaring. A program the typed engines compiled before parses to the same tree.
- **The QuickJS engine's loader**: an import whose names are all types is removed, as TypeScript does (it kept `import './m'`, which ran the module and closed an import cycle: "Entity is not initialized"); parameter properties go after `super(...)` wherever it is (the typed parser had the same bug); `export type { } from` is erased; a CommonJS file (`.cjs`, or `.js` with no import or export line and a `module.exports`) becomes a module whose default export is its `module.exports`, its `require('literal')` of files and CommonJS packages resolved before it runs.

After [V]: all 293 files parse; `zinc run main.tsx --engine quickjs` prints the same as Node, byte for byte (md5 equal), top-level `await` included; kirari runs unchanged (no edit), with the same tokens. Test: `tests/t0/qjs.sh` (`tests/golden/qjs/ts_syntax.ts`, every construct above, compared with Node's output, and the typed engines' Z0005 names).

Typed engines on Athena Crisis [V]: 182 errors before any type is checked, in two families of the module loader: npm packages are not resolved (91, the typed loader reads only `tsconfig.json` paths, plugins and the compat packages), and circular imports are refused (91; the engine's modules import each other through `Entity`, `Unit`, `MapData`). kirari now stops at the first desugaring error (a generator whose type is not `Generator<T>`), the families of the first probe behind it.

### The typed engines: what Athena Crisis needs, in order [I]

1. **Import cycles** (the first wall): the merged program orders modules by their imports; a strongly connected group needs its declarations (classes, functions, types, enums) visible across the group before the module bodies run in ECMAScript order. Without it no file of the engine checks.
2. **npm packages in the typed loader**: `node_modules` and `package.json` `exports` as the QuickJS loader resolves them; a package published as JavaScript with `.d.ts` is typed from its declarations and compiled through the gradual profile, or from its TypeScript source when the package says where it is (scriptc's `--provenance-sources`, [scriptc-lessons.md](scriptc-lessons.md) §8). `@nkzw/immutable-map` (an Immutable.js fork, the engine's main data structure) is the hard one.
3. **Generic instance methods and generic arrows**: used throughout (`filterMap<T, K, V>`, `ImmutableMap` methods); the checker has generic functions and static generic methods, so this is specialisation per instantiation of a method.
4. **The type operators on concrete types**: `T['k']`, `keyof typeof X`, `(typeof X)[keyof typeof X]` (the `as const` enum pattern), `A & B` of object types, `Readonly`/`Omit`/`Pick`/`Record`, conditional and mapped types evaluated when their arguments are known. Most uses in the engine are on concrete types, which reduce to the records the checker has.
5. **The kirari families** (sections above): truthiness and `&&`/`||` values, inference, narrowing, `Record` lowered to a `Map`, generators that receive a value.
6. Smaller: object rest (a record without the named keys), destructured parameter defaults, code before `super(...)`.

The rule for each step stays the zero-cost gate ([scriptc-lessons.md](scriptc-lessons.md) §2): the AOT output of the corpus does not move.

The UI of Athena Crisis is React DOM: it runs with a real browser engine (the webview plugin) or through a DOM shim with layout ([hybrid-engines-dom.md](hybrid-engines-dom.md)), not on the typed engines.
