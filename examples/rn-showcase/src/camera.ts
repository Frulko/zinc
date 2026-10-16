// The camera adapter: the API of the zinc:camera plugin (devices, requestPermission, Camera.open, image, onFrame, snapshot, close) over a
// simulated camera, so the Camera screen works on every machine and in the tests. The simulated camera has no runtime image (`image` is -1):
// camera-view.ts paints its moving scene instead, and paints `cam.image` when there is one.
//
// zinc:camera is written in parallel with this showcase. Once it is in the tree, the real cameras come in through platform-specific files and
// the screen does not change: camera.macos.ts and camera.linux.ts, each the one line
//   export { devices, requestPermission, Camera, CameraDevice } from 'zinc:camera';

export class CameraDevice { id: string; name: string; position: string; constructor(id: string, name: string, position: string) { this.id = id; this.name = name; this.position = position; } }
export interface CameraOptions { width?: number; height?: number; fps?: number }

/** The simulated camera always grants. */
export function requestPermission(): Promise<string> { return Promise.resolve('granted'); }
export function devices(): Promise<CameraDevice[]> {
  return Promise.resolve([new CameraDevice('sim-front', 'Simulated front camera', 'front'), new CameraDevice('sim-back', 'Simulated back camera', 'back')]);
}

export class Camera {
  readonly id: string; readonly width: number; readonly height: number; readonly fps: number;
  private timer: i32 = -1;
  private last: number = -1;
  private cbs: ((index: number) => void)[] = [];
  private constructor(id: string, w: number, h: number, fps: number) {
    this.id = id; this.width = w; this.height = h; this.fps = fps;
    this.timer = setInterval((): void => { this.last++; for (const cb of this.cbs.slice()) cb(this.last); }, Math.round(1000 / fps));
  }
  static open(id: string, o: CameraOptions = {}): Promise<Camera> { return Promise.resolve(new Camera(id, o.width ?? 640, o.height ?? 480, o.fps ?? 30)); }
  /** -1: a simulated camera has no runtime image (drawPreview draws its pattern). */
  get image(): number { return -1; }
  get frameIndex(): number { return this.last; }
  get isOpen(): boolean { return this.timer >= 0; }
  onFrame(cb: (index: number) => void): void { this.cbs.push(cb); }
  setOption(name: string, value: number): void {}
  /** The newest frame as RGBA bytes: the simulated camera's are a flat grey of its frame index (enough for the "photo taken" flow). */
  snapshot(): u8[] { const v = (this.last * 3) % 256, out: u8[] = []; for (let i = 0; i < 16; i++) out.push(v as u8); return out; }
  close(): void { if (this.timer >= 0) clearInterval(this.timer); this.timer = -1; this.cbs = []; }
}

