## 6. WinterTC compliance

**What a claim needs** (ECMA-429 §Conformance): every interface and global of section 1 exposed on `globalThis` with
the behaviour of its W3C / WHATWG definition, conformance to ECMA-262, the global error / `unhandledrejection` /
`rejectionhandled` events (on an `EventTarget` global or an equivalent mechanism), a `navigator.userAgent` token, and
written documentation of every deviation with its impact.

**Where Zinc stands.** Zinc cannot claim WinterTC conformance, and running WPT verbatim is not how it could get there:

- **Programs are typed ahead of time.** WPT (and test262) files are dynamic JavaScript: untyped callbacks, mixed-type
  arrays, `instanceof` on constructors passed as values, property enumeration. Zinc's strict subset rejects nearly all
  of them at compile time (the R column), whatever the API behind them does. A WinterTC profile for Zinc would be
  measured with *typed ports* of the WPT files, one per API, kept next to these runs.
- **Web APIs are modules, not globals.** `globalThis` is refused by design (Z1015) and there is no `self`; the Web
  APIs being written for Zinc (`zinc:web`: TextEncoder / TextDecoder, atob / btoa, URL / URLSearchParams, Event /
  EventTarget / CustomEvent, AbortController / AbortSignal, crypto) are imports. A conformance claim needs them as
  ambient globals (a `lib/web.d.ts` plus auto-import in the compiler).
- **Typed arrays and `ArrayBuffer` are missing** (Zinc uses `u8[]`). Almost every binary API depends on them:
  TextEncoder, `crypto.getRandomValues`, Blob / File, streams chunks, fetch bodies, compression, WebAssembly.
- **No reflection.** WebIDL behaviour (property descriptors, `length` / `name` of methods, prototype chains,
  `Symbol.toStringTag`) is checked by most WPT files and by test262's `propertyHelper.js`.

**Gaps, by effort** (S: days, M: 1-3 weeks, L: a quarter or more, one engineer):

| Gap | APIs it unlocks | Effort |
| --- | --- | --- |
| Web APIs as ambient globals (`lib/web.d.ts`, compiler auto-import) and `self` | everything in `zinc:web` | S |
| Typed ports of the WPT files for each API Zinc implements, run on sim and native | a measured WinterTC profile | M |
| `Uint8Array` / `ArrayBuffer` / `DataView` backed by the runtime's byte arrays | TextEncoder, crypto, Blob, streams, fetch bodies | M |
| `DOMException` with its legacy codes; `ErrorEvent`, `PromiseRejectionEvent`, global error events | HTML error reporting, `reportError` | S |
| `Headers` / `Request` / `Response` with WHATWG shapes (today `zinc:net` has its own) and `fetch` as a global | Fetch | M |
| `structuredClone` for plain data (objects, arrays, Map / Set, Date) | HTML | S |
| `Blob` / `File` / `FormData` over byte arrays | File API, XHR FormData | M |
| WHATWG Streams (readable, writable, transform, byte streams, queuing strategies) | Streams, TextEncoderStream, CompressionStream, fetch bodies | L |
| `CompressionStream` / `DecompressionStream` (deflate / gzip; brotli optional) | Compression | M (after streams) |
| `MessageChannel` / `MessagePort` / `MessageEvent` on the event loop | HTML messaging | M |
| `URLPattern` (needs a regex engine, refused by design today: Z1008) | URL Pattern | L |
| `crypto.subtle` beyond SHA digests (HMAC, AES-GCM, ECDSA / Ed25519...) | WebCrypto | L |
| `WebAssembly` (an interpreter or AOT of wasm modules) | Wasm JS API | L, likely out of scope |

## 7. Fixes made with this harness

The first run of this harness found these; each has a regression program in tests/conformance (sim and native print
the same bytes, checked against Node too). Together they move the test262 sample from 16.7% to 20.5% on the sim and
from 14.4% to 19.0% natively, and cut the sim / native divergences from 51 tests to 35.

| Fix | Before | Program |
| --- | --- | --- |
| Generic static methods infer their type arguments; a type parameter bound to two number kinds is `number` | C++ build failure (`Check.same(xs.length, 2.5)`) | generic_static.ts |
| Array literals inside unannotated object literals (fixed on main at the same time; regression program added) | compiler crash (stack overflow in `Sema.contextual`) | literal_member_arrays.ts |
| The sim runs the native backend's checks | programs refused natively (Z9042, Z1013, Z9001) ran on the sim | (compat divergence table) |
| `-0` literals keep their sign natively | `1 / -0` was `Infinity` | string_number_edges.ts |
| `toFixed`: exact ties round up, `abs(x) >= 1e21` / NaN / Infinity print like ToString, `(-0).toFixed()`, digits outside 0-100 | `(2.5).toFixed(0)` "2", `(1e21).toFixed(2)` 22 digits, "nan" | string_number_edges.ts |
| `parseInt` reads `0x` without a radix, radix outside 2-36 is NaN; `parseFloat` is decimal only | `parseInt('0x1F')` 0, `parseFloat('0x10')` 16, `parseFloat('inf')` Infinity | string_number_edges.ts, conversions.ts |
| `trim` / `trimStart` / `trimEnd` remove JS white space (U+00A0, U+FEFF, U+2000-U+200A, U+2028, U+3000...) | ASCII only natively | string_number_edges.ts |
| `String(x)`, `Number(x)`, `Boolean(x)`; `Number.MAX_VALUE`, `MIN_VALUE`, `NaN`, `POSITIVE_INFINITY`, `NEGATIVE_INFINITY`, `MIN_SAFE_INTEGER`, `isSafeInteger`, `parseFloat`, `parseInt` | Z9019 / TS2339 | conversions.ts |
| `charAt`, `concat`, `trimStart`, `trimEnd`, the position argument of `includes` / `startsWith` / `endsWith` | TS2339 / TS2554 | string_number_edges.ts |
| `replace` / `replaceAll` substitutions (`$$ $& $\` $'`), `replaceAll` with an empty pattern | literal `$&`, `''.replaceAll('', 'x')` "" | conversions.ts |
| `undefined` for an optional library parameter means absent | `'abc'.padEnd(5, undefined)` "abc", `s.slice(1, undefined)` "" | conversions.ts |
| Arrays: `indexOf` / `includes` from an index, `lastIndexOf`, `findLast`, `findLastIndex`, `reduceRight`, `fill(v, start, end)`; `includes` is SameValueZero | TS errors; `[NaN].includes(NaN)` false natively | array_search.ts |
| `Math.min` / `Math.max` take any number of values | TS2554 | string_number_edges.ts |
| `JSON.parse` of invalid text throws a `SyntaxError` | a plain `Error` (sim and native) | conversions.ts |
| Unary `+` / `-` on a string or a boolean is ToNumber | `+'0x1F'` stayed a string natively (C++ build failure) | conversions.ts |
| An unannotated `const a = []` whose elements nothing types is Z9001 on every target | ran on the sim, `Array<void>` C++ build failure natively (5 test262 exponentiation tests move from a sim-only pass to a rejection) | (compat) |

## 8. Larger gaps found (ECMAScript)

Ordered by the number of selected tests they cost (see the clusters above). Effort as in section 6.

| Gap | Where it shows | Effort |
| --- | --- | --- |
| No reflection: `X.prototype`, property descriptors, `Function.prototype.call` / `length` / `name`, `Object.getPrototypeOf` | test262 `propertyHelper.js` (U), `String.prototype.x.call(...)` (TS2339 on `prototype`) | design (no) |
| No `Object` global: `Object.keys` / `entries` / `assign` / `freeze` / `is` / `defineProperty` | ~140 test262 files (TS2693) | M for the non-reflective part (keys, values, entries, assign, is) |
| `eval`, `with`, `arguments`, sloppy mode, `new String()` wrappers | TS2304 `eval`, U sloppy tests, TS2351 | design (no) |
| Promise beyond `then(onFulfilled)`: `catch`, `finally`, `then(_, onRejected)`, `race`, `any`, `allSettled` | built-ins/Promise 0% | M (sim and native event loops) |
| Library errors are catchable on the sim but panic natively (`'x'.repeat(-1)`, `toFixed(101)`, invalid array length) | sim / native divergences | M (throw a RangeError / TypeError through the status-return path, ADR 0006) |
| Accepted programs whose C++ does not build: `void` results stored in variables or fields, `this` at top level, `<` on objects, unary `-` on a string, `JSON.stringify` of a function | "C++ build failed" clusters | S-M (refuse them with a Z code, or give them their JS meaning) |
| UTF-8 strings cannot hold lone surrogates | `'abc'.padEnd(6, '💩')`, `JSON.stringify('\uD834')` | L (design: WTF-8 storage) |
| `string \| null` stores null like `''`: `JSON.stringify(['x', null])` prints `""` natively | JSON | M (a null tag for strings) |
| Math: `asin`, `acos`, `atan`, `sinh`..., `cbrt`, `log2`, `log10`, `expm1`, `log1p`, `sumPrecise` | built-ins/Math | M (an fdlibm port, so sim and native stay bit-identical) |
| `Number.prototype.toString(radix)`, `toPrecision`, `toExponential` | built-ins/Number | S-M |
| `String.fromCodePoint`, `codePointAt`, `normalize`, `localeCompare`, `String.raw`, `split(sep, limit)` | built-ins/String | S-M each |
| Arrays: `Array.from` / `of`, `keys` / `values` / `entries`, `flat` / `flatMap`, `toSorted` / `toReversed` / `with`, `copyWithin`, holes | built-ins/Array | M |
| Unicode case mapping outside Latin / Greek / Cyrillic, final sigma, `İ` | `toLowerCase` special casing | S-M (tables) |
| `typeof` narrowing on a type parameter is refused natively (Z1013) | generic helpers | S-M |
| Labeled statements (Z9011), rest elements in destructuring (Z9016), destructured parameters of async functions (Z9007) | language/statements | S each |
| Node API: no `node:*` modules (fs, path, os, process, buffer, events, timers, util, crypto) | section 3 | L (a `node:` layer over `zinc:fs` / `zinc:sys` / `zinc:os` / `zinc:events` / `zinc:web`) |

**The Web API branch.** `zinc compat --zinc <checkout>` measured a snapshot of the parity branch (`zinc:web`, commit
e0f0e8c): 2 of the 222 WPT files pass on the sim (`url-tojson`, `urlsearchparams-stringifier`); the others are
rejected for the reasons of section 6 (globals, typed arrays, dynamic test code), and two crashed the compiler with
the stack overflow fixed here.

## How to run

```sh
zinc compat                                  # all suites, 4 jobs; writes tests/compat/results/<date>.json and this page
zinc compat --suite wpt --engines zinc-sim,node
zinc compat --filter built-ins/String/prototype/trim   # a slice (recorded in tests/compat/cache/last.json only)
zinc compat --zinc path/to/other/checkout    # measure another Zinc tree (a branch), same tests
zinc compat --check                          # exit 1 if a Zinc pass recorded in tests/compat/baseline.json regressed
zinc compat --update-baseline                # after an intended change
zinc compat --report tests/compat/results/<date>.json   # regenerate this page
```

The harness is `tests/compat/run.mjs` (selection, engines, classification) and `report.mjs` (this page); the pins
and the WinterTC API list are in `tests/compat/manifest.json`, the Zinc harness shims in `tests/compat/shims`, the
Node API tests in `tests/compat/node`, and these notes in `tests/compat/notes.md`.
