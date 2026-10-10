// The image element of the web environment (ZN-569): a src is loaded as fetch loads it and decoded by the engine's codec, with the events
// and the properties in the order a browser gives them. Run with ZINC_WEB=1 by tests/t0/webenv.sh; the output is image.out. What the
// pixels are is tests/t1/webenv_image.sh's (a texture read back). The pictures are tests/data/images (32 x 24, twelve flat colours).
const log = (...a) => console.log(a.map(String).join(' '));
const settled = img => new Promise(resolve => { img.addEventListener('load', () => resolve('load'), { once: true }); img.addEventListener('error', () => resolve('error'), { once: true }); });
const pictures = '../../data/images/';

// the order: complete is false as soon as src is set, still false after the microtasks, then the size, complete and `load` together
const order = [], first = new Image();
first.onload = () => order.push('load: complete ' + first.complete + ', natural ' + first.naturalWidth + 'x' + first.naturalHeight + ', size ' + first.width + 'x' + first.height);
first.src = 'assets/fixture.png';
order.push('src set: complete ' + first.complete + ', natural ' + first.naturalWidth);
await Promise.resolve();
order.push('after the microtasks: complete ' + first.complete);
await first.decode();
order.push('decode() resolved');
log(order.join(' | '));
log('src', first.src.startsWith('file:///'), first.src.endsWith('/webenv/assets/fixture.png'), first.currentSrc === first.src, first.getAttribute('src'));

// each format the codec reads, by its natural size; the attributes win over it for width and height
for (const file of ['fixture.png', 'fixture.jpg', 'fixture.gif', 'fixture.bmp', '../../golden/webp/assets/frame.webp']) {
  const img = new Image(8);
  img.src = pictures + file;
  log(file.split('/').pop(), await settled(img), img.naturalWidth + 'x' + img.naturalHeight, 'width', img.width, 'height', img.height, 'complete', img.complete);
}

// data: and blob: URLs (a 2 x 1 PNG, and the bytes of a file as a Blob)
const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mP4z8DQwMDw/z8ADX4DfpfxiD8AAAAASUVORK5CYII=';
const fromData = document.createElement('img');
fromData.src = tiny;
log('data:', await settled(fromData), fromData.naturalWidth + 'x' + fromData.naturalHeight, fromData.src === tiny);
const url = URL.createObjectURL(await (await fetch('assets/fixture.png')).blob());
const fromBlob = new Image();
fromBlob.src = url;
log('blob:', await settled(fromBlob), fromBlob.naturalWidth + 'x' + fromBlob.naturalHeight);
URL.revokeObjectURL(url);
fromBlob.src = url;
log('a revoked blob:', await settled(fromBlob), fromBlob.naturalWidth, fromBlob.complete);

// what is not a picture: a missing file, bytes that are no image, an empty src; each is `error` with complete true and no size, and decode() rejects
for (const [what, src] of [['a missing file', 'assets/none.png'], ['not an image', 'assets/data.json'], ['an empty src', ''], ['a data: URL with no comma', 'data:image/png']]) {
  const img = new Image();
  img.src = src;
  const how = await settled(img);
  log(what + ':', how, 'complete', img.complete, 'natural', img.naturalWidth, 'decode()', await img.decode().then(() => 'resolved', e => e.name));
}
// a file of 57 bytes whose header asks for 9000 x 9000 pixels (more than the 2^26 the environment decodes, less than the decoder's own limit):
// refused from the header, before any pixel is allocated, and the reason is on stderr (the test looks for it there)
const huge = new Image();
huge.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAIygAACMoCAYAAABt1XK6AAAAAElFTkSuQmCC';
log('a picture larger than the environment takes:', await settled(huge), huge.naturalWidth);

// a src set again abandons the load before it: one event, for the last
const twice = new Image(), seen = [];
twice.onload = () => seen.push('load ' + twice.naturalWidth);
twice.onerror = () => seen.push('error');
twice.src = 'assets/none.png';
twice.src = tiny;
await new Promise(resolve => setTimeout(resolve, 20));
log('src set twice:', seen.join(', '));
twice.removeAttribute('src');
log('src removed:', twice.complete, twice.naturalWidth, JSON.stringify(twice.src));

// createImageBitmap: from a Blob, an image element and an ImageData, whole or a rectangle; what cannot be made is a rejection by name
const blob = await (await fetch('assets/fixture.png')).blob();
const whole = await createImageBitmap(blob);
log('bitmap of a blob', whole instanceof ImageBitmap, whole.width + 'x' + whole.height, Object.keys(whole).join(','));
const part = await createImageBitmap(first, 8, 8, 16, 8, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
log('bitmap of a rectangle of an image', part.width + 'x' + part.height);
log('bitmap of an ImageData', (await createImageBitmap(new ImageData(3, 2))).width, 'of a bitmap', (await createImageBitmap(whole, -4, -4, 8, 8)).height);
whole.close();
log('closed', whole.width, whole.height);
const refused = p => p.then(() => 'made', e => e.constructor.name + ' ' + e.name);
log('not made:', await refused(createImageBitmap(new Blob(['no picture']))), '|', await refused(createImageBitmap(new Image())), '|', await refused(createImageBitmap(whole)), '|',
  await refused(createImageBitmap(blob, 0, 0, 0, 4)), '|', await refused(createImageBitmap(blob, { resizeWidth: 8 })));
try { new ImageBitmap(); } catch (e) { log('new ImageBitmap():', e.constructor.name, e.message); }
