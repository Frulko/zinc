// zinc:web — the WinterTC Minimum Common Web API (https://min-common-api.proposal.wintertc.org/) in pure Zinc, the
// same code on every target and on the sim: DOMException, TextEncoder / TextDecoder, atob / btoa, URL /
// URLSearchParams (the WHATWG basic URL parser), Event / EventTarget / CustomEvent / ErrorEvent / MessageEvent /
// PromiseRejectionEvent, AbortController / AbortSignal, MessageChannel / MessagePort, Blob / File / FormData, crypto
// (getRandomValues, randomUUID, subtle.digest), reportError, navigator. fetch / Request / Response / Headers are in
// lib/std/fetch.ts. Programs use them as globals: the compiler adds the import (compiler/src/frontend.ts webGlobals).
// Deviations (docs/guide/09-web-apis.md): bytes are u8[] (Zinc has no ArrayBuffer / typed arrays), a WebIDL union
// argument is `unknown` (narrowed inside), no IDNA mapping beyond lowercase + Punycode.
import { randomBytes, utf8Encode, utf8Decode } from 'zinc:sys';

// ================================================================ DOMException (WebIDL)
const DOM_CODES: string[] = ['', 'IndexSizeError', '', 'HierarchyRequestError', 'WrongDocumentError', 'InvalidCharacterError', '',
  'NoModificationAllowedError', 'NotFoundError', 'NotSupportedError', '', 'InvalidStateError', 'SyntaxError', 'InvalidModificationError',
  'NamespaceError', 'InvalidAccessError', '', 'TypeMismatchError', 'SecurityError', 'NetworkError', 'AbortError', 'URLMismatchError',
  'QuotaExceededError', 'TimeoutError', 'InvalidNodeTypeError', 'DataCloneError'];
export class DOMException extends Error {
  static readonly INDEX_SIZE_ERR: i32 = 1;
  static readonly INVALID_CHARACTER_ERR: i32 = 5;
  static readonly NOT_FOUND_ERR: i32 = 8;
  static readonly NOT_SUPPORTED_ERR: i32 = 9;
  static readonly INVALID_STATE_ERR: i32 = 11;
  static readonly SYNTAX_ERR: i32 = 12;
  static readonly NETWORK_ERR: i32 = 19;
  static readonly ABORT_ERR: i32 = 20;
  static readonly QUOTA_EXCEEDED_ERR: i32 = 22;
  static readonly TIMEOUT_ERR: i32 = 23;
  static readonly DATA_CLONE_ERR: i32 = 25;
  constructor(message: string = '', name: string = 'Error') { super(message); this.name = name; }
  /** Legacy code of the name (0 for names without one). */
  get code(): i32 { const i = DOM_CODES.indexOf(this.name); return i > 0 ? i : 0; }
}

// ================================================================ f64 helpers
// Math.* follows the profile's number type (fixed point on ps1): these stay f64 everywhere. x >= 0.
function fl(x: f64): f64 { return x - (x % 1); }
function pow256(k: i32): f64 { let r: f64 = 1; for (let i = 0; i < k; i++) r *= 256; return r; }

// ================================================================ code points and UTF-8
/** Code points of a string (Zinc strings are UTF-8, so never a lone surrogate). */
function codePoints(s: string): i32[] {
  const b = utf8Encode(s);
  const out: i32[] = [];
  let i: i32 = 0;
  while (i < b.length) {
    const c: i32 = b[i];
    if (c < 0x80) { out.push(c); i++; }
    else if (c < 0xE0) { out.push(((c & 31) << 6) | (b[i + 1] & 63)); i += 2; }
    else if (c < 0xF0) { out.push(((c & 15) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63)); i += 3; }
    else { out.push(((c & 7) << 18) | ((b[i + 1] & 63) << 12) | ((b[i + 2] & 63) << 6) | (b[i + 3] & 63)); i += 4; }
  }
  return out;
}
function utf8Of(c: i32): u8[] {
  if (c < 0x80) return [c];
  if (c < 0x800) return [0xC0 | (c >> 6), 0x80 | (c & 63)];
  if (c < 0x10000) return [0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)];
  return [0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)];
}
/** String of code points (non-ASCII through UTF-8). */
function fromCodePoints(cs: i32[]): string {
  let ascii = true;
  for (const c of cs) if (c >= 0x80) { ascii = false; break; }
  if (ascii) { const parts: string[] = []; for (const c of cs) parts.push(String.fromCharCode(c)); return parts.join(''); }
  const b: u8[] = [];
  for (const c of cs) for (const x of utf8Of(c)) b.push(x);
  return utf8Decode(b);
}
/** Length of the prefix of `b` that ends on a complete UTF-8 sequence (for streaming decoders). */
function utf8Complete(b: u8[]): i32 {
  const n = b.length;
  for (let k = 1; k <= 3 && k <= n; k++) {
    const c: i32 = b[n - k];
    if ((c & 0xC0) !== 0x80) {
      const len = c >= 0xF0 && c <= 0xF4 ? 4 : c >= 0xE0 && c < 0xF0 ? 3 : c >= 0xC2 && c < 0xE0 ? 2 : 1;
      return len > k ? n - k : n;
    }
  }
  return n;
}

// ================================================================ Encoding Standard (UTF-8)
export class EncodeIntoResult { read: i32; written: i32; constructor(r: i32, w: i32) { this.read = r; this.written = w; } }
export class TextEncoder {
  readonly encoding: string = 'utf-8';
  encode(input: string = ''): u8[] { return utf8Encode(input); }
  /** Writes as many whole characters as fit into `dest`; read counts UTF-16 code units. */
  encodeInto(source: string, dest: u8[]): EncodeIntoResult {
    let read: i32 = 0, written: i32 = 0;
    for (const c of codePoints(source)) {
      const b = utf8Of(c);
      if (written + b.length > dest.length) break;
      for (const x of b) dest[written++] = x;
      read += c >= 0x10000 ? 2 : 1;
    }
    return new EncodeIntoResult(read, written);
  }
}
const UTF8_LABELS = ['unicode-1-1-utf-8', 'unicode11utf8', 'unicode20utf8', 'utf-8', 'utf8', 'x-unicode20utf8'];
export interface TextDecoderOptions { fatal?: boolean; ignoreBOM?: boolean }
export interface TextDecodeOptions { stream?: boolean }
export class TextDecoder {
  readonly encoding: string = 'utf-8';
  readonly fatal: boolean;
  readonly ignoreBOM: boolean;
  private pending: u8[] = [];
  private bomSeen: boolean = false;
  /** UTF-8 only (every label of the Encoding Standard for it). @throws RangeError for other encodings */
  constructor(label: string = 'utf-8', options: TextDecoderOptions = {}) {
    const l = label.trim().toLowerCase();
    if (!UTF8_LABELS.includes(l)) throw new RangeError(`The "${label}" encoding is not supported`);
    this.fatal = options.fatal ?? false;
    this.ignoreBOM = options.ignoreBOM ?? false;
  }
  /** Invalid sequences become U+FFFD (TypeError when fatal); with {stream: true} an incomplete last sequence waits
   *  for the next call. */
  decode(input: u8[] = [], options: TextDecodeOptions = {}): string {
    const stream = options.stream ?? false;
    let b = this.pending.length > 0 ? this.pending.concat(input) : input;
    this.pending = [];
    if (stream) {
      const cut = utf8Complete(b);
      if (cut < b.length) { this.pending = b.slice(cut); b = b.slice(0, cut); }
    }
    let s = utf8Decode(b);
    if (this.fatal && !sameBytes(utf8Encode(s), b)) { this.bomSeen = false; throw new TypeError('The encoded data was not valid for encoding utf-8'); }
    if (!this.ignoreBOM && !this.bomSeen && s.length > 0) {
      if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
      this.bomSeen = true;
    }
    if (!stream) this.bomSeen = false;
    return s;
  }
}
function sameBytes(a: u8[], b: u8[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ================================================================ forgiving-base64 (HTML)
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
/** forgiving-base64 decode: ASCII whitespace ignored, padding optional. @throws DOMException InvalidCharacterError */
export function base64Decode(s: string): u8[] {
  const vals: i32[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 12 || c === 13) continue;
    vals.push(c);
  }
  let n: i32 = vals.length;
  if (n % 4 === 0 && n > 0 && vals[n - 1] === 61) { n--; if (vals[n - 1] === 61) n--; }
  const bad = (): DOMException => new DOMException('The string to be decoded is not correctly encoded.', 'InvalidCharacterError');
  if (n % 4 === 1) throw bad();
  const out: u8[] = [];
  let acc: i32 = 0, bits: i32 = 0;
  for (let i = 0; i < n; i++) {
    const v = b64val(vals[i]);
    if (v < 0) throw bad();
    acc = ((acc << 6) | v) & 0xFFFFFF;
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); }
  }
  return out;
}
/** Base64 of a binary string (every char in U+0000..U+00FF). @throws DOMException InvalidCharacterError */
export function btoa(data: string): string {
  const b: u8[] = [];
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);
    if (c > 255) throw new DOMException('Invalid character', 'InvalidCharacterError');
    b.push(c);
  }
  return base64Encode(b);
}
/** Binary string of a base64 string. @throws DOMException InvalidCharacterError */
export function atob(data: string): string {
  const b = base64Decode(data);
  const out: string[] = [];
  for (const x of b) out.push(String.fromCharCode(x));
  return out.join('');
}

// ================================================================ percent-encoding (URL Standard 1.3)
const HEX = '0123456789ABCDEF';
const C0_SET = 0, FRAGMENT_SET = 1, QUERY_SET = 2, SPECIAL_QUERY_SET = 3, PATH_SET = 4, USERINFO_SET = 5, COMPONENT_SET = 6, FORM_SET = 7, URI_SET = 8;
function inSet(c: i32, set: i32): boolean {
  if (c < 0x20 || c > 0x7E) return true;
  if (set === C0_SET) return false;
  if (set === URI_SET) return !(isAlnum(c) || ";,/?:@&=+$-_.!~*'()#".includes(String.fromCharCode(c)));
  if (set === FRAGMENT_SET) return c === 32 || c === 34 || c === 60 || c === 62 || c === 96;
  if (c === 32 || c === 34 || c === 35 || c === 60 || c === 62) return true;  // query set
  if (set === QUERY_SET) return false;
  if (set === SPECIAL_QUERY_SET) return c === 39;
  if (c === 63 || c === 94 || c === 96 || c === 123 || c === 125) return true;  // path set
  if (set === PATH_SET) return false;
  if (c === 47 || c === 58 || c === 59 || c === 61 || c === 64 || (c >= 91 && c <= 93) || c === 124) return true;  // userinfo
  if (set === USERINFO_SET) return false;
  if ((c >= 36 && c <= 38) || c === 43 || c === 44) return true;  // component
  if (set === COMPONENT_SET) return false;
  return c === 33 || (c >= 39 && c <= 41) || c === 126;  // application/x-www-form-urlencoded
}
function pctByte(out: string[], b: i32): void { out.push('%'); out.push(HEX.at(b >> 4)); out.push(HEX.at(b & 15)); }
function pctCp(out: string[], c: i32, set: i32): void {
  if (!inSet(c, set)) { out.push(String.fromCharCode(c)); return; }
  for (const b of utf8Of(c)) pctByte(out, b);
}
function pctEncode(s: string, set: i32): string {
  let plain = true;
  for (let i = 0; i < s.length && plain; i++) if (inSet(s.charCodeAt(i), set)) plain = false;
  if (plain) return s;
  const out: string[] = [];
  for (const c of codePoints(s)) pctCp(out, c, set);
  return out.join('');
}
function hexval(c: i32): i32 {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 65 && c <= 70) return c - 55;
  if (c >= 97 && c <= 102) return c - 87;
  return -1;
}
function isAlpha(c: i32): boolean { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122); }
function isDigit(c: i32): boolean { return c >= 48 && c <= 57; }
function isAlnum(c: i32): boolean { return isAlpha(c) || isDigit(c); }
/** Percent-decode of the UTF-8 bytes (invalid escapes kept), then UTF-8 decode; `plus`: '+' is a space. */
function pctDecodeBytes(s: string, plus: boolean): u8[] {
  const b = utf8Encode(s);
  const out: u8[] = [];
  for (let i = 0; i < b.length; i++) {
    const c: i32 = b[i];
    if (c === 37 && i + 2 < b.length && hexval(b[i + 1]) >= 0 && hexval(b[i + 2]) >= 0) { out.push(hexval(b[i + 1]) * 16 + hexval(b[i + 2])); i += 2; }
    else if (plus && c === 43) out.push(32);
    else out.push(c);
  }
  return out;
}
function pctDecode(s: string, plus: boolean): string {
  if (!s.includes('%') && !(plus && s.includes('+'))) return s;
  return utf8Decode(pctDecodeBytes(s, plus));
}
/** application/x-www-form-urlencoded serializer of one string. */
function formEncode(s: string): string {
  const out: string[] = [];
  for (const b of utf8Encode(s)) {
    const c: i32 = b;
    if (c === 32) out.push('+');
    else if (c < 0x80 && !inSet(c, FORM_SET)) out.push(String.fromCharCode(c));
    else pctByte(out, c);
  }
  return out.join('');
}
/** ECMAScript encodeURIComponent / encodeURI. */
export function encodeURIComponent(s: string): string {
  const out: string[] = [];
  for (const c of codePoints(s)) {
    if (isAlnum(c) || "-_.!~*'()".includes(String.fromCharCode(c))) out.push(String.fromCharCode(c));
    else for (const b of utf8Of(c)) pctByte(out, b);
  }
  return out.join('');
}
export function encodeURI(s: string): string { const out: string[] = []; for (const c of codePoints(s)) pctCp(out, c, URI_SET); return out.join(''); }
function uriDecode(s: string, reserved: string): string {
  if (!s.includes('%')) return s;
  const b = utf8Encode(s);
  const out: u8[] = [];
  for (let i = 0; i < b.length; i++) {
    const c: i32 = b[i];
    if (c !== 37) { out.push(c); continue; }
    if (i + 2 >= b.length || hexval(b[i + 1]) < 0 || hexval(b[i + 2]) < 0) throw new URIError('URI malformed');
    const v = hexval(b[i + 1]) * 16 + hexval(b[i + 2]);
    if (v < 0x80 && reserved.includes(String.fromCharCode(v))) { out.push(c); out.push(b[i + 1]); out.push(b[i + 2]); }
    else out.push(v);
    i += 2;
  }
  if (!sameBytes(utf8Encode(utf8Decode(out)), out)) throw new URIError('URI malformed');
  return utf8Decode(out);
}
/** ECMAScript decodeURIComponent / decodeURI. @throws URIError on a malformed escape or invalid UTF-8 */
export function decodeURIComponent(s: string): string { return uriDecode(s, ''); }
export function decodeURI(s: string): string { return uriDecode(s, ';/?:@&=+$,#'); }
/** URIError (ECMAScript), for decodeURI. */
export class URIError extends Error { constructor(message: string) { super(message); this.name = 'URIError'; } }

// ================================================================ URL Standard: hosts
const SPECIAL = ['ftp', 'file', 'http', 'https', 'ws', 'wss'];
function defaultPort(scheme: string): i32 {
  if (scheme === 'http' || scheme === 'ws') return 80;
  if (scheme === 'https' || scheme === 'wss') return 443;
  if (scheme === 'ftp') return 21;
  return -1;
}
let hostFailed = false;
function forbiddenHost(c: i32): boolean {
  return c === 0 || c === 9 || c === 10 || c === 13 || c === 32 || c === 35 || c === 47 || c === 58 || c === 60 || c === 62 || c === 63
    || c === 64 || c === 91 || c === 92 || c === 93 || c === 94 || c === 124;
}
function forbiddenDomain(c: i32): boolean { return forbiddenHost(c) || c <= 0x1F || c === 37 || c === 0x7F; }
/** IPv4 number parser: decimal, 0x hex or 0 octal; -1 on failure. */
function ipv4Number(s: string): f64 {
  let t = s, r: i32 = 10;
  if (t.length === 0) return -1;
  if (t.length >= 2 && (t.startsWith('0x') || t.startsWith('0X'))) { t = t.slice(2); r = 16; }
  else if (t.length >= 2 && t.startsWith('0')) { t = t.slice(1); r = 8; }
  let v: f64 = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    const d = r === 16 ? hexval(c) : isDigit(c) ? c - 48 : -1;
    if (d < 0 || d >= r) return -1;
    v = v * r + d;
  }
  return v;
}
function endsInNumber(s: string): boolean {
  const parts = s.split('.');
  if (parts[parts.length - 1].length === 0) { if (parts.length === 1) return false; parts.pop(); }
  const last = parts[parts.length - 1];
  let digits = last.length > 0;
  for (let i = 0; i < last.length; i++) if (!isDigit(last.charCodeAt(i))) digits = false;
  return digits || ipv4Number(last) >= 0;
}
function parseIPv4(s: string): string {
  const parts = s.split('.');
  if (parts[parts.length - 1].length === 0 && parts.length > 1) parts.pop();
  if (parts.length > 4) { hostFailed = true; return ''; }
  const nums: f64[] = [];
  for (const p of parts) { const v = ipv4Number(p); if (v < 0) { hostFailed = true; return ''; } nums.push(v); }
  for (let i = 0; i < nums.length - 1; i++) if (nums[i] > 255) { hostFailed = true; return ''; }
  if (nums[nums.length - 1] >= pow256(5 - nums.length)) { hostFailed = true; return ''; }
  let ip: f64 = nums[nums.length - 1];
  for (let i = 0; i < nums.length - 1; i++) ip += nums[i] * pow256(3 - i);
  const out: string[] = [];
  for (let i = 0; i < 4; i++) { out.unshift(`${ip % 256}`); ip = fl(ip / 256); }
  return out.join('.');
}
function parseIPv6(c: i32[]): string {
  const a: i32[] = [0, 0, 0, 0, 0, 0, 0, 0];
  let piece: i32 = 0, compress: i32 = -1, p: i32 = 0;
  const n = c.length;
  const at = (i: i32): i32 => i < n ? c[i] : -1;
  const fail = (): string => { hostFailed = true; return ''; };
  if (at(0) === 58) { if (at(1) !== 58) return fail(); p = 2; piece = 1; compress = 1; }
  while (p < n) {
    if (piece === 8) return fail();
    if (at(p) === 58) { if (compress !== -1) return fail(); p++; piece++; compress = piece; continue; }
    let value: i32 = 0, len: i32 = 0;
    while (len < 4 && hexval(at(p)) >= 0) { value = value * 16 + hexval(at(p)); p++; len++; }
    if (at(p) === 46) {
      if (len === 0) return fail();
      p -= len;
      if (piece > 6) return fail();
      let seen: i32 = 0;
      while (p < n) {
        let v4: i32 = -1;
        if (seen > 0) { if (at(p) === 46 && seen < 4) p++; else return fail(); }
        if (!isDigit(at(p))) return fail();
        while (isDigit(at(p))) {
          const d = at(p) - 48;
          if (v4 === -1) v4 = d; else if (v4 === 0) return fail(); else v4 = v4 * 10 + d;
          if (v4 > 255) return fail();
          p++;
        }
        a[piece] = a[piece] * 256 + v4;
        seen++;
        if (seen === 2 || seen === 4) piece++;
      }
      if (seen !== 4) return fail();
      break;
    } else if (at(p) === 58) { p++; if (p >= n) return fail(); }
    else if (p < n) return fail();
    a[piece] = value;
    piece++;
  }
  if (compress !== -1) {
    let swaps = piece - compress;
    piece = 7;
    while (piece !== 0 && swaps > 0) { const t = a[piece]; a[piece] = a[compress + swaps - 1]; a[compress + swaps - 1] = t; piece--; swaps--; }
  } else if (piece !== 8) return fail();
  // serializer: the first longest run of two or more zero pieces becomes '::'
  let best: i32 = -1, bestLen: i32 = 1;
  for (let i = 0; i < 8;) {
    if (a[i] !== 0) { i++; continue; }
    let j = i;
    while (j < 8 && a[j] === 0) j++;
    if (j - i > bestLen) { best = i; bestLen = j - i; }
    i = j;
  }
  const out: string[] = ['['];
  let ignore0 = false;
  for (let i = 0; i < 8; i++) {
    if (ignore0 && a[i] === 0) continue;
    ignore0 = false;
    if (best === i) { out.push(i === 0 ? '::' : ':'); ignore0 = true; continue; }
    out.push(hexLower(a[i]));
    if (i !== 7) out.push(':');
  }
  out.push(']');
  return out.join('');
}
function hexLower(v: i32): string {
  const h = '0123456789abcdef';
  if (v === 0) return '0';
  let s = '', x = v;
  while (x > 0) { s = h.at(x & 15) + s; x = x >> 4; }
  return s;
}
// Punycode (RFC 3492) of one label's code points
function adapt(delta0: f64, numPoints: f64, first: boolean): f64 {
  let delta = first ? fl(delta0 / 700) : fl(delta0 / 2);
  delta += fl(delta / numPoints);
  let k: f64 = 0;
  while (delta > 455) { delta = fl(delta / 35); k += 36; }
  return k + fl((36 * delta) / (delta + 38));
}
function digitOf(d: f64): string { return d < 26 ? String.fromCharCode(97 + d) : String.fromCharCode(22 + d); }
function punycode(cs: i32[]): string {
  const out: string[] = [];
  for (const c of cs) if (c < 0x80) out.push(String.fromCharCode(c));
  const b = out.length;
  let h: f64 = b;
  if (b > 0) out.push('-');
  let n: f64 = 128, delta: f64 = 0, bias: f64 = 72;
  while (h < cs.length) {
    let m: f64 = 0x7FFFFFFF;
    for (const c of cs) if (c >= n && c < m) m = c;
    delta += (m - n) * (h + 1);
    n = m;
    for (const c of cs) {
      if (c < n) delta++;
      if (c === n) {
        let q = delta;
        for (let k: f64 = 36; ; k += 36) {
          const t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
          if (q < t) break;
          out.push(digitOf(t + ((q - t) % (36 - t))));
          q = fl((q - t) / (36 - t));
        }
        out.push(digitOf(q));
        bias = adapt(delta, h + 1, h === b);
        delta = 0;
        h++;
      }
    }
    delta++;
    n++;
  }
  return out.join('');
}
/** The parts of the UTS #46 mapping that URLs meet in practice: ignored code points removed (soft hyphen, zero
 *  width space / joiners, BOM, variation selectors), fullwidth ASCII and ideographic spaces / full stops folded,
 *  mathematical alphanumerics to ASCII letters and digits; noncharacters and U+FFFD are disallowed (hostFailed).
 *  ponytail: no NFC and no full UTS #46 table; add the table when a non-Latin host needs it. */
function idnaMap(cs: i32[]): i32[] {
  const out: i32[] = [];
  for (const c of cs) {
    if (c === 0xAD || c === 0x200B || c === 0x2060 || c === 0xFEFF || c === 0x34F || (c >= 0x180B && c <= 0x180D) || (c >= 0xFE00 && c <= 0xFE0F)) continue;
    if (c === 0xFFFD || (c >= 0xFDD0 && c <= 0xFDEF) || (c & 0xFFFE) === 0xFFFE || (c >= 0x80 && c <= 0x9F)) { hostFailed = true; return []; }
    if (c >= 0xFF01 && c <= 0xFF5E) out.push(c - 0xFEE0);
    else if (c === 0x3000) out.push(32);
    else if (c === 0x3002 || c === 0xFF61) out.push(46);
    else if (c >= 0x1D400 && c <= 0x1D6A3) { const k = (c - 0x1D400) % 52; out.push(k < 26 ? 65 + k : 97 + k - 26); }
    else if (c >= 0x1D7CE && c <= 0x1D7FF) out.push(48 + (c - 0x1D7CE) % 10);
    else out.push(c);
  }
  return out;
}
function domainToASCII(domain: string): string {
  const mapped = idnaMap(codePoints(domain));
  if (hostFailed) return '';
  const labels = fromCodePoints(mapped).toLowerCase().split('.');
  const out: string[] = [];
  for (const l of labels) {
    const cs = codePoints(l);
    let ascii = true;
    for (const c of cs) if (c >= 0x80) ascii = false;
    out.push(ascii ? l : 'xn--' + punycode(cs));
  }
  return out.join('.');
}
/** Host parser; sets hostFailed on failure. */
function parseHost(input: i32[], notSpecial: boolean): string {
  hostFailed = false;
  const n = input.length;
  if (n > 0 && input[0] === 91) {
    if (input[n - 1] !== 93) { hostFailed = true; return ''; }
    return parseIPv6(input.slice(1, n - 1));
  }
  if (notSpecial) {
    for (const c of input) if (c !== 37 && forbiddenHost(c)) { hostFailed = true; return ''; }
    const out: string[] = [];
    for (const c of input) pctCp(out, c, C0_SET);
    return out.join('');
  }
  const domain = utf8Decode(pctDecodeBytes(fromCodePoints(input), false));
  const ascii = domainToASCII(domain);
  if (hostFailed || ascii.length === 0) { hostFailed = true; return ''; }
  for (let i = 0; i < ascii.length; i++) if (forbiddenDomain(ascii.charCodeAt(i))) { hostFailed = true; return ''; }
  if (endsInNumber(ascii)) return parseIPv4(ascii);
  return ascii;
}

// ================================================================ URL Standard: records and the basic URL parser
class UrlRecord {
  scheme: string = '';
  username: string = '';
  password: string = '';
  host: string = '';
  hasHost: boolean = false;
  port: i32 = -1;
  path: string[] = [];
  opaque: boolean = false;
  query: string = '';
  hasQuery: boolean = false;
  fragment: string = '';
  hasFragment: boolean = false;
  special(): boolean { return SPECIAL.includes(this.scheme); }
  shorten(): void {
    if (this.scheme === 'file' && this.path.length === 1 && isNormalizedDrive(this.path[0])) return;
    if (this.path.length > 0) this.path.pop();
  }
  serializePath(): string {
    if (this.opaque) return this.path[0];
    const out: string[] = [];
    for (const s of this.path) { out.push('/'); out.push(s); }
    return out.join('');
  }
  href(excludeFragment: boolean = false): string {
    const out: string[] = [this.scheme, ':'];
    if (this.hasHost) {
      out.push('//');
      if (this.username.length > 0 || this.password.length > 0) {
        out.push(this.username);
        if (this.password.length > 0) { out.push(':'); out.push(this.password); }
        out.push('@');
      }
      out.push(this.host);
      if (this.port >= 0) out.push(`:${this.port}`);
    } else if (!this.opaque && this.path.length > 1 && this.path[0].length === 0) out.push('/.');
    out.push(this.serializePath());
    if (this.hasQuery) { out.push('?'); out.push(this.query); }
    if (!excludeFragment && this.hasFragment) { out.push('#'); out.push(this.fragment); }
    return out.join('');
  }
}
function isDrive(cs: i32[], i: i32): boolean { return i + 1 < cs.length && isAlpha(cs[i]) && (cs[i + 1] === 58 || cs[i + 1] === 124); }
function isNormalizedDrive(s: string): boolean { return s.length === 2 && isAlpha(s.charCodeAt(0)) && s.charCodeAt(1) === 58; }
function startsWithDrive(cs: i32[], i: i32): boolean {
  if (!isDrive(cs, i)) return false;
  if (cs.length - i === 2) return true;
  const c = cs[i + 2];
  return c === 47 || c === 92 || c === 63 || c === 35;
}
function isSingleDot(s: string): boolean { return s === '.' || s.toLowerCase() === '%2e'; }
function isDoubleDot(s: string): boolean { const l = s.toLowerCase(); return l === '..' || l === '.%2e' || l === '%2e.' || l === '%2e%2e'; }

const S_SCHEME_START = 0, S_SCHEME = 1, S_NO_SCHEME = 2, S_SPECIAL_REL_OR_AUTH = 3, S_PATH_OR_AUTH = 4, S_RELATIVE = 5,
  S_RELATIVE_SLASH = 6, S_SPECIAL_AUTH_SLASHES = 7, S_SPECIAL_AUTH_IGNORE_SLASHES = 8, S_AUTHORITY = 9, S_HOST = 10,
  S_PORT = 11, S_FILE = 12, S_FILE_SLASH = 13, S_FILE_HOST = 14, S_PATH_START = 15, S_PATH = 16, S_OPAQUE_PATH = 17,
  S_QUERY = 18, S_FRAGMENT = 19;
/** The basic URL parser (no state override); null on failure. */
function parseURL(input: string, base: UrlRecord | null): UrlRecord | null {
  const raw = codePoints(input);
  let lo: i32 = 0, hi: i32 = raw.length;
  while (lo < hi && raw[lo] <= 0x20) lo++;
  while (hi > lo && raw[hi - 1] <= 0x20) hi--;
  const c: i32[] = [];
  for (let i = lo; i < hi; i++) if (raw[i] !== 9 && raw[i] !== 10 && raw[i] !== 13) c.push(raw[i]);
  const n = c.length;
  const url = new UrlRecord();
  let state = S_SCHEME_START;
  let buf: i32[] = [];
  let pbuf = '';
  let atSeen = false, inBrackets = false, passwordSeen = false;
  let p: i32 = 0;
  for (;;) {
    const ch: i32 = p < n ? c[p] : -1;
    const next: i32 = p + 1 < n ? c[p + 1] : -1;
    const special = url.special();
    const slashy = ch === 47 || (special && ch === 92);
    if (state === S_SCHEME_START) {
      if (isAlpha(ch)) { buf.push(ch | 0x20); state = S_SCHEME; }
      else { state = S_NO_SCHEME; p--; }
    } else if (state === S_SCHEME) {
      if (isAlnum(ch) || ch === 43 || ch === 45 || ch === 46) buf.push(isAlpha(ch) ? ch | 0x20 : ch);
      else if (ch === 58) {
        url.scheme = fromCodePoints(buf);
        buf = [];
        if (url.scheme === 'file') state = S_FILE;
        else if (url.special() && base !== null && base.scheme === url.scheme) state = S_SPECIAL_REL_OR_AUTH;
        else if (url.special()) state = S_SPECIAL_AUTH_SLASHES;
        else if (next === 47) { state = S_PATH_OR_AUTH; p++; }
        else { url.opaque = true; url.path = ['']; state = S_OPAQUE_PATH; }
      } else { buf = []; state = S_NO_SCHEME; p = -1; }
    } else if (state === S_NO_SCHEME) {
      if (base === null || (base.opaque && ch !== 35)) return null;
      if (base.opaque && ch === 35) {
        url.scheme = base.scheme; url.path = base.path.slice(); url.opaque = true;
        url.query = base.query; url.hasQuery = base.hasQuery; url.hasFragment = true;
        state = S_FRAGMENT;
      } else { state = base.scheme !== 'file' ? S_RELATIVE : S_FILE; p--; }
    } else if (state === S_SPECIAL_REL_OR_AUTH) {
      if (ch === 47 && next === 47) { state = S_SPECIAL_AUTH_IGNORE_SLASHES; p++; }
      else { state = S_RELATIVE; p--; }
    } else if (state === S_PATH_OR_AUTH) {
      if (ch === 47) state = S_AUTHORITY; else { state = S_PATH; p--; }
    } else if (state === S_RELATIVE) {
      const b = base as UrlRecord;
      url.scheme = b.scheme;
      if (ch === 47 || (url.special() && ch === 92)) state = S_RELATIVE_SLASH;
      else {
        url.username = b.username; url.password = b.password; url.host = b.host; url.hasHost = b.hasHost; url.port = b.port;
        url.path = b.path.slice(); url.query = b.query; url.hasQuery = b.hasQuery;
        if (ch === 63) { url.query = ''; url.hasQuery = true; state = S_QUERY; }
        else if (ch === 35) { url.hasFragment = true; state = S_FRAGMENT; }
        else if (ch !== -1) { url.query = ''; url.hasQuery = false; url.shorten(); state = S_PATH; p--; }
      }
    } else if (state === S_RELATIVE_SLASH) {
      if (special && (ch === 47 || ch === 92)) state = S_SPECIAL_AUTH_IGNORE_SLASHES;
      else if (ch === 47) state = S_AUTHORITY;
      else {
        const b = base as UrlRecord;
        url.username = b.username; url.password = b.password; url.host = b.host; url.hasHost = b.hasHost; url.port = b.port;
        state = S_PATH; p--;
      }
    } else if (state === S_SPECIAL_AUTH_SLASHES) {
      if (ch === 47 && next === 47) { state = S_SPECIAL_AUTH_IGNORE_SLASHES; p++; }
      else { state = S_SPECIAL_AUTH_IGNORE_SLASHES; p--; }
    } else if (state === S_SPECIAL_AUTH_IGNORE_SLASHES) {
      if (ch !== 47 && ch !== 92) { state = S_AUTHORITY; p--; }
    } else if (state === S_AUTHORITY) {
      if (ch === 64) {
        if (atSeen) { const at: i32[] = [37, 52, 48]; buf = at.concat(buf); }
        atSeen = true;
        const u: string[] = [], pw: string[] = [];
        for (const x of buf) {
          if (x === 58 && !passwordSeen) { passwordSeen = true; continue; }
          pctCp(passwordSeen ? pw : u, x, USERINFO_SET);
        }
        url.username += u.join('');
        url.password += pw.join('');
        buf = [];
      } else if (ch === -1 || slashy || ch === 63 || ch === 35) {
        if (atSeen && buf.length === 0) return null;
        p -= buf.length + 1;
        buf = [];
        state = S_HOST;
      } else buf.push(ch);
    } else if (state === S_HOST) {
      if (ch === 58 && !inBrackets) {
        if (buf.length === 0) return null;
        const h = parseHost(buf, !special);
        if (hostFailed) return null;
        url.host = h; url.hasHost = true; buf = [];
        state = S_PORT;
      } else if (ch === -1 || slashy || ch === 63 || ch === 35) {
        p--;
        if (special && buf.length === 0) return null;
        const h = parseHost(buf, !special);
        if (hostFailed) return null;
        url.host = h; url.hasHost = true; buf = [];
        state = S_PATH_START;
      } else {
        if (ch === 91) inBrackets = true;
        if (ch === 93) inBrackets = false;
        buf.push(ch);
      }
    } else if (state === S_PORT) {
      if (isDigit(ch)) buf.push(ch);
      else if (ch === -1 || slashy || ch === 63 || ch === 35) {
        if (buf.length > 0) {
          let port: f64 = 0;
          for (const d of buf) { port = port * 10 + (d - 48); if (port > 65535) return null; }
          url.port = port === defaultPort(url.scheme) ? -1 : port;
          buf = [];
        }
        state = S_PATH_START; p--;
      } else return null;
    } else if (state === S_FILE) {
      url.scheme = 'file'; url.host = ''; url.hasHost = true;
      if (ch === 47 || ch === 92) state = S_FILE_SLASH;
      else if (base !== null && base.scheme === 'file') {
        url.host = base.host; url.hasHost = base.hasHost; url.path = base.path.slice(); url.query = base.query; url.hasQuery = base.hasQuery;
        if (ch === 63) { url.query = ''; url.hasQuery = true; state = S_QUERY; }
        else if (ch === 35) { url.hasFragment = true; state = S_FRAGMENT; }
        else if (ch !== -1) {
          url.query = ''; url.hasQuery = false;
          if (!startsWithDrive(c, p)) url.shorten(); else url.path = [];
          state = S_PATH; p--;
        }
      } else { state = S_PATH; p--; }
    } else if (state === S_FILE_SLASH) {
      if (ch === 47 || ch === 92) state = S_FILE_HOST;
      else {
        if (base !== null && base.scheme === 'file') {
          url.host = base.host; url.hasHost = base.hasHost;
          if (!startsWithDrive(c, p) && base.path.length > 0 && isNormalizedDrive(base.path[0])) url.path.push(base.path[0]);
        }
        state = S_PATH; p--;
      }
    } else if (state === S_FILE_HOST) {
      if (ch === -1 || ch === 47 || ch === 92 || ch === 63 || ch === 35) {
        p--;
        if (buf.length === 2 && isDrive(buf, 0)) { pbuf = fromCodePoints(buf); buf = []; state = S_PATH; }
        else if (buf.length === 0) { url.host = ''; url.hasHost = true; state = S_PATH_START; }
        else {
          let h = parseHost(buf, false);
          if (hostFailed) return null;
          if (h === 'localhost') h = '';
          url.host = h; url.hasHost = true; buf = [];
          state = S_PATH_START;
        }
      } else buf.push(ch);
    } else if (state === S_PATH_START) {
      if (special) { state = S_PATH; if (ch !== 47 && ch !== 92) p--; }
      else if (ch === 63) { url.query = ''; url.hasQuery = true; state = S_QUERY; }
      else if (ch === 35) { url.hasFragment = true; state = S_FRAGMENT; }
      else if (ch !== -1) { state = S_PATH; if (ch !== 47) p--; }
    } else if (state === S_PATH) {
      if (ch === -1 || slashy || ch === 63 || ch === 35) {
        if (isDoubleDot(pbuf)) {
          url.shorten();
          if (!slashy) url.path.push('');
        } else if (isSingleDot(pbuf) && !slashy) url.path.push('');
        else if (!isSingleDot(pbuf)) {
          if (url.scheme === 'file' && url.path.length === 0 && pbuf.length === 2 && isAlpha(pbuf.charCodeAt(0)) && (pbuf.at(1) === ':' || pbuf.at(1) === '|')) pbuf = pbuf.at(0) + ':';
          url.path.push(pbuf);
        }
        pbuf = '';
        if (ch === 63) { url.query = ''; url.hasQuery = true; state = S_QUERY; }
        if (ch === 35) { url.hasFragment = true; state = S_FRAGMENT; }
      } else {
        const out: string[] = [];
        pctCp(out, ch, PATH_SET);
        pbuf += out.join('');
      }
    } else if (state === S_OPAQUE_PATH) {
      if (ch === 63) { url.query = ''; url.hasQuery = true; state = S_QUERY; }
      else if (ch === 35) { url.hasFragment = true; state = S_FRAGMENT; }
      else if (ch === 32 && (next === 63 || next === 35)) url.path[0] = url.path[0] + '%20';
      else if (ch !== -1) { const out: string[] = []; pctCp(out, ch, C0_SET); url.path[0] = url.path[0] + out.join(''); }
    } else if (state === S_QUERY) {
      if (ch === 35 || ch === -1) {
        const out: string[] = [];
        const set = special ? SPECIAL_QUERY_SET : QUERY_SET;
        for (const x of buf) pctCp(out, x, set);
        url.query += out.join('');
        buf = [];
        if (ch === 35) { url.hasFragment = true; state = S_FRAGMENT; }
      } else buf.push(ch);
    } else if (state === S_FRAGMENT) {
      if (ch !== -1) { const out: string[] = []; pctCp(out, ch, FRAGMENT_SET); url.fragment += out.join(''); }
    }
    if (p >= n) break;
    p++;
  }
  return url;
}

// ================================================================ URLSearchParams
/** WebIDL USVString conversion of the values Zinc can hold as unknown. */
function usv(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return `${v}`;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  throw new TypeError('Cannot convert value to a string');
}
/** URLSearchParams(init): a query string ('?' optional), [name, value] pairs, or another URLSearchParams.
 *  @throws TypeError when a pair does not have exactly two strings */
export class URLSearchParams {
  private ks: string[] = [];
  private vs: string[] = [];
  @weak owner: URL | null = null;

  constructor(init: unknown = '') {
    if (typeof init === 'string') this.parse(init.startsWith('?') ? init.slice(1) : init);
    else if (init instanceof URLSearchParams) { this.ks = init.ks.slice(); this.vs = init.vs.slice(); }
    else if (Array.isArray(init)) {
      for (const pair of init) {
        if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError('Each query pair must be an iterable [name, value] tuple');
        this.ks.push(usv(pair[0]));
        this.vs.push(usv(pair[1]));
      }
    }
  }
  parse(q: string): void {
    this.ks = []; this.vs = [];
    if (q.length === 0) return;
    for (const part of q.split('&')) {
      if (part.length === 0) continue;
      const eq = part.indexOf('=');
      this.ks.push(pctDecode(eq < 0 ? part : part.slice(0, eq), true));
      this.vs.push(eq < 0 ? '' : pctDecode(part.slice(eq + 1), true));
    }
  }
  get size(): i32 { return this.ks.length; }
  append(name: string, value: string): void { this.ks.push(name); this.vs.push(value); this.changed(); }
  /** Removes every pair with this name (and this value, when given). */
  delete(name: string, value: string | null = null): void {
    for (let i = this.ks.length - 1; i >= 0; i--) if (this.ks[i] === name && (value === null || this.vs[i] === value)) { this.ks.splice(i, 1); this.vs.splice(i, 1); }
    this.changed();
  }
  get(name: string): string | null { const i = this.ks.indexOf(name); return i < 0 ? null : this.vs[i]; }
  getAll(name: string): string[] { const r: string[] = []; for (let i = 0; i < this.ks.length; i++) if (this.ks[i] === name) r.push(this.vs[i]); return r; }
  has(name: string, value: string | null = null): boolean {
    for (let i = 0; i < this.ks.length; i++) if (this.ks[i] === name && (value === null || this.vs[i] === value)) return true;
    return false;
  }
  set(name: string, value: string): void {
    const i = this.ks.indexOf(name);
    if (i < 0) { this.append(name, value); return; }
    this.vs[i] = value;
    for (let j = this.ks.length - 1; j > i; j--) if (this.ks[j] === name) { this.ks.splice(j, 1); this.vs.splice(j, 1); }
    this.changed();
  }
  /** Stable sort by name. */
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
    if (u !== null) u.queryFromParams(this.ks.length === 0 ? '' : this.toString(), this.ks.length > 0);
  }
}

// ================================================================ URL
/** Setters run the parser too: ASCII tab and newline are removed first. */
function noTabNl(v: string): string { return v.includes('\t') || v.includes('\n') || v.includes('\r') ? v.replaceAll('\t', '').replaceAll('\n', '').replaceAll('\r', '') : v; }
/** WHATWG URL. @throws TypeError 'Invalid URL' */
export class URL {
  private r: UrlRecord;
  private params: URLSearchParams | null = null;
  constructor(url: string, base: string | null = null) {
    let b: UrlRecord | null = null;
    if (base !== null) { b = parseURL(base, null); if (b === null) throw new TypeError(`Invalid base URL: ${base}`); }
    const r = parseURL(url, b);
    if (r === null) throw new TypeError(`Invalid URL: ${url}`);
    this.r = r;
  }
  static canParse(url: string, base: string | null = null): boolean {
    let b: UrlRecord | null = null;
    if (base !== null) { b = parseURL(base, null); if (b === null) return false; }
    return parseURL(url, b) !== null;
  }
  /** Like the constructor, but null instead of throwing. */
  static parse(url: string, base: string | null = null): URL | null {
    return URL.canParse(url, base) ? new URL(url, base) : null;
  }
  get href(): string { return this.r.href(); }
  set href(v: string) {
    const r = parseURL(v, null);
    if (r === null) throw new TypeError(`Invalid URL: ${v}`);
    this.r = r;
    this.syncParams();
  }
  toString(): string { return this.r.href(); }
  toJSON(): string { return this.r.href(); }
  get origin(): string {
    const r = this.r;
    if (r.scheme === 'blob') { const inner = URL.parse(r.serializePath()); return inner !== null && (inner.protocol === 'http:' || inner.protocol === 'https:') ? inner.origin : 'null'; }
    if (!r.special() || r.scheme === 'file') return 'null';
    return r.scheme + '://' + r.host + (r.port >= 0 ? `:${r.port}` : '');
  }
  get protocol(): string { return this.r.scheme + ':'; }
  set protocol(v0: string) {
    const v = noTabNl(v0);
    const cs = codePoints(v);
    let i: i32 = 0;
    if (cs.length === 0 || !isAlpha(cs[0])) return;
    const s: i32[] = [];
    while (i < cs.length && (isAlnum(cs[i]) || cs[i] === 43 || cs[i] === 45 || cs[i] === 46)) { s.push(isAlpha(cs[i]) ? cs[i] | 0x20 : cs[i]); i++; }
    if (i < cs.length && cs[i] !== 58) return;
    const scheme = fromCodePoints(s), r = this.r;
    if (SPECIAL.includes(scheme) !== r.special()) return;
    if ((r.username.length > 0 || r.password.length > 0 || r.port >= 0) && scheme === 'file') return;
    if (r.scheme === 'file' && r.hasHost && r.host.length === 0) return;
    r.scheme = scheme;
    if (r.port === defaultPort(scheme)) r.port = -1;
  }
  private cannotHaveCredentials(): boolean { return !this.r.hasHost || this.r.host.length === 0 || this.r.scheme === 'file'; }
  get username(): string { return this.r.username; }
  set username(v: string) { if (!this.cannotHaveCredentials()) this.r.username = pctEncode(v, USERINFO_SET); }
  get password(): string { return this.r.password; }
  set password(v: string) { if (!this.cannotHaveCredentials()) this.r.password = pctEncode(v, USERINFO_SET); }
  get host(): string { const r = this.r; return !r.hasHost ? '' : r.port >= 0 ? `${r.host}:${r.port}` : r.host; }
  set host(v0: string) {
    const v = noTabNl(v0); this.setHost(v, true); }
  get hostname(): string { return this.r.hasHost ? this.r.host : ''; }
  set hostname(v0: string) {
    const v = noTabNl(v0); this.setHost(v, false); }
  private setHost(v: string, withPort: boolean): void {
    const r = this.r;
    if (r.opaque) return;
    const cs = codePoints(v);
    const h: i32[] = [];
    let i: i32 = 0, brackets = false;
    for (; i < cs.length; i++) {
      const c = cs[i];
      if (c === 58 && !brackets) break;
      if (c === 47 || c === 63 || c === 35 || (r.special() && c === 92)) break;
      if (c === 91) brackets = true;
      if (c === 93) brackets = false;
      h.push(c);
    }
    const colon = i < cs.length && cs[i] === 58;
    if (colon && (!withPort || r.scheme === 'file')) return;  // hostname never takes a port; file has none
    if (h.length === 0) {
      if (r.special() && r.scheme !== 'file') return;
      if (colon) return;
      if (r.username.length > 0 || r.password.length > 0 || r.port >= 0) return;
    }
    const host = h.length === 0 ? '' : parseHost(h, !r.special());
    if (h.length > 0 && hostFailed) return;
    r.host = r.scheme === 'file' && host === 'localhost' ? '' : host;
    r.hasHost = true;
    if (colon && i + 1 < cs.length) this.port = fromCodePoints(cs.slice(i + 1));
  }
  get port(): string { return this.r.port >= 0 ? `${this.r.port}` : ''; }
  set port(v0: string) {
    const v = noTabNl(v0);
    if (this.cannotHaveCredentials()) return;
    if (v0.length === 0) { this.r.port = -1; return; }
    let port: f64 = 0, digits: i32 = 0;
    for (let i = 0; i < v.length && isDigit(v.charCodeAt(i)); i++) { port = port * 10 + (v.charCodeAt(i) - 48); digits++; if (port > 65535) return; }
    if (digits === 0) return;
    this.r.port = port === defaultPort(this.r.scheme) ? -1 : port;
  }
  get pathname(): string { return this.r.serializePath(); }
  set pathname(v0: string) {
    const v = noTabNl(v0);
    const r = this.r;
    if (r.opaque) return;
    r.path = [];
    const cs = codePoints(v);
    let start: i32 = 0;
    if (cs.length > 0 && (cs[0] === 47 || (r.special() && cs[0] === 92))) start = 1;
    else if (!r.special() && cs.length === 0) { if (!r.hasHost) r.path.push(''); return; }
    let seg: string[] = [];
    for (let i = start; i <= cs.length; i++) {
      const c = i < cs.length ? cs[i] : -1;
      const slashy = c === 47 || (r.special() && c === 92);
      if (c === -1 || slashy) {
        const s = seg.join('');
        if (isDoubleDot(s)) { r.shorten(); if (!slashy) r.path.push(''); }
        else if (isSingleDot(s) && !slashy) r.path.push('');
        else if (!isSingleDot(s)) r.path.push(r.scheme === 'file' && r.path.length === 0 && s.length === 2 && isAlpha(s.charCodeAt(0)) && s.at(1) === '|' ? s.at(0) + ':' : s);
        seg = [];
      } else pctCp(seg, c, PATH_SET);
    }
  }
  get search(): string { return this.r.hasQuery && this.r.query.length > 0 ? '?' + this.r.query : ''; }
  set search(v0: string) {
    const v = noTabNl(v0);
    const r = this.r;
    if (v.length === 0) { r.query = ''; r.hasQuery = false; this.syncParams(); return; }
    const q = v.startsWith('?') ? v.slice(1) : v;
    r.query = '';
    const out: string[] = [];
    for (const c of codePoints(q)) pctCp(out, c, r.special() ? SPECIAL_QUERY_SET : QUERY_SET);
    r.query = out.join('');
    r.hasQuery = true;
    this.syncParams();
  }
  get hash(): string { return this.r.hasFragment && this.r.fragment.length > 0 ? '#' + this.r.fragment : ''; }
  set hash(v0: string) {
    const v = noTabNl(v0);
    const r = this.r;
    if (v.length === 0) { r.fragment = ''; r.hasFragment = false; return; }
    r.fragment = pctEncode(v.startsWith('#') ? v.slice(1) : v, FRAGMENT_SET);
    r.hasFragment = true;
  }
  /** Live: changing it rewrites the query. */
  get searchParams(): URLSearchParams {
    const p = this.params;
    if (p !== null) return p;
    const n = new URLSearchParams(this.r.query);
    n.owner = this;
    this.params = n;
    return n;
  }
  private syncParams(): void { const p = this.params; if (p !== null) p.parse(this.r.query); }
  queryFromParams(q: string, present: boolean): void { this.r.query = q; this.r.hasQuery = present; }
}

// ================================================================ DOM Standard: events
export interface EventInit { bubbles?: boolean; cancelable?: boolean; composed?: boolean }
export class Event {
  static readonly NONE: i32 = 0;
  static readonly CAPTURING_PHASE: i32 = 1;
  static readonly AT_TARGET: i32 = 2;
  static readonly BUBBLING_PHASE: i32 = 3;
  readonly type: string;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  readonly composed: boolean;
  readonly isTrusted: boolean = false;
  readonly timeStamp: f64 = performance.now();
  target: EventTarget | null = null;
  currentTarget: EventTarget | null = null;
  eventPhase: i32 = 0;
  canceled: boolean = false;
  stopFlag: boolean = false;
  stopImmediateFlag: boolean = false;
  dispatching: boolean = false;
  inPassive: boolean = false;
  constructor(type: string, init: EventInit = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? false;
    this.cancelable = init.cancelable ?? false;
    this.composed = init.composed ?? false;
  }
  get defaultPrevented(): boolean { return this.canceled; }
  get returnValue(): boolean { return !this.canceled; }
  set returnValue(v: boolean) { if (!v) this.preventDefault(); }
  get cancelBubble(): boolean { return this.stopFlag; }
  set cancelBubble(v: boolean) { if (v) this.stopFlag = true; }
  get srcElement(): EventTarget | null { return this.target; }
  preventDefault(): void { if (this.cancelable && !this.inPassive) this.canceled = true; }
  stopPropagation(): void { this.stopFlag = true; }
  stopImmediatePropagation(): void { this.stopFlag = true; this.stopImmediateFlag = true; }
  /** [currentTarget] while dispatching, [] otherwise (no tree here). */
  composedPath(): EventTarget[] { const t = this.currentTarget; return t !== null ? [t] : []; }
}
export interface CustomEventInit<T> extends EventInit { detail: T }
/** `new CustomEvent<T>('name', { detail })`; listeners read `(e as CustomEvent<T>).detail`. */
export class CustomEvent<T> extends Event {
  readonly detail: T;
  constructor(type: string, init: CustomEventInit<T>) { super(type, init); this.detail = init.detail; }
}
export interface ErrorEventInit extends EventInit { message?: string; filename?: string; lineno?: i32; colno?: i32; error?: unknown }
export class ErrorEvent extends Event {
  readonly message: string; readonly filename: string; readonly lineno: i32; readonly colno: i32; readonly error: unknown;
  constructor(type: string, init: ErrorEventInit = {}) {
    super(type, init);
    this.message = init.message ?? ''; this.filename = init.filename ?? ''; this.lineno = init.lineno ?? 0; this.colno = init.colno ?? 0;
    this.error = init.error;
  }
}
export interface MessageEventInit extends EventInit { data?: unknown; origin?: string; lastEventId?: string }
export class MessageEvent extends Event {
  readonly data: unknown; readonly origin: string; readonly lastEventId: string;
  readonly source: MessagePort | null = null;
  readonly ports: MessagePort[] = [];
  constructor(type: string, init: MessageEventInit = {}) {
    super(type, init);
    this.data = init.data; this.origin = init.origin ?? ''; this.lastEventId = init.lastEventId ?? '';
  }
}
export interface PromiseRejectionEventInit extends EventInit { reason?: unknown }
/** The rejected promise itself is not kept (Zinc promises are typed); `reason` is. */
export class PromiseRejectionEvent extends Event {
  readonly reason: unknown;
  constructor(type: string, init: PromiseRejectionEventInit = {}) { super(type, init); this.reason = init.reason; }
}
export type EventListener = (e: Event) => void;
export interface EventListenerOptions { capture?: boolean }
export interface AddEventListenerOptions extends EventListenerOptions { once?: boolean; passive?: boolean; signal?: AbortSignal }
class Listener {
  f: EventListener; capture: boolean; once: boolean; passive: boolean; removed: boolean = false;
  constructor(f: EventListener, capture: boolean, once: boolean, passive: boolean) { this.f = f; this.capture = capture; this.once = once; this.passive = passive; }
}
export class EventTarget {
  private ls = new Map<string, Listener[]>();
  /** The options object form (a boolean `useCapture` is `{ capture: true }`). */
  addEventListener(type: string, callback: EventListener | null, options: AddEventListenerOptions = {}): void {
    if (callback === null) return;
    const f: EventListener = callback;
    const signal = options.signal;
    if (signal !== undefined && signal.aborted) return;
    const capture = options.capture ?? false;
    let l = this.ls.get(type);
    if (l === undefined) { l = []; this.ls.set(type, l); }
    for (const x of l) if (x.f === f && x.capture === capture) return;
    l.push(new Listener(f, capture, options.once ?? false, options.passive ?? false));
    if (signal !== undefined) signal.addEventListener('abort', (e: Event) => { this.removeEventListener(type, f, { capture: capture }); });
  }
  removeEventListener(type: string, callback: EventListener | null, options: EventListenerOptions = {}): void {
    const l = this.ls.get(type);
    if (l === undefined || callback === null) return;
    const capture = options.capture ?? false;
    for (let i = 0; i < l.length; i++) if (l[i].f === callback && l[i].capture === capture) { l[i].removed = true; l.splice(i, 1); return; }
  }
  /** Runs the listeners in order (an exception is reported with reportError and the next one runs); false when a
   *  cancelable event was prevented. @throws DOMException InvalidStateError when the event is being dispatched */
  dispatchEvent(event: Event): boolean {
    if (event.dispatching) throw new DOMException('The event is already being dispatched.', 'InvalidStateError');
    event.dispatching = true;
    event.target = this;
    event.currentTarget = this;
    event.eventPhase = Event.AT_TARGET;
    const l = this.ls.get(event.type);
    if (l !== undefined) {
      for (const x of l.slice()) {
        if (x.removed) continue;
        if (x.once) this.removeEventListener(event.type, x.f, { capture: x.capture });
        event.inPassive = x.passive;
        try { x.f(event); } catch (e) { reportError(e); }
        event.inPassive = false;
        if (event.stopImmediateFlag) break;
      }
    }
    event.eventPhase = Event.NONE;
    event.currentTarget = null;
    event.dispatching = false;
    event.stopFlag = false;
    event.stopImmediateFlag = false;
    return !event.canceled;
  }
}

/** HTML "report an exception": prints like an uncaught error (the program goes on). */
export function reportError(e: unknown): void {
  if (e instanceof Error) console.error(`Uncaught ${e.name}: ${e.message}`);
  else if (typeof e === 'string') console.error(`Uncaught ${e}`);
  else console.error('Uncaught exception');
}

// ================================================================ DOM Standard: aborting
export class AbortSignal extends EventTarget {
  aborted: boolean = false;
  /** A DOMException AbortError / TimeoutError unless abort() was given a reason. */
  reason: unknown = undefined;
  onabort: ((e: Event) => void) | null = null;
  private dependents: AbortSignal[] = [];
  /** @throws the reason when it is an Error, else a DOMException AbortError */
  throwIfAborted(): void {
    if (!this.aborted) return;
    const r = this.reason;
    if (r instanceof Error) throw r;
    throw new DOMException('signal is aborted without reason', 'AbortError');
  }
  signalAbort(reason: unknown): void {
    if (this.aborted) return;
    this.aborted = true;
    this.reason = reason === undefined ? new DOMException('This operation was aborted', 'AbortError') : reason;
    const e = new Event('abort');
    const f = this.onabort;
    if (f !== null) { try { f(e); } catch (err) { reportError(err); } }
    this.dispatchEvent(e);
    for (const d of this.dependents) d.signalAbort(this.reason);
    this.dependents = [];
  }
  static abort(reason: unknown = undefined): AbortSignal { const s = new AbortSignal(); s.signalAbort(reason); return s; }
  /** Aborts after `ms` with a DOMException TimeoutError. */
  static timeout(ms: number): AbortSignal {
    const s = new AbortSignal();
    setTimeout(() => { s.signalAbort(new DOMException('signal timed out', 'TimeoutError')); }, ms);
    return s;
  }
  /** Aborts as soon as any of the signals does, with its reason. */
  static any(signals: AbortSignal[]): AbortSignal {
    const s = new AbortSignal();
    for (const x of signals) if (x.aborted) { s.signalAbort(x.reason); return s; }
    for (const x of signals) x.dependents.push(s);
    return s;
  }
}
export class AbortController {
  readonly signal: AbortSignal = new AbortSignal();
  abort(reason: unknown = undefined): void { this.signal.signalAbort(reason); }
}

// ================================================================ HTML: channel messaging
/** One end of a MessageChannel. Messages are delivered as tasks (setTimeout 0) once the port is started (start(),
 *  or setting onmessage). The data is passed as it is, not structured-cloned (one heap, one thread). */
export class MessagePort extends EventTarget {
  @weak other: MessagePort | null = null;
  private started: boolean = false;
  private closed: boolean = false;
  private queue: unknown[] = [];
  private handler: ((e: MessageEvent) => void) | null = null;
  get onmessage(): ((e: MessageEvent) => void) | null { return this.handler; }
  set onmessage(f: ((e: MessageEvent) => void) | null) { this.handler = f; this.start(); }
  postMessage(message: unknown): void {
    const o = this.other;
    if (this.closed || o === null) return;
    o.enqueue(message);
  }
  enqueue(message: unknown): void {
    if (this.closed) return;
    this.queue.push(message);
    if (this.started) this.flushSoon();
  }
  start(): void { if (this.started) return; this.started = true; if (this.queue.length > 0) this.flushSoon(); }
  close(): void { this.closed = true; this.queue = []; const o = this.other; if (o !== null) o.other = null; this.other = null; }
  private flushSoon(): void {
    setTimeout(() => {
      while (this.queue.length > 0 && !this.closed) {
        const m = this.queue.shift();
        const e = new MessageEvent('message', { data: m });
        const h = this.handler;
        if (h !== null) { try { h(e); } catch (err) { reportError(err); } }
        this.dispatchEvent(e);
      }
    }, 0);
  }
}
export class MessageChannel {
  readonly port1: MessagePort = new MessagePort();
  readonly port2: MessagePort = new MessagePort();
  constructor() { this.port1.other = this.port2; this.port2.other = this.port1; }
}

// ================================================================ File API: Blob and File; XHR: FormData
export interface BlobPropertyBag { type?: string; endings?: string }
function lowerType(t: string): string {
  for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); if (c < 0x20 || c > 0x7E) return ''; }
  return t.toLowerCase();
}
/** Immutable bytes with a MIME type. Parts are strings (UTF-8) or Blobs; `Blob.fromBytes` wraps u8[] (a Zinc u8[]
 *  cannot travel through the `unknown` parts list). */
export class Blob {
  readonly data: u8[];
  readonly type: string;
  constructor(parts: unknown[] = [], options: BlobPropertyBag = {}) {
    const d: u8[] = [];
    for (const p of parts) {
      if (typeof p === 'string') { for (const b of utf8Encode(p)) d.push(b); }
      else if (p instanceof Blob) { for (const b of p.data) d.push(b); }
      else throw new TypeError('Blob parts must be strings or Blobs (use Blob.fromBytes for bytes)');
    }
    this.data = d;
    this.type = lowerType(options.type ?? '');
  }
  static fromBytes(bytes: u8[], type: string = ''): Blob { const b = new Blob([], { type: type }); for (const x of bytes) b.data.push(x); return b; }
  get size(): i32 { return this.data.length; }
  /** Bytes [start, end) (negative: from the end), with a new type. */
  slice(start: i32 = 0, end: i32 = 0x7FFFFFFF, contentType: string = ''): Blob {
    const n = this.data.length;
    const s: i32 = start < 0 ? (n + start > 0 ? n + start : 0) : start < n ? start : n;
    const e: i32 = end < 0 ? (n + end > 0 ? n + end : 0) : end < n ? end : n;
    return Blob.fromBytes(e > s ? this.data.slice(s, e) : [], contentType);
  }
  async text(): Promise<string> { return utf8Decode(this.data); }
  async bytes(): Promise<u8[]> { return this.data.slice(); }
  /** Same as bytes() (no ArrayBuffer in Zinc). */
  async arrayBuffer(): Promise<u8[]> { return this.data.slice(); }
}
export interface FilePropertyBag extends BlobPropertyBag { lastModified?: f64 }
export class File extends Blob {
  readonly name: string;
  readonly lastModified: f64;
  constructor(parts: unknown[], name: string, options: FilePropertyBag = {}) {
    super(parts, options);
    this.name = name;
    this.lastModified = options.lastModified ?? Date.now();
  }
  get webkitRelativePath(): string { return ''; }
}
/** Entries are a string or a File; get() returns `unknown` (null when absent): narrow with typeof / instanceof. */
export class FormData {
  private ks: string[] = [];
  private vs: unknown[] = [];
  private entry(value: unknown, filename: string | null): unknown {
    if (typeof value === 'string') return value;
    if (value instanceof File && filename === null) return value;
    if (value instanceof Blob) return new File([value], filename ?? (value instanceof File ? value.name : 'blob'), { type: value.type });
    return usv(value);
  }
  append(name: string, value: unknown, filename: string | null = null): void { this.ks.push(name); this.vs.push(this.entry(value, filename)); }
  set(name: string, value: unknown, filename: string | null = null): void {
    const v = this.entry(value, filename);
    const i = this.ks.indexOf(name);
    if (i < 0) { this.ks.push(name); this.vs.push(v); return; }
    this.vs[i] = v;
    for (let j = this.ks.length - 1; j > i; j--) if (this.ks[j] === name) { this.ks.splice(j, 1); this.vs.splice(j, 1); }
  }
  delete(name: string): void { for (let i = this.ks.length - 1; i >= 0; i--) if (this.ks[i] === name) { this.ks.splice(i, 1); this.vs.splice(i, 1); } }
  get(name: string): unknown { const i = this.ks.indexOf(name); return i < 0 ? null : this.vs[i]; }
  getAll(name: string): unknown[] { const r: unknown[] = []; for (let i = 0; i < this.ks.length; i++) if (this.ks[i] === name) r.push(this.vs[i]); return r; }
  has(name: string): boolean { return this.ks.includes(name); }
  keys(): string[] { return this.ks.slice(); }
  values(): unknown[] { return this.vs.slice(); }
  forEach(f: (value: unknown, name: string) => void): void { for (let i = 0; i < this.ks.length; i++) f(this.vs[i], this.ks[i]); }
  /** multipart/form-data body (RFC 7578) with this boundary. */
  multipart(boundary: string): u8[] {
    const out: u8[] = [];
    const put = (s: string): void => { for (const b of utf8Encode(s)) out.push(b); };
    const esc = (s: string): string => s.replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\n', '%0A').replaceAll('"', '%22');
    for (let i = 0; i < this.ks.length; i++) {
      const v = this.vs[i];
      put(`--${boundary}\r\nContent-Disposition: form-data; name="${esc(this.ks[i])}"`);
      if (v instanceof File) {
        put(`; filename="${esc(v.name)}"\r\nContent-Type: ${v.type.length > 0 ? v.type : 'application/octet-stream'}\r\n\r\n`);
        for (const b of v.data) out.push(b);
      } else if (typeof v === 'string') put(`\r\n\r\n${v.replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\n', '\r\n')}`);
      put('\r\n');
    }
    put(`--${boundary}--\r\n`);
    return out;
  }
}

// ================================================================ HTML: navigator
export class Navigator {
  /** WinterTC: a runtime identifies itself in the default User-Agent. */
  readonly userAgent: string = 'Zinc/0.1';
}
export const navigator: Navigator = new Navigator();

// ================================================================ Web Cryptography: SHA digests, random values
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
const K512: u32[] = [
  0x428a2f98, 0xd728ae22,
  0x71374491, 0x23ef65cd,
  0xb5c0fbcf, 0xec4d3b2f,
  0xe9b5dba5, 0x8189dbbc,
  0x3956c25b, 0xf348b538,
  0x59f111f1, 0xb605d019,
  0x923f82a4, 0xaf194f9b,
  0xab1c5ed5, 0xda6d8118,
  0xd807aa98, 0xa3030242,
  0x12835b01, 0x45706fbe,
  0x243185be, 0x4ee4b28c,
  0x550c7dc3, 0xd5ffb4e2,
  0x72be5d74, 0xf27b896f,
  0x80deb1fe, 0x3b1696b1,
  0x9bdc06a7, 0x25c71235,
  0xc19bf174, 0xcf692694,
  0xe49b69c1, 0x9ef14ad2,
  0xefbe4786, 0x384f25e3,
  0x0fc19dc6, 0x8b8cd5b5,
  0x240ca1cc, 0x77ac9c65,
  0x2de92c6f, 0x592b0275,
  0x4a7484aa, 0x6ea6e483,
  0x5cb0a9dc, 0xbd41fbd4,
  0x76f988da, 0x831153b5,
  0x983e5152, 0xee66dfab,
  0xa831c66d, 0x2db43210,
  0xb00327c8, 0x98fb213f,
  0xbf597fc7, 0xbeef0ee4,
  0xc6e00bf3, 0x3da88fc2,
  0xd5a79147, 0x930aa725,
  0x06ca6351, 0xe003826f,
  0x14292967, 0x0a0e6e70,
  0x27b70a85, 0x46d22ffc,
  0x2e1b2138, 0x5c26c926,
  0x4d2c6dfc, 0x5ac42aed,
  0x53380d13, 0x9d95b3df,
  0x650a7354, 0x8baf63de,
  0x766a0abb, 0x3c77b2a8,
  0x81c2c92e, 0x47edaee6,
  0x92722c85, 0x1482353b,
  0xa2bfe8a1, 0x4cf10364,
  0xa81a664b, 0xbc423001,
  0xc24b8b70, 0xd0f89791,
  0xc76c51a3, 0x0654be30,
  0xd192e819, 0xd6ef5218,
  0xd6990624, 0x5565a910,
  0xf40e3585, 0x5771202a,
  0x106aa070, 0x32bbd1b8,
  0x19a4c116, 0xb8d2d0c8,
  0x1e376c08, 0x5141ab53,
  0x2748774c, 0xdf8eeb99,
  0x34b0bcb5, 0xe19b48a8,
  0x391c0cb3, 0xc5c95a63,
  0x4ed8aa4a, 0xe3418acb,
  0x5b9cca4f, 0x7763e373,
  0x682e6ff3, 0xd6b2b8a3,
  0x748f82ee, 0x5defb2fc,
  0x78a5636f, 0x43172f60,
  0x84c87814, 0xa1f0ab72,
  0x8cc70208, 0x1a6439ec,
  0x90befffa, 0x23631e28,
  0xa4506ceb, 0xde82bde9,
  0xbef9a3f7, 0xb2c67915,
  0xc67178f2, 0xe372532b,
  0xca273ece, 0xea26619c,
  0xd186b8c7, 0x21c0c207,
  0xeada7dd6, 0xcde0eb1e,
  0xf57d4f7f, 0xee6ed178,
  0x06f067aa, 0x72176fba,
  0x0a637dc5, 0xa2c898a6,
  0x113f9804, 0xbef90dae,
  0x1b710b35, 0x131c471b,
  0x28db77f5, 0x23047d84,
  0x32caab7b, 0x40c72493,
  0x3c9ebe0a, 0x15c9bebc,
  0x431d67c4, 0x9c100d4c,
  0x4cc5d4be, 0xcb3e42b6,
  0x597f299c, 0xfc657e2a,
  0x5fcb6fab, 0x3ad6faec,
  0x6c44198c, 0x4a475817
];
/** 64-bit words as (hi, lo) u32 pairs: rotate / shift right, n in 1..63 and never 32. */
function rr(hi: u32, lo: u32, n: i32, wantHi: boolean): u32 {
  if (n > 32) { const t = hi; hi = lo; lo = t; n -= 32; }
  return wantHi ? ((hi >>> n) | (lo << (32 - n))) >>> 0 : ((lo >>> n) | (hi << (32 - n))) >>> 0;
}
function sr(hi: u32, lo: u32, n: i32, wantHi: boolean): u32 { return wantHi ? hi >>> n : ((lo >>> n) | (hi << (32 - n))) >>> 0; }
/** Exact sum of u32 words (u32 + u32 wraps in Zinc; the carry is needed here). */
function sum4(a: f64, b: f64, c: f64, d: f64, e: f64): f64 { return a + b + c + d + e; }
/** SHA-512 (or SHA-384 with its IV, truncated to 48 bytes), FIPS 180-4. */
function sha2x64(data: u8[], iv: u32[], outBytes: i32): u8[] {
  const n = data.length;
  const total = ((n + 16) >> 7) * 128 + 128;
  const m: u32[] = [];
  for (let i = 0; i < total; i += 4) {
    let v: u32 = 0;
    for (let k = 0; k < 4; k++) { const j = i + k; const b: u32 = j < n ? data[j] : j === n ? 0x80 : 0; v = ((v << 8) | b) >>> 0; }
    m.push(v);
  }
  m[m.length - 1] = ((n & 0x1FFFFFFF) * 8) >>> 0;
  m[m.length - 2] = (n >>> 29) >>> 0;
  const h = iv.slice();
  const w: u32[] = [];
  for (let i = 0; i < 160; i++) w.push(0);
  for (let blk = 0; blk < m.length; blk += 32) {
    for (let i = 0; i < 32; i++) w[i] = m[blk + i];
    for (let i = 16; i < 80; i++) {
      const xh = w[2 * (i - 15)], xl = w[2 * (i - 15) + 1], yh = w[2 * (i - 2)], yl = w[2 * (i - 2) + 1];
      const s0h = (rr(xh, xl, 1, true) ^ rr(xh, xl, 8, true) ^ sr(xh, xl, 7, true)) >>> 0;
      const s0l = (rr(xh, xl, 1, false) ^ rr(xh, xl, 8, false) ^ sr(xh, xl, 7, false)) >>> 0;
      const s1h = (rr(yh, yl, 19, true) ^ rr(yh, yl, 61, true) ^ sr(yh, yl, 6, true)) >>> 0;
      const s1l = (rr(yh, yl, 19, false) ^ rr(yh, yl, 61, false) ^ sr(yh, yl, 6, false)) >>> 0;
      const lo = sum4(w[2 * (i - 16) + 1], s0l, w[2 * (i - 7) + 1], s1l, 0);
      const hi = sum4(w[2 * (i - 16)], s0h, w[2 * (i - 7)], s1h, 0) + fl(lo / 4294967296);
      w[2 * i] = (hi % 4294967296) >>> 0; w[2 * i + 1] = (lo % 4294967296) >>> 0;
    }
    const a: u32[] = h.slice();
    for (let i = 0; i < 80; i++) {
      const eh = a[8], el = a[9], ah = a[0], al = a[1];
      const S1h = (rr(eh, el, 14, true) ^ rr(eh, el, 18, true) ^ rr(eh, el, 41, true)) >>> 0;
      const S1l = (rr(eh, el, 14, false) ^ rr(eh, el, 18, false) ^ rr(eh, el, 41, false)) >>> 0;
      const chh = ((eh & a[10]) ^ (~eh & a[12])) >>> 0, chl = ((el & a[11]) ^ (~el & a[13])) >>> 0;
      const t1l = sum4(a[15], S1l, chl, K512[2 * i + 1], w[2 * i + 1]);
      const t1h = sum4(a[14], S1h, chh, K512[2 * i], w[2 * i]) + fl(t1l / 4294967296);
      const S0h = (rr(ah, al, 28, true) ^ rr(ah, al, 34, true) ^ rr(ah, al, 39, true)) >>> 0;
      const S0l = (rr(ah, al, 28, false) ^ rr(ah, al, 34, false) ^ rr(ah, al, 39, false)) >>> 0;
      const mjh = ((ah & a[2]) ^ (ah & a[4]) ^ (a[2] & a[4])) >>> 0, mjl = ((al & a[3]) ^ (al & a[5]) ^ (a[3] & a[5])) >>> 0;
      const T1h: u32 = (t1h % 4294967296) >>> 0, T1l: u32 = (t1l % 4294967296) >>> 0;
      const t2l = sum4(S0l, mjl, 0, 0, 0), t2h = sum4(S0h, mjh, 0, 0, 0) + fl(t2l / 4294967296);
      for (let k = 15; k >= 2; k--) a[k] = a[k - 2];
      const el2 = sum4(a[9], T1l, 0, 0, 0);  // e = d + T1 (a[8..9] now hold the old d)
      a[8] = ((sum4(a[8], T1h, 0, 0, 0) + fl(el2 / 4294967296)) % 4294967296) >>> 0; a[9] = (el2 % 4294967296) >>> 0;
      const al2 = sum4(T1l, 0, 0, 0, 0) + (t2l % 4294967296);
      a[0] = ((sum4(T1h, 0, 0, 0, 0) + t2h + fl(al2 / 4294967296)) % 4294967296) >>> 0; a[1] = (al2 % 4294967296) >>> 0;
    }
    for (let k = 0; k < 16; k += 2) {
      const lo = sum4(h[k + 1], a[k + 1], 0, 0, 0);
      h[k] = ((sum4(h[k], a[k], 0, 0, 0) + fl(lo / 4294967296)) % 4294967296) >>> 0; h[k + 1] = (lo % 4294967296) >>> 0;
    }
  }
  return wordBytes(h).slice(0, outBytes);
}
export function sha512(data: u8[]): u8[] { return sha2x64(data, [0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b, 0xa54ff53a, 0x5f1d36f1, 0x510e527f, 0xade682d1, 0x9b05688c, 0x2b3e6c1f, 0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179], 64); }
export function sha384(data: u8[]): u8[] { return sha2x64(data, [0xcbbb9d5d, 0xc1059ed8, 0x629a292a, 0x367cd507, 0x9159015a, 0x3070dd17, 0x152fecd8, 0xf70e5939, 0x67332667, 0xffc00b31, 0x8eb44a87, 0x68581511, 0xdb0c2e0d, 0x64f98fa7, 0x47b5481d, 0xbefa4fa4], 48); }
/** Lowercase hex of bytes. */
export function toHex(b: u8[]): string {
  const out: string[] = [];
  const hex = '0123456789abcdef';
  for (const x of b) { const v: i32 = x; out.push(hex.at(v >> 4)); out.push(hex.at(v & 15)); }
  return out.join('');
}
/** Keys are not implemented yet (digest only); the class exists for instanceof checks. */
export class CryptoKey { readonly type: string = 'secret'; readonly extractable: boolean = false; }
export class SubtleCrypto {
  /** 'SHA-1', 'SHA-256', 'SHA-384' or 'SHA-512' (case-insensitive). Rejects with NotSupportedError otherwise. */
  async digest(algorithm: string, data: u8[]): Promise<u8[]> {
    const a = algorithm.toUpperCase();
    if (a === 'SHA-256') return sha256(data);
    if (a === 'SHA-1') return sha1(data);
    if (a === 'SHA-384') return sha384(data);
    if (a === 'SHA-512') return sha512(data);
    throw new DOMException(`Unrecognized algorithm name`, 'NotSupportedError');
  }
}
export class Crypto {
  readonly subtle: SubtleCrypto = new SubtleCrypto();
  /** Fills the array with random bytes and returns it. @throws DOMException QuotaExceededError above 65536 bytes */
  getRandomValues(a: u8[]): u8[] {
    if (a.length > 65536) throw new DOMException(`The ArrayBufferView's byte length (${a.length}) exceeds the number of bytes of entropy available via this API (65536)`, 'QuotaExceededError');
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
