# JavaScript, TypeScript as written, and engines: research (2026-10-20)

Status: research only, nothing implemented. Asked by the owner in one conversation: can a real TypeScript library run unchanged on the typed engines, what scriptc teaches, how fast JavaScript can get, whether plain JavaScript can be compiled to C++, and whether typed Zinc can drive JavaScript libraries on an optional engine with a browser shim and a fast boundary.

| Report | Question |
|---|---|
| [typescript-as-written.md](typescript-as-written.md) | What the typed engines need to compile a real TypeScript library (kirari probe: 78 errors, by family, with the engine changes) |
| [scriptc-lessons.md](scriptc-lessons.md) | What Vercel's scriptc does and what transfers (same probe: 97-99% compiles there) |
| [js-speed.md](js-speed.md) | quickjs-oxide, test262 in Zinc, where V8's speed comes from, two ways to reach it |
| [js-aot-to-cpp.md](js-aot-to-cpp.md) | Plain JavaScript to C++ ahead of time: inference, profile-guided speculation, `Dyn`, restrictions |
| [hybrid-engines-dom.md](hybrid-engines-dom.md) | Typed Zinc natively + an optional JS engine + a browser shim, and the fastest boundary |
| [internal-survey.md](internal-survey.md) | The tree today: QuickJS uses, boundary costs, webenv, open tasks (sources: paths) |
| [external-survey.md](external-survey.md) | Engine APIs, call costs, abstraction layers, DOM shims, JS AOT (sources: URLs) |

Earlier work this builds on: [../research-2026-09-30/js-engines.md](../research-2026-09-30/js-engines.md), D44, D55, D56, D83, D110 in `docs/reports/zinc-next-decisions.md`.

## Conclusions

1. **TypeScript as written is the cheapest win.** A DOM-free TypeScript library fails on the typed engines for reasons that are gaps of Zinc's checker (truthiness, `&&` values, `Record`, inference, narrowing, generators with `next(v)`), none of them dynamic. Closing them family by family, measured on a corpus of real libraries and guarded so the AOT output of other programs does not move, keeps full native speed. The two parse errors (`export type … from`, `(typeof x)[number]`) also break the QuickJS path.
2. **V8's speed is its JIT, not its interpreter**: on Zinc's workloads the best interpreters stay within 2x of QuickJS, the JIT engines are 5-32x. Ways there: a JIT engine where the platform allows one (JSC on macOS, ZN-586), or speculative native code ahead of time (the only one that works on iOS and the consoles). The second is already decided for QuickJS itself (D110 route 1, ZN-723: a compiler of its bytecode, gate 2x on three.js and matter-js), bounded by QuickJS's runtime (43% of js-p5's script time) and by opcode coverage (Longbridge's quickjs-jit: 32-45x on kernels, 1.0x on applications).
3. **Plain JavaScript to C++ is possible** (Static Hermes, Hopc, scriptc) with documented restrictions, but its value depends on how much of real library code infers or speculates. Measure that first, with no engine code.
4. **The hybrid** (typed Zinc native, untyped libraries on an optional engine, bindings generated from the libraries' `.d.ts`) uses what exists (QuickJS, webenv, `zinc:script/fast`) and needs an engine layer, typed generated bindings and an ownership rule across the two memory models. scriptc tried an embedded-engine fallback and removed it in 0.3: worth understanding why before deciding.
5. **The DOM**: canvas and WebGL libraries already run; a DOM without layout (a proven library) opens the next group; UI frameworks are better served through their custom renderer APIs onto `zinc:ui` than through an emulated DOM with layout.

## Next measures (no engine change)

- `zinc check` coverage of three JavaScript libraries in the gradual profile: how much types, speculates, falls to `Dyn` (decides [js-aot-to-cpp.md](js-aot-to-cpp.md)).
- quickjs-oxide and QuickJS-ng on Zinc's 2,113 test262 tests and on the three.js and matter-js frames (decides whether a register-VM engine changes D44/D55).
- The per-call cost of JavaScriptCore's C API embedded in zinc against QuickJS's 20-45 ns (ZN-586's open question).
