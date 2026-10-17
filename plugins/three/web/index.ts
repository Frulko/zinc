// three in the browser (docs/targets/web.md, "Plugins"): the real three.js (next/third_party/three, r186, unmodified) runs on a WebGL2 canvas the page makes, with no
// re-implementation: this module hands the browser's own context to three.js and shows its canvas in the Zinc surface. What differs from index.ts (the Zinc subset on zinc:3d):
//  - WebGLRenderer draws into its own canvas (renderer.domElement, a detached <canvas>) and each render() copies it into a zinc:gfx image drawn at the viewport, in paint order,
//    so a zinc:ui overlay draws over it and canvas and DOM modes alike show it (DOM mode: the image is a <canvas> element where the component sits);
//  - setAnimationLoop runs in Zinc's frame (zinc:gfx onFrame), not in a second requestAnimationFrame;
//  - `window` and `CanvasElement` are the ones of index.ts (the Zinc surface size and the pixel ratio); TextureLoader reads the app's assets first.
// Context loss is three.js's own (it handles webglcontextlost and restored on its canvas); resizes follow setSize, which programs call from zinc:gfx width() and height().
import * as T from '../../../next/third_party/three/three.module.js';
import { createImage, drawImage, width, height } from 'zinc:gfx';
import { exists, readBytes } from 'zinc:assets';

export * from '../../../next/third_party/three/three.module.js';

const TT: any = T;
const Z: any = (globalThis as any).__zincWeb;

/** Where a renderer draws, in screen (logical) pixels. */
export class CanvasElement {
  x: number = 0;
  y: number = 0;
  width: number = 0;
  height: number = 0;
  get clientWidth(): number { return this.width; }
  get clientHeight(): number { return this.height; }
}

/** The window of a three.js page: the Zinc surface size and the pixel ratio. */
export class Window {
  get innerWidth(): number { return width(); }
  get innerHeight(): number { return height(); }
  get devicePixelRatio(): number { return Math.max(1, Math.min(3, (globalThis as any).devicePixelRatio || 1)); }
  addEventListener(type: string, f: any, o?: any): void { (globalThis as any).addEventListener(type, f, o); }
  removeEventListener(type: string, f: any, o?: any): void { (globalThis as any).removeEventListener(type, f, o); }
}
export const window = new Window();

// zinc:gfx has one frame callback (the app's onFrame), so the animation loops of the renderers run at the start of that frame, in front of it: what the app draws in its
// own callback lands over the three.js picture, as on the desktop.
const looped: Set<any> = new Set();
let appFrame: any = undefined;
let hooked = false;
function hookFrame(): void {
  if (hooked) return;
  hooked = true;
  const g: any = globalThis;
  appFrame = g.__zincFrameCb;
  Object.defineProperty(g, '__zincFrameCb', {
    configurable: true,
    get: () => (dt: number): void => { for (const r of Array.from(looped)) r._tick(); if (typeof appFrame === 'function') appFrame(dt); },
    set: (f: any) => { appFrame = f; },
  });
}

/** three.js's renderer on a WebGL2 canvas, shown in the Zinc surface. */
export class WebGLRenderer extends TT.WebGLRenderer {
  _img: number = -1;
  _iw: number = 0;
  _ih: number = 0;
  _loop: ((time: number) => void) | null = null;
  _box: number[] | null = null;   // the screen box setViewport named (top left origin, logical pixels), else the whole surface
  constructor(p: any = {}) {
    const canvas = document.createElement('canvas');
    super({ ...p, canvas });
    this.setSize(width(), height(), false);
    // render and setAnimationLoop are instance functions of three's renderer (set by its constructor), so they are replaced here, not overridden
    const draw = this.render, baseViewport = this.setViewport, baseSize = this.setSize;
    // as on the desktop, setViewport(x, y, w, h) is the box of the screen the picture goes to (top left origin): the canvas takes its size and the picture is drawn there
    let sizing = false;   // three's setSize calls setViewport itself
    const resize = (w: number, h: number): void => { sizing = true; try { baseSize.call(this, w, h, false); } finally { sizing = false; } };
    this.setViewport = (x: any, y?: any, w?: any, h?: any): void => {
      if (typeof x !== 'number' || sizing) { baseViewport.call(this, x, y, w, h); return; }
      if (this._box === null || this._box[2] !== w || this._box[3] !== h) resize(w, h);
      this._box = [x, y, w, h];
      baseViewport.call(this, 0, 0, w, h);
    };
    this.setSize = (w: number, h: number, updateStyle?: boolean): void => { this._box = null; resize(w, h); };
    this.render = (scene: any, camera: any): void => { draw.call(this, scene, camera); this._present(); };   // in the same task, so the drawing buffer is still valid
    this.setAnimationLoop = (cb: ((time: number) => void) | null): void => {
      this._loop = cb;
      hookFrame();
      if (cb === null) looped.delete(this); else looped.add(this);
    };
  }
  /** Draws the canvas of three.js into the Zinc surface, in paint order. */
  _present(): void {
    const cv: HTMLCanvasElement = this.domElement;
    if (cv.width === 0 || cv.height === 0) return;
    if (this._img < 0 || this._iw !== cv.width || this._ih !== cv.height) {
      this._img = createImage(cv.width, cv.height);   // a new image per size
      this._iw = cv.width; this._ih = cv.height;
      Z.images.resize(this._img, cv.width, cv.height);
    }
    const c = Z.images.canvas(this._img);
    if (c === null) return;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(cv, 0, 0);
    Z.images.touch(this._img);
    const sz = this.getSize(new T.Vector2()), b = this._box;
    drawImage(this._img, b ? b[0] : 0, b ? b[1] : 0, b ? b[2] : sz.x, b ? b[3] : sz.y, 255);
  }
  _tick(): void { if (this._loop !== null) this._loop(performance.now()); }
}

/** A texture of a zinc:canvas Canvas (index.ts takes its gfx image id): the browser canvas behind that image. */
export class CanvasTexture extends TT.CanvasTexture {
  constructor(image: any, ...rest: any[]) { super(typeof image === 'number' ? Z.images.canvas(image) : image, ...rest);
    this.wrapS = this.wrapT = T.RepeatWrapping;   // zinc:3d's textures repeat; three's default clamps
    this.colorSpace = T.SRGBColorSpace;
  }
}

/** Images from the app's assets first (a Zinc app has no URL for them), else the page's own loader. */
export class TextureLoader extends TT.TextureLoader {
  load(url: string, onLoad?: any, onProgress?: any, onError?: any): any {
    const name = (this as any).path + url;
    if (!exists(name)) return super.load(url, onLoad, onProgress, onError);
    const tex = new T.Texture();
    tex.name = url;
    const img = new Image();
    img.onload = () => { tex.image = img; tex.needsUpdate = true; if (onLoad) onLoad(tex); };
    img.onerror = (e: any) => { if (onError) onError(e); };
    img.src = URL.createObjectURL(new Blob([new Uint8Array(readBytes(name))]));
    return tex;
  }
}
