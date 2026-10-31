// zinc:imageio native side: image files on disk. info() reads a header and answers at once; thumbnails and loads are jobs that worker
// threads decode, downscale and turn upright (EXIF orientation), the newest request first; the program polls finished() (index.ts).
// macOS and iOS decode with ImageIO (JPEG, PNG, HEIC, WebP, GIF, TIFF, camera RAW); elsewhere, and first in a deterministic run, stb_image
// (PNG, JPEG, GIF, BMP), libwebp and TinyEXIF (vendor/). Fields of info() are separated by \u001f.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** '' when the file is not an image it can read; else width, height (as shown), pixel width, pixel height, orientation (1-8), format,
   *  file size, date taken (ISO 8601, local time), make, model, lens, ISO, exposure time (s), f-number, focal length (mm), latitude,
   *  longitude ('' when the picture has no place). */
  info(path: string): string;
  /** Starts a thumbnail: the picture fitted in a square of `maxSide`, read from `cacheDir` when it holds one for this file (path, size and
   *  modification time) and written there otherwise ('' for no cache). A job id. */
  thumbnail(path: string, maxSide: i32, cacheDir: string): i32;
  /** Starts loading the picture fitted in maxW x maxH (0, 0: the whole picture), never enlarged. A job id. */
  load(path: string, maxW: i32, maxH: i32): i32;
  /** Starts decoding an animation (GIF, APNG, animated WebP; a still picture is one frame), each frame fitted in maxW x maxH, `most` frames
   *  at most. A job id; its frames are frameCount(), their delays frameDelay() (ms), copyFrame() draws one. */
  frames(path: string, maxW: i32, maxH: i32, most: i32): i32;
  /** The frames of a done frames job (1 for any other job). */
  frameCount(job: i32): i32;
  /** How long frame i shows, in ms (0 for a still picture). */
  frameDelay(job: i32, i: i32): i32;
  /** Copies frame i of a done job into `image` (a createImage of size()); false when it cannot. */
  copyFrame(job: i32, i: i32, image: i32): boolean;
  /** A job that has not started is dropped (it fails with 'cancelled'); a running one ends as usual. */
  cancel(job: i32): void;
  /** The jobs that ended since the last call. */
  finished(): f64[];
  /** 0 running or waiting, 1 done, -1 failed (see result), -2 no such job. */
  state(job: i32): i32;
  /** [width, height] of a done job. */
  size(job: i32): f64[];
  /** Copies a done job into `image`, a zinc:gfx createImage of size(); false when it cannot. */
  copy(job: i32, image: i32): boolean;
  /** Why a job failed. */
  result(job: i32): string;
  /** Forgets a job (its pixels are freed). */
  release(job: i32): void;
}
export default requireNative<Spec>('Imageio');
