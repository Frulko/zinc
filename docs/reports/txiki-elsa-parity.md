# Parity with txiki.js and Elsa (2026-09-28)

[txiki.js](https://github.com/saghul/txiki.js) and [Elsa](https://github.com/elsaland/elsa) are small JavaScript
runtimes built on QuickJS. This report lists every API they offer and marks, for each one:

- whether it belongs to Ecma TC55's [Minimum Common Web API](https://min-common-api.proposal.wintertc.org/) (WinterTC,
  2025 snapshot);
- its status in Zinc and its Zinc equivalent.

Zinc compiles TypeScript to C++ and has no JS engine, so a few rows cannot apply.

The inventory was taken from the sources:

- **txiki.js**: `master` @ `8f14257` (2026-09-14). `types/src/*.d.ts`, `src/js/**` and `website/docs/**`.
- **Elsa**: `master` @ `1982c3d` (2022-11-29). `js/*.js`, `core/ops/*.go` and `cmd/`. Elsa is dormant.

**Status**

- **exists**: in Zinc before this work.
- **added**: added by this work.
- **partial**: available with documented gaps, whether it existed or was added.
- **missing**: not in Zinc.
- **n/a**: needs a JS engine.

The `WinterTC` column marks the rows of the minimum common API. Those rows came first. In the columns for txiki and
Elsa, ✓ means supported, ~ partly, and – absent.

## Summary

| Rows | exists | added | partial | missing | n/a | total |
|---|---|---|---|---|---|---|
| WinterTC minimum common API | 3 | 21 | 12 | 9 | 0 | 45 |
| Other Web APIs (txiki / Elsa globals) | 0 | 2 | 4 | 7 | 0 | 13 |
| `tjs` namespace and Elsa ops | 7 | 29 | 9 | 13 | 2 | 60 |
| Standard library modules (`tjs:*`, Elsa `std/`) | 0 | 3 | 4 | 7 | 0 | 14 |
| CLI | 5 | 1 | 2 | 3 | 3 | 14 |
| **All** | **15** | **56** | **31** | **39** | **5** | **146** |

A row is one line of the tables below. Some lines group several interfaces: the 13 stream classes, the 4 timer
functions and the 3 global error hooks are one row each.

- **Before this work**, 15 rows existed in Zinc.
- **Now**, 102 do: 15 existed, 56 were added and 31 are partial. Some partial rows existed before (`console`,
  `performance`, `zinc:storage`, `zinc:events`, `zinc:net serve`).
- **Not covered**: 39 rows are missing and 5 cannot apply.
- **Of the 45 WinterTC rows**, 36 are covered (3 existed, 21 added, 12 partial). The 9 missing ones are:
  - streams;
  - compression streams;
  - the text streams;
  - `URLPattern`;
  - the WebAssembly `Table`, `Tag` / `Exception` and streaming functions;
  - `globalThis` / `self`;
  - the global error hooks.

The Zinc side is covered by conformance programs in `tests/conformance/`: `web`, `fetch_web`, `fetch`, `socket`,
`sys_process`, `fs_ext`, `os_info`, `path`, `sqlite`, `ffi` and `wasm`. Each one prints the same bytes on the sim and
natively (macos; ps1 and esp32 profiles where the capabilities allow). The Web API rows are also checked against Node
24 and against WPT data; see [the Web APIs chapter](../guide/09-web-apis.md).

## 1. WinterTC minimum common API

| API | txiki | Elsa | WinterTC | Zinc | Zinc equivalent / notes |
|---|---|---|---|---|---|
| `AbortController`, `AbortSignal` (`abort`, `timeout`, `any`, `reason`, `throwIfAborted`) | ✓ | – | ✓ | added | global (`lib/std/web.ts`) |
| `Event` | ✓ | – | ✓ | added | global; options, phases, `preventDefault` / passive, `composedPath` |
| `EventTarget` | ✓ | – | ✓ | added | global; `once` / `passive` / `signal` / `capture`, exceptions to `reportError` |
| `CustomEvent` | ✓ | – | ✓ | added | global, `CustomEvent<T>` with `{ detail }` |
| `ErrorEvent` | ✓ | – | ✓ | added | global |
| `MessageChannel`, `MessagePort` | ✓ | – | ✓ | partial | global; same thread, no transfer list, no structured clone of the data |
| `MessageEvent` | ✓ | – | ✓ | added | global (`data: unknown`) |
| `PromiseRejectionEvent` | ✓ | – | ✓ | partial | the class exists, but the runtime does not fire `unhandledrejection` (it reports and exits) |
| `DOMException` | ✓ | – | ✓ | added | global, names, legacy `code` and constants |
| `Headers` | ✓ | – | ✓ | added | global (`lib/std/fetch.ts`): validation, sort-and-combine, `getSetCookie` |
| `Request` | ✓ | – | ✓ | added | global; method normalization, body rules, `clone`, body transfer |
| `Response` | ✓ | – | ✓ | partial | global; `error` / `redirect` / `json`; no `body` stream |
| `FormData` | ✓ | – | ✓ | partial | global; multipart serialize, urlencoded parse (no multipart parse) |
| `Blob` | ✓ | – | ✓ | partial | global; `text` / `bytes` / `arrayBuffer` / `slice`; no `stream()` |
| `File` | ✓ | – | ✓ | added | global |
| `CompressionStream`, `DecompressionStream` | ✓ | – | ✓ | missing | needs streams + zlib (≈2 d: miniz as a plugin) |
| `ReadableStream`, `WritableStream`, `TransformStream` + 10 controller / reader / strategy classes | ✓ (polyfill) | – | ✓ | missing | ≈1–2 weeks: a Zinc port of the reference implementation, then `Response.body`, `Blob.stream`, text streams |
| `TextEncoder` | ✓ | ✓ | ✓ | added | global; `encode`, `encodeInto` |
| `TextDecoder` | ✓ | ✓ | ✓ | partial | global; UTF-8 only (all its labels), `fatal`, `ignoreBOM`, `stream`; other encodings missing (≈1 d for UTF-16 + windows-1252) |
| `TextEncoderStream`, `TextDecoderStream` | ✓ | – | ✓ | missing | after streams (≈0.5 d) |
| `URL` | ✓ | – | ✓ | added | global; WHATWG parser, WPT urltestdata 896/896, setters 278/278 |
| `URLSearchParams` | ✓ | – | ✓ | added | global; `keys()` / `values()` / `entries()` return arrays |
| `URLPattern` | ✓ | – | ✓ | missing | ≈3 d (needs a small regex engine: Zinc has no regex) |
| `Crypto` / `crypto` | ✓ | – | ✓ | added | global; `getRandomValues` (OS entropy), `randomUUID` |
| `SubtleCrypto` | ✓ (all) | – | ✓ | partial | `digest` SHA-1 / 256 / 384 / 512 in Zinc; no keys, sign, encrypt (≈1 week with a vetted C library, e.g. Monocypher + BearSSL) |
| `CryptoKey` | ✓ | – | ✓ | partial | the class only |
| `Performance` / `performance` | ✓ | – | ✓ | partial | `now()` existed; `timeOrigin`, `mark`, `measure` missing (≈0.5 d) |
| `WebAssembly.Module`, `Instance` | ✓ (WAMR) | – | ✓ | added | `zinc:wasm` on wasm3 (plugin), `WebAssembly` global |
| `WebAssembly.Memory` | ✓ | – | ✓ | partial | exported memory `read` / `write` / `byteLength`; no `grow`, no imported memory |
| `WebAssembly.Global` | ✓ | – | ✓ | partial | read exported globals only |
| `WebAssembly.Table` | ✓ | – | ✓ | missing | ≈1 d over wasm3 internals |
| `WebAssembly.Tag`, `Exception`, `JSTag` | ~ | – | ✓ | missing | wasm3 has no exception handling |
| `WebAssembly.CompileError`, `LinkError`, `RuntimeError` | ✓ | – | ✓ | added | from `zinc:wasm` |
| `WebAssembly.compile`, `instantiate`, `validate` | ✓ | – | ✓ | added | `WebAssembly` global |
| `WebAssembly.compileStreaming`, `instantiateStreaming` | ✓ | – | ✓ | missing | after streams; `instantiate(await res.bytes())` works |
| `atob`, `btoa` | ✓ | ~ | ✓ | added | global, forgiving-base64 |
| `setTimeout` / `clearTimeout` / `setInterval` / `clearInterval` | ✓ | – | ✓ | exists | deterministic virtual clock in tests |
| `queueMicrotask` | ✓ | – | ✓ | exists | |
| `console` | ✓ | ~ | ✓ | exists | log / info / debug / warn / error / trace / time / count / assert / table; `group`, `dir`, `countReset` missing |
| `structuredClone` | ✓ | – | ✓ | partial | global; plain data through JSON |
| `reportError` | – | – | ✓ | added | global; prints `Uncaught …` and goes on |
| `navigator.userAgent` | ✓ | – | ✓ | added | global `navigator` |
| `fetch()` | ✓ | ~ (GET text) | ✓ | added | global; http(s) through libcurl / esp_http_client, `data:`, abort, timeout |
| `globalThis`, `self` | ✓ | ✓ (`window`) | ✓ | missing | Zinc rejects `globalThis` (Z1015): no dynamic global object |
| `onerror`, `onunhandledrejection`, `onrejectionhandled` | ✓ | – | ✓ | missing | the runtime reports uncaught errors and exits (crash policy); a hook is ≈1 d |

## 2. Other Web APIs (globals in txiki or Elsa, outside the WinterTC list)

| API | txiki | Elsa | Zinc | Zinc equivalent / notes |
|---|---|---|---|---|
| `WebSocket` client | ✓ | – | added | `zinc:socket` `WebSocket` (not a global; `ws://` only, no TLS) |
| WebSocket server (`tjs.serve` websocket) | ✓ | – | added | `zinc:socket` `serveWebSocket` |
| `WebSocketStream` | ✓ | – | missing | after streams |
| `EventSource` | ✓ | – | missing | ≈0.5 d over fetch once bodies stream |
| `XMLHttpRequest` | ✓ | – | missing | legacy; fetch covers it |
| Direct Sockets `TCPSocket`, `TCPServerSocket`, `UDPSocket`, `PipeSocket` | ✓ | – | partial | `zinc:socket` (callback API rather than streams) |
| `TLSSocket`, `TLSServerSocket` | ✓ | – | missing | needs a TLS library (≈3 d with mbedTLS) |
| `Worker`, `BroadcastChannel` | ✓ | – | missing | the runtime has threads natively; a message-passing Worker ≈1 week |
| `localStorage` | ✓ | – | partial | `zinc:storage` (`get` / `set` / `remove` / `keys`, persisted; NVS on esp32) |
| `sessionStorage` | ✓ | – | missing | a Map does it |
| `FileReader` | ✓ | – | missing | legacy; `Blob.text()` / `bytes()` |
| `encodeURIComponent` / `decodeURIComponent` / `encodeURI` / `decodeURI` | ✓ | ✓ | partial | globals from `zinc:web` (ECMAScript, missing from Zinc's lib before) |
| `EventEmitter` (Elsa) | – | ✓ | partial | `zinc:events` `Emitter<T>` (typed, one channel) and `EventTarget` |

## 3. `tjs` namespace and Elsa ops

| API | txiki | Elsa | Zinc | Zinc equivalent / notes |
|---|---|---|---|---|
| `tjs.args` | ✓ | ✓ (`Elsa.args`) | exists | `sys.args()` |
| `tjs.exePath` | ✓ | – | missing | ≈1 h (`_NSGetExecutablePath` / `/proc/self/exe`) |
| `tjs.version`, `engine.versions` | ✓ | – | missing | ≈1 h |
| `tjs.pid` | ✓ | – | added | `sys.pid()` |
| `tjs.ppid` | ✓ | – | missing | ≈15 min |
| `tjs.exit` | ✓ | – | exists | `sys.exit(code)` |
| `tjs.cwd`, `tjs.chdir` | ✓ | ✓ (`Elsa.cwd`) | added | `sys.cwd()`, `sys.chdir()` |
| `tjs.env` (get / set / delete / keys) | ✓ | ✓ (`Elsa.env`) | added | `sys.env`, `setEnv`, `unsetEnv`, `envKeys` |
| `tjs.hostName` | ✓ | – | added | `os.hostname()` |
| `tjs.homeDir`, `tjs.tmpDir` | ✓ | – | added | `os.homedir()`, `os.tmpdir()` / `fs.tmpdir()` |
| `tjs.kill(pid, sig)` | ✓ | – | added | `sys.kill(pid, 'SIGTERM')` |
| `tjs.addSignalListener` | ✓ | – | added | `sys.onSignal('SIGTERM', cb)` on the event loop |
| `tjs.removeSignalListener` | ✓ | – | missing | ≈15 min |
| `tjs.spawn` with stdin / stdout / stderr pipes | ✓ | – | exists | `zinc:process` `spawn` / `run` (plugin) |
| spawn stdio `inherit` / `ignore`, `uid` / `gid` | ✓ | – | partial | always piped |
| `Process.wait()` / exit status / term signal, `kill` | ✓ | – | exists | `p.exited`, `p.code` (128 + signal), `p.kill()` |
| `tjs.exec` (execvp) | ✓ | – | missing | ≈30 min |
| `tjs.system.cpus` | ✓ | – | added | `os.cpus()`, `os.availableParallelism()` |
| `tjs.system.loadAvg` | ✓ | – | added | `os.loadavg()` |
| `tjs.system.uptime` | ✓ | – | added | `os.uptime()` |
| `tjs.system.networkInterfaces` | ✓ | – | added | `os.networkInterfaces()` |
| `tjs.system.userInfo` | ✓ | – | added | `os.userInfo()` |
| memory totals (not in txiki) | – | – | added | `os.totalmem()`, `os.freemem()`, plus `arch`, `type`, `release` |
| `tjs.stdin` | ✓ | – | partial | `sys.onStdin(cb)` (chunks); no stream, no raw mode |
| `tjs.stdout`, `tjs.stderr` | ✓ | – | added | `sys.write`, `sys.writeErr` (and `console`) |
| `isTerminal` | ✓ | – | added | `sys.isatty(fd)` |
| `setRawMode`, terminal width / height | ✓ | – | missing | ≈0.5 d (termios, TIOCGWINSZ) |
| `tjs.open` → `FileHandle` (read / write at offsets, truncate, sync, stat) | ✓ | – | missing | whole-file functions only; ≈1 d |
| `tjs.readFile` | ✓ | ✓ | exists | `fs.readText` / `fs.readBytes` (added) |
| `tjs.writeFile` | ✓ | ✓ | exists | `fs.writeText` / `fs.writeBytes` (added), `appendText` |
| `tjs.stat`, `tjs.lstat` | ✓ | ✓ (`Elsa.stat`) | added | `fs.stat`, `fs.lstat` |
| `tjs.statFs` | ✓ | – | missing | ≈30 min |
| `tjs.readDir` | ✓ | – | added | `fs.readDir` (with types), `fs.list` |
| `Elsa.walk` | – | ✓ | partial | recurse over `fs.readDir` |
| `tjs.makeDir` (recursive) | ✓ | ✓ | added | `fs.mkdir(path, true)` |
| `tjs.makeTempDir` | ✓ | – | added | `fs.mkdtemp(prefix)` |
| `tjs.makeTempFile` | ✓ | – | missing | ≈30 min |
| `tjs.remove` (recursive) | ✓ | ✓ | added | `fs.remove(path, true)` |
| `tjs.rename`, `tjs.copyFile` | ✓ | – | added | `fs.rename`, `fs.copyFile` |
| `tjs.realPath`, `tjs.readLink`, `tjs.symlink` | ✓ | – | added | `fs.realpath`, `fs.readlink`, `fs.symlink` |
| `tjs.link` | ✓ | – | missing | ≈15 min |
| `tjs.chmod` | ✓ | – | added | `fs.chmod` |
| `tjs.chown`, `lchown`, `utime`, `lutime` | ✓ | – | missing | ≈1 h |
| `tjs.watch` | ✓ | – | added | `fs.watch` / `unwatch` (polling every 100 ms; FSEvents / inotify ≈1 d) |
| `Elsa.exists` | – | ✓ | exists | `fs.exists` |
| `tjs.lookup` (DNS) | ✓ | – | added | `zinc:socket` `lookup(host)` |
| `tjs.connect('tcp' \| 'pipe')` | ✓ | – | added | `zinc:socket` `connect`, `connectUnix` |
| `tjs.connect('udp')` / `listen('udp')` | ✓ | – | added | `zinc:socket` `udp()` |
| `tjs.listen('tcp' \| 'pipe')` | ✓ | – | added | `zinc:socket` `listen`, `listenUnix` |
| `tjs.connect('tls')` / `listen('tls')` | ✓ | – | missing | needs a TLS library (see §2) |
| `tjs.serve` (fetch-handler HTTP server) | ✓ | ✓ (`Elsa.serve`) | partial | `zinc:net` `serve(port, handler)`: Request / Reply records with headers (added); not `Request` → `Response` objects, no HTTP/2 or TLS |
| `Elsa.runPlugin` (Go `.so`) | – | ✓ | partial | native plugins are compiled in (`plugins/`); runtime loading through `zinc:ffi` |
| `tjs.engine.compile` / `serialize` / `evalBytecode` / `gc` | ✓ | – | n/a | no JS engine (AOT C++) |
| `tjs.setImportMap` | ✓ | – | n/a | modules are resolved at compile time |
| `tjs.createConsole` | ✓ | – | missing | ≈0.5 d |
| `tjs.Error` (errno errors) | ✓ | – | partial | messages start with the errno code (`ENOENT: stat path`) |
| permissions (`--fs`, `--net`, `--env`) | – | ✓ | partial | compile-time capabilities (`requires`, Z5003 / Z5005) instead of run-time flags |
| `Elsa.mode` / tests registry | – | ✓ | added | `zinc test <dir>` (below) |
| HTTP/2 / HTTP/3 in fetch | ✓ | – | partial | libcurl negotiates HTTP/2 over TLS where built with nghttp2 |
| cookie jar, proxy variables | ✓ | – | partial | libcurl honours `*_proxy`; no cookie jar |

## 4. Standard library modules

| Module | txiki | Elsa | Zinc | Zinc equivalent / notes |
|---|---|---|---|---|
| `tjs:path` | ✓ | – | added | `zinc:path` (POSIX; the same results as Node's `path.posix`); no win32 flavour |
| `tjs:sqlite` | ✓ | – | added | `zinc:sqlite` plugin, bundled amalgamation 3.53.4 |
| `tjs:ffi` | ✓ | – | partial | `zinc:ffi` plugin: scalar and string signatures, memory helpers; no structs, callbacks or variadics (≈3 d with libffi) |
| `tjs:assert` | ✓ | – | added | `zinc:assert` |
| `tjs:hashing` (md5 … sha3) | ✓ | ✓ (`std/hash`) | partial | SHA-1 / 256 / 384 / 512 in `zinc:web`; md5, sha224, sha512/t, sha3 and HMAC missing (≈1 d) |
| `tjs:uuid` (v1–v7) | ✓ | ✓ (`std/uuid`) | partial | v4 via `crypto.randomUUID()`; v7 ≈1 h |
| `tjs:getopts` | ✓ | – | missing | ≈0.5 d |
| `tjs:ipaddr` | ✓ | – | missing | the URL host parser covers IPv4 / IPv6 parsing; CIDR helpers ≈1 d |
| `tjs:posix-socket` | ✓ | – | missing | raw sockets, ≈1 d over the socket plugin |
| `tjs:readline` | ✓ | – | missing | line editing, history, colours: ≈2 d (needs raw mode) |
| `tjs:utils` (`inspect`, `format`) | ✓ | – | partial | `console` formats like Node's `inspect`, but it is not exposed as a function (≈1 h) |
| `tjs:wasi` | ✓ | – | missing | wasm3's WASI layer as an option of the wasm plugin (≈1 d) |
| Elsa `std/encoding/hex`, `std/bytes` | – | ✓ | missing | `toHex` exists in `zinc:web`; the rest ≈0.5 d |
| Elsa `std/fmt/colors` | – | ✓ | missing | ≈1 h |

## 5. CLI

| Command | txiki | Elsa | Zinc | Zinc equivalent / notes |
|---|---|---|---|---|
| run a program | ✓ `tjs run` | ✓ `elsa run` | exists | `zinc run` (native or `--target sim`) |
| type-check | – | ✓ `elsa dev` | exists | `zinc check` (TypeScript + Zinc rules) |
| test runner | ✓ `tjs test` | ✓ `elsa test` | added | `zinc test <dir>`: every `test-*.ts` / `*.test.ts`, pass = exit 0, with `zinc:assert` |
| bundle | ✓ `tjs bundle` | ✓ `elsa bundle` | n/a | whole-program compilation replaces bundling |
| standalone executable | ✓ `tjs compile` | ✓ `elsa pkg` | exists | every `zinc build` is a native executable; `zinc export` packages it with assets |
| app packages | ✓ `tjs app` | – | exists | `zinc export` / `zinc deploy` |
| `eval` of an expression | ✓ | – | n/a | no engine; `zinc run` of a file |
| REPL | ✓ | ✓ | missing | a compile-per-line REPL on the sim target is possible (≈3 d); a native REPL needs an interpreter (see `docs/reports` VM design) |
| `tjs serve FILE` | ✓ | – | missing | ≈0.5 d (a server template calling `zinc:net serve`) |
| `elsa install` (shims in `~/.elsa`) | – | ✓ | missing | ≈1 h |
| dev mode | – | ✓ `elsa dev` | exists | `zinc dev` (hot reload, red box, inspector) |
| TypeScript | ~ (stripped by esbuild) | ~ (esbuild) | partial | Zinc *is* typed TypeScript, a strict subset: no `eval`, regex or reflection (see chapter 2) |
| import maps / URL imports | ✓ | ✓ | n/a | compile-time module resolution only |
| `--memory-limit`, `--stack-size` | ✓ | – | partial | the heap is a fixed budget per profile (`zinc.json` `targets.<id>.heap`) |

## What remains, with estimates

Ordered by value for server-style programs:

1. **Streams**: `ReadableStream` / `WritableStream` / `TransformStream`, then streaming `Response.body` / `Request.body`,
   `Blob.stream()`, `TextEncoderStream` / `TextDecoderStream` and `WebSocketStream`. About 1–2 weeks. This is the
   biggest WinterTC gap.
2. **TLS** for sockets and `wss://`, through mbedTLS or the OS (SecureTransport is deprecated). About 3 days, plus
   certificates on embedded targets.
3. **`CompressionStream` / `DecompressionStream`** with miniz (MIT). About 2 days after streams.
4. **Web Crypto keys**: HMAC, AES-GCM, ECDSA / Ed25519, PBKDF2 / HKDF with a vetted library. About 1 week. HMAC and
   PBKDF2 alone take about 1 day in Zinc.
5. **Global error hooks**: `onerror` / `unhandledrejection` events before the crash policy. About 1 day.
6. **`FileHandle`** (positional I/O), `statFs`, `makeTempFile`, `link`, `chown`, `utime`. About 1.5 days.
7. **Terminal**: raw mode, window size, `tjs:readline`. About 2.5 days.
8. **Workers** with message passing on the existing native threads. About 1 week.
9. **FFI through libffi**: structs, callbacks, variadics. About 3 days.
10. **WebAssembly**: `Table`, `memory.grow`, WASI. About 2 days.
11. **`URLPattern`**, with a small regex engine. About 3 days.
12. **Small items**: `exePath`, `version`, `ppid`, `exec`, `removeSignalListener`, uuid v7, getopts, colours, `serve`
    CLI, `console.group` / `dir`. About 2 days in all.

## Known compiler limits met on the way

Worked around in the new modules, not fixed:

- A generic method called with a lambda does not get its template argument deduced in C++ (`db.transaction<T>`).
- A throwing call inside an array spread or an object literal, in an async function, emits a `return;` inside a
  value-returning lambda.
- `await` inside call arguments is evaluated before the earlier arguments.
- Zinc classes cannot be iterable (`[Symbol.iterator]`), so `for…of` needs `entries()` arrays.
- Rest parameters are refused (Z9009), so `path.join` takes up to six segments.
- Printing an absent string (`null` / `undefined`) natively prints an empty string.

Fixed in the compiler and runtime by this work:

- `??` on nullable strings;
- a computed `''` being mistaken for `null`;
- integer literals in bitwise operators on the f32 / fx12 profiles;
- `JSON.stringify` calling `toJSON`;
- f64 literals and parameter defaults in the sim under fixed point;
- constructor `unknown[]` contexts;
- library `any` calls in the strict profile;
- the event loop exiting while a callback had just started work.
