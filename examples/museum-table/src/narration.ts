// The narration of a sequence: one clip per language, played through zinc:audio, and its subtitles. The subtitles are the timed cues of
// the medium's WebVTT file, or without one the sentences of its transcript at a reading pace. The cues also say how long the narration
// lasts, so a run without sound (a test, a table without speakers) shows the same subtitles at the same times.
import { load, decode, Sound } from 'zinc:audio';
import { Project, Media } from './project';
import { files } from './files';

/** Characters read per second when nothing times the transcript (what tools/narration.sh --no-voice assumes). */
const PACE = 15;

export class Cue {
  from = 0;
  to = 0;
  text = '';
}

/** Seconds of a WebVTT time: `mm:ss.mmm` or `hh:mm:ss.mmm`. */
function seconds(stamp: string): number {
  let t = 0;
  for (const part of stamp.trim().split(':')) t = t * 60 + parseFloat(part);
  return t;
}

/** The cues of a WebVTT text. Settings after the times, notes, styles and cue names are skipped. */
export function parseVtt(vtt: string): Cue[] {
  const cues: Cue[] = [], lines = vtt.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const arrow = lines[i].indexOf('-->');
    if (arrow < 0) continue;
    const c = new Cue(), text: string[] = [];
    c.from = seconds(lines[i].slice(0, arrow));
    c.to = seconds(lines[i].slice(arrow + 3).trim().split(' ')[0]);
    while (i + 1 < lines.length && lines[i + 1].trim().length > 0) text.push(lines[++i].trim());
    c.text = text.join(' ');
    cues.push(c);
  }
  return cues;
}

/** A transcript cut into sentences, each shown for the time it takes to read. */
export function paceCues(transcript: string): Cue[] {
  const cues: Cue[] = [];
  let start = 0, at = 0;
  for (let i = 0; i < transcript.length; i++) {
    const ch = transcript.charAt(i), last = i === transcript.length - 1;
    if (!last && !((ch === '.' || ch === '!' || ch === '?') && transcript.charAt(i + 1) === ' ')) continue;
    const c = new Cue();
    c.text = transcript.slice(start, i + 1).trim();
    c.from = at; c.to = at + c.text.length / PACE;
    if (c.text.length > 0) { cues.push(c); at = c.to; }
    start = i + 1;
  }
  return cues;
}

/** The sounds loaded so far, by file: a clip is decoded once. */
const sounds = new Map<string, Sound>();

export class Narration {
  /** The clip of this language, in the assets. */
  readonly file: string;
  readonly cues: Cue[];
  /** Seconds it lasts, as its cues say. */
  readonly length: number;
  private sound: Sound | null = null;

  constructor(project: Project, medium: Media, lang: string) {
    this.file = medium.file.replaceAll('{lang}', lang);
    const vtt = medium.subtitles.replaceAll('{lang}', lang);
    this.cues = vtt.length > 0 && files.exists(vtt) ? parseVtt(files.text(vtt)) : paceCues(project.say(medium.transcript, lang));
    this.length = this.cues.length > 0 ? this.cues[this.cues.length - 1].to : 0;
  }

  /** Starts the clip from its beginning. A missing or unreadable clip is silent: zinc:audio warns once, the subtitles go on. */
  play(): void {
    if (this.file.length === 0) return;   // nothing was recorded: the subtitles alone
    const name = files.path(this.file);
    let s = sounds.get(name) ?? null;
    if (s === null) { s = files.exists(this.file) ? decode(files.bytes(this.file), this.file) : load(this.file); sounds.set(name, s); }   // load: the warning of a missing clip
    s.stop();
    s.play();
    this.sound = s;
  }
  stop(): void {
    this.sound?.stop();
    this.sound = null;
  }

  /** What is being said `t` seconds into the narration ('' between two sentences and after the last). */
  at(t: number): string {
    for (const c of this.cues) if (t >= c.from && t < c.to) return c.text;
    return '';
  }
}
