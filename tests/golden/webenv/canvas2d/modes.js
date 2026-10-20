// Canvas 2D of the web environment, the full tier (ZN-572): the blend modes, patterns, conic gradients and hit tests. A classic script with nothing of the engine in it:
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

// conic gradients: the colours around a point, clockwise from an angle; a second one under a transform, with two stops at one place
{
  const x = make(64, 32).getContext('2d');
  const g = x.createConicGradient(0, 16, 16); g.addColorStop(0, '#f00'); g.addColorStop(0.5, '#00f'); g.addColorStop(1, '#0f0');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  const h = x.createConicGradient(Math.PI / 2, 0, 0); h.addColorStop(0, '#000'); h.addColorStop(0.25, '#fff'); h.addColorStop(0.25, '#f00'); h.addColorStop(1, '#ff0');
  x.translate(48, 16); x.fillStyle = h; x.fillRect(-16, -16, 32, 32);
  x.strokeStyle = g; x.lineWidth = 4; x.setTransform(1, 0, 0, 1, 0, 0); x.beginPath(); x.moveTo(2, 30); x.lineTo(30, 30); x.stroke();
  out.push(['conic', at(x, 28, 18), at(x, 16, 28), at(x, 4, 14), at(x, 16, 4), at(x, 28, 13), 'turned', at(x, 60, 16), at(x, 48, 4), at(x, 40, 24), at(x, 40, 8), 'stroke', at(x, 16, 30)].join(' '));
}
// a point in the stroke of the current path or of a Path2D (the width, caps and dashes of the moment); in a path by the even-odd rule
{
  const y = make(40, 40).getContext('2d');
  y.lineWidth = 6; y.beginPath(); y.moveTo(5, 10); y.lineTo(35, 10);
  const plain = [y.isPointInStroke(20, 12), y.isPointInStroke(20, 14), y.isPointInStroke(3, 10)];
  y.lineCap = 'square'; const capped = y.isPointInStroke(3, 10);
  y.setLineDash([10, 10]); const dashed = [y.isPointInStroke(10, 10), y.isPointInStroke(20, 10)]; y.setLineDash([]);
  const p = new Path2D(); p.rect(10, 20, 20, 10);
  out.push(['in stroke', ...plain, capped, ...dashed, 'Path2D', y.isPointInStroke(p, 10, 25), y.isPointInStroke(p, 20, 25), y.isPointInPath(p, 20, 25), 'current path', y.isPointInStroke(20, 12)].join(' '));
  y.beginPath(); y.rect(0, 0, 30, 30); y.rect(10, 10, 10, 10);
  out.push(['in path', y.isPointInPath(15, 15), y.isPointInPath(15, 15, 'evenodd'), y.isPointInPath(5, 5, 'evenodd'), y.isPointInPath(15, 15, 'nonzero')].join(' '));
}
console.log(out.join('\n'));
