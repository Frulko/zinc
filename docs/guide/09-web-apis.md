# 9. Web platform APIs

Zinc programs can use the Web APIs that server-side JavaScript runtimes share. The checklist is Ecma TC55's
[Minimum Common Web API](https://min-common-api.proposal.wintertc.org/) (WinterTC). The APIs are **globals**:

```ts
async function main(): Promise<void> {
  const u = new URL('/api/items?page=2', 'https://example.com');
  const res = await fetch(u, { headers: [['Accept', 'application/json']], signal: AbortSignal.timeout(5000) });
  const bytes = new TextEncoder().encode(await res.text());
  console.log(u.searchParams.get('page'), bytes.length, btoa('zinc'), crypto.randomUUID());
}
main();
```

The APIs are written in Zinc, in [`lib/std/web.ts`](../../lib/std/web.ts) and
[`lib/std/fetch.ts`](../../lib/std/fetch.ts). `WebAssembly` comes from [`plugins/wasm`](../plugins/wasm.md).

When a source file uses one of these names without declaring or importing it, the compiler appends
`import { … } from 'zinc:web'` to it (`compiler/src/frontend.ts`, `webGlobals`). So:

- a program that never names a Web API does not link it;
- the sim runs the same Zinc code as the native build.

You can also import the names explicitly. That also works for the helpers that are not globals: `base64Encode`,
`base64Decode`, `sha256`, `sha1`, `sha384`, `sha512` and `toHex`.

## What is there

| API | Global(s) | Notes |
|---|---|---|
| URL Standard | `URL`, `URLSearchParams` | See below. |
| Encoding | `TextEncoder`, `TextDecoder` | Supports `encodeInto`, `fatal`, `ignoreBOM` and `{stream: true}`. UTF-8 only: any other label throws `RangeError`. |
| Base64 | `atob`, `btoa` | Forgiving-base64. Errors are a `DOMException` `InvalidCharacterError`. |
| DOM events | `Event`, `EventTarget`, `CustomEvent`, `ErrorEvent`, `MessageEvent`, `PromiseRejectionEvent` | Listener options `once`, `passive`, `signal` and `capture`. Listener exceptions go to `reportError` and the next listener still runs. Re-dispatching an event that is being dispatched throws `InvalidStateError`. |
| Aborting | `AbortController`, `AbortSignal` | `abort(reason)`, `reason`, `throwIfAborted`, `AbortSignal.abort`, `timeout` (a `TimeoutError`) and `any`. |
| WebIDL | `DOMException` | Has `name`, `message` and the legacy `code`, plus the constants. |
| Channel messaging | `MessageChannel`, `MessagePort` | Messages are delivered as tasks once the port is started. |
| File API, XHR | `Blob`, `File`, `FormData` | `Blob.fromBytes` wraps a `u8[]`. `FormData` serializes to `multipart/form-data`. |
| Fetch | `fetch`, `Request`, `Response`, `Headers` | Details below. |
| Web Crypto | `crypto`, `Crypto`, `SubtleCrypto`, `CryptoKey` | `getRandomValues` and `randomUUID` use OS entropy. `subtle.digest` supports SHA-1, SHA-256, SHA-384 and SHA-512. |
| HTML | `structuredClone`, `reportError`, `navigator.userAgent`, `queueMicrotask`, timers, `console`, `performance.now()` | Timers, `queueMicrotask`, `console` and `performance` existed before. |
| ECMAScript | `encodeURIComponent`, `decodeURIComponent`, `encodeURI`, `decodeURI` | `decode*` throws a `URIError` on a malformed escape. |
| WebAssembly | `WebAssembly` (`validate`, `compile`, `instantiate`); `Module`, `Instance`, `Imports` from `zinc:wasm` | Runs on wasm3 natively. See [plugins/wasm](../plugins/wasm.md). |

### URL

`URL` is a port of the WHATWG basic URL parser. It handles:

- special and opaque schemes, relative references, and dot segments;
- IPv4 in all its number forms, and IPv6 with compression;
- percent-encode sets, Punycode, and the host parts of UTS #46 that URLs meet: ignored code points, fullwidth forms
  and ideographic full stops.

Checked against the web-platform-tests data (the other WPT runs belong to the compatibility harness):

| WPT data | Passes | Where the gap is |
|---|---|---|
| `url/resources/urltestdata.json` | 896 / 896 | |
| `url/resources/setters_tests.json` | 278 / 278 | |
| `url/resources/toascii.json` | 59 / 87 | IDNA validity rules (bidi, CONTEXTJ, NFC) |

`URLSearchParams.get` returns `null` when the name is absent, as on the Web.

### Fetch

- **Local schemes.** `fetch()` handles `http(s):` through `zinc:net`: libcurl on hosts, `esp_http_client` on the
  ESP32. It handles `data:` URLs itself.
- **Bodies.** A body can be a `string`, `Blob`, `URLSearchParams` or `FormData`. It is read with `text()`, `bytes()`,
  `arrayBuffer()` (the same `u8[]`), `json()`, `blob()` or `formData()` (urlencoded only).
- **Request semantics** follow the Fetch Standard:
  - method normalization, and forbidden methods;
  - no body on `GET` or `HEAD`;
  - `bodyUsed`, and `clone()`;
  - a `Request` built from another one takes over its body.
- **Response helpers.** `Response.error()`, `Response.redirect()` and `Response.json()` are supported. Status and
  `statusText` are validated with the standard errors.
- **Headers.** Names are validated, values normalized, iteration is sorted and combined, and `getSetCookie()` is
  available.
- **Limits.** Every request has a timeout: 120 s by default, and 30 s at most to connect. Set `timeoutMs` in
  `RequestInit` to change it. A response body larger than `maxBytes` (default: a quarter of the heap, at most 64 MiB)
  rejects with `TypeError: fetch failed: response too large` instead of exhausting the heap. Both options are Zinc
  extensions.

## How it differs from a browser

- **Bytes are `u8[]`.** Zinc has no `ArrayBuffer` or typed arrays. `encode()`, `digest()`, `bytes()` and
  `getRandomValues()` take or return `u8[]`.
- **Iteration methods return arrays.** Zinc classes are not iterable, so `keys()`, `values()` and `entries()` return
  arrays: `for (const [k, v] of params.entries())`.
- **Union arguments are typed `unknown`.** A WebIDL union argument (`Headers` init, a body, `FormData` values, an
  `abort()` reason) is `unknown`. The API narrows it with `typeof` / `instanceof`, and values you read back
  (`FormData.get`, `MessageEvent.data`) must be narrowed the same way. A `u8[]` cannot travel as `unknown`: wrap bytes
  in `Blob.fromBytes(bytes)`.
- **Things a server runtime does not have.**
  - no global `self` / `onerror` (Zinc has no `globalThis`);
  - `fetch` sends no `Origin` and does no CORS;
  - redirects are always followed;
  - `Response.body` is not a stream;
  - aborting settles the promise, but the transfer finishes in the background.
- **`structuredClone` goes through JSON.** It copies plain data and turns class instances into plain objects. `Map`,
  `Set`, `Date`, cycles and `undefined` members are not cloned, where the Web would clone them or throw
  `DataCloneError`.
- **Missing.** From the minimum common list:
  - Streams: `ReadableStream` and the other 12 interfaces, and `TextEncoderStream` / `TextDecoderStream`;
  - `CompressionStream` / `DecompressionStream`;
  - `URLPattern`;
  - `CryptoKey` operations (import, sign, encrypt);
  - `performance.timeOrigin`, `mark` and `measure`;
  - `WebAssembly.Table`, `Tag`, `Exception` and `JSTag`.

  The parity report lists them with effort estimates: [txiki-elsa-parity](../reports/txiki-elsa-parity.md).

## Checking against Node

`web.ts`, `fetch_web.ts` and `path.ts` in `tests/conformance/` run unchanged on Node 24, whose Web APIs are
spec-conformant. Only typed arrays need to stand in for `u8[]`, through a small shim. Their output matches Node's
except where this chapter documents a deviation:

- arrays instead of iterators;
- `InvalidStateError` where Node throws its own `ERR_EVENT_RECURSION`.

Next: back to the [guide index](README.md).
