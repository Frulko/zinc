// PixiJS 8 Text objects, as an application writes them (ZN-570): a classic script that finds PixiJS in PIXI, the same in the web environment
// (pixi.js) and in headless Chrome (tools/canvas2d-ref, where FAMILY names the bundled Inter). PixiJS draws each on a 2D canvas, measures it
// with measureText, and uploads it as a texture.
(async () => {
  const app = new PIXI.Application();
  await app.init({ width: 320, height: 240, background: 0x182030, antialias: false, preference: 'webgl' });
  document.body.appendChild(app.canvas);
  const fontFamily = globalThis.FAMILY || 'sans-serif';
  const add = (text, x, y, style) => { const t = new PIXI.Text({ text, style: { fontFamily, ...style } }); t.position.set(x, y); app.stage.addChild(t); return t; };
  add('PixiJS Text', 16, 14, { fontSize: 32, fill: 0xffffff });
  add('Score 1250', 16, 66, { fontSize: 26, fontWeight: 'bold', fill: 0xffd24a, stroke: { color: 0x102050, width: 4, join: 'round' } });
  add('with a shadow', 16, 116, { fontSize: 22, fill: 0x7fe0ff, dropShadow: { color: 0x000000, alpha: 0.8, blur: 4, distance: 4, angle: Math.PI / 4 } });
  add('two lines,\ncentred', 16, 160, { fontSize: 16, fill: 0xffffff, align: 'center' });
  add('wrapped at a width of one hundred and forty pixels', 170, 150, { fontSize: 14, fill: 0xffffff, wordWrap: true, wordWrapWidth: 140 });
})();
