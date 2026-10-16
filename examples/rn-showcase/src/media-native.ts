// Sound and video on the desktop: the track is synthesised once (a pentatonic arpeggio, 8 s at 22 050 Hz) and played by zinc:audio, the clip is
// media/bars.mp4 played by zinc:video. Headless or without a device both stay silent or undecoded, and say so (media.ts is the edition without them).
import * as audio from 'zinc:audio';
import { Player } from 'zinc:video';
import { exists } from 'zinc:fs';
import { Track as SilentTrack, Clip as Poster } from './media-stub';

const RATE = 22050, NOTES: number[] = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 440.0, 392.0];
let sound: audio.Sound | null = null;
/** The samples, made on the first play (not when the screen opens: the first interaction stays quick). */
function song(): audio.Sound {
  if (sound !== null) return sound as audio.Sound;
  const n = RATE * 8, step = RATE / 4, out: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = Math.floor(i / step), t = (i % step) / RATE, hz = NOTES[k % NOTES.length] * (Math.floor(k / 8) % 2 === 1 ? 0.75 : 1);
    out.push(Math.sin(2 * Math.PI * hz * i / RATE) * Math.exp(-t * 6) * 0.35 + Math.sin(2 * Math.PI * hz / 2 * i / RATE) * 0.08);
  }
  sound = audio.fromSamples(out, 1, RATE);
  return sound as audio.Sound;
}

export class Track extends SilentTrack {
  private voice: audio.Voice | null = null;
  available(): string { return audio.backend() === 'null' ? 'No audio device here: it plays silently' : ''; }
  protected start(from: number): void { this.voice = song().voice(0.8, 1, 0, true, from); }
  protected stop(): void { const v = this.voice; if (v !== null) (v as audio.Voice).stop(); this.voice = null; }
}

const FILES: string[] = ['media/bars.mp4', 'examples/rn-showcase/media/bars.mp4', '../examples/rn-showcase/media/bars.mp4'];
export class Clip extends Poster {
  private p: Player;
  private file: string;
  constructor(p: Player, file: string) { super(); this.p = p; this.file = file; }
  available(): string { return this.file === '' ? 'media/bars.mp4 is not next to the app: the poster stands in' : ''; }
  get image(): number { return this.file === '' ? -1 : this.p.image; }
  get position(): number { return this.p.position; }
  get duration(): number { return this.p.duration; }
  get playing(): boolean { return this.p.playing && !this.p.paused; }
  play(): void { if (this.file !== '') this.p.play(); }
  pause(on: boolean): void { this.p.pause(on); }
  close(): void { this.p.close(); }
}
export function openClip(): Poster {
  const p = new Player(320, 180);
  let file = '';
  for (const f of FILES) if (exists(f) && p.add(f)) { file = f; break; }
  p.repeat = 1;
  return new Clip(p, file);
}
