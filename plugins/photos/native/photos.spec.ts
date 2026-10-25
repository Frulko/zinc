// zinc:photos native side: nothing blocks. Listing answers at once; loading and saving are jobs the program polls (index.ts), since PhotoKit
// answers on queues of its own (and may fetch a picture from iCloud). Records use \u001e between items and \u001f between fields.
// photos.host.cpp is the shared part (the jobs, the fake library, the image copy) over a backend: photos.macos.mm (PhotoKit on macOS and,
// through photos.ios.mm, on iOS). Compiled alone (Linux, Windows) it has the fake library only.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** level 0 read and write, 1 add only. 0 undetermined, 1 granted, 2 denied, 3 limited (iOS 14 and later: the person chose some
   *  pictures). `ask`: show the system's question when undetermined; it is answered later, so call again with false. */
  permission(level: i32, ask: boolean): i32;
  /** Shows the system's sheet that changes a limited selection: a job (done when it closes), -1 where there is none. */
  manageLimited(): i32;
  /** The albums: id, title, kind ('smart' 'user'), count records; Recents first. '' and error() on a failure. */
  albums(): string;
  /** Assets of an album ('' for all), newest first, from `offset`, at most `limit`: id, date (ms since 1970), width, height, type
   *  ('image' 'video' 'audio' 'unknown'), latitude, longitude ('' when the asset has no place) records. */
  assets(album: string, offset: i32, limit: i32): string;
  /** Why the last call failed, '' when it did not. */
  error(): string;
  /** Starts loading the picture of an asset fitted in w x h (0, 0: the whole picture, 4096 at most): a job, -1 (see error()). */
  load(id: string, w: i32, h: i32): i32;
  /** Starts saving the bytes of a PNG or JPEG file into the library, and into the user album `album` when it is not '' (made when missing). */
  save(bytes: u8[], album: string): i32;
  /** The same with RGBA pixels (w * h * 4 bytes), encoded as a PNG. */
  savePixels(rgba: u8[], w: i32, h: i32, album: string): i32;
  /** 0 running, 1 done, -1 failed (see result), -2 no such job. */
  state(job: i32): i32;
  /** [width, height] of a done load. */
  size(job: i32): f64[];
  /** Copies a done load into `image`, a zinc:gfx createImage of size(); false when it cannot. */
  copy(job: i32, image: i32): boolean;
  /** A done save: the new asset's id; a failed job: the reason. */
  result(job: i32): string;
  /** Forgets a job (its pixels are freed). */
  release(job: i32): void;
}
export default requireNative<Spec>('Photos');
