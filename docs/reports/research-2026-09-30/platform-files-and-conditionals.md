# Platform-specific files and compile-time conditionals for Zinc TS (research, 2026-09-30)

Status: research only, nothing implemented. Tags: **[verified]** read in the repo or run here, **[web]** read from a
fetched page (link given), **[known]** from general knowledge, page not fetched, **[inferred]** my reasoning.
The tree is dirty; `frontend.ts` has uncommitted edits, but the platform feature itself is committed
(commit 55c06b2 "platform capabilities ... file.<profile>.ts variants") **[verified]**.

## 0. Summary

Zinc already has half of what is asked, and it is less finished than `docs/targets/capabilities.md` says:

1. **Platform files exist** (`foo.<profile>.ts`, then `foo.<target>.ts`), resolved by a post-resolution hook. No family
   chain, no board/chip tag, no `.native/.web/.desktop`.
2. **`zinc:platform` exists** (constants per capability), but it is **not a compile-time constant**: I ran it and the
   untaken branch is still type-checked, emitted to C++, its strings are in the literal pool, and MIR shows
   `load @TOUCH` (a runtime global assigned in `__init`). The doc line "the other branch is not compiled in" is only
   true if clang can prove it, and it cannot (the global is written at run time).
3. Recommended design: **prune at the source-file level in the frontend** (one pass, before TS type-check), so all
   four engines and every emitter see the same pruned program: dead branch not checked, not emitted, its imports not
   loaded, not linked. Keep the runtime constants as a safe fallback. Add a closed tag chain per target/chip/board,
   `Platform.{OS,target,chip,board,arch,is,has,select,isDev}`, `zinc check --all-targets`, and reuse the existing
   Z5003 module-availability check as the "unguarded platform API" lint (it becomes precise once guarded code is pruned).
4. Effort: about 4-6 engineer-weeks for M0-M4 (no editor); editor overlay adds about 1-2 weeks on top of the LSP work
   already estimated in `code-editor-lsp.md`.

## 1. What exists today

### 1.1 Module resolution and variants (frontend.ts)

| Fact | Ref |
|---|---|
| Only module that imports the TS API (`@typescript/typescript6`); other modules use re-exported `ts` | `compiler/src/frontend.ts:1-13` |
| `zinc:*` std modules are a static map to `lib/std/*.ts`, fed to TS as `paths`; PocketJS/`solid-js`/`react` aliases too | `frontend.ts:30-54` |
| Options: `moduleResolution: Bundler`, `noLib: true`, `strict`, `allowJs/checkJs`, `rewriteRelativeImportExtensions` | `frontend.ts:53-70` |
| Global mutable platform state `{target, profile, source}` set by CLI before `loadProgram` (blocks in-process multi-target checking) | `frontend.ts:121-126` |
| `zinc:platform` is a virtual in-memory file `lib/zinc-platform.gen.ts` mapped via `paths` | `frontend.ts:122-132` |
| Host `getSourceFile` already rewrites sources before parse (css imports, stylesheet, JSX lowering, Web-global auto imports), keeping diagnostic positions | `frontend.ts:142-165`, `webGlobals` `:84-117` |
| Custom `resolveModuleNameLiterals` calls `ts.resolveModuleName`, realpaths, then `platformVariant()` | `frontend.ts:166-167, 188-195` |
| `platformVariant(file)`: tries `<base>.<profile><ext>` then `<base>.<target><ext>`; skips `.d.ts`; only if the file exists on disk (not virtual) | `frontend.ts:197-208` |
| Virtual sources (`zinc build app.js`, `zinc infer`) are supported by `virtual` map | `frontend.ts:119-120, 135-139` |

Consequences **[inferred from the code]**: the variant hook also applies to `zinc:*` std modules and plugin modules
(they go through `resolveModule`), variants are per exact resolved file, `foo.esp32.ts` is not type-checked against
`foo.ts` (no parity check), variants of `.d.ts` are unsupported, and stock `tsserver` does not know about any of it.

### 1.2 Targets, profiles, capabilities

- `PROFILES` (number kind, size, typing, heap) for macos linux sim wasm rpi1 esp32 ps2 ps1 rmpp: `compiler/src/cli.ts:34-45` **[verified]**.
  `--profile` lets one target borrow another's profile (`o.profile = o.target` default): `cli.ts:99-133`.
- Capability table (hardware flags): `targets/capabilities.json` (keys: threads display touch pointer keyboard pen gamepad eink net fs audio gpu gpio process dynlib; values true/false/"plugin"/"optional").
  Compiler adds heap/numbers/fpu/width/height: `compiler/src/capabilities.ts:29-31`. Requirement grammar (`touch|pointer`, `!eink`, `heap>=256K`, `numbers=f64`): `capabilities.ts:41-53`.
- `zinc:platform` source generation: `capabilities.ts:75-90` (`TARGET`, `PROFILE` typed plain `string`; `HEAP_BYTES: i32`; one `boolean` per capability).
  Documented in `docs/targets/capabilities.md:55-70` and `cli.ts:975-977`.
- Requirements are enforced at build time (`zinc.json` `requires`, `plugin.json requires`, `@requires` module comments, `// zinc-test: requires`): `docs/targets/capabilities.md:38-53`, `cli.ts:134-140`.
- Boards: `zinc.json "board": "<id>"` merges `boards/<id>.json` (`all`, `targets.<id>`, `plugins`); `plugins.ts:33-60`, `docs/boards.md:22-30`. A board is data only: it never becomes a source-selection tag and is not visible to code.
- **Module availability table is separate and duplicated**: `MODULE_TARGETS` (`native.ts:18-26`), enforced as error Z5003 after emission for every module in `native.used` (`emit-cpp.ts:222-227`). `native.used` is filled when a call is emitted (`native.ts:93-100`), so today a call in a dead branch still counts **[verified by reading; consistent with the run below]**.
- User native modules pick C++ by `native/<name>.<target>.cpp`, with a `.host.cpp` fallback for macos/linux only, else error Z5002: `native.ts:146-158`. A second, independent "platform file" mechanism with a different fallback rule.
- HAL selection is in CMake generation, per target: wasm/macos/null HAL and `hal_posix.cpp` (`cli.ts:291-300`), esp32 lists `targets/esp32/hal_esp32.cpp` (`cli.ts:629`), ps1/ps2 pass `-DZINC_HAL_FILE` (`cli.ts:550,555`). Files: `targets/{common,esp32,macos,null,ps1,ps2,wasm}/hal_*.cpp`. So the C++ runtime is already selected by target, not by `#if`; only Zinc TS needs a chain.
- Runtime string `sys.platform()` returns `"macos" | "linux" | "rpi1" | "esp32" | ...`: `lib/modules.d.ts:10-11` (a runtime query, not foldable).
- Engines are a separate axis: `--engine native|zinc-vm|quickjs`, and non-native engines "require the host target" (`cli.ts:~127`, `compiler/src/engines.ts:14-16`). So today the engine never differs from the host target for zinc-vm/quickjs.

### 1.3 Const-eval, dead branches, `declare const`

- No compile-time evaluation in sema. `sema.ts` only records const-ness for widening (`sema.ts:696-701`).
- **MIR** (`compiler/src/mir.ts`) has constant folding with **branch pruning** and DCE (`mir.ts:1-5, 241-336`), but it is "an inspection stage, not the input of the C++ emitter" (`mir.ts:3`, ADR `docs/decisions/0013-hir-mir.md`); emit-cpp is direct AST to C++ (ADR 0004). emit-bc does consume MIR (`emit-bc.ts:4`). MIR only folds literals and arithmetic on them, not loads of module globals.
- `hir.ts:187` lowers `if` with no constant handling; `emit-cpp.ts:779-781` prints `if`/`else` verbatim; emit-js is an AST transformer (`emit-js.ts`).
- No `declare const`-based build defines, no `import.meta.env`, no `__DEV__`. Dev mode exists as `o.dev` (`cli.ts:31-33`) but code cannot branch on it at compile time.

### 1.4 Experiment (run here, scratch dir only; repo untouched)

Program: `if (TOUCH) log('touch-branch') else log('no-touch-branch')`, `if (TARGET==='esp32') log('is-esp32')`, and an import of `./helper` with `helper.esp32.ts` next to it.

| Command | Result |
|---|---|
| `zinc build main.ts --target esp32 --emit=cpp` | pulls `helper.esp32.ts` (namespace `m_helper_esp32`, returns "esp32-variant"): variants work **[verified]** |
| same, macos | pulls `helper.ts` **[verified]** |
| esp32/macos `--emit=cpp` | literal pool contains `touch-branch`, `no-touch-branch` **and** `is-esp32` on both targets; globals `bool TOUCH{}` assigned in `__init` (`TOUCH = true`) **[verified]** |
| `--emit=mir` esp32 | `%0 = load @TOUCH : bool; br %0 ? bb1 : bb2`, "branches pruned 0" **[verified]** |
| `--target sim --emit=js` | `zinc-platform.gen.js` and both variants emitted as normal modules **[verified]** |

So: type-check, emit, link and (probably) code size all include the dead branch. Only `platformVariant` selection is compile-time.

### 1.5 Usage today

Only one consumer of `zinc:platform`: `examples/pinball/src/ui/panel.ts:6,214`. No `*.esp32.*`/`*.rmpp.*` TS variants exist in the repo (the `*.<target>.cpp` files in `plugins/*/native/` are the C++ side). Docs: `docs/targets/capabilities.md`, `docs/guide/*` have no platform chapter **[verified via grep]**.

## 2. Prior art (web research)

| System | Mechanism | Relevant lesson |
|---|---|---|
| **React Native / Metro** | `Platform.OS` runtime; `Platform.select({ios, android, native, default})` prefers ios/android, then `native`, then `default`; files `.ios.js/.android.js/.native.js` imported without extension. [RN docs](https://reactnative.dev/docs/platform-specific-code) **[web]**. Metro `resolver.platforms` defaults `['ios','android','windows','web']`; extension precedence is documented in Metro "Module Resolution" [Metro config](https://metrobundler.dev/docs/configuration/) **[web]** | The file convention the user wants. `native` as a *group* tag is the useful idea. In RN, `Platform.OS` is a runtime value; dead-branch removal there comes from Babel/Metro inlining plus Hermes/minifier, not from the type-checker **[known]**. |
| **TypeScript `moduleSuffixes`** | `["\.ios", ".native", ""]` makes `./foo` resolve `./foo.ios.ts`, `./foo.native.ts`, `./foo.ts`; the docs say it is for React Native "where each target platform can use a separate tsconfig.json"; since 4.7 [tsconfig ref](https://www.typescriptlang.org/tsconfig/#moduleSuffixes) **[web]**. `customConditions` adds `exports`/`imports` conditions since 5.0 (same page) **[web]** | Stock `tsserver` can already understand a suffix chain with one tsconfig per target. Zinc can generate those tsconfigs. Zinc still needs its own hook for `zinc:*`/plugin/virtual modules. |
| **esbuild** | `define` substitutes constants and, with tree shaking, removes dead `if` branches; `platform`, `conditions`, `resolveExtensions` [esbuild API](https://esbuild.github.io/api/) **[web]** | Define + DCE is the standard cheap model: replace, then fold. |
| **webpack DefinePlugin** | direct text replacement; `if (!PRODUCTION)` removed by the minifier [webpack](https://webpack.js.org/plugins/define-plugin/) **[web]** | Same; also shows the pitfall that unfolded uses stay as runtime references. |
| **Vite `define`** | statically replaced in build; TS users add `declare const __X__: string` [Vite](https://vite.dev/config/shared-options.html#define) **[web]** | Typing via ambient `declare const` is the accepted pattern (editor sees the type, value is injected). |
| **Rollup replace, Babel inline-environment, Terser** | same family: text/AST replace then dead-code elimination | **[known]** |
| **Dart / Flutter** | `import 'a.dart' if (dart.library.io) 'a_io.dart' if (dart.library.js_interop) 'a_web.dart'`; keys come from the compilation environment, resolved at compile time [dart.dev](https://dart.dev/tools/pub/create-packages) **[web]**. `kIsWeb` is `bool.fromEnvironment('dart.library.js_interop')`, so it is a compile-time constant that enables tree shaking; `defaultTargetPlatform` is runtime and test-overridable [api.flutter.dev](https://api.flutter.dev/flutter/foundation/kIsWeb-constant.html) **[web]** | Two-tier model to copy: compile-time constant for *what is compiled* vs runtime value for *what is running*. Conditional import keyed on **capability** ("library available"), not on OS name. |
| **Rust `cfg`** | `#[cfg(target_os = "macos")]`, `cfg!`, `cfg_select!`; removed code is parsed but **not type-checked**; options are static [Rust reference](https://doc.rust-lang.org/reference/conditional-compilation.html) **[web]** | Exact semantic asked for ("untaken branch is not type-checked"). Cost: bit-rot in inactive code, solved by CI matrix. |
| **Swift `#if os()/arch()/canImport()/targetEnvironment()`** | inactive branches must parse, are not type-checked [Swift book](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/statements/#Compiler-Control-Statements) **[web]** | `canImport` = capability probe; same parse-only rule. |
| **Zig `comptime`, `builtin.target`** | comptime-known `if`/`switch` are statically evaluated and untaken branches are not analysed; namespace-level declarations are lazily analysed [Zig docs](https://ziglang.org/documentation/master/#Compile-Time-Expressions) **[web]** | Best-in-class semantics; needs a real comptime evaluator. Zinc can take the cheap 90%: a whitelisted constant-expression evaluator. |
| **Go** | `//go:build linux && amd64`; filename suffixes `_linux.go`, `_arm64.go`; excluded files are not compiled; `GOOS=x go vet ./...` and gopls `GOFLAGS/-tags` are how people check each variant [go cmd](https://pkg.go.dev/cmd/go#hdr-Build_constraints) **[known; fetch returned only a summary]** | Closed set of known tags in file names avoids ambiguity (`foo_bar.go` is only special if `bar` is a known GOOS/GOARCH). Editor shows only one configuration at a time. |
| **Kotlin Multiplatform expect/actual** | an `expect` declaration must have an `actual` in every target source set, checked by the compiler [Kotlin docs](https://kotlinlang.org/docs/multiplatform-expect-actual.html) **[known; fetch returned empty]** | The exhaustiveness model for platform files: `foo.ts` (or an `.d.ts`) is the contract; each variant must satisfy it. |
| **C/C++ `#if`** | preprocessor, everything text-level, inactive text not parsed | Baseline; for Zinc the C++ output is machine-made so `#if` in the output would only defer, not remove, the type/link problem (see 4.3). |
| **Deno `Deno.build`** | runtime `{target, arch, os, vendor, env}`; docs "discourage" branching on it, meant for logging [Deno.build](https://docs.deno.com/api/deno/~/Deno.build) **[web]** | Runtime OS switches are an anti-pattern; give capability checks instead. |
| **Bun macros** | `import { f } from './f.ts' with { type: 'macro' }`; runs at bundle time, result inlined; args must be static; serialisable results only [Bun](https://bun.sh/docs/bundler/macros) **[web]** | A general comptime hook exists in the TS-adjacent world, but it needs a JS engine at build time and is far more than needed. Not recommended for Zinc now. |
| **TypeScript itself** | No conditional compilation and no `#if`; the intended answer is bundler `define` + per-target tsconfig **[known; I could not locate the canonical issue, so no link]** | Zinc owns its frontend, so it can do better than TS. |
| **PocketJS** (the TS-to-native toolchain Zinc already mirrors, `lib/compat/pocketjs`, `frontend.ts:40-47`) | Repo family `github.com/pocket-nexus/pocketjs` (several mirrors). "MicroTS" compiles Solid TSX / Vue SFC views to Rust through a typed View IR; `pocket.json` declares viewport and required APIs and "a target profile must satisfy that declaration before compilation and packaging proceed"; `pocket check --target psp`; "cores" (net, audio, 3D) are native modules an app takes only if it needs them [pocketjs README](https://github.com/pocket-nexus/pocketjs) **[web]** | PocketJS solves the same problem at the manifest level (declared requirements per target, capability registry, per-target check command) and has no in-source platform branching that I could find. Zinc's `requires` + `zinc:platform` is already ahead in source-level conditionals. `pocket check --target X` is the CLI shape to mirror for `zinc check`. |
| **Expo** | uses Metro platform extensions (+`Platform.select`) and, for web, `.web.js` **[known]**; no additional mechanism found | nothing new |

TypeScript language-service angle **[inferred + web for moduleSuffixes]**:
- One tsconfig per target with `moduleSuffixes` is the supported way for an editor to see one variant set. It works only for relative specifiers; `zinc:*` needs `paths` (already `compilerOptions.paths`).
- `Platform.select` typing: TS can express "either provide `default`, or provide every leaf" with a union of object types; TS also reports `TS2367` ("no overlap") if a *literal-typed* const is compared with another literal, so the generated typing of `TARGET` must be the **union of all targets**, not the single current literal (the value is folded by Zinc, not by the type).
- TS type-checks both branches of `if (false)` and does not grey them out; inactive-code greying needs an LSP hint (`DiagnosticTag.Unnecessary`) from a Zinc overlay.

## 3. Design

### 3.1 File-resolution rules

**Tag chain** (closed, ordered, most specific first). Filenames are never parsed: for each import the resolver *tries* `base.<tag>.<ext>` for each tag in the chain, then `base.<ext>`. That gives Go's "closed set" safety without parsing.

Proposed table (new file `targets/platforms.json`, data not code, replacing the hard-coded `HOSTS` list in `native.ts:18` and `CAPTURE_TARGETS`/`HIDPI_TARGETS` style sets in `cli.ts`):

| target (profile) | chain, most specific first |
|---|---|
| esp32 (chip esp32s3, board waveshare-esp32-s3-matrix) | `board:waveshare-esp32-s3-matrix`, `esp32s3`, `esp32`, `mcu`, `embedded`, `native` |
| rpi1 | `rpi1`, `rpi`, `linux`, `unix`, `embedded-linux`, `native` |
| rmpp | `rmpp`, `remarkable`, `eink`, `linux`, `unix`, `native` |
| linux | `linux`, `desktop`, `unix`, `native` |
| macos | `macos`, `apple`, `desktop`, `unix`, `native` |
| ios / android (reserved, no target yet) | `ios`/`android`, `mobile`, `apple` (ios), `unix`, `native` |
| ps1 / ps2 | `ps1`/`ps2`, `playstation`, `console`, `embedded`, `native` |
| wasm | `web`, `wasm` (no `native`) |
| sim (Node oracle) | resolves as the *profile* it emulates (today `--profile` wins: `platformVariant` tries profile first), then `sim`, `node` |

Rules:
1. **Precedence: board > chip > target/profile > family groups > (native) > default.** Existing behaviour (profile, then target) is a subset, so nothing breaks. When `--profile esp32` on target sim: chain of profile first, then target's.
2. **Tag `.native`**: in RN it means "not web". In Zinc "native" already means the native engine and `zinc:native` modules, so I recommend shipping it as an alias with the RN meaning but documenting it, and preferring `.embedded`/`.desktop`/`.web` in Zinc docs **[inferred]**.
3. **Variant without default** (`foo.esp32.ts` and no `foo.ts`): allowed only if every target in `zinc.json targets` is covered by some tag in its chain; otherwise error at check time ("`./foo` has no variant for macos"). This is the Kotlin `expect/actual` guarantee, without new syntax.
4. **Contract check**: when `foo.ts` exists next to `foo.<tag>.ts`, `zinc check --all-targets` verifies each variant exports a superset of default's public exports with assignable types (one synthetic `const _: typeof import('./foo') = ...` check per pair). Optional `foo.d.ts` may serve as pure contract.
5. Applies uniformly to: relative imports, `zinc:*` std modules (`lib/std/x.ts` -> `x.esp32.ts`), plugin entries, native C++ (`native/<name>.<tag>.cpp` with the *same* chain instead of the ad hoc `.host.cpp` fallback at `native.ts:146-158`), and assets (`icon.esp32.png`) if wanted later.
6. Hosts: implement in `platformVariant` using tag chain; drop the module-global state (`frontend.ts:124`) by passing a `PlatformInfo` object to `loadProgram`.

`zinc.json` (schema today: `name, entry, board, targets.<id>{width,height,display,plugins...}, requires`): add nothing mandatory. Optional `"platforms": { "myfleet": { "extends": "esp32", "tags": ["myfleet"] } }` for user tags, and `board` automatically contributes `board:<id>` (`plugins.ts:33-60` already resolves the board).

### 3.2 Language API: `zinc:platform`

```ts
import { Platform } from 'zinc:platform';       // also the existing flat constants (TOUCH, HEAP_BYTES, ...) keep working

Platform.target     // 'esp32' | 'macos' | 'linux' | 'rpi1' | 'rmpp' | 'ps1' | 'ps2' | 'wasm' | 'sim'  (union type, folded value)
Platform.chip       // 'esp32s3' | 'esp32' | '' ...
Platform.board      // 'waveshare-esp32-s3-matrix' | ''
Platform.OS         // 'macos' | 'linux' | 'ios' | 'android' | 'web' | 'esp-idf' | 'baremetal' ...   (RN name; coarse family)
Platform.arch       // 'x64' | 'arm64' | 'armv6' | 'xtensa' | 'mips' | 'wasm32'
Platform.is('esp32')        // tag in the chain (typed: union of all known tags)
Platform.has('gpu')         // capability (typed: keyof capabilities), same semantics as `requires`: true/plugin/optional count as available
Platform.isDev              // `zinc dev` / --dev  (like __DEV__)
Platform.select({ esp32: 1, desktop: 2, default: 3 })   // first matching key by chain order, else default
```

Typing:
- `select<T>(m: SelectMap<T>): T`, `SelectMap<T> = ({ default: T } & Partial<Record<Tag, T>>) | Record<LeafTarget, T>`: either a `default`, or an exhaustive list of leaf targets (compile error names the missing one). Precedence is chain order, not object key order.
- Values are literal unions (`Platform.OS === 'ios'` is legal everywhere; typed `'macos'|...`).
- Generated `.d.ts` for the editor is the same union in every target; only the emitted/folded value differs. Only the folded value is per-target.

Semantics (the important part):
1. **Folded by the frontend before sema** (see 4.1): `Platform.*` calls, imported flat constants, `!`, `&&`, `||`, `===`/`!==`/`<`/`>=` on literals and on `HEAP_BYTES/SCREEN_*` numbers.
2. **Pruned**: an `if`/ternary/`&&`/`||`/`switch` whose condition folds is replaced by the taken branch. The untaken branch is *blanked* (position-preserving), so it is **not type-checked, not lowered, not emitted, not linked**, and imports used only there are dropped (so the module is not loaded).
3. **Not foldable => still correct**: if the condition cannot be evaluated (`Platform` re-exported, aliased through a function), the generated module still exports real runtime values, so the program runs the same, only bigger. A lint (Z-code warning) flags "platform condition not foldable" only in modules marked `// @zinc-static`.
4. **Two tiers, à la Flutter** (`kIsWeb` vs `defaultTargetPlatform`): `Platform.*` is compile-time; `zinc:sys` `platform()` and a new `Platform.runtime.has('touch')` are runtime queries for bytecode that is meant to be portable (see 4.5).
5. **Engines are not a Platform axis**: all four engines must print the same bytes (tests/engines). `Platform.engine` may exist for diagnostics but is never foldable and never selects files. Feature differences that come from an engine (mquickjs is ES5, `js-engines.md`) are capabilities (`Platform.has('es2020')`) not engine names.

### 3.3 Emission strategies compared

| Option | Untaken branch type-checked? | emitted? | linked (modules, HAL calls)? | Works on all engines? | Cost |
|---|---|---|---|---|---|
| A. Status quo (runtime consts, C++ optimiser) | yes | yes | yes | yes | none; but not folded (measured above) |
| B. `constexpr` consts + `if constexpr`/`#if` in C++ emit | yes | yes (until clang) | **yes, Z5003 and link errors remain**; a call to a missing `zrt::gpio::x` fails to compile | native only; VM/JS still carry it | small |
| C. Fold in MIR (`mir.ts:241-291` already prunes) | yes | no for VM bytecode only | no for VM | VM only; emit-cpp/emit-js do not read MIR | medium, and MIR cannot un-type-check |
| D. **Source-level prune in frontend** (recommended) | **no** | **no** | **no** (imports dropped) | **all** (they only see pruned sources) | small-medium |
| E. Typed-AST prune via TS transformer after check | yes (already checked) | no | partly | all | medium; loses "not type-checked" |

D is the only one that gives the Rust/Swift semantics and it is engine-agnostic. It also matches an existing pattern: `getSourceFile` already rewrites text before parse while "diagnostics keep their positions" (`frontend.ts:148-157`).

### 3.4 Capability lint (guarded vs unguarded platform APIs)

Reuse, do not add a new analysis:
- Move `MODULE_TARGETS` (`native.ts:19-26`) into capability annotations on the declarations (`/** @requires process */` in `lib/modules.d.ts`, mirroring the `@requires` module-comment mechanism already in `capabilities.ts:68-72`).
- After pruning, any *remaining* reference to a symbol whose `@requires` is unmet is an error: "`zinc:process` needs `process` (esp32 has none); guard with `if (Platform.has('process'))`". Because pruned branches are gone, guarded uses pass and unguarded uses fail. Z5003 (`emit-cpp.ts:222-227`) already does this per module after emission; today it would wrongly fire even inside a guard (dead branches are still emitted) **[verified by reading + the experiment]**.
- Optional stricter mode: per-target generated `modules.<target>.d.ts` that simply omits unavailable `declare module` blocks, so the editor shows "Cannot find module 'zinc:gpio'" live.

## 4. Implementation plan

### 4.1 Frontend (where the work goes)

1. `PlatformInfo` object (`target, profile, chip, board, arch, chain[], caps, dev`) built in the CLI (`cli.ts:131-133`) and passed into `loadProgram`; remove the module-level `let platform` (`frontend.ts:124`). Needed anyway for `--all-targets`.
2. Variant resolution: `platformVariant` iterates `info.chain` (`frontend.ts:199-208`). Keep it as the single source of truth; additionally generate `moduleSuffixes` tsconfigs for editors (5.2).
3. **Prune pass** `prunePlatform(file, text, info)` in a new `compiler/src/platform.ts`, called from the host `getSourceFile` next to `webGlobals` (`frontend.ts:157`) and before TS parse of the checked file:
   - parse with `ts.createSourceFile`, find bindings imported from `zinc:platform` (named, aliased, namespace);
   - evaluate condition expressions with a whitelisted evaluator (booleans, string/number literals, the platform bindings, `!`, `&&`, `||`, `===`, `!==`, `<`, `<=`, `>`, `>=`, `+`, `-`, `*`); unknown => leave unchanged (runtime fallback);
   - replace a taken `Platform.select({...})` by the chosen property value; for `if`/`?:`/`&&`/`||`/`switch`, keep the taken branch text and replace the untaken text with same-length whitespace/newlines (keeps line/col of diagnostics and source maps);
   - drop import declarations whose bindings all became unreferenced (and only those without side effects); then TS never loads the module. Follow-up: a second iteration if pruning removes the last use of another import.
   The imported `zinc:platform` file itself stays real (runtime fallback).
4. Generated `zinc:platform` (`capabilities.ts:75-90`): emit `export const TOUCH = true;` (literal initialisers, no `: boolean` widening), `Platform` object typed with unions, and the union type aliases from the chain table. This also lets emit-cpp treat literal module consts as `constexpr`/inline (fixes the un-foldable `bool TOUCH{}` global, M0) — helpful beyond platform code.
5. Cache key: `cli.ts:381` builds a cache key from target/zoom/sources; add chain + board. `zinc dev` watch list must include variant files not currently in the program (they are found only by `existsSync`): new variants created while running are missed **[inferred]**.

### 4.2 HIR/MIR/emitters
No change required for correctness (they see pruned sources). MIR's `fold` gains value only for literal `const X = 3` propagation; leave for later. C++ `#if` in emitted code is **not needed** and would not remove type/link problems (option B). Emitting `#define ZINC_TARGET_ESP32` etc. in generated code is still useful for hand-written `native/*.cpp`, cheap (cmake defines already per target).

### 4.3 Interaction with capability manifest, plugins, link size
- Capability manifest: keep `targets/capabilities.json` as the data; add `arch`, `OS`, `chip` and the tag chain in `targets/platforms.json`; `capsFor()` unchanged.
- Plugin selection: `modulePaths()` (`plugins.ts`) maps every plugin module id; a plugin is compiled in only when imported. Pruning removes dead-branch imports, so `if (Platform.has('gpu')) { ... import 'zinc:gpu' ... }`-style code stops pulling the plugin and its `plugin.json requires` check (`docs/targets/capabilities.md:47-48`, "Importing it on an incompatible target is an error") is satisfied by guarded code. Currently that check fires on any import.
- Link size: on esp32 (160 KiB heap profile) the win is real: pruned branches do not enter `native.used` (`emit-cpp.ts:222`) so their `runtime/mod/*.cpp` are not listed (`cli.ts:629` builds the source list from `mods`).

### 4.4 Engines

| Engine | Effect of design D |
|---|---|
| native C++ (emit-cpp) | sees pruned source; nothing to add; HAL chosen by cmake as today |
| zinc-vm bytecode | same; bytecode is specific to the target it was built for |
| quickjs / sim JS (emit-js) | smaller bundle, `zinc-platform.gen.js` still emitted for the runtime fallback |
| future jsc / mquickjs (`js-engines.md`, `mquickjs.md`) | same JS emit; ES5 limits expressed as capabilities not engine names |

### 4.5 One important trade-off: portable bytecode
The Studio/precompiled-core plans (`docs/precompiled-core.md`, studio reports) upload bytecode to a pre-flashed VM core. Folding on `target` bakes the target into the bytecode. Provide `--portable` (or per-file `// @zinc-portable`) that disables target folding and uses runtime queries (`Platform.runtime.has(...)`, backed by `sys.platform()`/HAL flags); the default is static folding. Do not let engine or device differences leak into the *type-checked* surface. **[inferred]**

### 4.6 Tooling

- `zinc check [--target X | --all-targets | --targets esp32,macos]`. Today `check` runs one target (`cli.ts:1102-1107`); it does run emit-cpp so Z diagnostics show. `--all-targets` loops over `zinc.json targets` (fallback: all `PROFILES`), one `loadProgram` each. Optimise with `ts.createProgram(..., oldProgram)` reuse and worker threads; `noLib` and small std keep cost low **[inferred, not measured]**.
- Report per-target diagnostics with the target name, dedupe identical messages across targets, exit non-zero if any fails. CI matrix: `zinc check --all-targets --json`.
- **Dead-everywhere lint**: union of "live" spans across the matrix; a `Platform`-guarded branch dead on *all* targets emits a warning (hidden dead-code bug guard).
- `zinc lsp` (planned in `code-editor-lsp.md`): `initializationOptions.target` and a status-bar target switcher; project is the pruned program for that target; ranges removed by pruning are sent as `Unnecessary` hints (greyed). Interim: `zinc ui tsconfig` / `zinc init` writes `tsconfig.json` + `.zinc/tsconfig.<target>.json` (`moduleSuffixes: [".board..", ".esp32s3", ".esp32", ".mcu", ".embedded", ".native", ""]`, `paths` for `zinc:*`, `lib` typings) so VS Code's tsserver at least resolves the right variant; switching target = switching the extended file. Limitation: no pruning in stock tsserver, so both branches are type-checked there (superset, which is safe).
- Lints: (1) unguarded module/API needing an unmet capability (3.4); (2) unfoldable condition in `@zinc-static` files; (3) variant without default/without contract match; (4) variant name that looks like a tag but is unknown (`foo.esp23.ts`) if `foo.ts` also exists.

## 5. Test plan and migration

Tests (all fit existing runners: `zinc test`, conformance under `tests/conformance`, engines under `tests/engines`, golden `--emit=hir|mir`):
1. `platform_select.ts` conformance: prints for each profile (`zinc test --profile <id>`); expected `.out` per profile as existing `modules_esp32.*.out` do.
2. Prune tests: `--emit=cpp` and `--emit=js` must not contain the untaken literal (string-grep golden); `--emit=mir` for the pruned program has no `cbr` on platform values.
3. Not type-checked: a dead branch containing a type error compiles; the same code on the live target fails.
4. Link tests: esp32 program with `if (Platform.has('process')) { spawn... }` builds with no Z5003; unguarded use fails with Z5003 and a fix hint.
5. Import elision: plugin imported only in dead branch is not in `native.used`/cmake sources.
6. Variants: chain precedence matrix (board/chip/target/family/default); `.d.ts` contract test; missing-variant coverage error.
7. Engine parity: same programs under `--engine native|zinc-vm|quickjs` produce identical output (existing engine harness).
8. `zinc check --all-targets` on every `examples/*` in CI (also finds rot in variants).
9. Fuzz-lite: random condition expressions evaluated by the folder vs `node` evaluation (same semantics of `&&`, `||`, number compare).

Migration:
- `examples/pinball/src/ui/panel.ts:6,214`: `TOUCH ? ... : ...` keeps working (flat constants stay); switch to `Platform.select` optionally.
- Existing behaviour of `platformVariant` (profile then target) is a subset; nothing to migrate. Rename doc claims in `docs/targets/capabilities.md:55-70` once pruning lands.
- `native.ts` `.host.cpp` fallback becomes "chain fallback" (`host` tag = `desktop`/`unix`); keep `.host.cpp` as alias.
- `HOSTS`/`MODULE_TARGETS` (`native.ts:18-26`) -> capability annotations; keep the table as generated output until parity is proven.
- Add a guide chapter (`docs/guide/`, none exists for platforms) and `zinc help targets` text (`cli.ts:975-977`).

## 6. Effort (one strong developer, unvalidated)

| Milestone | Content | Days |
|---|---|---|
| M0 | Literal module consts inlined/`constexpr` in emit-cpp; `TARGET`/`PROFILE` union types; fix doc claim; remove global platform state | 2-3 |
| M1 | `platform.ts` prune pass (evaluator, `select`, `if`/`?:`/`&&`/`||`/`switch`, import elision), `Platform` object + typings, tests 1-3, 5 | 6-8 |
| M2 | `targets/platforms.json` chain, board/chip tags, native C++ chain, `.d.ts` contract + coverage lint, tests 6 | 4-5 |
| M3 | `zinc check --target/--all-targets`, parallelism, dead-everywhere lint, CI job | 4-5 |
| M4 | `@requires` on `lib/modules.d.ts`, replace `MODULE_TARGETS`, guarded/unguarded lint (test 4) | 4-6 |
| M5 | Editor: generated tsconfigs (2 d) + LSP target switcher and `Unnecessary` hints (3-5 d, depends on `zinc lsp`) | 5-7 |
| M6 | `--portable` mode and runtime `Platform.runtime`, docs, migration | 3-4 |
| Total | | about 28-38 days (5.5-7.5 weeks with editor; M0-M4 about 4 weeks) |

## 7. Risks

| Risk | Mitigation |
|---|---|
| **Type-check divergence**: a dead branch is not checked, so it rots | `--all-targets` in CI; dead-everywhere lint; contract check for variants |
| **Combinatorial explosion** (targets x boards x variants) | closed tag set, capabilities in code not in filenames, matrix only over `zinc.json targets`; board tag optional |
| **Hidden dead-code bugs** (pruner blanks something that mattered, e.g. side-effecting condition) | evaluator whitelist rejects any condition with calls/side effects; unknown => unfolded runtime fallback; position-preserving blanking keeps diagnostics stable; fuzz test 9 |
| Pruning removes the last use of an import with side effects | only drop imports without side-effect semantics (named/default/namespace bindings); `import 'x'` never dropped |
| Editor shows a superset (stock tsserver) | documented; `zinc lsp` overlay gives exact view |
| `native` tag ambiguity (RN meaning vs Zinc "native engine/modules") | alias + docs, prefer `embedded`/`desktop`/`web` |
| Portable bytecode vs static folding | explicit `--portable`; default static |
| TS API change (TS 7 native port) | all rewriting lives beside `frontend.ts`, the documented swap point (`frontend.ts:1-2`) |
| Text-rewrite fragility with JSX/CSS lowering already happening in the same hook | run prune after `lowerJsx` on the lowered text (same-length rewrites like the existing ones), test with tsx |

## 8. Open questions
1. Exact meaning of `Platform.OS` for embedded targets (`'esp-idf'`? `'none'`?): needs a decision; RN parity only for future ios/android.
2. Should `Platform.has()` accept `heap>=256K`-style requirement strings (same grammar as `requires`, `capabilities.ts:41-53`)? Recommended yes, cheap.
3. Board-level tags: worth it, or is `board` just a config/const (`Platform.board`)? Recommended tag only if a real board-specific file appears.
4. ios/android targets do not exist yet; reserve names now.

## Sources
React Native platform-specific code https://reactnative.dev/docs/platform-specific-code · Metro configuration https://metrobundler.dev/docs/configuration/ · TSConfig `moduleSuffixes`/`customConditions` https://www.typescriptlang.org/tsconfig/#moduleSuffixes · esbuild API https://esbuild.github.io/api/ · webpack DefinePlugin https://webpack.js.org/plugins/define-plugin/ · Vite `define` https://vite.dev/config/shared-options.html#define · Dart conditional imports https://dart.dev/tools/pub/create-packages · Flutter `kIsWeb` https://api.flutter.dev/flutter/foundation/kIsWeb-constant.html · Rust conditional compilation https://doc.rust-lang.org/reference/conditional-compilation.html · Swift compiler control statements https://docs.swift.org/swift-book/documentation/the-swift-programming-language/statements/ · Zig comptime https://ziglang.org/documentation/master/#Compile-Time-Expressions · Bun macros https://bun.sh/docs/bundler/macros · Deno.build https://docs.deno.com/api/deno/~/Deno.build · Go build constraints https://pkg.go.dev/cmd/go#hdr-Build_constraints · Kotlin expect/actual https://kotlinlang.org/docs/multiplatform-expect-actual.html · PocketJS https://github.com/pocket-nexus/pocketjs
