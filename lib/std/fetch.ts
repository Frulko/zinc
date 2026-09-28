// zinc:web/fetch — the Fetch Standard's Headers, Request, Response and fetch() in Zinc, over zinc:net (libcurl on
// hosts, esp_http_client on esp32). Programs use them as globals (compiler/src/frontend.ts webGlobals).
// Deviations (docs/guide/09-web-apis.md): bodies are whole u8[] buffers (no ReadableStream `body`), a server runtime
// has no origin (no CORS, no Origin header, `mode` / `credentials` are informative), redirects are always followed,
// aborting settles the promise but lets the transfer finish in the background.
import * as net from 'zinc:net';
import { URL, URLSearchParams, AbortSignal, DOMException, Blob, FormData, Event, atob } from 'zinc:web';
import { utf8Encode, utf8Decode, randomBytes } from 'zinc:sys';

// ================================================================ Headers
function isToken(s: string): boolean {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ok = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || "!#$%&'*+-.^_`|~".includes(s.at(i));
    if (!ok) return false;
  }
  return true;
}
function httpWs(c: i32): boolean { return c === 9 || c === 10 || c === 13 || c === 32; }
function normalizeValue(v: string): string {
  let a: i32 = 0, b: i32 = v.length;
  while (a < b && httpWs(v.charCodeAt(a))) a++;
  while (b > a && httpWs(v.charCodeAt(b - 1))) b--;
  return a === 0 && b === v.length ? v : v.slice(a, b);
}
function checkValue(v: string): void {
  for (let i = 0; i < v.length; i++) { const c = v.charCodeAt(i); if (c === 0 || c === 10 || c === 13) throw new TypeError(`Invalid header value: ${JSON.stringify(v)}`); }
}
function byteString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return `${v}`;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  throw new TypeError('Header values must be strings');
}
/** Fetch Headers: names are case-insensitive; iteration is sorted by lowercase name, values combined with ', '
 *  (except set-cookie). Init: another Headers or [name, value] pairs. @throws TypeError on an invalid name / value */
export class Headers {
  private ns: string[] = [];
  private vs: string[] = [];
  immutable: boolean = false;
  constructor(init: unknown = undefined) {
    if (init === undefined || init === null) return;
    if (init instanceof Headers) { this.ns = init.ns.slice(); this.vs = init.vs.slice(); return; }
    if (Array.isArray(init)) {
      for (const pair of init) {
        if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError('Headers init pairs must be [name, value]');
        this.append(byteString(pair[0]), byteString(pair[1]));
      }
      return;
    }
    throw new TypeError('Headers init must be a Headers or a list of [name, value] pairs');
  }
  private check(name: string): void {
    if (!isToken(name)) throw new TypeError(`Invalid header name: ${JSON.stringify(name)}`);
    if (this.immutable) throw new TypeError('Headers are immutable');
  }
  append(name: string, value: string): void {
    const v = normalizeValue(value);
    this.check(name);
    checkValue(v);
    this.ns.push(name); this.vs.push(v);
  }
  delete(name: string): void {
    this.check(name);
    const n = name.toLowerCase();
    for (let i = this.ns.length - 1; i >= 0; i--) if (this.ns[i].toLowerCase() === n) { this.ns.splice(i, 1); this.vs.splice(i, 1); }
  }
  /** Values combined with ', ', null when absent. */
  get(name: string): string | null {
    if (!isToken(name)) throw new TypeError(`Invalid header name: ${JSON.stringify(name)}`);
    const n = name.toLowerCase();
    const out: string[] = [];
    for (let i = 0; i < this.ns.length; i++) if (this.ns[i].toLowerCase() === n) out.push(this.vs[i]);
    return out.length === 0 ? null : out.join(', ');
  }
  getSetCookie(): string[] { const out: string[] = []; for (let i = 0; i < this.ns.length; i++) if (this.ns[i].toLowerCase() === 'set-cookie') out.push(this.vs[i]); return out; }
  has(name: string): boolean {
    if (!isToken(name)) throw new TypeError(`Invalid header name: ${JSON.stringify(name)}`);
    const n = name.toLowerCase();
    for (const x of this.ns) if (x.toLowerCase() === n) return true;
    return false;
  }
  set(name: string, value: string): void {
    const v = normalizeValue(value);
    this.check(name);
    checkValue(v);
    const n = name.toLowerCase();
    let found = false;
    for (let i = 0; i < this.ns.length; i++) {
      if (this.ns[i].toLowerCase() !== n) continue;
      if (!found) { this.vs[i] = v; found = true; } else { this.ns.splice(i, 1); this.vs.splice(i, 1); i--; }
    }
    if (!found) { this.ns.push(name); this.vs.push(v); }
  }
  /** Sort and combine (the Fetch "sort and combine" algorithm). */
  entries(): [string, string][] {
    const names: string[] = [];
    for (const x of this.ns) { const l = x.toLowerCase(); if (!names.includes(l)) names.push(l); }
    names.sort((a: string, b: string) => a < b ? -1 : a > b ? 1 : 0);
    const out: [string, string][] = [];
    for (const n of names) {
      if (n === 'set-cookie') { for (const v of this.getSetCookie()) out.push([n, v]); continue; }
      const v = this.get(n);
      out.push([n, v ?? '']);
    }
    return out;
  }
  keys(): string[] { const r: string[] = []; for (const [k, v] of this.entries()) r.push(k); return r; }
  values(): string[] { const r: string[] = []; for (const [k, v] of this.entries()) r.push(v); return r; }
  forEach(f: (value: string, name: string) => void): void { for (const [k, v] of this.entries()) f(v, k); }
  toNet(): net.Headers { const h = new net.Headers(); for (let i = 0; i < this.ns.length; i++) h.append(this.ns[i], this.vs[i]); return h; }
}

// ================================================================ bodies
class Extracted { bytes: u8[]; type: string; constructor(b: u8[], t: string) { this.bytes = b; this.type = t; } }
/** BodyInit: string, Blob / File, URLSearchParams, FormData or null. (Bytes: Blob.fromBytes.) */
function extractBody(body: unknown): Extracted | null {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string') return new Extracted(utf8Encode(body), 'text/plain;charset=UTF-8');
  if (body instanceof Blob) return new Extracted(body.data.slice(), body.type);
  if (body instanceof URLSearchParams) return new Extracted(utf8Encode(body.toString()), 'application/x-www-form-urlencoded;charset=UTF-8');
  if (body instanceof FormData) {
    const hex = '0123456789abcdef';
    let boundary = '----formdata-zinc-';
    for (const b of randomBytes(12)) { const v: i32 = b; boundary += hex.at(v >> 4) + hex.at(v & 15); }
    return new Extracted(body.multipart(boundary), `multipart/form-data; boundary=${boundary}`);
  }
  throw new TypeError('Unsupported body type (string, Blob, URLSearchParams or FormData)');
}
/** The Body mixin shared by Request and Response. */
export class Body {
  bodyBytes: u8[] | null = null;
  used: boolean = false;
  headersObj: Headers = new Headers();
  get bodyUsed(): boolean { return this.used; }
  protected consume(): u8[] {
    if (this.used) throw new TypeError('Body has already been consumed.');
    this.used = true;
    const b = this.bodyBytes;
    if (b === null) return [];
    return b;
  }
  async text(): Promise<string> { return utf8Decode(this.consume()); }
  async bytes(): Promise<u8[]> { return this.consume(); }
  /** Same as bytes() (no ArrayBuffer in Zinc). */
  async arrayBuffer(): Promise<u8[]> { return this.consume(); }
  async blob(): Promise<Blob> { const b = this.consume(); return Blob.fromBytes(b, this.headersObj.get('content-type') ?? ''); }
  /** The body as JSON (a Dyn tree; narrow it). Rejects with SyntaxError on invalid JSON. */
  json(): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      let s = '';
      try { s = utf8Decode(this.consume()); } catch (e) { reject(e); return; }
      try { const v: unknown = JSON.parse(s); resolve(v); } catch (e) { reject(new DOMException(e.message, 'SyntaxError')); }
    });
  }
  /** application/x-www-form-urlencoded bodies (multipart parsing is not implemented). */
  async formData(): Promise<FormData> {
    const type = (this.headersObj.get('content-type') ?? '').toLowerCase();
    const s = utf8Decode(this.consume());
    if (!type.startsWith('application/x-www-form-urlencoded')) throw new TypeError('formData(): only application/x-www-form-urlencoded bodies are supported');
    const fd = new FormData();
    for (const [k, v] of new URLSearchParams(s).entries()) fd.append(k, v);
    return fd;
  }
}

// ================================================================ Request
export interface RequestInit {
  method?: string;
  /** Headers or [name, value] pairs */
  headers?: unknown;
  /** string, Blob, URLSearchParams, FormData or null */
  body?: unknown;
  signal?: AbortSignal | null;
  redirect?: string;
  cache?: string;
  credentials?: string;
  mode?: string;
  referrer?: string;
  referrerPolicy?: string;
  integrity?: string;
  keepalive?: boolean;
  /** Zinc extension: give up after this many milliseconds (TypeError 'fetch failed: timeout'; default 120000). */
  timeoutMs?: i32;
  /** Zinc extension: the largest response body accepted (TypeError 'fetch failed: response too large'; default a
   *  quarter of the heap, at most 64 MiB). */
  maxBytes?: i32;
}
const METHODS = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT'];
export class Request extends Body {
  readonly method: string;
  readonly url: string;
  readonly signal: AbortSignal;
  readonly redirect: string;
  readonly cache: string;
  readonly credentials: string;
  readonly mode: string;
  readonly referrer: string;
  readonly referrerPolicy: string;
  readonly integrity: string;
  readonly keepalive: boolean;
  readonly destination: string = '';
  readonly timeoutMs: i32;
  readonly maxBytes: i32;
  /** input: a URL string, a URL or a Request. @throws TypeError (bad URL, method, or a body with GET / HEAD) */
  constructor(input: unknown, init: RequestInit = {}) {
    super();
    let base: Request | null = null;
    let url = '';
    if (input instanceof Request) { base = input; url = input.url; }
    else if (input instanceof URL) url = input.href;
    else if (typeof input === 'string') {
      const u = URL.parse(input);
      if (u === null) throw new TypeError(`Failed to parse URL from ${input}`);
      url = u.href;
    } else throw new TypeError('Request input must be a URL string, a URL or a Request');
    const parsed = new URL(url);
    if (parsed.username.length > 0 || parsed.password.length > 0) throw new TypeError(`Request cannot be constructed from a URL that includes credentials: ${url}`);
    let method = init.method ?? (base !== null ? base.method : 'GET');
    if (!isToken(method)) throw new TypeError(`'${method}' is not a valid HTTP method.`);
    const up = method.toUpperCase();
    if (up === 'CONNECT' || up === 'TRACE' || up === 'TRACK') throw new TypeError(`'${method}' HTTP method is unsupported.`);
    if (METHODS.includes(up)) method = up;
    this.method = method;
    this.url = url;
    const sig = init.signal;
    this.signal = sig !== undefined && sig !== null ? sig : base !== null ? base.signal : new AbortSignal();
    this.redirect = init.redirect ?? (base !== null ? base.redirect : 'follow');
    this.cache = init.cache ?? (base !== null ? base.cache : 'default');
    this.credentials = init.credentials ?? (base !== null ? base.credentials : 'same-origin');
    this.mode = init.mode ?? (base !== null ? base.mode : 'cors');
    this.referrer = init.referrer ?? 'about:client';
    this.referrerPolicy = init.referrerPolicy ?? '';
    this.integrity = init.integrity ?? '';
    this.keepalive = init.keepalive ?? false;
    this.timeoutMs = init.timeoutMs ?? (base !== null ? base.timeoutMs : 0);
    this.maxBytes = init.maxBytes ?? (base !== null ? base.maxBytes : 0);
    const hi = init.headers;
    this.headersObj = hi !== undefined ? new Headers(hi) : base !== null ? new Headers(base.headersObj) : new Headers();
    const bi = init.body;
    const hasBody = bi !== undefined && bi !== null;
    if (hasBody && (method === 'GET' || method === 'HEAD')) throw new TypeError('Request with GET/HEAD method cannot have body.');
    const ex = extractBody(bi);
    if (ex !== null) {
      this.bodyBytes = ex.bytes;
      if (ex.type.length > 0 && !this.headersObj.has('content-type')) this.headersObj.append('Content-Type', ex.type);
    } else if (base !== null && !hasBody) {
      if (base.used) throw new TypeError('Cannot construct a Request with a Request whose body has already been used.');
      this.bodyBytes = base.bodyBytes;
      if (base.bodyBytes !== null) base.used = true;  // the body moves to the new request (the input is disturbed)
    }
  }
  get headers(): Headers { return this.headersObj; }
  /** @throws TypeError when the body was used */
  clone(): Request {
    if (this.used) throw new TypeError('Request body is already used');
    const self: Request = this;
    const r = new Request(self);
    this.used = false;  // a clone tees the body: both stay readable
    return r;
  }
}

// ================================================================ Response
export interface ResponseInit { status?: i32; statusText?: string; headers?: unknown }
function reasonOk(s: string): boolean {
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c === 10 || c === 13 || c > 255) return false; }
  return true;
}
export class Response extends Body {
  private st: i32;
  readonly statusText: string;
  type: string = 'default';
  url: string = '';
  redirected: boolean = false;
  /** body: string, Blob, URLSearchParams, FormData or null. @throws RangeError on a status outside 200..599 */
  constructor(body: unknown = null, init: ResponseInit = {}) {
    super();
    const status = init.status ?? 200;
    if (status < 200 || status > 599) throw new RangeError(`The status provided (${status}) is outside the range [200, 599].`);
    const st = init.statusText ?? '';
    if (!reasonOk(st)) throw new TypeError('Invalid statusText');
    this.st = status;
    this.statusText = st;
    const hi = init.headers;
    this.headersObj = hi !== undefined ? new Headers(hi) : new Headers();
    const ex = extractBody(body);
    if (ex !== null) {
      if (status === 101 || status === 103 || status === 204 || status === 205 || status === 304) throw new TypeError(`Response with null body status (${status}) cannot have body`);
      this.bodyBytes = ex.bytes;
      if (ex.type.length > 0 && !this.headersObj.has('content-type')) this.headersObj.append('Content-Type', ex.type);
    }
  }
  get headers(): Headers { return this.headersObj; }
  /** The body as JSON (see Body.json; restated so that it overloads the static Response.json). */
  json(): Promise<unknown> { return super.json(); }
  get status(): i32 { return this.st; }
  get ok(): boolean { return this.st >= 200 && this.st <= 299; }
  clone(): Response {
    if (this.used) throw new TypeError('Response body is already used');
    const r = new Response(null, { status: 200, statusText: this.statusText, headers: this.headersObj });
    r.st = this.st;
    r.bodyBytes = this.bodyBytes;
    r.type = this.type; r.url = this.url; r.redirected = this.redirected;
    return r;
  }
  /** A network error: status 0, type 'error'. */
  static error(): Response {
    const r = new Response(null, { status: 200 });
    r.type = 'error';
    r.headersObj.immutable = true;
    r.st = 0;
    return r;
  }
  /** @throws RangeError unless status is 301, 302, 303, 307 or 308; TypeError on a bad URL */
  static redirect(url: string, status: i32 = 302): Response {
    const u = URL.parse(url);
    if (u === null) throw new TypeError(`Failed to parse URL from ${url}`);
    if (status !== 301 && status !== 302 && status !== 303 && status !== 307 && status !== 308) throw new RangeError(`Invalid status code ${status}`);
    const r = new Response(null, { status: status, headers: [['Location', u.href]] });
    r.headersObj.immutable = true;
    return r;
  }
  /** JSON.stringify(data) as an application/json body. */
  static json(data: unknown, init: ResponseInit = {}): Response {
    const r = new Response(null, init);
    const s = JSON.stringify(data);
    r.bodyBytes = utf8Encode(s);
    if (!r.headersObj.has('content-type')) r.headersObj.append('Content-Type', 'application/json');
    return r;
  }
  /** From a zinc:net response (fetch). */
  static fromNet(n: net.Response, bytes: u8[], requestUrl: string): Response {
    const r = new Response(null, { status: 200, statusText: n.statusText });
    r.st = n.status;
    n.headers.forEach((value: string, name: string) => {
      if (name === 'set-cookie') { for (const c of value.split(', ')) r.headersObj.append(name, c); }  // ponytail: a cookie with ', ' in Expires splits wrongly
      else r.headersObj.append(name, value);
    });
    const none: u8[] = [];
    r.bodyBytes = n.status === 204 || n.status === 304 ? none : bytes;
    r.url = n.url.length > 0 ? n.url : requestUrl;
    r.redirected = r.url !== requestUrl;
    r.type = 'basic';
    r.headersObj.immutable = true;
    return r;
  }
}

// ================================================================ fetch
/** data: URLs (Fetch Standard "data: URL processor"): percent-decoded, or base64 with ';base64'. */
function dataUrl(url: string): Response {
  const rest = url.slice(5);
  const comma = rest.indexOf(',');
  if (comma < 0) throw new TypeError('fetch failed: invalid data: URL');
  let mime = rest.slice(0, comma).trim();
  let body: u8[] = [];
  const hash = rest.indexOf('#');
  const data = rest.slice(comma + 1, hash > comma ? hash : rest.length);
  const low = mime.toLowerCase();
  const b64 = low.endsWith(';base64') || low.endsWith('; base64');
  if (b64) {
    mime = mime.slice(0, mime.toLowerCase().lastIndexOf(';')).trim();
    try { const s = atob(decodePct(data)); for (let i = 0; i < s.length; i++) body.push(s.charCodeAt(i)); } catch (e) { throw new TypeError('fetch failed: invalid base64 in data: URL'); }
  } else body = pctBytes(data);
  if (mime.startsWith(';')) mime = 'text/plain' + mime;
  if (mime.length === 0) mime = 'text/plain;charset=US-ASCII';
  const r = new Response(null, { status: 200, statusText: 'OK', headers: [['Content-Type', mime]] });
  r.bodyBytes = body;
  r.url = url;
  r.type = 'basic';
  return r;
}
function hexv(c: i32): i32 { return c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1; }
function pctBytes(s: string): u8[] {
  const b = utf8Encode(s);
  const out: u8[] = [];
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 37 && i + 2 < b.length && hexv(b[i + 1]) >= 0 && hexv(b[i + 2]) >= 0) { out.push(hexv(b[i + 1]) * 16 + hexv(b[i + 2])); i += 2; }
    else out.push(b[i]);
  }
  return out;
}
function decodePct(s: string): string { const b = pctBytes(s); const out: string[] = []; for (const x of b) out.push(String.fromCharCode(x)); return out.join(''); }

/** fetch(input, init): http(s) through zinc:net, data: URLs locally. Rejects with TypeError on network errors and
 *  with the signal's reason (a DOMException AbortError by default) when aborted. */
export function fetch(input: unknown, init: RequestInit = {}): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let req: Request;
    try { req = new Request(input, init); } catch (e) { reject(e); return; }
    const signal = req.signal;
    const abortError = (r: unknown): Error => r instanceof Error ? r : new DOMException('This operation was aborted', 'AbortError');
    if (signal.aborted) { reject(abortError(signal.reason)); return; }
    let done = false;
    // the listener reads the signal from the event: capturing `signal` would make signal -> listener -> signal a cycle
    signal.addEventListener('abort', (e: Event) => {
      const t = e.target;
      if (!done && t instanceof AbortSignal) { done = true; reject(abortError(t.reason)); }
    });
    const u = new URL(req.url);
    if (u.protocol === 'data:') { done = true; try { resolve(dataUrl(req.url)); } catch (e) { reject(e); } return; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') { done = true; reject(new TypeError(`fetch failed: unsupported scheme ${u.protocol}`)); return; }
    const h = req.headers.toNet();
    if (!h.has('accept')) h.set('Accept', '*/*');
    const ni: net.RequestInit = { method: req.method, headers: h, timeoutMs: req.timeoutMs, maxBytes: req.maxBytes };
    const b = req.bodyBytes;
    if (b !== null) ni.bodyBytes = b;
    run(req.url, ni, resolve, reject, () => done, () => { done = true; });
  });
}
async function run(url: string, ni: net.RequestInit, resolve: (r: Response) => void, reject: (e: Error) => void, isDone: () => boolean, setDone: () => void): Promise<void> {
  let n: net.Response;
  try { n = await net.fetch(url, ni); } catch (e) { if (!isDone()) { setDone(); reject(new TypeError(e.message)); } return; }
  const bytes = await n.bytes();
  if (isDone()) return;
  setDone();
  resolve(Response.fromNet(n, bytes, url));
}
