// PixiJS 7 with a picture from a file (ZN-569): Assets.load fetches it and makes its texture, and a Sprite shows it unscaled at 8,8. The
// picture is tests/data/images/fixture.png (32 x 24, twelve flat colours in 8 x 8 blocks), so the pixels read back inside its blocks are the
// file's own colours. Run with ZINC_WEB=1 by tests/t1/webenv_pixi.sh; the output is picture.out.
import { Application, Assets, Sprite, VERSION } from 'pixi.js';
const app = new Application({ width: 320, height: 240, backgroundColor: 0x102030, antialias: false });
document.body.appendChild(app.view);
const texture = await Assets.load('../../../../data/images/fixture.png');
const sprite = new Sprite(texture);
sprite.position.set(8, 8);
app.stage.addChild(sprite);
app.render();
const gl = app.renderer.gl, at = (x, y) => { const p = new Uint8Array(4); gl.readPixels(x, 239 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return p.join(','); };   // x, y from the top left
console.log('pixi', VERSION, 'Assets.load:', texture.width + 'x' + texture.height, 'from', texture.baseTexture.resource.source.constructor.name,
  '| its red block', at(12, 12), 'its olive block', at(36, 28), 'its white block', at(12, 20), 'its teal block', at(20, 28), 'background', at(300, 220), 'error', gl.getError());
