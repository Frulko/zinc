# Supporting `react-dom` code on Zinc (research, 2026-10-18)

Audit of the repo plus web research. No code changed, nothing built. Tags: `[repo]` = read in this tree (path:line); URLs = fetched 2026-10-18; `[measured]` = measured here (method given); `[general]` = general knowledge, no source fetched; `UNVERIFIED` = not confirmed.

## 0. Answers to the direct questions

- **Is real React (react, react-reconciler) used today? No.** The React model is a re-implementation in Zinc strict, `lib/std/react.ts` (259 lines): `Instance` per component, hooks in an array, whole-component re-render scheduled with `queueMicrotask`, positional host-node reuse (`lib/std/react.ts:1-3`, `:91-96`). It is not on Solid signals either: Solid's API is a second, separate re-implementation (`lib/std/solid.ts`, 336 lines, "Solid's reactive API reimplemented", `:1`). JSX is not React's `jsx()` call: it is a compile-time lowering to `_el/_rc/_text...` helpers (`next/src/frontend/jsx.cpp:1-5`; `docs/reports/zinc-quickjs-bundler.md:27-28`).
- **`react` / `react-native` imports are rewritten, not resolved.** Under `"ui": {"preset": "react-native"}`, `'react'` becomes `zinc:ui/react` and `'react-native'` becomes `zinc:react-native` (`next/src/frontend/jsx.cpp:1170-1176`, `docs/react-native.md:3-9,13-21`). `examples/rn-port/src/App.tsx:4-5` is a stock RN screen with `import React, { useState } from 'react'`; it runs on the re-implementation, not on npm React (`docs/reports/rn-port-spike.md:3-8`).
- **The DOM does not exist on the native engines.** `docs/reports/zinc-next-webenv.md:1-6` says the QuickJS "web environment" "is not a DOM implementation" (opt-in, `"web": true`); it has elements, `classList`, simple selectors, events, but "Layout: none" (`:57-60`) and `innerHTML` with markup is kept as text.
- **Real `react` + `react-dom` on the web export: only the element factory was tried.** `docs/targets/web-libraries.md:41`: "react (`createElement`)... works... `react-dom` was not tried". `docs/targets/web.md:355-356` says React/Preact/react-dom "are not needed".

## 1. Exists

| What | Evidence |
|---|---|
| React-model engine: `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useRef`, class components (`setState` replaces the whole state), `key` matching of child components by name+key | `lib/std/react.ts:103-141,180-259` |
| Fast Refresh for it | `lib/std/react.ts:44-49,226-241` |
| React Native layer on that model: View, Text, Image, ScrollView, Pressable, TextInput, FlatList, SectionList, Modal, Switch, Animated, StyleSheet, Platform... with Yoga 3.2.1 (`rn` layout, 227/227 expressible conformance cases) | `docs/react-native.md:20-45`; `docs/reports/rn-port-spike.md:7-9`; `lib/std/react-native.tsx` (629 lines) |
| RN style semantics, Tailwind-like `className` resolved at build time, CSS-like style objects (`width: '50%'`, `gap`, `position`, `overflow`, transforms, gradients, shadows) | `docs/react-native.md:84-93`; `docs/ui.md:659-735` |
| Platform file resolution (`.web.tsx`, `.native.tsx`) like Metro | `docs/react-native.md:62-83` |
| JSX rules: `className` not `class` (Z0006), capitalised components only (Z0007). Lowercase `div`, `span`, `p`, `img`, `input`, `button`... are refused with "write `<View>`" | `next/src/frontend/jsx.cpp:442-451,467,1159-1166`; AGENTS.md "Real JSX and TSX" |
| Web export: the app's bundled JS runs on the browser's own engine; two render modes: canvas (default) and **semantic DOM** (the zinc:ui tree becomes real `div/button/input/a/h1/form/img` elements with ARIA, laid out by browser CSS flexbox, native scroll/focus; Zinc's classic layout still runs underneath for geometry) | `docs/reports/zinc-web-export.md:6-12,29-57`; `docs/targets/web.md:60-100` |
| npm packages bundled by esbuild on the web target (dev pre-bundle, export tree-shake); 13 libs tested, including `react` (factory only) and `preact` (`h`) | `docs/targets/web.md:358-385`; `docs/targets/web-libraries.md:11-41` |
| QuickJS-ng 0.17 engine, ES2023+, Proxy, Reflect, WeakRef, BigInt; bundler `zinc bundle` (esbuild) links packages to one file; `--engine quickjs` runs plain JS | `docs/reports/zinc-quickjs-bundler.md:10-22,64-70` |
| Browser-ish globals on QuickJS (opt-in): `window`, `document` subset, `EventTarget`-style capture/bubble, `fetch`, `localStorage`, canvases | `docs/reports/zinc-next-webenv.md:19-56` |
| WinterTC web APIs as globals (URL, fetch, Event/EventTarget, AbortController, crypto) in the typed engine | `docs/guide/09-web-apis.md:1-50` |
| Compat shims for other libraries: Inferno (`lib/compat/inferno.ts`) and PocketJS Solid, mapped by name | `next/src/frontend/modules.cpp:3459-3466` |
| Input model close to DOM: pointer events with bubbling (`bubble()` at `lib/std/ui.ts:4869`), key events, `onInput`, form `onSubmit`, focus, `aria-*`/`role`/`data-*` attributes, semantic hints `as`, `href`, `htmlFor`, `autoComplete`... | `lib/std/ui.ts:4869-5136`; `next/src/frontend/jsx.cpp:26-31`; `docs/ui.md:482-506` |
| Two earlier decisions on this very question | `docs/reports/zinc-next-open-questions.md:98-130` (2026-10-06: do a react-reconciler host on QuickJS, do not build a DOM shim); `docs/reports/zinc-web-export.md:44-57` ("A second UI written for the DOM (React DOM components)" scored 63 and rejected: every demo would be rewritten) |
| `plugins/webview`: a WKWebView / android WebView placed by a `NativeView`, with postMessage + RPC. This is an embedded browser path, macOS/iOS/Android only | `plugins/webview/plugin.json:1-18` |

## 2. Partial

| What | Gap | Evidence |
|---|---|---|
| Hooks | Present: the 7 above. `useEffect` has **no cleanup** (the function's return is not stored; a re-run "would stack subscriptions"), deps typed `number[]` and compared by `join(',')` string (so objects, strings and refs compare wrongly), setter takes a value only (no `setX(prev => ...)`), `useState` bail-out is `===` only | `lib/std/react.ts:117-127,101,103-109` |
| Update model | Not fiber/Concurrent. A state change re-renders the whole component and reconciles by position; **no batching rules, no transitions, no priorities** (`queueMicrotask` per instance) | `lib/std/react.ts:91-96` |
| Keys | Matched only for child **components** (name + key); host nodes by tag at position, so reordering host elements by `key` does not move DOM state (focus, scroll, animations) with the key | `lib/std/react.ts:71-90,227-243` (`_rc`) |
| Events | Zinc names (`onPress`, `onPointerDown`, `onTap`, `onInput`); `onClick`/`onChange`/`onKeyDown`/`onFocus` not a complete DOM set: RN `TextInput` lacks `onFocus/onBlur` | `next/src/frontend/jsx.cpp:20-22`; `docs/react-native.md:29` |
| Refs | `useRef` + `ref={r}` store a node **handle** (`i32`), not an element object | `lib/std/react.ts:138-144,190-191` |
| Web export DOM mode | Real DOM output, but produced from the Zinc tree, not authored as DOM; class names come from Zinc styles (generated atomic classes `property:value`); the author's own CSS classes/stylesheets have no input | `docs/reports/zinc-web-export.md:44-57`; `docs/targets/web.md:99-104` |
| npm in QuickJS (native) | Pure-JS libs work; `Intl`, `Temporal`, `WebAssembly` missing; Node built-ins stop the link; Web globals are not given to packages (only to project files); local `Date` getters return UTC | `docs/targets/web-libraries.md:56-72` |
| JSX of packages | A workspace package shipping JSX is compiled by esbuild's plain loader **without** Zinc's lowering | `docs/targets/web.md:382-384` |
| Unknown whether npm React runs on QuickJS-ng here | No test; the bundler report lists no React run | `docs/reports/zinc-quickjs-bundler.md` (no React row); UNVERIFIED |

## 3. Missing

- **Context**: no `createContext`, `useContext`, `memo`, `forwardRef`, `Fragment` (JSX fragment is lowered, not an API), `Suspense`, `lazy`, `useId`, `useTransition`, `useDeferredValue`, `useSyncExternalStore`, `useImperativeHandle`, `createPortal`, `StrictMode`, `Children`, `cloneElement`, `createElement`. Grep of `lib/` for `useContext|createContext` hits only `lib/std/gl.ts` (WebGL contexts, unrelated). This is what breaks most npm React libraries (React Router, Radix, TanStack Query, Zustand's hook, Redux's hooks, Testing Library).
- **Elements as values**: JSX is statement-lowered into host calls during render; there is no element tree object, so `children` inspection, `cloneElement`, `React.Children.map`, render props returning elements stored in state, and `createElement` from a library cannot work. This is the structural reason real npm React cannot sit on `zinc:ui/react`.
- **Lowercase intrinsic tags.** Z0007 refuses `<div>`, so react-dom code cannot compile today (`next/src/frontend/jsx.cpp:442-451`). AGENTS.md: "never add a back door that accepts the old spelling". Any react-dom mode needs an explicit, preset-scoped owner decision (section 7, item 1).
- **CSS**: no cascade, no selectors, no stylesheet, no `<style>`/`.css` for DOM tags; `display: block/inline/inline-block/grid/table` absent (only flex, `none`, `contents`, `lib/std/ui.ts:292,1071`; `docs/reports/layout-engines.md:23` "Missing: grid, sticky"), no margin collapsing (same as RN, `:66`), no float, no `position: sticky/fixed`, no pseudo-classes beyond Tailwind-like variants.
- **Document APIs on native**: layout (`getBoundingClientRect`, `offsetWidth`), `innerHTML` parsing, `DOMParser`, `FormData`, `Worker`, cookies (`docs/reports/zinc-next-webenv.md:57-60`), `getComputedStyle` is a stub.
- **Concurrent React, Suspense, `use()`, Actions, `useOptimistic`, `useActionState`, form `action`**: none.
- **react-reconciler host or any real-React bridge**: none (grep `react-reconciler|react-dom` in repo finds only four docs: `docs/targets/web.md`, `web-libraries.md`, `ui-rendering-architecture.md:113`, `zinc-next-open-questions.md`).

## 4. Definitions and web research

### 4.1 react-reconciler (option C)

- Current: `react-reconciler@0.34.0`, MIT, peer `react ^19.3.0`, dep `scheduler ^0.28.0`, unpacked 1.85 MB (npm registry, https://registry.npmjs.org/react-reconciler/latest, fetched today).
- Host config README: you pass a host-config object to `Reconciler(HostConfig)`. Mutation mode (`supportsMutation`: `createInstance`, `appendChild`, `commitUpdate`, `removeChild`, ...) is what react-dom uses; persistent mode (clones) is what React Native Fabric uses. The README says the API "is not as stable as that of React", "experimental", "does not follow the common versioning scheme", use "at your own risk" (https://github.com/facebook/react/blob/main/packages/react-reconciler/README.md). **Consequence: a host config is pinned to one React minor; each React upgrade is a porting task** (0.x versions break by design).
- Users: Ink calls itself "a React renderer" (https://github.com/vadimdemedes/ink); react-three-fiber "can render to a root, similar to how react-dom and all the other React renderers work" (https://r3f.docs.pmnd.rs/api/canvas); the RN Skia repo in this tree's research uses a custom reconciler host (`docs/reports/ui-rendering-architecture.md:113`). react-pdf, react-blessed, NativeScript-React, Lynx (ReactLynx): `[general]`, not fetched here; Lynx is believed Preact-based, UNVERIFIED.
- React 19 points for a host (https://react.dev/blog/2024/12/05/react-19): `ref` as a prop (function components receive it), ref callbacks may return a cleanup (the host must skip the `null` call when a cleanup exists), `<Context>` as a provider, `use()`, Actions in transitions, `<form action={fn}>`, `useActionState`, `useOptimistic`. Server Components are irrelevant here. Form `action` and `requestFormReset` are DOM-host features that a DOM-subset host must implement or reject.

### 4.2 react-native-web (the reverse mapping)

"A compatibility layer between React DOM and React Native": renders RN components with React DOM, styles in JS compiled to CSS, gesture responder (https://necolas.github.io/react-native-web/docs/). Zinc's web export DOM mode already does a similar thing from a different direction (Zinc styles -> generated atomic classes, `docs/targets/web.md:99-104`). The reverse of the owner's goal is therefore half solved; what is missing is DOM-authored code.

### 4.3 Sizes (measured: esm.sh minified ES2022 bundles, 2026-10-18, `gzip -9`)

| Package | Version | Minified | Gzip |
|---|---|---|---|
| react | 19.1.0 | 9.9 KB | 3.8 KB |
| react-dom/client (bundle, includes its scheduler) | 19.1.0 | 179 KB | 56 KB |
| scheduler | 0.26.0 | 5.5 KB | 2.3 KB |
| react-reconciler (bundle, with a few Node shims) | 0.32.0 | 117 KB | 37 KB |
| preact | 10.26.0 | 11.5 KB | 4.8 KB |

React + react-dom is about 190 KB min / 60 KB gz; React + a custom reconciler about 127 KB min / 41 KB gz. Preact alone is about 5 KB gz (the "3-4 KB" claim of its marketing is for a smaller build; `preact/compat` was not fetchable here). For scale: the web export of `examples/hero` is 380 KB / 118 KB br (`docs/reports/zinc-web-export.md:141`) (QuickJS startup numbers: `docs/reports/zinc-quickjs-bundler.md:120-131`, not React-specific).

Startup/memory of React on QuickJS: **no source found** (one search; QuickJS runtime life cycle under 300 us and Micro QuickJS ES5-only are the only data, https://linuxiac.com/qemu-and-ffmpeg-founder-introduces-micro-quickjs-javascript-engine/). Micro QuickJS cannot run React (ES5 subset). QuickJS-ng has no inline caches and is 3-6x slower than Zinc's typed interpreter on numeric kernels (`docs/reports/zinc-quickjs-bundler.md:20`, `docs/reports/zinc-next-quickjs.md:31`). **Must be measured** before promising small devices (work item 3). On the ESP32 target Zinc already forbids the QuickJS engine (`docs/reports/zinc-next-quickjs.md:30`).

### 4.4 DOM implementations in JS (option B inside QuickJS)

jsdom vs happy-dom: happy-dom's own benchmark: import 333 vs 45 ms, parse HTML 256 vs 26 ms, custom element render 214 vs 19 ms (jsdom vs happy-dom; same table in every README version, so possibly stale; https://cdn.jsdelivr.net/npm/happy-dom@20.14.0/README.md). No heap numbers found. Neither has layout (they return zeros for `getBoundingClientRect`). Both exist to run tests, not to paint, and need Node built-ins (`fs`, `stream`, `url`), which stop the link on QuickJS (`docs/targets/web-libraries.md:65-70`). Not recommended; Zinc's own webenv (`zinc-next-webenv.md`) already decided "a thin environment of our own, 67, against a DOM library in JavaScript inside QuickJS, 43" (`:5-6`).

### 4.5 Browser engines without a browser

- **Blitz (Dioxus Labs)**: native HTML/CSS renderer on Stylo (CSS), Taffy (box layout), Parley (text/inline layout), Vello/wgpu painting, AccessKit "coming soon"; omits WebRTC, WebSockets, localStorage; "experimental" in Dioxus 0.7 docs (https://gitee.com/mrlijing/blitz mirror of the README; https://dioxuslabs.com/learn/0.7/beyond/project_structure). Rust, GPU renderer. A secondary report says the Dioxus team joined Cognition (https://www.beri.net/article/cognition-dioxus-acquihire-blitz-taffy-crate-owners-kitesurf-dependency): UNVERIFIED.
- **litehtml**: CSS2/CSS3 subset layout engine in C++, host supplies drawing through a callback interface, gumbo-parser for HTML; distro packages 255 KB to 863 KB installed, not a stripped link size (search results from packages.msys2.org, pkgs.alpinelinux.org). The only candidate here that gives block/inline flow in a small C++ library. Licence BSD-3 `[general]`. It has no JS and no live DOM mutation API suited to React (a full re-layout API, UNVERIFIED).
- **Servo / Ladybird / Flutter web HTML renderer**: `[general]`, not researched here; none fits a 100 KB-class target, and Flutter dropped its HTML renderer path `[general]`.
- Takeaway: rendering real HTML+CSS needs Stylo-class CSS (cascade, selectors, media queries, custom properties) plus inline formatting; the smallest credible stack is megabytes and, in the Rust cases, a different language. `next/RULES.md` (proven libraries only) would permit litehtml or Blitz as vendored libraries, but neither is a drop-in for Zinc's retained `UiNode` tree.

## 5. The gap between the browser model and Zinc's flexbox

| Browser (react-dom) | Zinc today | Consequence for a DOM-subset host |
|---|---|---|
| `div` is `display: block`, children stack vertically, width fills the parent, height is content | every box is a flex container (`docs/targets/web.md:103`), column by default under RN | **Closest match is easy**: `div` = column flex with `align-items: stretch`. Yoga's `useWebDefaults` gives CSS defaults (`flex-direction: row`, `flex-shrink: 1`) (`docs/reports/layout-engines.md:21`). Host sets the web defaults per tag |
| `span`, `a`, `strong`, `em`, text nodes flow **inline** in a paragraph, wrapping across element boundaries | `Text` is a leaf measured as a box; nested `Text` runs inside `Text` exist only as styled spans of one paragraph, if the text engine supports them (not verified) | Inline formatting is the biggest hole: `<p>Hello <b>bold</b> <a>link</a></p>` needs one text layout with mixed runs and inline hit-testing. Host could fold inline-only subtrees of `p/span/a/b/em/code/h1-6` into one `Text` with runs; mixed inline-block children are rejected |
| margin collapsing, `margin: auto`, `inline-block`, `float`, `table`, `grid` | no collapsing (`docs/reports/layout-engines.md:66`), `auto` margins in rn, no grid/float/table | Document, name them as unsupported (section 8); `display: grid` is the largest request in modern CSS code and has no Yoga support |
| `box-sizing: content-box` default | Yoga supports `box-sizing` (`docs/reports/layout-engines.md:22`) | host sets `border-box` (as every CSS reset does) or honours the declaration |
| percent heights resolve against `auto` parents as `auto` | Yoga resolves like RN | small differences, covered by the Yoga conformance suite generated from Chrome (`docs/reports/layout-engines.md:12`, 548 cases) |
| Cascade: stylesheets, selectors, inheritance, `:hover/:focus`, media queries, custom properties | build-time `className` -> numbers, inline style objects; inheritance of text properties only | A **static CSS-to-style translator** (build time) covers class selectors, single-level descendant, `:hover`, `:focus`, media queries as breakpoints; anything else is a diagnostic. The 2026-10-06 evaluation reached the same conclusion: CSS "needs a CSS parser plus cascade, which is option B's cost in miniature" (`docs/reports/zinc-next-open-questions.md:117-119`) |

## 6. Feasibility of the options

Fidelity = share of typical react-dom component code that runs unchanged (author's judgement, not measured).

| Option | Fidelity to react-dom | Effort | Size / memory | Small devices | Web export | Risk |
|---|---|---|---|---|---|---|
| **A. Web export runs real React + react-dom** (TSX compiled by Zinc's own transform or esbuild, canvas/Zinc runtime bypassed) | Highest on the web: 100% of react-dom code and npm React libs | S to M: needs a project mode where esbuild's JSX (automatic runtime) replaces Zinc's lowering (`docs/targets/web.md:382-384` shows the current plain-loader behaviour) + a template + a test | +190 KB min / 60 KB gz for React+ReactDOM | no (web only) | yes, it is the web | Low. Output is a normal web app, so "why Zinc" must be stated: packaging, plugins (`zinc:video`, serial, sqlite), PWA. Native builds of the same source do not exist (needs B/C) |
| **B. react-dom-compatible host on Zinc's renderer** = shim `document`/DOM under unmodified `react-dom` | Highest on native in theory | XL: it is a browser (cascade, selectors, inline layout, events, forms, MutationObserver); every missing API is a runtime failure in third-party code (`zinc-next-open-questions.md:110`) | react-dom 179 KB + DOM shim (jsdom is much more) on QuickJS | no (QuickJS banned on ESP32; slow) | not needed | Very high; rejected in the 2026-10-06 evaluation. Flutter, Blitz, Servo show the scale |
| **C. react-reconciler host config on the zinc:ui tree** (real React as engine, host = Zinc nodes) | High for components + hooks + libraries that only need React (Context, Suspense, Zustand hook, TanStack Query, Radix logic hooks). Not for libs that read the DOM | M to L: ~1.5k lines of host config (estimate from `zinc-next-open-questions.md:109`), tag table, event adapter, style translator, plus a React upgrade policy | react 10 KB + reconciler 117 KB min (41 KB gz) + scheduler, on QuickJS-ng | desktop/Pi class only (needs QuickJS); not ESP32/PS1 | The web export keeps A for the same source (react-dom directly) | Medium: unstable API pinned to a React minor (`README`: "use at your own risk"); QuickJS speed unmeasured. Gains the whole hook/Context/Suspense semantics for free and removes the maintenance of `lib/std/react.ts` for new work |
| **D. Preact (+ `preact/compat`) or Solid compat** | Medium-high: `preact/compat` runs a large part of React libs, without Concurrent features (https://preactjs.com/guide/v10/getting-started: alias `react` and `react-dom`) | M: Preact has a custom renderer path only via `options` hooks and its own DOM diff; to avoid a DOM it needs a DOM-like tree (a mini-DOM of ~10 node types) | 5 KB gz, much smaller than React; mini-DOM adds code | the best of the QuickJS options (ESP32 still no) | yes (compat aliasing) | Medium: no stable reconciler-style host API; a mini-DOM of our own is a smaller B. Inferno compat already exists in this tree (`modules.cpp:3461`) with the same approach |
| **E (today). Keep `zinc:ui/react` re-implementation** | RN-like only; no Context/Suspense/npm hooks | S per feature, but unbounded long tail | none | all targets incl. typed AOT | yes | Each missing hook/API is ours to write; semantic drift from React over time |

## 7. Recommendation

1. **Layers, in this order, with the existing typed engine kept as the small-device path.**
   - **Layer 0 (now, S): Web export option A.** `zinc export --target web --react-dom` (or `"web": {"framework": "react"}`): app source is plain React + react-dom TSX built by esbuild (automatic JSX runtime, `className` already is real React JSX), Zinc supplies plugins, PWA, packaging and `@zinc/vite`. This delivers "React web code unchanged" on the one target where it is easy, and costs no engine work. Uses the existing bundler (`docs/targets/web.md:358-385`) and the pre-bundle (`:372-376`).
   - **Layer 1 (M to L): option C for native.** Real `react` + `react-reconciler` pinned to one version, bundled with `zinc bundle`, running on QuickJS-ng. A host config whose instances are `zinc:ui` node handles via the same host rows `zinc:ui/react` uses (`lib/std/react.ts:136-168`). This gives the RN-like API real Context, `memo`, Suspense, Fragment, key semantics, concurrent updates, and every npm hook library, with the React Native components of `lib/std/react-native.tsx` as host components (View, Text, ...). `zinc:ui/react` stays as the typed-AOT fast path and for ESP32/PS1 (`docs/reports/zinc-next-open-questions.md:121-123`).
   - **Layer 2 (M): a DOM-subset *component set* on top of Layer 1**, not an emulated DOM: lowercase tags `div span p h1..h6 button input textarea select option label a img ul ol li form section nav header footer main table` registered as host types in the reconciler host (so no Z0007 conflict if the preset opts in; see risk 1), each with web defaults on Yoga (`useWebDefaults`), a style translator from React's `style={{...}}` (camelCase CSS) to Zinc styles, and a **build-time CSS translator** for `.css`/CSS modules (class selectors, simple descendant, `:hover/:focus/:disabled`, media queries to breakpoints, custom properties, `rem/em/vw/vh`). Events: `onClick` -> tap, `onChange/onInput`, `onKeyDown/Up`, `onFocus/onBlur`, `onSubmit`, `onMouseEnter/Leave`, `onPointer*`, `onScroll`, `onWheel`; synthetic event with `target`, `currentTarget`, `preventDefault`, `stopPropagation`, bubbling on the existing `bubble()` machinery. Refs as host-instance objects with a small DOM-like surface (`focus()`, `blur()`, `value`, `scrollTo`, `getBoundingClientRect` from layout, `style`), portals as `ui.openLayer`.
   - **Layer 3 (web export):** with option A the same source runs on real react-dom; a project written for Layer 2 and exported to web uses react-dom directly (no host), so the host's subset is exactly the intersection that also works in a browser.
2. **Do not build option B.** Reconfirmed by `zinc-next-open-questions.md:110,128` and by the size of Blitz/litehtml-class projects (section 4.5).
3. **Do not bet on Preact first.** It is the cheapest runtime (5 KB gz) but needs a mini-DOM, and has no stable renderer API; it becomes interesting only if the QuickJS measurement (work item 3) shows React too heavy on a Pi-class board. Keep it as the fallback for layer 1 (same host, different engine).

## 8. What is unsupported and how it is reported

Unsupported in Layer 2 (explicit list, shown in docs and `zinc explain`):

- `document`/`window` APIs outside the existing webenv subset: `document.querySelector` on arbitrary selectors, `getComputedStyle`, `MutationObserver` effects, `IntersectionObserver`, `contentEditable`, `execCommand`, `dangerouslySetInnerHTML` (only inert text), `<iframe>`, `<video>` (use `zinc:video`), `<canvas>` via `Canvas`, drag and drop, selection API, clipboard events beyond copy/paste of text.
- CSS: `display: grid | table | inline | inline-block | float`, margin collapsing, `position: sticky | fixed` (fixed maps to a layer), pseudo-elements (`::before/::after`), attribute and sibling combinators beyond the supported set, `@supports`, `@font-face` (use assets), filters, `clip-path`, `mix-blend-mode`, `vh` on mobile semantics, `calc()` mixing units (supported where Yoga can resolve).
- Inline flow beyond text runs: inline-block images in a paragraph, floats, `vertical-align`, `white-space` combinations, `text-overflow` except single-line ellipsis and line clamp.

Reporting: reuse the existing channel, not a runtime failure.
- A lint pass at build time (like Z0006/Z0007, `next/src/frontend/jsx.cpp:442-467`, and `zinc migrate`) emits `Zxxxx` errors with a fix: `display: grid is not supported on this target: use flexDirection/flexWrap, or build for web (react-dom)`; for the CSS translator, warnings with file:line of the rule.
- Runtime guard: `ZnUnsupported` already exists for web-only APIs (`docs/targets/web.md:337-348`, `plugins/browser`); a native build that touches a missing DOM global gets the same error naming the API and the Layer 0 escape (`zinc export --target web`).
- `zinc check --target web` vs native differences listed by `zinc explain`.

## 9. Conformance approach

1. **Host contract tests.** A small suite per host type that renders with the real reconciler and asserts the Zinc tree (`ui.inspect()` dump, as `tests/t1/rn_port.sh` does) and the layout facts. T0/T1, `next/tests/<tier>/<name>.sh`.
2. **React's own tests are not portable** (they target react-dom + jsdom and internals). Take instead: (a) `@testing-library/react`'s query layer needs a DOM `document` (`getByRole`, `getByText`): not available natively. Plan: a thin `@testing-library/dom`-compatible query adapter over `ui.inspect()` (roles, labels) for Zinc-run tests, UNVERIFIED feasibility; (b) run the **same test files against real react-dom in Chrome** (`tools/cdp.py` exists, AGENTS.md) and against the Zinc host, and diff the resulting accessibility trees/text: this is the oracle idea Zinc already uses (`tools/web-compare`, `tests/t1/web_dom_visual.sh`, `docs/reports/zinc-web-export.md:172`).
3. **Layout conformance** reuses the 548 Chrome-generated Yoga cases (`docs/reports/layout-engines.md:160`) with web defaults, plus a CSS-translator corpus (rule -> expected Zinc style).
4. **Library matrix**, as in `docs/targets/web-libraries.md`: a pinned list of React libraries run natively (Layer 1/2) and in web (A): `zustand`, `jotai`, `@tanstack/react-query`, `react-hook-form`, `react-router`, `clsx`, `zod` resolvers, Radix primitives (headless), `framer-motion` (DOM-heavy: expected fail). Report works / works with note / does not, like the existing table.
5. **Demo gate**: port 2-3 existing React web examples (a todo, a form, a dashboard) unchanged; measure startup, RSS and per-update time on QuickJS vs the typed React model, record in `docs/reports/zinc-next-perf.md`.

## 10. Ordered work items

| # | Size | Item | Depends on | Output |
|---|---|---|---|---|
| 1 | S | Owner decision record: the lowercase-tag rule. Proposal: Z0007 stays for `zinc:ui` projects; a project preset `"ui": {"preset": "react-dom"}` accepts HTML intrinsic tags (because JSX defines them as intrinsic elements), `className` stays mandatory, unknown tags are still an error with a "did you mean". Change AGENTS.md accordingly | owner (the rule is his, 2026-10-16) | D-record, `jsx.cpp` flag |
| 2 | S | **Web A**: `zinc export --target web` for a React + react-dom project (esbuild automatic JSX, no Zinc lowering), template `zinc new --template react-web`, test `web_react_dom.sh` in headless Chrome; document in `docs/targets/web.md` (replace the "not needed" sentence at `:355`) | none | working path for react-dom on the web |
| 3 | S | **Measure** npm React 19 + react-reconciler on QuickJS-ng through `zinc bundle`: boot time, RSS, a 1,000-node list update, a counter, hello world; also Preact. Written to `docs/reports/zinc-next-perf.md` | none | go/no-go for layer 1 on Pi-class boards |
| 4 | M | **Layer 1 host config spike**: `react-reconciler` 0.3x pinned, host config over the `zinc:ui` host rows with `View/Text/Image/ScrollView/Input` (the Zinc capitalised tags), `useState/useEffect/useContext`, a keyed list, controlled `TextInput`; run `examples/rn-port` on it unchanged, compare frame hash with the current one (`tests/t1/rn_port.sh`) | 3 | the reconciler works on Zinc's tree |
| 5 | M | Event adapter and refs: synthetic event object (`target`, `currentTarget`, `preventDefault`, `stopPropagation`), bubbling/capture on `bubble()` (`lib/std/ui.ts:4869`), focus/blur, `ref` objects with a minimal element surface, portals to layers, controlled inputs (caret preserved) | 4 | DOM-style events on the host |
| 6 | M | **Layer 2 tag set**: HTML intrinsic tags to host types with web defaults (`useWebDefaults`), inline folding of `span/a/b/em/code` into text runs, `style` camelCase CSS translator, form elements (`input type`, `select`, `label htmlFor`, `button type=submit`), lists, headings, `img`, semantic roles reuse (`docs/ui.md:482`) | 1, 5 | `div`/`span` etc. render |
| 7 | M | Build-time CSS translator (`.css` and CSS modules): classes, descendant, `:hover/:focus/:disabled`, media queries, custom properties, units; diagnostics with fix for everything else (section 8) | 6 | stylesheets work for the supported subset |
| 8 | M | Unsupported reporting: lint pass + `zinc explain` entries + `ZnUnsupported` runtime errors for DOM globals; docs page "react-dom on Zinc: what runs" | 6, 7 | clear errors |
| 9 | M | Conformance harness: dual-run each test on real react-dom (Chrome via `tools/cdp.py`) and on the Zinc host, diff accessibility tree and text; library matrix of section 9; the three ported demos | 6 | published compatibility table |
| 10 | L | React Native components on the real reconciler (move `lib/std/react-native.tsx` host components to the reconciler host), keep `zinc:ui/react` as the typed/AOT and ESP32 path; Fast Refresh on the reconciler (`react-refresh`), Concurrent features (`startTransition`, Suspense with `use()`) behind flags; upgrade policy for the pinned React minor | 4, 5, 9 | one React for RN-like and DOM-like code |

Risks to carry: (1) the capitalised-tag rule is the owner's binding decision, so item 1 must be settled first; (2) QuickJS-ng speed on a JS-heavy reconciler is unmeasured (item 3 decides the cutoff between "desktop/Pi" and "typed engine only"); (3) the reconciler API breaks between minors, so pin and test on upgrade; (4) licences: React, react-dom, react-reconciler, scheduler are MIT (registry above); Preact MIT `[general]`; litehtml BSD-3 `[general]`; Blitz MIT/Apache `[general]`.
