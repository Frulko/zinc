// Playlist: fills a Player from the folder (or an M3U file) and keeps a display title per entry.
import * as fs from 'zinc:fs';
import { Player, isVideo, RANDOM, RANDOM_UNIQUE, SEQUENTIAL, LOOP, ONE_SHOT } from 'zinc:video';
import { setting, flag, num, color } from './config';

/** "media/clip_repeat_2x.mp4" -> "clip_repeat_2x" */
export function baseName(path: string): string {
  const parts = path.split('/');
  const file = parts[parts.length - 1];
  const pieces = file.split('.');
  if (pieces.length < 2 || file.startsWith('.')) return file;   // no extension, or a hidden file
  return pieces.slice(0, pieces.length - 1).join('.');
}

/** `name_repeat_3x.mp4` plays three times in a row (pi_video_looper convention). */
function repeats(path: string): i32 {
  const i = path.indexOf('_repeat_');
  if (i < 0) return 1;
  const n = parseInt(path.slice(i + 8));
  return isNaN(n) || n < 1 ? 1 : n;
}

export class Playlist {
  player: Player;
  titles: string[] = [];

  constructor(width: i32, height: i32) {
    this.player = new Player(width, height);   // decoded at screen size: drawing is a plain row copy
    this.configure();
    this.load();
  }

  get count(): i32 { return this.player.count; }

  /** Order, repeat mode and letterbox colour from the settings. */
  private configure(): void {
    const p = this.player;
    p.background = color('bgcolor');
    p.order = flag('is_random_unique') ? RANDOM_UNIQUE : flag('is_random') ? RANDOM : SEQUENTIAL;
    // wait_time > 0: every file stops on its own and the looper restarts the next one after the pause
    p.repeat = flag('one_shot_playback') || num('wait_time') > 0 ? ONE_SHOT : LOOP;
  }

  private addFile(path: string, title: string): void {
    const n = repeats(path);
    for (let k = 0; k < n; k++) if (this.player.add(path)) this.titles.push(title.replace(`_repeat_${n}x`, ''));
  }

  /** The M3U playlist when one is set, else every video in the folder root. */
  private load(): void {
    const dir = setting('path');
    const m3u = setting('playlist');
    if (m3u !== '') this.loadM3u(m3u.startsWith('/') ? m3u : `${dir}/${m3u}`, dir);
    else this.loadFolder(dir);
  }

  private loadFolder(dir: string): void {
    if (!fs.exists(dir)) return;
    const exts = setting('extensions').split(',').map((e: string) => e.trim());
    for (const f of fs.list(dir)) if (isVideo(f, exts)) this.addFile(`${dir}/${f}`, baseName(f));
  }

  /** `#EXTINF:0,Title` lines name the entry that follows. */
  private loadM3u(file: string, dir: string): void {
    if (!fs.exists(file)) return;
    let title = '';
    for (const raw of fs.readText(file).split('\n')) {
      const line = raw.trim();
      if (line.startsWith('#EXTINF')) { title = line.slice(line.indexOf(',') + 1); continue; }
      if (line === '' || line.startsWith('#')) continue;
      this.addFile(line.startsWith('/') ? line : `${dir}/${line}`, title !== '' ? title : baseName(line));
      title = '';
    }
  }
}
