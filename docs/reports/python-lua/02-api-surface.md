# Python / Lua for Zinc: what must be reached, and how it is written today

Read-only study, 2026-11-04, tree of `develop` (uncommitted work present, not touched). All counts come from `wc`/`grep`/`find` runs on this tree; the
scripts were throw-away. "Lines" = physical lines. Vendored code is separated out where it matters.

## 0. The short answer

- The surface a foreign program reaches is **three layers**, and only the lowest is native:
  1. **The host table**: `zinc:gfx`, `zinc:sys`, `zinc:fs`... are Zinc source embedded in C++ strings (`src/frontend/modules.cpp:37` onward, 4075 lines)
     over about **332 distinct `__host_*` functions**, plus the **329-entry `ZN_RUNTIME` table** of string/array/Map operations (`include/zn/runtime.h`). Declared
     for humans in `lib/gfx.d.ts` (265 lines, 121 functions) and `lib/modules.d.ts` (349 lines, 115 functions, 14 modules). Signatures are scalars, strings, flat arrays, callbacks.
  2. **`lib/std`** (15 855 lines of TS/TSX, compiled with the user's program): the UI is entirely here (`ui.ts` 7805 lines), as handle-based calls (`i32` node ids).
  3. **Plugins** (81): TS wrappers over a native ABI described by a per-plugin `*.spec.ts` (machine-readable in a restricted sense, see 2).
- JSX is **not** a reactive-model transform. It lowers to plain function calls that return integer node handles; reactivity is closures passed to
  `_dynTextOf` etc. A Python or Lua front end can call the same functions with no compiler help (section 1.3).
- The public API is **not described by any neutral schema** (no IDL, no JSON). The only parseable description is TypeScript itself (`.d.ts`, `*.spec.ts`, `index.ts`).

## 1. lib/std

### 1.1 Inventory (measured)

`find lib -name '*.ts' -o -name '*.tsx'` = **20 905 lines** (incl. fonts-free; of which `lib/std` 15 855 per the glob below, `lib/*.d.ts` 989, editor plugins, compat).

| Group | Files | Lines |
|---|---|---|
| `lib/std/*.ts(x)` top level | 39 files in `lib/std` | ui.ts 7805, web.ts 2267, gl.ts 888, stage.ts 824, animated.ts 426, fetch.ts 420, solid.ts 367, react.ts 296, markdown.ts 237, subtle 202, xml 199, worker 188, dnd 186, acme 156, i18n 142, path 108... |
| `lib/std/kit` (shadcn-like, `zinc:ui/kit`) | 27 | 2160 (biggest: keyboard.tsx 282, imageviewer.ts 272, overlays.tsx 202) |
| `lib/std/nuxt` (Nuxt UI 4 port, `zinc:ui/nuxt`) | 8 | 849 (+NOTICE) |
| `lib/std/system` | 17 | 61 (thin) |
| `lib/std/platform` | 2 | 202 |
| `lib/zinc.d.ts` (globals, lib.d.ts replacement) | 1 | 374 |
| `lib/gfx.d.ts`, `lib/modules.d.ts` | 2 | 265 + 349 |
| `lib/ui.d.ts` | 1 | 1 (a comment: "declared when the UI layer lands"; ui has no .d.ts, its types are the source) |
| `lib/compat/pocketjs` | 6 | (compat shim) |

Export counts (grep `^\s*export` over `lib/std` + `lib/*.d.ts`, 91 files): **1362** export lines, of which 910 `export function`, 189 `export class`,
90 `export interface`, 62 `export type`, 10 enums. `ui.ts` alone: 230 `export function`; `solid.ts` 54; `react.ts` 39; `stage.ts` 14.

### 1.2 Native or compiled-with-program?

- **zinc:gfx and other `zinc:*` built-ins are not TS files on disk**: `src/frontend/modules.cpp:37` says "The host's modules ('zinc:gfx'), written in
  Zinc over the __host_* functions of the runtime table (zn/runtime.h, owner "host")". Others in the same file: `zinc:events`, `zinc:osc`, `zinc:mqtt`, `zinc:gpio`,
  `zinc:telemetry`, `zinc:platform` (generated from `targets/capabilities.json`, modules.cpp:1420), `zinc:icons/lucide`. The `.d.ts` files are documentation for the LSP
  (`src/lsp/lsp.cpp:215,329` reads `lib/gfx.d.ts` + `lib/modules.d.ts` for hover).
- **`lib/std/*.ts` is real TS source that is compiled together with the user's program** (parsed, checked, lowered to IR, AOT or interpreted; or
  stripped and run by QuickJS). A foreign language has to either call it (needs the compiler to be in the loop, i.e. a Python front end that emits the same IR), or reimplement it.
- UI sits on one host layout engine via `zinc:__layout` (`ui.ts:22`, `src/host/layout.h`) in `rn` mode, plus `zinc:gfx` drawing calls (`ui.ts:5-12` imports ~100 gfx functions).

### 1.3 JSX, reactivity, hooks: how much is TS a foreign language touches

- Lowering: `src/frontend/jsx.cpp` (**1799 lines**; header comment lines 1-5: "a .tsx source is rewritten to plain calls on the zinc:ui/solid (or zinc:ui/react)
  helpers before it is parsed ... Solid mode: dynamic expressions become fine-grained effects; React mode: a component re-renders as a whole"). It works on the token stream
  and substitutes source text, keeping line breaks. Entry `lowerJsx` at jsx.cpp:1721.
- Tags: only 8 intrinsic host elements, `kTags` (jsx.cpp:26): `View 0, Text 1, Button 2, Image 3, ScrollView 4, Canvas 5, Input 7, TextArea 8`
  (fragment/wrapper = 6). Every other capitalised tag is a plain function call `Comp({props})` returning `i32`.
- Compile-time checks done in the compiler, not at run time: `className` is validated against the Tailwind-like grammar (`validClass`, jsx.cpp:89; mirrored at run time by
  `applyToken`, `lib/std/ui.ts:2510`); `style={{...}}` CSS-like objects become numeric style ops (jsx.cpp:157-400); lowercase tags and `class` are errors Z0007/Z0006 (jsx.cpp:1438, `src/lint/migrate.cpp:496`).
- **Is the reactive model compile-time dependent? Mostly no.** The compiler only (a) turns JSX into node-handle calls, (b) wraps each dynamic expression in an
  arrow `() => expr` and picks `_dynText/_dynClass/_dynNum/_show/_for`. The signal graph is an ordinary library: `createSignal<T>(v): [() => T, (v:T)=>void]` (`lib/std/solid.ts:117`),
  `createEffect` :121, `createMemo` :128, `untrack` :144, `batch` :151, `onMount` :166, `render(app, bg, onTick)` :335; React mode `useState` `lib/std/react.ts:111`, `useEffect` :127, `useReducer` :118.
  A Python/Lua program can call `_el`, `_class`, `_append`, `_dynTextOf` and `createSignal` directly with lambdas/closures.

Before and after (measured with `ZN_DUMP_JSX=<path substring> zinc run`, modules.cpp:2290; headless, 1 frame):

```tsx
// before
const [n, setN] = createSignal(0);
function App(): i32 {
  return <View className="p-4 gap-2 bg-slate-900"><Text className="text-white">Count {n()}</Text><Button onClick={() => setN(n() + 1)}>Add</Button></View>;
}
```
```ts
// after (an import line of ~35 helper names is prepended; omitted)
const [n, setN] = createSignal(0);
function App(): i32 {
  return ((): i32 => { const __n0: i32 = _el(0); _class(__n0, "p-4 gap-2 bg-slate-900");
    const __n1: i32 = _el(1); _class(__n1, "text-white"); _dynTextOf(__n1, () => `Count ${n()}`); _append(__n0, __n1);
    const __n2: i32 = _el(2); _on(__n2, () => setN(n() + 1)); _text(__n2, "Add"); _append(__n0, __n2); return __n0; })();
}
```

With components, `Show` and `For` (same method): `<Show when={c}>` becomes `_show(parent, () => c, () => (<branch>), null)` (`solid.ts:233`), `<For each={xs}>{fn}</For>`
becomes `_for(parent, () => xs, (item) => ..., indexed)` (`solid.ts:255`), and `<Row name={s}/>` becomes `_append(n, Row({ name: s }))`. Props are one object, `children` is a thunk `() => i32`
(`lib/std/nuxt/controls.tsx:15-18`, `ButtonProps`). In Python/Lua: no transform needed beyond writing `Row({name=s})`; the part that needs help is the JSX syntax itself (a DSL or builder functions).

What a foreign language must call or reimplement for UI: the ~35 `_*` helpers of `solid.ts` (the "JSX runtime", 367 lines) + the signal graph (same file) + `ui.ts` node ops
(`createNode`, `insert`, ... over handles, 7805 lines, of which the `className` grammar `applyToken`, layout, input, tweens are the bulk) + optional kits (kit 2160, nuxt 849 lines) that are
plain components. Everything crossing the language boundary is an `i32`, a string, a number, a boolean or a closure.

## 2. Plugins

### 2.1 How an API is declared and bound

`plugins/<name>/`: `plugin.json` + `index.ts` (the public module, `"module": "zinc:qrcode"`) + `native/` (C/C++/ObjC/Java) + optional `*.spec.ts`.

- `plugin.json` is parsed by `src/frontend/plugin_manifest.cpp` (411 lines, yyjson): keys `name, kind (module|display), module, entry, modules{subpath->file}, targets{<t>:{sources,...}}, requires, ...`.
  It describes **build and module wiring, not API types**. Example `plugins/qrcode/plugin.json` (14 lines).
- The native binding declaration is the **spec**: `plugins/qrcode/native/qrcode.spec.ts` is a TS `interface Spec extends NativeModule { encode(text: string, ecc: i32, maxVersion: i32): u8[] }`
  plus `export default requireNative<Spec>('Qrcode')`. `src/frontend/native_gen.cpp` (599 lines, uses the real parser) reads it and generates the C header `zinc_native_<name>_abi.h` and the
  export table; the C side implements `int32_t zn_qrcode_encode(void*, ZnCtx*, const ZnVal* args, ZnVal* ret)` (`qrcode.abi.c`, `include/zn/native.h:34-50`: 16-byte `ZnVal` union, callbacks via `cb_call`/`cb_post`).
- Signature alphabet of a native export, `include/zn/native_sig.h`: params `s i u b d` (string, i32, u32, bool, f64), `B I D U` (u8[]/i32[]/f64[]/u32[]), `S` (string[] in),
  `c(params>res)` callback; results `n s i u b d B I D` or `P<t>` (promise). Plus records (interfaces/aliases, ZN-850, `include/zn/rec.h`). No unions of objects, no generics, no overloads at the native edge.
- Older 4 plugins use `native/*.next.ts` stand-ins instead (devtools, process, socket, video).

### 2.2 Is there a machine-readable description?

Only TypeScript. Three sources, none neutral:
1. `*.spec.ts` (native edge): **54 files, 2320 lines**, in 53 plugins. Parsed by the engine's own parser: the best input for generating a Python `ctypes`/Lua FFI stub (small, regular alphabet).
2. `plugins/*/index.ts` (public API): exports mix thin wrappers, classes, helpers. Only recoverable by a TS parser. `zinc doc` (`src/doc/api.cpp`, 472 lines) already extracts "exported functions, classes, interfaces,
   types and constants with their signatures and doc comments; a plugin's native spec" into HTML, and `zinc doc --cheatsheet` prints **322 entries** for the built-ins (`docs/cheatsheet.md`, 375 lines): so an internal signature model exists, but there is no JSON output mode.
3. Docs: `docs/plugins/*.md` (59 files, prose).
No OpenAPI/IDL/JSON-schema/protobuf. `tools/dts-walk` parses `lib/zinc.d.ts` with regexes (a Python script) and is the nearest "generate probes from the declarations" precedent.

### 2.3 Thin natives vs TS logic (81 plugins: 70 `module`, 11 `display`)

Measured per plugin (TS lines excluding `vendor/`, `node_modules/`, `*.spec.ts`, `*.d.ts`; native = `.c .cpp .mm .h .java .m` excluding vendor):

| Total | Lines |
|---|---|
| Plugin TS (own code) | **27 838** |
| `*.spec.ts` | 2 320 |
| Plugin native code (own, non-vendor) | 51 377 |
| Plugin-authored `.js` | 1 498 (3d 374, gphoto2 218, map 184, audio 125, system 111) |

| Class | Count |
|---|---|
| With a spec (native edge) | 53 |
| of those TS <= 150 lines (thin wrapper) | 17 (device imageio imu-qmi8658 lan leapmotion mapping markdown pdf photos qrcode secure-store serial sf-symbols shell svg webos webview) |
| of those TS > 150 lines (real logic over natives) | 36 |
| No spec, has TS | 17 (all pure TS, no native: editor, sonos, trieur, ...) |
| No spec, native present | 11 (the `display` kind, native without a TS spec) |

Biggest TS: three 2330, editor 1625, devtools 1506, 3d 1419, system 1268, webrtc 1092, sonos 1024, trieur 907, ink 884, canvas2d 860, socket 717, ipod 670.

**Vendored/third-party that would inflate counts** (excluded above): `third_party/three` = **89 199 lines** of real three.js JS (2.2 MB), run by QuickJS (`examples/js-three`).
Note `plugins/three` is a *different thing*: a **typed Zinc re-implementation of the three API** in TS (index.ts 1582 lines, 2330 with addons, plus 8594 lines native)
so that three-style code runs natively; the real JS three is the QuickJS path. Also `plugins/script/vendor/quickjs` (QuickJS-ng), `plugins/lvgl/vendor`, etc. contain no
countable `.ts`.

Takeaway: about two thirds of plugins (53/81) have a spec-describable native edge; about 44% (36/81) carry TS logic a foreign language would have to
reimplement or call (classes with state, helpers, async), not only wrap.

## 3. TypeScript features in public signatures

Method: over `export ...` lines only (`^\s*export`): 91 files of `lib/std`+`lib/*.d.ts` (1362 export lines) and 124 plugin `.ts` files (own code, no native/vendor/web, 1414 export lines).
Lines matching, std / plugins (a line can count in several rows; rough frequency, not exact semantics):

| Feature | std | plugins |
|---|---|---|
| `export function` | 910 | 737 |
| `export class` | 189 | 292 |
| `export interface` | 90 | 104 |
| `export type` (alias) | 62 | 40 |
| `enum` (`const enum` incl.) | 10 | 9 |
| generics `<T>` / `<T extends>` | 48 | 40 |
| callbacks `=>` in the line | 182 | 42 |
| optional `?:` | 106 | 31 |
| unions ` \| ` | 31 | 63 |
| `Promise<` | 14 | 126 |
| `async` | 4 | 52 |
| object-literal option bag in a param (`(.. : { .. })`) | 19 | 2 |
| tuple return (`): [`) | 3 | 0 |
| rest params | 2 | 1 |
| `Map<`/`Record<` | 1 | 3 |

Whole-tree extras: `class ... extends` **121** (one inheritance tree is plugins/three: Object3D, Matrix4 ...). Real overloads: **none found** (the 14 repeated names in `lib/modules.d.ts`
are the same verb in different `declare module` blocks: `read/write/send/get/...`). Conditional/mapped types: `keyof|infer|... extends ? :` 9 hits, `Partial|Pick|Omit|ReturnType` 1 hit: practically absent. Zinc's strictness (machine types `i32 u8 f64 fx12`, no `any`, `strict`)
already keeps the signatures mostly first-order.

Consequence: the dominant shapes are (1) functions over scalars/strings, (2) option-bag objects with optional keys, (3) callbacks, (4) classes with methods, (5) `Promise`
in plugins. Generics and unions are rare but concentrated in the UI core.

### Five hardest signatures to express

1. `createSignal<T>(v: T): [() => T, (v: T) => void]` (`lib/std/solid.ts:117`): generic + tuple of *getter function* and setter. Python: `get, set = create_signal(0)` works dynamically but loses type checking
   (needs `Generic[T]`, `tuple[Callable[[], T], Callable[[T], None]]`); Lua: returns two closures, fine, no types. The semantic hard part is tracking: reading `n()` inside an effect subscribes, which is
   dynamic scoping implemented in `solid.ts` globals (`current`/`owner`), portable, but Python generators/threads/asyncio and Lua coroutines could break the "current computation" global.
2. `_for<T>(parent, each: () => T[], render: (item: T, i: i32) => i32, indexed?: boolean)` (`solid.ts:255`): generic list diff keyed on item identity (`keys: T[]`). Identity of Python ints/str and Lua
   tables/strings differs (interned strings, value equality for numbers); keyed reconciliation semantics must be restated.
3. `ButtonProps` (`lib/std/nuxt/controls.tsx:15`): 13 optional keys, `onClick?: () => void`, `children?: () => i32`, `className?: string`. One options object that is also the "component props" convention
   (`Comp(p: Props): i32`). Python: `TypedDict(total=False)` or kwargs (kwargs map well); Lua: a table with nil-vs-false ambiguity for `square?: boolean` and `p.disabled ?? false` (`??` semantics on `nil`/`false`).
4. Native promise edge: `P<t>` results (`native_sig.h`) and `Promise<PermissionStatus>` wrappers (`plugins/camera/index.ts:28`, `gphoto2/index.ts:24-45`, 126 `Promise<` lines in plugins). Needs an event-loop story: the
   engine settles promises on its loop (libuv); Python `asyncio`/Lua coroutines need their own bridge so that `await` resumes on the engine's thread with the GIL / Lua state owned correctly.
5. Zinc machine types as part of every signature: `u8[]`, `i32`, `u32` colour (`clear(color: u32)`, `gfx.d.ts`), `f32`, `fx12`/`fx16` fixed point (`lib/zinc.d.ts:5-8`). Lua 5.3+ has int/float, Lua 5.1/LuaJIT has doubles only
   (no true u32/i64); Python ints are unbounded (wrap rules needed, `u8[]` is `bytearray`/`array`). The AOT-to-C++ path depends on these annotations for speed; untyped Python/Lua code can only use the interpreter/QuickJS-like dynamic path.
   (Honorable mention: `Spec extends NativeModule` + `requireNative<Spec>('Qrcode')` is a generic call whose *type argument* is the binding declaration: a generator cannot get it without parsing TS.)

## 4. Examples, templates, apps

Measured by `find`, own `.ts/.tsx` only (no `node_modules/build/dist/vendor`, no `.d.ts`). Dirs with zero TS are JS or asset-only (10 of 152).

| Folder | Dirs | TS/TSX lines |
|---|---|---|
| `examples/` | 121 (+ GUIDELINES.md) | 176 351 |
| `templates/` | 15 (3d canvas cli dashboard desktop-app eink game game-2d iot iot-board plugin remarkable server service stage) | 1 295 |
| `app/` | 16 (atelier devicesim figma-live hub hub-server inspector lumen maison markdown pdf riffle sidecar sidecar-screen sonos-lastfm web web-relay) | 17 201 |
| Total | 152 | 194 847 |

Largest: carnet-nbe 33 997, music-tree 14 545, hamlet 14 015, ipod 13 614, museum-table 10 429, discord 8 912, pixel-plays 8 442, pinball3d-editor 5 936, agents 4 773, atelier 4 408, inspector 3 697.

Style (142 dirs with TS; import-based classification, a dir can be in several):
- imports `zinc:ui` (JSX/signals; 72 dirs have `.tsx` files): **70** dirs; of those 33 use the Nuxt/kit components (`zinc:ui/nuxt`, `zinc:ui/kit`).
- `zinc:gfx` immediate mode / display tree, **no** `zinc:ui`: **51** dirs (e.g. music-tree 14 545 lines, hamlet, pixel-plays, music, bouncing-ball, breakout).
- both: 49. Neither (plain logic/service/plugin/CLI/hardware): 21.
- React Native preset (`react-native`/`zinc:ui/react`): 13 dirs (rn-showcase, rn-port, rn-tester, discord...).
- Plain JavaScript on QuickJS, no TS at all: `examples/js-three` (69 lines of `main.js`, real `three` + `OrbitControls` + `GLTFLoader`), `js-p5`, `js-phaser`, `js-pixi`, `js-gsap`, `js-spline`, `js-anatomy`.
  (so the engine already hosts a second language, JS, via QuickJS: `src/qjs/`, `zinc run --engine quickjs`, `zinc bundle`.)
- three.js-style 3D through the typed `plugins/three`: 43 dirs mention it (the grep is loose).

### Three representative excerpts

**UI/JSX app shell** (`templates/desktop-app/src/main.tsx`, 45 lines; `state.ts` 22 lines is all `createSignal`):
```tsx
import { render, Show } from 'zinc:ui/solid';
import { theme, hex, DashboardGroup, DashboardSidebar, Button, DropdownMenu, Avatar, addToast } from 'zinc:ui/nuxt';
function App(): i32 {
  return <View className={`w-full h-full bg-${hex(theme().bg)}`}><DashboardGroup>
    <DashboardSidebar collapsed={collapsed} header={() => <View className="flex-row items-center gap-2">...</View>} ...>
      {renderNav()}
    </DashboardSidebar>
    <DashboardPanel ...><Show when={page() === 'Home'}><Home /></Show> ... </DashboardPanel>
  </DashboardGroup></View>;
}
render(App, 0xffffff, (dt: number) => {});
```
**Game loop, display-level, zinc:gfx only** (`examples/bouncing-ball/src/main.ts`, 37 lines + ball.ts 64 + hud.ts 43):
```ts
import { onFrame, clear, rect, width, height, isDown, wasPressed, pointerDown, pointerX, pointerY, Btn } from 'zinc:gfx';
const balls: Ball[] = [new Ball(width() / 2, 20)];
function draw(): void { clear(BACKGROUND); for (const ball of balls) rect(ball.x, ball.y, ball.size, ball.size, ball.color); hud.draw(); }
onFrame((dt: number) => { handleInput(); for (const ball of balls) ball.update(dt, width(), height()); hud.tick(balls.length); draw(); });
```
(This is the easiest port target: ~15 gfx calls, one callback, no generics.)
**Plugin use** (`examples/esp32-qrcode/src/state.ts` + `view.ts`): `import { encode, QrCode } from 'zinc:qrcode';` then `state.code = encode(TEXTS[i])` (a class with `.size`, `.module(x,y)`, `.runs(y)`) and
`rect(...)` per run from `zinc:gfx`. The plugin is 1 TS file over `qrcode.abi.c` (the native spec shown in 2.1).

## 5. What assumes TypeScript outside the compiler

Measured: no `.py` or `.lua` source recognised anywhere (grep `\.py|\.lua` in `src/` hits only the web export's `serve.py`, `cli_web.cpp:859`). Entry file resolution `entryOf` (`src/frontend/project.cpp:660-672`)
tries `src/main.ts`, `src/main.tsx`, `main.ts`, `main.tsx` plus `zinc.json "entry"`.

| Piece | Where, size | Assumption | To support a `.py`/`.lua` project |
|---|---|---|---|
| Project file, entry | `zinc.json` (`project.cpp`, 677 lines; `entryOf` :660; known keys :636) | `entry` may name any path; default candidates are `.ts/.tsx` | add `.py`/`.lua` to the candidates; `entry` already works for any file name once a front end claims the extension |
| Front end | `parser.cpp` 1725, `lexer.cpp` 312, `check.cpp` 5820, `jsx.cpp` 1799, `modules.cpp` 4075 | the whole pipeline is TS-specific (static types are the input of IR typing and AOT) | a Python/Lua front end is a new parser + type inference (or runtime dynamic path); not a flag. Cheapest route: embed (QuickJS-like VM: `plugins/script` + `src/qjs`) and expose `zinc:*` as host functions |
| `zinc new` templates | `templates/` (15 dirs, 1295 lines TS), `src/cli_core.cpp:110` and `:788` | copies the directory, substitutes `{{name}}`, writes `tsconfig.json`; `template.json` has `"entry": "src/main.tsx"` | new template dirs with `main.py`/`main.lua` + `template.json`; the copier is language-neutral; the `tsconfig` write (cli_core.cpp:788) must be skipped |
| `zinc tsconfig` | `cli_core.cpp:3083`, `src/frontend/tsconfig.cpp` 62 lines | editor setup for TS (`noLib`, lib files `lib/*.d.ts`) | replace by `pyrightconfig.json`/`.luarc.json` generation plus stubs (`.pyi`, EmmyLua `---@meta`) generated from the specs (section 2.2) |
| LSP | `src/lsp/lsp.cpp` 750 lines; `lsp.cpp:215,329` reads `lib/gfx.d.ts`+`modules.d.ts`; `:374,502` assume `.ts/.tsx` | uses the engine's own parser/checker for diagnostics, hover, go-to-definition, JSX line map (:283); one-language | do not extend it: ship `.pyi`/EmmyLua stubs and let pyright/lua-language-server do the work; keep `zinc lsp` for TS only |
| `zinc doc` | `src/doc/api.cpp` 472, `doc.cpp` 1146 (+ md 554, theme 393, highlight 225) | API extraction parses `.ts`; Markdown/MDX pages are language-neutral; highlighter (225 lines) knows TS | an API extractor for the new language (or ride the stubs); site/pages unchanged; add a code-fence highlighter |
| `zinc lint` / `zinc migrate` | `src/lint/lint.cpp` 453, `migrate.cpp` 627 | token-level TS/TSX rewrites (`jsx-classname` Z0006, `jsx-capitalised-tags` Z0007; migrate.cpp:496-497); skips `node_modules build dist .git third_party vendor .zinc` (:463) | not applicable (JSX rules); a separate linter (ruff/luacheck) for the user's code |
| `zinc explain` | `src/cli_core.cpp:123`, messages in `i18n/{en,de,es,...}/diag.json` (184 lines for en) | diagnostic codes `Zxxxx` with positions in TS source (jsx.cpp uses `i18n::message`) | codes are language-neutral text; new front end reuses the registry; messages that say "`className`", "capitalised component" stay TS/JSX-only |
| Bundler for QuickJS | `src/qjs/bundle.cpp`, `strip.cpp`; `zinc bundle` doc `cli_core.cpp:101` | strips TS types, lowers JSX, bundles with pinned esbuild | JS-only path; a Lua/Python project would instead ship the interpreter + sources as assets (as the `.zapp` fuse does, `docs/zapp.md`) |
| tsconfig handling in compile | `main.cpp:1287-1288`, `parseTsConfig` | reads `paths`, `moduleSuffixes` (Screen.android.tsx) | ignore for non-TS projects |
| Vite plugin | `packages/vite-plugin-zinc/index.js` 186 lines | regex `CODE = /\.(?:[cm]?[jt]sx?|json)$/` (line 11); runs `zinc dev --target web --prepare` | web only; extension regex would need `.py`/`.lua`, plus a web runtime for the language (Pyodide/Fengari): out of scope |
| Docs | `docs/` (10 650 lines in `docs/guide/*.md` + `docs/*.md`; 59 plugin pages; 27 files mention `tsconfig`) | every example is TS/TSX; `AGENTS.md` bans `class`/lowercase tags | a parallel guide per language, generated from the stubs; the JSX rules (className, capitalised components) have no Python/Lua analogue unless a DSL is added |
| Skills / agents | `.agents/skills/zinc-app`, `zinc-demo`; `examples/GUIDELINES.md` | encode the TS/JSX style | per-language variants |

## 6. Facts worth keeping

1. `zinc:gfx` and friends are not on disk as TS: they are Zinc source strings inside `modules.cpp` over ~332 `__host_*` calls; the `.d.ts` files are only for editors.
2. JSX lowering is a token-level text rewrite to ordinary function calls returning `i32` handles; reactivity is a plain closure-based library (`solid.ts`, 367 lines), so a foreign UI binding needs no compiler support.
3. The only machine-readable API descriptions are TypeScript: 54 `*.spec.ts` (2320 lines) for natives, a tiny type alphabet (`s i u b d B I D U S c() P`) that maps cleanly to Python/Lua FFI; `zinc doc` has an extractor with no JSON output.
4. `plugins/three` (typed TS re-implementation, 2330 TS + 8594 native lines) and `third_party/three` (89 199 lines of real three.js on QuickJS) coexist: the engine already runs a second language (JS) beside TS.
5. Plugins counted 81 on disk (AGENTS.md says 58). No `.py`/`.lua` handling exists in the front end, LSP, doc, lint or templates; `entryOf` only tries `.ts/.tsx` defaults (`project.cpp:660`).
