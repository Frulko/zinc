// zinc:lottie in the browser: the native side of plugins/lottie/native/lottie.spec.ts over lottie-web (MIT, vendored in web/vendor: docs/targets/web.md, "Lottie"). index.ts (load, Player,
// the <Lottie/> node) runs unchanged. The size, frame count, frame rate and layers come from the document itself, so they answer at once; the player library is loaded by the page the first
// time an animation is drawn (so an app that imports zinc:lottie but never draws one downloads nothing): the SVG renderer in the semantic DOM render (the animation is an <svg> in the box of
// its node, which the browser scales and paints), the canvas renderer on a canvas render. Player.frame decides what is shown: each draw puts lottie-web on that frame.
// Not here: Player.cache (render to an image: the atlas stays blank, draw without cacheBg), file paths outside the assets (open() answers -1), expressions (the light builds leave them out).
const Z = globalThis.__zincWeb;
const anims = [];   // slots, as the native side allocates them (the first free one of 64)
let lib = null, loading = null, failed = false;

function ensure() {
  if (lib || loading || failed) return;
  const dom = Z.config.render === 'dom';
  loading = Z.loadScript(dom ? 'lottie-svg' : 'lottie-canvas').then(() => { lib = globalThis.lottie; loading = null; if (Z.repaint) Z.repaint(); }, (e) => { failed = true; console.error('zinc:lottie:', e && e.message); });
}

function parse(json) {
  let j;
  try { j = JSON.parse(json); } catch { return -1; }
  if (!j || typeof j !== 'object' || Array.isArray(j) || !Array.isArray(j.layers)) return -1;
  const num = (v, d) => (typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : d);
  let slot = 0;
  while (slot < anims.length && anims[slot]) slot++;
  if (slot >= 64) return -1;
  anims[slot] = { w: num(j.w, 0), h: num(j.h, 0), ip: num(j.ip, 0), op: num(j.op, 0), fr: num(j.fr, 30), layers: j.layers.length, data: j, el: null, inst: null, frame: NaN };
  return slot;
}

function make(A) {
  const dom = Z.config.render === 'dom';
  const el = document.createElement('div');
  el.className = 'zn-media zn-lottie';
  if (!dom) { el.style.cssText = `position:absolute;left:-10000px;top:0;width:${Math.max(1, A.w)}px;height:${Math.max(1, A.h)}px`; document.body.appendChild(el); }
  A.el = el;
  A.inst = lib.loadAnimation({ container: el, renderer: dom ? 'svg' : 'canvas', loop: false, autoplay: false, animationData: JSON.parse(JSON.stringify(A.data)), rendererSettings: { preserveAspectRatio: 'xMidYMid meet', clearCanvas: true, progressiveLoad: false } });
}

Z.registerNative('Lottie', {
  parse,
  open() { return -1; },
  width: (a) => (anims[a] ? anims[a].w : 0),
  height: (a) => (anims[a] ? anims[a].h : 0),
  frames: (a) => (anims[a] ? anims[a].op - anims[a].ip : 0),
  fps: (a) => (anims[a] ? anims[a].fr : 0),
  layers: (a) => (anims[a] ? anims[a].layers : 0),
  draw(a, frame, x, y, w, h, alpha) {
    const A = anims[a];
    if (!A) return;
    ensure();
    if (!lib) return;   // the library is on its way: the page repaints when it arrives
    if (!A.inst) make(A);
    if (A.frame !== frame) { A.frame = frame; A.inst.goToAndStop(frame, true); }
    const shown = Z.config.render === 'dom' ? A.el : A.el.querySelector('canvas');
    if (!shown) return;
    A.el.style.opacity = alpha < 255 ? String(alpha / 255) : '';
    Z.paint.element(shown, x, y, w, h, { fit: 'contain' });
  },
  free(a) {
    const A = anims[a];
    if (!A) return;
    if (A.inst) A.inst.destroy();
    if (A.el && A.el.parentNode) A.el.parentNode.removeChild(A.el);
    anims[a] = null;
  },
}, []);
