// The sounds of a table, played (zinc:audio). Every sound the table file names is loaded once: a recorded file of the
// table's folder, or a generated tone. Then, each frame, update() plays what the game asked for since the last one
// (Game.cues: an element's event and the sound the table names for it), moves the rolling sound with the ball and
// changes the music with the state of the game. Volume and pitch vary from one play to the next as the sound says,
// by a generator that gives the same numbers on every run: a scripted game has one sound log. Nothing here names a
// sound: another table plays other ones. Without an audio output (a headless or deterministic run) zinc:audio plays
// nothing and every call still works.
import { Sound, Wave, decode, tone, stopAll, backend } from 'zinc:audio';
import { Table, TableDef, SoundDef } from './format/table';
import { Game, Phase } from './game';

class Loaded {
  def: SoundDef; sound: Sound;
  constructor(def: SoundDef, sound: Sound) { this.def = def; this.sound = sound; }
}

/** How far to the sides the table's width spreads between the two speakers: 1 would put its edges in one ear. */
const STEREO = 0.6;
/** Seconds the music of a state takes to fade out under the next one. */
const FADE = 0.4;

export class TableAudio {
  /** With `logging`: one line per sound played, "time from: sound vol v rate r pan p", and one per change of music. */
  log: string[] = [];
  logging: boolean = false;
  private t: TableDef;
  private sounds: Map<string, Loaded> = new Map<string, Loaded>();
  private seed: number = 48271;
  private last: number = 0;
  // the music of the state the game is in, and the one that fades out
  private state: string = '';
  private music: Loaded | null = null;
  private fading: Loaded | null = null;
  private fade: number = 0;
  // the ball rolling
  private roll: Loaded | null = null;
  private rollLevel: number = 0;
  private rollOn: boolean = false;
  private rollLogAt: number = 0;

  constructor(table: Table) {
    const t = table.def, src = table.source;
    this.t = t;
    for (const d of t.sounds) {
      if (d.file === '') this.sounds.set(d.id, new Loaded(d, tone(d.hz, d.seconds, d.wave as Wave)));
      else if (src !== null && src.has(d.file)) this.sounds.set(d.id, new Loaded(d, decode(src.bytes(d.file), d.file)));
      else console.warn(`pinball3d: the sound "${d.id}" names the file ${d.file}, which is not in the table's folder: it stays silent`);
    }
    const roll = this.sounds.get(t.physics.ball.sounds.roll);
    if (roll !== undefined) this.roll = roll;
  }

  /** A number from -by to by, the same sequence on every run. */
  private spread(by: number): number {
    if (by === 0) return 0;
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed / 2147483647 * 2 - 1) * by;
  }
  private note(at: number, what: string): void { if (this.logging) this.log.push(`${at.toFixed(3)} ${what}`); }

  /** Once a frame: plays what the game asked for since the last call, then the rolling sound and the music. */
  update(game: Game): void {
    const dt = Math.max(0, Math.min(0.1, game.clock - this.last)), now = game.rules.now;
    this.last = game.clock;
    const played: string[] = [];
    for (const c of game.cues) {
      // the same sound twice in a frame would only be the same samples, louder
      if (played.indexOf(c.sound) >= 0) continue;
      played.push(c.sound);
      this.play(c.at, c.from, c.sound, c.gain, c.pan);
    }
    game.cues = [];
    this.rolling(game, dt, now);
    this.musicOf(game, dt, now);
  }

  private play(at: number, from: string, name: string, gain: number, pan: number): boolean {
    const l = this.sounds.get(name);
    if (l === undefined) return false;
    const d = l.def, vol = d.volume * gain * (1 + this.spread(d.volumeVariation)), rate = d.pitch * (1 + this.spread(d.pitchVariation));
    l.sound.volume = vol; l.sound.rate = rate; l.sound.pan = pan * STEREO; l.sound.loop = d.loop;
    l.sound.play();
    this.note(at, `${from}: ${name} vol ${vol.toFixed(2)} rate ${rate.toFixed(2)} pan ${(pan * STEREO).toFixed(2)}`);
    return l.sound.ok;
  }
  /** Plays a sound of the table once, as an event of the game would (its volume and its pitch varied): an editor's
   *  preview. False when the table has no such sound, or its file could not be read as sound. */
  preview(name: string): boolean { return this.play(0, 'preview', name, 1, 0); }
  /** How long a sound of the table lasts, in seconds; 0 when there is none, or without an audio engine (a deterministic run). */
  seconds(name: string): number { const l = this.sounds.get(name); return l === undefined ? 0 : l.sound.duration; }
  /** The audio output and what was loaded, for a line of a log: "Core Audio: 42 sounds", "null: 42 sounds, 1 unreadable". */
  describe(): string {
    let n = 0, bad = 0;
    for (const d of this.t.sounds) { const l = this.sounds.get(d.id); if (l !== undefined && l.sound.ok) n++; else bad++; }
    return `${backend()}: ${n} sounds${bad > 0 ? `, ${bad} unreadable` : ''}`;
  }

  /** The ball rolling: one looped sound, louder and higher as the fastest ball that rolls goes faster. */
  private rolling(game: Game, dt: number, now: number): void {
    const l = this.roll;
    if (l === null) return;
    // its full voice at four tenths of the fastest a ball may go; the ear follows a little behind, so a ball that
    // stops dead or leaves the board does not click
    const want = Math.min(1, game.rolling / (0.4 * this.t.physics.maxSpeed));
    this.rollLevel += (want - this.rollLevel) * Math.min(1, dt * 14);
    // it starts a little above the level it stops at: a ball that creeps does not switch it on and off
    if (this.rollLevel < (this.rollOn ? 0.02 : 0.06)) {
      if (this.rollOn) { l.sound.stop(); this.rollOn = false; this.note(now, `ball roll: ${l.def.id} stops`); }
      return;
    }
    const vol = l.def.volume * this.rollLevel, pan = game.rollingPan * STEREO;
    // a voice that starts at a rate of exactly 1 would keep it (zinc:audio mixes it sample for sample)
    let rate = l.def.pitch * (0.7 + 0.6 * this.rollLevel);
    if (rate === 1) rate = 1.001;
    l.sound.volume = vol; l.sound.rate = rate; l.sound.pan = pan;
    if (!this.rollOn) { l.sound.loop = true; l.sound.play(); this.rollOn = true; this.rollLogAt = now; }
    if (now >= this.rollLogAt) {
      this.rollLogAt = now + 0.5;
      this.note(now, `ball roll: ${l.def.id} vol ${vol.toFixed(2)} rate ${rate.toFixed(2)} pan ${pan.toFixed(2)}`);
    }
  }

  /** The music of the state the game is in; the one before fades out under it. */
  private musicOf(game: Game, dt: number, now: number): void {
    const m = this.t.music;
    const state = game.phase === Phase.Attract ? 'attract' : game.phase === Phase.Over ? 'gameOver' : game.rules.multiball ? 'multiball' : 'play';
    if (state !== this.state) {
      this.state = state;
      const name = state === 'attract' ? m.attract : state === 'gameOver' ? m.gameOver : state === 'multiball' ? m.multiball : m.play;
      const next = this.sounds.get(name);
      if (next === undefined || next !== this.music) {
        if (this.fading !== null) this.fading.sound.stop();
        this.fading = this.music; this.fade = 1;
        this.music = next === undefined ? null : next;
        if (next !== undefined) {
          next.sound.volume = next.def.volume; next.sound.rate = next.def.pitch; next.sound.pan = 0; next.sound.loop = next.def.loop;
          next.sound.play();
        }
      }
      this.note(now, `music ${state}: ${next === undefined ? 'none' : name}`);
    }
    const f = this.fading;
    if (f === null) return;
    this.fade -= dt / FADE;
    if (this.fade > 0) f.sound.volume = f.def.volume * this.fade;
    else { f.sound.stop(); this.fading = null; }
  }

  /** Silence: an editor that leaves its test play, a table that is closed. */
  stop(): void {
    stopAll();
    this.music = null; this.fading = null; this.state = ''; this.rollOn = false; this.rollLevel = 0;
  }
}
