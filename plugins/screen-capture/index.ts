// zinc:screen-capture — the screens and windows of the machine as video (docs/plugins/screen-capture.md): list the sources with thumbnails
// (Electron's desktopCapturer.getSources), capture one at a size and rate (a runtime image of zinc:gfx kept on the newest frame, without
// copies), or as a MediaStreamTrack through navigator.mediaDevices.getDisplayMedia, which zinc:webrtc sends like a camera's.
// The native side (native/screen.spec.ts) captures on its own thread (ScreenCaptureKit on macOS); this file calls frame() on a timer.
// With ZINC_FAKE_SCREEN=1, and in a deterministic run, the sources are "Zinc Fake Screen" and "Zinc Fake Window": a moving pattern, so tests
// never capture the screen of the person at the machine.
import S from './native/screen.spec';
import { Event, MediaStreamTrack, MediaTrackSettings, setDisplayBridge } from 'zinc:web';

const RS = '\u001e', FS = '\u001f';

/** Bytes of a snapshot. Zinc has no typed arrays: a u8[] (a real Uint8Array on the QuickJS engine). */
export type Uint8Array = u8[];
export type SourceKind = 'screen' | 'window';
export type PermissionStatus = 'granted' | 'denied';

/** A screen or a window. `thumbnail`: a runtime image (gfx.drawImage, <Image source>) of the size asked, -1 without one; it lives until the
 *  next getSources(). */
export interface CaptureSource { id: string; kind: SourceKind; name: string; appName: string; width: number; height: number; thumbnail: number }
export interface SourcesOptions { types?: SourceKind[]; thumbnailSize?: { width: number; height: number } }
/** width x height: the box the frames fit in (the source's aspect is kept; default: the source's size, at most 1920 x 1080); frameRate
 *  (default 30, at most 60); cursor: draw the pointer (default true). */
export interface CaptureOptions { width?: number; height?: number; frameRate?: number; cursor?: boolean }

/** Where screen recording stands now, without asking. macOS cannot tell "never asked" from "refused": both are 'denied'. */
export function permissionStatus(): PermissionStatus { return S.permission(false) === 1 ? 'granted' : 'denied'; }

/** Asks for screen recording: macOS shows its question the first time (then the person allows the app in System Settings and opens it
 *  again). A background run (ZINC_BACKGROUND) never asks. */
export function requestPermission(): Promise<PermissionStatus> {
  return Promise.resolve(S.permission(true) === 1 ? 'granted' : 'denied');
}

/** The screens (the main one first) and the windows that can be captured. Rejects with the reason: screen recording not allowed (nothing
 *  asks for it here: requestPermission()), zinc.json "permissions" without "screen", no capture on this platform. */
export function getSources(o: SourcesOptions = {}): Promise<CaptureSource[]> {
  const types = o.types ?? ['screen', 'window'];
  const tw = o.thumbnailSize !== undefined ? o.thumbnailSize.width : 0, th = o.thumbnailSize !== undefined ? o.thumbnailSize.height : 0;
  if (!S.list(types.indexOf('screen') >= 0, types.indexOf('window') >= 0, tw, th)) return Promise.reject(new Error(S.error()));
  return new Promise<CaptureSource[]>((resolve: (s: CaptureSource[]) => void, reject: (e: Error) => void) => {
    const done = (): boolean => {
      const s = S.listState();
      if (s === 0) return false;
      if (s < 0) { reject(new Error(S.error())); return true; }
      const out: CaptureSource[] = [];
      for (const r of S.sources().split(RS)) {
        if (r === '') continue;
        const f = r.split(FS);
        out.push({ id: f[0], kind: f[1] === 'window' ? 'window' : 'screen', name: f[2], appName: f[3], width: parseInt(f[4]), height: parseInt(f[5]), thumbnail: parseInt(f[6]) });
      }
      resolve(out);
      return true;
    };
    if (done()) return;
    let t: i32 = -1;
    t = setInterval(() => { if (done()) clearInterval(t); }, 10);
  });
}

/** A running capture of a screen or a window. */
export class ScreenCapture {
  /** The size and rate of the frames. */
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly id: string;
  private h: i32;
  private timer: i32 = -1;
  private last: i32 = -1;
  private cbs: ((index: number) => void)[] = [];
  private ends: ((why: string) => void)[] = [];

  /** Starts capturing a source (an id of getSources(), '' for the main screen). Rejects with the reason (no such source, screen recording
   *  not allowed). */
  static open(id: string, o: CaptureOptions = {}): Promise<ScreenCapture> {
    const h = S.open(id, o.width ?? 0, o.height ?? 0, o.frameRate ?? 0, o.cursor ?? true);
    if (h < 0) return Promise.reject(new Error(S.error()));
    return new Promise<ScreenCapture>((resolve: (c: ScreenCapture) => void, reject: (e: Error) => void) => {
      const ready = (): boolean => {
        const s = S.state(h);
        if (s === 0) return false;
        if (s > 0) resolve(new ScreenCapture(h, id));
        else { const e = S.error(); S.close(h); reject(new Error(e)); }
        return true;
      };
      if (ready()) return;
      let t: i32 = -1;
      t = setInterval(() => { if (ready()) clearInterval(t); }, 10);
    });
  }
  private constructor(h: i32, id: string) {
    const f = S.format(h);
    this.h = h; this.id = id;
    this.width = f[0]; this.height = f[1]; this.fps = f[2];
    this.timer = setInterval(() => this.tick(), f[3]);
  }
  private tick(): void {
    if (this.h < 0) return;
    if (S.state(this.h) < 0) {   // the window closed, the screen went away
      const why = S.error(), ends = this.ends.slice();
      this.close();
      for (const cb of ends) cb(why);
      return;
    }
    const i = S.frame(this.h);
    if (i < 0 || i === this.last) return;
    this.last = i;
    for (const cb of this.cbs.slice()) cb(i);
  }
  /** The runtime image with the newest frame: gfx.drawImage(cap.image, ...) or <Image source={cap.image}>. -1 once closed. */
  get image(): number { return this.h < 0 ? -1 : S.image(this.h); }
  /** Index of the newest frame (0, 1, 2...), -1 before the first. A still screen sends no new frame. */
  get frameIndex(): number { return this.last; }
  get isOpen(): boolean { return this.h >= 0; }
  /** Called for each new frame, with its index, once the image shows it. */
  onFrame(cb: (index: number) => void): void { this.cbs.push(cb); }
  /** Called once when the source goes away (its window closed) with the reason; the capture is closed then. */
  onEnded(cb: (why: string) => void): void { this.ends.push(cb); }
  /** The newest frame as RGBA bytes (width * height * 4); black before the first frame. */
  snapshot(): Uint8Array { return this.h < 0 ? [] : S.snapshot(this.h); }
  /** Stops the capture: the system stops recording, the image is destroyed. */
  close(): void {
    if (this.h < 0) return;
    clearInterval(this.timer);
    S.close(this.h);
    this.h = -1; this.cbs = []; this.ends = [];
  }
}

// navigator.mediaDevices.getDisplayMedia (zinc:web) comes here once this module is loaded.
class Bridge {
  async open(id: string, width: i32, height: i32, fps: i32, cursor: boolean): Promise<MediaStreamTrack> {
    const cap = await ScreenCapture.open(id, { width: width, height: height, frameRate: fps, cursor: cursor });
    const s = new MediaTrackSettings();
    s.deviceId = id; s.width = cap.width; s.height = cap.height; s.frameRate = cap.fps;
    const t = new MediaStreamTrack(id === '' ? 'screen' : id, s, cap, () => cap.close(), () => cap.image);
    t.setFrames(() => cap.frameIndex, () => cap.snapshot());
    cap.onEnded((_why: string) => { if (t.readyState === 'live') { t.readyState = 'ended'; t.dispatchEvent(new Event('ended')); } });
    return t;
  }
}
setDisplayBridge(new Bridge());
