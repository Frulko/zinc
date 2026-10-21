# Typed Zinc natively, untyped JavaScript on an optional engine, a browser shim between them

Status: research and proposal, nothing implemented. Date 2026-10-20. The owner's idea: compile Zinc (TypeScript) to native code as today, run the JavaScript libraries whose types are unknown on an optional engine (QuickJS everywhere, JavaScriptCore or V8 where a JIT is allowed), give those libraries a browser/DOM shim, and make the boundary between Zinc and the engine as fast as possible. Facts come from [internal-survey.md](internal-survey.md) (the tree, with paths) and [external-survey.md](external-survey.md) (the web, with URLs); this file only cites them. Tags: **[M]** measured, **[W]** published, **[I]** inference or proposal.

## 1. What exists already [M]

- **Two uses of QuickJS-ng 0.17.0** (one patched copy): a whole-program engine (`.js` entry, `"engine": "quickjs"`), where Zinc modules are stripped of types and reach the host through `__host_*` thunks generated from `include/zn/runtime.h`; and `zinc:script` (D22), a sandbox inside a typed program.
- **No direct way to import an npm JavaScript library from a typed `.ts` file** and call it: either the whole program runs on QuickJS (typed semantics lost: `i32` wrap, `f32` rounding), or the typed program talks to a `zinc:script` sandbox, or the typed frontend tries to compile the JS (it stops at line 3,885 of three.js's 60,600).
- **The boundary, M1 Pro**: QuickJS JS-to-C call 20-45 ns; `zinc:script` generic (JSON text) 0.5-0.9 µs, `zinc:script/fast` (up to four numbers) 0.057 µs script-to-host and 0.142 µs host-to-script, against a floor of 0.040 µs. Not done: objects, strings in the fast path, zero-copy buffers (`docs/reports/script-boundary-optimisation.md`). A measured finding to keep: on QuickJS, filling a command buffer from JS costs more per UI operation than one fast call.
- **The web environment** (D83): `lib/std/webenv.js` (130 KB, engine-neutral JavaScript) plus about 4,000 lines of C++ written against QuickJS's C API (WebGL binding 1,539, Canvas 2D 471, webenv 223). Events, `requestAnimationFrame`, fetch/XHR, storage, Image, Canvas 2D, WebGL. No layout, `DOMParser`, Worker, audio, gamepad.
- **Libraries that run unmodified**, one T1 test each: p5.js 1.11.13, three.js r186, PixiJS 7.4.3 and 8.22, Phaser 3.90. Budgets at 60 fps on the M1 Pro: about 160 p5 WEBGL boxes, 550 three.js meshes, 4,000 PixiJS v8 sprites, 1,000 Phaser sprites.
- **Pixels**: each frame a WebGL canvas is read back (`gl.zincPresent`, PBO) into a zinc:gfx image, then drawn by the normal renderer: 1.2 ms on js-p5. Drawing a full-window canvas straight into the window is a `later.md` line (454).
- **The JIT engine question is already open**: ZN-586 (Backlog, depends on the four demo tasks ZN-577 to ZN-580) and D110: JavaScriptCore as an optional macOS module, the system framework, never required; QuickJS the default and reference. Embedded JSC gets its JIT only with the `com.apple.security.cs.allow-jit` entitlement (6.16 against 0.41 ms in `bench/qjs/jsc-host.c`). On iOS no in-process engine has a JIT.

## 2. The idea, in one picture [I]

```
 your app (.ts/.tsx) ──typed AOT──▶ native code ─┐
 zinc:* modules, plugins ─────────────────────── ├─▶ renderer, layout, GL, audio (one native core)
                                                  │
 npm JavaScript (+ its .d.ts) ──▶ JS engine ──────┘  QuickJS (everywhere) | JSC (macOS, JIT) | V8 (opt-in)
        ▲                          ▲
        │ generated typed bindings │ browser shim: webenv.js (+ a DOM, levels in §5)
```

The key observation: **we do not know the types inside the JavaScript, but we know them at the boundary.** The library's `.d.ts` (shipped, or from DefinitelyTyped) and the Zinc side's own types say exactly what crosses. The bindings can therefore be generated at compile time for each signature, the way the typed engines already treat native modules, instead of decoded at run time (signature letters today) or serialised (JSON in `zinc:script` today).

## 3. An engine layer [I]

One C++ interface between Zinc and "a JavaScript engine", in the spirit of React Native's JSI (Hermes, JSC and V8 behind one interface) and of NativeScript 8.9's Node-API over Hermes, QuickJS, JSC and V8 [W].

- **Values as handles**, never as text: numbers and booleans by value, strings as engine strings with an interned cache for property names, objects and functions as references the Zinc side holds (`JsRef<T>`, typed from the `.d.ts`).
- **Host functions and native state, not property hooks.** Margelo measured JSI: 1,000,000 calls through a HostObject getter 181 ms, through a HostFunction 27 ms, through an object with NativeState 38 ms [W]. Zinc objects cross into JS as opaque classes with methods (`JS_NewClass` + `JS_SetOpaque` on QuickJS), not as per-property getters.
- **Zero-copy bulk data**: QuickJS-ng has no-copy `JS_NewArrayBuffer` and `JS_NewUint8Array`; JSC and V8 have equivalents [W]. A Zinc `f32[]` or `u8[]` and a JS `Float32Array` can share one buffer (vertex data, images, audio).
- **Typed fast calls**: the signature known at compile time selects a specialised thunk (`JS_CFUNC_fast`, ZN-596; V8 Fast API; JSC's C++ API). Published per-call costs: JSC C++ API 2 ns, Node-API 7 ns (Bun), V8 fast calls about 1 ns but only from JIT-optimised callers, so not for jitless V8 [W]; QuickJS 20-45 ns today [M], ZN-596 targets 30 ns or less.
- **What QuickJS's 20-45 ns can become** (path read in `third_party/quickjs-ng/quickjs.c`, 0.17.0): `OP_call_method` -> `JS_CallInternal` (interrupt poll, tag and class checks, indirect call through `class_array`) -> `js_call_c_function` (stack-overflow check, a `JSStackFrame` pushed, realm switch, argument padding, a switch on the prototype kind) -> our `generic_magic` thunk (arguments decoded by signature letters, `JS_ToFloat64` each) -> arguments freed one by one. D44's split: method lookup 10-15 ns, call machinery about 10, 2-3 per argument. In the interpreter: a typed fast prototype called straight from `OP_call_method` (ZN-596: no `JS_CallInternal` prologue, frame pushed only when the C side throws, doubles unboxed inline; targets 4 doubles 40-45 -> 30 ns, int 27 -> 22 ns), thunks generated per signature instead of decoded, methods as own properties of the binding objects; about 1.5-2x, not 10x, because the bytecodes around a call (2.9-4.8 ns each, a `gl.uniform4f(loc, a, b, c, d)` is about eight) cost as much as the call. The 1-2 ns of V8 and JSC are measured from JIT-compiled callers; QuickJS reaches that class only from compiled code: in ZN-723's compiler, a call site whose target is a known C function (a guard on its identity) calls it directly with values in registers.
- **When it matters** [M]: js-p5's 4,301 WebGL calls a frame at 40 ns are 0.17 ms of a 17.2 ms script (about 1%); the bunnymark through `__host_*` costs 173 + 148 ns per sprite against 15 + 10 in AOT; a DOM shim (levels 1 and 2 below) or `zinc:ui` driven from JavaScript makes thousands of small calls a frame. The interpreter is the bottleneck of today's demos, the call cost of tomorrow's DOM.
- **Ownership across two memory models.** Zinc counts references, the engines trace. A cycle that crosses the boundary (a JS closure held by a Zinc object that the closure holds) is collected by neither. Rules: Zinc holds JS objects through handles that the engine sees as roots and that are released explicitly or by scope; JS holds Zinc objects through finalisable opaque objects; long-lived cross references are weak by default. V8's cppgc can trace C++ wrappers [W]; QuickJS and JSC cannot. This is the main design risk.
- **Threads**: every engine is single-threaded. JS runs on one thread (the UI thread today; Lynx runs PrimJS on the main thread for the first frame and a second engine on a background thread for the app logic [W]).
- **Backends**: QuickJS first (moving today's ~4,000 lines of bindings onto the layer, no behaviour change), then JSC on macOS (ZN-586), V8 only on demand. `webenv.js` is already engine-neutral.

## 4. Importing a JavaScript library from typed code [I]

`import { Engine, Bodies } from 'matter-js'` in a `.ts` file:

1. The resolver sees a JavaScript package. If it has a TypeScript source (scriptc's `--provenance-sources` idea, [scriptc-lessons.md](scriptc-lessons.md)) or types well enough ([js-aot-to-cpp.md](js-aot-to-cpp.md)), compile it natively. Otherwise:
2. It becomes an engine module: loaded into the engine (bytecode cached, ZN-575), with the browser shim if `"web": true`.
3. Its `.d.ts` generates the Zinc side's view: typed functions, `JsRef<Engine>` with typed methods and fields, all calls through the fast thunks of §3.
4. Values that cross are checked once where untyped data becomes typed (design §5.4): a JS result that does not match its declared type throws a `TypeError` at the boundary, and typed code pays nothing inside.

The typed program keeps its semantics (`i32`, `f32`), its speed and its AOT; only the library runs on the engine. The engine is linked only when a program imports such a module: a typed program carries no engine.

## 5. The browser shim, by levels [I]

| Level | What | Libraries it opens | Effort |
|---|---|---|---|
| 0 (exists) | canvas, WebGL, events, rAF, fetch, storage | p5, three.js, Pixi, Phaser, GSAP on canvas | done; next: draw the canvas directly instead of reading it back (`later.md:454`, 1.2 ms a frame) |
| 1 | a DOM tree without layout: elements, attributes, `querySelector`, events, `DOMParser`, SVG elements drawn by `plugins/svg` | libraries that build DOM or SVG but measure nothing (d3 data joins on SVG, Markdown/HTML producers, chart libraries that emit SVG) | a proven DOM library rather than our own (linkedom, happy-dom; deno-dom has a Rust parser) [W]; none of them lays out (jsdom's `getBoundingClientRect` returns zeros) |
| 2 | DOM elements backed by Zinc UI nodes: a CSS subset, Yoga layout, real `getBoundingClientRect`, native text and rendering | DOM UI libraries | large. Precedents: Blitz renders HTML/CSS natively (Stylo, Taffy, Vello) but has no JavaScript binding yet; Lynx gives JS a native element tree, not a DOM [W] |
| 2-bis | UI frameworks through their custom renderer API (Vue `createRenderer`, the React reconciler, Preact's options) onto `zinc:ui` nodes directly | Vue, React, Preact component code | medium; no DOM emulation at all, which is how React Native and Lynx work |

Level 2 is the "crazy" part: it is a browser engine's layout and style system, bounded by the CSS subset we choose. Level 2-bis gets most of its value at a fraction of the cost. At levels 1 and 2 the boundary speed matters most: a DOM library makes thousands of small calls per frame.

## 6. Precedents and warnings [W]

- **scriptc 0.2** had exactly this fallback (`--dynamic` embedded QuickJS for the code and packages that did not compile); **0.3 removed it** to compile everything natively. Their documents give no reason. Worth asking them before committing to the design.
- **React Native** went the same way as Zinc's own `zinc:script` work: from a JSON bridge to direct C++ (JSI), then to faster shapes (HostFunction, NativeState).
- **NativeScript** chose Node-API to switch engines; the cost is about 3x JSC's C++ API per call (7 ns against 2 ns).

## 7. Steps, each with a gate [I]

1. **Engine layer over QuickJS**, the existing bindings moved onto it. Gate: every QuickJS and webenv test identical, `tools/bench-bridge` no slower.
2. **Generated typed bindings**: strings, objects as handles, zero-copy buffers in the fast path (the "not done" items of `script-boundary-optimisation.md`), plus ZN-596's typed fast calls. Gate: numbers, strings and buffers within 1.5x of the 0.040 µs floor; one cross-boundary cycle test that does not leak.
3. **`import` of a JavaScript package from `.ts`** with bindings from its `.d.ts`. Gate: kirari's published JavaScript and matter-js driven from a typed program, the same output as on QuickJS alone.
4. **JavaScriptCore on macOS** (ZN-586, D110). Gate: the four demos measured, the cost of a call through the layer on JSC against its JIT gain.
5. **DOM level 1**, then 2-bis; level 2 only if a product needs DOM UI libraries.

Decisions this touches: D22 (`zinc:script`'s JSON contract), D44 (the boundary plan), D110 (JSC optional, QuickJS reference), D83 (the web environment). A decision record would score step 1-3 against the status quo with `RULES.md` §4.
