// Native side of zinc:video (NAT-01). Players are handles; plugins/video/index.ts wraps them in a class.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** New player whose image is w x h (0 x 0: size of the first video added). Returns a handle, -1 when full. */
  create(w: i32, h: i32): i32;
  /** Appends a file to the playlist; false when it cannot be opened. */
  add(p: i32, path: string): boolean;
  /** 0 sequential, 1 random, 2 random without repeats until every file played. */
  setOrder(p: i32, order: i32): void;
  /** 0 stop after the playlist, 1 loop forever, 2 stop after each file. */
  setRepeat(p: i32, mode: i32): void;
  /** Colour of the letterbox bars and of the image when stopped (0xRRGGBB). */
  setBackground(p: i32, color: u32): void;
  play(p: i32): void;
  stop(p: i32): void;
  pause(p: i32, on: boolean): void;
  /** Next (+1) / previous (-1) file. */
  skip(p: i32, delta: i32): void;
  /** Plays playlist entry `index` now. */
  jump(p: i32, index: i32): void;
  /** Runtime image id (gfx.drawImage, GPU compositors via raster::dyn_view); -1 before the size is known. */
  image(p: i32): i32;
  width(p: i32): i32;
  height(p: i32): i32;
  /** Playlist entry shown now, entries count, seconds into it, its duration. */
  index(p: i32): i32;
  count(p: i32): i32;
  position(p: i32): f64;
  duration(p: i32): f64;
  /** Completed passes over the playlist. */
  loops(p: i32): i32;
  playing(p: i32): boolean;
  paused(p: i32): boolean;
  /** Decoder of the file shown, e.g. "h264 (videotoolbox)". */
  decoder(p: i32): string;
  frames(p: i32): i32;
  dropped(p: i32): i32;
  close(p: i32): void;
}
export default requireNative<Spec>('Video');
