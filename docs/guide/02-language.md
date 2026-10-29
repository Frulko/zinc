# 2. The language

Zinc is a **strict subset of TypeScript**. If it type checks under Zinc's rules, the interpreter, the AOT build (C++) and
the QuickJS engine give the same output (`zinc test --runner` compares them). This chapter is what you can write, what is
rejected, and why; [the syntax cheat sheet](../reference/syntax.md) is the one-page version.

## What is supported

- Classes: inheritance, `abstract`, statics, accessors (`get`/`set`), `#private` fields, `readonly`.
- Interfaces, generics (compiled to C++ templates, explicit and inferred), discriminated unions, tuples.
- Utility types over an interface or a record of data properties: `Partial`, `Required`, `Readonly`, `Pick` and `Omit` (keys as
  string literals), and `Record<'a' | 'b', V>`; a dictionary with any string key is a `Map<string, V>`.
- Destructuring (with defaults and `...rest`), rest parameters, spread (in array/object literals and calls), `?.`, `??`, `??=`, `using` / `Symbol.dispose`.
- Object literals with getters, setters and methods that use `this`; tagged templates and `String.raw`.
- Enums (numeric only), closures, `for`/`for-of`/`for-in`/`while`, labeled statements with `break label` / `continue label`.
- `try` / `catch` (the binding is optional) / `finally` and `throw`.
- `async` / `await`, `Promise`, microtasks, and generators — stackless frames.
- Machine number types (`i8`…`u64`, `f32`, `f64`, `fx12`, `fx16`), strings (UTF-8 storage, UTF-16 indices),
  arrays, `Map` / `Set` (insertion-ordered), `JSON.stringify`/`parse`, `console.*` with levels.

The exact standard library is declared in [`lib/zinc.d.ts`](../../lib/zinc.d.ts) (this replaces `lib.d.ts`; there is no
ambient DOM or Node). Built-in modules are in [`lib/modules.d.ts`](../../lib/modules.d.ts). Only what the runtime
implements exists — if a method isn't in those files, it isn't available.

```ts
// samples-worthy snippet, all supported
class Point { constructor(public x: i32, public y: i32) {} }
const pts: Point[] = [new Point(1, 2), new Point(3, 4)];
const sum = pts.reduce<i32>((a, p) => a + p.x + p.y, 0);
console.log(sum, pts.map(p => `${p.x},${p.y}`).join(' '));
```

## What is rejected, and why

Forbidden constructs are compile errors with a `Z` code: `zinc check` lists them, `zinc explain Z1001` says why and what to
write instead (`--json` gives LSP diagnostics). The main ones:

| code | rejected | write instead |
| --- | --- | --- |
| Z1001 | `var` | `let` or `const` |
| Z1002 | `arguments` | explicit or rest parameters |
| Z1003 | `eval` | `JSON.parse`, or call a function |
| Z1005 | `with` | name the object: `o.x` |
| Z1007 | `delete` on a typed field | a `Map`, or set the field to `null` |
| Z1009 | dynamic `import()` | a static `import` at the top of the file |
| Z1010 | prototype mutation | declare the method in the class |
| Z1011 | arrays with holes | write the value, `null` or `undefined` |
| Z1015 | `globalThis` | import what you need |
| Z9026 | `in` on a typed value | `Map.has(key)` or compare the field |
| Z1006 | `any` in a strict profile | give the value a type (see "Dyn" below) |
| Z4001 | a value with no fixed-point form (under `--profile ps1`) | give `Math.min`/`Math.max` an argument |
| Z0006, Z0007 | `class=` and lowercase tags in JSX | `className`, `<View>` (see [UI apps](03-ui-apps.md)) |
| Z0119 | an import that is not a file or an engine or plugin module | fix the path, or `zinc plugins` / `zinc add` |

Regular expressions work (libregexp of QuickJS-ng; indices are UTF-16 code units), and so do `finally` in async functions and
`await` in a loop condition. `docs/diagnostics.md` lists every code, generated from the engine. Rules in this table change
with the engine: when in doubt, `zinc check` is the judge.

The rules exist so the engine stays predictable: no `eval`, no prototype surgery, no reflection, no holes to represent.

## Numbers and profiles

`number` is `f64` by default. The machine types are real: `i32` arithmetic wraps (two's complement), `u8` is a byte,
and loop counters are inferred to `i32` where safe. Fixed-point targets (`ps1`: Q20.12, no FPU) compute `fx12`/`fx16`
the same way on every engine: the same program prints the same bytes. Emulate a profile on your host to test:

```sh
zinc run app --profile ps1      # Q20.12 fixed point, 320x240, 256 KiB heap, on macOS
zinc build app --no-float       # reject floating point (Z4001 on any f32/f64 site)
```

## Memory model

Objects are **reference counted** via RAII smart pointers (decision 0001, `docs/decisions/`): a 32-bit count, immortal at saturation, freed
deterministically when the last reference drops. String literals are constant-initialized and immortal. This is
correct and simple but keeps more inc/dec than a borrow-checked design would, and **reference cycles leak** until you
break them with a weak reference:

```ts
class Node {
  parent: Node | undefined = undefined;
  children: Node[] = [];
  @weak accessor owner: Node | undefined = undefined;   // does not keep the target alive
}
```

Beyond RC:

- **Arenas** (`using a = Arena.frame()`): everything allocated in the block is freed in O(1) at the end; `a.promote(x)`
  keeps a value past the frame. Escape is checked at runtime.
- **Pools** (`@pooled(n)` on a class): N preallocated slots, no heap traffic for hot allocations.
- **Value classes** (`@value`): copied, no header — for small immutable structs.
- The heap is a **TLSF** allocator over one region whose size is the profile's budget (`ZRT_HEAP_BYTES`); with
  `--debug` you also get ASan/UBSan and a leak report at exit (0 live objects is the goal).

## Errors

`throw` and `try`/`catch`/`finally` work with JavaScript semantics for the covered cases, compiled to status returns
checked after each call that may throw (whole-program analysis) — zero cost where nothing throws. You may only throw
`Error` (or a subclass). Runtime faults — array bounds, null through `Dyn`, division traps — **panic** with the text
JS prints for the matching `TypeError`/`RangeError`. `finally` works in async functions and generators too.

## async / await and generators

Each async function or generator becomes a heap frame with a `switch (state)` resumed through the microtask queue,
reproducing Node's ordering. If an `await` site is not allowed the compiler says so.

```ts
import { fetch } from 'zinc:net';
async function load(url: string): Promise<i32> {
  const r = await fetch(url);       // ok: initializer
  const body = await r.text();
  return body.length;
}
```

## Dyn: gradual vs strict

In the **gradual** profile (`macos`/`linux`/`wasm`/`rpi1`/`rmpp`) `any` and `unknown` are a single NaN-boxed
`Dyn` value: `JSON.parse` without a type returns a `Dyn` tree, property/index access and operators follow
ECMAScript, and conversions out of `Dyn` are **checked** (memory safety depends on it — a bad cast panics like a bounds
error). In the **strict** profile (`esp32`/`ps1` default) `any` is `Z1006` and an `unknown` must be narrowed
(`typeof`/`instanceof`/`Array.isArray`) before use. The strict profile is a line `// zinc-profile: strict` at the top of the entry file, or `--strict`. You can force strictness anywhere with `--no-dyn`, which
turns every remaining `Dyn` site into an error.

```ts
const data = JSON.parse('{"n":42,"items":[1,2,3]}');   // Dyn (gradual profile)
if (typeof data.n === 'number') console.log(data.n);   // narrowed → native i32/f64
```

A conversion into an interface or a record is a **checked copy of its declared fields**: `const p: Patch = JSON.parse(body)`
gives a `Patch` with the fields `Patch` declares, and a property the JSON has beyond them is dropped (a spread of `p` copies only
those). This is the rule of Zinc: a typed value is exactly its type, as its layout, `JSON.stringify` and `for...in` say. QuickJS,
which runs the program as plain JavaScript, keeps the extra properties today (as TypeScript does at run time), so code that guards
what it passes on (a server that takes a patch from a client) still sets or clears the fields it must never take from outside.

Calling a function through a `Dyn` is rejected (Z0105, "Expression is not callable: 'any'"): narrow first. Typed arrays other
than `any[]`, functions, maps and sets can't become `Dyn`, because a checked copy would break aliasing.

### `zinc infer`

`zinc infer <entry>` reports every `Dyn` site and proposes types from call sites, fields read and assignments. It can
type a JavaScript file into a `.ts` next to it, and `zinc build app.js` infers in memory and compiles directly:

```sh
zinc infer src/app.js            # writes src/app.ts + a report
zinc infer src/app.ts            # prints a diff of proposed annotations
zinc infer src/app.ts --write    # applies them
```

Next: [UI apps](03-ui-apps.md).
