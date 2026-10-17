// zinc:map in the browser (docs/targets/web.md, "Plugins"): the engine of native/map.spec.ts ("MapEngine") on MapLibre GL JS (next/third_party/maplibre, BSD-3, pinned), which reads the very
// style language the C++ engine implements a subset of. the export publishes the library byte for byte (plugin.json web.scripts: a minifier breaks its inline worker) and the engine loads it as a classic script the first time a style is set (Z.loadScript), so it is globalThis.maplibregl; web/index.ts takes over tile loading (the browser's fetch, not zinc:net).
// How the spec maps: setStyle takes the style JSON (the layers; the source and the glyph server are added here); nextRequest / provide are the tile queue behind an `zinc://z/x/y` protocol
// that MapLibre's worker asks and the program answers with the bytes of the .pbf (a binary string); draw(...) jumps the camera and copies the canvas MapLibre rendered (the previous
// frame: it paints on its own animation frame) into a gfx image drawn in the viewport, so panning and the paint order work as on a desktop, in canvas and DOM mode.
// Labels need glyphs: MapLibre fetches them from `glyphs` (the style's own, else demotiles.maplibre.org); offline they are left out and the rest of the map is drawn.
const Z = globalThis.__zincWeb, G = globalThis;
const GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
let styleJson = '', minZ = 0, maxZ = 14, map = null, box = null, cv = null, img = -1, sizeKey = '', registered = false, libReady = false, libError = null;
const wanted = [], waiting = new Map();
function buildStyle() {
  const s = JSON.parse(styleJson);
  s.sources = Object.assign({ zinc: { type: 'vector', tiles: ['zinc://{z}/{x}/{y}'], minzoom: minZ, maxzoom: maxZ, tileSize: 512 } }, s.sources || {});
  if (!s.glyphs) s.glyphs = GLYPHS;
  for (const l of s.layers) if (l['source-layer'] && !l.source) l.source = 'zinc';
  return s;
}
function protocol() {
  if (registered) return;
  registered = true;
  G.maplibregl.addProtocol('zinc', (params) => new Promise((ok, bad) => {
    const key = params.url.slice('zinc://'.length);
    if (!waiting.has(key)) { waiting.set(key, []); wanted.push(key); }
    waiting.get(key).push({ ok, bad });
  }));
}
function ensure(w, h) {
  if (!map) {
    protocol();
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none;width:' + w + 'px;height:' + h + 'px';
    document.body.appendChild(box);
    map = new G.maplibregl.Map({ container: box, style: buildStyle(), interactive: false, attributionControl: false, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true, antialias: false }, pixelRatio: Math.min(2, G.devicePixelRatio || 1), center: [0, 0], zoom: 1 });
    cv = map.getCanvas();
    G.__zincMap = map;   // for the console and the tests
    // the first frames draw before the style has loaded: ask for the sources to be looked at again when it has (MapLibre marks them dirty only when the camera moves)
    const nudge = () => { if (typeof map._update === 'function') map._update(true); else map.jumpTo({ zoom: map.getZoom() + 1e-7 }); };
    map.on('styledata', nudge); map.on('sourcedata', (e) => { if (e.sourceDataType === 'metadata') nudge(); });
    map.on('error', (e) => { const m = e && e.error && e.error.message; if (m && !/zinc|no tile|glyph|font|Failed to fetch/i.test(m)) console.warn('zinc:map: ' + m); });
  }
  const k = w + 'x' + h;
  if (k !== sizeKey) { sizeKey = k; box.style.width = w + 'px'; box.style.height = h + 'px'; map.resize(); }
}
const xToLon = (x) => x * 360 - 180;
const yToLat = (y) => { const n = Math.PI - 2 * Math.PI * y; return (180 / Math.PI) * Math.atan2(0.5 * (Math.exp(n) - Math.exp(-n)), 1); };
Z.registerNative('MapEngine', {
  setStyle(json) {
    try { JSON.parse(json); } catch (e) { return 'style: ' + e.message; }
    styleJson = json;
    if (!libReady && libError === null) Z.loadScript('maplibre').then(() => { libReady = true; }, (e) => { libError = e; });
    if (map) map.setStyle(buildStyle());
    return '';
  },
  setSourceZoom(a, b) { minZ = a; maxZ = b; if (map) map.setStyle(buildStyle()); },
  draw(mx, my, zoom, x, y, w, h, fast) {
    if (libError) throw new Z.ZnUnsupported('zinc:map', String(libError.message || libError));
    if (!libReady || !G.maplibregl) return 1;   // the library is on its way: nothing to draw yet
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    ensure(w, h);
    map.jumpTo({ center: [xToLon(mx), yToLat(my)], zoom });
    map.triggerRepaint();
    if (cv.width > 0 && cv.height > 0) {
      if (img < 0) img = G.__host_gfxCreateImage(cv.width, cv.height);
      const c = Z.images.canvas(img);
      if (c) {
        if (c.width !== cv.width || c.height !== cv.height) Z.images.resize(img, cv.width, cv.height);
        const g = c.getContext('2d');
        g.drawImage(cv, 0, 0);
        Z.images.touch(img);
        G.__host_gfxDrawImage(img, x, y, w, h, 255, 0);
      }
    }
    return map.loaded() ? 0 : 1;
  },
  nextRequest() { return wanted.length ? wanted.shift() : ''; },
  provide(key, data) {
    const list = waiting.get(key);
    if (!list) return;
    waiting.delete(key);
    if (data === '') { const e = new Error('no tile ' + key); e.status = 404; for (const w of list) w.bad(e); return; }
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 255;
    for (const w of list) w.ok({ data: bytes.buffer.slice(0) });
  },
  stats() { return 'tiles=0 renderMs=0 labels=0'; },
}, ['webgl2']);
