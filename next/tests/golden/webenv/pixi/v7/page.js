// PixiJS 7 as its guide writes it: an Application, its view in the document, a sprite turning on the ticker and hearing the pointer (ZN-568).
// Run with ZINC_WEB=1 and ../pointer.input by tests/t1/webenv_pixi.sh; the output is page.out. The sprite's texture is made from bytes: an
// image file is ZN-569's, and a Graphics fill in PixiJS 7 is tinted from a white 2D canvas (there since ZN-570).
import { Application, Sprite, Texture, VERSION } from 'pixi.js';
const app = new Application({ width: 320, height: 240, backgroundColor: 0x102030, antialias: false });
document.body.appendChild(app.view);
const gl = app.renderer.gl;
console.log('pixi', VERSION, 'webgl', app.renderer.context.webGLVersion, 'view', app.view.width, app.view.height, app.view.isConnected, gl instanceof WebGL2RenderingContext);
const box = new Sprite(Texture.fromBuffer(new Uint8Array([255, 0, 0, 255]), 1, 1));
box.anchor.set(0.5); box.width = 80; box.height = 80; box.position.set(160, 120);
box.eventMode = 'static';
for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointertap']) box.on(type, e => console.log('frame', frames + 1, type, 'on the sprite at', Math.round(e.global.x) + ',' + Math.round(e.global.y), 'buttons', e.buttons));
app.stage.addChild(box);
let frames = 0;
app.ticker.add(() => { box.rotation += 0.05; frames++; });
const pixel = (x, y) => { const p = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return p.join(','); };
requestAnimationFrame(function check() { if (frames === 2 || frames === 8) console.log('frame', frames, 'centre', pixel(160, 120), 'corner', pixel(2, 2), 'error', gl.getError()); requestAnimationFrame(check); });
