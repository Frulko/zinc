// Canvas 2D of the web environment, the full tier (ZN-572): run with ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=2. The output is
// full.out: pixels of flat colours and answers a browser gives too.
const log = (...a) => console.log(a.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' '));
const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 120;
const ctx = canvas.getContext('2d');
const at = (x, y, c = ctx) => Array.from(c.getImageData(x, y, 1, 1).data).join(',');
const mixed = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return d[0] > 20 && d[2] > 20; };

// pictures: smoothed (four pixels when not made smaller), or the nearest pixel when imageSmoothingEnabled is false (pixel art); pixel on
// pixel a picture is copied as it is
const src = document.createElement('canvas'); src.width = 4; src.height = 4;
const sx = src.getContext('2d'); sx.fillStyle = '#f00'; sx.fillRect(0, 0, 2, 4); sx.fillStyle = '#00f'; sx.fillRect(2, 0, 2, 4);
ctx.drawImage(src, 0, 0, 16, 16);
ctx.imageSmoothingEnabled = false; ctx.drawImage(src, 20, 0, 16, 16);
log('smoothed', mixed(7, 8), mixed(8, 8), at(2, 8), at(13, 8), 'nearest', at(27, 8), at(28, 8), ctx.imageSmoothingEnabled);
ctx.save(); ctx.imageSmoothingEnabled = true; ctx.restore(); ctx.drawImage(src, 40, 0, 16, 16);
ctx.imageSmoothingEnabled = true; ctx.drawImage(src, 60.5, 0); ctx.drawImage(src, 70, 0);
log('restored', at(47, 8), at(48, 8), ctx.imageSmoothingEnabled, 'half a pixel', mixed(62, 2), 'pixel on pixel', at(71, 2), at(72, 2));

// a canvas nothing was painted on is not read back again: the same copy of its pixels as a picture or a texture
const first = __srcPixels(src), again = __srcPixels(src);
sx.fillRect(0, 0, 1, 1);
log('read back', first === again, __srcPixels(src) === first, __srcPixels(src).data[2]);

// Path2D: built once, painted under the transform of the moment; the current path is left alone; SVG path data; the even-odd rule
ctx.fillStyle = '#0f0';
const box = new Path2D(); box.rect(0, 0, 10, 10);
ctx.beginPath(); ctx.rect(100, 0, 10, 10);
ctx.save(); ctx.translate(80, 0); ctx.fill(box); ctx.restore();
ctx.translate(0, 20); ctx.fill(box); ctx.setTransform(1, 0, 0, 1, 0, 0);
ctx.fillStyle = '#ff0'; ctx.fill();
log('Path2D', at(85, 5), at(5, 25), at(95, 5), 'current path', at(105, 5), ctx.isPointInPath(box, 5, 5), ctx.isPointInPath(box, 15, 5), ctx.isPointInPath(105, 5));
const svg = new Path2D('M20 20 h20 v20 h-20 Z m30 0 l10 0 0 10 -10 0 z M80,20 C80,40 100,40 100,20 S120,0 120,20 Q130,40 140,20 T160,20 A10 10 0 0 1 180 20 L180 40 L80 40 Z');
ctx.fillStyle = '#f0f'; ctx.fill(svg);
log('path data', at(30, 30), at(45, 30), at(55, 25), at(55, 35), at(90, 30), at(170, 14), at(170, 8), at(130, 38), at(130, 22));
const ring = new Path2D(); ring.rect(0, 60, 40, 40); ring.rect(10, 70, 20, 20);
const both = new Path2D(ring); both.addPath(ring, { a: 1, b: 0, c: 0, d: 1, e: 50, f: 0 });
ctx.fillStyle = '#0ff'; ctx.fill(both, 'evenodd');
ctx.beginPath(); ctx.rect(100, 60, 40, 40); ctx.rect(110, 70, 20, 20); ctx.fill();
ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; const line = new Path2D(); line.moveTo(150, 60); line.lineTo(190, 60); line.roundRect(150, 70, 40, 30, 8); ctx.stroke(line);
log('even-odd', at(5, 65), at(20, 80), at(70, 80), at(55, 65), 'non-zero', at(120, 80), 'stroke', at(170, 60), at(170, 70), at(150, 85), at(170, 85));
ctx.save(); const hole = new Path2D(); hole.rect(0, 104, 40, 16); hole.rect(10, 104, 20, 16); ctx.clip(hole, 'evenodd'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 100, 200, 20); ctx.restore();
ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 200, 120); ctx.clip(); ctx.beginPath(); ctx.arc(60, 112, 6, 0, 7); ctx.fill(); ctx.restore();
ctx.beginPath(); ctx.ellipse(100, 110, 16, 6, Math.PI / 2, 0, Math.PI, true); ctx.fill();
log('clip', at(5, 110), at(20, 110), at(35, 110), at(50, 110), 'whole canvas', at(60, 112), 'ellipse', at(103, 110), at(97, 110), at(103, 100), at(103, 122 - 4));

// the canvas as a file: PNG with its alpha, JPEG over black; decoded again by the engine's own codec
const small = document.createElement('canvas'); small.width = 8; small.height = 4;
const sm = small.getContext('2d'); sm.fillStyle = '#f00'; sm.fillRect(0, 0, 4, 4); sm.fillStyle = 'rgba(0, 0, 255, 0.5)'; sm.fillRect(4, 0, 2, 4);
const url = small.toDataURL(), jpeg = small.toDataURL('image/jpeg', 0.9);
const decode = u => new Promise((done, fail) => { const i = new Image(); i.onload = () => done(i); i.onerror = () => fail(new Error('not decoded')); i.src = u; });
const png = await decode(url), jpg = await decode(jpeg);
const out = document.createElement('canvas'); out.width = 16; out.height = 4;
const ox = out.getContext('2d'); ox.drawImage(png, 0, 0); ox.drawImage(jpg, 8, 0);
const near = (x, y, r, g, b) => { const d = ox.getImageData(x, y, 1, 1).data; return Math.abs(d[0] - r) < 24 && Math.abs(d[1] - g) < 24 && Math.abs(d[2] - b) < 24 && d[3] === 255; };
log('toDataURL', url.slice(0, 30), png.width, png.height, at(1, 1, ox), at(4, 1, ox), at(7, 1, ox), jpeg.slice(0, 23), near(9, 1, 255, 0, 0), near(15, 1, 0, 0, 0), small.toDataURL('image/webp').slice(0, 14));
const blob = await new Promise(done => small.toBlob(done)), off = new OffscreenCanvas(3, 2);
log('toBlob', blob.type, blob.size > 60, new Uint8Array(await blob.arrayBuffer())[1], 'OffscreenCanvas', off.width, off.height, off instanceof OffscreenCanvas, canvas instanceof OffscreenCanvas, (await off.convertToBlob()).type, off.getContext('2d') instanceof CanvasRenderingContext2D);

// a picture that is not turned is blended by a loop of its own (source-over, no clip, no shadow): the same pixels as the general way, which
// a clip that is not the whole canvas takes. Whole and half pixels, scaled, a part of it, over the edges, under globalAlpha.
const ball = document.createElement('canvas'); ball.width = 12; ball.height = 12;
const bc = ball.getContext('2d'); bc.fillStyle = 'rgba(255, 128, 0, 0.8)'; bc.beginPath(); bc.arc(6, 6, 5.5, 0, 7); bc.fill(); bc.fillStyle = '#00f'; bc.fillRect(0, 0, 3, 3);
const sprites = (smooth, clipped) => {
  const k = document.createElement('canvas'); k.width = 96; k.height = 48;
  const x = k.getContext('2d'); x.fillStyle = '#204060'; x.fillRect(0, 0, 96, 24);   // opaque above, transparent below
  if (clipped) { x.beginPath(); x.rect(0, 1, 96, 47); x.clip(); }   // nothing is drawn on the first row
  x.imageSmoothingEnabled = smooth;
  x.drawImage(ball, 2, 2); x.drawImage(ball, 20.5, 18.25); x.globalAlpha = 0.5; x.drawImage(ball, 40, 4, 30, 36); x.globalAlpha = 1;
  x.drawImage(ball, 3, 3, 6, 6, 74.3, 10.6, 15, 15); x.drawImage(ball, 90, 40); x.drawImage(ball, -5, 30);
  x.scale(0.5, 2); x.drawImage(ball, 30, 14);   // made smaller: the general way for both
  return x;
};
const same = smooth => { const a = sprites(smooth, false).getImageData(0, 0, 96, 48).data, b = sprites(smooth, true).getImageData(0, 0, 96, 48).data; let worst = 0; for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i])); return worst <= 1; };
const sp = sprites(true, false);
log('sprites', same(true), same(false), at(3, 3, sp), at(8, 8, sp), at(8, 1, sp), at(26, 30, sp), at(55, 10, sp), at(95, 47, sp), at(0, 36, sp));
log('not there', __canvas2dUnsupported());
