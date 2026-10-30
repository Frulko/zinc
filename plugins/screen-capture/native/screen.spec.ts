// zinc:screen-capture native side: sources (screens and windows) and captures are handles, nothing blocks. Listing and starting a capture
// are asynchronous on macOS (ScreenCaptureKit): index.ts polls listState() and state() on a timer, then frame() takes the newest frame into
// the capture's runtime image. Records use \u001e between items and \u001f between fields.
// screen.host.cpp is the shared part (the fake sources, the images) over a backend: screen.macos.mm (ScreenCaptureKit). Elsewhere only the
// fake sources exist (ZINC_FAKE_SCREEN=1, or a deterministic run).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** 1 granted, 2 not granted (macOS: Screen & System Audio Recording, or zinc.json "permissions" lacks "screen"). `ask`: show the
   *  system's question (once per app; a background run never asks). */
  permission(ask: boolean): i32;
  /** Starts listing the sources: screens and/or windows, with thumbnails that fit thumbW x thumbH (0: none); false (see error()) when it
   *  cannot start (no permission: nothing asks for it here). */
  list(screens: boolean, windows: boolean, thumbW: i32, thumbH: i32): boolean;
  /** 0 listing, 1 done, -1 failed (see error()). */
  listState(): i32;
  /** The sources of the last list: id, kind ('screen' 'window'), name, app name, width, height (pixels), thumbnail (a runtime image of
   *  zinc:gfx, -1 for none; it lives until the next list()) records. */
  sources(): string;
  /** Why the last call failed, '' when it did not. */
  error(): string;
  /** Starts capturing a source (an id of sources(), '' for the main screen) at w x h at most (0: the source's size, at most 1920 x 1080;
   *  the source's aspect is kept) and fps (0: 30), with the pointer or not; a handle, or -1 (see error()). */
  open(id: string, w: i32, h: i32, fps: i32, cursor: boolean): i32;
  /** 1 running, 0 starting, -1 failed or ended (the window closed: see error()). */
  state(h: i32): i32;
  /** [width, height, fps, how often to call frame() in ms] of a capture. */
  format(h: i32): f64[];
  /** Points the capture's image at the newest frame (no copy) and returns its index, -1 before the first. */
  frame(h: i32): i32;
  /** The runtime image with the newest frame (-1 when the engine draws nothing). */
  image(h: i32): i32;
  /** The newest frame as RGBA bytes, width * height * 4. */
  snapshot(h: i32): u8[];
  /** Stops the capture; its image is destroyed. */
  close(h: i32): void;
}
export default requireNative<Spec>('ScreenCapture');
