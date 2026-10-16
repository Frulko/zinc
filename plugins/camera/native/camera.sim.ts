// zinc:camera without native code (ZINC_NATIVE=sim, --target sim, a machine that cannot build the plugin): the fake camera of
// camera.host.cpp alone. Snapshots have the same pixels as the native fake camera (pattern() below is its pattern(), integers only);
// the runtime image stays black, since drawing the pattern in Zinc each frame would cost more than the frame.
import { createImage, destroyImage } from 'zinc:gfx';
import * as sys from 'zinc:sys';

const FAKE = 'zinc:fake-camera\u001fZinc Fake Camera\u001funknown\u001e';
const BARS: i32[] = [0xFFFFFF, 0xFFFF00, 0x00FFFF, 0x00FF00, 0xFF00FF, 0xFF0000, 0x0000FF, 0x000000];

class Cam {
  w: i32; h: i32; fps: i32; index: i32 = -1; img: i32;
  mirror: boolean = false; brightness: number = 0; contrast: number = 1;
  constructor(w: i32, h: i32, fps: i32) { this.w = w; this.h = h; this.fps = fps; this.img = createImage(w, h); }
}
const cams: (Cam | null)[] = [];
let err = '';
const noFake = (): boolean => sys.env('ZINC_FAKE_CAMERA') === '0';
const at = (h: i32): Cam | null => h >= 0 && h < cams.length ? cams[h] : null;
const clampSize = (v: i32): i32 => v < 16 ? 16 : v > 4096 ? 4096 : v;

function pattern(x: i32, y: i32, w: i32, h: i32, idx: i32): i32 {
  const band = Math.trunc(h / 12), split = Math.trunc(h * 2 / 3), s = Math.trunc(h / 6) > 2 ? Math.trunc(h / 6) : 2;
  const sx = (idx * 4) % (w - s > 1 ? w - s : 1), sy = split + Math.trunc((h - split - s) / 2);
  if (x >= sx && x < sx + s && y >= sy && y < sy + s) return 0xFF8000;
  if (y < band) return ((idx >> (15 - Math.trunc(x * 16 / w))) & 1) !== 0 ? 0xFFFFFF : 0x202020;
  if (y < split) return BARS[Math.trunc(x * 8 / w)];
  return (w > 1 ? Math.trunc(x * 255 / (w - 1)) : 0) * 0x010101;
}

export default {
  permission: (_ask: boolean): i32 => 1,
  devices: (): string => { err = ''; return noFake() ? '' : FAKE; },
  error: (): string => err,
  open: (id: string, w: i32, h: i32, fps: i32): i32 => {
    err = '';
    if (noFake() || (id !== '' && id !== 'zinc:fake-camera')) { err = noFake() ? 'camera: no camera on this machine' : `camera: no camera '${id}' (only the fake camera 'zinc:fake-camera' without native code)`; return -1; }
    if (w <= 0 || h <= 0) { w = 640; h = 480; }
    cams.push(new Cam(clampSize(w), clampSize(h), fps <= 0 ? 30 : fps));
    return cams.length - 1;
  },
  format: (h: i32): number[] => { const c = at(h); return c === null ? [0, 0, 0, 0] : [c.w, c.h, c.fps, 1000 / c.fps]; },
  frame: (h: i32): i32 => { const c = at(h); if (c === null) return -1; c.index++; return c.index; },
  image: (h: i32): i32 => { const c = at(h); return c === null ? -1 : c.img; },
  setOption: (h: i32, name: string, v: number): void => {
    const c = at(h);
    if (c === null) return;
    if (name === 'mirror') c.mirror = v !== 0;
    else if (name === 'brightness') c.brightness = v < -1 ? -1 : v > 1 ? 1 : v;
    else if (name === 'contrast') c.contrast = v < 0 ? 0 : v > 2 ? 2 : v;
  },
  snapshot: (h: i32): u8[] => {
    const c = at(h);
    if (c === null) return [];
    const lut: u8[] = [];
    for (let v = 0; v < 256; v++) { const r = Math.floor((v - 128) * c.contrast + 128 + c.brightness * 255 + 0.5); lut.push(r < 0 ? 0 : r > 255 ? 255 : r); }
    const out: u8[] = [];
    if (c.index < 0) { for (let i = 0; i < c.w * c.h; i++) { out.push(0); out.push(0); out.push(0); out.push(255); } return out; }   // black before the first frame
    for (let y = 0; y < c.h; y++)
      for (let x = 0; x < c.w; x++) {
        const p = pattern(c.mirror ? c.w - 1 - x : x, y, c.w, c.h, c.index);
        out.push(lut[(p >> 16) & 255]); out.push(lut[(p >> 8) & 255]); out.push(lut[p & 255]); out.push(255);
      }
    return out;
  },
  close: (h: i32): void => { const c = at(h); if (c !== null) { destroyImage(c.img); cams[h] = null; } },
};
