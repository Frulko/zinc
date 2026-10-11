// Canvas 2D of the web environment (ZN-570): run with ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x480 ZINC_FRAMES=3. The output
// is text.out; the window's frame 2 is the scene of scene.js, which tests/t1/webenv_canvas2d.sh compares with Chrome's (scene-chrome.png).
const log = (...a) => console.log(a.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' '));
const text = async name => (await fetch(name)).text();
(0, eval)(await text('scene.js'));
const chrome = JSON.parse(await text('chrome.json'));

const small = document.createElement('canvas'); small.width = 256; small.height = 80;
const ctx = small.getContext('2d');
const at = (x, y, c = ctx) => Array.from(c.getImageData(x, y, 1, 1).data).join(',');

// pixels of flat colours: rectangles, the state stack, transforms, clipping, alpha as a browser blends it, compositing
log('context', ctx instanceof CanvasRenderingContext2D, ctx.canvas === small, small.getContext('2d') === ctx, small.getContext('webgl'), ctx.font, ctx.fillStyle, ctx.textAlign, ctx.textBaseline, ctx.globalAlpha);
ctx.fillStyle = 'rgb(255, 0, 0)'; ctx.fillRect(0, 0, 20, 20);
ctx.save(); ctx.fillStyle = '#00f'; ctx.translate(40, 0); ctx.scale(2, 2); ctx.fillRect(0, 0, 10, 10); log('state', ctx.fillStyle, ctx.getTransform().a, ctx.getTransform().e); ctx.restore();
log('rects', at(10, 10), at(30, 10), at(50, 10), at(59, 19), at(61, 10), 'restored', ctx.fillStyle, ctx.getTransform().a);
ctx.clearRect(5, 5, 10, 10); ctx.strokeStyle = 'lime'; ctx.lineWidth = 4; ctx.strokeRect(82, 2, 16, 16);
log('clear and stroke', at(10, 10), at(2, 2), at(82, 10), at(90, 10), ctx.strokeStyle);
ctx.fillStyle = 'white'; ctx.fillRect(100, 0, 20, 20); ctx.globalAlpha = 0.5; ctx.fillStyle = 'black'; ctx.fillRect(100, 0, 20, 20); ctx.globalAlpha = 1;
ctx.fillStyle = 'rgba(0, 0, 255, 0.5)'; ctx.fillRect(120, 0, 20, 20);
log('alpha', at(110, 10), at(130, 10));
ctx.save(); ctx.beginPath(); ctx.rect(140, 0, 10, 10); ctx.clip(); ctx.fillStyle = 'hsl(120, 100%, 50%)'; ctx.fillRect(140, 0, 20, 20); ctx.restore();
ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 4, 4); ctx.globalCompositeOperation = 'source-over';
log('clip and composite', at(145, 5), at(155, 5), at(145, 15), at(2, 2), ctx.globalCompositeOperation);
ctx.beginPath(); ctx.moveTo(160, 0); ctx.lineTo(180, 0); ctx.lineTo(180, 20); ctx.closePath(); ctx.fillStyle = '#ff8000'; ctx.fill();
log('path', at(175, 5), at(165, 15), ctx.isPointInPath(175, 5), ctx.isPointInPath(165, 15));
ctx.beginPath(); ctx.roundRect(180, 40, 40, 30, 10); ctx.ellipse(240, 55, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
log('roundRect and ellipse', at(181, 41), at(200, 55), at(218, 68), at(240, 55), at(240, 47), at(249, 55), at(254, 55));
const g = ctx.createLinearGradient(200, 0, 240, 0); g.addColorStop(0, '#000'); g.addColorStop(1, '#fff'); ctx.fillStyle = g; ctx.fillRect(200, 0, 40, 20);
const mid = ctx.getImageData(220, 10, 1, 1).data[0];
log('gradient', at(200, 10).split(',')[0] < 8, mid > 118 && mid < 138, at(239, 10).split(',')[0] > 247, ctx.fillStyle === g);

// ImageData in and out, and pictures drawn from one canvas to another in the three forms
const img = ctx.createImageData(2, 2); img.data.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 128]);
ctx.putImageData(img, 0, 40);
const back = ctx.getImageData(0, 40, 2, 2);
log('image data', back.width, back.height, Array.from(back.data).join(','), ctx.getImageData(-1, -1, 2, 2).data.length);
const src = document.createElement('canvas'); src.width = 4; src.height = 4;
const sx = src.getContext('2d'); sx.fillStyle = '#f00'; sx.fillRect(0, 0, 2, 4); sx.fillStyle = '#00f'; sx.fillRect(2, 0, 2, 4);
ctx.drawImage(src, 10, 40); ctx.drawImage(src, 20, 40, 8, 8); ctx.drawImage(src, 2, 0, 2, 4, 40, 40, 6, 6);
log('drawImage', at(10, 41), at(13, 41), at(14, 41), at(21, 44), at(27, 44), at(40, 40), at(45, 45), at(46, 45));
src.width = 4;
log('resized', at(1, 1, sx), sx.fillStyle);

// text: the numbers against Chrome's for the same font (widths within 1 %, everything else within a pixel)
const mine = metrics(ctx, 'sans-serif');
let bad = 0;
for (const k of Object.keys(chrome)) {
  const a = mine[k], b = chrome[k];
  const ok = b.every((v, i) => Math.abs(a[i] - v) <= (i === 0 && !k.includes('-') ? Math.abs(v) * 0.01 : 1));
  if (!ok) { bad++; log('differs from Chrome', k, a, b); }
}
log('metrics', Object.keys(chrome).length, 'compared,', bad, 'differ; Hello at 32px', mine.hello32[0], 'Chrome', chrome.hello32[0]);
ctx.font = 'italic bold 20px "Some Font", monospace'; log('font', ctx.font, ctx.measureText('iiii').width === ctx.measureText('MMMM').width);
ctx.font = 'nonsense'; ctx.fillStyle = 'no such colour'; ctx.textAlign = 'middle'; log('ignored', ctx.font, ctx.fillStyle, ctx.textAlign);
ctx.font = '20px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
ctx.clearRect(0, 0, 256, 80); ctx.beginPath(); ctx.rect(0, 60, 10, 10); ctx.fillText('path kept', 20, 30); ctx.fill();   // fillText leaves the current path alone
log('text and path', at(5, 65), ctx.measureText('').width, ctx.measureText('a\nb').width === ctx.measureText('a b').width, ctx.measureText('wide', 5).width > 5);
const wide = ctx.measureText('squeezed text').width; ctx.clearRect(0, 0, 256, 80); ctx.fillText('squeezed text', 10, 30, 40);
let right = 0; { const d = ctx.getImageData(0, 0, 256, 80).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) right = Math.max(right, (i >> 2) % 256); }
log('maxWidth', wide > 100, right <= 51, right >= 46);

// a font of the program's own
const face = new FontFace('Mine', 'url(assets/mono.ttf)');
document.fonts.add(face);
await document.fonts.ready;
ctx.font = '20px Mine'; log('FontFace', face.status, document.fonts.check('20px Mine'), ctx.measureText('iiii').width === ctx.measureText('MMMM').width);
const none = new FontFace('None', new Uint8Array(40)); log('not a font', await none.loaded.then(() => 'loaded', e => e.name), none.status);

// what this tier does not do is counted, not thrown
ctx.fill('evenodd'); ctx.fillStyle = ctx.createPattern(src, 'repeat'); ctx.globalCompositeOperation = 'multiply'; ctx.filter = 'blur(2px)'; ctx.isPointInStroke(1, 1);
ctx.arc(0, 0, NaN, 0, 1); ctx.fillRect(0, 0, Infinity, 1); ctx.drawImage(new Image(), 0, 0);
log('unsupported', __canvas2dUnsupported());

// what the window shows: the scene, on a canvas of the document; and a canvas as a texture source keeps its transparent pixels
const canvas = document.createElement('canvas'); canvas.width = innerWidth; canvas.height = innerHeight;
document.body.appendChild(canvas);
scene(canvas.getContext('2d'), canvas.width, canvas.height, 'sans-serif');
const label = document.createElement('canvas'); label.width = 64; label.height = 32;
const lx = label.getContext('2d'); lx.font = '24px sans-serif'; lx.fillStyle = '#fff'; lx.fillText('Hi', 4, 24);
const px = __srcPixels(label);
log('texture source', px.width, px.height, px.data.length, px.data[3], lx.getImageData(8, 14, 1, 1).data[3] > 200);
let frames = 0;
requestAnimationFrame(function frame() { if (++frames < 3) requestAnimationFrame(frame); else log('frames', frames); });
