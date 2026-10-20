// Canvas 2D text against a browser (ZN-570). A classic script, run as it is on both sides: in headless Chrome by tools/canvas2d-ref, with
// Inter loaded under `family`, to make scene-chrome.png and chrome.json; in the web environment by text.js, where the sans family is Inter.

// What a game's text looks like on its canvas: the calls PixiJS Text, Phaser Text, Kaplay's font atlas and LittleJS's overlay make
// (fill, stroke under fill, drop shadow, gradient fill, alignment and baselines, letter spacing, small sizes, a transform), and a few shapes.
function scene(ctx, W, H, family) {
  ctx.fillStyle = '#20242c'; ctx.fillRect(0, 0, W, H);
  ctx.font = '32px ' + family; ctx.fillStyle = '#ffffff'; ctx.fillText('Hello, Zinc! 0123', 16, 44);
  ctx.font = 'bold 28px ' + family; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = '#102050'; ctx.strokeText('Score 1250', 16, 90);
  ctx.fillStyle = '#ffd24a'; ctx.fillText('Score 1250', 16, 90);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
  ctx.font = '24px ' + family; ctx.fillStyle = '#7fe0ff'; ctx.fillText('Shadowed text', 16, 132);
  ctx.restore();
  const gradient = ctx.createLinearGradient(0, 150, 0, 180);
  gradient.addColorStop(0, '#ff5050'); gradient.addColorStop(1, '#ffe050');
  ctx.font = 'bold 30px ' + family; ctx.fillStyle = gradient; ctx.fillText('Gradient', 16, 176);
  ctx.fillStyle = '#ffffff'; ctx.font = '18px ' + family;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('centred, middle', W * 0.75, 30);
  ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('right, top', W - 12, 60);
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('left, bottom', W * 0.6, 120);
  ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = '3px'; ctx.font = '14px ' + family; ctx.fillText('SPACED OUT', W * 0.6, 150); ctx.letterSpacing = '0px';
  ctx.font = '12px ' + family; ctx.fillText('The quick brown fox jumps over the lazy dog', 16, H - 44);
  ctx.save(); ctx.translate(W * 0.78, H - 60); ctx.rotate(-0.3); ctx.font = '20px ' + family; ctx.fillText('rotated', 0, 0); ctx.restore();
  ctx.fillStyle = 'rgba(80, 200, 120, 0.5)'; ctx.fillRect(16, H - 30, 120, 18);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.strokeRect(151, H - 29, 60, 16);
  ctx.beginPath(); ctx.arc(250, H - 21, 9, 0, Math.PI * 2); ctx.fillStyle = '#e04080'; ctx.fill();
}

// The numbers a library lays its text out with: a TextMetrics per sample, where the ink sits for each baseline and alignment, and the box of
// the pixels of each sample drawn alone (the glyph boxes).
function metrics(ctx, family) {
  const out = {}, r = v => Math.round(v * 1000) / 1000;
  const samples = [['hello32', '32px', 'Hello'], ['hello10', '10px', 'Hello'], ['bold24', 'bold 24px', 'Score 1250'], ['kern16', '16px', 'AVATAR Wave To.'], ['small12', '12px', 'The quick brown fox'], ['mixed48', '48px', 'Hxg']];
  for (const [name, font, text] of samples) {
    ctx.font = font + ' ' + family; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(text);
    out[name] = [m.width, m.actualBoundingBoxLeft, m.actualBoundingBoxRight, m.actualBoundingBoxAscent, m.actualBoundingBoxDescent, m.fontBoundingBoxAscent, m.fontBoundingBoxDescent].map(r);
    ctx.clearRect(0, 0, 256, 80); ctx.fillStyle = '#ffffff'; ctx.fillText(text, 20, 50);
    const d = ctx.getImageData(0, 0, 256, 80).data;
    let x0 = 256, y0 = 80, x1 = -1, y1 = -1;
    for (let y = 0; y < 80; y++) for (let x = 0; x < 256; x++) if (d[(y * 256 + x) * 4 + 3] >= 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    out['box-' + name] = [x0, y0, x1, y1];
  }
  ctx.font = '32px ' + family;
  for (const b of ['top', 'hanging', 'middle', 'alphabetic', 'ideographic', 'bottom']) { ctx.textBaseline = b; const m = ctx.measureText('Hxg'); out['base-' + b] = [m.actualBoundingBoxAscent, m.actualBoundingBoxDescent].map(r); }
  ctx.textBaseline = 'alphabetic';
  for (const a of ['left', 'center', 'right', 'start', 'end']) { ctx.textAlign = a; const m = ctx.measureText('Hxg'); out['align-' + a] = [m.actualBoundingBoxLeft, m.actualBoundingBoxRight].map(r); }
  ctx.textAlign = 'left';
  return out;
}
