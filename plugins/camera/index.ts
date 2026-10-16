// zinc:camera — webcams and built-in cameras (docs/plugins/camera.md): list them, open one at a size and rate, draw its frames (a runtime
// image of zinc:gfx, kept on the newest frame), take RGBA snapshots. The native side (native/camera.spec.ts) captures on its own thread;
// this file calls frame() on a timer and runs the onFrame handlers. Without a camera, or with ZINC_FAKE_CAMERA=1, or in a deterministic run,
// the camera is "Zinc Fake Camera": a moving test pattern, the same pixels for the same frame index on every machine.
// navigator.mediaDevices.getUserMedia (zinc:web) opens cameras through this module once a program imports it.
import S from './native/camera.spec';
import { MediaStreamTrack, MediaTrackSettings, setCameraBridge } from 'zinc:web';

const RS = '\u001e', FS = '\u001f';

/** Bytes of a snapshot. Zinc has no typed arrays: a u8[] (a real Uint8Array on the QuickJS engine). */
export type Uint8Array = u8[];
export type CameraPosition = 'front' | 'back' | 'external' | 'unknown';
export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface CameraDevice { id: string; name: string; position: CameraPosition }
export interface CameraOptions { width?: number; height?: number; fps?: number }

const position = (s: string): CameraPosition => s === 'front' || s === 'back' || s === 'external' ? s : 'unknown';
const status = (s: i32): PermissionStatus => s === 1 ? 'granted' : s === 2 ? 'denied' : 'undetermined';

/** Where access stands now, without asking. */
export function permissionStatus(): PermissionStatus { return status(S.permission(false)); }

/** Asks for the camera: macOS shows its question once per app and resolves when the person answers (or after a minute, 'undetermined');
 *  elsewhere 'granted'. 'denied' too when zinc.json "permissions" lack "camera" in an exported app. */
export function requestPermission(): Promise<PermissionStatus> {
  const first = S.permission(true);
  if (first !== 0) return Promise.resolve(status(first));
  return new Promise<PermissionStatus>((resolve: (s: PermissionStatus) => void) => {
    let tries = 0, t: i32 = -1;
    t = setInterval(() => {
      const s = S.permission(false);
      if (s === 0 && ++tries < 600) return;
      clearInterval(t);
      resolve(status(s));
    }, 100);
  });
}

/** The cameras of the machine ([] when there is none and ZINC_FAKE_CAMERA=0; else the fake camera stands in). Rejects when zinc.json
 *  "permissions" refuse "camera". */
export function devices(): Promise<CameraDevice[]> {
  const s = S.devices(), e = S.error();
  if (e !== '') return Promise.reject(new Error(e));
  const out: CameraDevice[] = [];
  for (const r of s.split(RS)) {
    if (r === '') continue;
    const f = r.split(FS);
    out.push({ id: f[0], name: f[1], position: position(f[2]) });
  }
  return Promise.resolve(out);
}

export class Camera {
  /** The size and rate of the frames (the asked ones; macOS scales the camera's nearest format to the asked size). */
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly id: string;
  private h: i32;
  private timer: i32 = -1;
  private last: i32 = -1;
  private cbs: ((index: number) => void)[] = [];

  /** Opens a camera (an id of devices(), '' for the first one). Defaults: 640x480 at 30 fps. Rejects with the reason (no such camera,
   *  access not granted: requestPermission() first, zinc.json "permissions"). */
  static open(id: string, o: CameraOptions = {}): Promise<Camera> {
    const h = S.open(id, o.width ?? 0, o.height ?? 0, o.fps ?? 0);
    if (h < 0) return Promise.reject(new Error(S.error()));
    return Promise.resolve(new Camera(h, id));
  }
  private constructor(h: i32, id: string) {
    const f = S.format(h);
    this.h = h; this.id = id;
    this.width = f[0]; this.height = f[1]; this.fps = f[2];
    this.timer = setInterval(() => this.tick(), f[3]);
  }
  private tick(): void {
    if (this.h < 0) return;
    const i = S.frame(this.h);
    if (i < 0 || i === this.last) return;
    this.last = i;
    for (const cb of this.cbs.slice()) cb(i);
  }
  /** The runtime image with the newest frame: gfx.drawImage(cam.image, ...) or <Image source={cam.image}>. -1 once closed. */
  get image(): number { return this.h < 0 ? -1 : S.image(this.h); }
  /** Index of the newest frame (0, 1, 2...), -1 before the first. */
  get frameIndex(): number { return this.last; }
  get isOpen(): boolean { return this.h >= 0; }
  /** Called for each new frame, with its index, once the image shows it. */
  onFrame(cb: (index: number) => void): void { this.cbs.push(cb); }
  /** mirror (0 or 1), brightness (-1..1, default 0), contrast (0..2, default 1): in software, on the image and the snapshots. */
  setOption(name: 'mirror' | 'brightness' | 'contrast', value: number): void { if (this.h >= 0) S.setOption(this.h, name, value); }
  /** The newest frame as RGBA bytes (width * height * 4), options applied; black before the first frame. */
  snapshot(): Uint8Array { return this.h < 0 ? [] : S.snapshot(this.h); }
  /** Stops the camera; its image is destroyed. */
  close(): void {
    if (this.h < 0) return;
    clearInterval(this.timer);
    S.close(this.h);
    this.h = -1; this.cbs = [];
  }
}

// navigator.mediaDevices (zinc:web): getUserMedia and enumerateDevices come here once this module is loaded.
class Bridge {
  async devices(): Promise<string[]> {
    const out: string[] = [];
    for (const d of await devices()) out.push(d.id + FS + d.name + FS + d.position);
    return out;
  }
  async open(id: string, width: i32, height: i32, fps: i32): Promise<MediaStreamTrack> {
    const cam = await Camera.open(id, { width: width, height: height, fps: fps });
    const name = (await devices()).find((d: CameraDevice) => d.id === cam.id);
    const s = new MediaTrackSettings();
    s.deviceId = cam.id; s.width = cam.width; s.height = cam.height; s.frameRate = cam.fps;
    s.facingMode = name === undefined ? '' : name.position === 'front' ? 'user' : name.position === 'back' ? 'environment' : '';
    return new MediaStreamTrack(name === undefined ? cam.id : name.name, s, cam, () => cam.close(), () => cam.image);
  }
}
setCameraBridge(new Bridge());
