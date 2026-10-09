# A tool belt / build pipeline for Zinc JS and TS (research, 2026-09-30)

Status: research only, nothing implemented in the repo. Tags: **[V]** verified here (repo read or experiment run in the scratchpad),
**[W]** from a web source (linked), **[I]** inference or estimate. Experiments live in
`/private/tmp/claude-501/-Users-mowmow-Lab-zinc/f9000827-946f-4baa-baa4-097cd818e6ea/scratchpad/tb/` (tools in `tools/`, semantic corpus in `tools/sem/`).
Nothing was installed in the repo; the tree was not modified. Prior context (mquickjs is ES5-only, QuickJS bytecode precompile, JSC/V8, browser compiler) is in
[README.md](README.md) and [mquickjs.md](mquickjs.md) and is not redone here.

## 0. Summary

1. Zinc has **no build pipeline in the Metro sense**. `zinc build` is: TypeScript program (TS 6 API) -> Sema -> one emitter per engine. For the JS engines the "bundle" is
   a file copy with import-specifier rewriting (`compiler/src/engines.ts:130`), output is ES2022 modules, no minify, no lowering, no DCE, no cache, no lint, no third-party
   npm JS support in the quickjs path. **[V]**
2. **No tool can lower Zinc's ES2022 output to something mquickjs runs, out of the box.** Measured: SWC, Babel 8 (preset-env ie11) and TypeScript 6 (`target: ES5`) all pass `es-check es5`
   on a real 195 KB Zinc UI bundle, but on a 30-case semantic corpus run under the real `mqjs` they pass 12 / 9 / 14 cases, and fail for mquickjs-specific reasons
   (duplicate catch variable names are a SyntaxError, array holes in TS's `__generator` output, `Object.defineProperty` with unsupported descriptor shapes, missing `Symbol`,
   `WeakMap`, `Object.getOwnPropertyDescriptor`, ...). **[V]** esbuild refuses (`Transforming class syntax ... "es5" is not supported yet`) and oxc has no ES5 target. **[V]**
3. Recommendation: **build a thin Zinc pipeline (`zinc build` stages + hooks), buy the parts that are commodity**: esbuild for bundle/minify/define/tree-shake (76 ms for the
   195 KB UI bundle **[V]**), oxlint for lint with Zinc JS plugin rules, tsgo (`typescript@7` native `tsc`, 5x faster than tsc6 on the compiler project **[V]**) for a fast `--noEmit`
   gate while keeping `@typescript/typescript6` as the program API. For ES5 (mquickjs): **do not use a generic downleveler on Zinc output**; emit an "ES5-strict dialect" from Zinc's own
   TS transformer (`emit-js.ts` already owns the semantics) and use SWC/Babel only for the third-party-JS escape hatch, followed by an mqjs-specific fix-up pass.
4. Startup wins are smaller than folklore for pure parse: QuickJS-ng parses+compiles the whole 195 KB bundle in **8.4-9.0 ms** on an M1 Pro whether minified (108 KB) or not
   **[V]**. Minification is a size/flash/OTA win (-45% bytes), not a parse-time win on QuickJS. The real startup levers are bytecode precompile and lazy module init (Section 6).

## 1. Current pipeline (repo inspection)

| Stage | Where | Facts |
|---|---|---|
| CLI | `compiler/src/cli.ts` (1150 lines); `check` at `:1102`, `dev` at `:1094`, `doctor` at `:928` | Commands: build, check, run, dev, test, export, deploy, flash, capture, infer, init, tsconfig, bench, plugins, ui, compat. `doctor` only probes cmake, c++, ninja, SDL3, docker. **[V]** |
| Frontend | `compiler/src/frontend.ts` | The only importer of `@typescript/typescript6` (`:3`). `compilerOptions` (`:53`): `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `strict`, `noLib: true`, `allowJs`+`checkJs`, `types: []`. `paths` maps `zinc:*`, `solid-js`, `react`, `inferno`, `@pocketjs/framework/*` to Zinc's own `lib/std` and `lib/compat` (`STD_MODULES` `:30`) plus plugin modules. **[V]** |
| Source rewriting | `frontend.ts:128-180` | In `host.getSourceFile`: `import './x.css'` -> `defineClass` calls (`css.ts`), `lowerStyleSheets`, `lowerJsx` (`jsx.ts`, `.tsx` -> plain calls before type check), `webGlobals()` auto-imports `zinc:web` for `URL`, `fetch`, ... (`:84`). This is already a transform stage, inlined in the TS host. **[V]** |
| Platform resolve | `frontend.ts:188-208` | `resolveModule` then `platformVariant()` swaps `x.ts` for `x.<profile>.ts` / `x.<target>.ts` when the file exists. This is the hook the other study extends. `zinc:platform` is an in-memory module (`setPlatform`, `:121`). **[V]** |
| Third-party npm | `frontend.ts:170` | `sources` excludes anything under `/node_modules/`, so packages get type information (Bundler resolution) but are **never compiled by Zinc's emitters**. The C++ and VM paths cannot consume them. In the quickjs path `bundleJs` copies only relative/absolute imports of emitted files (`engines.ts:130-160`); a bare specifier is left as is and fails at run time. Only `plugins/*` (`three`, `svg`, `lottie`, ...) rewritten in Zinc TS, and `zinc:script` (a QuickJS sandbox with `Script.eval`, `plugins/script/index.ts`) run foreign JS. **[V]** |
| Language subset | `sema.ts:235` and `docs/guide/02-language.md:36` | `Z1xxx` forbidden JS: `var`, `arguments`, `eval`, `with`, regex (`Z1008`), dynamic `import()`, prototype mutation, holey arrays, `globalThis`, `in`. Typed numerics (`i32`, `f32`, ...). `any` is not banned outright: untyped values become `Dyn` (`docs/decisions/0014-dyn.md`), `--no-dyn` turns each into an error (`analyze()` in `cli.ts:175-198`). **[V]** |
| Emitters | `emit-cpp.ts` (2088 lines), `emit-bc.ts` (ZBC4), `emit-js.ts` (396), `abi.ts` | Native and VM come from HIR/MIR. JS: TS `program.emit` with a `before` transformer that adds numeric narrowing (`|0`, `>>>0`, `Math.fround`, `emit-js.ts:32-45`) and checks; two `transpileModule(..., ES2022)` fallbacks (`:367`, `:377`). **[V]** |
| Engine build | `engines.ts:14` `buildEngine` | `engine === 'quickjs'`: `emitJs` + `bundleJs` (copy graph, hashed file names, dead files removed); `zinc-vm`: `emitBytecode` -> `app.zbc` + `.zbc.debug`; CMake to a runner; `engine.json` with sha256 per artifact and a fingerprint; `--core` reuses a precompiled VM core when compiler/runtime/ABI hashes match (`compileScript` `:103`). `exportEngine` `:163`. **[V]** |
| Assets / resources | `resources.ts:332` `collectResources` | Fonts are rasterised from TTF at build time for exactly the characters used in string/JSX literals (i.e. already subsetting), SVG subset -> RGBA, everything baked to `zinc_resources.cpp` or JSON for the sim. **[V]** |
| Dev mode | `docs/dev-mode.md`, `tools.ts:350` `dev()` | `fs.watch` recursive on the project (`:445`) plus watchers on out-of-tree deps; native macOS/Linux hot reload = `app.so` swap at `-O0` (505-540 ms save-to-frame measured in the doc); state is **not** preserved ("like a React Native full reload, not Fast Refresh"); other targets restart or reload the page. **[V]** |
| Plugins | `plugins.ts` | Directory plugins with `plugin.json` (`kind: module | display`, `modules` for extra specifiers like `three/addons/...`, per-target sources/defines/idf/frameworks, `requires` capabilities). Native code build extension, not a compiler hook API. **[V]** |
| Lint / format | none | No `.eslintrc*`, `eslint.config.*`, biome, prettier or oxlint in the repo root; `package.json` has only `@typescript/typescript6` 6.0.2 and dev `typescript` 7.0.2, `@types/node`. `zinc check` = type check + both emitters in memory (`cli.ts:1102`). **[V]** |
| Capability checks | `docs/targets/capabilities.md`, `capabilities.ts` | Modules declare `/** @requires heap>=192K */`; a warning `Z5004` on incompatible targets (`cli.ts:186-190`). This is the seed of an "engine compatibility report". **[V]** |
| Node/TS versions | `node_modules/typescript` = 7.0.2 has **no JS API**, only `tsc` (`lib/getExePath.js`, `tsc.js`) **[V]**; the API stays on `typescript6` (`frontend.ts:1-2` comment "a swap to the TS 7.1 API touches this file only"). |

PocketJS compatibility (`lib/compat/pocketjs`) is API-level only; PocketJS's own tooling is not used (next section).

### 1.1 What PocketJS is and how it prepares code **[W]**

PocketJS ([github.com/pocket-nexus/pocketjs](https://github.com/pocket-nexus/pocketjs), MIT) is "a portable application runtime that turns modern component code into native pixels" (PSP to iOS 2G to desktop):
Solid (also Vue Vapor, Octane) with Tailwind-like classes, running in a pinned QuickJS with a Rust `no_std` UI core (taffy layout) compiled twice (native + WASM). Its build, from
[`tools/build.ts`](https://github.com/pocket-nexus/pocketjs/blob/main/tools/build.ts) and [`docs/DESIGN.md`](https://github.com/pocket-nexus/pocketjs/blob/main/docs/DESIGN.md):

- **Two passes.** Pass 1 transforms every `.tsx/.ts` reachable from the entry with Babel (`babel-preset-solid` `{generate:'universal'}` + `@babel/preset-typescript`, content-hash cached) and collects class strings and text code points from the AST.
  It then compiles Tailwind to `styles.bin`, bakes font atlases (`bake-font.ts`, `font-subset.ts`), SVG and images, and packs `app.pak`. Pass 2 is `Bun.build` (`format: "iife"`, `target: "browser"`, `conditions: ["browser"]`, `minify: false`,
  a plugin serving the cached pass-1 output) with `define` for `__POCKET_TARGET__`, `__POCKET_HOST_ABI__`, `__POCKET_FEATURES__` so target code is dead-code-eliminated. **No ES5 lowering, no minify, no bytecode**; QuickJS is "~ES2023".
- **Lint-on-import**: "the compiler lints on import" APIs unavailable on a target (`createResource`, transitions off-limits on PSP). A build plan (`contracts/`, `verifyPlanHash`) and `pocket check` validate an app against a *target profile*. No ESLint/oxc use found in the files inspected.
- A separate **MicroTS** compiler ("compiles Solid TSX and Vue SFC views to Rust through a shared typed View IR") is their AOT path, analogous to Zinc's native emitter.
- Zinc's `docs/engines.md:208-260` already records the practices worth copying (generated contracts with drift checks, measure stages separately, raw samples).

Take-away for Zinc: PocketJS = "Babel for framework transform + one Bun/esbuild-class bundle with `define` + target-profile validation + asset baking". Zinc's equivalent stages exist in pieces and are worth unifying.

## 2. Tool landscape (web) and what matters for Zinc

| Tool | Facts | Fit for Zinc |
|---|---|---|
| **Metro** [W: [Concepts](https://github.com/facebook/metro/blob/main/docs/Concepts.md), [Configuration](https://github.com/facebook/metro/blob/main/docs/Configuration.md), [Expo metro.config](https://docs.expo.dev/versions/latest/config/metro/)] | Three stages: Resolution (dependency graph, resolver with platform extensions `.ios.js`/`.native.js`), Transformation (Babel, parallel across cores, cached by file content + config), Serialization (custom serializer, one or several bundles). Config: `resolver` (source/asset exts, `resolveRequest`), `transformer` (`getTransformOptions` with `inlineRequires`, minifier, `assetPlugins`), `serializer`. Hermes bytecode step is a post-serializer `hermesc` run; debugId injected before it. Fast Refresh = per-module hot swap through `react-refresh` + module registry. | The **architecture template**: named stages, per-file transform cache, platform extensions, inline requires. Do not adopt Metro itself (Babel-based, RN-shaped, ~slow, no ESM output). |
| **Re.Pack / Rspack** [W: [re-pack.dev](https://re-pack.dev/docs/getting-started/introduction)] | Rspack (Rust webpack-compatible) as a Metro replacement; Module Federation, virtual modules, tree shaking. | Confirms "swap the bundler behind stable stages". Heavy for Zinc. |
| **esbuild** [V: 0.28.2 here] | Bundle, minify, `define`, tree-shaking, plugins (`onResolve`/`onLoad`), 76 ms for the 195 KB bundle. **Cannot lower to ES5** ([issue #297](https://github.com/evanw/esbuild/issues/297); reproduced: 1078 errors on the Zinc bundle: class, `const`/`let`, destructuring, for-of, spread, default/rest args, async). Lowers to ES2015+ only (and not generators/async below their native level). | Bundle + minify + define + the `zinc:*` external plugin. |
| **Rolldown / Vite 8** [W: [Vite 8](https://vite.dev/blog/announcing-vite8)] | Rust bundler, Rollup-compatible plugin API, uses Oxc for parse/resolve/transform/minify. Rolldown 1.0 API locked; Oxc transformer stable, minifier alpha. | Best candidate if Zinc wants a **Rollup-style plugin API** off the shelf; adopt later when the pipeline is stable (the esbuild plugin API is simpler today). |
| **oxc** (parser, transformer, minifier, resolver, oxlint) [V: oxc-transform/minify 0.152, oxlint 1.86] | Transformer lowers ESNext to **ES2015 at the lowest**; "the values that are supported by esbuild's `target` are supported, excluding ES5" ([docs](https://oxc.rs/docs/guide/usage/transformer/lowering)); `target: 'es5'` throws `Invalid target 'es5'` **[V]**. BigInt literals are an error at es2015 **[V]**. Minifier: 107 156 B vs esbuild 108 809 B on the bundle, but 413 ms vs 76 ms (first call, includes init) **[V]**. oxlint: 0.05 s user on 195 KB, 500+ built-in rules, JS plugin API ESLint-v9-compatible, **alpha**, no custom type-aware rules ([blog](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha.html)). | Parser/linter yes. Not an ES5 lowerer. |
| **SWC** [V: @swc/core, `jsc.target: es5`] | Lowers everything, 48-81 ms on the bundle, **output 313 KB unminified** (inline helpers, vs 195 KB source), 132 KB minified. Correct on 11/12 non-Symbol semantic cases on node; TDZ dropped. | Best speed among true ES5 lowerers. |
| **Babel** (`@babel/preset-env`, `transform-classes`, `regenerator`; hermes-parser [W]) [V: Babel 8.0.6] | Correct on all node semantic cases except TDZ (`tdz` is opt-in), 650-710 ms on the bundle, smallest unminified ES5 (228 KB). Async/generators need regenerator (inlined in Babel 8's helpers). Metro's own transformer. | Most correct and configurable ES5 path; slow but cacheable. |
| **TypeScript `target: ES5`** [W: [TS 6.0 notes](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/), [PR #63071](https://github.com/microsoft/TypeScript/pull/63071)] | `es5` and `downlevelIteration` are deprecated in 6.0 (silenced by `ignoreDeprecations: "6.0"`), unsupported in 7.0. [V] known-broken output on the corpus: `super.getter`, `extends Error`/`Array` (instance not an instance), computed getters, `arguments` inside arrows lost, symbol `hasInstance`. | Reject as the ES5 path (dead end + wrong). |
| **Closure Compiler** [V: 20260927 native macOS binary; W: [type-based renaming](https://github.com/google/closure-compiler/wiki/Type-Based-Property-Renaming), [limitations](https://developers.google.com/closure/compiler/docs/limitations)] | Only mature toolchain with typed **ADVANCED** optimisation (global renaming, DCE, property flattening, inlining) and ES5 output. Needs its `$jscomp` runtime polyfills (`ReferenceError: $jscomp` when run bare **[V]**), fails hard on `#private` fields, `new.target`, `super.x = v`, TDZ **[V]**. Zinc's typed subset (no eval, no reflection, no prototype surgery) is the "compatible code" ADVANCED wants, but its types are TS, not JSDoc. | Interesting later as an **optional ADVANCED post-pass for pure-Zinc bundles**; not a first step. |
| **Terser / UglifyJS** [V: terser 5.51.2] | 107 330 B with `passes: 2`, 944 ms. | No advantage over esbuild for a 1% size gain. |
| **Prepack** [W: [archived Feb 2022](https://github.com/facebookarchive/prepack)] | Partial evaluator, abandoned. | Skip. |
| **Hermes / Static Hermes** [W: [static_h](https://github.com/facebook/hermes/blob/static_h/doc/blog/README.md)] | AOT bytecode `.hbc` (skips parse; 25-50% TTI claimed by third-party posts), Static Hermes compiles typed JS/TS to native. Not embeddable as a Zinc engine cheaply. Metro runs `hermesc` after serialisation. | Model for the "bytecode step" (Section 6). |
| **`qjsc` / `JS_WriteObject`** [V: `qjsc.c` in the scratch QuickJS tree] | Precompiles to bytecode/C; the runner currently re-parses source each start ([README.md](README.md) item 2). Bytecode is engine-version specific. | Emit stage for quickjs. |
| **Javy + Wizer** [W: [Javy](https://bytecodealliance.org/articles/javy-hosted-project), [Wizer](https://github.com/bytecodealliance/wizer)] | QuickJS in Wasm; Wizer snapshots the initialised heap (0.36 ms cold start claim in a Fermyon-style setup). | Model for **snapshots**: run module init at build time (QuickJS has no heap snapshot, but init-time work can be hoisted at compile time). Relevant to the browser tier only. |
| **Porffor / AssemblyScript** | JS/TS AOT to Wasm/native. | Not needed: Zinc *is* this for its own subset. |
| **tsgo (TS 7)** [V: typescript@7.0.2 in repo; W: [TS 6 -> 7 plan](https://visualstudiomagazine.com/articles/2026/03/23/typescript-6-0-ships-as-final-javascript-based-release-clears-path-for-go-native-7-0.aspx)] | Native `tsc`, **0.35 s vs 1.69 s wall** for `tsc -p compiler --noEmit` (tsc 7.0.2 vs tsc6) **[V]**; JS API not shipped in 7.0. | Use as a fast pre-gate (`zinc check --fast`) and for editor; keep `typescript6` for `createProgram`. |
| **Biome** [V: 2.5.14] | Format+lint in one Rust binary; GritQL custom rules. | Optional formatter only. Zinc does not need to format user code. |
| **ESLint flat config** [V: 10.11] with core `no-restricted-syntax` | Selector-based ban list works with zero plugins: 103 findings on the bundle in 0.7 s incl. startup. [W: [eslint-plugin-es-x](https://github.com/eslint-community/eslint-plugin-es-x)] has one rule per ES feature (`es-x/no-classes`, `restrict-to-es2018` preset) with readable messages. | Ship as the lint config for users who already run ESLint/editors. |
| **es-check** [V: es-check 9.x] | `es-check es5 file.js` acorn-based syntax gate; caught BigInt literals in the ES5 output. | CI gate. Syntax only: does not detect the semantic/mqjs failures found below. |
| **knip** | Dead exports/deps. | Optional in `zinc doctor`. |

## 3. Experiments (all in the scratchpad) **[V]**

Corpus: `examples/ui/forms` copied to `tb/ui`, built with `zinc build --engine quickjs --headless`: 7 emitted `.mjs` (ui.mjs 167 KB, fx_sin.mjs 26 KB, zinc.mjs 17.6 KB, ...) = the real QuickJS payload. Bundled by esbuild with a plugin mapping `zinc:*` to `globalThis.__zmods[...]`.

**E1. Size and QuickJS parse time** (QuickJS-ng 0.17, `new Function(src)` best of 30, M1 Pro):

| Variant | Bytes | Parse+compile |
|---|---|---|
| esbuild bundle, unminified (IIFE) | 194 709 | 8.78 ms |
| esbuild `minifyWhitespace` | 136 178 | 8.50 ms |
| esbuild `minify` | 107 858 | 8.06 ms |
| oxc-minify | 107 156 | 8.25 ms |
| terser passes:2 | 107 330 | 8.21 ms |
| Babel ES5 (ie11), unminified / minified | 228 346 / 129 887 | 10.17 / 9.18 ms |
| SWC ES5 minified | 131 638 | 9.45 ms |
| TS ES5 minified | 124 139 | 9.23 ms |

Reading: parse is roughly 45 ns/byte and is nearly insensitive to minification; ES5-lowered code parses ~10% slower. On a Pi 3B+ (about 10-15x slower cores [I]) the whole UI parse is ~100 ms, which is why bytecode precompile matters more than minify. Minify is a **-45% bytes** win (flash, OTA, storage), and a memory win only for source retention (QuickJS keeps source for `Function.prototype.toString`/line info unless stripped; `JS_EVAL_FLAG_STRIP` [I, not measured]).

**E2. Tool times on the bundle**: esbuild bundle+minify 76 ms; SWC ES5 48-81 ms; oxc-transform es2015 6 ms; TS transpile 325-475 ms; Babel 650-710 ms; oxlint 0.05 s; ESLint 0.7 s.

**E3. ES5 gate**: `es-check es5` passes for SWC, Babel and TS output *after* replacing the bundle's BigInt literals (the Zinc sim shim `sim/zinc.mjs` uses `BigInt` for i64/fixed-point sqrt: 8 literals, `BigInt(...)` calls). The ES5 path therefore needs the shim rewrite already listed in mquickjs.md. **[V]**

**E4. Semantic corpus on real `mqjs`** (30 one-case files: class/extends/super accessor/static/private fields, extends Error/Array, new.target, generators, for-of over array/string/Map/Set, destructuring, spread, template + tagged, `?.`/`??`/logical assignment, TDZ, per-iteration `let`, default params, computed/shorthand, arrow `this`/`arguments`, labels, `**`, async, try/finally in generators, `Symbol.hasInstance`, `super.x = v`). Compared with node running the original:

| Lowerer | Passes in node (ES5 output vs original) | Passes in mqjs | Failure causes in mqjs |
|---|---|---|---|
| SWC 1.x (es5) | 30/31 (TDZ dropped) | **12 / 30** | `TypeError: unsupported additional properties` (`Object.defineProperty` shape), `not a function` (missing `Object.getOwnPropertyDescriptor`/`defineProperties`/...), `catch variable already exists` (1), array hole (1), `Symbol`/`WeakMap`/`Promise` absent |
| Babel 8 preset-env ie11 | 30/31 (TDZ dropped) | **9 / 30** | **13 x `SyntaxError: catch variable already exists`**: mqjs rejects `catch (n)` when `n` is already a local/param in the function, and Babel's `asyncGeneratorStep(e,t,r,n,o,a,c)` helper does exactly that |
| TS 6 ES5 + downlevelIteration | 25/31: wrong for `super.getter` set, `extends Error` (`instanceof E` false), `extends Array`, computed getters, arrow `arguments`, `hasInstance` | **14 / 30** | plus array hole `[0, , 3, 4]` in `__generator` `trys.push` (SyntaxError: unexpected character) |
| Closure 20260927 (ES5, WHITESPACE_ONLY) | fails to lower `#private`, `new.target`, `super.x = v`, TDZ | **7 / 30** | `$jscomp` runtime missing (needs its polyfill inject) |

Facts about mqjs learned **[V]**: rejects duplicate/shadowing catch variable names; rejects array literal holes; direct `eval` is a SyntaxError; missing built-ins: `Symbol, Map, Set, WeakMap, Promise, Proxy, Reflect.construct, Object.{assign,freeze,entries,is,defineProperties,getOwnPropertyDescriptor,getOwnPropertyNames,getOwnPropertySymbols}, Array.{from,prototype.includes,flat,fill}, Number.isInteger, queueMicrotask, Error.captureStackTrace`. Present: `Object.defineProperty` (value and getter forms), `getPrototypeOf`, `setPrototypeOf`, `create`, `keys`, `Function.prototype.bind`, `Math.fround/imul`, `JSON`. (`mqjs` JSON.stringify also omits function-valued props differently than node; two "computed-shorthand" diffs are that, not lowering.)

Conclusion of E4: **generic ES5 lowerers are correct for node but emit helper code that mquickjs rejects**; "ES5" is not one target. mquickjs needs its own target profile with (a) a helper runtime written against its actual API, (b) a post-pass fixing catch-variable and hole patterns, (c) polyfills for the missing built-ins. That is a Zinc-owned stage, not an off-the-shelf preset.

## 4. Design: `zinc build` as named stages

### 4.1 Stage graph

```
resolve -> parse -> typecheck -> analyze(lint + compat) -> transform -> bundle -> optimize -> emit -> package
   |          |         |               |                      |          |          |         |        |
 platform   TS6 API   tsgo gate     zinc-lint rules       lower(engine)  esbuild   define,    per     assets,
 ext hook   + jsx/css                + compat report     ES5-dialect      IIFE/ESM  DCE,min    engine  fonts, engine.json
```

| # | Stage | Input -> output | Concrete tool | Notes |
|---|---|---|---|---|
| 1 | **resolve** | specifier -> file | TS `resolveModuleName` (today) behind a `resolve(spec, importer, ctx)` hook | ctx = `{ target, profile, engine }`. Default chain: `zinc:` std map -> plugin `modules` -> `platformVariant()` (`.<profile>.ts`, `.<target>.ts`, `.<engine>.ts`) -> node_modules with export conditions `["zinc", <engine>, "browser", "import"]`. The `.esp32.ts` study only fills the hook. |
| 2 | **parse** | text -> AST | TS 6 (semantic) ; oxc-parser for third-party JS (fast, no type info needed) | JSX/CSS pre-lowering stays in `frontend.ts` host (already a stage). |
| 3 | **typecheck** | AST -> diags | `tsc` 7 (tsgo) `--noEmit` as a *fast gate* in `zinc check`/CI/editor (0.35 s vs 1.7 s [V]); TS6 program for Sema | Keep single source of truth for diagnostics numbers `TSxxxx`/`Zxxxx`. |
| 4 | **analyze** | Sema + AST -> diags, report | Zinc-owned lint rules (Section 5) + `engine-compat` report (Section 5.3) | Errors here fail the build before C++/cmake. |
| 5 | **transform** | per file, cacheable | (native/VM: HIR, unchanged) ; JS engines: Zinc TS transformer `emit-js.ts` (numeric semantics) then **engine lowering profile**: `es2022` (quickjs, jsc, node), `es5-mqjs` (mquickjs) | Only `es5-mqjs` lowers; see 4.2. |
| 6 | **bundle** | file graph -> 1 file | **esbuild** with a `zinc-native` plugin (`zinc:*` -> runner-provided modules; [V] prototype above), `format: 'esm'` for quickjs/jsc/node (keeps TLA `runMain`, `engines.ts` entry), `'iife'` for mquickjs (no modules, no TLA) | Replaces `bundleJs()` copy (`engines.ts:130`). Module concatenation + tree-shaking come free; honour `"sideEffects"` from package.json. |
| 7 | **optimize** | bundle -> smaller/faster bundle | esbuild `define` (`__ZINC_TARGET__`, `__ZINC_ENGINE__`, `__ZINC_DEV__`, `ZINC_FEATURES.*`) + `minify` (identifiers+whitespace+syntax, **no property mangling**: `mangleProps` is unsafe with `zinc:script`/Dyn/`JSON.parse`/native ABI names), `pure` annotations for known-pure helpers; optional Closure ADVANCED post-pass for pure-Zinc code (later) | Copy PocketJS: target constants become `define`s so per-target branches vanish. Dev: no minify, keep names. |
| 8 | **emit** | -> engine artefact | native: C++ ; zinc-vm: ZBC4 + `.debug` ; quickjs: bundle -> **QuickJS bytecode** (`JS_WriteObject`, version-stamped in `engine.json`) with source fallback ; mquickjs: bytecode via `mqjs -o` for the target word size ; jsc/v8: source (+ code cache where the embedder supports it [I]) | Bytecode is a cache: `(engine version, flags, bundle hash)` key. |
| 9 | **package** | -> dist / firmware | existing `exportEngine`, `collectResources` (fonts subset already), + assets pipeline hooks (images -> textures, i18n tables) | `engine.json` fingerprints already exist (`engines.ts:65`); add stage hashes and the compat report. |

### 4.2 Lowering profiles (which tool, per engine)

| Engine | Profile | Lowering | Why |
|---|---|---|---|
| native (C++) | none (HIR) | n/a | |
| zinc-vm | none (HIR -> ZBC4) | n/a | |
| quickjs (ng 0.17) | `es2022` | none | QuickJS-ng is ~ES2023 **[V]**; PocketJS takes the same stance **[W]** |
| jsc (macOS), v8, node/sim | `es2022` (or `esnext`) | none | |
| mquickjs | `es5-mqjs` | see below | Section 3 E4 |
| browser (wasm tier) | `es2022` | none | |

**`es5-mqjs`, recommended construction (two tracks):**

- **Track A, Zinc-authored code (99% of Zinc apps, must be the first deliverable).** Do the lowering inside `emit-js.ts` while the type-checked TS AST and Sema types are available, instead of after the fact:
  emit classes as prototype functions with plain `=` assignments and getters via the supported `Object.defineProperty(value|get)` forms only, `for-of` over typed arrays only (Zinc knows the iterable kind statically; `docs/guide` forbids holey arrays), no `Symbol`, async/await mapped to explicit continuation functions (the C++ side does this with protothreads, `docs/decisions/0007-async-protothreads.md`), generators to a state machine or a Zinc-specific closure helper, `extends Error` via a helper written for mqjs, closures with per-iteration bindings. Zinc's language (no regex/eval/prototype surgery/`in`) makes this far smaller than a general lowerer. [I] ~4-6 weeks.
- **Track B, third-party JS (Three.js, npm libs).** `esbuild` (bundle) -> **SWC `jsc.target: es5`** (fast, correct, `externalHelpers` to share one helper module) -> `mqjs-fixup` pass (~150 lines on oxc-parser/`estree` walking: rename shadowing catch variables, remove holes, rewrite unsupported `defineProperty` descriptor shapes, replace `BigInt` literals with an error) -> polyfill bundle. Fall back to Babel only if SWC output has a correctness bug. Upstream Three.js is out of reach on mqjs regardless (mquickjs.md: 31-bit ints, no Proxy/Map/typed-array set); this track is for small pure-JS libs.

### 4.3 Hook / plugin API (Rollup-style)

Zinc already has "plugins" (native modules and displays, `plugins.ts`); add **pipeline plugins** in `zinc.json` (`"pipeline": ["./tools/my-stage.mjs"]`), an ESM file exporting:

```ts
export default (opts): ZincPipelinePlugin => ({
  name: 'my-stage',
  // Rollup-style build hooks; all receive ctx = { target, profile, engine, dev, project, cache }
  resolveId(spec, importer, ctx) { /* platform variants, aliases */ },
  load(id, ctx) { /* virtual modules, e.g. zinc:platform */ },
  transform(code, id, ctx) { /* per-file, content-addressed cache key includes plugin version+opts */ },
  analyze(program, sema, ctx) { /* return diagnostics */ },
  renderChunk(code, chunk, ctx) { /* after bundle: define, banner, wrap */ },
  emit(artifacts, ctx) { /* extra artefacts, e.g. bytecode */ },
  package(dist, ctx) { /* assets */ },
})
```

Design rule: hooks are a *subset of Rollup/Vite/Rolldown hooks* (`resolveId/load/transform/renderChunk`) so that esbuild plugins, Rollup plugins and later Rolldown can be reused with a shim; Zinc-only hooks are `analyze`, `emit`, `package`. Implement first as a thin wrapper around esbuild's plugin API (only bundle-level hooks) and Zinc's own stage runner for the rest; move to Rolldown if plugin reuse matters.

### 4.4 Persistent cache (content-addressed)

- Key = `sha256(file bytes + resolved import hashes + stage id + stage version + options subset + compiler hash)`; location `build/.zinc-cache/<stage>/<hash>` (project-local, gitignored) with an optional shared `~/.cache/zinc`.
- Reuse the fingerprints already computed for `--core` (`coreCompiler()`, `engines.ts:87`: hash of compiler+runtime sources).
- Cacheable: per-file transform (esbuild/SWC output), TS `Program` (tsbuildinfo or `--incremental` for the tsgo gate), bytecode, baked fonts/images (`collectResources` currently rebuilds per build; the docs report `baked 18 font sizes ... in 196 ms` [V]), and the compat report.
- Metro/PocketJS both cache per-file transforms by content hash **[W]**.

### 4.5 Dev mode and fast refresh

Current: full reload, state lost on native hot reload (`docs/dev-mode.md`). Path to per-module refresh, **JS engines first** (QuickJS/JSC), because native `.so` swap has no module identity:
(1) bundle in dev as a module registry (`__zn_define(id, factory)`, like Metro's `__d`) instead of a single scope; (2) on save, transform only the changed file (cache hit for the rest), push the new factory over the existing dev socket; (3) `zinc:ui/solid` and `zinc:ui/react` already own the component runtime (`lib/std/solid.ts`, `react.ts`), so a `$refresh` boundary is implementable in Zinc (react-refresh semantics for React, HMR re-run of the component for Solid). [I] 3-4 weeks after the registry bundle exists. For native/VM targets keep full reload; ZBC4 hot patching is a separate topic.

### 4.6 Lint, doctor, compat report

**`zinc lint`** (new command; also runs in stage 4 as warnings-become-errors with `--strict`):

- Shipped config generated by `zinc tsconfig` (already writes `tsconfig.json` and links the tsserver plugin, `tools.ts`): `eslint.config.mjs` and `.oxlintrc.json` referencing `@zinc/lint` (a package inside `lib/editor/`), so editors show target problems live.
- Rules (implemented once as ESLint-API rules; oxlint runs them through JS plugins **[W: alpha]**, ESLint runs them natively; both consume the same file):
  - `zinc/no-unsupported-syntax` with a per-engine table (mquickjs: `class`, arrow?, `let/const` are lowered by Zinc, so not errors; hard errors are `with`, direct `eval`, `Proxy`, `Symbol`, regex features beyond mqjs's, labelled tricks unsupported...). Generate from the same table as the compat report.
  - `zinc/no-unsupported-api` (name-based, type-aware through the Sema: `Promise` on mqjs unless polyfill on, `fetch` w/o `zinc:web/fetch`, node builtins `fs`, `path`, `child_process` forbidden -> point to `zinc:*`).
  - `zinc/no-dyn` (mirrors `--no-dyn`, `Z1017`), `zinc/no-regex` (`Z1008`), `zinc/numeric-narrowing` (i32 arithmetic overflow hints).
  - Baseline off-the-shelf for third-party code: `es-x/*` with `restrict-to-es2015`-style preset per profile, `eslint-plugin-compat` is browser-oriented and not useful.
- Perf: oxlint 0.05 s vs ESLint 0.7 s on the 195 KB bundle **[V]**; recommend oxlint in `zinc lint` (bundled binary via npm optional dep), ESLint config only for editors that already have it.
- Build-vs-buy: buy the linter engine, build ~10 rules (~1 week).

**`zinc doctor`**: extend `cli.ts:928` beyond tool probes: per-target toolchains (zig/cmake/idf/docker), engine binaries and version pins (QuickJS-ng 0.17, mqjs commit), `typescript6` vs `typescript` API state, a cache report, and the compat report for the current project.

**Engine compatibility report (preflight)** `zinc check --report [--engine E --target T]` -> `build/compat.json` + terminal table. Inputs:
1. Import graph from the resolver: every `zinc:*` module -> capability table (`capabilities.ts`, `@requires`, `Z5004` already exists) and per-engine ABI adapter availability (`abi.imports`, `engines.ts:20-24` already errors on missing adapters).
2. Syntax/API usage scan: parser walk (oxc) over app + node_modules JS, matched against `engines/<name>.json` (syntax features, globals available, quirks such as mqjs holes/catch).
3. Budget: bundle bytes vs target `heap`/flash budget (e.g. esp32 `zinc.json` heap), forbidden node builtins, dependency vet (lockfile hash list, license, size budget per package, `sideEffects` missing -> warn).
Output example rows: `mquickjs: Promise: polyfill (+6 KB) | classes: lowered | Symbol.iterator in lib/std/ui.ts:88: ERROR | regex in three/src/...:n: ERROR`.

### 4.7 Polyfill and shim policy

- Zinc owns the semantics of its own `zinc:*` modules, so the *shim per engine is part of the target profile*, not user-installed polyfills: `sim/zinc.mjs` (ES2022 node/QuickJS/JSC), `sim/zinc.es5.js` (mqjs; no `BigInt`/`Symbol`/class fields, see E3), `zinc:web` for Web APIs.
- Language built-ins: `Promise` (+ microtask drain driven by the C loop), `Map`, `Set`, `Object.{assign,entries,freeze,...}`, `Array.{from,includes,fill,flat}`, `Number.isInteger` for mqjs come from **one Zinc-authored ES5 polyfill bundle, tree-shakeable per use** (the compat report lists what got pulled in). Do not use `core-js` (size, feature-detection code paths assume `Symbol`).
- Web APIs for Three.js-class libs: browser-host tier and QuickJS/JSC get `canvas`/`Image`/`fetch`/`requestAnimationFrame` through `zinc:web` + a WebGL binding layer (threejs-webgl.md); on mqjs the answer is "unsupported, error in compat report".
- Rule: polyfills are injected by the bundler stage only when the compat scan finds the global, and they are visible in `zinc build --explain`.

## 5. Buy vs build and concrete choices

| Concern | Choice | Buy/build | Justification |
|---|---|---|---|
| Semantic TS API | `@typescript/typescript6` (keep) | buy | TS 7.0 ships no API **[V]**; single import site `frontend.ts:3` already isolates it |
| Fast type gate | `typescript@7` `tsc --noEmit` | buy | 4.8x faster **[V]**; already a devDependency |
| Bundler/minify/define | esbuild (Rolldown later for plugin reuse) | buy | 76 ms **[V]**; plugin API used successfully for `zinc:*`; Rolldown is Rollup-compatible and uses oxc [W] |
| Parser for third-party JS scans | oxc-parser | buy | fastest, ESTree output |
| Linter engine | oxlint + Zinc JS-plugin rules; ESLint config for editors | buy engine, build ~10 rules | oxlint plugin API alpha [W]: keep ESLint as fallback |
| ES5 for mqjs, Zinc code | Zinc's own emitter (Track A) | **build** | Only way to control mqjs quirks and keep Zinc's numeric semantics (Section 3) |
| ES5 for mqjs, foreign code | SWC (+Babel fallback) + `mqjs-fixup` | buy + build (~150 lines) | SWC 12/30 vs Babel 9/30 vs TS 14/30 raw on mqjs, all needed fix-ups; SWC fastest; TS is a dead end (deprecated) |
| Bytecode | `qjsc`-style `JS_WriteObject` in the runner; `mqjs -o` | build (small) | stage 8 |
| Cache | content-addressed dir | build (~300 lines) | reuse `--core` hashing |
| Asset pipeline | existing `resources.ts` + hooks | build | already ahead of PocketJS for fonts; add texture/i18n hooks |
| Advanced optimisation | Closure ADVANCED (optional, pure-Zinc bundles) | buy, later | needs types/externs work; not before Track A |

## 6. Expected performance wins by engine (evidence tagged)

| Stage | native (C++) | zinc-vm | quickjs-ng | jsc / v8 | mquickjs |
|---|---|---|---|---|---|
| resolve/parse/typecheck | dev-loop win only (tsgo gate 1.7 s -> 0.35 s **[V]**) | same | same | same | same |
| lint / compat report | applies (Zinc subset rules) | applies | applies | applies | **critical** (unblocks) |
| transform / lower | HIR (n/a) | HIR (n/a) | none (ES2023) | none | required (`es5-mqjs`) |
| bundle (single file) | n/a | n/a | fewer files, tree-shaking; 194 KB from 7 modules **[V]** | same | required (no ES modules) |
| define + DCE | build time, per-target constants | same | smaller bundle | same | required for RAM |
| minify | n/a | n/a | -45% bytes, **~0% parse time** (8.06 vs 8.78 ms) **[V]**; helps OTA/flash | same | flash size (ROM-able) [I] |
| bytecode precompile | n/a | already (ZBC4) | **skips ~9 ms parse per 195 KB on M1; ~100 ms on Pi 3B+ [I]**; plus lazy function compile in QuickJS [I] | JSC/V8 code cache [I] | bytecode from flash, no parser at run time [W mquickjs README] |
| lazy/inline requires | n/a | n/a | defer `ui.mjs`(167 KB) init; measurable only with a startup profile (not done) | same | RAM |
| snapshot (Wizer-like) | n/a | n/a | not available on QuickJS; hoist init at compile time [I] | V8 startup snapshot [I, not tested] | n/a |
| throughput | none | none | none for ES2022; **ES5 lowered code parses ~10% slower and is heavier at run time (helpers) [V parse only; run time not measured]** | none | ES5 dialect vs hand-written ES5: unknown |

Honest summary: the pipeline's value is mostly **enabling** (mquickjs, npm libs, lint before a 12 s cmake build, dev loop) and **size**, and secondarily startup via bytecode. It is not a throughput lever for QuickJS/JSC.

## 7. Milestones and effort (one strong developer, unvalidated **[I]**)

| M | Deliverable | Days |
|---|---|---|
| M0 | Stage runner skeleton in `cli.ts`/`engines.ts` (named stages, `--explain`, timings); move `bundleJs` behind stage `bundle`; `zinc-native` esbuild plugin; esbuild ESM/IIFE bundle for quickjs; `define` constants | 5-7 |
| M1 | Content-addressed cache (transform, bytecode, resources) | 4-5 |
| M2 | QuickJS bytecode emit + runner loads bytecode, source fallback, `engine.json` fields | 3-4 (aligns with "cheap wins" in README) |
| M3 | Lint: `@zinc/lint` package, ESLint config + oxlint plugin, 10 rules, `zinc lint`, `zinc tsconfig` writes config | 5-7 |
| M4 | Compat report (`zinc check --report`), engine tables `engines/*.json`, `zinc doctor` upgrade, bundle size budget | 6-8 |
| M5 | tsgo fast gate + incremental (`--incremental`) for `zinc check`/editor | 2-3 |
| M6 | Pipeline plugin API (`zinc.json` `pipeline`), Rollup-compatible subset, docs | 5-6 |
| M7 | Third-party npm in JS engines: export conditions, node_modules bundling, `sideEffects`, node-builtin ban, `three` on JSC/QuickJS via bundling instead of plugin rewrite | 6-10 |
| M8 | mquickjs Track A (`es5-mqjs` emitter profile + `sim/zinc.es5.js` + polyfill bundle) | 20-30 (part of mquickjs.md's 32-45) |
| M9 | mquickjs Track B (SWC + `mqjs-fixup`) | 5-7 |
| M10 | Dev registry bundle + per-module refresh for Solid/React on JS engines | 15-20 |
| M11 | Closure ADVANCED pilot (optional) | 8-12 |

Order: M0, M2, M1 (cheap wins, days), M3-M5 (developer experience, independent), M7 (unblocks Three.js on JSC/QuickJS), then M8/M9 only if the mquickjs decision is taken; M6, M10 later. M0-M5 ~ 25-34 days, no new engine.

## 8. Risks

- **mqjs moving target**: catch-variable/hole/defineProperty restrictions were found by trial; an `engines/mquickjs.json` conformance suite (the 30-case corpus is the seed, kept under `tests/`) must run in CI against the pinned mquickjs commit.
- **Two semantic authorities** if Track B foreign JS and Track A Zinc code interoperate in one bundle (numeric narrowing only applies to Zinc-typed code); keep them in separate bundle scopes.
- **Bytecode versioning**: QuickJS bytecode is not stable across versions; the fingerprint must include engine version and compile flags, and OTA must reject mismatches (`engine.json` already carries fingerprints).
- **esbuild vs Rolldown/oxc churn**: oxc minifier is alpha, oxlint JS plugins alpha **[W]**; wrap them behind the stage interface, pin versions, keep ESLint and esbuild as fallbacks.
- **TS 7 API gap**: if TS 7.x API changes semantics, `frontend.ts` is the only swap point, but Sema depends on checker details; keep `typescript6` pinned.
- **Property mangling / ADVANCED** break `Dyn`, `zinc:script` and ABI names; default off, opt-in per namespace.
- **Source maps**: bundling + minify + lowering multiplies the map chain; the VM has `.zbc.debug` sidecars (`engines.ts:55`) but the quickjs path has none; plan source-map v3 per stage (esbuild/SWC emit them) and a `zinc stack` resolver reading `.map` or `.zbc.debug`.
- **Not measured here**: runtime throughput of ES5-lowered code, bytecode load time, memory of retained source, mqjs run of the full UI bundle (needs the shim rewrite), Pi/ESP32 parse times.

## 9. Sources

- Repo: `compiler/src/{cli,frontend,engines,emit-js,plugins,tools,resources,sema}.ts`, `docs/dev-mode.md`, `docs/engines.md:208-275`, `docs/guide/02-language.md`, `docs/targets/capabilities.md`, [mquickjs.md](mquickjs.md), [README.md](README.md).
- PocketJS: [repo](https://github.com/pocket-nexus/pocketjs), [`tools/build.ts`](https://github.com/pocket-nexus/pocketjs/blob/main/tools/build.ts), [`docs/DESIGN.md`](https://github.com/pocket-nexus/pocketjs/blob/main/docs/DESIGN.md), [`docs/RUNTIMES.md`](https://github.com/pocket-nexus/pocketjs/blob/25081f644a39426f3c63c90aad8cb5f3fcdecdfa/docs/RUNTIMES.md).
- Metro: [Concepts](https://github.com/facebook/metro/blob/main/docs/Concepts.md), [Configuration](https://github.com/facebook/metro/blob/main/docs/Configuration.md), [Expo metro.config](https://docs.expo.dev/versions/latest/config/metro/); Re.Pack: [re-pack.dev](https://re-pack.dev/docs/getting-started/introduction).
- esbuild ES5: [issue #297](https://github.com/evanw/esbuild/issues/297). oxc: [lowering](https://oxc.rs/docs/guide/usage/transformer/lowering), [JS plugins alpha](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha.html), [Vite 8 / Rolldown](https://vite.dev/blog/announcing-vite8).
- TypeScript: [6.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/), [downlevelIteration deprecation PR](https://github.com/microsoft/TypeScript/pull/63071), [6.0 -> 7.0](https://visualstudiomagazine.com/articles/2026/03/23/typescript-6-0-ships-as-final-javascript-based-release-clears-path-for-go-native-7-0.aspx).
- Closure: [type-based renaming](https://github.com/google/closure-compiler/wiki/Type-Based-Property-Renaming), [limitations](https://developers.google.com/closure/compiler/docs/limitations), [ES5 for-of size](https://github.com/google/closure-compiler/issues/4345).
- Prepack: [archived](https://github.com/facebookarchive/prepack). Hermes: [static_h](https://github.com/facebook/hermes/blob/static_h/doc/blog/README.md). Javy/Wizer: [Javy](https://bytecodealliance.org/articles/javy-hosted-project), [Wizer](https://github.com/bytecodealliance/wizer). ESLint es-x: [eslint-plugin-es-x](https://github.com/eslint-community/eslint-plugin-es-x).
- Not searched, from general knowledge and flagged [I]: V8 startup snapshots, Babel `transform-classes`/regenerator internals, Porffor, AssemblyScript, weval, import-map and lockfile vetting practice.
