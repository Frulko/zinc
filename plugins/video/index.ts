// zinc:video — video playback as runtime images (docs/plugins/video.md).
// A Player decodes a playlist on its own thread and loops it without gaps; draw it with `player.draw(...)` or
// `gfx.drawImage(player.image, ...)`. Native side: native/video.spec.ts.
import * as gfx from 'zinc:gfx';
import * as fs from 'zinc:fs';
import Video from './native/video.spec';

/** Playlist order. */
export const SEQUENTIAL: i32 = 0;
export const RANDOM: i32 = 1;
/** Random, but every file plays once per pass. */
export const RANDOM_UNIQUE: i32 = 2;
/** What happens at the end: stop after the playlist, loop it forever (default), stop after each file. */
export const STOP: i32 = 0;
export const LOOP: i32 = 1;
export const ONE_SHOT: i32 = 2;

export const EXTENSIONS: string[] = ['mp4', 'mov', 'mkv', 'm4v', 'avi', 'webm', 'h264', 'mpg', 'ts'];

/** True when `name` ends with one of `exts` (without the dot, case-insensitive). */
export function isVideo(name: string, exts: string[]): boolean {
  const n = name.toLowerCase();
  if (n.startsWith('.')) return false;
  for (const e of exts) if (n.endsWith('.' + e.toLowerCase())) return true;
  return false;
}

export class Player {
  readonly id: i32;
  /** The image is width x height; 0 x 0 takes the size of the first video. Every video is fitted inside it
   *  (aspect ratio kept, bars in the background colour), so decode at the size you draw to save bandwidth. */
  constructor(width: i32, height: i32) { this.id = Video.create(width, height); }

  add(path: string): boolean { return Video.add(this.id, path); }
  /** Adds the videos of a directory in alphabetical order; returns how many were added. */
  addFolder(dir: string, exts: string[]): i32 {
    let n = 0;
    if (!fs.exists(dir)) return 0;
    for (const f of fs.list(dir)) if (isVideo(f, exts) && this.add(dir + '/' + f)) n++;
    return n;
  }
  set order(o: i32) { Video.setOrder(this.id, o); }
  set repeat(r: i32) { Video.setRepeat(this.id, r); }
  set background(c: u32) { Video.setBackground(this.id, c); }

  play(): void { Video.play(this.id); }
  stop(): void { Video.stop(this.id); }
  pause(on: boolean): void { Video.pause(this.id, on); }
  next(): void { Video.skip(this.id, 1); }
  previous(): void { Video.skip(this.id, -1); }
  jump(index: i32): void { Video.jump(this.id, index); }
  close(): void { Video.close(this.id); }

  /** Runtime image id, -1 until the size is known. */
  get image(): i32 { return Video.image(this.id); }
  get width(): i32 { return Video.width(this.id); }
  get height(): i32 { return Video.height(this.id); }
  /** Playlist entry on screen, number of entries, seconds into the entry, its duration, completed passes. */
  get index(): i32 { return Video.index(this.id); }
  get count(): i32 { return Video.count(this.id); }
  get position(): number { return Video.position(this.id); }
  get duration(): number { return Video.duration(this.id); }
  get loops(): i32 { return Video.loops(this.id); }
  get playing(): boolean { return Video.playing(this.id); }
  get paused(): boolean { return Video.paused(this.id); }
  get decoder(): string { return Video.decoder(this.id); }
  get frames(): i32 { return Video.frames(this.id); }
  get dropped(): i32 { return Video.dropped(this.id); }

  /** Draws the current frame; 1:1 size is a plain row copy. */
  draw(x: number, y: number, w: number, h: number): void {
    const img = this.image;
    if (img >= 0) gfx.drawImage(img, x, y, w, h, 255, 0);
  }
}
