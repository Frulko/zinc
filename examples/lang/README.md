# lang

A guided tour of the TypeScript subset Zinc compiles, printed one section per topic: classes and interfaces,
generics, closures, machine integers, enums, strings, `Map` / `Set`, control flow and number formatting. Every line
prints the same bytes natively and on the sim (Node), which makes it a quick parity check for a new target.

## Run it

```sh
zinc run examples/lang                     # macOS / Linux executable
zinc run examples/lang --target sim        # Node.js: the reference output
zinc run examples/lang --target rpi1       # ARMv6 hard-float binary under QEMU
zinc run examples/lang --profile ps1       # host build with the PS1 profile (Q20.12 fixed point numbers)
```

`scripts/parity.sh` runs it on the sim and natively (default and `ps1` profiles) and diffs the outputs.

## What to look at

| File | Section | What it shows |
| --- | --- | --- |
| `src/main.ts` | | the tour, one call per section |
| `src/tour/shapes.ts` | Classes | interface, abstract class, static field, `public` constructor parameters, getter |
| `src/tour/classes.ts` | Classes, Generics | virtual dispatch, sorting objects, `instanceof` narrowing, a generic `Stack<T>` (C++ templates) |
| `src/tour/functions.ts` | Closures | a captured mutable counter, functions returning functions |
| `src/tour/numbers.ts` | Machine integers, Number formatting | `i32` / `u8` / `u32` wrap-around, a 32-bit hash, JavaScript number printing |
| `src/tour/enums.ts` | Enums | numeric enums with explicit values, `switch` with fall-through |
| `src/tour/strings.ts` | Strings | UTF-8 storage with UTF-16 indices, the common string methods, parsing |
| `src/tour/collections.ts` | Map and Set | insertion-ordered `Map` / `Set`, interface-typed object literals, a word count |
| `src/tour/control-flow.ts` | Control flow | `break` / `continue`, `do … while`, `||` defaults, array predicates |
| `src/report.ts` | | section headings |
