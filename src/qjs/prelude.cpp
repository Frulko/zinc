#include "qjs/qjs.h"

#include <cstdlib>
#include <ctime>

namespace zn::qjs {

// The JavaScript every program starts with: console, timers on the virtual clock (as the typed engine's async prelude: the clock starts at 0 and
// jumps to the next timer; a frame loop advances it by the frame time), Date.now, and a Node style `inspect` for console.log.
const char* kPrelude = R"JS(
(function (g) {
  const write = g.__host_sysWrite, writeErr = g.__host_sysWriteErr;
  // Array.prototype.set(source, offset, start, end): the typed engine's block copy for any array (the TypedArray method, with a range of the source); what does not fit is left out
  if (!Array.prototype.set) Object.defineProperty(Array.prototype, 'set', { writable: true, configurable: true, value: function set(src, off, from, to) {
    const n = this.length, m = src.length, rel = (i, d, k) => { i = i === undefined ? d : i | 0; if (i < 0) { i += k; if (i < 0) i = 0; } return i > k ? k : i; };
    off = rel(off, 0, n); from = rel(from, 0, m); to = rel(to, m, m);
    const c = Math.min(to - from, n - off), block = src === this ? src.slice(from, from + c) : src, base = src === this ? 0 : from;
    for (let i = 0; i < c; i++) this[off + i] = block[base + i];
  } });
  // Number.prototype.toLocaleString without Intl (QuickJS): en-US digits as the typed engine prints them (check.cpp numToLocale); an engine with Intl keeps its own
  if ((1234.5).toLocaleString() !== '1,234.5') Object.defineProperty(Number.prototype, 'toLocaleString', { writable: true, configurable: true, value: function toLocaleString(locale, o) {
    const x = Number(this);
    if (x !== x) return 'NaN';
    if (x - x !== 0) return x > 0 ? '∞' : '-∞';
    o = o || {};
    let lo = o.minimumFractionDigits === undefined ? 0 : Math.floor(o.minimumFractionDigits);
    const hi = o.maximumFractionDigits === undefined ? Math.max(lo, 3) : Math.floor(o.maximumFractionDigits);
    if (o.minimumFractionDigits === undefined && hi < lo) lo = hi;
    let s = x.toFixed(hi);
    const neg = s[0] === '-';
    if (neg) s = s.slice(1);
    let [ip, fp = ''] = s.split('.');
    while (fp.length > lo && fp.endsWith('0')) fp = fp.slice(0, -1);
    if (o.useGrouping !== false) ip = ip.replace(/\B(?=(\d{3})+$)/g, ',');
    return (neg ? '-' : '') + ip + (fp ? '.' + fp : '');
  } });
  // zinc:worker (D181): QuickJS installs its own (src/qjs/worker_js.cpp); the engines that share this prelude (JavaScriptCore, V8, Hermes) have none yet
  if (!g.__recSchemaOf) g.__recSchemaOf = function () { throw new Error('zinc:worker runs on the Zinc engine and QuickJS; this engine has no workers yet'); };
  function quote(s) {
    const q = s.indexOf("'") < 0 ? "'" : s.indexOf('"') < 0 ? '"' : s.indexOf('`') < 0 ? '`' : "'";
    let r = q;
    for (const c of s) {
      if (c === q || c === '\\') r += '\\' + c;
      else if (c === '\n') r += '\\n'; else if (c === '\t') r += '\\t'; else if (c === '\r') r += '\\r';
      else r += c;
    }
    return r + q;
  }
  function key(k) { return typeof k === 'symbol' ? String(k) : /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : quote(k); }
  // util.inspect as Node prints it with the defaults (depth 2, breakLength 80, compact 3), including the grouping of long arrays
  const ctx = { seen: [], indent: 0, curDepth: 0 };
  function groupArray(output, value) {
    let total = 0, maxLen = 0;
    let n = output.length;
    if (value.length > 100 && n > 100) n--;  // the "... more items" entry
    const dataLen = new Array(n);
    for (let i = 0; i < n; i++) { const len = output[i].length; dataLen[i] = len; total += len + 2; if (maxLen < len) maxLen = len; }
    const actualMax = maxLen + 2;
    if (actualMax * 3 + ctx.indent < 80 && (total / actualMax > 5 || maxLen <= 6)) {
      const averageBias = Math.sqrt(actualMax - total / output.length), biasedMax = Math.max(actualMax - 3 - averageBias, 1);
      const columns = Math.min(Math.round(Math.sqrt(2.5 * biasedMax * n) / biasedMax), Math.floor((80 - ctx.indent) / actualMax), 12, 15);
      if (columns <= 1) return output;
      const tmp = [], maxLine = [];
      for (let i = 0; i < columns; i++) { let l = 0; for (let j = i; j < n; j += columns) if (dataLen[j] > l) l = dataLen[j]; maxLine.push(l + 2); }
      let padStart = true;
      for (let i = 0; i < value.length; i++) if (typeof value[i] !== 'number' && typeof value[i] !== 'bigint') { padStart = false; break; }
      for (let i = 0; i < n; i += columns) {
        const max = Math.min(i + columns, n);
        let str = '', j = i;
        for (; j < max - 1; j++) { const cell = output[j] + ', '; str += padStart ? cell.padStart(maxLine[j - i]) : cell.padEnd(maxLine[j - i]); }
        str += padStart ? output[j].padStart(maxLine[j - i] - 2) : output[j];
        tmp.push(str);
      }
      if (value.length > 100 && output.length > n) tmp.push(output[n]);
      return tmp;
    }
    return output;
  }
  function reduce(output, prefix, open, close, isArray, recurse, value) {
    const entries = output.length;
    if (isArray && entries > 6) output = groupArray(output, value);
    if (ctx.curDepth - recurse < 3 && entries === output.length) {
      const start = output.length + ctx.indent + open.length + prefix.length + 10;
      let total = output.length + start;
      for (const o of output) total += o.length;
      if (total <= 80 && output.every(o => o.indexOf('\n') < 0)) return prefix + open + ' ' + output.join(', ') + ' ' + close;
    }
    const ind = '\n' + ' '.repeat(ctx.indent);
    return prefix + open + ind + '  ' + output.join(',' + ind + '  ') + ind + close;
  }
  function child(x, recurse) { ctx.indent += 2; const r = fmt(x, recurse + 1, false); ctx.indent -= 2; return r; }
  function fmt(v, recurse, top) {
    switch (typeof v) {
      case 'string': return top ? v : quote(v);
      case 'number': return Object.is(v, -0) ? '-0' : String(v);
      case 'bigint': return v + 'n';
      case 'boolean': case 'undefined': return String(v);
      case 'symbol': return v.toString();
      case 'function': {
        const src = Function.prototype.toString.call(v);
        if (src.startsWith('class')) return '[class ' + (v.name || '(anonymous)') + ']';
        return '[Function: ' + (v.name || '(anonymous)') + ']';
      }
    }
    if (v === null) return 'null';
    if (ctx.seen.indexOf(v) >= 0) return '[Circular *1]';
    if (v instanceof Error) return v.stack ? String(v.stack).replace(/\n\s+at .*$/s, '') : String(v);
    const isArr = Array.isArray(v), isMap = v instanceof Map, isSet = v instanceof Set;
    const ctor = v.constructor && v.constructor.name;
    let prefix = '', open = '{', close = '}';
    if (isArr) { open = '['; close = ']'; if (ctor && ctor !== 'Array') prefix = ctor + '(' + v.length + ') '; }
    else if (isMap) prefix = 'Map(' + v.size + ') ';
    else if (isSet) prefix = 'Set(' + v.size + ') ';
    else if (ctor && ctor !== 'Object') prefix = ctor + ' ';
    else if (!v.constructor) prefix = '[Object: null prototype] ';
    const keys = Object.keys(v).filter(k => !(isArr && /^\d+$/.test(k)));
    if (Object.getOwnPropertySymbols) for (const symbol of Object.getOwnPropertySymbols(v)) if (Object.prototype.propertyIsEnumerable.call(v, symbol)) keys.push(symbol);
    if (recurse > 2) return isArr ? '[Array]' : '[' + (ctor || 'Object') + ']';
    if (keys.length === 0 && (isArr ? v.length === 0 : isMap ? v.size === 0 : isSet ? v.size === 0 : true)) return prefix + open + close;
    ctx.seen.push(v);
    ctx.curDepth = recurse;
    const output = [];
    if (isArr) {
      let holes = 0;
      const lim = Math.min(v.length, 100);
      for (let i = 0; i < lim; i++) {
        if (!(i in v)) { holes++; continue; }
        if (holes) { output.push('<' + holes + ' empty item' + (holes > 1 ? 's' : '') + '>'); holes = 0; }
        output.push(child(v[i], recurse));
      }
      if (holes) output.push('<' + holes + ' empty item' + (holes > 1 ? 's' : '') + '>');
      if (v.length > 100) output.push('... ' + (v.length - 100) + ' more item' + (v.length - 100 > 1 ? 's' : ''));
    } else if (isMap) { for (const [k, x] of v) output.push(child(k, recurse) + ' => ' + child(x, recurse)); }
    else if (isSet) { for (const x of v) output.push(child(x, recurse)); }
    for (const k of keys) output.push(key(k) + ': ' + child(v[k], recurse));
    ctx.seen.pop();
    return reduce(output, prefix, open, close, isArr, recurse, v);
  }
  function inspect(v, top) { ctx.seen = []; ctx.indent = 0; ctx.curDepth = 0; return fmt(v, 0, top); }
  function format(args) { return args.map(a => inspect(a, true)).join(' '); }
  g.console = {
    log: (...a) => write(format(a) + '\n'), info: (...a) => write(format(a) + '\n'), debug: (...a) => write(format(a) + '\n'),
    error: (...a) => writeErr(format(a) + '\n'), warn: (...a) => writeErr(format(a) + '\n'), trace: (...a) => write(format(a) + '\n'),
  };
  {  // count, assert and the timers print like the checked engine's console (one text stream, virtual clock)
    const counts = new Map(), timers = new Map();
    const lab = l => l === undefined ? 'default' : String(l);
    Object.assign(g.console, {
      count: l => { l = lab(l); const n = (counts.get(l) || 0) + 1; counts.set(l, n); write(l + ': ' + n + '\n'); },
      countReset: l => { counts.set(lab(l), 0); },
      assert: (ok, ...a) => { if (!ok) write(a.length ? 'Assertion failed: ' + format(a) + '\n' : 'Assertion failed\n'); },
      time: l => { l = lab(l); if (!timers.has(l)) timers.set(l, g.__clock()); },
      timeLog: l => { l = lab(l); if (timers.has(l)) write(l + ': ' + (g.__clock() - timers.get(l)) + 'ms\n'); },
      timeEnd: l => { l = lab(l); if (timers.has(l)) { write(l + ': ' + (g.__clock() - timers.get(l)) + 'ms\n'); timers.delete(l); } },
    });
  }
  g.__inspect = v => inspect(v, false);

  // timers: virtual clock in milliseconds
  let clock = 0, seq = 0, nextId = 1;
  g.__zincWallBase = 0;
  let timers = [];
  g.__clock = () => clock;
  // a real run reads the time of the host at each call, as the typed engine: the clock itself only moves between turns
  const nowReal = () => g.__zincReal ? g.__host_loopNow() : clock;
  g.__clockMs = () => g.__zincWallBase + nowReal();   // zinc:sys clock(): Date.now's clock, not rounded to the millisecond
  Date.now = () => g.__zincWallBase + Math.floor(nowReal());   // the wall clock at start (0 in deterministic mode, set by the host) moved by the virtual one, as the typed engine's now_ms
  {  // new Date() and Date() read Date.now, as the typed engine's constructor does: the engine's own read the machine's clock, so a deterministic run saw today's date
    const NativeDate = Date;
    const D = function Date(...a) {
      if (!new.target) return new NativeDate(NativeDate.now()).toString();
      return Reflect.construct(NativeDate, a.length ? a : [NativeDate.now()], new.target);
    };
    Object.setPrototypeOf(D, NativeDate);   // Date.now, Date.UTC, Date.parse
    D.prototype = NativeDate.prototype;
    Object.defineProperty(NativeDate.prototype, 'constructor', { value: D, writable: true, configurable: true });
    g.Date = D;
  }
  g.performance = { now: () => { if (g.__zincClockTick > 0) clock += g.__zincClockTick; return nowReal(); }, get timeOrigin() { return g.__zincWallBase; }, mark() {}, measure() {}, getEntriesByName: () => [] };   // the timers' clock, as the typed engine's (QuickJS-ng's own now is read-only, on the wall clock): it stops while the inspector pauses the program
  g.setTimeout = (f, ms, ...a) => { const id = nextId++; timers.push({ at: clock + Math.max(0, +ms || 0), ord: clock + Math.max(1, +ms || 0), seq: seq++, id, every: 0, f: () => f(...a) }); return id; };
  g.setInterval = (f, ms, ...a) => { const id = nextId++; ms = Math.max(1, +ms || 0); timers.push({ at: clock + ms, ord: clock + ms, seq: seq++, id, every: ms, f: () => f(...a) }); return id; };
  g.clearTimeout = g.clearInterval = id => { timers = timers.filter(t => t.id !== id); };
  function earliest(before = Infinity) { let b = -1; for (let i = 0; i < timers.length; i++) if (timers[i].seq < before && (b < 0 || timers[i].ord < timers[b].ord || (timers[i].ord === timers[b].ord && timers[i].seq < timers[b].seq))) b = i; return b; }
  // fire the timers that are due at `now` (a frame loop); returns after each so the host can run the promise jobs. A timer set during this
  // frame's pass waits for the next frame (passSeq, taken when the host sets the frame's clock): a setTimeout(0) that yields lets a frame through
  let passSeq = Infinity;
  g.__dueTimer = now => {
    const b = earliest(passSeq);
    if (b < 0 || timers[b].at > now) return null;
    const t = timers[b];
    timers.splice(b, 1);
    if (t.every > 0) timers.push({ at: t.at + t.every, ord: t.ord + t.every, seq: seq++, id: t.id, every: t.every, f: t.f });
    return t.f;
  };
  // jump to the next timer (no frame loop): returns its callback or null when none is left
  g.__nextTimer = () => {
    const b = earliest();
    if (b < 0) return null;
    const t = timers[b];
    timers.splice(b, 1);
    if (t.at > clock) clock = t.at;
    if (t.every > 0) timers.push({ at: t.at + t.every, ord: t.ord + t.every, seq: seq++, id: t.id, every: t.every, f: t.f });
    return t.f;
  };
  g.__setClock = ms => { clock = ms; passSeq = seq; };
  g.__nextAt = () => { const b = earliest(); return b < 0 ? -1 : timers[b].at; };   // when the next timer is due, -1 when none is left
  // the host loop's events ("handle", "kind" and "data" joined by U+001F) for the modules that register a handler (zinc:osc, zinc:net), as the typed prelude's
  // __pollHost; the engine's turn calls it, and waits while the host loop is active (a server listening, a fetch in flight)
  const evHandlers = [];
  g.__addEvHandler = f => { evHandlers.push(f); };
  g.__pollHost = () => {
    for (let budget = 64; evHandlers.length && budget-- > 0 && g.__host_evReady();) {
      const e = g.__host_evNext();
      if (!e) break;
      const i1 = e.indexOf('\u001f'), i2 = e.indexOf('\u001f', i1 + 1);
      for (const f of evHandlers) f(parseInt(e.slice(0, i1)), parseInt(e.slice(i1 + 1, i2)), e.slice(i2 + 1));
    }
  };
  // D179's checked copy out of `any` (src/qjs/strip.cpp dynCopiesForJs): the value as the schema's type, the typed engines' TypeError otherwise.
  // Schema: d i u b s B, *T, ?T (null when absent), ~T (an optional field: undefined when absent), @Name{name:T,...} (only these fields are
  // kept), ^Name (the record Name that holds it)
  const dynKind = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
  const dynFail = (v, to) => { throw new TypeError('cannot convert Dyn (' + dynKind(v) + ') to ' + to); };
  const dynConv = new Map();
  function dynCompile(s) {
    let i = 0;
    const named = {};
    const one = () => {
      const c = s[i++];
      if (c === 'd') return v => typeof v === 'number' ? v : dynFail(v, 'number');
      if (c === 'i') return v => typeof v === 'number' ? v | 0 : dynFail(v, 'number');
      if (c === 'u') return v => typeof v === 'number' ? v >>> 0 : dynFail(v, 'number');
      if (c === 'b') return v => typeof v === 'boolean' ? v : dynFail(v, 'boolean');
      if (c === 's') return v => typeof v === 'string' ? v : dynFail(v, 'string');
      if (c === 'B') return v => Array.isArray(v) ? v.map(x => typeof x === 'number' ? x & 255 : dynFail(x, 'number')) : dynFail(v, 'array');
      if (c === '*') { const e = one(); return v => Array.isArray(v) ? v.map(x => e(x)) : dynFail(v, 'array'); }
      if (c === '?') { const e = one(); return v => v == null ? null : e(v); }
      if (c === '~') { const e = one(); return v => v == null ? undefined : e(v); }
      if (c === '^') { const at = i; while (/\w|\$/.test(s[i] || '')) i++; const ref = named[s.slice(at, i)]; return v => ref.f(v); }
      if (c === '@') {
        const at = s.indexOf('{', i), ref = named[s.slice(i, at)] = { f: null };
        i = at;
        return ref.f = one();
      }
      if (c === '{') {
        const fields = [];
        while (s[i] !== '}') { const at = s.indexOf(':', i); const name = s.slice(i, at); i = at + 1; fields.push([name, one()]); if (s[i] === ',') i++; }
        i++;
        return v => {
          if (v === null || typeof v !== 'object' || Array.isArray(v)) dynFail(v, 'Object');
          const o = {};
          for (const [k, f] of fields) { const x = f(v[k]); if (x !== undefined) o[k] = x; }
          return o;
        };
      }
      throw new Error('__dynAs: bad schema ' + s);
    };
    return one();
  }
  g.__dynAs = (schema, v) => { let f = dynConv.get(schema); if (!f) { f = dynCompile(schema); dynConv.set(schema, f); } return f(v); };
  g.process = { argv: ['zinc', 'main'], env: {}, exit: c => g.__host_sysExit(c | 0), platform: 'zinc', stdout: { write: s => write(String(s)) }, stderr: { write: s => writeErr(String(s)) } };
})(globalThis);
)JS";

// A deterministic run is in UTC unless TZ names a zone, the rule of the typed engine's Date (tzOffsetMinutes in src/host/sys_host.cpp): the
// JavaScript engines read the zone from the C library, so TZ is set for them before they start. The local getters, the constructor and
// getTimezoneOffset then agree on one zone, the machine's in any other run.
void deterministicZone() {
  const char* det = std::getenv("ZINC_DETERMINISTIC");
  if (!det || std::getenv("TZ")) return;   // set at all, as tzOffsetMinutes reads it
#ifdef _WIN32
  _putenv_s("TZ", "UTC");
  _tzset();
#else
  setenv("TZ", "UTC", 1);
  tzset();
#endif
}

// kWebShims (the web classes loaders expect) is in src/qjs/web_shims.cpp: zinc:script programs built with AOT link it without the rest of the engine.

}  // namespace zn::qjs
