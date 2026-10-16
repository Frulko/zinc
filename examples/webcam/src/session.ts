// Everything that talks to the camera and the disk, outside React: the permission, the camera list, the open camera with its format and
// adjustments, the measured frame rate, and the photos (PNG files in a Photos folder beside the app's storage). The screen (App.tsx)
// reads these fields and re-renders when changed() calls it back; the preview canvas reads them every frame without a re-render.
import { devices, permissionStatus, requestPermission, Camera, CameraDevice, PermissionStatus } from 'zinc:camera';
import { imageFromBytes, destroyImage, frame } from 'zinc:gfx';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';

export const FAKE_ID = 'zinc:fake-camera';
export const SIZES: number[][] = [[320, 240], [640, 480], [1280, 720]];
export const RATES: number[] = [15, 30];
const KEEP = 12;   // the photos the strip shows; older ones stay on disk

// undetermined: the "Allow the camera" screen; asking: the system's question is up; denied; none: no camera at all; opening; live; failed
export type Stage = 'undetermined' | 'asking' | 'denied' | 'none' | 'opening' | 'live' | 'failed';

export class Photo {
  path: string; name: string; image: i32;
  constructor(path: string, name: string, image: i32) { this.path = path; this.name = name; this.image = image; }
}

export class Session {
  stage: Stage = 'opening';
  why: string = '';
  list: CameraDevice[] = [];
  which: number = 0;
  cam: Camera | null = null;
  size: number = 1;           // index in SIZES
  rate: number = 1;           // index in RATES
  mirror: boolean = false;
  brightness: number = 0;     // -1..1
  contrast: number = 1;       // 0..2
  cover: boolean = false;     // the preview fills the box (cropped) instead of fitting in it
  fps: number = 0;            // frames counted over the last second
  photos: Photo[] = [];
  viewing: number = -1;       // the photo open in the viewer, -1 none
  shotFrame: number = -100;   // the frame (gfx.frame()) of the last shot: the preview flashes white for a few frames after it
  readonly dir: string;
  private counted: number = 0;
  private listeners: (() => void)[] = [];

  constructor() {
    this.dir = photosDir();
    setInterval((): void => { this.fps = this.counted; this.counted = 0; if (this.stage === 'live') this.log(`fps ${this.fps}`); }, 1000);
  }
  onChange(f: () => void): void { this.listeners.push(f); }
  changed(): void { for (const f of this.listeners) f(); }
  log(s: string): void { if (env('WEBCAM_LOG') === '1') console.log(s); }

  get device(): CameraDevice | null { return this.which < this.list.length ? this.list[this.which] : null; }
  get simulated(): boolean { const d = this.device; return d !== null && d.id === FAKE_ID; }

  /** First look: never asks. WEBCAM_DEMO_PERMISSION=undetermined|denied|granted stands in for the answer (tests and screenshots only). */
  start(): void {
    this.loadPhotos();
    const forced = env('WEBCAM_DEMO_PERMISSION');
    const p: PermissionStatus = forced === 'undetermined' || forced === 'denied' || forced === 'granted' ? forced : permissionStatus();
    this.log(`permission ${p}`);
    if (p === 'granted') this.listCameras();
    else { this.stage = p; this.changed(); }
  }
  /** The "Allow camera" button: macOS shows its question once; elsewhere this is granted at once. */
  allow(): void {
    this.stage = 'asking'; this.changed();
    requestPermission().then((p: PermissionStatus): void => {
      this.log(`asked: ${p}`);
      if (p === 'granted') this.listCameras(); else { this.stage = p; this.changed(); }
    });
  }
  /** The denied screen's Retry: reads the real status again (the person may have turned it on in System Settings). */
  retry(): void {
    const p = permissionStatus();
    this.log(`retry: ${p}`);
    if (p === 'granted') this.listCameras(); else { this.stage = p; this.changed(); }
  }

  listCameras(): void {
    devices().then((all: CameraDevice[]): void => {
      this.list = all;
      this.log(`cameras: ${all.map((d: CameraDevice) => `${d.name} (${d.position})`).join(', ')}`);
      if (all.length === 0) { this.stage = 'none'; this.changed(); return; }
      this.open(Math.min(this.which, all.length - 1));
    }).catch((e: Error): void => this.fail(e.message));
  }
  fail(why: string): void { this.why = why; this.stage = 'failed'; this.log(`failed: ${why}`); this.changed(); }

  /** Opens camera i at the chosen size and rate (closing the one before), with the adjustments carried over. */
  open(i: number): void {
    this.close();
    this.which = i;
    this.stage = 'opening'; this.changed();
    const d = this.list[i];
    Camera.open(d.id, { width: SIZES[this.size][0], height: SIZES[this.size][1], fps: RATES[this.rate] }).then((cam: Camera): void => {
      this.cam = cam;
      this.counted = 0; this.fps = 0;
      cam.onFrame((index: number): void => { this.counted++; });
      this.apply();
      this.stage = 'live';
      this.log(`open ${d.name} ${cam.width}x${cam.height} at ${cam.fps} fps`);
      this.changed();
    }).catch((e: Error): void => this.fail(e.message));
  }
  close(): void { const c = this.cam; if (c !== null) c.close(); this.cam = null; }
  /** C: the next camera (the same one again when there is only one: a fresh start). */
  switchCamera(): void { if (this.list.length > 0) this.open((this.which + 1) % this.list.length); }
  setSize(i: number): void { if (i !== this.size) { this.size = i; this.open(this.which); } }
  setRate(i: number): void { if (i !== this.rate) { this.rate = i; this.open(this.which); } }

  private apply(): void {
    const c = this.cam;
    if (c === null) return;
    c.setOption('mirror', this.mirror ? 1 : 0);
    c.setOption('brightness', this.brightness);
    c.setOption('contrast', this.contrast);
  }
  toggleMirror(): void { this.mirror = !this.mirror; this.apply(); this.log(`mirror ${this.mirror ? 'on' : 'off'}`); this.changed(); }
  setBrightness(v: number): void { this.brightness = clamp(Math.round(v * 10) / 10, -1, 1); this.apply(); this.log(`brightness ${this.brightness}`); this.changed(); }
  setContrast(v: number): void { this.contrast = clamp(Math.round(v * 10) / 10, 0, 2); this.apply(); this.log(`contrast ${this.contrast}`); this.changed(); }
  resetAdjust(): void { this.mirror = false; this.brightness = 0; this.contrast = 1; this.apply(); this.log('adjustments reset'); this.changed(); }
  toggleFit(): void { this.cover = !this.cover; this.log(`fit ${this.cover ? 'cover' : 'contain'}`); this.changed(); }

  /** The shutter: the frame on screen (adjustments applied) as a PNG in the Photos folder, named by the time it was taken. */
  takePhoto(): void {
    const c = this.cam;
    if (c === null || this.stage !== 'live') return;
    const png = c.toPng();
    if (png.length === 0) { this.log('photo: no encoder here'); return; }
    let name = `photo-${stamp()}`, n = 2;
    while (fs.exists(`${this.dir}/${name}.png`)) name = `photo-${stamp()}-${n++}`;
    try {
      fs.mkdir(this.dir, true);
      fs.writeBytes(`${this.dir}/${name}.png`, png);
    } catch (e) { this.log(`photo not saved: ${(e as Error).message}`); return; }
    this.photos.unshift(new Photo(`${this.dir}/${name}.png`, name, imageFromBytes(png)));
    this.shotFrame = frame();
    while (this.photos.length > KEEP) destroyImage((this.photos.pop() as Photo).image);
    this.log(`photo ${name}.png ${c.width}x${c.height} at frame ${c.frameIndex}`);
    this.changed();
  }
  view(i: number): void { this.viewing = i; this.log(i < 0 ? 'viewer closed' : `viewer ${this.photos[i].name}`); this.changed(); }
  browse(step: number): void { if (this.viewing >= 0 && this.photos.length > 0) this.view((this.viewing + step + this.photos.length) % this.photos.length); }
  deletePhoto(i: number): void {
    const p = this.photos[i];
    fs.remove(p.path);
    destroyImage(p.image);
    this.photos.splice(i, 1);
    this.log(`deleted ${p.name}.png`);
    this.viewing = this.photos.length === 0 ? -1 : Math.min(i, this.photos.length - 1);
    this.changed();
  }
  private loadPhotos(): void {
    if (!fs.exists(this.dir)) return;
    const names = fs.list(this.dir).filter((f: string) => f.startsWith('photo-') && f.endsWith('.png')).reverse().slice(0, KEEP);
    for (const f of names) {
      try { this.photos.push(new Photo(`${this.dir}/${f}`, f.slice(0, f.length - 4), imageFromBytes(fs.readBytes(`${this.dir}/${f}`)))); } catch (e) { /* unreadable: skipped */ }
    }
  }
}

const clamp = (v: number, lo: number, hi: number): number => v < lo ? lo : v > hi ? hi : v;
const two = (v: number): string => v < 10 ? `0${v}` : `${v}`;
/** 2026-10-16-153012: sorts by time, no characters a file system refuses. */
function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}
/** <the folder of the app's storage>/webcam/Photos: beside ZINC_STORAGE when set, else in ZINC_HOME (~/.zinc). */
function photosDir(): string {
  const store = env('ZINC_STORAGE');
  const base = store !== '' ? (store.lastIndexOf('/') > 0 ? store.slice(0, store.lastIndexOf('/')) : '.')
    : env('ZINC_HOME') !== '' ? env('ZINC_HOME') : `${env('HOME')}/.zinc`;
  return `${base}/webcam/Photos`;
}

export const session = new Session();
