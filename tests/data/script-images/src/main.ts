// createImageBitmap in a zinc:script context (ZN-569, kImageShims of src/qjs/webenv.cpp): a PNG fetched from a data: URL, decoded off the frame
// (300 x 200: above what is decoded at once), its pixels as decoded with the orientation and premultiplication carried beside them; a source
// rectangle; the refusals by name. Run by tests/t0/script_images.sh with ZINC_DETERMINISTIC=1: each entry into the script delivers what is decoded.
import { Script } from 'zinc:script';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAASwAAADICAYAAABS39xVAAACCElEQVR42u3UMREAAAjEsJeOc8AGXIYY6NB00gAXRATAsAAMCzAsAMMCMCzAsAAMC8CwAMMCMCwAwwIMC8CwAAwLMCwAwwIwLMCwAAwLwLAAwwIwLADDAgwLwLAADAswLADDAgxLBMCwAAwLMCwAwwIwLMCwAAwLwLAAwwIwLADDAgwLwLAADAswLADDAjAswLAADAvAsADDAjAsAMMCDAvAsAAMCzAsAMMCDEsEwLAADAswLADDAjAswLAADAvAsADDAjAsAMMCDAvAsAAMCzAsAMMCMCzAsAAMC8CwAMMCMCwAwwIMC8CwAAwLMCwAwwIMSwjAsAAMCzAsAMMCMCzAsAAMC8CwAMMCMCwAwwIeD2sVwA0iAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBZgWCIAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFmBYIgCGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBbw1gBxTeBZ2A+g5QAAAABJRU5ErkJggg==';
const vm = new Script({ engine: 'quickjs' });
vm.eval(`
globalThis.done = false; globalThis.out = [];
const log = (...a) => out.push(a.map(String).join(' '));
const at = (bm, x, y) => { const p = bm._pixels(); return Array.from(p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4)).join(','); };
(async () => {
  const blob = await (await fetch('data:image/png;base64,${PNG}')).blob();
  const bm = await createImageBitmap(blob);
  log('bitmap', bm instanceof ImageBitmap, bm.width + 'x' + bm.height, 'top', at(bm, 0, 0), 'bottom', at(bm, 0, 199), 'flipY', bm._pixels().flipY, 'premultiply', bm._pixels().premultiply);
  const part = await createImageBitmap(bm, 10, 90, 20, 20, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
  log('rectangle', part.width + 'x' + part.height, 'first row', at(part, 0, 0), 'last row', at(part, 0, 19), 'flipY', part._pixels().flipY, 'premultiply', part._pixels().premultiply);
  for (const [what, make] of [['no picture', () => createImageBitmap(new Blob(['no picture']))], ['a resize', () => createImageBitmap(bm, { resizeWidth: 10 })]])
    await make().then(() => log(what, 'made a bitmap'), e => log(what, 'refused:', e.name));
  bm.close();
  log('closed', bm.width, bm._pixels());
})().catch(e => log('failed', e)).finally(() => { globalThis.done = true; });
`);
for (let i = 0; i < 100 && !vm.eval("done"); i++);
console.log(vm.eval("out.join(\"\\n\")"));
