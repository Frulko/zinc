// A film of a sequence: a clip played in its card through zinc:video, with its subtitles. As for a narration, the subtitles are the cues
// of the medium's WebVTT file in the visitor's language, or without one the sentences of its transcript at a reading pace. A film has no
// sound here (zinc:video decodes pictures): what it says is read.
// When nothing decodes the clip (a deterministic run, which gets the stand-in of zinc:video: every clip is a black image that lasts five
// seconds; a machine without FFmpeg's libraries) the card keeps the poster and the film counts its time itself, to the end of its
// subtitles: a test, and a table without FFmpeg, show the same subtitles at the same times.
import { Player as Decoder, LOOP, STOP } from 'zinc:video';
import { Project, Media } from './project';
import { Cue, cuesOf } from './narration';
import { files } from './files';

/** The decoders opened so far, by file: a clip is opened once, and shows on one card at a time.
 *  ponytail: zinc:video runs 16 players at most; a project of more films has to close the ones of the sequences it left. */
const decoders = new Map<string, Decoder>();

export class Film {
  readonly media: Media;
  /** Seconds into the film. */
  t = 0;
  /** It was started, and has neither ended nor been stopped. */
  on = false;
  /** A touch has paused it. */
  paused = false;
  /** The subtitle on the card at the last frame. */
  cue = '';
  private cues: Cue[] = [];
  private project: Project;
  private decoder: Decoder | null = null;
  /** The size of the picture the film is decoded into: the poster's, which the card shows it in. */
  private w: i32;
  private h: i32;

  constructor(project: Project, media: Media, lang: string, w: i32, h: i32) {
    this.project = project; this.media = media; this.w = w; this.h = h;
    this.setLanguage(lang);
  }

  /** The subtitles in another language: what is said at this moment of the film changes with them. */
  setLanguage(lang: string): void { this.cues = cuesOf(this.project, this.media, lang); }

  /** Seconds the film lasts: what its decoder says, else the end of its subtitles, else ten seconds. */
  get length(): number {
    const d = this.decoder, n = this.cues.length;
    if (d !== null && d.decoder !== 'sim' && d.duration > 0) return d.duration;
    return n > 0 ? this.cues[n - 1].to : 10;
  }
  /** The film's picture now, an image, or -1 when nothing decodes it or it does not play: the card then shows the poster. */
  get image(): i32 {
    const d = this.decoder;
    return this.on && d !== null && d.decoder !== 'sim' && d.frames > 0 ? d.image : -1;
  }

  /** Starts the film from its beginning. A clip that is missing or cannot be read plays as its poster and its subtitles. */
  play(): void {
    const file = this.media.file;
    let d = decoders.get(file) ?? null;
    if (d === null && files.exists(file)) {
      d = new Decoder(this.w, this.h);
      d.add(files.onDisk(file));
      decoders.set(file, d);
    }
    if (d !== null) { d.stop(); d.repeat = this.media.loop ? LOOP : STOP; d.play(); }
    this.decoder = d;
    this.t = 0; this.on = true; this.paused = false;
  }
  pause(on: boolean): void {
    if (!this.on) return;
    this.paused = on;
    this.decoder?.pause(on);
  }
  /** Stops the film: its card shows the poster again. */
  stop(): void {
    this.decoder?.stop();
    this.on = false; this.paused = false; this.t = 0; this.cue = '';
  }

  /** One frame of a film that plays; true when it has just ended (a film that loops never does). */
  update(dt: number): boolean {
    if (!this.on || this.paused) return false;
    const d = this.decoder;
    if (d !== null && d.decoder !== 'sim') {
      this.t = d.position;
      if (d.playing) return false;
    } else {
      this.t += dt;
      if (this.t < this.length) return false;
      if (this.media.loop) { this.t -= this.length; return false; }
    }
    this.stop();
    return true;
  }

  /** What the film says now ('' between two sentences). */
  said(): string {
    if (this.on) for (const c of this.cues) if (this.t >= c.from && this.t < c.to) return c.text;
    return '';
  }
}
