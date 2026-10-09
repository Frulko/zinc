#include "qjs/qjs.h"

namespace zn::qjs {

// The JavaScript every program starts with: console, timers on the virtual clock (as the typed engine's async prelude: the clock starts at 0 and
// jumps to the next timer; a frame loop advances it by the frame time), Date.now, and a Node style `inspect` for console.log.
const char* kPrelude = R"JS(
(function (g) {
  const write = g.__host_sysWrite, writeErr = g.__host_sysWriteErr;
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
  function key(k) { return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : quote(k); }
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
  let timers = [];
  g.__clock = () => clock;
  Date.now = () => clock;
  for (const f of ['FullYear', 'Month', 'Date', 'Day', 'Hours', 'Minutes', 'Seconds', 'Milliseconds']) Date.prototype['get' + f] = Date.prototype['getUTC' + f];  // no time zones, like the typed engine
  g.setTimeout = (f, ms, ...a) => { const id = nextId++; timers.push({ at: clock + Math.max(0, +ms || 0), ord: clock + Math.max(1, +ms || 0), seq: seq++, id, every: 0, f: () => f(...a) }); return id; };
  g.setInterval = (f, ms, ...a) => { const id = nextId++; ms = Math.max(1, +ms || 0); timers.push({ at: clock + ms, ord: clock + ms, seq: seq++, id, every: ms, f: () => f(...a) }); return id; };
  g.clearTimeout = g.clearInterval = id => { timers = timers.filter(t => t.id !== id); };
  g.queueMicrotask = f => { Promise.resolve().then(f); };
  function earliest() { let b = -1; for (let i = 0; i < timers.length; i++) if (b < 0 || timers[i].ord < timers[b].ord || (timers[i].ord === timers[b].ord && timers[i].seq < timers[b].seq)) b = i; return b; }
  // fire the timers that are due at `now` (a frame loop); returns after each so the host can run the promise jobs
  g.__dueTimer = now => {
    const b = earliest();
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
  g.__setClock = ms => { clock = ms; };
  g.process = { argv: ['zinc', 'main'], env: {}, exit: c => g.__host_sysExit(c | 0), platform: 'zinc', stdout: { write: s => write(String(s)) }, stderr: { write: s => writeErr(String(s)) } };
})(globalThis);
)JS";

// kWebShims (the web classes loaders expect) is in src/qjs/ext.cpp: zinc:script programs built with AOT link it without the rest of the engine.


}  // namespace zn::qjs
