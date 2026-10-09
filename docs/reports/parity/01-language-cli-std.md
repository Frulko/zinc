# Parity 01: language, diagnostics, CLI and standard library

Prototype (compiler/, runtime/, lib/) against Zinc Next (`next/build/zinc`, 0.0.1). Read-only audit, 2026-10-07. Every row below was run: the prototype with `node compiler/src/cli.ts run main.ts --target sim` (the oracle that applies the Zinc rules) and next with `zinc run file.ts` (interpreter/AOT default engine). Scratch programs: /tmp/parity (not in the repo).

## Summary

| Area | PASS | PARTIAL | MISSING |
|---|---|---|---|
| Language + std + web (rows the prototype accepts, table A) | 235 | 9 | 82 |
| Diagnostics (table C) | 28 | 15 | 9 |
| CLI commands and flags (table D) | 10 | 2 | 22 |
| Host modules and std packages (table E) | 4 | 6 | 11 |
| Conformance programs tests/conformance (table F) | 34 | 5 | 22 |
| **Total** | **311** | **37** | **146** |

Beyond the prototype (table B, features the brief asks about that the prototype also lacks): 16 PASS where next is ahead, 150 MISSING in both.

Headline: the core language, classes, generics, closures, async, generators (basic), collections, JSON and the example apps are at parity or ahead (union types, string and nullable handling, imports, `.js` entry). The gaps that matter are (1) the whole web platform layer (28 features), (2) a long tail of syntax and library surface, (3) the project and tooling CLI (22 of 34 commands and flags), (4) six host modules, (5) the diagnostics code scheme.

Findings that are bugs rather than gaps (next accepts the program, then misbehaves):
- `zinc check`/`run` segfault (exit 139) on `Promise.race`, `Promise.allSettled`, `Promise.any` (unknown static member of Promise). A diagnostic is expected.
- "internal error: invalid ZBC: argument holds ref Box<f64>, expected f64" for `[1, null, 2].join` on `(number|null)[]` and for a template of `number | undefined`.
- `typeof undefined` is "object"; `console.log(undefined)` prints `null`; `a?.b` prints `null`.
- `Date.now()`, `performance.now()` and `sys.clock()` are a virtual clock starting at 0 (a busy loop never advances it).
- `JSON.stringify` of a class with `toJSON` prints `{}`; `let u: u64 = 18446744073709551615` prints 9223372036854775807.
- Unhandled promise rejections are swallowed (prototype: `panic: Uncaught Error`).
- `[...'a😀'].length` is 3 (UTF-16 units), `'é'.toUpperCase()` is unchanged.
- Stack overflow is an uncatchable runtime error (prototype: catchable).

## Ranked root causes (prototype-parity features blocked)

Counts are table A rows plus tests/conformance programs. Several programs have two causes and appear twice.

| rank | root cause | description (with evidence) | features blocked | which |
|---|---|---|---|---|
| 1 | RC-WEB | No `zinc:web` module and no `webGlobals` auto-import: URL, URLSearchParams, TextEncoder/Decoder, atob/btoa, Event/EventTarget, AbortController/Signal, DOMException, Blob/File/FormData, Headers/Request/Response, fetch, crypto, structuredClone, navigator, reportError, encodeURIComponent are all "Cannot find name". `lib/std/web.ts` checked directly: 35 diagnostics from 3 causes (field-only `interface X extends Y` Z0114 x6, no narrowing of `this.field`/index results Z0107 x13, await in expression position) | 28 | prototype rows w_* (26) + conformance web, fetch_web |
| 2 | RC-SYNTAX | Parser gaps for syntax the prototype accepts: `as const`, `satisfies`, `static {}` blocks, `accessor` fields, `const enum` / `export const enum`, `declare const`, `#private` methods, `keyof`, type predicates `x is T`, async arrows, static accessors, `import.meta` | 13 | 11 rows + scene3d + sqlite |
| 3 | RC-STDGAPS | Library surface absent: Math.sign/hypot/imul-clz32-fround, isNaN, Array.at, String `s[i]`, Set spread, console.count/assert/table/time*, Promise.finally, `toJSON` (silently prints `{}`) | 13 | 13 rows |
| 4 | RC-AWAITPOS | `await`/`yield` only as statement or initializer (Z0005 "in this statement"): call arguments, binary operands, loop conditions, `const x = yield v`. Prototype supports these (ADR 0007 minus loop conditions) | 7 | 4 rows + conformance web, fetch_web, os_info |
| 5 | RC-MODS | Host modules not implemented: zinc:osc, mqtt, telemetry, gpio, events, platform (+ net.serve) | 7 | 5 rows + modules, modules_esp32 |
| 6 | RC-SELFREF | Name resolution: a `const` used inside a closure that is declared before/inside its own initializer is "Cannot find name" (named function expression binding, `const f = () => f()`, `id = setInterval(() => clearInterval(id))`, `steps` used by a function defined above it) | 5 | 2 rows + fs_ext, sys_process, focus_keys |
| 7 | RC-NONNULL | Non-null assertion `x!` (Z0005) | 5 | g_map_of_arr + hardening, ffi, script_async, script_basic |
| 8 | RC-DEFAULTS | Defaults: `function f(a, b = 2)` (unannotated default parameter, Z0109), type-parameter defaults (`reject<T = never>` so `Promise.reject(new Error())` fails with "class Promise used as a value"), `Arena.frame()` optional arg, default parameter reading an earlier parameter | 5 | 5 rows |
| 9 | RC-UNDEF | `undefined` is folded into `null`: `typeof undefined` is "object", `console.log(undefined)` and `a?.b` print null, `String(null)` is Z0005 | 4 | 4 rows (+ X-ICE: nullable number in a template or join hits "invalid ZBC" internal error) |
| 10 | RC-GENAPI | Generators: manual `it.next().value` (next() is typed boolean), `yield*`, generator methods `*items()`, spread/Array.from of a generator | 4 | 4 rows |
| 11 | RC-CLOCK | Virtual clock: `Date.now()`, `performance.now()`, `zinc:sys.clock()` start at 0 and move only when the event loop jumps to a timer; a busy loop never advances them (modules.cpp "Deterministic time"); a real Date breaks; plus clock_frames dt | 3 | 2 rows + clock_frames |
| 12 | RC-PKG | npm package imports (three, inferno, lodash, @pocketjs/framework): Z0005 | 3 | conformance three, inferno, pocket_hero |
| 13 | RC-REGEXLIT | Regex literals are a lexer error; plugin sims (socket, wasm, fetch) use them | 3 | conformance fetch, socket, wasm (+5 beyond-prototype rows) |
| 14 | RC-FINALLY | `try/finally` around await or yield (Z0005) | 2 | 2 rows |
| 15 | RC-IFACE | `interface` with only fields is a structural type, not an interface: `implements P` (Z0114) and `interface B extends A` (Z0114) fail; same cause blocks 6 lines of web.ts | 2 | 2 rows (+web.ts) |
| 16 | RC-CBTYPING | Callback typing: `new Promise<number>((res, rej) => ...)` (Z0109 on rej), `forEach(() => { throw ... })` (body typed never) | 2 | 2 rows |
| 17 | RC-RUNTIME | Stack overflow is an uncatchable runtime error (prototype: catchable), `f() === undefined` for a void call prints nothing; unhandled promise rejection is silent (prototype panics "Uncaught Error") | 2 | 2 rows (+ g_unhandled_rejection) |
| 18 | RC-DIAG | No Z1xxx forbidden-construct diagnostics (`var` accepted; dynamic import is a parse error), no `check --json`, 9 diagnostics MISSING, 15 PARTIAL (see table) | 2 | 2 rows + 24 diagnostic rows |
| 19 | RC-NARROW | No flow narrowing of member/index expressions (`if (this.cb) this.cb()` Z0105, `null \| Listener[] must be narrowed`) | 1 | 1 row (+13 errors in web.ts) |
| 20 | RC-EXHAUST | Exhaustive `switch` over an enum is not seen as returning on all paths (Z0110) | 1 | 1 row |
| 21 | RC-UNICODE | String iteration by UTF-16 unit instead of code point (`[...'a😀']` is 3), case mapping is ASCII only (`'é'.toUpperCase()`) | 1 | 1 row (+X-STRING-EXT) |
| 22 | RC-DESTR | Default values in destructuring patterns (Z0005) | 1 | 1 row |
| 23 | RC-FIELDINFER | Field initialised from another const without annotation: "Cannot infer a type: field" (canvas2d) | 1 | canvas2d |

Beyond-prototype groups (table B), not counted above:

| group (not in the prototype either; requested in the audit brief) | n | test ids |
|---|---|---|
| X-COERCION-MISC | 18 | f_nested_print g_loose_eq g_multiline_tpl g_string_number_coerce g_unary_plus_bool g_void0 l_args l_bool_ops l_equality l_eval l_globalthis l_json_import l_module_import l_nonnull l_throw_nonerror l_u64 l_var_hoist l_with |
| X-ARRAY-EXT | 15 | a_copyWithin a_entries a_flat a_flatMap a_from a_from_len a_keys a_new_len a_of a_sort_nocmp a_splice_ins a_toReversed a_toSorted a_tostring a_with |
| X-DATE-INTL | 14 | d_ctor_parts d_ctor_str d_iso d_json d_locale d_parse d_setters d_str d_tz d_utc intl_dt intl_num locale_num perf |
| X-STRING-EXT | 13 | f_toUpper_unicode s_codePointAt s_fromCodePoint s_isFinite s_isWellFormed s_localeCompare s_normalize s_number_tostring_radix s_split_limit s_substr s_toExponential s_toLocaleUpper s_toPrecision |
| X-TYPES | 11 | g_extends_constraint g_generic_default g_partial g_record l_class_expr l_decorators l_intersect l_namespace l_overload l_stringenum l_weak |
| X-WEB-EXT | 9 | w_assets_mod w_compress w_crypto_rand w_native_mod w_streams w_subtle w_urlpattern w_wasm w_wasm_mod |
| X-ASYNC-EXT | 8 | g_async_using g_unhandled_rejection l_asyncgen l_generator2 l_promiseany l_promiseother l_toplevel_await w_setimmediate |
| X-COLLECTIONS-EXT | 7 | l_mapiter m_ctor_entries m_entries st_ctor wm_basic wr ws_basic |
| X-ICE | 6 | a_oob_panic f_array_join_null f_str_undefined_tpl l_typeof l_undefprint panic_oob_msg |
| X-CONSOLE-ERR | 6 | con_dir con_group err_agg err_cause err_props err_tostring |
| X-SYMBOL-ITER | 5 | g_array_from_gen g_symbol_iterator_obj l_iter_class l_iterator_proto l_symbol |
| X-OBJECT | 5 | g_neg_zero l_objectassign l_objectstatic l_objlit l_objlit_method |
| X-REGEX | 5 | l_regex l_regex_new l_regex_replace s_match s_search |
| X-INDEXSIG | 4 | g_in_array_obj l_comma_in l_indexsig l_optparam_idx |
| X-LABELED | 3 | g_label_continue l_label l_labeled2 |
| X-JSON-EXT | 3 | j_indent j_reviver j_stringify |
| X-TYPEDARRAY | 3 | l_dataview l_typedarr l_typedarr2 |
| X-REST-SPREAD | 3 | l_destruct l_restparams l_spread |
| X-TAGGED | 3 | l_tagged l_tagged2 s_raw |
| X-MATH-EXT | 3 | mt_const mt_hyp mt_more |
| X-FORIN | 2 | g_json_dyn_iterate l_forin |
| X-BIGINT | 2 | l_bigint l_bigint2 |
| X-STDMOD-BROKEN | 2 | w_assert_mod w_signals_mod |

## Proposed backlog

| # | task | description | size | proven library |
|---|---|---|---|---|
| 1 | Web platform globals bring-up (zinc:web) | Make lib/std/web.ts + fetch.ts compile in next (needs the three fixes below), add the `webGlobals` auto-import to modules.cpp (global names resolve to `zinc:web`), wire fetch to zinc:net, replace `data:` handling. Port the WPT-derived tests (tests/conformance/web.ts, fetch_web.ts). | L | Reuse the existing Zinc source (URL 896/896 WPT). Optional accelerators later: ada-url (URL), simdutf (TextEncoder/Decoder), libcurl (already), mbedTLS for crypto.subtle beyond digest, miniz for CompressionStream |
| 2 | Interfaces of fields: implements and extends | Treat a data-only `interface` as an interface for `implements`/`extends` (checker, Z0114). Unblocks 6 lines of web.ts and 2 rows. | S |  |
| 3 | Flow narrowing of member and index expressions | Narrow `this.f`, `a.b`, `m.get(k)` after `if`/`!==`/`&&`. Z0105/Z0107 in web.ts (13) and g_callback_member. | M |  |
| 4 | await/yield in expression position | Hoist await/yield out of arguments, operands, conditions and initializers into temporaries in desugar.cpp (evaluation order preserved). Unblocks web, fetch_web, os_info and 4 rows. | M |  |
| 5 | try/finally across await/yield | Lower finally with a state-machine continuation in the async/generator transform. | M |  |
| 6 | Name resolution for closures declared before their binding | Bind named function expressions; allow a closure to reference a `const` of the enclosing scope declared later or in its own initializer (TDZ at run time). Unblocks fs_ext, sys_process, focus_keys and 2 rows. | S |  |
| 7 | Parser pack: as const, satisfies, static blocks, accessor, const enum, declare, #private methods, keyof, `x is T`, async arrows, static accessors, import.meta | Each a few lines in parser.cpp + checker. Land as one task with a fixture per construct in tests/golden. | M |  |
| 8 | Non-null assertion `!` | Parse `x!` as a checked unwrap (panic on null) in the checker. Unblocks 4 plugin programs. | S |  |
| 9 | Default parameters and type-parameter defaults | Infer an unannotated default (`b = 2` -> f64), allow `T = never`, optional `Arena.frame(bytes?)`, defaults that read earlier parameters. | S |  |
| 10 | Std surface pack | Math.sign/hypot/fround/clz32/imul/isNaN/isFinite, Array.at, String index, Set spread, console.count/assert/table/time/timeEnd/timeLog, Promise.finally, toJSON in JSON.stringify. Diff against lib/zinc.d.ts (it is the reference list). | S | libc libm for Math |
| 11 | undefined vs null | Give `undefined` its own tag in Dyn and optional fields so `typeof`, `console.log`, `?.` and templates print `undefined`; make `String(null)` legal. Fix the internal error ("invalid ZBC ... Box<f64>") for `(number\|null)[]` in join/templates. | M |  |
| 12 | Generators: next().value, yield*, methods, spread | Type `next()` as IteratorResult, add delegation and generator methods, let `[...gen]` and `Array.from(gen)` iterate. | M |  |
| 13 | Real clock | Date.now, performance.now, sys.clock follow the host clock by default; keep the virtual clock under ZINC_DETERMINISTIC and in goldens. | S |  |
| 14 | Date completeness | Constructor parts/ISO string, parse, UTC, setters, toISOString/toJSON/toString, getTimezoneOffset. | M | C++20 <chrono> or Howard Hinnant date for civil arithmetic; Intl: defer or ICU4C subset |
| 15 | Unicode strings | Iterate by code point, full case mapping, normalize, localeCompare, codePointAt/fromCodePoint. | M | utf8proc (MIT) |
| 16 | Host modules: osc, mqtt, telemetry, gpio, events, platform, net.serve | Implement as `__host_*` rows like zinc:fs; start with events (pure Zinc), platform (constants) and telemetry. | L (S for events and platform) | tinyosc (ISC), MQTT-C or paho.mqtt.c, libgpiod (the prototype already links it), cpp-httplib for net.serve |
| 17 | Regex literals and RegExp | Lexer + runtime for regex; String match/replace/split/search with RegExp. | L | QuickJS-ng libregexp (already vendored, MIT); alternatives PCRE2 or RE2 |
| 18 | Diagnostics parity | Add Z1xxx codes for var, regex, dynamic import, holey arrays, `in`, labeled statements with the prototype wording; `check --json` (LSP shape); single error per cause; honour `// @ts-ignore` or document the difference. | M | nlohmann/json (or the existing JSON writer) for --json |
| 19 | CLI: bare `zinc check\|build\|run [entry]`, zinc.json manifest, `help`, `init`, `doctor` | Read zinc.json (name, assets, requires, targets), discover src/main.ts, print real help, scaffold templates. | M | CLI11 (BSD) for option parsing |
| 20 | CLI: test, bench, capture, export, deploy, plugins, tsconfig, infer | Move the shell tiers behind `zinc test`; frames to PNG for capture (stb_image_write); export/deploy over the existing package tools. | L | stb_image_write; efsw for `dev` hot reload |
| 21 | CLI: dev (hot reload) and monitor | File watcher + reload of the interpreter image; telemetry view. | L | efsw (MIT) |
| 22 | Compat harness on next | Point tests/compat/run.mjs (WPT, test262, Node API, QuickJS tests) at `zinc run` and publish the numbers. | M | test262, WPT (already used) |
| 23 | Crash and ICE fixes | `zinc check` segfaults (exit 139) on an unknown static of Promise (`Promise.race`, `allSettled`, `any`); "internal error: invalid ZBC" on nullable numbers in templates; u64 literal above i64 max clamps to 9223372036854775807; unhandled rejection is silent. | S |  |
| 24 | Callback typing and exhaustiveness | Infer unused executor params, accept never-bodied callbacks, treat a full enum switch as total. | S |  |
| 25 | Beyond prototype, requested: BigInt, typed arrays/ArrayBuffer/DataView, labeled statements, tagged templates, rest/spread, for-in, Object statics, Symbol, Intl | Not in the prototype either. Cheapest route: BigInt via libbf, typed arrays natively, rest/spread/labels/tagged templates in desugar. Intl only if a target needs it. | L (each S-M) | libbf (QuickJS, MIT); no ICU unless needed |

## Table A: language, std library and web platform (prototype supports the feature)

Evidence column names the prototype source (lib/zinc.d.ts is the reference list of supported methods; docs/guide/02-language.md the language list; docs/guide/09-web-apis.md the web list). Snippets are the exact tests, single line. PASS = compiles and prints the same bytes as the prototype oracle.

| id | feature (test snippet) | prototype evidence | next | error or note |
|---|---|---|---|---|
| a_2d | `const g: number[][] = [[1, 2], [3, 4]]; console.log(g[1][0]);` | lib/zinc.d.ts Array | PASS |  |
| a_at | `console.log([1, 2, 3].at(-1));` | lib/zinc.d.ts Array | MISSING | error Z0106: Property does not exist: 'at' on 'f64[]' /  |
| a_concat | `console.log([1].concat([2, 3]).join());` | lib/zinc.d.ts Array | PASS |  |
| a_console_arr | `console.log([1, 2], {a: 1});` | lib/zinc.d.ts Array | PASS |  |
| a_fill | `console.log([0, 0].fill(7).join());` | lib/zinc.d.ts Array | PASS |  |
| a_filter | `console.log([1, 2, 3].filter(x => x % 2 == 1).join());` | lib/zinc.d.ts Array | PASS |  |
| a_find | `console.log([1, 2, 3].find(x => x > 1));` | lib/zinc.d.ts Array | PASS |  |
| a_findIndex | `console.log([1, 2, 3].findIndex(x => x > 1));` | lib/zinc.d.ts Array | PASS |  |
| a_findLast | `console.log([1, 2, 3].findLast(x => x < 3));` | lib/zinc.d.ts Array | PASS |  |
| a_findLastIndex | `console.log([1, 2, 3].findLastIndex(x => x < 3));` | lib/zinc.d.ts Array | PASS |  |
| a_forEach | `[1, 2].forEach((x, i) => console.log(x, i));` | lib/zinc.d.ts Array | PASS |  |
| a_includes | `console.log([1, 2].includes(2));` | lib/zinc.d.ts Array | PASS |  |
| a_indexOf | `console.log([1, 2, 3].indexOf(3));` | lib/zinc.d.ts Array | PASS |  |
| a_isArray | `console.log(Array.isArray([1]));` | lib/zinc.d.ts Array | PASS |  |
| a_join_default | `console.log([1, 2].join());` | lib/zinc.d.ts Array | PASS |  |
| a_lastIndexOf | `console.log([1, 2, 1].lastIndexOf(1));` | lib/zinc.d.ts Array | PASS |  |
| a_length_assign | `const a = [1, 2, 3]; a.length = 1; console.log(a.length);` | lib/zinc.d.ts Array | PASS |  |
| a_map | `console.log([1, 2].map(x => x * 2).join());` | lib/zinc.d.ts Array | PASS |  |
| a_pop | `const a = [1, 2]; console.log(a.pop(), a.length);` | lib/zinc.d.ts Array | PASS |  |
| a_push | `const a = [1]; console.log(a.push(2), a.length);` | lib/zinc.d.ts Array | PASS |  |
| a_reduce | `console.log([1, 2, 3].reduce((a, b) => a + b, 0));` | lib/zinc.d.ts Array | PASS |  |
| a_reduceRight | `console.log([1, 2, 3].reduceRight((a, b) => a + '' + b, ''));` | lib/zinc.d.ts Array | PASS |  |
| a_reverse | `console.log([1, 2, 3].reverse().join());` | lib/zinc.d.ts Array | PASS |  |
| a_shift | `const a = [1, 2]; console.log(a.shift(), a[0]);` | lib/zinc.d.ts Array | PASS |  |
| a_slice | `console.log([1, 2, 3].slice(1).join());` | lib/zinc.d.ts Array | PASS |  |
| a_some | `console.log([1, 2].some(x => x > 1), [1, 2].every(x => x > 1));` | lib/zinc.d.ts Array | PASS |  |
| a_sort | `console.log([3, 1, 2].sort((a, b) => a - b).join());` | lib/zinc.d.ts Array | PASS |  |
| a_splice | `const a = [1, 2, 3, 4]; const r = a.splice(1, 2); console.log(r.join(), a.join()` | lib/zinc.d.ts Array | PASS |  |
| a_unshift | `const a = [2]; a.unshift(1); console.log(a.join());` | lib/zinc.d.ts Array | PASS |  |
| con_assert | `console.assert(1 == 2, 'bad'); console.log('ok');` | lib/zinc.d.ts Console | MISSING | error Z0106: Property does not exist: 'assert' on 'console' /  |
| con_count | `console.count('x'); console.count('x');` | lib/zinc.d.ts Console | MISSING | error Z0106: Property does not exist: 'count' on 'console' / error Z0106: Property does not exist: 'count' on 'console' /  |
| con_fmt | `console.log('%d items', 3);` | lib/zinc.d.ts Console | PASS | same behaviour as the prototype |
| con_fmt2 | `console.log('a', 1, true, null, undefined, [1], {a: 'x'});` | lib/zinc.d.ts Console | PARTIAL | compiles, wrong output: a 1 true null null [ 1 ] { a: 'x' } /  (prototype: a 1 true null undefined [ 1 ] { a: 'x' } / ) |
| con_levels | `console.error('e'); console.warn('w'); console.info('i'); console.debug('d');` | lib/zinc.d.ts Console | PASS |  |
| con_table | `console.table([{a: 1}]);` | lib/zinc.d.ts Console | MISSING | error Z0106: Property does not exist: 'table' on 'console' /  |
| con_time | `console.time('t'); console.timeEnd('t');` | lib/zinc.d.ts Console | MISSING | error Z0106: Property does not exist: 'time' on 'console' / error Z0106: Property does not exist: 'timeEnd' on 'console' /  |
| d_now | `console.log(Date.now() > 1.6e12);` | lib/zinc.d.ts Date | PARTIAL | compiles, wrong output: false /  (prototype: true / ) |
| err_range | `try { throw new RangeError('t'); } catch (e) { console.log((e as Error).name); }` | lib/zinc.d.ts Error | PASS |  |
| err_types | `try { throw new TypeError('t'); } catch (e) { console.log((e as Error).name); }` | lib/zinc.d.ts Error | PASS |  |
| f_bitwise_neg | `console.log(-1 >>> 0, 1 << 33, ~~3.7, 5 \| 0.9);` | tests/conformance/string_number_edges.ts | PASS |  |
| f_bool_str | `console.log(true + '', String(null), String(undefined), '${null}');` | tests/conformance/string_number_edges.ts | MISSING | error Z0005: Syntax not supported yet: String() of 'null' / error Z0005: Syntax not supported yet: String() of 'null' /  |
| f_class_print | `class A { x = 1; } console.log(new A());` | tests/conformance/string_number_edges.ts | PASS |  |
| f_date_now_virtual | `const a = Date.now(); const b = Date.now(); console.log(b >= a);` | tests/conformance/string_number_edges.ts | PASS |  |
| f_div_mod | `console.log(5 % -3, -5 % 3, 2 ** -1, 7 / 0 > 0);` | tests/conformance/string_number_edges.ts | PASS |  |
| f_error_print | `console.log(new Error('e').message);` | tests/conformance/string_number_edges.ts | PASS |  |
| f_float_print | `console.log(1.0, 1.50, -2.5e-7, 123456789.123);` | tests/conformance/string_number_edges.ts | PASS |  |
| f_fn_print | `console.log(() => 1);` | tests/conformance/string_number_edges.ts | PASS |  |
| f_inc_float | `let a = 0.1; a += 0.2; console.log(a);` | tests/conformance/string_number_edges.ts | PASS |  |
| f_map_print | `const m = new Map<string, number>(); m.set('a', 1); console.log(m);` | tests/conformance/string_number_edges.ts | PASS |  |
| f_math_minmax_nan | `console.log(Math.min(1, NaN), Math.max(-0, 0));` | tests/conformance/string_number_edges.ts | PASS |  |
| f_math_round_neg | `console.log(Math.round(-2.5), Math.round(2.4999), Math.round(-0.4));` | tests/conformance/string_number_edges.ts | PASS | same behaviour as the prototype |
| f_null_print | `const x: string \| null = null; console.log(x);` | tests/conformance/string_number_edges.ts | PASS |  |
| f_num_str_edge | `console.log(String(0.000001234), String(1e-7), String(123456789012345678));` | tests/conformance/string_number_edges.ts | PASS |  |
| f_obj_print | `interface P { a: number; b: string } const p: P = {a: 1, b: 'x'}; console.log(p)` | tests/conformance/string_number_edges.ts | PASS |  |
| f_parse_edge | `console.log(parseInt('  42abc'), parseInt('0x1f', 16), parseFloat('.5e1'), Numbe` | tests/conformance/string_number_edges.ts | PASS |  |
| f_perf_now_mono | `const a = performance.now(); let s = 0; for (let i = 0; i < 100000; i++) s += i;` | tests/conformance/string_number_edges.ts | PASS |  |
| f_replace_special | `console.log('a.b'.replace('.', '$&$&'));` | tests/conformance/string_number_edges.ts | PASS |  |
| f_set_print | `const s = new Set<number>(); s.add(1); console.log(s);` | tests/conformance/string_number_edges.ts | PASS |  |
| f_settimeout_real | `import { clock } from 'zinc:sys'; const a = clock(); setTimeout(() => console.lo` | tests/conformance/string_number_edges.ts | PASS |  |
| f_slice_emoji | `console.log('a😀b'.slice(1, 3) === '😀');` | tests/conformance/string_number_edges.ts | PASS |  |
| f_sort_strings | `console.log(['b', 'a', 'C'].sort((x, y) => x < y ? -1 : x > y ? 1 : 0).join());` | tests/conformance/string_number_edges.ts | PASS |  |
| f_split_multi | `console.log('a--b--c'.split('--').join('\|'));` | tests/conformance/string_number_edges.ts | PASS |  |
| f_str_len_emoji | `console.log('a😀b'.length, 'a😀b'.charCodeAt(1), 'a😀b'.indexOf('b'));` | tests/conformance/string_number_edges.ts | PASS |  |
| f_str_surrogate_iter | `console.log([...'a😀'].length);` | tests/conformance/string_number_edges.ts | PARTIAL | compiles, wrong output: 3 /  (prototype: 2 / ) |
| f_sys_clock | `import { clock } from 'zinc:sys'; const a = clock(); console.log(a > 1e12);` | tests/conformance/string_number_edges.ts | PASS | same behaviour as the prototype |
| f_sys_clock_adv | `import { clock } from 'zinc:sys'; const a = clock(); let s = 0; for (let i = 0; ` | tests/conformance/string_number_edges.ts | PARTIAL | compiles, wrong output: false /  (prototype: true / ) |
| f_toFixed_round | `console.log((1.005).toFixed(2), (2.5).toFixed(0), (1e21).toFixed(2), (-1.5).toFi` | tests/conformance/string_number_edges.ts | PASS |  |
| f_undef_print | `const x: string \| undefined = undefined; console.log(x);` | tests/conformance/string_number_edges.ts | PARTIAL | compiles, wrong output: null /  (prototype: undefined / ) |
| g_abstract_prop | `abstract class A { abstract get v(): number; } class B extends A { get v(): numb` | docs/guide/02-language.md | PASS |  |
| g_ambient | `declare const X: number; console.log(1);` | docs/guide/02-language.md | MISSING | error Z0002: Expected a specific token: ';' /  |
| g_arr_index_assign | `const a = [1, 2]; a[1] = 5; console.log(a[1]);` | docs/guide/02-language.md | PASS |  |
| g_arr_of_obj | `interface P { x: number } const a: P[] = [{x: 1}, {x: 2}]; console.log(a.map(p =` | docs/guide/02-language.md | PASS |  |
| g_array_destruct_fn | `function f(): [number, string] { return [1, 'a']; } const [n, s] = f(); console.` | docs/guide/02-language.md | PASS |  |
| g_array_holes_len | `const a: number[] = []; a[2] = 1; console.log(a.length);` | docs/guide/02-language.md | PASS | same behaviour as the prototype |
| g_async_return_value | `async function f(): Promise<number> { return 7; } async function g(): Promise<vo` | docs/guide/02-language.md | PASS |  |
| g_await_expr_binary | `async function f(): Promise<number> { return 1; } async function g(): Promise<vo` | docs/guide/02-language.md | MISSING | error Z0005: Syntax not supported yet: 'await' or 'yield' in this statement /  |
| g_await_in_loop | `async function f(): Promise<void> { for (let i = 0; i < 2; i++) { await Promise.` | docs/guide/02-language.md | PASS |  |
| g_await_in_try | `async function f(): Promise<void> { try { await Promise.reject(new Error('x')); ` | docs/guide/02-language.md | MISSING | error Z0112: Not allowed in this context: class 'Promise' used as a value / error Z0112: Not allowed in this context: class  |
| g_callback_member | `class A { cb: (() => void) \| null = null; run(): void { if (this.cb) this.cb(); ` | docs/guide/02-language.md | MISSING | error Z0105: Expression is not callable: 'null \| () => void' /  |
| g_closure_counter_obj | `function mk(): {inc: () => number} { let c = 0; return {inc: () => ++c}; } const` | docs/guide/02-language.md | PASS |  |
| g_comma_for | `for (let i = 0, j = 10; i < 2; i++, j--) console.log(i, j);` | docs/guide/02-language.md | PASS |  |
| g_default_param_expr | `function f(a: number, b: number = a * 2): number { return b; } console.log(f(2))` | docs/guide/02-language.md | MISSING | error Z0005: Syntax not supported yet: a default value that reads another parameter /  |
| g_enum_compare | `enum C { A, B } const c: C = C.B; console.log(c === C.B, c > C.A);` | docs/guide/02-language.md | PASS |  |
| g_enum_explicit | `enum C { A = 5, B } console.log(C.B);` | docs/guide/02-language.md | PASS |  |
| g_enum_in_switch | `enum C { A, B } function f(c: C): string { switch (c) { case C.A: return 'a'; ca` | docs/guide/02-language.md | MISSING | error Z0110: Not all code paths return a value: 'f' /  |
| g_error_subclass_instanceof | `class MyE extends Error {} try { throw new MyE('x'); } catch (e) { console.log(e` | docs/guide/02-language.md | PASS |  |
| g_escape | `console.log('\u{1F600}'.length, 'a\tb', '\x41');` | docs/guide/02-language.md | PASS |  |
| g_exports_class | `export class A { x = 1; } console.log(new A().x);` | docs/guide/02-language.md | PASS |  |
| g_f32_prec | `const a: f32 = 16777216; console.log(a + 1);` | docs/guide/02-language.md | PASS | same behaviour as the prototype |
| g_finally_return | `function f(): number { try { return 1; } finally { console.log('f'); } } console` | docs/guide/02-language.md | PASS |  |
| g_fn_types | `type F = (a: number) => number; const f: F = a => a + 1; console.log(f(1));` | docs/guide/02-language.md | PASS |  |
| g_for_of_str_idx | `for (const c of 'ab') console.log(c);` | docs/guide/02-language.md | PASS |  |
| g_gen_early_return | `function* g(): Generator<number> { try { yield 1; yield 2; } finally { console.l` | docs/guide/02-language.md | MISSING | error Z0005: Syntax not supported yet: 'try' with 'finally' around await or yield /  |
| g_gen_infinite_take | `function* nat(): Generator<number> { let i = 0; while (true) yield i++; } let s ` | docs/guide/02-language.md | PASS |  |
| g_gen_next | `function* g(): Generator<number> { const x = yield 1; } const it = g(); console.` | docs/guide/02-language.md | MISSING | error Z0005: Syntax not supported yet: 'await' or 'yield' in this statement /  |
| g_gen_spread | `function* g(): Generator<number> { yield 1; yield 2; } console.log([...g()].leng` | docs/guide/02-language.md | MISSING | error Z0106: Property does not exist: 'slice' on 'Generator<f64>' /  |
| g_generic_interface | `interface Box<T> { v: T } const b: Box<string> = {v: 'x'}; console.log(b.v);` | docs/guide/02-language.md | PASS |  |
| g_getter_setter_inherit | `class A { protected _v = 1; get v(): number { return this._v; } set v(n: number)` | docs/guide/02-language.md | PASS |  |
| g_getter_static | `class A { static get v(): number { return 1; } } console.log(A.v);` | docs/guide/02-language.md | MISSING | error Z0005: Syntax not supported yet: static accessors /  |
| g_hash_private_method | `class A { #f(): number { return 1; } g(): number { return this.#f(); } } console` | docs/guide/02-language.md | MISSING | error Z0001: Unexpected token: '#f' /  |
| g_i32_wrap | `let a: i32 = 2147483647; a = a + 1; console.log(a);` | docs/guide/02-language.md | PASS |  |
| g_i64 | `const a: i64 = 9007199254740993; console.log(a + 1);` | docs/guide/02-language.md | PASS | same behaviour as the prototype |
| g_import_type | `import type { Stat } from 'zinc:fs'; const s: Stat \| null = null; console.log(s ` | docs/guide/02-language.md | PASS |  |
| g_instanceof_inherit | `class A {} class B extends A {} console.log(new B() instanceof A);` | docs/guide/02-language.md | PASS |  |
| g_int_division | `const a: i32 = 7; const b: i32 = 2; console.log((a / b) \| 0, a % b);` | docs/guide/02-language.md | PASS |  |
| g_interface_extends | `interface A { a: number } interface B extends A { b: number } const x: B = {a: 1` | docs/guide/02-language.md | MISSING | error Z0114: Invalid class hierarchy or override: 'A' is not an interface / error Z0106: Property does not exist: |
| g_json_dyn_arr | `const d = JSON.parse('[1,2,3]'); console.log(d.length, d[2]);` | docs/guide/02-language.md | PASS |  |
| g_json_roundtrip | `interface P { a: number; b: string[] } const s = JSON.stringify({a: 1, b: ['x']}` | docs/guide/02-language.md | PASS |  |
| g_json_unicode | `console.log(JSON.stringify('é\u0001'));` | docs/guide/02-language.md | PASS |  |
| g_keyof | `interface P { a: number; b: string } const k: keyof P = 'a'; console.log(k);` | docs/guide/02-language.md | MISSING | error Z0002: Expected a specific token: ';' /  |
| g_loop_capture | `const fs: (() => number)[] = []; for (let i = 0; i < 3; i++) fs.push(() => i); c` | docs/guide/02-language.md | PASS |  |
| g_map_foreach_order | `const m = new Map<number, number>(); m.set(2, 1); m.set(1, 1); m.forEach((v, k) ` | docs/guide/02-language.md | PASS |  |
| g_map_nan_key | `const m = new Map<number, number>(); m.set(NaN, 1); console.log(m.get(NaN));` | docs/guide/02-language.md | PASS |  |
| g_map_of_arr | `const m = new Map<string, number[]>(); m.set('a', [1]); m.get('a')!.push(2); con` | docs/guide/02-language.md | MISSING | error Z0005: Syntax not supported yet: non-null assertions /  |
| g_nested_ternary | `console.log(1 > 2 ? 'a' : 2 > 1 ? 'b' : 'c');` | docs/guide/02-language.md | PASS |  |
| g_nested_try | `try { try { throw new Error('a'); } finally { console.log('f'); } } catch (e) { ` | docs/guide/02-language.md | PASS |  |
| g_number_to_string_float | `console.log(0.1 + 0.2, 1 / 3, 100, 1e100, 5e-324);` | docs/guide/02-language.md | PASS |  |
| g_numsep | `console.log(1_000, 0xff, 0b101, 0o17, 1e3, .5);` | docs/guide/02-language.md | PASS |  |
| g_obj_destruct_nested | `interface P { a: {b: number} } const {a: {b}} = {a: {b: 4}} as P; console.log(b)` | docs/guide/02-language.md | PASS |  |
| g_obj_getter | `class A { get v(): number { return 1; } } console.log(new A().v);` | docs/guide/02-language.md | PASS |  |
| g_ops_in_str | `console.log('a' + 1 + 2, 1 + 2 + 'a');` | docs/guide/02-language.md | PASS |  |
| g_optional_elem | `const a: number[] \| null = [1]; console.log(a?.[0]);` | docs/guide/02-language.md | PASS |  |
| g_optional_prop | `interface P { a?: number } const p: P = {}; console.log(p.a === undefined);` | docs/guide/02-language.md | PASS |  |
| g_override | `class A { f(): number { return 1; } } class B extends A { override f(): number {` | docs/guide/02-language.md | PASS |  |
| g_param_props | `class A { constructor(public a: number, private b: number = 2) {} s(): number { ` | docs/guide/02-language.md | PASS |  |
| g_private_method | `class A { private f(): number { return 1; } g(): number { return this.f(); } } c` | docs/guide/02-language.md | PASS |  |
| g_promise_all_order | `Promise.all([Promise.resolve(1), Promise.resolve(2)]).then(r => console.log(r.jo` | docs/guide/02-language.md | PASS |  |
| g_promise_chain | `Promise.resolve(1).then(v => v + 1).then(v => console.log(v));` | docs/guide/02-language.md | PASS |  |
| g_promise_finally | `Promise.resolve(1).finally(() => console.log('fin')).then(v => console.log(v));` | docs/guide/02-language.md | MISSING | error Z0106: Property does not exist: 'finally' on 'Promise<f64>' / error Z0106: Property does not exist: 'finally' on ' |
| g_recursion_deep | `function f(n: number): number { return n == 0 ? 0 : 1 + f(n - 1); } console.log(` | docs/guide/02-language.md | PASS |  |
| g_rethrow | `try { try { throw new Error('a'); } catch (e) { throw e; } } catch (e) { console` | docs/guide/02-language.md | PASS |  |
| g_set_obj | `const s = new Set<string>(); s.add('a'); s.add('a'); console.log(s.size);` | docs/guide/02-language.md | PASS |  |
| g_shorthand | `const a = 1; const o: {a: number} = {a}; console.log(o.a);` | docs/guide/02-language.md | PASS |  |
| g_sleep_pattern | `const sleep = (ms: number): Promise<void> => new Promise<void>(r => setTimeout((` | docs/guide/02-language.md | PASS |  |
| g_stack_overflow | `function f(n: number): number { return 1 + f(n + 1); } try { f(0); } catch (e) {` | docs/guide/02-language.md | PARTIAL | compiles, wrong output: runtime error: stack overflow /  (prototype: so / ) |
| g_static_inherit | `class A { static n = 1; } class B extends A {} console.log(B.n);` | docs/guide/02-language.md | PASS |  |
| g_string_compare_loop | `const a = ['b', 'a']; a.sort((x, y) => x < y ? -1 : 1); console.log(a.join());` | docs/guide/02-language.md | PASS |  |
| g_super_ctor | `class A { constructor(public x: number) {} } class B extends A { constructor() {` | docs/guide/02-language.md | PASS |  |
| g_switch_fall | `function f(n: number): string { let s = ''; switch (n) { case 1: s += 'a'; case ` | docs/guide/02-language.md | PASS |  |
| g_template_nested | `const a = 2; console.log('a${'b${a}'}c');` | docs/guide/02-language.md | PASS |  |
| g_this_in_cb | `class A { n = 3; f(): number { return [1].map(x => x + this.n)[0]; } } console.l` | docs/guide/02-language.md | PASS |  |
| g_throw_in_cb | `try { [1].forEach(() => { throw new Error('in'); }); } catch (e) { console.log((` | docs/guide/02-language.md | MISSING | error Z0103: Type is not assignable: a function of 1-2 parameter(s) for 'forEach' /  |
| g_timer_order | `setTimeout(() => console.log('b'), 10); setTimeout(() => console.log('a'), 0); P` | docs/guide/02-language.md | PASS |  |
| g_toString_class | `class A { toString(): string { return 'A!'; } } console.log('${new A()}');` | docs/guide/02-language.md | PASS |  |
| g_typeguard | `interface A { k: 'a'; x: number } function isA(v: A \| null): v is A { return v !` | docs/guide/02-language.md | MISSING | error Z0002: Expected a specific token: ';' /  |
| g_u32_shift | `const a: u32 = 1; console.log(a << 31);` | docs/guide/02-language.md | PASS | same behaviour as the prototype |
| g_u8_wrap | `const a: u8 = 250; console.log((a + 10) as u8);` | docs/guide/02-language.md | PASS |  |
| g_unknown_narrow | `const x: unknown = 5; if (typeof x === 'number') console.log(x + 1);` | docs/guide/02-language.md | PASS |  |
| g_using_order | `class R { constructor(public n: string) {} [Symbol.dispose](): void { console.lo` | docs/guide/02-language.md | PASS |  |
| g_void_fn_ret | `function f(): void { return; } console.log(f() === undefined);` | docs/guide/02-language.md | PARTIAL | compiles, wrong output:  /  (prototype: true / ) |
| g_while_break | `let i = 0; while (true) { if (++i > 3) break; } console.log(i);` | docs/guide/02-language.md | PASS |  |
| j_parse_dyn | `const d = JSON.parse('[1,{"x":2}]'); console.log(d[1].x);` | lib/zinc.d.ts JSON | PASS |  |
| j_parse_err | `try { JSON.parse('{bad'); } catch (e) { console.log('err'); }` | lib/zinc.d.ts JSON | PASS |  |
| j_stringify_class | `class A { x = 1; y = 'a'; } console.log(JSON.stringify(new A()));` | lib/zinc.d.ts JSON | PASS |  |
| j_stringify_map | `console.log(JSON.stringify([1.5, -0, 1e21]));` | lib/zinc.d.ts JSON | PASS |  |
| j_stringify_str | `console.log(JSON.stringify('a"b\n'));` | lib/zinc.d.ts JSON | PASS |  |
| j_toJSON | `class A { toJSON(): string { return 'z'; } } console.log(JSON.stringify(new A())` | lib/zinc.d.ts JSON | PARTIAL | compiles, wrong output: {} /  (prototype: "z" / ) |
| l_abstract | `abstract class A { abstract s(): string; name = 'dog'; } class D extends A { s()` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_accessor_kw | `class A { accessor v = 1; } console.log(new A().v);` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0002: Expected a specific token: ';' /  |
| l_any_strict | `const x: any = 1; console.log(x);` | docs/guide/02-language.md; tests/conformance/features.ts | PASS | same behaviour as the prototype |
| l_arena | `{ using a = Arena.frame(); console.log(1); }` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0104: Wrong number of arguments: expected 1, got 0 /  |
| l_arrowthis | `class A { n = 4; g(): () => number { return () => this.n; } } console.log(new A(` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_asconst | `const a = [1, 2] as const; console.log(a[1]);` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0001: Unexpected token: 'const' /  |
| l_async | `async function f(): Promise<void> { await Promise.resolve(); console.log('b'); }` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_async_arrow | `const f = async (): Promise<number> => 2; f().then(v => console.log(v));` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0005: Syntax not supported yet: async arrow functions and generator expressions /  |
| l_async_method | `class A { async f(): Promise<number> { return 5; } } new A().f().then(v => conso` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_async_throw | `async function f(): Promise<void> { throw new Error('x'); } async function m(): ` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_asyncfinally | `async function g(): Promise<void> { try { await null; } finally { console.log('f` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0005: Syntax not supported yet: 'try' with 'finally' around await or yield /  |
| l_asyncorder | `Promise.resolve().then(() => console.log(2)); setTimeout(() => console.log('t'),` | docs/guide/02-language.md; tests/conformance/features.ts | PASS | same behaviour as the prototype |
| l_awaitargs | `async function a(): Promise<number> { return 1; } function add(x: number, y: num` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0005: Syntax not supported yet: 'await' or 'yield' in this statement /  |
| l_awaitincond | `async function g(): Promise<number> { let n = 0; while (n < 1) { n = n + await P` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0005: Syntax not supported yet: 'await' or 'yield' in this statement /  |
| l_bigloop | `let s = 0; for (let i = 0; i < 1000000; i++) s += i; console.log(s);` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_catch_nobind | `try { throw new Error('x'); } catch { console.log('ok'); }` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_class_generic_static | `class Q<T> { items: T[] = []; push(x: T): void { this.items.push(x); } get size(` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_closure | `function mk(): () => number { let c = 0; return () => ++c; } const f = mk(); con` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_closure_selfref | `const f = (n: number): number => n <= 0 ? 0 : n + f(n - 1) ; console.log(f(2));` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0101: Cannot find name: 'f' /  |
| l_compound | `let a = 5; a += 3; a -= 2; a *= 2; a /= 2; a %= 4; a <<= 1; a \|= 1; a &= 7; a ^=` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_constenum | `const enum C { A = 1, B = 2 } console.log(C.A + C.B);` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0001: Unexpected token: 'enum' /  |
| l_customerror | `class E1 extends Error { constructor(m: string) { super(m); this.name = 'E1'; } ` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_defaults | `function f(a: number, b: number = 2): number { return a + b; } console.log(f(1))` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_destr_default | `const {z = 5} = {} as {z?: number}; console.log(z);` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0005: Syntax not supported yet: default values in patterns /  |
| l_destr_param | `function f({a, b}: {a: number, b: number}): number { return a + b; } console.log` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_dowhile | `let i = 0; do { i++; } while (i < 3); console.log(i);` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_dynimport | `import('zinc:sys');` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0001: Unexpected token: 'import' /  |
| l_dynjson | `const d = JSON.parse('{"n":42,"items":[1,2,3]}'); if (typeof d.n === 'number') c` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_enum | `enum C { Red, Green, Blue } console.log(C.Green); const e: C = C.Blue; console.l` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_exp | `console.log(2 ** 3); let x = 2; x **= 10; console.log(x);` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_f32 | `const f: f32 = 0.1; console.log(f as number);` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_fn_selfref | `function fact(n: number): number { return n <= 1 ? 1 : n * fact(n - 1); } consol` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_fnexpr_recursion | `const f = function fact(n: number): number { return n <= 1 ? 1 : n * fact(n - 1)` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0101: Cannot find name: 'fact' /  |
| l_forof_destr | `const xs: [number, string][] = [[1, 'a']]; for (const [n, s] of xs) console.log(` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_gen_delegate | `function* a(): Generator<number> { yield 1; } function* b(): Generator<number> {` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0001: Unexpected token: '*' /  |
| l_gen_method | `class R { *items(): Generator<number> { yield 0; yield 1; } } for (const v of ne` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0005: Syntax not supported yet: setters, async and computed member names /  |
| l_gen_return | `function* g(): Generator<number> { yield 1; return; } const it = g(); console.lo` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0106: Property does not exist: 'value' on 'boolean' /  |
| l_generator | `function* g(): Generator<number> { yield 1; yield 2; yield 3; } for (const v of ` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_generics | `function id<T>(x: T): T { return x; } class Box<T> { constructor(public v: T) {}` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_getset | `class A { private _v = 3; get v(): number { return this._v * 2; } set v(n: numbe` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_i32 | `const a: i32 = 2147483647; console.log(a + 1); const b: u8 = 255; console.log(b)` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_iife | `console.log((() => 5)());` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_incdec | `let i = 0; console.log(++i); console.log(i++ + 0 === 1 ? 2 : 0); console.log(i);` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_inheritsuper | `class A { f(): string { return 'A.f'; } } class B extends A { f(): string { retu` | docs/guide/02-language.md; tests/conformance/features.ts | PASS | same behaviour as the prototype |
| l_instanceof | `class A {} class B {} const a = new A(); console.log(a instanceof A); console.lo` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_int_div_trunc | `const a: i32 = 7; console.log((a / 2) \| 0);` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_interface | `interface P { x: number; y: number } class C implements P { x = 1; y = 2; } cons` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0114: Invalid class hierarchy or override: 'implements' needs an interface / error Z0103: Type is not assignable: 'C' to 'P |
| l_interval | `let n = 0; let id = 0; id = setInterval(() => { n++; console.log(n); if (n == 3)` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_nested_fn | `function outer(): number { function inner(): number { return 3; } return inner()` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_objlit_anon | `const o = {n: 3}; console.log(o.n);` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_objlit_typed | `interface O { n: number; s: string } const o: O = {n: 3, s: 'x'}; console.log(o.` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_optchain | `class A { v: number = 5; n: A \| undefined = undefined; } const a: A = new A(); c` | docs/guide/02-language.md; tests/conformance/features.ts | PARTIAL | compiles, wrong output: null / 5 / 7 /  (prototype: undefined / 5 / 7 / ) |
| l_pooled | `@pooled(4) class P { x = 3; } console.log(new P().x);` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_promise_catch | `Promise.reject<number>(new Error('bad')).catch(e => { console.log(e.message); re` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0112: Not allowed in this context: class 'Promise' used as a value / error Z0112: Not allowed in this context: class  |
| l_promise_ctor | `const p = new Promise<number>((res, rej) => { res(4); }); p.then(v => console.lo` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0109: Cannot infer a type: parameter 'rej' of a function expression / error Z0103: Type is not assignable: '((f64) => |
| l_promiseall | `async function main(): Promise<void> { const r = await Promise.all([Promise.reso` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_protected | `class A { protected v = 2; } class B extends A { g(): number { return this.v; } ` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_readonly | `class A { readonly v = 2; } const a = new A(); a.v = 3;` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_satisfies | `const a = {x: 1} satisfies {x: number}; console.log(a.x);` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0002: Expected a specific token: ';' /  |
| l_static | `class A { static n = 1; static inc(): number { return ++A.n; } static { A.n = A.` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | error Z0001: Unexpected token: '{' /  |
| l_str_cmp_switch | `function f(s: string): string { switch (s) { case 'a': return 'a'; default: retu` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_switch | `function f(n: number): string { switch (n) { case 1: return 'one'; case 2: retur` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_ternary_bits | `console.log(2 << 1 \| 2); console.log(~7); console.log(8 >> 2); console.log(5 >>>` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_throwstr | `try { throw new Error('x'); } catch (e) { console.log((e as Error).message); }` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_timers | `setTimeout(() => console.log('t2'), 20); setTimeout(() => console.log('t1'), 5);` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_trycatch | `try { throw new Error('boom'); } catch (e) { console.log('caught ' + (e as Error` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_tuple | `const t: [number, string] = [1, 'a']; const [n, s] = t; console.log(n, s); funct` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_u64b | `const a: u64 = 1; console.log(a << 32); const b: u32 = 2147483648; console.log(b` | docs/guide/02-language.md; tests/conformance/features.ts | PASS | same behaviour as the prototype |
| l_union | `type S = {k: 'c', r: number} \| {k: 's', w: number}; function f(s: S): string { s` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_unknown_use | `const x: unknown = 1; console.log(x + 1);` | docs/guide/02-language.md; tests/conformance/features.ts | PASS | same behaviour as the prototype |
| l_using | `class R { [Symbol.dispose](): void { console.log('dispose'); } } { using r = new` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_value | `@value class P { x: i32 = 3; } console.log(new P().x);` | docs/guide/02-language.md; tests/conformance/features.ts | PASS |  |
| l_var | `var x = 1; console.log(x);` | docs/guide/02-language.md; tests/conformance/features.ts | MISSING | 1 /  |
| m_basic | `const m = new Map<string, number>(); m.set('a', 1).set('b', 2); console.log(m.ge` | lib/zinc.d.ts Map | PASS |  |
| m_clear | `const m = new Map<number, number>(); m.set(1, 1); m.clear(); console.log(m.size)` | lib/zinc.d.ts Map | PASS |  |
| m_forEach | `const m = new Map<string, number>(); m.set('a', 1); m.forEach((v, k) => console.` | lib/zinc.d.ts Map | PASS |  |
| m_iter | `const m = new Map<string, number>(); m.set('a', 1); m.set('b', 2); for (const [k` | lib/zinc.d.ts Map | PASS |  |
| m_keys | `const m = new Map<string, number>(); m.set('a', 1); console.log(m.keys().join(),` | lib/zinc.d.ts Map | PASS |  |
| m_objkey | `class K {} const k = new K(); const m = new Map<K, number>(); m.set(k, 1); conso` | lib/zinc.d.ts Map | PASS |  |
| mt_basic | `console.log(Math.abs(-2), Math.floor(1.5), Math.ceil(1.2), Math.round(2.5), Math` | lib/zinc.d.ts Math | MISSING | error Z0106: Property does not exist: 'sign' on 'Math' /  |
| mt_expl | `console.log(Math.exp(0), Math.log(1));` | lib/zinc.d.ts Math | PASS |  |
| mt_imul | `console.log(Math.imul(3, 4), Math.clz32(1), Math.fround(5.5));` | lib/zinc.d.ts Math | MISSING | error Z0106: Property does not exist: 'clz32' on 'Math' / error Z0106: Property does not exist: 'fround' on 'Math' /  |
| mt_intdiv | `const a: i32 = 7; const b: i32 = 2; console.log(a / b);` | lib/zinc.d.ts Math | PASS |  |
| mt_minmax | `console.log(Math.min(1, 2, 3), Math.max(1, 2, 3), Math.max());` | lib/zinc.d.ts Math | PASS |  |
| mt_mod | `console.log(-5 % 3, 5.5 % 2, 7 / 2 \| 0);` | lib/zinc.d.ts Math | PASS |  |
| mt_nan | `console.log(NaN === NaN, isNaN(NaN), 0 / 0, 1 / 0, -1 / 0);` | lib/zinc.d.ts Math | MISSING | error Z0101: Cannot find name: 'isNaN' /  |
| mt_num | `console.log(Number.MAX_SAFE_INTEGER, Number.EPSILON > 0, Number.isSafeInteger(1)` | lib/zinc.d.ts Math | PASS |  |
| mt_pow | `console.log(Math.sqrt(16), Math.pow(2, 10), Math.hypot(3, 4));` | lib/zinc.d.ts Math | MISSING | error Z0106: Property does not exist: 'hypot' on 'Math' /  |
| mt_rand | `const r = Math.random(); console.log(r >= 0 && r < 1);` | lib/zinc.d.ts Math | PASS |  |
| mt_trig | `console.log(Math.sin(0), Math.cos(0), Math.tan(0), Math.atan2(0, 1));` | lib/zinc.d.ts Math | PASS |  |
| p_default_infer | `function f(a: number, b = 2): number { return a + b; } console.log(f(1));` | docs/guide/02-language.md | MISSING | Z0109: Cannot infer a type: parameter 'b' |
| s_at | `console.log('abc'.at(-1));` | lib/zinc.d.ts String | PASS |  |
| s_charAt | `console.log('abc'.charAt(1));` | lib/zinc.d.ts String | PASS |  |
| s_charCodeAt | `console.log('abc'.charCodeAt(1));` | lib/zinc.d.ts String | PASS |  |
| s_cmp | `console.log('a' < 'b');` | lib/zinc.d.ts String | PASS |  |
| s_concat | `console.log('a'.concat('b'));` | lib/zinc.d.ts String | PASS |  |
| s_endsWith | `console.log('abc'.endsWith('bc'));` | lib/zinc.d.ts String | PASS |  |
| s_fromCharCode | `console.log(String.fromCharCode(65));` | lib/zinc.d.ts String | PASS |  |
| s_includes | `console.log('abc'.includes('bc'));` | lib/zinc.d.ts String | PASS |  |
| s_index | `console.log('abc'[1]);` | lib/zinc.d.ts String | MISSING | error Z0113: Expression cannot be indexed or iterated: 'string' /  |
| s_indexOf | `console.log('abcabc'.indexOf('c', 3));` | lib/zinc.d.ts String | PASS |  |
| s_iter | `let n = 0; for (const c of 'héé') n++; console.log(n);` | lib/zinc.d.ts String | PASS |  |
| s_lastIndexOf | `console.log('abcabc'.lastIndexOf('b'));` | lib/zinc.d.ts String | PASS |  |
| s_lower | `console.log('ABC'.toLowerCase());` | lib/zinc.d.ts String | PASS |  |
| s_numfmt | `console.log(1e21, 0.000001, 1e-7, -0, 123456789012345680000);` | lib/zinc.d.ts String | PASS | prints -0 like Node (prototype prints 0) |
| s_padEnd | `console.log('5'.padEnd(3, '0'));` | lib/zinc.d.ts String | PASS |  |
| s_padStart | `console.log('5'.padStart(3, '0'));` | lib/zinc.d.ts String | PASS |  |
| s_parseInt | `console.log(parseInt('12px'), parseFloat('3.5x'), Number('0x10'), Number(''), Nu` | lib/zinc.d.ts String | PASS |  |
| s_repeat | `console.log('ab'.repeat(2));` | lib/zinc.d.ts String | PASS |  |
| s_replace | `console.log('aXbX'.replace('X', '-'));` | lib/zinc.d.ts String | PASS |  |
| s_replaceAll | `console.log('aXbX'.replaceAll('X', '-'));` | lib/zinc.d.ts String | PASS |  |
| s_slice | `console.log('abcdef'.slice(1, -1));` | lib/zinc.d.ts String | PASS |  |
| s_split | `console.log('a,b,c'.split(',').length);` | lib/zinc.d.ts String | PASS |  |
| s_split_empty | `console.log('abc'.split('').join('-'));` | lib/zinc.d.ts String | PASS |  |
| s_startsWith | `console.log('abc'.startsWith('ab'));` | lib/zinc.d.ts String | PASS |  |
| s_substring | `console.log('abcdef'.substring(4, 1));` | lib/zinc.d.ts String | PASS |  |
| s_template | `const a = 1; console.log('x${a + 1}y');` | lib/zinc.d.ts String | PASS |  |
| s_toFixed | `console.log((3.14159).toFixed(2));` | lib/zinc.d.ts String | PASS |  |
| s_tostring | `console.log(String(12) + String(true));` | lib/zinc.d.ts String | PASS |  |
| s_trim | `console.log('[' + '  a '.trim() + ']');` | lib/zinc.d.ts String | PASS |  |
| s_trimEndOnly | `console.log('[' + ' a '.trimEnd() + ']');` | lib/zinc.d.ts String | PASS |  |
| s_trimStart | `console.log('[' + '  a '.trimStart() + ']');` | lib/zinc.d.ts String | PASS |  |
| s_upper | `console.log('abc'.toUpperCase());` | lib/zinc.d.ts String | PASS |  |
| s_utf16len | `console.log('😀'.length);` | lib/zinc.d.ts String | PASS |  |
| st_basic | `const s = new Set<number>(); s.add(1).add(1).add(2); console.log(s.size, s.has(2` | lib/zinc.d.ts Set | PASS |  |
| st_iter | `const s = new Set<number>(); s.add(3); for (const v of s) console.log(v);` | lib/zinc.d.ts Set | PASS |  |
| st_spread | `const s = new Set<number>(); s.add(3); console.log([...s].length);` | lib/zinc.d.ts Set | MISSING | error Z0106: Property does not exist: 'slice' on 'Set<f64>' /  |
| uncaught | `throw new Error('boom');` | - | PASS | same behaviour as the prototype |
| w_abort | `const c = new AbortController(); c.signal.addEventListener('abort', (e: Event) =` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'AbortController' / error Z0101: Cannot find name: 'Event' /  |
| w_abort_timeout | `const s = AbortSignal.timeout(5); s.addEventListener('abort', (e: Event) => cons` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'AbortSignal' / error Z0101: Cannot find name: 'Event' /  |
| w_blob | `const b = new Blob(['ab', 'c']); console.log(b.size);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'Blob' /  |
| w_blob_text | `new Blob(['ab']).text().then(t => console.log(t));` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'Blob' / error Z0101: Cannot find name: 'Blob' / error Z0109: Cannot infer a type: |
| w_btoa | `console.log(btoa('zinc'), atob('emluYw=='));` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'btoa' / error Z0101: Cannot find name: 'atob' /  |
| w_crypto_uuid | `console.log(crypto.randomUUID().length);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'crypto' /  |
| w_customevent | `const e = new CustomEvent<number>('c', {detail: 3}); console.log(e.detail);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'CustomEvent' /  |
| w_domex | `const e = new DOMException('m', 'AbortError'); console.log(e.name, e.code);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'DOMException' /  |
| w_enc_uri | `console.log(encodeURIComponent('a b&'), decodeURIComponent('%41'));` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'encodeURIComponent' / error Z0101: Cannot find name: 'decodeURIComponent' /  |
| w_event | `const t = new EventTarget(); t.addEventListener('x', (e: Event) => console.log(e` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'EventTarget' / error Z0101: Cannot find name: 'Event' / error Z0101: Cannot find name: 'Ev |
| w_events_mod | `import { Emitter } from 'zinc:events'; const e = new Emitter<number>(); e.on((v:` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0119: Cannot find module: 'zinc:events' /  |
| w_eventtarget_once | `const t = new EventTarget(); t.addEventListener('x', (e: Event) => console.log('` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'EventTarget' / error Z0101: Cannot find name: 'Event' / e |
| w_fetch_data | `fetch('data:text/plain,hi').then(r => r.text()).then(t => console.log(t));` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'fetch' / error Z0101: Cannot find name: 'fetch' / error Z0109: Cannot infer a  |
| w_file | `const f = new File(['a'], 'n.txt'); console.log(f.name, f.size);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'File' /  |
| w_formdata | `const f = new FormData(); f.append('a', '1'); console.log(f.get('a'));` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'FormData' /  |
| w_fs_mod | `import { writeText, readText } from 'zinc:fs'; writeText('/tmp/parity/f.txt', 'h` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | PASS |  |
| w_gpio_mod | `import { setup } from 'zinc:gpio'; console.log(typeof setup);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0119: Cannot find module: 'zinc:gpio' /  |
| w_headers | `const h = new Headers(); h.set('A', 'b'); console.log(h.get('a'));` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'Headers' /  |
| w_mqtt_mod | `import { MqttClient } from 'zinc:mqtt'; console.log(typeof MqttClient);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0119: Cannot find module: 'zinc:mqtt' /  |
| w_msgchan | `const c = new MessageChannel(); c.port1.onmessage = (e: MessageEvent) => console` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'MessageChannel' / error Z0101: Cannot find name: 'MessageEvent' /  |
| w_navigator | `console.log(typeof navigator.userAgent);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'navigator' /  |
| w_net_mod | `import { fetch } from 'zinc:net'; console.log(typeof fetch);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | PASS |  |
| w_os_mod | `import { hostname } from 'zinc:os'; console.log(typeof hostname());` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | PASS |  |
| w_osc_mod | `import { send } from 'zinc:osc'; console.log(typeof send);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0119: Cannot find module: 'zinc:osc' /  |
| w_path_mod | `import { join, basename } from 'zinc:path'; console.log(join('a', 'b'), basename` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | PASS |  |
| w_perf_now | `const t = performance.now(); console.log(t >= 0);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | PASS |  |
| w_queueMicrotask | `queueMicrotask(() => console.log('mt')); console.log('s');` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | PASS |  |
| w_reportError | `console.log(typeof reportError);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'reportError' /  |
| w_request | `const r = new Request('https://e.com', {method: 'post'}); console.log(r.method);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'Request' /  |
| w_response | `new Response('hi').text().then(t => console.log(t));` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'Response' / error Z0101: Cannot find name: 'Response' / error Z0109: Cannot infer a  |
| w_response_json | `Response.json({a: 1}).text().then(t => console.log(t));` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'Response' / error Z0101: Cannot find name: 'Response' / error Z0109:  |
| w_settimeout_clear | `const id = setTimeout(() => console.log('no'), 5); clearTimeout(id); console.log` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | PASS |  |
| w_storage_mod | `import { get, set } from 'zinc:storage'; set('k', 'v'); console.log(get('k'));` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | PASS |  |
| w_structuredClone | `const o = structuredClone({a: [1, 2]}) as {a: number[]}; console.log(o.a.length)` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'structuredClone' /  |
| w_sys_mod | `import { args, cwd } from 'zinc:sys'; console.log(typeof cwd());` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | PASS |  |
| w_td | `console.log(new TextDecoder().decode(new TextEncoder().encode('hé')));` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'TextDecoder' / error Z0101: Cannot find name: 'TextEncoder' /  |
| w_te | `console.log(new TextEncoder().encode('hé').length);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'TextEncoder' /  |
| w_telemetry | `import { counter } from 'zinc:telemetry'; console.log(typeof counter);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0119: Cannot find module: 'zinc:telemetry' /  |
| w_timeout_args | `setTimeout(() => console.log('x'), 1);` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | PASS |  |
| w_url | `const u = new URL('/a?x=1', 'https://e.com'); console.log(u.href, u.searchParams` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'URL' /  |
| w_usp | `const p = new URLSearchParams('a=1&b=2'); console.log(p.get('b'), p.has('a'), p.` | docs/guide/09-web-apis.md; lib/std/web.ts; lib/modules.d.ts | MISSING | error Z0101: Cannot find name: 'URLSearchParams' /  |

## Table B: features the prototype does not support either (brief asked for them)

next column: PASS where next is ahead; MISSING with next's error. "prototype also rejects" shows the prototype is no better.

| id | feature (test snippet) | prototype evidence | next | error or note |
|---|---|---|---|---|
| a_copyWithin | `console.log([1, 2, 3].copyWithin(0, 1).join());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'copyWithin' on 'f64[]' / error Z0106: Property does not exist: 'copyWithin' on 'f64[]' /  |
| a_entries | `for (const [i, v] of [5, 6].entries()) console.log(i, v);` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'entries' on 'f64[]' /  |
| a_flat | `console.log([[1], [2]].flat().join());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'flat' on 'f64[][]' / error Z0106: Property does not exist: 'flat' on 'f64[][]' /  |
| a_flatMap | `console.log([1, 2].flatMap(x => [x, x]).join());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'flatMap' on 'f64[]' / error Z0109: Cannot infer a type: parameter 'x' of a function expression /  |
| a_from | `console.log(Array.from([1, 2]).length);` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'from' on 'Array' /  |
| a_from_len | `console.log(Array.from({length: 3}, (_, i) => i).join());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'from' on 'Array' / error Z0109: Cannot infer a type: parameter '_' of a function expression / a |
| a_keys | `console.log([...[5, 6].keys()].join());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'keys' on 'f64[]' / error Z0106: Property does not exist: 'keys' on 'f64[]' /  |
| a_new_len | `const a = new Array<number>(3); console.log(a.length);` | not in prototype | MISSING | prototype also rejects; next: error Z0105: Expression is not callable: only classes can be used with new /  |
| a_of | `console.log(Array.of(1, 2).length);` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'of' on 'Array' /  |
| a_oob_panic | `const a = [1]; console.log(a[5]);` | not in prototype | MISSING | prototype also rejects; next: runtime error: array index out of bounds /  |
| a_sort_nocmp | `console.log([3, 1, 2].sort().join());` | not in prototype | MISSING | prototype also rejects; next: error Z0104: Wrong number of arguments: expected 1, got 0 /  |
| a_splice_ins | `const a = [1, 4]; a.splice(1, 0, 2, 3); console.log(a.join());` | not in prototype | MISSING | prototype also rejects; next: error Z0104: Wrong number of arguments: expected 1-2, got 4 /  |
| a_toReversed | `console.log([2, 1].toReversed().join());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'toReversed' on 'f64[]' / error Z0106: Property does not exist: 'toReversed' on 'f64[]' /  |
| a_toSorted | `console.log([2, 1].toSorted().join());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'toSorted' on 'f64[]' / error Z0106: Property does not exist: 'toSorted' on 'f64[]' /  |
| a_tostring | `console.log([1, 2].toString());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'toString' on 'f64[]' /  |
| a_with | `console.log([2, 1].with(0, 5).join());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'with' on 'f64[]' / error Z0106: Property does not exist: 'with' on 'f64[]' /  |
| con_dir | `console.dir({a: 1});` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'dir' on 'console' /  |
| con_group | `console.group('g'); console.log('in'); console.groupEnd();` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'group' on 'console' / error Z0106: Property does not exist: 'groupEnd' on 'console' /  |
| d_ctor | `const d = new Date(0); console.log(d.getTime(), d.getUTCFullYear(), d.getUTCMont` | not in prototype | PASS | beyond prototype |
| d_ctor_parts | `const d = new Date(2020, 0, 15); console.log(d.getFullYear(), d.getDate());` | not in prototype | MISSING | prototype also rejects; next: error Z0104: Wrong number of arguments: expected 0-1, got 3 /  |
| d_ctor_str | `const d = new Date('2020-01-15T10:00:00Z'); console.log(d.getUTCHours());` | not in prototype | MISSING | prototype also rejects; next: error Z0103: Type is not assignable: 'string' to 'f64' /  |
| d_iso | `console.log(new Date(0).toISOString());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'toISOString' on 'Date' /  |
| d_json | `console.log(new Date(0).toJSON());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'toJSON' on 'Date' /  |
| d_locale | `console.log(new Date(0).toLocaleDateString('en-US', {timeZone: 'UTC'}));` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'toLocaleDateString' on 'Date' /  |
| d_parse | `console.log(Date.parse('2000-01-01T00:00:00Z'));` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: static 'parse' on 'Date' /  |
| d_setters | `const d = new Date(0); d.setUTCFullYear(2000); console.log(d.getUTCFullYear());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'setUTCFullYear' on 'Date' /  |
| d_str | `console.log(new Date(0).toString().length > 10);` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'toString' on 'Date' /  |
| d_tz | `console.log(new Date(0).getTimezoneOffset());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'getTimezoneOffset' on 'Date' /  |
| d_utc | `console.log(Date.UTC(2000, 0, 1));` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: static 'UTC' on 'Date' /  |
| div_zero | `const a: i32 = 1; const b: i32 = 0; try { console.log(a / b); } catch (e) { cons` | not in prototype | PASS | beyond prototype |
| err_agg | `const e = new AggregateError([new Error('a')], 'm'); console.log(e.errors.length` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'AggregateError' /  |
| err_cause | `const e = new Error('m', {cause: 'c'}); console.log(e.cause);` | not in prototype | MISSING | prototype also rejects; next: error Z0104: Wrong number of arguments: expected 1, got 2 / error Z0106: Property does not exist: 'cause' on 'Error' /  |
| err_props | `const e = new Error('m'); console.log(e.message, e.name, e.stack !== undefined);` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'stack' on 'Error' /  |
| err_syntax | `try { throw new SyntaxError('t'); } catch (e) { console.log((e as Error).name); ` | not in prototype | PASS | beyond prototype |
| err_tostring | `console.log(new Error('m').toString());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'toString' on 'Error' /  |
| f_array_join_null | `const a: (number \| null)[] = [1, null, 2]; console.log(a.join('-'));` | not in prototype | MISSING | prototype also rejects; next: internal error: invalid ZBC: @main pc 27: argument r7 holds ref Box<f64>, expected f64 /  |
| f_nested_print | `console.log([[1, 2], ['a']]);` | not in prototype | MISSING | prototype also rejects; next: error Z0103: Type is not assignable: 'string[]' to 'f64[]' /  |
| f_sort_stable | `const a = [{k: 1, v: 'a'}, {k: 0, v: 'b'}, {k: 1, v: 'c'}]; a.sort((x, y) => x.k` | not in prototype | PASS | beyond prototype |
| f_str_in_arr | `console.log(['a', "b'c"]);` | not in prototype | PASS | beyond prototype |
| f_str_undefined_tpl | `const x: number \| undefined = undefined; console.log('${x}');` | not in prototype | MISSING | prototype also rejects; next: internal error: invalid ZBC: @main pc 3: argument r2 holds ref Box<f64>, expected f64 /  |
| f_toUpper_unicode | `console.log('éß'.toUpperCase(), 'İ'.toLowerCase().length);` | not in prototype | MISSING | prototype also rejects; next: éß 1 /  |
| g_array_from_gen | `function* g(): Generator<number> { yield 1; } console.log(Array.from(g()).length` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'from' on 'Array' /  |
| g_async_using | `class R { async [Symbol.asyncDispose](): Promise<void> { console.log('ad'); } } ` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: setters, async and computed member names /  |
| g_extends_constraint | `function f<T extends {n: number}>(x: T): number { return x.n; } console.log(f({n` | not in prototype | MISSING | prototype also rejects; next: error Z0103: Type is not assignable: type argument '{ n: f64 }' does not satisfy '{ n: f64 }' /  |
| g_generic_default | `class B<T = number> { v: T \| null = null; } console.log(new B().v === null);` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: type parameter defaults /  |
| g_in_array_obj | `const o: {[k: string]: number} = {a: 1}; console.log(o['a']);` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: setters, async and computed member names /  |
| g_json_dyn_iterate | `const d = JSON.parse('{"a":1,"b":2}'); let n = 0; for (const k in d) n++; consol` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: for...in /  |
| g_json_nested | `interface P { a: number[]; b: {c: string} } const p = JSON.parse<P>('{"a":[1,2],` | not in prototype | PASS | beyond prototype |
| g_label_continue | `outer: for (let i = 0; i < 2; i++) { for (let j = 0; j < 2; j++) { if (j == 1) c` | not in prototype | MISSING | prototype also rejects; next: error Z0002: Expected a specific token: ';' /  |
| g_loose_eq | `console.log(0 == '', null == 0, '1' == 1);` | not in prototype | MISSING | prototype also rejects; next: error Z0107: Operator cannot be applied to these types: '==' on 'f64' and 'string' / error Z0107: Operator cannot be applied to thes |
| g_multiline_tpl | `console.log('a` | not in prototype | MISSING | prototype also rejects; next: error Z0003: Invalid or unterminated literal /  |
| g_neg_zero | `console.log(Object.is(-0, 0));` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'Object' /  |
| g_optional_param | `function f(a: number, b?: number): number { return b === undefined ? a : a + b; ` | not in prototype | PASS | beyond prototype |
| g_partial | `interface P { a: number; b: number } const p: Partial<P> = {a: 1}; console.log(p` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'Partial' /  |
| g_record | `const r: Record<string, number> = {}; r['a'] = 1; console.log(r['a']);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'Record' /  |
| g_string_number_coerce | `console.log('5' * 2, '5' + 2, +'3', 1 + null);` | not in prototype | MISSING | prototype also rejects; next: error Z0107: Operator cannot be applied to these types: '*' on 'string' and 'f64' / error Z0107: Operator ca |
| g_symbol_iterator_obj | `console.log(typeof Symbol.iterator);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'Symbol' /  |
| g_unary_plus_bool | `console.log(+true, -'2', !!'a', !0);` | not in prototype | MISSING | prototype also rejects; next: error Z0103: Type is not assignable: 'string' to 'boolean' / error Z0103: Type is not assignable: 'f64' to 'boolean' /  |
| g_unhandled_rejection | `Promise.reject<number>(new Error('u')); setTimeout(() => console.log('after'), 5` | not in prototype | MISSING | prototype also rejects; next: error Z0112: Not allowed in this context: class 'Promise' used as a value /  |
| g_void0 | `console.log(void 0 === undefined);` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: operator 'void' /  |
| intl_dt | `console.log(typeof Intl);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'Intl' /  |
| intl_num | `console.log(new Intl.NumberFormat('en-US').format(1234.5));` | not in prototype | MISSING | prototype also rejects; next: error Z0105: Expression is not callable: only classes can be used with new /  |
| j_indent | `console.log(JSON.stringify({a: 1}, null, 2));` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: JSON.stringify with a replacer or an indent /  |
| j_parse_typed | `interface P { a: number; b: string } const p = JSON.parse<P>('{"a":1,"b":"x"}');` | not in prototype | PASS | beyond prototype |
| j_reviver | `console.log(JSON.parse('[1]', (k, v) => v)[0]);` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'parse' on 'JSON' / error Z0109: Cannot infer a type: parameter 'k' of a function expression / j_r |
| j_stringify | `console.log(JSON.stringify({a: 1, b: [1, 'x', null], c: true}));` | not in prototype | MISSING | prototype also rejects; next: error Z0103: Type is not assignable: 'string' to 'f64' /  |
| l_args | `function f(): number { return arguments.length; } console.log(f());` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'arguments' /  |
| l_arr_destr_swap | `let a = 1, b = 2; [a, b] = [b, a]; console.log(a, b);` | not in prototype | PASS | beyond prototype |
| l_asyncgen | `async function* g(): AsyncGenerator<number> { yield 1; yield 2; } async function` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: for await /  |
| l_bigint | `const a = 9007199254740992n; console.log((a + 1n).toString()); console.log(typeo` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: bigint / error Z0005: Syntax not supported yet: bigint /  |
| l_bigint2 | `console.log((10n ** 20n).toString());` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: bigint / error Z0005: Syntax not supported yet: bigint /  |
| l_bool_ops | `console.log(true && false); console.log(false \|\| true); console.log(null ?? 'x')` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: null without a reference type to give it /  |
| l_class_expr | `const C = class { v = 1; }; console.log(new C().v);` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: class expressions /  |
| l_comma_in | `const o = {a: 1}; console.log('a' in o); console.log('b' in o);` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: operator 'in' on a value that is not an 'any' / error Z0005: Syntax not supported yet: operat |
| l_dataview | `const b = new ArrayBuffer(2); const v = new DataView(b); v.setUint16(0, 258); co` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'ArrayBuffer' / error Z0101: Cannot find name: 'DataView' /  |
| l_decorators | `function d(t: Function, c: ClassDecoratorContext): void { console.log('dec'); } ` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'Function' / error Z0101: Cannot find name: 'ClassDecoratorContext' /  |
| l_destruct | `const [a, b, ...r] = [1, 2, 3, 4]; const {x, y: yy, z = 5} = {x: 1, y: 2} as {x:` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: default values in patterns /  |
| l_equality | `console.log(1 == 1); console.log('a' === 'b'); console.log(null == undefined);` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: null without a reference type to give it /  |
| l_eval | `eval('1');` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'eval' /  |
| l_export_import | `import { a } from './lib_a'; console.log(a);` | not in prototype | PASS | beyond prototype |
| l_forin | `const o = {a: 1, b: 2}; for (const k in o) console.log(k);` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: for...in /  |
| l_generator2 | `function* fib(): Generator<number, void, undefined> { let a = 0, b = 1; while (t` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: return type of a generator other than Generator<T> /  |
| l_globalthis | `console.log(typeof globalThis);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'globalThis' /  |
| l_import_default | `import d from './lib_d'; console.log(d);` | not in prototype | PASS | beyond prototype |
| l_import_star | `import * as m from './lib_a'; console.log(m.a);` | not in prototype | PASS | beyond prototype |
| l_indexsig | `class A { [k: string]: number; } const a = new A(); a['x'] = 2; console.log(a['x` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: setters, async and computed member names /  |
| l_intersect | `type A = {x: number}; type B = {y: number}; const c: A & B = {x: 1, y: 2}; conso` | not in prototype | MISSING | prototype also rejects; next: error Z0002: Expected a specific token: ';' /  |
| l_iter_class | `class R implements Iterable<number> { *[Symbol.iterator](): Generator<number> { ` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: setters, async and computed member names /  |
| l_iterator_proto | `class R { i = 0; [Symbol.iterator](): Iterator<number> { const s = this; return ` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: setters, async and computed member names /  |
| l_json_import | `import data from './d.json' with { type: 'json' }; console.log(data.x);` | not in prototype | MISSING | prototype also rejects; next: error Z0002: Expected a specific token: ';' /  |
| l_label | `outer: for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) { if (i == 1 &&` | not in prototype | MISSING | prototype also rejects; next: error Z0002: Expected a specific token: ';' /  |
| l_labeled2 | `a: { console.log(1); break a; }` | not in prototype | MISSING | prototype also rejects; next: error Z0002: Expected a specific token: ';' /  |
| l_mapiter | `const m = new Map<string, number>([['a', 1], ['b', 2]]); for (const [k, v] of m)` | not in prototype | MISSING | prototype also rejects; next: error Z0103: Type is not assignable: 'f64' to 'string' / error Z0103: Type is not assignable: 'f64' to 'string' / err |
| l_module_import | `import { sys } from 'zinc:sys'; console.log(3);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'sys' is not exported by 'zinc:sys' /  |
| l_namespace | `namespace N { export const x = 3; } console.log(N.x);` | not in prototype | MISSING | prototype also rejects; next: error Z0002: Expected a specific token: ';' /  |
| l_nonnull | `const m = new Map<string, number>([['a', 3]]); console.log(m.get('a')!);` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: non-null assertions /  |
| l_nullish | `let a: number \| null = null; console.log(a ?? 3); let b: number \| null = null; b` | not in prototype | PASS | beyond prototype |
| l_objectassign | `const o = Object.assign({a: 1}, {b: 2}); console.log(o.a, o.b);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'Object' /  |
| l_objectstatic | `const o = {a: 1, b: 2}; console.log(Object.keys(o).length); console.log(Object.v` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'Object' / error Z0101: Cannot find name: 'Object' / error Z0101: Canno |
| l_objlit | `const k = 'ab'; const o = {n: 3, s: 'x', [k]: 1}; console.log(o.n, o.s); console` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: '__dynObjOf' / error Z0103: Type is not assignable: 'string' to 'f64' / error Z0101: Cann |
| l_objlit_method | `const o = {n: 3, f(): number { return this.n + 1; }}; console.log(o.f());` | not in prototype | MISSING | prototype also rejects; next: error Z0112: Not allowed in this context: 'this' /  |
| l_objspread | `const a = {p: 1, q: 2}; const b = {...a, q: 3}; console.log(b.p, b.q);` | not in prototype | PASS | beyond prototype |
| l_optparam_idx | `const m: {[k: string]: number} = {a: 1}; console.log(m['a']); const r: Record<st` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: setters, async and computed member names /  |
| l_overload | `function f(x: number): number; function f(x: string): string; function f(x: numb` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: function declarations without a body / error Z0102: Duplicate declaration: 'f' / l_overload.ts:2 |
| l_promiseany | `async function main(): Promise<void> { console.log(await Promise.any([Promise.re` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: 'await' or 'yield' in this statement /  |
| l_promiseother | `async function main(): Promise<void> { const r = await Promise.allSettled([Promi` | not in prototype | MISSING | prototype also rejects; next:  /  |
| l_reexport | `import { a } from './lib_re'; console.log(a);` | not in prototype | PASS | beyond prototype |
| l_regex | `const r = /(\d+)-x/; console.log(r.test('12-x')); const m = '2024-01'.match(/(\d` | not in prototype | MISSING | prototype also rejects; next: error Z0001: Unexpected token: '/(\d+)-x/' /  |
| l_regex_new | `console.log('a1b22'.split(new RegExp('[0-9]+')).length - 1);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'RegExp' /  |
| l_regex_replace | `console.log('a-b-c'.replace(/-/g, '_'));` | not in prototype | MISSING | prototype also rejects; next: error Z0001: Unexpected token: '/-/g' /  |
| l_restparams | `function s(...xs: number[]): number { let t = 0; for (const x of xs) t += x; ret` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: rest parameters / error Z0104: Wrong number of arguments: expected 1, got 3 / l_restparams. |
| l_spread | `function f(a: number, b: number, c: number): number { return a + b + c; } const ` | not in prototype | MISSING | prototype also rejects; next: error Z0104: Wrong number of arguments: expected 3, got 1 / error Z0005: Syntax not supported yet: spread arguments /  |
| l_stringenum | `enum C { Red = 'r', Green = 'g' } console.log(C.Red);` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: computed enum members / error Z0005: Syntax not supported yet: computed enum members / l_st |
| l_symbol | `const s = Symbol('x'); console.log(typeof s);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'Symbol' /  |
| l_tagged | `function tag(s: TemplateStringsArray, v: number): string { return s[0] + '\|' + s` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: tagged templates /  |
| l_tagged2 | `function tag(s: TemplateStringsArray, v: number): string { return '[' + s[0] + '` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: tagged templates /  |
| l_ternary_chain | `const n = -1; console.log(n < 0 ? 'neg' : n == 0 ? 'zero' : 'pos');` | not in prototype | PASS | beyond prototype |
| l_throw_nonerror | `try { throw 5; } catch (e) { console.log(e); }` | not in prototype | MISSING | prototype also rejects; next: error Z0103: Type is not assignable: 'f64' to 'Error' /  |
| l_toplevel_await | `const v = await Promise.resolve(3); console.log(v);` | not in prototype | MISSING | prototype also rejects; next: error Z0002: Expected a specific token: ';' /  |
| l_typedarr | `const u = new Uint8Array(3); u[0] = 255; console.log(u.length); console.log(u[0]` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'Uint8Array' /  |
| l_typedarr2 | `const f = new Float32Array([1.5, 2]); console.log(f[0]); const b = new ArrayBuff` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'Float32Array' / error Z0101: Cannot find name: 'ArrayBuffer' /  |
| l_typeof | `let x: number \| undefined = undefined; console.log(typeof x);` | not in prototype | MISSING | prototype also rejects; next: object /  |
| l_u64 | `const a: u64 = 18446744073709551615; console.log(a);` | not in prototype | MISSING | prototype also rejects; next: 9223372036854775807 /  |
| l_undefprint | `const x: number \| undefined = undefined; console.log(x);` | not in prototype | MISSING | prototype also rejects; next: null /  |
| l_var_hoist | `console.log(typeof v); var v = 1; console.log(v);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'v' /  |
| l_weak | `class N { @weak accessor owner: N \| undefined; } console.log(1);` | not in prototype | MISSING | prototype also rejects; next: error Z0002: Expected a specific token: ';' /  |
| l_with | `const o = {a: 1}; with (o) { console.log(a); }` | not in prototype | MISSING | prototype also rejects; next: error Z0001: Unexpected token: 'with' /  |
| locale_num | `console.log((1234.5).toLocaleString('en-US'));` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'toLocaleString' on 'f64' /  |
| m_ctor_entries | `const m = new Map<string, number>([['a', 1]]); console.log(m.get('a'));` | not in prototype | MISSING | prototype also rejects; next: error Z0103: Type is not assignable: 'f64' to 'string' / error Z0005: Syntax not supported yet: constructor arguments of 'Ma |
| m_entries | `const m = new Map<string, number>(); m.set('a', 1); for (const [k, v] of m.entri` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'entries' on 'Map<string, f64>' /  |
| mt_const | `console.log(Math.PI, Math.E, Math.SQRT2, Math.LN2);` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'SQRT2' on 'Math' / error Z0106: Property does not exist: 'LN2' on 'Math' /  |
| mt_hyp | `console.log(Math.sinh(0), Math.cosh(0), Math.tanh(0), Math.expm1(0), Math.log1p(` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'sinh' on 'Math' / error Z0106: Property does not exist: 'cosh' on 'Math' / error Z0106: |
| mt_more | `console.log(Math.asin(0), Math.acos(1), Math.atan(0), Math.log2(8), Math.log10(1` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'asin' on 'Math' / error Z0106: Property does not exist: 'acos' on 'Math' / error Z01 |
| panic_oob_msg | `const a: number[] = []; try { console.log(a[3]); } catch (e) { console.log('t');` | not in prototype | MISSING | prototype also rejects; next: runtime error: array index out of bounds /  |
| perf | `console.log(performance.now() >= 0, typeof performance.timeOrigin);` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'timeOrigin' on 'Performance' /  |
| s_codePointAt | `console.log('😀'.codePointAt(0));` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'codePointAt' on 'string' /  |
| s_fromCodePoint | `console.log(String.fromCodePoint(128512));` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'fromCodePoint' on 'String' /  |
| s_isFinite | `console.log(isFinite(1), Number.isInteger(2.5));` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'isFinite' /  |
| s_isWellFormed | `console.log('a'.isWellFormed());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'isWellFormed' on 'string' /  |
| s_localeCompare | `console.log('a'.localeCompare('b'));` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'localeCompare' on 'string' /  |
| s_match | `console.log('abc'.match('b') !== null);` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'match' on 'string' /  |
| s_normalize | `console.log('a'.normalize());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'normalize' on 'string' /  |
| s_number_tostring_radix | `console.log((255).toString(16));` | not in prototype | MISSING | prototype also rejects; next: error Z0104: Wrong number of arguments: expected 0, got 1 /  |
| s_raw | `console.log(String.raw'a\nb');` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: tagged templates /  |
| s_search | `console.log('abc'.search('c'));` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'search' on 'string' /  |
| s_split_limit | `console.log('a,b,c'.split(',', 2).length);` | not in prototype | MISSING | prototype also rejects; next: error Z0104: Wrong number of arguments: expected 1, got 2 /  |
| s_substr | `console.log('abcd'.substr(1, 2));` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'substr' on 'string' /  |
| s_toExponential | `console.log((12345).toExponential(2));` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'toExponential' on 'f64' /  |
| s_toLocaleUpper | `console.log('a'.toLocaleUpperCase());` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'toLocaleUpperCase' on 'string' /  |
| s_toPrecision | `console.log((3.14159).toPrecision(3));` | not in prototype | MISSING | prototype also rejects; next: error Z0106: Property does not exist: 'toPrecision' on 'f64' /  |
| st_ctor | `const s = new Set<number>([1, 2, 2]); console.log(s.size);` | not in prototype | MISSING | prototype also rejects; next: error Z0005: Syntax not supported yet: constructor arguments of 'Set' /  |
| w_assert_mod | `import { assert } from 'zinc:assert'; assert.equal(1, 1); console.log('ok');` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'never' / error Z0005: Syntax |
| w_assets_mod | `import * as a from 'zinc:assets'; console.log(typeof a);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'a' /  |
| w_compress | `console.log(typeof CompressionStream);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'CompressionStream' /  |
| w_crypto_rand | `const a = [0, 0, 0] as u8[]; crypto.getRandomValues(a); console.log(a.length);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'crypto' /  |
| w_native_mod | `import { requireNative } from 'zinc:native'; console.log(typeof requireNative);` | not in prototype | MISSING | prototype also rejects; next: error Z0112: Not allowed in this context: generic function 'requireNative' must be called /  |
| w_setimmediate | `setImmediate(() => console.log('i'));` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'setImmediate' /  |
| w_signals_mod | `import { signal, effect } from 'zinc:signals'; const s = signal(1); effect(() =>` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'signal' is not exported by '/Users/mowmow/Lab/zinc/next/../lib/std/signals.ts' / error Z0101:  |
| w_streams | `const r = new ReadableStream<number>(); console.log(typeof r);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'ReadableStream' /  |
| w_subtle | `crypto.subtle.digest('SHA-256', [97] as u8[]).then(d => console.log(d.length));` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'crypto' / error Z0101: Cannot find name: 'crypto' / error Z0109: Cannot infer a type: para |
| w_urlpattern | `console.log(typeof URLPattern);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'URLPattern' /  |
| w_wasm | `console.log(typeof WebAssembly);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'WebAssembly' /  |
| w_wasm_mod | `import { Module } from 'zinc:wasm'; console.log(typeof Module);` | not in prototype | MISSING | prototype also rejects; next: error Z0001: Unexpected token: '/^unreachable/' /  |
| wm_basic | `class K {} const k = new K(); const w = new WeakMap<K, number>(); w.set(k, 1); c` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'WeakMap' /  |
| wr | `class K {} const r = new WeakRef(new K()); console.log(r.deref() !== undefined);` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'WeakRef' /  |
| ws_basic | `class K {} const k = new K(); const w = new WeakSet<K>(); w.add(k); console.log(` | not in prototype | MISSING | prototype also rejects; next: error Z0101: Cannot find name: 'WeakSet' /  |

## Table C: diagnostics

Codes differ by design (next: `Z0001-5` syntax, `Z0101-0119` semantic, `Z1006` strict any, generated docs in next/docs/diagnostics.md; the prototype reuses TypeScript `TS####` for semantics and adds `Z1xxx/Z4xxx/Z5xxx/Z9xxx`). PASS here means a clear equivalent error on the same line; format is `file:line:col: error Z####: message` versus the prototype's `file:line:col - error`.

| feature | prototype | next | status |
|---|---|---|---|
| abstract class instantiation | TS2511 | Z0115 | PASS |
| missing property | TS2339 | Z0106 | PASS |
| wrong argument count | TS2554 | Z0104 | PASS |
| assign to const | TS2588 | Z0108 | PASS |
| assign to getter-only property | TS2540 | Z0108 | PASS |
| duplicate declaration | TS2451 | Z0102 | PASS |
| undefined name | TS2304 | Z0101 | PASS |
| missing return path | TS2355 | Z0110 | PASS |
| type mismatch | TS2322 | Z0103 | PASS |
| class does not implement interface | TS2420 | Z0116 | PASS |
| possibly null deref | TS18047 | Z0107 (must be narrowed) | PASS |
| private member access | TS2341 | Z0117 | PASS |
| missing module | TS2307 | Z0119 | PASS |
| tuple index out of range | TS2493 | Z0103 | PASS |
| throw non-Error | Z1014 | Z0103 (not assignable to Error) | PASS |
| instanceof on primitive | TS2358 | Z0107 | PASS |
| eval | TS2304 | Z0101 | PASS |
| globalThis | Z9019 | Z0101 | PASS |
| arguments | TS2339 | Z0101 | PASS |
| delete | TS2790 | Z0005 unsupported | PASS |
| any in gradual profile | accepted | accepted | PASS |
| any under --strict | Z1006 (esp32/ps1 profile) | Z1006 | PASS |
| anonymous object literal type | accepted | accepted | PASS |
| union of primitives number\|string | Z9001 rejected | accepted (more permissive) | PASS |
| unreachable code / unused variable | accepted | accepted | PASS |
| `var` | Z1001 | accepted silently | MISSING |
| dynamic import() | Z1009 | Z0001 parse error | PARTIAL |
| regex literal | Z1008 (clear message) | Z0001 Unexpected token | PARTIAL |
| holey array [1,,2] | Z1011 | Z0001 Unexpected token | PARTIAL |
| `in` operator | Z9026 (use Map.has) | Z0005 (not on an any) | PARTIAL |
| labeled statement | Z9011 | Z0002 expected ; | PARTIAL |
| rest parameter | Z9009 | Z0005 | PARTIAL |
| spread call arguments | Z9016 | Z0104 + Z0005 (two errors for one cause) | PARTIAL |
| rest in destructuring | Z9016 | Z0005 + cascaded Z0102 | PARTIAL |
| string enum | Z9028 | Z0005 + cascaded Z0106 | PARTIAL |
| await in loop condition | Z9018 | Z0005 "this expression (node kind 69)" (internal wording) | PARTIAL |
| `with` | TS1101 | Z0001 | PARTIAL |
| `#x` access outside class | TS18013 | Z0001 | PARTIAL |
| `object` type | Z9001 | Z0101 Cannot find name | PARTIAL |
| `new Function(...)` | TS2693 | Z0101 | PASS |
| exhaustive-switch missing return | TS2366 | Z0110 | PASS |
| async generator | TS2318 (prototype lacks it too) | Z0005 | PASS |
| `readonly number[]` type | accepted | Z0002 parse error | MISSING |
| `typeof X` in type position | accepted | Z0001 | MISSING |
| non-null assertion `!` | accepted | Z0005 | MISSING |
| try/finally around await | accepted | Z0005 | MISSING |
| `// @ts-ignore` | honoured | not honoured (Z0103 reported) | MISSING |
| `--no-float` / Z4001 | Z4001 on f32/f64 sites | flag does not exist | MISSING |
| comma operator with unused left side | TS2695 | accepted | MISSING |
| error code scheme | TS#### from tsc plus about 75 Zxxxx (Z1xxx forbidden, Z4/5/6/9xxx) | 20 Zxxxx codes (Z0001-5, Z0101-0119, Z1006); `zinc explain <code>` and generated docs (new, prototype has none) | PARTIAL |
| machine-readable diagnostics `check --json` (LSP shape) | supported | `check` has no --json | MISSING |
| multi-error cascades | one error per cause mostly | cascades seen (Z0104+Z0005, Z0005+Z0102, Z0114+Z0106 x2) | PARTIAL |

## Table D: CLI

The prototype dispatches 19 commands (compiler/src/cli.ts). next/src/main.cpp dispatches `run`, `build`, `check`, `flash`, `lex`, `parse`, `ir`, `zbc`, `explain`, `bake`, `toolchain`, `update`, `profile`, `mem`, `device-sim` and `--emit=...`, with fixed argument shapes (no general option parser: `zinc check f.ts` and `zinc run f.ts --headless` print the usage line).

| command / flag | prototype evidence | next | note |
|---|---|---|---|
| zinc run <file> [-- args] | cli.ts run | PASS | `zinc run f.ts -- a b` works; AOT/interpreter by default |
| zinc run --engine quickjs | cli.ts --engine | PASS | plain JS/TS-stripped on QuickJS-ng; same Zinc parser, so Zinc-only syntax errors are shared; web globals and Intl missing there too |
| zinc run --engine zinc-vm / --jit / --vm-tier | cli.ts | MISSING | "unknown engine zinc-vm (quickjs)"; interpreter is the default engine, no tier flags |
| zinc run (no entry, zinc.json project) | cli.ts discover() | MISSING | prints usage; src never reads zinc.json (name, assets, requires, targets) |
| zinc run --headless / --profile / --debug / --release / --no-dyn / --dev | cli.ts flags | MISSING | usage error; only `--strict` (Z1006) and env vars ZINC_HEADLESS etc |
| zinc run --target sim\|macos\|linux\|wasm\|rpi1 | cli.ts targets | MISSING | "--target sim runs through `zinc build --target`; `run` supports esp32" |
| zinc run --target esp32 [--port\|--device\|--qemu] | cli.ts espBuild | PASS | main.cpp:228; ESP32 core firmware, no host modules there |
| zinc build <file> -o out | cli.ts build | PASS | native executable, AOT through C++ (`zinc build f.ts -o out` then `./out`) |
| zinc build [entry] (project, no -o) | cli.ts build | MISSING | usage error |
| zinc build --target <t> -o out | cli.ts build --target | PARTIAL | targets: aarch64-linux, armhf-linux, x86_64-linux, aarch64-macos, x86_64-macos (zig). No wasm, rpi1 (ARMv6), rmpp profile, ps1, ps2, docker builds |
| --emit=cpp | cli.ts --emit=cpp | PASS | `zinc --emit=cpp f.ts` |
| --emit=hir\|mir | cli.ts --emit | PASS | replaced by `--emit=ir\|ir-rc\|zbc\|zbc-bin` (typed SSA IR) |
| --emit=js (sim) | cli.ts --emit=js | MISSING | no JS back end; QuickJS strips types instead |
| zinc check [entry] | cli.ts check | PARTIAL | `zinc check --check\|--types <file>`; bare `zinc check f.ts` prints usage |
| zinc check --json | cli.ts check --json | MISSING | no JSON/LSP output |
| zinc infer <entry> [--write] | cli.ts infer | MISSING | no command; Dyn exists, `.js` entry runs directly (PASS: `zinc run j.js`) |
| zinc dev (hot reload, red box, inspector) | cli.ts dev | MISSING | no command |
| zinc test [--target --profile --update --pixels --fuzz] | cli.ts test | MISSING | tests are shell tiers (next/tests/t0..t2, TESTING.md); conformance 22/41 .ts programs pass (below) |
| zinc bench / test --bench | cli.ts bench | MISSING | next/tools/bench-m4 script only |
| zinc compat (WPT, test262, node api) | cli.ts compat | MISSING | tests/compat/run.mjs drives the prototype only |
| zinc capture [--frames --every --out --replay] | cli.ts capture | MISSING | no command; headless frames via ZINC_* env vars and goldens |
| zinc export / deploy (dist, ssh) | cli.ts export,deploy | MISSING | next/tools/package and appimage scripts only |
| zinc flash --target esp32 [--port] | cli.ts flash | PASS | main.cpp:268, core firmware image |
| zinc monitor (telemetry / serial) | cli.ts monitor | MISSING | no command and no zinc:telemetry |
| zinc init <dir> [--template] | cli.ts init | MISSING | no command |
| zinc plugins [project] | cli.ts plugins | MISSING | plugins resolved from plugin.json by modules.cpp, no listing command |
| zinc doctor | cli.ts doctor | MISSING | no command (`zinc toolchain install\|path\|targets\|sha256` exists, new) |
| zinc tsconfig | cli.ts tsconfig | MISSING | no command |
| zinc ui check\|code\|import\|pack\|serve | cli.ts ui | MISSING | no command |
| zinc help [topic] | cli.ts help | MISSING | prints a one-line usage that omits most commands |
| zinc --version | - | PASS | zinc-next 0.0.1 |
| zinc explain <code>, lex, parse, ir --check, zbc, bake, profile, mem, update, device-sim, toolchain | (new in next) | PASS | not in the prototype; all respond (explain Z0101 verified) |
| .js entry | cli.ts (infer in memory) | PASS | `zinc run j.js` prints 2 |
| package imports (npm: inferno, three, lodash) | cli.ts / compat shims | MISSING | Z0005 "package imports ('lodash')"; conformance three, inferno, pocket_hero blocked |

## Table E: host modules and std packages

| module / area | prototype evidence | next | note |
|---|---|---|---|
| zinc:sys (22 exports) | lib/modules.d.ts | PARTIAL | all exports resolve; exit(3) rc=3, args, env, write, writeErr, randomBytes, utf8 OK; `onStdin`, `onSignal`, `kill` are stubs (onStdin delivered nothing for piped input); `clock()` is the virtual clock (see RC-CLOCK) |
| zinc:fs (24 exports) | lib/modules.d.ts | PARTIAL | mkdtemp, write, copy, rename, readDir, stat verified; `watch`, `symlink`, `chmod` throw ENOSYS (docs/reports/zinc-next-hostmodules.md) |
| zinc:storage (4) | lib/modules.d.ts | PASS | get/set verified |
| zinc:os (17) | lib/modules.d.ts | PARTIAL | verified hostname; no network interfaces |
| zinc:assets (4) | lib/modules.d.ts | PASS | resolves; not exercised without an assets dir |
| zinc:net fetch/Headers/Response | lib/modules.d.ts | PARTIAL | `fetch('data:text/plain,hi')` resolves status 0 (prototype handles data: itself); Response.text() only; needs curl |
| zinc:net serve/stop/Request/Reply | lib/modules.d.ts | MISSING | not exported (4 of 8 exports missing) |
| zinc:osc (4) | lib/modules.d.ts | MISSING | Z0119 Cannot find module |
| zinc:mqtt (1) | lib/modules.d.ts | MISSING | Z0119 |
| zinc:telemetry (6) | lib/modules.d.ts | MISSING | Z0119 |
| zinc:gpio (6) | lib/modules.d.ts | MISSING | Z0119 (ESP32 core and Pi are targets) |
| zinc:events Emitter | lib/modules.d.ts | MISSING | Z0119 |
| zinc:native requireNative | lib/modules.d.ts | PARTIAL | imports; throws at run time by design (native C++ of plugins not linked); plugins with *.next.ts sims only |
| zinc:platform (HEAP_BYTES, TOUCH...) | docs/guide/03; targets/capabilities.md | MISSING | Z0119 |
| zinc:web (URL, fetch, TextEncoder, crypto, ... compiler auto-import `webGlobals`) | docs/guide/09-web-apis.md | MISSING | no module and no auto-import; every web global is "Cannot find name" (RC-WEB). lib/std/web.ts (1.6k lines) checked directly in next: 35 diagnostics, three root causes |
| zinc:wasm (plugins/wasm) | docs/plugins/wasm.md | MISSING | plugin sim uses regex literals (Z0001 at wasm.sim.ts:10) |
| zinc:path (lib/std/path.ts) | lib/std/path.ts | PASS | join/basename verified; conformance path.ts PASS |
| zinc:signals | lib/std/signals.ts | PASS | conformance signals.ts PASS (my probe used wrong export names) |
| zinc:assert | lib/std/assert.ts | MISSING | assert.ts:7 Cannot find name never; JSON.stringify of T (Z0005) |
| zinc:ui, zinc:ui/react\|solid\|kit | lib/std/ui.ts | PARTIAL | ui.tsx, kit_* conformance pass (12 of 20 .tsx); see the UI parity report for the rest |
| Plugins canvas2d, 3d, script, ffi, socket, sqlite, wasm, three | plugins/* | MISSING | canvas2d: Z0109 field fillVal; 3d: enum form; script/ffi/hardening: non-null `!`; socket/wasm: regex literals; sqlite: import in sim |

## Table F: tests/conformance programs run on next

Each `.ts` and `.tsx` program run with `zinc run` and compared with its frozen `.out`.

| set | result |
|---|---|
| tests/conformance .ts programs (41) | 22 PASS (20 byte-identical + dyn, dyn_unknown differing only by the harness "[exit 101]" marker), 1 PARTIAL (clock_frames: frame dt 34.5 ms vs 33.3), 18 MISSING |
| .ts MISSING, by cause | web, fetch_web (RC-WEB + RC-AWAITPOS); os_info (RC-AWAITPOS); fs_ext, sys_process (RC-SELFREF); hardening, ffi, script_async, script_basic (RC-NONNULL); modules, modules_esp32 (RC-MODS); scene3d (`export const enum`, RC-SYNTAX); sqlite (`import.meta.url`, RC-SYNTAX); fetch, socket, wasm (regex literals in plugin sims, X-REGEX); canvas2d (Z0109 field fillVal = BLACK, RC-FIELDINFER); three (package imports) |
| tests/conformance .tsx programs (20) | 12 PASS, 4 PARTIAL (code_editor, kit_keyboard "bonJoe" vs "bonJoè", limits, scroll_physics: output differs), 4 MISSING (focus_keys RC-SELFREF, scroll VirtualList, inferno and pocket_hero package imports) |

## Method and limits

1. Enumerated the prototype from docs/guide/02-language.md, 09-web-apis.md, lib/zinc.d.ts, lib/modules.d.ts, lib/std/*.ts, compiler/src/cli.ts and tests/conformance.
2. Wrote one small program per feature (about 490), ran it on both toolchains with the same expected output, kept both verdicts in the row. Where my expected output was wrong (both toolchains agree and differ from my expectation) the row is PASS "same behaviour".
3. Grouped failures by root cause (table above). A row counts as MISSING when next rejects the program or crashes, PARTIAL when it compiles but prints something different.
4. Not covered here: UI components, graphics, plugins with native code, targets and packaging beyond the CLI surface, performance (other reports).
5. `--engine quickjs` runs the same Zinc parser/type stripper, so every Zinc-only syntax error also appears there; it does give real BigInt, typed arrays, Object statics, Symbol, for-in, rest/spread and Date.toISOString (verified), but no web globals and no Intl.
