# Prior art for Zinc Next: Haxe, hxcpp, HashLink, Lime/OpenFL and ActionScript 3

Note, 2026-10-06. Purpose: not to reinvent what these projects already solved, and not to copy what they got wrong.

**Status of the evidence.** This note comes from general knowledge of these projects. I did not read their sources while
writing it, so every claim marked **(verify)** must be checked against the code or docs before a decision depends on it.
Section 7 lists what to read, in order. Nothing here changes the design report yet.

## 1. What each project is

| Project | What it is | Closest Zinc part |
|---|---|---|
| ActionScript 3 (AS3) | Typed ECMAScript dialect, ahead of its time (classes, interfaces, packages, `int`/`uint`/`Number`, typed `Vector.<T>`), run by the AVM2 VM with a verified, typed bytecode (ABC) and a JIT. | The language subset and the typed VM. |
| Flash display list | Retained tree of `DisplayObject` / `Sprite` / `MovieClip`, an event model with capture, target and bubbling phases, `addChild`, `x/y/scaleX/alpha`, `Matrix`, filters. | The UI scene graph and its event model. |
| Haxe | Typed language with a compiler (OCaml) that emits many targets (JS, C++, C#, Java, Python, Lua, HashLink, ...). Structural typing, inference, `abstract` types, `inline`, macros, enums with data. | The compiler front end and the "one typed IR, many back ends" idea. |
| hxcpp | Haxe's C++ target: generated C++ plus a runtime (GC, strings, arrays, `Dynamic`, reflection) and a build tool. | `next/` AOT (ZBC to C++) and `zrt`. |
| HashLink (HL) | Haxe's VM: typed register bytecode, a JIT, and "HL/C" that compiles the same bytecode to C. Native libraries through a stable C API. | ZBC, the interpreter, M4 AOT, the native ABI. |
| Lime / OpenFL | Lime: cross-platform layer (window, input, audio, assets, GL context) with one backend per platform. OpenFL: the Flash API (display list, events, text, bitmaps) built on Lime. | `zinc:gfx`/HAL and a possible AS3-style API on top of the scene. |

## 2. What we have, in the same terms

- A typed register bytecode (ZBC) with a verifier, one reference interpreter, AOT planned from the same IR. This is the
  HashLink shape, not the AVM2 or JS-engine shape.
- An existing native path: compiler in `compiler/` emitting C++ over `zrt`, plus a runtime with raster, flexbox layout,
  text, input and scroll physics (`docs/ui.md`, `docs/reports/qt-comparison.md`).
- Reactivity as libraries over an imperative engine API (`lib/std/signals.ts`, `solid.ts`, `react.ts`).
- Machine integer types as aliases of `number` (so tsc/Node stay the oracle), unlike AS3 (`int`/`uint` are real types
  but `Number` is the default) and Haxe (`Int`/`Float` distinct, `Dynamic` explicit).

## 3. Language and type system: what to take

**Haxe**
- *Typed by default, dynamic by explicit opt-in.* Haxe's `Dynamic` is contagious and slow; ours (`Dyn`, ZN-025) must stay
  an island with explicit conversions. Keep that rule from the design report and write it as a checker rule, not a convention.
- *`abstract` / newtype without cost* maps to our machine types and to enums with a distinct type (done in ZN-032: an enum
  is an i32 that only accepts its own members).
- *Enums with data (ADTs)* and exhaustive `switch`: Haxe shows this is what makes typed UI code pleasant. TypeScript
  expresses it with discriminated unions, which are still unsupported for primitives in our checker. Worth a task after
  ZN-033..035, not before.
- *Inference at the boundaries only* (Haxe infers locals, wants signatures on fields): consistent with what the checker does.
- *Macros*: do not take them. They are the main source of toolchain complexity in Haxe. JSX/template lowering stays a
  fixed compiler pass.

**AS3**
- Typed containers are a deliberate feature (`Vector.<T>`), because untyped `Array` was the performance trap. We already
  have `T[]` with a typed element class in ZBC. Keep arrays homogeneous; no holes (`array index out of bounds` already traps).
- `getter`/`setter` and properties were central in AS3 and Haxe (`property` with `get,set`). We now have getters; setters
  are Z0005. Decide whether setters are in scope before the UI work, because display-object APIs (`x`, `alpha`, `visible`)
  are classically setters that mark dirty flags.
- The AS3 lesson on equality and coercion: implicit conversions between `int`, `uint` and `Number` caused many bugs. Our
  integer-to-integer implicit conversion (needed for the kernels) is the same trade-off; keep the explicit narrowing
  warning in mind and consider a lint, not a language error.

**What to avoid**
- Haxe's per-target semantic differences (integer overflow, string indexing, `null` on basic types differ by target). Our
  rule is already stricter: one interpreter is the reference, AOT and JIT must be byte-identical on the corpus (ZN-023).
- AS3's `*` type and `Object` as a universal supertype: it makes the verifier weak. Our verifier tracks exact classes.

## 4. VM and AOT: what to take from HashLink and hxcpp

- **HashLink**
  - Typed registers, no tags: same as ZBC. Their numbers are the best public reference for how fast this design can be
    in an interpreter plus baseline JIT **(verify before quoting)**.
  - *HL/C*: compile the verified bytecode to C. This is exactly M4. Take their handling of exceptions, closures and
    natives as the checklist for ZN-019/022: a bytecode-to-C emitter must keep the same stack-trace and unwind behaviour
    as the VM or the differential runner (ZN-023) will keep failing.
  - Native extension API with versioned, stable C entry points. Our shared native ABI (`docs/engines.md`) has the same
    goal; compare names and ownership rules before freezing it. **(verify)**
  - Hot-reload and a debugger protocol exist in HL tooling; both are cheap if bytecode has stable function ids. Keep
    function indices stable across rebuilds when possible.
- **hxcpp**
  - A GC with precise stack maps, plus reflection and `Dynamic`. We chose explicit reference counting in the IR
    (ZN-018) instead, which gives deterministic destruction on every back end. hxcpp's experience says: cycles and
    finalisation order are where such runtimes break. Document the cycle policy (weak references or a cycle collector
    for caches) before M3 closes.
  - Its build tool (`hxcpp` build files, per-target toolchains) is a reminder that the toolchain manager (ZN-029) is as
    large as the compiler. Do not leave it for last.

## 5. UI: what to take from Flash, OpenFL and Lime

The UI should be agnostic of the authoring style (AS3-like, vanilla, JSX, Vue, Svelte). The split that worked for
Flash/OpenFL/Lime, and the split we need:

| Layer | Flash/OpenFL/Lime | Zinc Next |
|---|---|---|
| Platform | Lime: window, input events, audio, GL, assets, one backend per OS | HAL + `zinc:gfx` (already exists, keep) |
| Scene | `DisplayObject` tree, transforms, dirty flags, hit testing, event dispatch | one retained scene API (node kinds, typed props, events); see ZN-027 |
| Compatibility API | OpenFL on top of Lime | optional AS3-style module on top of the scene (names only) |
| Authoring | Flash IDE, then Haxe code | JSX with signals first; templates (Vue/Svelte) as compilers to the same calls |

Take:
- **Event model**: capture, target, bubble, `stopPropagation`, `currentTarget`. Define it once, test it once (ZN-027
  needs a conformance test), and make the AS3 module a thin mapping. Keep the list of events finite.
- **Dirty flags and `invalidate()`/render phase** instead of immediate redraw, with a single render pass per frame.
- **Matrix and bounds API** (`getBounds`, `localToGlobal`, `hitTestPoint`): needed by any authoring style, including
  JSX. It is cheaper to have it in the core than in each frontend.
- **Asset pipeline from Lime** (declared assets, embedded or loaded, with a manifest, fonts and images by id): our
  asset/font story should be a manifest read at build time, not a runtime string lookup.
- **Text and fonts**: the part where Flash was weakest in portability (device vs embedded fonts). We have a deterministic
  rasteriser; keep fonts embedded and bundled, and say so in the UI spec.

Avoid:
- Flash's deep class hierarchy (`DisplayObject` > `InteractiveObject` > `DisplayObjectContainer` > ...). Node kinds with
  typed property sets are enough, and cheaper to verify.
- Timeline/`MovieClip` semantics (frame scripts, implicit state). They are the biggest source of "works only in the IDE".
- Filters as part of the core display API; make effects (shadow, blur) properties of nodes with a bounded set.

For React Native parity (flexbox, borders, shadows, images, fonts) the spec to copy is a *list of properties and their
exact semantics*, backed by pixel goldens. That list belongs in ZN-027, not in each frontend.

## 6. Decisions this suggests (not yet taken)

1. Keep ZBC as the single bytecode and treat HashLink's HL/C as the reference for the M4 emitter. Read it before ZN-022.
2. Define the scene API and event model once (ZN-027) and test them without any framework; frontends come after.
3. Add setters, ADT-style unions and exhaustive `switch` to the language backlog, in that order, after ZN-033..035.
4. Write the cycle policy for reference counting (ZN-018) before it is implemented.
5. Make the font/asset manifest part of the build, not the runtime.
6. Keep `Dyn` an island; never let it leak into the scene API.

## 7. What to read to turn **(verify)** into facts

In this order, about two hours of reading in total:
1. HashLink: `hlc` (HL/C) generator and `hl.h` native API headers; the bytecode spec (`opcodes.h`).
2. hxcpp: the C++ output for a small class with closures and an exception; the GC and string headers in `include/`.
3. OpenFL: `DisplayObject` dispatch (`__dispatchEvent`) and the render/invalidate path.
4. Lime: the asset manifest format and the backend interface for a window and input.
5. Haxe manual: `abstract`, `extern`, `inline`, enum ADTs and pattern matching.
6. AS3: the AVM2 overview (ABC verifier rules) and the display list event flow chapter.

When this is done, update this note: replace each **(verify)** with a reference, and move the decisions in section 6 to
the design report or to backlog tasks.
