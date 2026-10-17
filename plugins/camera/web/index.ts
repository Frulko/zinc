// zinc:camera in the browser (docs/targets/web.md, "Plugins"): the same API as index.ts, over getUserMedia and a <video> element. The frames are drawn
// into a runtime image of zinc:gfx (rVFC when the browser has it), so <Image source={cam.image}> and gfx.drawImage show a live camera as on a desktop.
// Every MediaStreamTrack of video also gets `.camera` (zinc:webrtc's RemoteVideo: the peer's picture is read the same way as a local one).
// Not here: scanQr (no synchronous decoder in a page; BarcodeDetector is asynchronous and Chromium only) answers ''.
import { createImage, destroyImage } from 'zinc:gfx';

const g: any = globalThis;
const Z = g.__zincWeb;

export type Uint8Array = number[];
export type CameraPosition = 'front' | 'back' | 'external' | 'unknown';
export type PermissionStatus = 'granted' | 'denied' | 'undetermined';
export interface CameraDevice { id: string; name: string; position: CameraPosition }
export interface CameraOptions { width?: number; height?: number; fps?: number }

let state: PermissionStatus = 'undetermined';
function need(): void { Z.require('getUserMedia', 'a camera needs getUserMedia, which browsers offer on https pages and on localhost only'); }
const guess = (label: string): CameraPosition => /front|user|facetime/i.test(label) ? 'front' : /back|rear|environment/i.test(label) ? 'back' : 'external';

/** Where access stands now, without asking (the browser keeps the answer per site). */
export function permissionStatus(): PermissionStatus { return state; }
/** Asks for the camera: the browser shows its own question once per site. */
export async function requestPermission(): Promise<PermissionStatus> {
  need();
  try {
    const s: MediaStream = await g.navigator.mediaDevices.getUserMedia({ video: true });
    s.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    state = 'granted';
  } catch (e) { state = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : state; if (state !== 'denied') throw e; }
  return state;
}
/** The cameras of the machine (labels show once access is granted). */
export async function devices(): Promise<CameraDevice[]> {
  need();
  const all: MediaDeviceInfo[] = await g.navigator.mediaDevices.enumerateDevices();
  return all.filter((d: MediaDeviceInfo) => d.kind === 'videoinput').map((d: MediaDeviceInfo, i: number) => ({ id: d.deviceId, name: d.label || `Camera ${i + 1}`, position: guess(d.label) }));
}

function videoFor(stream: MediaStream): HTMLVideoElement {
  const v: HTMLVideoElement = document.createElement('video');
  v.muted = true; v.playsInline = true; v.autoplay = true;
  v.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none';
  document.body.appendChild(v);
  v.srcObject = stream;
  v.play().catch(() => {});
  return v;
}

export class Camera {
  readonly id: string;
  private video: HTMLVideoElement;
  private stream: MediaStream | null;
  private own: boolean;
  private img: number = -1;
  private w: number = 0;
  private h: number = 0;
  private last: number = -1;
  private cbs: ((index: number) => void)[] = [];
  private opts: any = { mirror: 0, brightness: 0, contrast: 1 };
  private stopped: boolean = false;
  private rate: number;
  private pump: number = 0;

  /** Opens a camera (an id of devices(), '' for the first one). Defaults: 640x480 at 30 fps. Rejects with the reason (no such camera, access refused). */
  static async open(id: string, o: CameraOptions = {}): Promise<Camera> {
    need();
    const video: any = { width: o.width || 640, height: o.height || 480, frameRate: o.fps || 30 };
    if (id !== '') video.deviceId = { exact: id };
    let s: MediaStream;
    try { s = await g.navigator.mediaDevices.getUserMedia({ video }); } catch (e) { state = e && e.name === 'NotAllowedError' ? 'denied' : state; throw new Error(e && e.message ? e.message : String(e)); }
    state = 'granted';
    return new Camera(s, id || s.getVideoTracks()[0].getSettings().deviceId || '', true, o.fps || 30);
  }
  /** A camera over a video track the page already has: a local getUserMedia track, or the picture of a peer (RemoteVideo). */
  static ofTrack(track: MediaStreamTrack): Camera { return new Camera(new MediaStream([track]), track.getSettings().deviceId || '', false, 30); }

  private constructor(stream: MediaStream, id: string, own: boolean, fps: number) {
    this.id = id; this.stream = stream; this.own = own; this.rate = fps;
    this.video = videoFor(stream);
    const tick = (): void => this.frame();
    const v: any = this.video;
    if (typeof v.requestVideoFrameCallback === 'function') {
      const loop = (): void => { if (this.stopped) return; this.frame(); v.requestVideoFrameCallback(loop); };
      v.requestVideoFrameCallback(loop);
    } else this.pump = g.setInterval(tick, Math.max(8, 1000 / fps / 2));
  }
  private frame(): void {
    const v = this.video;
    if (this.stopped || v.videoWidth === 0 || v.readyState < 2) return;
    if (v.videoWidth !== this.w || v.videoHeight !== this.h) {
      if (this.img >= 0) destroyImage(this.img);
      this.w = v.videoWidth; this.h = v.videoHeight;
      this.img = createImage(this.w, this.h);
    }
    const cv: HTMLCanvasElement | null = Z.images.canvas(this.img);
    if (cv === null) return;
    const c = cv.getContext('2d')!;
    c.save();
    c.filter = this.opts.brightness !== 0 || this.opts.contrast !== 1 ? `brightness(${1 + this.opts.brightness}) contrast(${this.opts.contrast})` : 'none';
    if (this.opts.mirror) { c.translate(this.w, 0); c.scale(-1, 1); }
    c.drawImage(v, 0, 0, this.w, this.h);
    c.restore();
    Z.images.touch(this.img);
    this.last++;
    for (const cb of this.cbs.slice()) cb(this.last);
  }
  get width(): number { return this.w || this.video.videoWidth; }
  get height(): number { return this.h || this.video.videoHeight; }
  get fps(): number { return this.rate; }
  /** The runtime image with the newest frame (-1 before the first one and once closed). */
  get image(): number { return this.stopped ? -1 : this.img; }
  get frameIndex(): number { return this.last; }
  get isOpen(): boolean { return !this.stopped; }
  onFrame(cb: (index: number) => void): void { this.cbs.push(cb); }
  setOption(name: 'mirror' | 'brightness' | 'contrast', value: number): void { this.opts[name] = value; }
  snapshot(): Uint8Array {
    const cv: HTMLCanvasElement | null = this.img >= 0 ? Z.images.canvas(this.img) : null;
    if (cv === null) return [];
    return Array.from(cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data);
  }
  toPng(): Uint8Array {
    const cv: HTMLCanvasElement | null = this.img >= 0 ? Z.images.canvas(this.img) : null;
    if (cv === null) return [];
    const b = g.atob(cv.toDataURL('image/png').split(',')[1]), out: number[] = [];
    for (let i = 0; i < b.length; i++) out.push(b.charCodeAt(i));
    return out;
  }
  /** (a page has no synchronous QR decoder) */
  scanQr(): string { return ''; }
  still(): number {
    if (this.img < 0) return -1;
    const copy = createImage(this.w, this.h), to: HTMLCanvasElement | null = Z.images.canvas(copy), from: HTMLCanvasElement | null = Z.images.canvas(this.img);
    if (to === null || from === null) return -1;
    to.getContext('2d')!.drawImage(from, 0, 0);
    Z.images.touch(copy);
    return copy;
  }
  encodePng(): Promise<Uint8Array> {
    const cv: HTMLCanvasElement | null = this.img >= 0 ? Z.images.canvas(this.img) : null;
    if (cv === null) return Promise.resolve([]);
    return new Promise<Uint8Array>((resolve: (b: Uint8Array) => void) => cv.toBlob(async (blob: Blob | null) => resolve(blob === null ? [] : Array.from(new g.Uint8Array(await blob.arrayBuffer()))), 'image/png'));
  }
  close(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.pump) g.clearInterval(this.pump);
    if (this.own && this.stream) this.stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    this.video.srcObject = null;
    this.video.remove();
    if (this.img >= 0) destroyImage(this.img);
    this.img = -1; this.cbs = [];
  }
}

// every video track reads like a Camera: `track.camera` (a local getUserMedia track, or what zinc:webrtc received)
const cameras = new WeakMap<object, Camera>();
const proto: any = g.MediaStreamTrack && g.MediaStreamTrack.prototype;
if (proto && !Object.getOwnPropertyDescriptor(proto, 'camera')) {
  Object.defineProperty(proto, 'camera', {
    configurable: true,
    get(): Camera | null {
      const t: any = this;
      if (t.kind !== 'video') return null;
      let c = cameras.get(t);
      if (c === undefined) { c = Camera.ofTrack(t); cameras.set(t, c); }
      return c;
    },
  });
}
