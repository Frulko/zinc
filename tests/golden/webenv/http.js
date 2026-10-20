// fetch and XMLHttpRequest of the web environment over the host's network (ZN-568): tests/t0/webenv.sh serves tests/golden/webenv/assets on a
// loopback port and gives its address in WEBENV_HTTP. A body arrives as its bytes (a binary file is intact), a missing page is a 404, a
// refused connection rejects.
const log = (...a) => console.log(a.map(String).join(' '));
const base = __host_sysEnv('WEBENV_HTTP');
const r = await fetch(base + '/data.json');
log('fetch', r.status, r.ok, r.headers.get('content-type'), (await r.json()).name);
const bytes = new Uint8Array(await (await fetch(base + '/bytes.bin')).arrayBuffer());
log('bytes', bytes.length, bytes.every((b, i) => b === i));
log('missing', (await fetch(base + '/none.json')).status);
const x = await new Promise(resolve => { const q = new XMLHttpRequest(); q.responseType = 'arraybuffer'; q.onload = () => resolve(q); q.open('GET', base + '/bytes.bin'); q.send(); });
log('xhr', x.status, x.response.byteLength, new Uint8Array(x.response)[200], x.getResponseHeader('Content-Length'));
const two = await Promise.all([fetch(base + '/data.json').then(a => a.text()), fetch(base + '/classic.js').then(a => a.text())]);
log('two at once', two[0].length, two[1].includes('classicHello'));
try { await fetch('http://127.0.0.1:1/'); log('no error'); } catch (e) { log('refused', e.constructor.name, /^Failed to fetch/.test(e.message)); }
// an image element over the network (ZN-569): the picture's size with `load`, a missing one is `error`
const picture = src => new Promise(resolve => { const img = new Image(); img.onload = () => resolve('load ' + img.naturalWidth + 'x' + img.naturalHeight); img.onerror = () => resolve('error ' + img.naturalWidth); img.src = src; });
log('image', await picture(base + '/fixture.png'), '|', await picture(base + '/none.png'));
