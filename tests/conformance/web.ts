// zinc:web (lib/std/web.ts): Web platform basics in pure Zinc, the same on every target. Expected values were checked
// against Node's own URL / TextDecoder / atob / crypto (docs/guide/09-web-apis.md).
import {
  TextEncoder, TextDecoder, atob, btoa, base64Encode, base64Decode, encodeURIComponent, decodeURIComponent,
  URL, URLSearchParams, Event, CustomEvent, EventTarget, AbortController, AbortSignal, DOMException,
  crypto, sha1, sha256, toHex,
} from 'zinc:web';

// ---- encoding
const enc = new TextEncoder();
const dec = new TextDecoder();
console.log(enc.encode('héllo €𝄞'), dec.decode(enc.encode('héllo €𝄞')));
console.log(dec.decode([0x61, 0xff, 0x62, 0xe2, 0x82, 0x63, 0xf0, 0x9f, 0x98]), dec.decode([0xef, 0xbb, 0xbf, 0x6f, 0x6b]));
try { new TextDecoder('latin1'); } catch (e) { console.log(e.name, e.message); }
console.log(btoa('Hello, Zinc!'), atob('SGVsbG8sIFppbmMh'), btoa(''), btoa('a'), btoa('ab'), atob('YQ'), atob(' Y W I = '));
console.log(base64Encode([0, 255, 128, 7]), base64Decode('AP+ABw=='));
try { atob('@@@'); } catch (e) { console.log(e.name); }
try { btoa('€'); } catch (e) { console.log(e.name); }
console.log(encodeURIComponent('a b&c=d/é?'), decodeURIComponent('a%20b%26%C3%A9%zz'));

// ---- URL
const u = new URL('HTTPS://user:pa ss@Example.COM:443/a/./b/../c d?x=1&y=é#frag ment');
console.log(u.href);
console.log(u.protocol, u.username, u.password, u.host, u.hostname, u.port, u.pathname, u.search, u.hash, u.origin);
const rel = ['../up?q', '/abs', '//other.org/p', '?only', '#h', 'sib', '', 'g/./h/..', 'http://x.y:8080'];
for (const r of rel) console.log(r, '->', new URL(r, 'http://a.b/c/d;p?q#f').href);
console.log(new URL('file:///tmp/a b.txt').href, new URL('mailto:someone@example.com').pathname, new URL('ws://h:80/').host);
console.log(new URL('http://h/p?a=1&b=2&a=3').searchParams.getAll('a'), URL.canParse('nope'), URL.canParse('x:y'));
for (const bad of ['', 'http://', 'http://h:99999/', 'http://a b/', 'relative']) {
  try { new URL(bad); console.log('parsed', bad); } catch (e) { console.log('invalid', bad, e.name); }
}
const v = new URL('http://h.com/p');
v.searchParams.append('q', 'a b');
v.searchParams.append('lang', 'fr');
v.hash = 'top';
v.port = '8080';
v.pathname = 'x/y';
console.log(v.href, v.search);
v.search = '?k=v';
console.log(v.searchParams.get('k'), v.href, JSON.stringify(v.toJSON()));

// ---- URLSearchParams
const sp = new URLSearchParams('?b=2&a=1&c=%20x+y&a=0&empty=&flag');
console.log(sp.get('a'), sp.getAll('a'), sp.get('c'), sp.has('flag'), sp.has('zz'), sp.get('zz') === '', sp.size);
sp.set('a', 'new');
sp.delete('b');
sp.sort();
console.log(sp.toString(), sp.keys(), sp.values());
sp.forEach((val: string, key: string) => { console.log(' ', key, '=', val); });
console.log(new URLSearchParams('', [['x', '1&2'], ['y', '=']]).toString());

// ---- events
const t = new EventTarget();
const log = (e: Event): void => { console.log('listener', e.type); };
t.addEventListener('ping', log);
t.addEventListener('ping', log);  // same listener twice: once
t.addEventListener('ping', (e: Event) => { console.log('once', e.type, e.target === t); }, true);
t.dispatchEvent(new Event('ping'));
t.dispatchEvent(new Event('ping'));
t.removeEventListener('ping', log);
console.log('after remove', t.dispatchEvent(new Event('ping')));
t.addEventListener('data', (e: Event) => { const c = e as CustomEvent<string>; console.log('detail', c.detail); });
t.dispatchEvent(new CustomEvent<string>('data', 'payload'));
t.addEventListener('stop', (e: Event) => { e.preventDefault(); });
console.log('cancelled', !t.dispatchEvent(new Event('stop', true)), t.dispatchEvent(new Event('stop')));

// ---- abort
const ac = new AbortController();
ac.signal.onabort = (e: Event) => { console.log('onabort', e.type); };
ac.signal.addEventListener('abort', (e: Event) => { console.log('abort event', ac.signal.reason); });
console.log('aborted?', ac.signal.aborted);
ac.abort('stop now');
ac.abort('twice');  // no second event
try { ac.signal.throwIfAborted(); } catch (e) { console.log(e.name, e.message, e instanceof DOMException); }
console.log(AbortSignal.abort().aborted, AbortSignal.abort().reason);
const ts = AbortSignal.timeout(20);
ts.addEventListener('abort', (e: Event) => { console.log('timeout', ts.reason); });

// ---- crypto
console.log(toHex(sha256(enc.encode(''))));
console.log(toHex(sha256(enc.encode('abc'))));
console.log(toHex(sha256(enc.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))));
console.log(toHex(sha1(enc.encode('abc'))), toHex(sha1(enc.encode('The quick brown fox jumps over the lazy dog'))));
const big: u8[] = [];
for (let i = 0; i < 1000; i++) big.push(i & 255);
console.log(toHex(sha256(big)), toHex(sha1(big)));
const r = crypto.getRandomValues([0, 0, 0, 0, 0, 0, 0, 0]);
const id = crypto.randomUUID();
console.log(r.length, id.length, id.at(14), '89ab'.includes(id.at(19)), id.split('-').length, id !== crypto.randomUUID());
async function main(): Promise<void> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode('zinc'));
  console.log('digest', toHex(d));
  try { await crypto.subtle.digest('MD5', []); } catch (e) { console.log(e.name, e.message); }
}
main();
