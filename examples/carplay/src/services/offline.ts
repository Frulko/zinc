import { Session } from 'zinc:carplay';
import { readBytes } from 'zinc:fs';

/** Local FFmpeg fixtures only: no receiver, pairing or authentication. */
export class OfflineMedia {
  private session: Session;
  private frames: u8[][] = [];
  private audio: u8[] = [];
  private elapsed: number = 0;
  private frame: i32 = -1;
  private sample: i32 = 0;
  constructor(session: Session, directory: string) {
    this.session = session;
    for (let i = 0; i < 8; i++) this.frames.push(readBytes(`${directory}/frame${i}.h264`));
    this.audio = readBytes(`${directory}/tone.pcm`);
    if (this.frames[0].length === 0 || this.audio.length === 0) throw new Error('Offline media missing: run examples/carplay/run');
    session.receive([1, 110, 1, 192, 3, 0, 0, 28, 2, 0, 0, 0]);
    session.receive([3, 100, 3, 128, 187, 0, 0, 1, 0]);
    this.step(0);
  }
  step(dt: number): void {
    this.elapsed += dt;
    const frame = Math.floor(this.elapsed * 2) % 8;
    if (this.frame !== frame) {
      this.frame = frame;
      const header: u8[] = [2, 110, 1, 0, 0, 0, 0, 0, 0, 0, 0];
      this.session.receive(header.concat(this.frames[frame]));
    }
    // One short tone per four-second loop; cap catch-up after a suspended window.
    const end = Math.min(this.audio.length, Math.floor((this.elapsed % 4) * 48000) * 2);
    if (end < this.sample) this.sample = 0;
    if (end > this.sample) {
      const start = Math.max(this.sample, end - 9600);
      const header: u8[] = [4, 100, 0, 0, 0, 0, 0, 0, 0, 0];
      this.session.receive(header.concat(this.audio.slice(start, end)));
      this.sample = end;
    }
  }
}
