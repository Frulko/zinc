// URL, Blob, fetch, XMLHttpRequest, storage and script elements of the web environment (ZN-568) over files, data: and blob: URLs: run with
// ZINC_WEB=1, the output is net.out. The network itself (http) is tests/golden/webenv/http.js, against a server the test starts.
const log = (...a) => console.log(a.map(String).join(' '));

const u = new URL('assets/../assets/data.json?v=1#top', document.baseURI);
log('url', u.protocol, u.pathname.endsWith('/webenv/assets/data.json'), u.search, u.hash, u.searchParams.get('v'), u instanceof URL, URL.canParse('nope'), URL.canParse('a', 'http://h/'), new URL('http://тест/a b').href);
const q = new URLSearchParams('b=2&a=1&a=0'); q.sort();
log('query', String(q), q.getAll('a').join(','), q instanceof URLSearchParams);

const r = await fetch('assets/data.json');
log('fetch', r.ok, r.status, r.statusText, r.headers.get('Content-Type'), r.headers.get('content-length'), r.url.endsWith('/assets/data.json'), JSON.stringify(await r.clone().json()), r.bodyUsed, (await r.text()).length, r.bodyUsed);
try { await r.text(); } catch (e) { log('read twice', e.constructor.name); }
const bin = new Uint8Array(await (await fetch(new Request('assets/bytes.bin'))).arrayBuffer());
log('bytes', bin.length, bin[0], bin[127], bin[128], bin[255], bin.every((b, i) => b === i));
const missing = await fetch('assets/none.png');
log('missing', missing.ok, missing.status, missing.statusText);
log('root path', (await fetch('/assets/data.json')).status, (await (await fetch('data:text/plain;base64,emluYw==')).text()), (await (await fetch('data:,hello%20world')).text()), (await fetch('data:image/png;base64,AAEC')).headers.get('content-type'));

const blob = new Blob(['{"a":', new Uint8Array([49]), '}'], { type: 'Application/JSON' });
const blobUrl = URL.createObjectURL(blob);
log('blob', blob.size, blob.type, await blob.text(), new Uint8Array(await blob.slice(1, 4).arrayBuffer()).join(','), blobUrl.startsWith('blob:'), JSON.stringify(await (await fetch(blobUrl)).json()), (await (await fetch(blobUrl)).blob()).type);
URL.revokeObjectURL(blobUrl);
log('revoked', (await fetch(blobUrl)).status, new File(['x'], 'a.txt', { type: 'text/plain' }).name);
const stop = new AbortController(); stop.abort();
try { await fetch('assets/data.json', { signal: stop.signal }); } catch (e) { log('abort', e.name, e instanceof DOMException); }
const h = new Headers({ 'Content-Type': 'text/plain', 'X-B': '1' }); h.append('x-b', '2');
log('headers', [...h.keys()].join(','), h.get('X-B'), h.has('nope'), await new Response('hi', { status: 201, headers: h }).text(), new Response(null, { status: 404 }).ok, (await Response.json({ a: 1 }).json()).a);

function xhr(url, type, sync) {
  return new Promise(resolve => {
    const x = new XMLHttpRequest(), events = [];
    x.responseType = type;
    x.onreadystatechange = () => events.push(x.readyState);
    for (const t of ['loadstart', 'progress', 'load', 'error', 'loadend']) x.addEventListener(t, e => { events.push(t + (t === 'progress' ? ':' + e.loaded + '/' + e.total + ':' + e.lengthComputable : '')); if (t === 'loadend') resolve([x, events.join(' ')]); });
    x.open('GET', url, !sync);
    x.send();
    if (sync) log('sync', x.readyState, x.status, x.responseText.length);
  });
}
let [x, events] = await xhr('assets/data.json', '');
log('xhr text', x.status, x.statusText, JSON.parse(x.responseText).text, x.response === x.responseText, x.getResponseHeader('content-type'), x.responseURL.endsWith('data.json'), '|', events);
[x] = await xhr('assets/data.json', 'json'); log('xhr json', x.response.list.join(','));
[x] = await xhr('assets/bytes.bin', 'arraybuffer'); log('xhr arraybuffer', x.response instanceof ArrayBuffer, x.response.byteLength, new Uint8Array(x.response)[255]);
[x] = await xhr('assets/bytes.bin', 'blob'); log('xhr blob', x.response instanceof Blob, x.response.size, x.response.type);
[x, events] = await xhr('assets/none.json', ''); log('xhr missing', x.status, '|', events);
await xhr('assets/data.json', '', true);

localStorage.setItem('score', 12); sessionStorage.setItem('tab', 'x');
log('storage', localStorage.getItem('score'), typeof localStorage.getItem('score'), localStorage.getItem('nope'), localStorage.length, localStorage.key(0), sessionStorage.getItem('tab'), localStorage instanceof Storage);
localStorage.removeItem('score');
log('removed', localStorage.getItem('score'), localStorage.length);

const loaded = name => new Promise(resolve => { const s = document.createElement('script'); s.src = name; s.onload = () => resolve('load'); s.onerror = () => resolve('error'); document.head.appendChild(s); });
log('script', await loaded('assets/classic.js'), typeof classicHello, classicHello(), window.classicVar, await loaded('assets/none.js'), document.scripts.length);
const inline = document.createElement('script'); inline.textContent = 'var inlineRan = 7;'; document.head.appendChild(inline);
log('inline script', window.inlineRan);
