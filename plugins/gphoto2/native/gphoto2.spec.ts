// zinc:gphoto2 native side. Every blocking libgphoto2 call runs on one worker thread (the only owner of the
// Camera); results come back through the event loop. Records use \u001e between items and \u001f between fields.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Auto-detected cameras: model \u001f port records. */
  detect(): Promise<string>;
  /** Opens a camera ('' = first detected); resolves with its model name. */
  open(model: string, port: string): Promise<string>;
  close(): Promise<string>;
  summary(): Promise<string>;
  /** Leaf widgets of the config tree: path, label, type, readonly, value, min, max, step, choices... */
  config(): Promise<string>;
  get(name: string): Promise<string>;
  set(name: string, value: string): Promise<string>;
  /** Captures an image; downloads it into `dir` when not empty. Resolves with the local or camera path. */
  capture(dir: string): Promise<string>;
  trigger(): Promise<string>;
  download(cameraPath: string, dir: string): Promise<string>;
  /** Decodes a JPEG file into a runtime image fitting w x h; resolves with the image id. */
  thumbnail(path: string, w: i32, h: i32): Promise<string>;
  /** kind: 'file' (camera path added), 'error' (live view stopped). */
  onEvent(cb: (kind: string, data: string) => void): void;
  liveView(on: boolean): void;
  /** Frames are decoded and scaled on the worker to fit this box, so drawing them is a 1:1 copy. */
  setViewSize(w: i32, h: i32): void;
  /** Runtime image holding the latest frame (-1 before the first one). */
  liveImage(): i32;
  /** Frames decoded per second, frames shown per second, mean decode+scale time in ms. */
  cameraFps(): f64;
  shownFps(): f64;
  decodeMs(): f64;
  /** Size of the camera's live view JPEG (0 before the first frame): the coordinates focus points use. */
  liveWidth(): i32;
  liveHeight(): i32;
}
export default requireNative<Spec>('Gphoto2');
