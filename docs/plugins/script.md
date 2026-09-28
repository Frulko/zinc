# zinc:script — runtime scripting

`zinc:script` runs JavaScript inside a Zinc app: user scripts, game mods, live-coded visuals, rules that change
without a rebuild. A `Script` is a sandboxed context. It sees the language built-ins and the functions the host
exposes, and nothing else: no files, no network, no timers. Values cross as `Dyn`. Script errors come back as
`ScriptError` with the script's file, line and stack. Memory and time limits stop runaway scripts without taking
the app down.

The engine sits behind an interface, `ScriptEngine`:
- **`quickjs`** is the only engine today: [QuickJS-ng](https://github.com/quickjs-ng/quickjs) v0.17.0, vendored
  in `plugins/script/vendor/quickjs`.
- **`zinc-vm`** is reserved for the Zinc VM ([docs/reports/zinc-vm.md](../reports/zinc-vm.md)); see
  [The Zinc VM engine](#the-zinc-vm-engine).

![Script playground](../img/script-playground.png)

```sh
zinc run examples/scripting/playground      # live-coding: editor, canvas driven by the script, console
zinc run examples/scripting/breakout-mods   # breakout whose rules come from assets/rules.js
zinc run examples/scripting/bench           # the measurements below
```

## Availability

| target | engine | notes |
|---|---|---|
| macos, linux, rpi1, rmpp | QuickJS-ng, compiled into the program | `plugin.json` `requires: ["heap>=4M"]` |
| sim | `node:vm` with the same API and the same observable behaviour on the tested subset | see [The sim](#the-sim) |
| esp32, ps1, ps2, wasm | not available (`Z5003`, or `Z5005` for profiles under 4 MiB of heap) | ESP32-S3 with PSRAM is possible, see below |

The conformance programs print the same bytes as the sim on macOS (release, and `--debug` with ASan) and on the
cross targets under Docker / QEMU:
- rpi1: ARMv6, musl, where QuickJS uses its 32-bit NaN-boxed values;
- rmpp: aarch64, static.

The plugin is compiled only into programs that import it. On macOS arm64 it adds about **1 MB**: a program with
one `eval` is 1081 KiB, against 73 KiB for the same program without it (script_basic: 1195 KiB on rpi1, 2088 KiB static on rmpp). QuickJS is C, so the build compiles
`.c` plugin sources into their own static library with C flags (`compiler/src/cli.ts`).

## API

```ts
import { Script, ScriptError, ScriptFunction } from 'zinc:script';

const vm = new Script({ engine: 'quickjs', memoryLimit: 8 << 20, timeLimitMs: 50 });
vm.expose('log', (msg: string) => console.log('[script]', msg));        // host functions, typed signatures
vm.expose('setColor', (r: i32, g: i32, b: i32) => { color = rgb(r, g, b); });
vm.set('config', { speed: 1.5, name: 'demo' });                          // data in (a copy)
const r: unknown = vm.eval('1 + 2');                                     // 3
vm.load('mod.js', 'export function onTick(dt) { return dt * 2; }');     // ES module
vm.call('onTick', [0.016]);                                              // globals, then module exports
const v = await vm.evalAsync('fetchLevel(3).then(l => l.name)');         // promises settled on the event loop
```

| member | |
|---|---|
| `new Script(options)` | `engine` (`'quickjs'`), `memoryLimit` (bytes, default 16 MiB, 0 = none), `timeLimitMs` (per entry, default 1000, 0 = none), `stackSize` (default 512 KiB), `importAssets` (default false) |
| `expose(name, fn)` | a global function of the script. `fn` is any function whose parameters are annotated `number` (or a machine number such as `i32`), `string`, `boolean` or `unknown`; arguments are converted like JavaScript does. Its result goes back as a `Dyn`, and a throw becomes an `Error` of the same name in the script |
| `exposeAsync(name, fn)` | `fn: (args: unknown[]) => Promise<unknown>`: the script gets a promise, settled when `fn`'s promise settles (rejections become `Error`s in the script) |
| `set(name, value)` / `get(name)` | copy a value into or out of a global |
| `eval(src, file = 'script.js')` | runs a classic script and returns its completion value |
| `evalAsync(src, file)` | like `eval`; a promise result is followed, and the returned `Promise<unknown>` settles with it |
| `define(name, src)` | registers an ES module for `import` without running it |
| `load(name, src)` / `loadAsset(name)` | runs an ES module (from a string, or from the app's assets); its exports become reachable by `call` and `fn` |
| `call(fn, args)` / `callAsync(fn, args)` | calls a global function, else an export of a loaded module (latest first) |
| `fn(name)` | a `ScriptFunction` handle on a function, or null. `handle.call(args)`; `handle.release()` |
| `toFunction(v)` | a handle on a function value that came out of the script (e.g. a callback passed to a host function), or null |
| `interrupt()` | stops the running script at its next check (from a host function) |
| `memoryUsed()` | bytes allocated by the engine |
| `dispose()` | frees the context; pending async results reject. A context that is never disposed is freed at exit |
| `engine` | the `ScriptEngine` behind the facade |

### Typed host functions: `DynFunction`

`expose` takes a `DynFunction`, a compiler intrinsic declared in `lib/zinc.d.ts`. At run time it is
`(args: unknown[]) => unknown`. When a typed function is passed where a `DynFunction` is expected, the compiler
builds an adapter (`emit-cpp.ts` `dynFnAdapter`, `sim/zinc.mjs` `$z.dynfn`) that converts each argument:

| parameter | conversion (never a panic: the caller is untrusted script) |
|---|---|
| `number` | `Number(x)` |
| `i32`, `u8`, `f32`, … | `Number(x)`, then the machine type (`\| 0`, `& 255`, `Math.fround`) |
| `string` | `String(x)` |
| `boolean` | `!!x` |
| `unknown` | as is (a `Dyn`) |

A missing argument is `undefined`. The result is boxed into a `Dyn`, and `void` gives `undefined`. Other
parameter types, or parameters without an annotation, are compile error `Z9043`.

## Value model

Values are copied at the boundary. No object is shared between the script heap and the Zinc heap.

| script → host (`Dyn`) | host → script |
|---|---|
| number (int or float) → number | number |
| string, boolean, null, undefined → the same | the same |
| Array → `unknown[]` (element by element) | `any[]` → Array |
| plain object → Dyn object (own enumerable string keys, in property order) | Dyn object → object |
| function → an opaque handle object (`toFunction` makes it callable; passed back, it is the same function) | objects of Zinc classes → their JSON form (fields) |
| symbol → undefined; BigInt → number | |

Nesting deeper than 64 levels, cycles included, fails with `TypeError: value nested too deeply`. Dates, Maps and
class instances of the script arrive as their own enumerable properties, usually `{}`. Use JSON-like data.

## Errors

Every call that runs script code throws `ScriptError` (a Zinc `Error`, RT-05); the async variants reject with it.

| field | |
|---|---|
| `kind` | `'error'` (the script threw), `'syntax'`, `'timeout'`, `'memory'`, `'interrupted'`, `'host'` (bad use of the API, disposed context) |
| `type` | the script error's name: `TypeError`, `ReferenceError`, … (`''` when the script threw a non-Error value) |
| `message` | `"<type>: <message>"` (e.g. `ReferenceError: foo is not defined`), `Uncaught 42`, `script ran longer than 50 ms`, `out of memory (limit 8388608 bytes)` |
| `file`, `line` | the innermost script frame (0 for limits and host errors) |
| `stack` | the script frames, one per line: `at fn (file:line:col)` or `at file:line:col` (native and host frames removed) |

Error messages are the engine's own, apart from the limit messages, which are normalised. QuickJS says
`cannot read property 'x' of null` where V8 says `Cannot read properties of null (reading 'x')`. Programs that
need the same text on every engine should rely on `kind`, `type`, `file` and `line`.

## Limits and sandboxing

- **Time.** An *entry* is one host → script transition: `eval`, `call`, `set`, `get`, `load`, or settling an
  async result. The outermost entry arms a deadline of `timeLimitMs`, measured on the monotonic clock (not the
  deterministic virtual clock). QuickJS's interrupt handler checks it about every 10,000 bytecode operations.
  An expired script gets an uncatchable error, and the entry throws `kind: 'timeout'`. Nested entries share
  the deadline, for example a host function that calls back into the script.
- **Memory.** `JS_SetMemoryLimit`: allocations beyond it throw `out of memory` inside the script, which can
  catch it. If the script does not catch it, the entry throws `kind: 'memory'`. The context stays usable
  afterwards (tested).
- **Stack.** `JS_SetMaxStackSize` (`stackSize`): deep recursion throws `RangeError: Maximum call stack size
  exceeded`.
- **Interrupt.** `interrupt()`, called from a host function, stops the script at its next check with
  `kind: 'interrupted'`.
- **Sandbox.** The context holds the ECMAScript built-ins plus `queueMicrotask`, `performance.now`, `atob` /
  `btoa` (QuickJS also has `DOMException`), and nothing else:
  - no `quickjs-libc`, so no `std`, no `os`, no files, no sockets, no timers;
  - no `console`: expose a `log` function (the playground's prelude defines `console.log` on top of it);
  - imports resolve only to modules the host defined or loaded, or to the app's assets with
    `importAssets: true`.

  To give scripts web APIs (`fetch`, timers, …), expose them. `exposeAsync` over the host's `zinc:net` or
  `setTimeout` is the pattern: see `tests/conformance/script_async.ts`.

## Async

- A promise returned to the host (`evalAsync`, `callAsync`) is followed:
  - already settled: the Zinc promise settles on the next microtask;
  - still pending: the engine attaches reactions, and when the script's jobs settle the promise, the result is
    delivered through `onEvent` and the Zinc promise resolves or rejects.
- **Job pumping.** Before an outermost entry returns, the engine runs the script's pending jobs (promise
  reactions, `queueMicrotask`) under the entry's time limit. Script jobs therefore never run outside an entry.
  The Zinc event loop drives everything else: an `exposeAsync` host function settles when its Zinc promise
  settles, and that settlement is itself an entry, which pumps again.
- If a limit stops an entry's jobs, the async results that were pending in that context reject with the same
  error, since nothing would ever settle them.

## ES modules

- `define(name, src)` registers a module source; `load(name, src)` defines it and runs it.
- `import` specifiers are resolved like QuickJS's default normaliser: `./x.js` and `../x.js` relative to the
  importing module's name, anything else as is. They are looked up among the defined modules, then in the
  assets when `importAssets` is set; otherwise the import fails with
  `ReferenceError: could not load module '<name>'`.
- A module is evaluated once per context.
- After a `load`, the module's exports are visible to `call` and `fn`, after the globals.
- Module evaluation is synchronous: top-level `await` is not supported on the sim.

## The sim

`plugins/script/native/quickjs.sim.ts` implements the engine with `node:vm`:
- one context per `Script`, created with `microtaskMode: 'afterEvaluate'`, so jobs run inside the entry as they do
  in QuickJS;
- `timeout` on every evaluation, including calls, which go through a precompiled `vm.Script`;
- `vm.SourceTextModule` with synchronous `linkRequests` / `instantiate`. The plugin asks for
  `--experimental-vm-modules` through `targets.sim.nodeFlags` in `plugin.json`.

It reproduces the value conversion, the error descriptions (kind, type, message, file, line, normalised stack),
module name resolution and pending-result rejection. The conformance programs (`script_basic.ts`,
`script_async.ts`) print the same bytes on both sides.

Known differences:
- **No byte budget.** V8 cannot limit one context's memory. Only V8's own allocation failures
  (`Invalid string length`, `Array buffer allocation failed`) become `kind: 'memory'`. The tests use an
  allocation that fails on both engines (`'x'.repeat(2 ** 29)`). A slow runaway allocation hits the time limit
  on the sim instead.
- `interrupt()` takes effect when the running entry returns.
- `memoryUsed()` is 0; `stackSize` is ignored.
- `node:vm` is not a security boundary. The sim is for development and tests.
- The error text of engine-generated errors differs (see [Errors](#errors)).

## Measurements

`zinc run examples/scripting/bench`, Apple M1 Pro, macOS release build (median of the runs in the program):

| | QuickJS (native) | sim (node:vm) |
|---|---|---|
| binary size added | +1008 KiB (arm64, `-O2`) | – |
| `new Script()` | 69 µs, 89 KiB allocated | 260 µs |
| `eval` of a 1 KB script (parse + run) | 56 µs in a new context, 49 µs re-run | 20 µs |
| host → script call, `call('inc', [i])` | 0.14 µs | 2.0 µs |
| host → script call through a `ScriptFunction` handle | 0.12 µs | 1.9 µs |
| script → host call, `hostInc(x)` in a script loop | 0.08 µs (+0.04 µs over a script → script call) | 0.14 µs |
| `set` / `get` of 100 records `{ id, name, tags[2], score }` | 34 / 58 µs | 81 / 69 µs |
| runaway allocation against an 8 MiB limit | stopped after 10 ms, context usable | hits the time limit |

The call costs are the price of one entry: the deadline, a `Dyn` copy of the arguments and the result, and the
job pump. A `draw(t)` per frame that makes a few hundred host calls stays well under a millisecond. The
playground's samples draw at 60 fps.

## ESP32

Not enabled. Reaching the ESP32 would take:
- the IDF build compiling `.c` sources with C flags (today the generated `idf_component_register` passes C++ flags
  to every source);
- a PSRAM board (QuickJS needs a few hundred KiB for a context), with QuickJS's allocator in SPIRAM through
  `JS_NewRuntime2` and `heap_caps_malloc`;
- `requires: ["heap>=4M"]` lowered for that board.

The ESP32 profile is `strict`, where `unknown` must be narrowed before use, which the API already allows.

## The Zinc VM engine

`ScriptEngine` is the contract a second engine implements. Any engine must honour:
- **values**: `Dyn` in and out, copied, with the conversions of the [value model](#value-model);
- **errors**: a `ScriptError` of the right `kind`, and `file` / `line` of the innermost script frame;
- **limits**: per-entry time, a memory budget, an interrupt flag;
- **async**: jobs run inside entries, pending results reject when a limit cuts them off;
- **sandbox**: only what the host exposes.

The VM ([docs/reports/zinc-vm.md](../reports/zinc-vm.md)) is a typed register bytecode (`.zbc`) emitted from
MIR, with a Tier 0 interpreter that runs everywhere. It fits behind the interface as follows:

- **What it runs.** The VM runs *Zinc* (TypeScript), compiled ahead of time to `.zbc` by the Zinc compiler, not
  JavaScript source. `engine: 'zinc-vm'` gets:
  - `load(name, bytes)`, taking a verified bundle (the report's §6 verifier is the sandbox, and bundles are
    untrusted input);
  - `eval` of source only where the compiler is available (dev hosts);
  - otherwise the same API.
  Scripts get Zinc's typing, and at typed call sites they cross the boundary without `Dyn` copies.
- **Host functions.** A `DynFunction` adapter is already a `Fn<Dyn(Array<Dyn>)>`. The VM calls it through
  `CALL_AOT`, and a typed signature can later skip the `Dyn` array (an `abi.ts` thunk per exposed signature).
  Script functions handed to the host become `VmFn<Sig> : FnObj<Sig>` (report §6), a real Zinc closure, where
  QuickJS needs the opaque handle.
- **Errors.** The VM's `THROW` sets `zrt::g_err` (RT-05). The engine turns a pending error at the end of an
  entry into a `ScriptError`, and the bytecode location table gives `file` / `line`. Panics inside a script
  (bounds, null) must become `kind: 'error'` instead of aborting the host: the VM's panic hook unwinds to the
  entry.
- **Limits.** The time limit becomes a check on backward branches and calls (the interrupt handler's role). The
  memory budget becomes an arena or a per-context TLSF pool: the VM allocates on the Zinc heap, so the budget
  is a sub-heap, not a malloc limit.
- **Async.** Zinc async functions are heap frames (decision 0007) resumed by the shared microtask queue. The
  engine's "run jobs inside an entry" rule becomes: resume VM frames only inside entries, under the deadline.
- **Testing.** The conformance programs run with `engine: 'zinc-vm'` against the same `.out` files. Only the
  engine-generated error texts would need per-engine expectations, which is why the tests print `kind`,
  `type` and `line`.

Adding it touches `createEngine` in `plugins/script/index.ts` (one branch) and a `ZincVmEngine implements
ScriptEngine` class. The facade, the tests and the apps stay as they are.
