// PixiJS 8 as its guide writes it: an Application initialised with await, its canvas in the document, a Graphics square turning on the ticker
// and hearing the pointer (ZN-568). Run with ZINC_WEB=1 and ../pointer.input by tests/t1/webenv_pixi.sh once the WebGL binding has ZN-565's
// fixes (PixiJS 8 takes a WebGL 2 context that is also `instanceof WebGLRenderingContext` for WebGL 1, and its shaders say `#define in attribute`);
// the output is page.out.
import { Application, Graphics, VERSION } from 'pixi.js';
const app = new Application();
await app.init({ width: 320, height: 240, background: 0x102030, antialias: false, preference: 'webgl' });
document.body.appendChild(app.canvas);
const gl = app.renderer.gl;
console.log('pixi', VERSION, app.renderer.name, 'webgl', app.renderer.context.webGLVersion, 'canvas', app.canvas.width, app.canvas.height, app.canvas.isConnected);
const box = new Graphics().rect(-40, -40, 80, 80).fill(0xff0000);
box.position.set(160, 120);
box.eventMode = 'static';
for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointertap']) box.on(type, e => console.log('frame', frames + 1, type, 'on the square at', Math.round(e.global.x) + ',' + Math.round(e.global.y), 'buttons', e.buttons));
app.stage.addChild(box);
let frames = 0;
app.ticker.add(() => { box.rotation += 0.05; frames++; });
const pixel = (x, y) => { const p = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return p.join(','); };
requestAnimationFrame(function check() { if (frames === 2 || frames === 8) console.log('frame', frames, 'centre', pixel(160, 120), 'corner', pixel(2, 2), 'error', gl.getError()); requestAnimationFrame(check); });
