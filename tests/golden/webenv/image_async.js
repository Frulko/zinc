// Pictures decoded off the frame (ZN-569): a picture larger than the environment decodes at once (256 x 256 pixels) goes to the decoding thread,
// read there too when it is a file. A request lives until its result is taken or cancelled; a cancelled or stale one is never delivered.
// Run with ZINC_WEB=1 by tests/t0/webenv.sh, once with ZINC_DETERMINISTIC=1 (each result waits for its decode) and once without: the output
// is image_async.out both times. The picture is a 1024 x 1024 grey JPEG of the WebGL conformance suite (10 KiB).
const log = (...a) => console.log(a.map(String).join(' '));
const settled = img => new Promise(resolve => { img.addEventListener('load', () => resolve('load'), { once: true }); img.addEventListener('error', () => resolve('error'), { once: true }); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const big = '../../../third_party/webgl-conformance/sdk/tests/resources/gray-1024x1024.jpg';
const first = px => Array.from(px.data.subarray(0, 4)).join(',');

// a file, then its bytes through a blob: URL: each decoded on the thread, the element's events as for any picture
const file = new Image();
file.src = big;
log('file:', file.complete, await settled(file), file.naturalWidth + 'x' + file.naturalHeight, 'first pixel', first(__srcPixels(file)));
const blob = new Image();
blob.src = URL.createObjectURL(await (await fetch(big)).blob());
log('blob:', await settled(blob), blob.naturalWidth + 'x' + blob.naturalHeight, 'first pixel', first(__srcPixels(blob)));

// src set again while the first decode runs: one event, for the last; removed while it runs: none
const twice = new Image();
let events = 0;
twice.onload = twice.onerror = () => events++;
twice.src = big;
twice.src = big + '?again';
await settled(twice);
await sleep(50);
log('src set twice:', events, 'event', twice.naturalWidth);
const removed = new Image();
let none = 0;
removed.onload = removed.onerror = () => none++;
removed.src = big;
removed.removeAttribute('src');
await sleep(50);
log('src removed:', none, 'events', removed.complete, removed.naturalWidth);

// the requests themselves: ids are never reused, a cancelled one is never delivered, a stale id names nothing
const images = __zincImages, bytes = new Uint8Array(await (await fetch(big)).arrayBuffer());
const one = images.start(bytes.buffer, 0, bytes.length), two = images.start(bytes.buffer, 0, bytes.length, true);
log('two requests:', typeof one, two > one, 'live', images.live());
images.cancel(one);
log('one cancelled: live', images.live());
const got = [];
for (let r; (r = images.take(-1)) !== undefined;) got.push(r.id === two ? 'the second, ' + r.width + 'x' + r.height : r.id === one ? 'the cancelled one' : 'another');
log('delivered:', got.join(' | '), 'live', images.live());
images.cancel(two);
images.cancel(one);
log('stale ids cancelled again: live', images.live(), 'take', images.take(0));
const small = images.start(bytes.buffer, 0, 0);
log('no bytes:', small, '| a small picture is decoded at once:', typeof images.start(new Uint8Array(await (await fetch('../../data/images/fixture.png')).arrayBuffer()).buffer), 'live', images.live());
