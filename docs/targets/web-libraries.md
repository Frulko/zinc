# npm libraries on the web target: what was run

Each library below was installed by `zinc install` (npm 11), used the way its README starts, and run in headless Chrome on macOS arm64 twice: through `zinc dev --target web` (pre-bundled
by esbuild) and `zinc export --target web` (linked into the app), and the two gave the same answer. The test is `tests/t1/web_libs.sh` (fixture `tests/fixtures/web-libs`, versions pinned in its package.json); the
second group was run by hand in a scratch project with the same tool (`tools/web-libs-test <zinc> <dir>`). How packages are resolved, and the package manager commands: [web.md](web.md#npm-packages).
Only Chrome was used: Firefox and Safari were not tried.

Reading the columns: **web** = both `zinc dev --target web` and `zinc export --target web`; **native** = `zinc bundle` (the pinned esbuild, `--platform=neutral`) and `zinc run x.js --engine quickjs`, the
QuickJS-ng path (limits of that engine: [the bundler report](../reports/zinc-quickjs-bundler.md), section 1; the guide: [11-quickjs-bundle.md](../guide/11-quickjs-bundle.md)). "not run" means it was not tried.

## Run by the test (`web_libs.sh`)

| Library (version) | Used as | web | native | Note |
|---|---|---|---|---|
| zustand 5.0.15 | `createStore` from `zustand/vanilla` | works | works | The React hook (`zustand`, `create`) imports React: not applicable, `zinc:ui` is the UI layer. Use the vanilla store with `zinc:ui/solid` signals or a subscription. |
| jotai 3.0.1 | `atom`, `createStore` from `jotai/vanilla` | works | works | `jotai/react` needs React. |
| immer 11.1.21 | `produce` | works | works | |
| date-fns 4.4.0 | `format`, `addDays` | works | works with note | Native: `Date` getters return UTC (see below), so local-time formatting is off by the zone offset. |
| dayjs 1.11.23 | `dayjs().add().format()` | works | works with note | Same `Date` note on native. CommonJS/UMD package: bundled fine. |
| lodash-es 4.18.1 | named imports and `import * as _` | works | works | Tree-shaken in the export. |
| zod 4.6.7 | `z.object().parse`, `safeParse` | works | works | |
| @tanstack/query-core 5.104.3 | `QueryClient.fetchQuery` | works | works | The framework-agnostic core. `@tanstack/react-query` needs React; the Solid, Vue and Svelte adapters were not run. |
| ky 2.2.0 | `ky.get(url).json()` | works | not run | Uses the browser's `fetch`. |
| axios 1.20.0 | `axios.get(url)` | works | not run | The browser build is chosen by the `browser` conditions. |
| marked 18.1.1 | `marked.parse` | works | works | |
| Chart.js 4.5.1 | `new Chart(canvas, ...)` then `draw()` on a `document.createElement('canvas')` | works | not run | 38% of the pixels were drawn. The app may also give Chart.js the page's own canvas. |
| three 0.186.1 | `import * as THREE from 'three'` | does not, yet | not run | A bare `three` resolves to Zinc's own three plugin (`plugins/three`) when the plugins folder is present, and its `Render3D` has no browser backend: `plugin Render3D.target is not available in this browser`. Loading the npm package as a plain module on a canvas needs the WebGL side of the other task (the `zinc:three` backend); it is recorded, not integrated here. |

The export of these thirteen libraries together is 879 KB of JavaScript before compression (tree-shaken, minified).

## Run by hand (same tool, scratch project)

| Library | web | native | Note |
|---|---|---|---|
| eventemitter3 | works | works | CommonJS, default import. |
| rxjs 7 | works | works | |
| d3-array | works | works | |
| big.js, ms | works | works | |
| @preact/signals-core | works | works | |
| preact (`h`, `render`) | works | works | Imports and calls `h`; `render` needs a DOM and is the browser's, not Zinc's. |
| react (`createElement`) | works | works | The element factory only; `react-dom` was not tried and is not needed with `zinc:ui`. |
| uuid | works | does not | Native: `crypto is not defined`. Zinc adds the Web globals (`crypto`, `fetch`, `URL`...) only to the files of the project; a package that reads them gets `undefined` on QuickJS. |
| nanoid | works | does not | Native: the Node build is chosen (`Buffer is not defined`); the `browser` build would work. |
| papaparse | works | does not | Native: esbuild stops on the Node built-ins (`stream`, `util`) a package requires. The browser build has them mapped away. |
| qs | works | does not | Native: `util` (Node built-in) as above. On the web, `import * as qs from 'qs'` of a CommonJS package works in dev too (the pre-bundle exports esbuild's namespace). |

## What it says

- **Web target.** Everything that is plain JavaScript or runs on the browser's own APIs worked, in both modes, with the same result; the differences between dev and export are only `process.env.NODE_ENV` and
  size. The cases that do not work are libraries that need React or the DOM tree as their UI, Node built-ins, and the `three` plugin conflict above.
- **Native QuickJS path.** `zinc bundle` links packages (ES, CommonJS and UMD), and the program runs with `zinc run bundle.js --engine quickjs`; pure-JS libraries such as the state, schema, format and data ones above
  work the same way as in the browser. What QuickJS-ng lacks is the line between the two paths: `Intl`, `Temporal` and `WebAssembly` are missing (a package that calls them gets the Q0001 warning when it is bundled:
  `bundle.js: warning Q0001: Intl.NumberFormat is not in QuickJS-ng ... (in the bundled packages; a package may guard it)`, the lint scanning the linked text), the Web globals are not given to packages, Node built-ins
  stop the link, and the resolution is `module`, then `main` (no `browser` field). `zinc run x.ts --engine quickjs` without bundling loads ES-module packages only (a CommonJS package such as dayjs says `Could not find
  export 'default'`): bundle first.
- **Dates on the native path.** `Date.prototype.getHours`, `getDate` and the other local getters return the UTC fields on QuickJS in Zinc (`src/qjs/prelude.cpp`: "no time zones, like the typed engine"), while the constructor
  `new Date(y, m, d)` and `getTimezoneOffset()` still use the machine's zone. Libraries that format local time (date-fns, dayjs, moment) show the date off by the offset in any zone but UTC.
