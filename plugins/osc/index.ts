// zinc:osc/full — Open Sound Control 1.0 over UDP (docs/plugins/osc.md): typed messages, bundles with their time tag, address patterns, as many
// endpoints as the program opens. Written in Zinc on zinc:socket, no native code. The engine's own zinc:osc stays the short form (numbers and
// strings on one port); this is the whole protocol.
import { udp, UdpSocket, Datagram } from 'zinc:socket';
import { utf8Encode, utf8Decode } from 'zinc:sys';

/** An OSC time tag: NTP time, `seconds` since 1900-01-01 and `fraction` in 1/2^32 of a second. (0, 1) means "now". */
export class TimeTag {
  seconds: f64; fraction: f64;
  constructor(seconds: f64 = 0, fraction: f64 = 1) { this.seconds = seconds; this.fraction = fraction; }
  get immediate(): boolean { return this.seconds === 0 && this.fraction === 1; }
  /** Milliseconds since 1970-01-01, as Date.now() counts. */
  get unixMs(): f64 { return (this.seconds - NTP_1970) * 1000 + this.fraction / 4294967.296; }
}
const NTP_1970: f64 = 2208988800;
/** The time tag of a Date.now() value. */
export function timeTag(unixMs: f64): TimeTag {
  const s = Math.floor(unixMs / 1000);
  return new TimeTag(s + NTP_1970, Math.floor((unixMs - s * 1000) * 4294967.296));
}

/** One argument. `type` is its OSC tag: 'i' int32 and 'f' float32 and 'd' double in `num`, 's' in `text`, 'b' in `bytes`, 't' in `time`,
 *  'T' and 'F' (`num` 1 and 0), 'N' nil. Received only: 'h' (int64, exact up to 2^53), 'c', 'r', 'm' (their 32 bits in `num`), 'S' (as 's'), 'I'. */
export class Arg {
  type: string; num: f64 = 0; text: string = ''; bytes: u8[] = []; time: TimeTag | null = null;
  constructor(type: string) { this.type = type; }
}

/** An OSC message: `new Message('/shape/xy').float(0.5).float(0.2)`. On a received one, `time` is the tag of the bundle it came in (null outside
 *  a bundle) and `from` / `port` name the sender. */
export class Message {
  address: string; args: Arg[] = []; time: TimeTag | null = null; from: string = ''; port: i32 = 0;
  constructor(address: string) { this.address = address; }
  private add(type: string, num: f64): Arg { const a = new Arg(type); a.num = num; this.args.push(a); return a; }
  int(v: i32): Message { this.add('i', v); return this; }
  /** A 32-bit float: the value is rounded to it, as the receiver will see it. */
  float(v: f64): Message { this.add('f', Math.fround(v)); return this; }
  double(v: f64): Message { this.add('d', v); return this; }
  string(v: string): Message { this.add('s', 0).text = v; return this; }
  blob(v: u8[]): Message { this.add('b', 0).bytes = v; return this; }
  timeTag(v: TimeTag): Message { this.add('t', 0).time = v; return this; }
  bool(v: boolean): Message { this.add(v ? 'T' : 'F', v ? 1 : 0); return this; }
  nil(): Message { this.add('N', 0); return this; }
}

/** Messages (and bundles) that belong together, with the time they are meant for. */
export class Bundle {
  time: TimeTag; messages: Message[] = []; bundles: Bundle[] = [];
  constructor(time: TimeTag = new TimeTag()) { this.time = time; }
  add(m: Message): Bundle { this.messages.push(m); return this; }
  addBundle(b: Bundle): Bundle { this.bundles.push(b); return this; }
}

// ---- encoding (big-endian, everything padded to 4 bytes)
function putU32(out: u8[], v: f64): void {
  out.push(Math.floor(v / 16777216) % 256); out.push(Math.floor(v / 65536) % 256); out.push(Math.floor(v / 256) % 256); out.push(v % 256);
}
function putI32(out: u8[], v: f64): void { putU32(out, v < 0 ? v + 4294967296 : v); }
function putPadded(out: u8[], b: u8[], nul: boolean): void {
  for (const c of b) out.push(c);
  if (nul) out.push(0);
  while (out.length % 4 !== 0) out.push(0);
}
/** IEEE 754, big-endian: 4 bytes (23 bits of mantissa) or 8 bytes (52). The engine has no typed array to borrow the bits from. */
function putFloat(out: u8[], value: f64, bytes: i32): void {
  const mLen = bytes === 4 ? 23 : 52, eMax = bytes === 4 ? 255 : 2047, eBias = bytes === 4 ? 127 : 1023;
  const s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;
  let v = Math.abs(value), e: f64 = 0, m: f64 = 0;
  if (v !== v) { e = eMax; m = Math.pow(2, mLen - 1); }
  else if (v === Infinity) e = eMax;
  else if (v !== 0) {
    e = Math.floor(Math.log2(v));
    if (e > eBias) e = eBias;
    if (e >= 1 - eBias) {   // log2 may be one off at the edges of a binade
      if (v * Math.pow(2, -e) < 1) e--;
      else if (v * Math.pow(2, -e) >= 2) e++;
    }
    if (e < 1 - eBias) { m = v * Math.pow(2, eBias - 1) * Math.pow(2, mLen); e = 0; }   // denormal
    else { m = (v * Math.pow(2, -e) - 1) * Math.pow(2, mLen); e += eBias; }
  }
  const low = bytes - 2, lowUnit = Math.pow(256, low);
  const top = Math.floor(m / lowUnit) + e * Math.pow(2, mLen - 8 * low) + s * 32768;
  out.push(Math.floor(top / 256)); out.push(top % 256);
  const rest = m % lowUnit;
  for (let i = low - 1; i >= 0; i--) out.push(Math.floor(rest / Math.pow(256, i)) % 256);
}

/** The bytes of a message, as they go in a datagram. */
export function encode(m: Message): u8[] {
  const out: u8[] = [];
  putPadded(out, utf8Encode(m.address), true);
  let tags = ',';
  for (const a of m.args) tags += a.type;
  putPadded(out, utf8Encode(tags), true);
  for (const a of m.args) {
    const t = a.type;
    if (t === 'i') putI32(out, a.num);
    else if (t === 'f') putFloat(out, a.num, 4);
    else if (t === 'd') putFloat(out, a.num, 8);
    else if (t === 's') putPadded(out, utf8Encode(a.text), true);
    else if (t === 'b') { putU32(out, a.bytes.length); putPadded(out, a.bytes, false); }
    else if (t === 't') { const tt = a.time; putU32(out, tt === null ? 0 : tt.seconds); putU32(out, tt === null ? 1 : tt.fraction); }
    else if (t !== 'T' && t !== 'F' && t !== 'N') throw new Error(`osc: cannot send an argument of type '${t}'`);
  }
  return out;
}
/** The bytes of a bundle: its messages, then its bundles. */
export function encodeBundle(b: Bundle): u8[] {
  const out: u8[] = [];
  putPadded(out, utf8Encode('#bundle'), true);
  putU32(out, b.time.seconds); putU32(out, b.time.fraction);
  for (const m of b.messages) { const e = encode(m); putU32(out, e.length); for (const c of e) out.push(c); }
  for (const n of b.bundles) { const e = encodeBundle(n); putU32(out, e.length); for (const c of e) out.push(c); }
  return out;
}

// ---- decoding: the bytes come from the network, so every length is checked and a malformed element is dropped, never read past
class Reader {
  b: u8[]; pos: i32; end: i32; ok: boolean = true;
  constructor(b: u8[], pos: i32, end: i32) { this.b = b; this.pos = pos; this.end = end; }
  u32(): f64 {
    if (this.pos + 4 > this.end) { this.ok = false; return 0; }
    const p = this.pos; this.pos += 4;
    return this.b[p] * 16777216 + this.b[p + 1] * 65536 + this.b[p + 2] * 256 + this.b[p + 3];
  }
  i32(): f64 { const v = this.u32(); return v >= 2147483648 ? v - 4294967296 : v; }
  bytes(n: f64, nul: boolean): u8[] {   // n bytes, then the padding (and the NUL of a string)
    const size = Math.floor((n + (nul ? 4 : 3)) / 4) * 4;
    if (n < 0 || this.pos + size > this.end) { this.ok = false; return []; }
    const r = this.b.slice(this.pos, this.pos + (n as i32));
    this.pos += size as i32;
    return r;
  }
  str(): string {
    let n = this.pos;
    while (n < this.end && this.b[n] !== 0) n++;
    if (n >= this.end) { this.ok = false; return ''; }
    return utf8Decode(this.bytes(n - this.pos, true));
  }
  float(bytes: i32): f64 {
    if (this.pos + bytes > this.end) { this.ok = false; return 0; }
    const mLen = bytes === 4 ? 23 : 52, eMax = bytes === 4 ? 255 : 2047, eBias = bytes === 4 ? 127 : 1023;
    const top = this.b[this.pos] * 256 + this.b[this.pos + 1], shift = Math.pow(2, mLen - 8 * (bytes - 2));
    let m: f64 = top % shift;
    for (let i = 2; i < bytes; i++) m = m * 256 + this.b[this.pos + i];
    this.pos += bytes;
    const e = Math.floor(top / shift) % (eMax + 1), sign = top >= 32768 ? -1 : 1;
    if (e === eMax) return m !== 0 ? NaN : sign * Infinity;
    if (e === 0) return sign * m * Math.pow(2, 1 - eBias - mLen);
    return sign * (1 + m / Math.pow(2, mLen)) * Math.pow(2, e - eBias);
  }
}
function readMessage(r: Reader, time: TimeTag | null): Message | null {
  const m = new Message(r.str());
  m.time = time;
  if (!r.ok || !m.address.startsWith('/')) return null;
  if (r.pos === r.end) return m;   // old senders leave the type tags out when there is no argument
  const tags = r.str();
  if (!r.ok || !tags.startsWith(',')) return null;
  for (let i = 1; i < tags.length; i++) {
    const t = tags[i], a = new Arg(t === 'S' ? 's' : t);
    if (t === 'i' || t === 'c') a.num = r.i32();
    else if (t === 'r' || t === 'm') a.num = r.u32();
    else if (t === 'f') a.num = r.float(4);
    else if (t === 'd') a.num = r.float(8);
    else if (t === 'h') { const hi = r.i32(); a.num = hi * 4294967296 + r.u32(); }
    else if (t === 's' || t === 'S') a.text = r.str();
    else if (t === 'b') a.bytes = r.bytes(r.u32(), false);
    else if (t === 't') { const s = r.u32(); a.time = new TimeTag(s, r.u32()); }
    else if (t === 'T') a.num = 1;
    else if (t === 'I') a.num = Infinity;
    else if (t !== 'F' && t !== 'N') return null;   // an unknown type has an unknown size
    if (!r.ok) return null;
    m.args.push(a);
  }
  return m;
}
function readPacket(b: u8[], pos: i32, end: i32, time: TimeTag | null, depth: i32, out: Message[]): void {
  if (end - pos < 4 || depth > 16) return;
  const r = new Reader(b, pos, end);
  if (b[pos] !== 35) { const m = readMessage(r, time); if (m !== null) out.push(m); return; }   // 35: '#'
  if (r.str() !== '#bundle') return;
  const s = r.u32(), tt = new TimeTag(s, r.u32());
  while (r.ok && r.pos < end) {
    const size = r.u32() as i32;
    if (!r.ok || size < 0 || r.pos + size > end) return;
    readPacket(b, r.pos, r.pos + size, tt, depth + 1, out);
    r.pos += size;
  }
}
/** The messages of a datagram, in order: one for a message, every message of a bundle (and of the bundles in it) with `time` set to the tag of
 *  its bundle. Malformed data gives no message. */
export function decode(bytes: u8[]): Message[] {
  const out: Message[] = [];
  readPacket(bytes, 0, bytes.length, null, 0, out);
  return out;
}

// ---- address patterns (OSC 1.0): ? one character, * any run, [abc] [a-z] [!a-z] one of a set, {foo,bar} one of the words; never across a '/'
function partMatches(p: string, pi: i32, s: string, si: i32): boolean {
  while (pi < p.length) {
    const c = p[pi];
    if (c === '*') {
      for (let k = si; k <= s.length; k++) if (partMatches(p, pi + 1, s, k)) return true;
      return false;
    }
    if (c === '{') {
      const close = p.indexOf('}', pi);
      if (close < 0) return false;
      for (const word of p.slice(pi + 1, close).split(',')) if (s.slice(si, si + word.length) === word && partMatches(p, close + 1, s, si + word.length)) return true;
      return false;
    }
    if (si >= s.length) return false;
    if (c === '[') {
      const close = p.indexOf(']', pi);
      if (close < 0) return false;
      let i = pi + 1, hit = false;
      const negated = p[i] === '!', ch = s.charCodeAt(si);
      if (negated) i++;
      while (i < close) {
        if (i + 2 < close && p[i + 1] === '-') { if (ch >= p.charCodeAt(i) && ch <= p.charCodeAt(i + 2)) hit = true; i += 3; }
        else { if (ch === p.charCodeAt(i)) hit = true; i++; }
      }
      if (hit === negated) return false;
      pi = close + 1; si++;
      continue;
    }
    if (c !== '?' && c !== s[si]) return false;
    pi++; si++;
  }
  return si === s.length;
}
/** Whether the OSC address pattern selects the address: `matches('/mixer/[1-4]/gain', '/mixer/3/gain')`. */
export function matches(pattern: string, address: string): boolean {
  const p = pattern.split('/'), a = address.split('/');
  if (p.length !== a.length) return false;
  for (let i = 0; i < p.length; i++) if (!partMatches(p[i], 0, a[i], 0)) return false;
  return true;
}

/** A UDP endpoint that speaks OSC: it sends from its port and receives on it. */
export class Osc {
  socket: UdpSocket;
  private patterns: string[] = [];
  private handlers: ((m: Message) => void)[] = [];
  constructor(socket: UdpSocket) {
    this.socket = socket;
    socket.onMessage((d: Datagram) => {
      for (const m of decode(d.bytes)) {
        m.from = d.address; m.port = d.port;
        // the pattern may be on either side: a sender that addresses '/light/*', or a handler that listens to '/light/*'
        for (let i = 0; i < this.patterns.length; i++) if (matches(m.address, this.patterns[i]) || matches(this.patterns[i], m.address)) this.handlers[i](m);
      }
    });
  }
  /** The port the endpoint is bound to (the one the system gave for open(0)). */
  get port(): i32 { return this.socket.port; }
  /** Calls `cb` for every received message whose address fits `address`: '/fader/1', or a pattern such as '/fader/?'. A pattern never crosses
   *  a '/': for every message, use onAny. */
  on(address: string, cb: (m: Message) => void): Osc { this.patterns.push(address); this.handlers.push(cb); return this; }
  /** Calls `cb` for every received message. */
  onAny(cb: (m: Message) => void): Osc {
    this.socket.onMessage((d: Datagram) => { for (const m of decode(d.bytes)) { m.from = d.address; m.port = d.port; cb(m); } });
    return this;
  }
  /** False when the datagram could not be sent (closed endpoint, unknown host, a message over the 64 KiB of UDP). */
  send(host: string, port: i32, m: Message): boolean { return this.socket.sendBytes(host, port, encode(m)); }
  sendBundle(host: string, port: i32, b: Bundle): boolean { return this.socket.sendBytes(host, port, encodeBundle(b)); }
  close(): void { this.socket.close(); }
}
/** Opens an endpoint on `port` (0: a free port the system picks, enough to send and to get answers) of `host` ('' = every interface).
 *  Rejects when the port is taken. */
export async function open(port: i32 = 0, host: string = ''): Promise<Osc> { return new Osc(await udp(port, host)); }
