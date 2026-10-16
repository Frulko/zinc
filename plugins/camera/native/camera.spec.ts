// zinc:camera native side: cameras are handles and nothing blocks. index.ts calls frame() on a timer, which takes the newest frame into the
// camera's runtime image. Records use \u001e between items and \u001f between fields.
// camera.host.cpp is the shared part (the fake camera, the options, the image) over a backend: src/avfoundation.mm (macOS), src/v4l2.cpp
// (Linux, Raspberry Pi). camera.sim.ts is the fake camera alone, in Zinc.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** 0 undetermined, 1 granted, 2 denied (macOS privacy settings, or zinc.json "permissions"). `ask`: show the system's question when
   *  undetermined; it is answered later, so call again with false. */
  permission(ask: boolean): i32;
  /** The cameras: id, name, position ('front' 'back' 'external' 'unknown') records; the fake camera when there is none or ZINC_FAKE_CAMERA=1. */
  devices(): string;
  /** Why the last devices() or open() failed, '' when it did not. */
  error(): string;
  /** Opens a camera near w x h at fps (0: 640x480, 30); a handle, or -1 (see error()). */
  open(id: string, w: i32, h: i32, fps: i32): i32;
  /** [width, height, fps, how often to call frame() in ms] of an open camera. */
  format(h: i32): f64[];
  /** Takes the newest frame into the image (options applied) and returns its index, -1 before the first frame. */
  frame(h: i32): i32;
  /** The runtime image of zinc:gfx that shows the frames (-1 when the engine draws nothing). */
  image(h: i32): i32;
  /** mirror (0 or 1), brightness (-1..1, 0), contrast (0..2, 1): applied in software to the image and the snapshots. */
  setOption(h: i32, name: string, value: f64): void;
  /** The newest frame as RGBA bytes, width * height * 4. */
  snapshot(h: i32): u8[];
  /** The newest frame as the bytes of a PNG file (options applied, deflate-compressed); [] when it cannot be encoded. */
  png(h: i32): u8[];
  close(h: i32): void;
}
export default requireNative<Spec>('Camera');
