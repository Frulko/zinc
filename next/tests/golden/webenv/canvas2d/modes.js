// Canvas 2D of the web environment, the full tier (ZN-572): the blend modes and patterns. A classic script with nothing of the engine in it:
// the same in headless Chrome, whose lines are modes-chrome.out (tools/canvas2d-ref out modes). Run by tests/t1/webenv_canvas2d_full.sh,
// which allows each number 2 of difference (a browser keeps 8 bits a channel, premultiplied).
const out = [];
const make = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const at = (x, px, py) => Array.from(x.getImageData(px, py, 1, 1).data).join(',');

// a picture of four pixels: red, half transparent green, nothing, blue
const tile = make(4, 4), tx = tile.getContext('2d');
tx.fillStyle = '#f00'; tx.fillRect(0, 0, 2, 2); tx.fillStyle = 'rgba(0, 255, 0, 0.5)'; tx.fillRect(2, 0, 2, 2); tx.fillStyle = '#00f'; tx.fillRect(2, 2, 2, 2);

// the 15 blend modes: an opaque and a half transparent colour over an opaque backdrop, a half transparent one and none; then a picture
for (const mode of ['multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']) {
  const x = make(60, 10).getContext('2d');
  x.fillStyle = '#c06030'; x.fillRect(0, 0, 20, 10); x.fillRect(40, 0, 20, 10); x.fillStyle = 'rgba(40, 90, 200, 0.6)'; x.fillRect(20, 0, 10, 10);
  x.globalCompositeOperation = mode;
  x.fillStyle = '#50a0e0'; x.fillRect(0, 0, 10, 10); x.fillRect(30, 0, 10, 10);
  x.fillStyle = 'rgba(230, 200, 40, 0.5)'; x.fillRect(10, 0, 20, 10);
  x.drawImage(tile, 40, 0, 20, 10);
  out.push([mode, x.globalCompositeOperation, at(x, 5, 5), at(x, 15, 5), at(x, 25, 5), at(x, 35, 5), at(x, 43, 2), at(x, 55, 2), at(x, 55, 8)].join(' '));
}
// the mode is part of the state; a value that is not one is ignored
{
  const x = make(20, 10).getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, 20, 10); x.fillStyle = '#4080c0';
  x.save(); x.globalCompositeOperation = 'multiply'; x.globalCompositeOperation = 'no-such-mode'; x.fillRect(0, 0, 10, 10); x.restore();
  x.fillRect(10, 0, 10, 10);
  out.push(['state', x.globalCompositeOperation, at(x, 5, 5), at(x, 15, 5)].join(' '));
}

// patterns: the four repetitions, in the space of the transform of the moment; as the stroke style; kept by save and restore
{
  const x = make(80, 16).getContext('2d');
  const all = ['repeat', 'repeat-x', 'repeat-y', 'no-repeat'].map(r => x.createPattern(tile, r));
  all.forEach((p, i) => { x.save(); x.translate(i * 16, 0); x.fillStyle = p; x.fillRect(0, 0, 12, 12); x.restore(); });
  const spots = i => [at(x, i * 16 + 1, 1), at(x, i * 16 + 3, 1), at(x, i * 16 + 3, 3), at(x, i * 16 + 9, 1), at(x, i * 16 + 1, 9), at(x, i * 16 + 11, 11)].join(' ');
  for (let i = 0; i < 4; i++) out.push(['pattern', ['repeat', 'repeat-x', 'repeat-y', 'no-repeat'][i], spots(i)].join(' '));
  x.strokeStyle = all[0]; x.lineWidth = 4; x.beginPath(); x.moveTo(64, 2); x.lineTo(80, 2); x.stroke();
  x.fillStyle = x.createPattern(tile, null); x.save(); x.fillStyle = '#fff'; x.restore(); x.fillRect(64, 8, 8, 8);
  let refused = ''; try { x.createPattern(tile, 'twice'); } catch (e) { refused = e.name; }
  out.push(['pattern', 'stroke', at(x, 65, 1), at(x, 71, 3), 'restored', at(x, 65, 9), at(x, 71, 11), refused, typeof x.fillStyle, x.fillStyle === x.fillStyle].join(' '));
}
console.log(out.join('\n'));
