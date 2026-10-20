// Real three.js scenes on the QuickJS engine over zinc's WebGL 2 (ZN-204): the same scene modules run in headless Chrome (tools/three-compare) and the two frames are compared.
// A scene module exports `size` and `async function build(THREE, canvas, ctx)` returning { render() }.
export const SIZE = 128;
export function installShims(canvas) {
  canvas.style = canvas.style || {};
  canvas.addEventListener = canvas.addEventListener || (() => {});
  canvas.removeEventListener = canvas.removeEventListener || (() => {});
  if (typeof window === 'undefined') globalThis.window = globalThis;
  if (typeof self === 'undefined') globalThis.self = globalThis;
  if (typeof navigator === 'undefined') globalThis.navigator = { userAgent: 'zinc' };
  if (typeof requestAnimationFrame === 'undefined') { globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {}; }
}
export function base64ToBytes(b64) {
  const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let o = 0, buf = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) { buf = (buf << 6) | T.indexOf(clean[i]); bits += 6; if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; } }
  return out;
}
export function hex(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16); return s; }
