// zinc:gphoto2 on the sim target: the fake camera of gphoto2.host.cpp (same widgets, same answers).
// The sim is headless, so the live view is a blank runtime image of the fitted 1024x683 frame size.
import { createImage, destroyImage } from 'zinc:gfx';

const FS = '\u001f', RS = '\u001e';
const W = [
  ['/main/imgsettings/iso', 'ISO Speed', 'radio', 'Auto|100|200|400|800|1600|3200|6400', 0],
  ['/main/capturesettings/aperture', 'Aperture', 'radio', '2.8|3.5|4|4.5|5.6|6.3|8|11|16', 4],
  ['/main/capturesettings/shutterspeed', 'Shutter Speed', 'radio', '1/4000|1/2000|1/1000|1/500|1/250|1/125|1/60|1/30|1/15|1/8', 5],
  ['/main/imgsettings/whitebalance', 'WhiteBalance', 'radio', 'Auto|Daylight|Shadow|Cloudy|Tungsten|Fluorescent', 0],
  ['/main/capturesettings/focusmode', 'Focus Mode', 'radio', 'One Shot|AI Focus|AI Servo|Manual', 0],
  ['/main/capturesettings/exposurecompensation', 'Exposure Compensation', 'radio', '-2|-1.7|-1.3|-1|-0.7|-0.3|0|0.3|0.7|1|1.3|1.7|2', 6],
  ['/main/imgsettings/imageformat', 'Image Format', 'radio', 'Large Fine JPEG|Medium Fine JPEG|RAW|RAW + Large Fine JPEG', 0],
  ['/main/settings/capturetarget', 'Capture Target', 'radio', 'Internal RAM|Memory card', 1],
  ['/main/status/cameramodel', 'Camera Model', 'text', 'Zinc Fake Camera', 0],
  ['/main/status/batterylevel', 'Battery Level', 'text', '87%', 0],
] as [string, string, string, string, number][];
const find = (name: string) => W.find(w => w[0] === name || w[0].endsWith('/' + name));
const value = (w: [string, string, string, string, number]) => w[3].split('|')[w[4]];

let open = false, live = false, shots = 0, img = -1, iw = 0, ih = 0;
let cb: ((kind: string, data: string) => void) | null = null;
const fail = (m: string) => Promise.reject(new Error('gphoto2: ' + m));
const shot = () => `/store_00020001/DCIM/100ZINC/IMG_${String(++shots).padStart(4, '0')}.JPG`;
const local = (dir: string, p: string) => dir + '/' + p.slice(p.lastIndexOf('/') + 1);

export default {
  detect: () => Promise.resolve('Zinc Fake Camera' + FS + 'usb:fake'),
  open: (_m: string, _p: string) => { open = true; return Promise.resolve('Zinc Fake Camera'); },
  close: () => { open = false; live = false; return Promise.resolve(''); },
  summary: () => open ? Promise.resolve('Manufacturer: Zinc\nModel: Zinc Fake Camera\nVersion: 1.0\nSerial Number: 0000000001\nVendor Extension: generated frames (ZINC_FAKE_CAMERA)\n') : fail('no camera open'),
  config: () => open ? Promise.resolve(W.map(w => [w[0], w[1], w[2], w[2] === 'text' ? '1' : '0', value(w), '0', '0', '0', ...(w[2] === 'text' ? [] : w[3].split('|'))].join(FS)).join(RS)) : fail('no camera open'),
  get: (name: string) => { const w = find(name); return !open ? fail('no camera open') : w ? Promise.resolve(value(w)) : fail('unknown widget ' + name); },
  set: (name: string, v: string) => {
    const w = find(name);
    if (!open) return fail('no camera open');
    if (!w) return fail('unknown widget ' + name);
    if (w[2] === 'text') return fail('read-only widget');
    const i = w[3].split('|').indexOf(v);
    if (i < 0) return fail('bad value ' + v);
    w[4] = i;
    return Promise.resolve('');
  },
  capture: (dir: string) => open ? Promise.resolve(dir ? local(dir, shot()) : shot()) : fail('no camera open'),
  trigger: () => { if (!open) return fail('no camera open'); cb?.('file', shot()); return Promise.resolve(''); },
  download: (p: string, dir: string) => open ? Promise.resolve(local(dir, p)) : fail('no camera open'),
  thumbnail: (_p: string, w: number, h: number) => Promise.resolve(String(createImage(Math.min(w, Math.floor(h * 1.5)), Math.min(h, Math.floor(w / 1.5))))),
  onEvent: (f: (kind: string, data: string) => void) => { cb = f; },
  liveView: (on: boolean) => { live = on && open; },
  setViewSize: (w: number, h: number) => {
    const wide = 1024 * h > 683 * w;  // same fit as decode_fit
    const tw = wide ? w : Math.trunc(1024 * h / 683), th = wide ? Math.trunc(683 * w / 1024) : h;
    if (!live || (tw === iw && th === ih)) return;
    if (img >= 0) destroyImage(img);
    img = createImage(tw, th); iw = tw; ih = th;
  },
  liveImage: () => img,
  cameraFps: () => live ? 30 : 0,
  shownFps: () => live ? 30 : 0,
  decodeMs: () => 0,
};
