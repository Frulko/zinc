// zinc:web — Web platform basics written in Zinc (docs/guide/09-web-apis.md): TextEncoder / TextDecoder, atob / btoa,
// URL / URLSearchParams, Event / EventTarget / CustomEvent, AbortController / AbortSignal, DOMException, and crypto
// (getRandomValues, randomUUID, subtle.digest SHA-1 / SHA-256). The same code runs on every target and on the sim.
// Bytes are u8[] (Zinc has no typed arrays); a string that would be `null` on the Web is '' here (see has()).
import { randomBytes, utf8Encode, utf8Decode } from 'zinc:sys';

// ---------------------------------------------------------------- errors
export class DOMException extends Error {
  constructor(message: string, name: string) { super(message); this.name = name; }
}

// ---------------------------------------------------------------- encoding
export class TextEncoder {
  readonly encoding: string = 'utf-8';
  encode(s: string): u8[] { return utf8Encode(s); }
}
export class TextDecoder {
  readonly encoding: string = 'utf-8';
  /** Only UTF-8 ('utf-8', 'utf8', 'unicode-1-1-utf-8'). @throws RangeError for other labels */
  constructor(label: string = 'utf-8') {
    const l = label.trim().toLowerCase();
    if (l !== 'utf-8' && l !== 'utf8' && l !== 'unicode-1-1-utf-8') throw new RangeError(`The "${label}" encoding is not supported`);
  }
  /** Invalid sequences become U+FFFD; a leading BOM is removed. */
  decode(bytes: u8[]): string {
    const s = utf8Decode(bytes);
    return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64val(c: i32): i32 {
  if (c >= 65 && c <= 90) return c - 65;
  if (c >= 97 && c <= 122) return c - 71;
  if (c >= 48 && c <= 57) return c + 4;
  if (c === 43) return 62;
  if (c === 47) return 63;
  return -1;
}
/** Base64 of bytes (standard alphabet, padded). */
export function base64Encode(b: u8[]): string {
  const out: string[] = [];
  const n = b.length;
  for (let i = 0; i < n; i += 3) {
    const x: i32 = b[i], y: i32 = i + 1 < n ? b[i + 1] : 0, z: i32 = i + 2 < n ? b[i + 2] : 0;
    out.push(B64.at(x >> 2));
    out.push(B64.at(((x & 3) << 4) | (y >> 4)));
    out.push(i + 1 < n ? B64.at(((y & 15) << 2) | (z >> 6)) : '=');
    out.push(i + 2 < n ? B64.at(z & 63) : '=');
  }
  return out.join('');
}
/** Bytes of a base64 string (forgiving: ASCII whitespace ignored, padding optional).
 *  @throws DOMException InvalidCharacterError */
export function base64Decode(s: string): u8[] {
  const vals: i32[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 12 || c === 13) continue;
    vals.push(c);
  }
  let n: i32 = vals.length;
  if (n % 4 === 0 && n > 0 && vals[n - 1] === 61) { n--; if (vals[n - 1] === 61) n--; }
  if (n % 4 === 1) throw new DOMException('The string to be decoded is not correctly encoded.', 'InvalidCharacterError');
  const out: u8[] = [];
  let acc: i32 = 0, bits: i32 = 0;
  for (let i = 0; i < n; i++) {
    const v = b64val(vals[i]);
    if (v < 0) throw new DOMException('The string to be decoded is not correctly encoded.', 'InvalidCharacterError');
    acc = ((acc << 6) | v) & 0xFFFFFF;
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); }
  }
  return out;
}
/** Base64 of a binary string (every char in U+0000..U+00FF). @throws DOMException InvalidCharacterError */
export function btoa(s: string): string {
  const b: u8[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 255) throw new DOMException('Invalid character', 'InvalidCharacterError');
    b.push(c);
  }
  return base64Encode(b);
}
/** Binary string of a base64 string. @throws DOMException InvalidCharacterError */
export function atob(s: string): string {
  const b = base64Decode(s);
  const out: string[] = [];
  for (const x of b) out.push(String.fromCharCode(x));
  return out.join('');
}

// ---------------------------------------------------------------- percent-encoding
const HEX = '0123456789ABCDEF';
// sets (WHATWG URL 1.3): which ASCII bytes a component escapes, besides C0 controls, space and non-ASCII
const FRAGMENT_SET = '"<>`';
const QUERY_SET = '"#<>';
const SPECIAL_QUERY_SET = '"#<>\'';
const PATH_SET = '"#<>?`{}';
const USERINFO_SET = '"#<>?`{}/:;=@[\\]^|';
function pct(s: string, set: string): string {
  let plain = true;
  for (let i = 0; i < s.length && plain; i++) { const c = s.charCodeAt(i); if (c <= 32 || c >= 127 || set.includes(s.at(i))) plain = false; }
  if (plain) return s;
  const out: string[] = [];
  for (const b of utf8Encode(s)) {
    const c: i32 = b;
    if (c <= 32 || c >= 127 || set.includes(String.fromCharCode(c))) { out.push('%'); out.push(HEX.at(c >> 4)); out.push(HEX.at(c & 15)); }
    else out.push(String.fromCharCode(c));
  }
  return out.join('');
}
function hexval(c: i32): i32 {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 65 && c <= 70) return c - 55;
  if (c >= 97 && c <= 102) return c - 87;
  return -1;
}
/** %XX sequences to bytes, then UTF-8 (invalid escapes are kept as they are); `plus`: '+' is a space. */
function unpct(s: string, plus: boolean): string {
  if (!s.includes('%') && !(plus && s.includes('+'))) return s;
  const b = utf8Encode(s);
  const out: u8[] = [];
  for (let i = 0; i < b.length; i++) {
    const c: i32 = b[i];
    if (c === 37 && i + 2 < b.length && hexval(b[i + 1]) >= 0 && hexval(b[i + 2]) >= 0) { out.push(hexval(b[i + 1]) * 16 + hexval(b[i + 2])); i += 2; }
    else if (plus && c === 43) out.push(32);
    else out.push(c);
  }
  return utf8Decode(out);
}
/** application/x-www-form-urlencoded byte serializer. */
function formEncode(s: string): string {
  const out: string[] = [];
  for (const b of utf8Encode(s)) {
    const c: i32 = b;
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 42 || c === 45 || c === 46 || c === 95) out.push(String.fromCharCode(c));
    else if (c === 32) out.push('+');
    else { out.push('%'); out.push(HEX.at(c >> 4)); out.push(HEX.at(c & 15)); }
  }
  return out.join('');
}
/** encodeURIComponent: escapes everything but A-Z a-z 0-9 - _ . ! ~ * ' ( ) */
export function encodeURIComponent(s: string): string { return pct(s, '"#$%&+,/:;<=>?@[\\]^`{|}'); }
/** decodeURIComponent (invalid escapes are kept, no URIError). */
export function decodeURIComponent(s: string): string { return unpct(s, false); }

// ---------------------------------------------------------------- URLSearchParams
export class URLSearchParams {
  private ks: string[] = [];
  private vs: string[] = [];
  @weak owner: URL | null = null;

  /** From a query string ('?' optional) or [name, value] pairs. */
  constructor(init: string = '', pairs: [string, string][] = []) {
    this.parse(init);
    for (const [k, v] of pairs) { this.ks.push(k); this.vs.push(v); }
  }
  parse(q: string): void {
    this.ks = []; this.vs = [];
    const s = q.startsWith('?') ? q.slice(1) : q;
    if (s.length === 0) return;
    for (const part of s.split('&')) {
      if (part.length === 0) continue;
      const eq = part.indexOf('=');
      this.ks.push(unpct(eq < 0 ? part : part.slice(0, eq), true));
      this.vs.push(eq < 0 ? '' : unpct(part.slice(eq + 1), true));
    }
  }
  get size(): i32 { return this.ks.length; }
  append(name: string, value: string): void { this.ks.push(name); this.vs.push(value); this.changed(); }
  delete(name: string): void {
    for (let i = this.ks.length - 1; i >= 0; i--) if (this.ks[i] === name) { this.ks.splice(i, 1); this.vs.splice(i, 1); }
    this.changed();
  }
  /** The first value, '' when absent (use has()). */
  get(name: string): string { const i = this.ks.indexOf(name); return i < 0 ? '' : this.vs[i]; }
  getAll(name: string): string[] { const r: string[] = []; for (let i = 0; i < this.ks.length; i++) if (this.ks[i] === name) r.push(this.vs[i]); return r; }
  has(name: string): boolean { return this.ks.includes(name); }
  set(name: string, value: string): void {
    const i = this.ks.indexOf(name);
    if (i < 0) { this.append(name, value); return; }
    this.vs[i] = value;
    for (let j = this.ks.length - 1; j > i; j--) if (this.ks[j] === name) { this.ks.splice(j, 1); this.vs.splice(j, 1); }
    this.changed();
  }
  /** Stable sort by name (UTF-16 code units). */
  sort(): void {
    const idx: i32[] = [];
    for (let i = 0; i < this.ks.length; i++) idx.push(i);
    idx.sort((a: i32, b: i32) => this.ks[a] < this.ks[b] ? -1 : this.ks[a] > this.ks[b] ? 1 : a - b);
    const ks: string[] = [], vs: string[] = [];
    for (const i of idx) { ks.push(this.ks[i]); vs.push(this.vs[i]); }
    this.ks = ks; this.vs = vs;
    this.changed();
  }
  forEach(f: (value: string, name: string) => void): void { for (let i = 0; i < this.ks.length; i++) f(this.vs[i], this.ks[i]); }
  keys(): string[] { return this.ks.slice(); }
  values(): string[] { return this.vs.slice(); }
  entries(): [string, string][] { const r: [string, string][] = []; for (let i = 0; i < this.ks.length; i++) r.push([this.ks[i], this.vs[i]]); return r; }
  toString(): string {
    const out: string[] = [];
    for (let i = 0; i < this.ks.length; i++) out.push(formEncode(this.ks[i]) + '=' + formEncode(this.vs[i]));
    return out.join('&');
  }
  private changed(): void {
    const u = this.owner;
    if (u !== null) u.setQuery(this.ks.length === 0 ? '' : this.toString());
  }
}

// ---------------------------------------------------------------- URL
const SPECIAL = ['ftp', 'file', 'http', 'https', 'ws', 'wss'];
function defaultPort(scheme: string): string {
  if (scheme === 'http' || scheme === 'ws') return '80';
  if (scheme === 'https' || scheme === 'wss') return '443';
  if (scheme === 'ftp') return '21';
  return '';
}
function isAlpha(c: i32): boolean { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122); }
function isDigit(c: i32): boolean { return c >= 48 && c <= 57; }
function invalid(): Error { return new TypeError('Invalid URL'); }

/** WHATWG URL for the common cases: special schemes (http, https, ws, wss, ftp, file) with authority, opaque paths
 *  (mailto:, data:), relative references against a base, dot segments, percent-encoding and default ports.
 *  ponytail: no IDNA (non-ASCII hosts stay as written, lowercased), no IPv4 number forms (0x7f.1), IPv6 kept as written. */
export class URL {
  private scheme: string = '';
  username: string = '';
  password: string = '';
  private hostName: string = '';
  private portStr: string = '';
  private hasAuthority: boolean = false;
  private opaque: boolean = false;
  private path: string[] = [];
  private query: string = '';
  private hasQuery: boolean = false;
  private fragment: string = '';
  private hasFragment: boolean = false;
  private params: URLSearchParams | null = null;

  /** @throws TypeError 'Invalid URL' */
  constructor(input: string, base: string = '') {
    const s = input.trim();
    if (base.length > 0) {
      const b = new URL(base);
      if (!this.parseAbsolute(s)) this.resolve(s, b);
    } else if (!this.parseAbsolute(s)) throw invalid();
  }
  /** true when the input has a scheme (else it is relative). */
  private parseAbsolute(s: string): boolean {
    let i: i32 = 0;
    if (s.length === 0 || !isAlpha(s.charCodeAt(0))) return false;
    while (i < s.length) {
      const c = s.charCodeAt(i);
      if (isAlpha(c) || isDigit(c) || c === 43 || c === 45 || c === 46) i++; else break;
    }
    if (i >= s.length || s.charCodeAt(i) !== 58) return false;
    this.scheme = s.slice(0, i).toLowerCase();
    let rest = s.slice(i + 1);
    const special = SPECIAL.includes(this.scheme);
    const slash = (i: i32): boolean => i < rest.length && (rest.charCodeAt(i) === 47 || rest.charCodeAt(i) === 92);
    if (this.scheme === 'file') {
      // file://host/path, file:///path, file:/path
      if (slash(0) && slash(1)) rest = this.parseAuthority(rest.slice(2), true);
      else this.hasAuthority = true;
      this.parsePathQuery(rest);
      return true;
    }
    if (special) {
      let k: i32 = 0;
      while (slash(k)) k++;
      rest = this.parseAuthority(rest.slice(k), true);
      this.parsePathQuery(rest);
      return true;
    }
    if (rest.startsWith('//')) {
      rest = this.parseAuthority(rest.slice(2), false);
      this.parsePathQuery(rest);
      return true;
    }
    if (!rest.startsWith('/')) { this.opaque = true; }
    this.parsePathQuery(rest);
    return true;
  }
  /** Parses user:pass@host:port up to the path; returns the rest. */
  private parseAuthority(s: string, special: boolean): string {
    this.hasAuthority = true;
    let end: i32 = s.length;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 47 || c === 63 || c === 35 || (special && c === 92)) { end = i; break; }
    }
    let auth = s.slice(0, end);
    const at = auth.lastIndexOf('@');
    if (at >= 0) {
      const info = auth.slice(0, at);
      const colon = info.indexOf(':');
      this.username = pct(colon < 0 ? info : info.slice(0, colon), USERINFO_SET);
      this.password = colon < 0 ? '' : pct(info.slice(colon + 1), USERINFO_SET);
      auth = auth.slice(at + 1);
    }
    let host = auth, port = '';
    const close = auth.lastIndexOf(']');
    const colon = auth.lastIndexOf(':');
    if (colon >= 0 && colon > close) { host = auth.slice(0, colon); port = auth.slice(colon + 1); }
    for (let i = 0; i < port.length; i++) if (!isDigit(port.charCodeAt(i))) throw invalid();
    if (port.length > 0) {
      const p = parseInt(port);
      if (p > 65535) throw invalid();
      port = `${p}`;
    }
    if (port === defaultPort(this.scheme)) port = '';
    host = special ? unpct(host, false).toLowerCase() : host;
    for (let i = 0; i < host.length; i++) {
      const c = host.charCodeAt(i);
      if (c <= 32 || c === 35 || c === 47 || c === 60 || c === 62 || c === 63 || c === 64 || c === 92 || c === 94 || c === 124 || (c === 37 && special)) throw invalid();
    }
    if (special && this.scheme !== 'file' && host.length === 0) throw invalid();
    if (this.scheme === 'file' && host === 'localhost') host = '';
    this.hostName = host;
    this.portStr = port;
    return s.slice(end);
  }
  private parsePathQuery(s: string): void {
    let rest = s;
    const hash = rest.indexOf('#');
    if (hash >= 0) { this.hasFragment = true; this.fragment = pct(rest.slice(hash + 1), FRAGMENT_SET); rest = rest.slice(0, hash); }
    const q = rest.indexOf('?');
    if (q >= 0) { this.setQuery(rest.slice(q + 1)); rest = rest.slice(0, q); }
    this.setPath(rest);
  }
  private setPath(p: string): void {
    if (this.opaque) { this.path = [pct(p, '')]; return; }
    const special = SPECIAL.includes(this.scheme);
    const segs = (special ? p.replaceAll('\\', '/') : p).split('/');
    if (segs.length > 0 && segs[0].length === 0) segs.shift();
    const out: string[] = [];
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i], low = seg.toLowerCase();
      const last = i === segs.length - 1;
      if (seg === '..' || low === '.%2e' || low === '%2e.' || low === '%2e%2e') { if (out.length > 0) out.pop(); if (last) out.push(''); }
      else if (seg === '.' || low === '%2e') { if (last) out.push(''); }
      else out.push(pct(seg, PATH_SET));
    }
    if (out.length === 0 && (special || this.hasAuthority) && p.length > 0) out.push('');
    this.path = out;
    if (special && out.length === 0) this.path = [''];
  }
  setQuery(q: string): void {
    this.hasQuery = true;
    this.query = pct(q, SPECIAL.includes(this.scheme) ? SPECIAL_QUERY_SET : QUERY_SET);
  }
  private resolve(s: string, b: URL): void {
    this.scheme = b.scheme;
    const special = SPECIAL.includes(this.scheme);
    const slash = (i: i32): boolean => i < s.length && (s.charCodeAt(i) === 47 || (special && s.charCodeAt(i) === 92));
    if (slash(0) && slash(1)) { this.parsePathQuery(this.parseAuthority(s.slice(2), special)); return; }
    if (b.opaque) {
      if (!s.startsWith('#')) throw invalid();
      this.opaque = true;
    }
    this.hasAuthority = b.hasAuthority; this.username = b.username; this.password = b.password; this.hostName = b.hostName; this.portStr = b.portStr;
    if (s.length === 0 || s.startsWith('?') || s.startsWith('#')) {
      this.path = b.path.slice();
      if (!s.startsWith('?')) { this.hasQuery = b.hasQuery; this.query = b.query; }
      const hash = s.indexOf('#');
      if (hash >= 0) { this.hasFragment = true; this.fragment = pct(s.slice(hash + 1), FRAGMENT_SET); }
      const qs = hash >= 0 ? s.slice(0, hash) : s;
      if (qs.startsWith('?')) this.setQuery(qs.slice(1));
      return;
    }
    if (slash(0)) { this.parsePathQuery(s); return; }
    const dir = b.path.slice(0, b.path.length > 0 ? b.path.length - 1 : 0);
    this.parsePathQuery('/' + dir.join('/') + (dir.length > 0 ? '/' : '') + s);
  }

  get protocol(): string { return this.scheme + ':'; }
  get hostname(): string { return this.hostName; }
  set hostname(v: string) { if (!this.opaque) this.hostName = SPECIAL.includes(this.scheme) ? v.toLowerCase() : v; }
  get port(): string { return this.portStr; }
  set port(v: string) {
    let digits = '';
    for (let i = 0; i < v.length && isDigit(v.charCodeAt(i)); i++) digits += v.at(i);
    if (v.length > 0 && digits.length === 0) return;
    const p = digits.length > 0 ? `${parseInt(digits)}` : '';
    if (p.length > 0 && parseInt(p) > 65535) return;
    this.portStr = p === defaultPort(this.scheme) ? '' : p;
  }
  get host(): string { return this.portStr.length > 0 ? this.hostName + ':' + this.portStr : this.hostName; }
  get pathname(): string { return this.opaque ? this.path[0] : this.path.length === 0 ? '' : '/' + this.path.join('/'); }
  set pathname(v: string) { if (!this.opaque) this.setPath(v.startsWith('/') ? v : '/' + v); }
  get search(): string { return this.hasQuery && this.query.length > 0 ? '?' + this.query : ''; }
  set search(v: string) {
    const q = v.startsWith('?') ? v.slice(1) : v;
    if (q.length === 0) { this.hasQuery = false; this.query = ''; } else this.setQuery(q);
    const p = this.params;
    if (p !== null) p.parse(this.query);
  }
  get hash(): string { return this.hasFragment && this.fragment.length > 0 ? '#' + this.fragment : ''; }
  set hash(v: string) {
    const f = v.startsWith('#') ? v.slice(1) : v;
    this.hasFragment = f.length > 0;
    this.fragment = pct(f, FRAGMENT_SET);
  }
  /** Live: changing it rewrites the query. */
  get searchParams(): URLSearchParams {
    const p = this.params;
    if (p !== null) return p;
    const n = new URLSearchParams(this.query);
    n.owner = this;
    this.params = n;
    return n;
  }
  get origin(): string {
    if (!SPECIAL.includes(this.scheme) || this.scheme === 'file') return 'null';
    return this.scheme + '://' + this.host;
  }
  get href(): string {
    const out: string[] = [this.scheme, ':'];
    if (this.hasAuthority) {
      out.push('//');
      if (this.username.length > 0 || this.password.length > 0) {
        out.push(this.username);
        if (this.password.length > 0) { out.push(':'); out.push(this.password); }
        out.push('@');
      }
      out.push(this.host);
    }
    out.push(this.pathname);
    if (this.hasQuery) { out.push('?'); out.push(this.query); }
    if (this.hasFragment) { out.push('#'); out.push(this.fragment); }
    return out.join('');
  }
  toString(): string { return this.href; }
  toJSON(): string { return this.href; }
  /** URL.canParse(input, base) */
  static canParse(input: string, base: string = ''): boolean {
    try { const u = new URL(input, base); return u.scheme.length > 0; } catch (e) { return false; }
  }
}

// ---------------------------------------------------------------- events
export class Event {
  readonly type: string;
  readonly cancelable: boolean;
  defaultPrevented: boolean = false;
  /** Set by dispatchEvent. */
  @weak target: EventTarget | null = null;
  stopped: boolean = false;
  constructor(type: string, cancelable: boolean = false) { this.type = type; this.cancelable = cancelable; }
  preventDefault(): void { if (this.cancelable) this.defaultPrevented = true; }
  stopImmediatePropagation(): void { this.stopped = true; }
}
/** An event with a payload: `new CustomEvent<T>('name', value)`; listeners read `(e as CustomEvent<T>).detail`. */
export class CustomEvent<T> extends Event {
  readonly detail: T;
  constructor(type: string, detail: T) { super(type); this.detail = detail; }
}
export type EventListener = (e: Event) => void;
class Listener { f: EventListener; once: boolean; constructor(f: EventListener, once: boolean) { this.f = f; this.once = once; } }
export class EventTarget {
  private ls = new Map<string, Listener[]>();
  addEventListener(type: string, f: EventListener, once: boolean = false): void {
    let l = this.ls.get(type);
    if (l === undefined) { l = []; this.ls.set(type, l); }
    for (const x of l) if (x.f === f) return;
    l.push(new Listener(f, once));
  }
  removeEventListener(type: string, f: EventListener): void {
    const l = this.ls.get(type);
    if (l === undefined) return;
    for (let i = 0; i < l.length; i++) if (l[i].f === f) { l.splice(i, 1); return; }
  }
  /** Calls the listeners in order; false when a cancelable event was prevented. */
  dispatchEvent(e: Event): boolean {
    e.target = this;
    const l = this.ls.get(e.type);
    if (l !== undefined) {
      for (const x of l.slice()) {
        if (x.once) this.removeEventListener(e.type, x.f);
        x.f(e);
        if (e.stopped) break;
      }
    }
    return !e.defaultPrevented;
  }
}

// ---------------------------------------------------------------- abort
export class AbortSignal extends EventTarget {
  aborted: boolean = false;
  reason: string = '';
  /** Called once on abort, like `signal.onabort`. */
  onabort: ((e: Event) => void) | null = null;
  /** @throws DOMException AbortError when aborted */
  throwIfAborted(): void { if (this.aborted) throw new DOMException(this.reason, 'AbortError'); }
  signalAbort(reason: string): void {
    if (this.aborted) return;
    this.aborted = true;
    this.reason = reason;
    const e = new Event('abort');
    const f = this.onabort;
    if (f !== null) f(e);
    this.dispatchEvent(e);
  }
  static abort(reason: string = 'This operation was aborted'): AbortSignal { const s = new AbortSignal(); s.signalAbort(reason); return s; }
  /** Aborts after `ms` with a TimeoutError reason. */
  static timeout(ms: number): AbortSignal {
    const s = new AbortSignal();
    setTimeout(() => { s.signalAbort('The operation was aborted due to timeout'); }, ms);
    return s;
  }
}
export class AbortController {
  readonly signal: AbortSignal = new AbortSignal();
  abort(reason: string = 'This operation was aborted'): void { this.signal.signalAbort(reason); }
}

// ---------------------------------------------------------------- crypto
const K256: u32[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
function rotr(x: u32, n: i32): u32 { return ((x >>> n) | (x << (32 - n))) >>> 0; }
function rotl(x: u32, n: i32): u32 { return ((x << n) | (x >>> (32 - n))) >>> 0; }
/** Message padded to 64-byte blocks with the bit length (big endian), as 32-bit words. */
function words(data: u8[]): u32[] {
  const n = data.length;
  const total = ((n + 8) >> 6) * 64 + 64;
  const w: u32[] = [];
  for (let i = 0; i < total; i += 4) {
    let v: u32 = 0;
    for (let k = 0; k < 4; k++) {
      const j = i + k;
      const b: u32 = j < n ? data[j] : j === n ? 0x80 : 0;
      v = ((v << 8) | b) >>> 0;
    }
    w.push(v);
  }
  w[w.length - 1] = ((n & 0x1FFFFFFF) * 8) >>> 0;
  w[w.length - 2] = (n >>> 29) >>> 0;
  return w;
}
function wordBytes(h: u32[]): u8[] {
  const out: u8[] = [];
  for (const v of h) { out.push((v >>> 24) & 255); out.push((v >>> 16) & 255); out.push((v >>> 8) & 255); out.push(v & 255); }
  return out;
}
/** SHA-256 of bytes (FIPS 180-4). */
export function sha256(data: u8[]): u8[] {
  const m = words(data);
  const h: u32[] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w: u32[] = [];
  for (let i = 0; i < 64; i++) w.push(0);
  for (let blk = 0; blk < m.length; blk += 16) {
    for (let i = 0; i < 16; i++) w[i] = m[blk + i];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + (s0 >>> 0) + w[i - 7] + (s1 >>> 0)) >>> 0;
    }
    let a: u32 = h[0], b: u32 = h[1], c: u32 = h[2], d: u32 = h[3], e: u32 = h[4], f: u32 = h[5], g: u32 = h[6], k: u32 = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (k + S1 + ch + K256[i] + w[i]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const mj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + mj) >>> 0;
      k = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + k) >>> 0;
  }
  return wordBytes(h);
}
/** SHA-1 of bytes (for protocols that need it, e.g. the WebSocket handshake; not collision resistant). */
export function sha1(data: u8[]): u8[] {
  const m = words(data);
  const h: u32[] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w: u32[] = [];
  for (let i = 0; i < 80; i++) w.push(0);
  for (let blk = 0; blk < m.length; blk += 16) {
    for (let i = 0; i < 16; i++) w[i] = m[blk + i];
    for (let i = 16; i < 80; i++) w[i] = rotl((w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]) >>> 0, 1);
    let a: u32 = h[0], b: u32 = h[1], c: u32 = h[2], d: u32 = h[3], e: u32 = h[4];
    for (let i = 0; i < 80; i++) {
      let f: u32 = 0, k: u32 = 0;
      if (i < 20) { f = ((b & c) | (~b & d)) >>> 0; k = 0x5a827999; }
      else if (i < 40) { f = (b ^ c ^ d) >>> 0; k = 0x6ed9eba1; }
      else if (i < 60) { f = ((b & c) | (b & d) | (c & d)) >>> 0; k = 0x8f1bbcdc; }
      else { f = (b ^ c ^ d) >>> 0; k = 0xca62c1d6; }
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = t;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0; h[4] = (h[4] + e) >>> 0;
  }
  return wordBytes(h);
}
/** Lowercase hex of bytes. */
export function toHex(b: u8[]): string {
  const out: string[] = [];
  const hex = '0123456789abcdef';
  for (const x of b) { const v: i32 = x; out.push(hex.at(v >> 4)); out.push(hex.at(v & 15)); }
  return out.join('');
}
export class SubtleCrypto {
  /** 'SHA-1' or 'SHA-256'. Rejects with NotSupportedError otherwise. */
  async digest(algorithm: string, data: u8[]): Promise<u8[]> {
    const a = algorithm.toUpperCase();
    if (a === 'SHA-256') return sha256(data);
    if (a === 'SHA-1') return sha1(data);
    throw new DOMException(`Unrecognized algorithm name: ${algorithm}`, 'NotSupportedError');
  }
}
export class Crypto {
  readonly subtle: SubtleCrypto = new SubtleCrypto();
  /** Fills the array with random bytes and returns it (at most 65536 bytes, like the Web). */
  getRandomValues(a: u8[]): u8[] {
    if (a.length > 65536) throw new DOMException('The ArrayBufferView\'s byte length exceeds 65536', 'QuotaExceededError');
    const r = randomBytes(a.length);
    for (let i = 0; i < a.length; i++) a[i] = r[i];
    return a;
  }
  /** RFC 4122 version 4 UUID. */
  randomUUID(): string {
    const b = randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = toHex(b);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}
export const crypto: Crypto = new Crypto();
