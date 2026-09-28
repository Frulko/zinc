# 2. The language

Zinc compiles a **strict subset of TypeScript** to C++17. If it typechecks under Zinc's rules, it runs identically on
every target and on the sim oracle. This chapter is what you can write, what is rejected, and why.

## What is supported

- Classes: inheritance, `abstract`, statics, accessors (`get`/`set`), `#private` fields, `readonly`.
- Interfaces, generics (compiled to C++ templates, explicit and inferred), discriminated unions, tuples.
- Destructuring, spread (in array/object literals and calls), `?.`, `??`, `??=`, `using` / `Symbol.dispose`.
- Enums (numeric only), closures, `for`/`for-of`/`while`, labeled `break`/`continue` on loops.
- `try` / `catch` / `finally` and `throw` — implemented as status returns, not C++ exceptions (ADR 0006).
- `async` / `await`, `Promise`, microtasks, and generators — stackless frames (ADR 0007).
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

Forbidden constructs are compile errors with a `Z` code (`zinc check` lists them; `--json` gives LSP diagnostics).
The categories:

| codes | area | examples |
| --- | --- | --- |
| `Z1xxx` | forbidden JS | `var` (Z1001), `arguments` (Z1002), `eval` (Z1003), `with` (Z1005), `delete` on a typed field (Z1007), regex (Z1008), dynamic `import()` (Z1009), prototype mutation (Z1010), holey arrays (Z1011), `globalThis` (Z1015), `in` (Z9026 — use `Map.has`) |
| `Z1006/Z1016` | typing profile | `any` in the strict profile (Z1006); an `unknown` used without narrowing (Z1016) |
| `Z4001` | numbers | using `f32`/`f64` where the target has no FPU, or under `--no-float` |
| `Z5xxx` | modules | bad native spec (Z5001), no implementation for a target (Z5002), module/plugin not available on this target (Z5003) |
| `Z6xxx` | UI/JSX | JSX lowering errors |
| `Z9xxx` | not supported (yet) | rest params (Z9009), labeled statements (Z9011), `finally` in async (Z9034), `await` in a loop condition (ADR 0007), calling through a `Dyn` (Z9042) |

The rules exist so the backend stays a thin, predictable AST→C++ translation with no runtime metaprogramming: no
`eval`, no prototype surgery, no reflection, no regex engine, no holes to represent. `Z9xxx` codes are honest "not
implemented yet" markers rather than design bans — check the message.

## Numbers and profiles

`number` is `f64` by default. The machine types are real: `i32` arithmetic wraps (two's complement), `u8` is a byte,
and loop counters are inferred to `i32` where safe. Fixed-point targets (`ps1`: Q20.12, no FPU) compute `fx12`/`fx16`
bit-identically with the sim oracle — the same program prints the same bytes. Emulate a profile on your host to test:

```sh
zinc run app --profile ps1      # Q20.12 fixed point, 320x240, 256 KiB heap, on macOS
zinc build app --no-float       # reject floating point (Z4001 on any f32/f64 site)
```

## Memory model

Objects are **reference counted** via RAII smart pointers (ADR 0001): a 32-bit count, immortal at saturation, freed
deterministically when the last reference drops. String literals are constant-initialized and immortal. This is
correct and simple but keeps more inc/dec than a borrow-checked design would, and **reference cycles leak** until you
break them with a weak reference:

```ts
class Node {
  parent: Node | undefined;
  children: Node[] = [];
  @weak accessor owner: Node | undefined;   // does not keep the target alive (MEM-13)
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
JS prints for the matching `TypeError`/`RangeError`. `finally` is not yet supported inside async functions/generators
(Z9034).

## async / await and generators

Each async function or generator becomes a heap frame with a `switch (state)` resumed through the microtask queue,
reproducing Node's ordering. The constraint (ADR 0007): `await` must appear as a statement, initializer, assignment or
`return` — not in a loop condition or a short-circuit branch. The compiler tells you when a site isn't allowed.

```ts
import { fetch } from 'zinc:net';
async function load(url: string): Promise<i32> {
  const r = await fetch(url);       // ok: initializer
  const body = await r.text();
  return body.length;
}
```

## Dyn: gradual vs strict

In the **gradual** profile (`macos`/`linux`/`sim`/`wasm`/`rpi1`/`rmpp`) `any` and `unknown` are a single NaN-boxed
`Dyn` value (ADR 0014): `JSON.parse` without a type returns a `Dyn` tree, property/index access and operators follow
ECMAScript, and conversions out of `Dyn` are **checked** (memory safety depends on it — a bad cast panics like a bounds
error). In the **strict** profile (`esp32`/`ps1` default) `any` is `Z1006` and an `unknown` must be narrowed
(`typeof`/`instanceof`/`Array.isArray`) before use (`Z1016`). You can force strictness anywhere with `--no-dyn`, which
turns every remaining `Dyn` site into an error.

```ts
const data = JSON.parse('{"n":42,"items":[1,2,3]}');   // Dyn (gradual profile)
if (typeof data.n === 'number') console.log(data.n);   // narrowed → native i32/f64
```

Calling a function through a `Dyn` is rejected (Z9042): narrow first. Typed arrays other than `any[]`, functions, maps
and sets can't become `Dyn` (Z9040/Z9041) because a checked copy would break aliasing.

### `zinc infer`

`zinc infer <entry>` reports every `Dyn` site and proposes types from call sites, fields read and assignments. It can
type a JavaScript file into a `.ts` next to it, and `zinc build app.js` infers in memory and compiles directly:

```sh
zinc infer src/app.js            # writes src/app.ts + a report
zinc infer src/app.ts            # prints a diff of proposed annotations
zinc infer src/app.ts --write    # applies them
```

See [reports/STATUS.md](../reports/STATUS.md) for the current edges (chained `?.`, some `await` positions, `word` Dyn
representation, function specialisation — all listed honestly there). Next: [UI apps](03-ui-apps.md).
