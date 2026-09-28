// WinterTC Minimum Common Web API globals from zinc:web (lib/std/web.ts, pure Zinc, the same on every target): no
// import needed. Checked against Node 24's own implementations (docs/guide/09-web-apis.md); byte arrays are u8[].

// ---- encoding
const enc = new TextEncoder();
const dec = new TextDecoder();
console.log(enc.encoding, dec.encoding, dec.fatal, dec.ignoreBOM);
console.log(enc.encode('héllo €𝄞').join(','), dec.decode(enc.encode('héllo €𝄞')));
console.log(dec.decode([0x61, 0xff, 0x62, 0xe2, 0x82, 0x63, 0xf0, 0x9f, 0x98]), dec.decode([0xef, 0xbb, 0xbf, 0x6f, 0x6b]).length);
console.log(new TextDecoder('utf-8', { ignoreBOM: true }).decode([0xef, 0xbb, 0xbf, 0x6f, 0x6b]).length, new TextDecoder('UTF8').encoding);
try { new TextDecoder('utf-8', { fatal: true }).decode([0x61, 0xff]); } catch (e) { console.log('fatal', e.name); }
try { new TextDecoder('bogus'); } catch (e) { console.log(e.name); }
const sd = new TextDecoder();
console.log(sd.decode([0xe2, 0x82], { stream: true }) + '|' + sd.decode([0xac, 0x21], { stream: true }) + '|' + sd.decode());
const into: u8[] = [0, 0, 0, 0, 0];
const res = enc.encodeInto('a€b', into);
console.log(res.read, res.written, into.join(','));
console.log(btoa('Hello, Zinc!'), atob('SGVsbG8sIFppbmMh'), btoa(''), btoa('a'), btoa('ab'), atob('YQ'), atob(' Y W I = '));
for (const bad of ['@@@', 'a', 'ab=c']) { try { atob(bad); console.log('decoded', bad); } catch (e) { console.log('atob', bad, e.name, e instanceof DOMException, (e as DOMException).code); } }
try { btoa('€'); } catch (e) { console.log('btoa', e.name); }
console.log(encodeURIComponent('a b&c=d/é?'), encodeURI('http://x/a b?q=é#f'), decodeURIComponent('a%20b%26%C3%A9'), decodeURI('%3B%20'));
try { decodeURIComponent('%E0%A4%A'); } catch (e) { console.log(e.name); }

// ---- URL (the WHATWG parser: WPT urltestdata 896/896, setters 278/278 on this code)
const u = new URL('HTTPS://user:pa ss@Example.COM:443/a/./b/../c d?x=1&y=é#frag ment');
console.log(u.href);
console.log(u.protocol, u.username, u.password, u.host, u.hostname, u.port, u.pathname, u.search, u.hash, u.origin);
for (const r of ['../up?q', '/abs', '//other.org/p', '?only', '#h', 'sib', '', 'g/./h/..', 'http://x.y:8080']) console.log(JSON.stringify(r), '->', new URL(r, 'http://a.b/c/d;p?q#f').href);
for (const s of ['file:///tmp/a b.txt', 'mailto:someone@example.com', 'ws://h:80/', 'http://0x7f.1/', 'http://[::ffff:1.2.3.4]/', 'http://ÉXAMPLE.com/', 'non-special://h/p?q', 'file:///C|/x/../y', 'blob:https://a.b/x']) {
  const v = new URL(s);
  console.log(v.href, v.host, v.pathname, v.origin);
}
console.log(new URL('http://h/p?a=1&b=2&a=3').searchParams.getAll('a'), URL.canParse('nope'), URL.canParse('x:y'), URL.parse('nope') === null, URL.canParse('b', 'http://a/'));
for (const bad of ['', 'http://', 'http://h:99999/', 'http://a b/', 'relative', 'http://[1::2::3]/', 'https://%zz/']) {
  try { new URL(bad); console.log('parsed', bad); } catch (e) { console.log('invalid', JSON.stringify(bad), e.name); }
}
const v = new URL('http://h.com/p');
v.searchParams.append('q', 'a b');
v.searchParams.append('lang', 'fr');
v.hash = 'top';
v.port = '8080';
v.pathname = 'x/y';
console.log(v.href, v.search);
v.search = '?k=v';
console.log(v.searchParams.get('k'), v.href, JSON.stringify(v));
v.host = 'other.org:81';
v.protocol = 'https';
v.username = 'me';
console.log(v.href);
v.href = 'http://reset/';
console.log(v.href, v.searchParams.size);

// ---- URLSearchParams
const sp = new URLSearchParams('?b=2&a=1&c=%20x+y&a=0&empty=&flag');
console.log(sp.get('a'), sp.getAll('a'), sp.get('c'), sp.has('flag'), sp.has('zz'), sp.get('zz') === null, sp.size, sp.has('a', '0'));
sp.set('a', 'new');
sp.delete('b');
sp.append('é', 'x&y=z');
sp.sort();
console.log(sp.toString(), sp.keys(), sp.values());
sp.forEach((val: string, key: string) => { console.log(' ', key, '=', val); });
sp.delete('a', 'other');
console.log(sp.has('a'), new URLSearchParams([['x', '1&2'], ['y', '=']]).toString(), new URLSearchParams(sp).size);
try { new URLSearchParams([['a']]); } catch (e) { console.log(e.name); }

// ---- events
const t = new EventTarget();
const log = (e: Event): void => { console.log('listener', e.type, e.eventPhase, e.currentTarget === t); };
t.addEventListener('ping', log);
t.addEventListener('ping', log);  // same listener twice: once
t.addEventListener('ping', (e: Event) => { console.log('once', e.type, e.target === t); }, { once: true });
t.dispatchEvent(new Event('ping'));
t.dispatchEvent(new Event('ping'));
t.removeEventListener('ping', log);
const ev = new Event('ping');
console.log('after remove', t.dispatchEvent(ev), ev.eventPhase, ev.currentTarget === null, ev.target === t, ev.isTrusted, ev.bubbles);
t.addEventListener('data', (e: Event) => { const c = e as CustomEvent<string>; console.log('detail', c.detail); });
t.dispatchEvent(new CustomEvent<string>('data', { detail: 'payload' }));
t.addEventListener('stop', (e: Event) => { e.preventDefault(); });
t.addEventListener('stop', (e: Event) => { e.stopImmediatePropagation(); });
t.addEventListener('stop', (e: Event) => { console.log('never'); });
const se = new Event('stop', { cancelable: true });
console.log('cancelled', !t.dispatchEvent(se), se.defaultPrevented, se.returnValue, t.dispatchEvent(new Event('stop')));
t.addEventListener('passive', (e: Event) => { e.preventDefault(); console.log('passive prevented?', e.defaultPrevented); }, { passive: true });
t.dispatchEvent(new Event('passive', { cancelable: true }));
t.addEventListener('throws', (e: Event) => { throw new Error('in listener'); });
t.addEventListener('throws', (e: Event) => { console.log('next listener still runs'); });
t.dispatchEvent(new Event('throws'));
t.addEventListener('re', (e: Event) => { try { t.dispatchEvent(e); } catch (err) { console.log('re-dispatch', err.name); } });
t.dispatchEvent(new Event('re'));
const ee = new ErrorEvent('error', { message: 'boom', lineno: 3 });
console.log(ee.type, ee.message, ee.lineno, ee.filename === '', Event.AT_TARGET);

// ---- abort
const ac = new AbortController();
ac.signal.onabort = (e: Event) => { console.log('onabort', e.type); };
ac.signal.addEventListener('abort', (e: Event) => { console.log('abort event', ac.signal.aborted); });
const removed = new AbortController();
t.addEventListener('sig', (e: Event) => { console.log('never: removed by its signal'); }, { signal: removed.signal });
removed.abort();
t.dispatchEvent(new Event('sig'));
console.log('aborted?', ac.signal.aborted);
ac.abort();
ac.abort('twice');  // no second event
const reason = ac.signal.reason;
console.log(reason instanceof DOMException, reason instanceof DOMException ? `${reason.name} ${reason.code}` : '');
try { ac.signal.throwIfAborted(); } catch (e) { console.log('thrown', e.name, e.message); }
const custom = AbortSignal.abort(new Error('custom'));
try { custom.throwIfAborted(); } catch (e) { console.log('thrown', e.message); }
const parent = new AbortController();
const any = AbortSignal.any([parent.signal, new AbortController().signal]);
parent.abort('why');
const anyReason = any.reason;
console.log('any', any.aborted, typeof anyReason === 'string' ? anyReason : '');
const ts = AbortSignal.timeout(20);
ts.addEventListener('abort', (e: Event) => { const r = ts.reason; console.log('timeout', r instanceof DOMException ? r.name : ''); });

// ---- channel messaging
const ch = new MessageChannel();
ch.port2.onmessage = (e: MessageEvent) => { const d = e.data; console.log('port2 got', typeof d === 'string' ? d : ''); ch.port2.postMessage('pong'); };
ch.port1.addEventListener('message', (e: Event) => { const m = e as MessageEvent; const d = m.data; console.log('port1 got', typeof d === 'string' ? d : ''); ch.port1.close(); });
ch.port1.start();
ch.port1.postMessage('ping');
console.log('posted (delivered later)');

// ---- Blob, File, FormData
async function blobs(): Promise<void> {
  const b = new Blob(['héllo ', new Blob(['world'])], { type: 'Text/Plain' });
  console.log(b.size, b.type, await b.text(), (await b.slice(1, 3).bytes()).join(','), await b.slice(-5).text(), b.slice(2, 1).size);
  const f = new File(['abc'], 'a.txt', { type: 'text/plain', lastModified: 42 });
  console.log(f.name, f.size, f.type, f.lastModified, f instanceof Blob, await f.text());
  const fd = new FormData();
  fd.append('k', 'v1');
  fd.append('k', 'v2');
  fd.append('file', f);
  fd.set('one', 'x');
  const k = fd.get('k'), file = fd.get('file');
  console.log(typeof k === 'string' ? k : '', fd.getAll('k').length, fd.has('file'), file instanceof File ? file.name : '', fd.get('none') === null, fd.keys());
  fd.delete('k');
  console.log(fd.keys());
}

// ---- crypto
async function digests(): Promise<void> {
  const H = '0123456789abcdef';
  const hex = (b: u8[]): string => b.map((x: u8) => H.at(x >> 4) + H.at(x & 15)).join('');
  for (const alg of ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']) {
    console.log(alg, hex(await crypto.subtle.digest(alg, enc.encode('abc'))));
    console.log(alg, hex(await crypto.subtle.digest(alg, enc.encode('x'.repeat(200)))));
  }
  try { await crypto.subtle.digest('MD5', []); } catch (e) { console.log(e.name); }
  const r = crypto.getRandomValues([0, 0, 0, 0, 0, 0, 0, 0]);
  const id = crypto.randomUUID();
  console.log(r.length, id.length, id.at(14), '89ab'.includes(id.at(19)), id.split('-').length, id !== crypto.randomUUID());
  console.log(navigator.userAgent.length > 0);
}
async function main(): Promise<void> {
  await blobs();
  await digests();
}
main();
