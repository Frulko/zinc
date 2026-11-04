// ============================================================================
// services/listening-log.ts — Everything heard on the speakers, in a SQLite file
// ============================================================================
// Our own scrobbler: unlike Last.fm's rule it keeps every listen, radios and skipped songs too, with what played it (the mode), where,
// when, and how the tablet was powered. listening-page.ts reads it back as charts.

import * as fs from 'zinc:fs';
import { Group, spotifyRoute } from 'zinc:sonos';
import { Database } from 'zinc:sqlite';
import { device } from 'zinc:sys';
import { bridge } from './airplay-bridge';

const WRITE_EVERY_SECONDS = 30;       // a crash loses this much; the flash is spared the rest
const SHORTEST_SECONDS = 5;           // less is a song passed over while skipping, not a listen
const LONGEST_GAP_SECONDS = 60;       // readings further apart: the app was not looking, nothing is counted
const PAUSE_ENDS_AFTER_SECONDS = 300;

/** What the speakers do not tell: a song Spotify Connect plays. */
export class SeenSong {
  artist: string = '';
  title: string = '';
  duration: number = 0;
}

class Play {
  id: i32 = 0;
  key: string = '';
  started: number = 0;
  sampled: number = 0;
  lastHeard: number = 0;
  written: number = 0;
  heard: number = 0;
  position: number = 0;
  playing: boolean = false;
}

/** The mode of a group: the two ways of Spotify apart, else the source the speakers say. */
export function listeningMode(group: Group): string {
  const route = spotifyRoute(group.media.uri, group.track.uri);
  return route === 'connect' ? 'spotify-connect' : route === 'sonos' ? 'spotify-sonos' : group.track.source;
}

function two(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

export class ListeningLog {
  db: Database | null = null;
  problem: string = '';
  private readonly path: string;
  private readonly plays: Map<string, Play> = new Map<string, Play>();

  constructor(path: string) {
    this.path = path;
  }

  /** A damaged file stops the log, not the app. */
  start(): void {
    try {
      const slash = this.path.lastIndexOf('/');
      if (slash > 0) fs.mkdir(this.path.slice(0, slash), true);
      const db = new Database(this.path);
      db.exec(`PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS plays (
          id INTEGER PRIMARY KEY, started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL, heard REAL NOT NULL, duration REAL NOT NULL,
          artist TEXT NOT NULL, title TEXT NOT NULL, album TEXT NOT NULL, mode TEXT NOT NULL, bridge_mode TEXT NOT NULL, rooms TEXT NOT NULL,
          volume INTEGER NOT NULL, power TEXT NOT NULL, battery INTEGER NOT NULL, screen_on INTEGER NOT NULL,
          day TEXT NOT NULL, hour INTEGER NOT NULL, weekday INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS plays_started ON plays (started_at);`);
      this.db = db;
    } catch (error) {
      this.problem = error.message;
      console.error(`music: listening log: ${error.message}`);
    }
  }

  /** The listens kept, for the settings. */
  count(): i32 {
    if (this.db === null) return 0;
    const row = (this.db as Database).prepare('SELECT count(*) AS n FROM plays').get([]);
    return row === null ? 0 : row.number('n') as i32;
  }

  /** One reading of a group, after the app has updated it. */
  note(group: Group, screenOn: boolean, seen: SeenSong | null = null, now: number = Date.now() / 1000): void {
    if (this.db === null) return;
    try {
      this.read(group, screenOn, seen, now);
    } catch (error) {
      console.error(`music: listening log: ${error.message}`);
    }
  }

  private read(group: Group, screenOn: boolean, seen: SeenSong | null, now: number): void {
    const uuid = group.coordinator.uuid;
    const mode = listeningMode(group);
    const artist = seen !== null ? seen.artist : group.track.artist;
    const title = seen !== null ? seen.title : group.track.title;
    const duration = seen !== null ? seen.duration : group.track.duration;
    const position = group.track.position;
    const key = `${mode}|${artist}|${title}`;
    let play: Play | null = this.plays.get(uuid) ?? null;

    if (play !== null) {
      const again = duration > 30 && play.position >= duration - 40 && position < play.position - 30;   // the same song once more
      const paused = !play.playing && now - play.lastHeard > PAUSE_ENDS_AFTER_SECONDS;
      if (play.key !== key || again || paused) {
        this.plays.delete(uuid);
        play = null;
      }
    }
    if (group.state !== 'PLAYING' || mode === 'none') {
      if (play !== null) play.playing = false;
      return;
    }
    if (play === null) {
      play = new Play();
      play.key = key;
      play.started = now;
      play.sampled = now;
      play.lastHeard = now;
      this.plays.set(uuid, play);
    } else {
      const elapsed = now - play.sampled;
      if (play.playing && elapsed > 0 && elapsed <= LONGEST_GAP_SECONDS) play.heard += elapsed;
      play.sampled = now;
      play.lastHeard = now;
    }
    play.playing = true;
    play.position = position;

    const db = this.db as Database;
    if (play.id === 0) {
      if (play.heard < SHORTEST_SECONDS) return;
      play.id = this.insert(db, play, group, mode, artist, title, duration, screenOn);
      play.written = now;
    } else if (now - play.written >= WRITE_EVERY_SECONDS) {
      db.prepare('UPDATE plays SET ended_at = ?, heard = ?, duration = ? WHERE id = ?').run([Math.floor(now), play.heard, duration, play.id]);
      play.written = now;
    }
  }

  private insert(db: Database, play: Play, group: Group, mode: string, artist: string, title: string, duration: number, screenOn: boolean): i32 {
    let power = '', battery: i32 = -1;
    try {
      const raw = device('battery', '');
      if (raw !== '') {
        const parsed = JSON.parse(raw);
        power = ('' + (parsed.source ?? ''));   // usb, ac, wireless (the Touchstone), none (on battery)
        battery = Math.round((parsed.level as number) * 100) as i32;
      }
    } catch (error) {
      /* no battery on this device */
    }
    const at = new Date(play.started * 1000);
    const day = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;   // the time here, as it was then
    const result = db.prepare(`INSERT INTO plays (started_at, ended_at, heard, duration, artist, title, album, mode, bridge_mode, rooms, volume,
      power, battery, screen_on, day, hour, weekday) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run([
      Math.floor(play.started), Math.floor(play.sampled), play.heard, duration, artist, title, group.track.album, mode,
      mode === 'airplay' && bridge.status !== null ? bridge.status.mode : '', group.name(), group.volume,
      power, battery, screenOn ? 1 : 0, day, at.getHours(), at.getDay(),
    ]);
    return result.lastInsertRowid as i32;
  }
}
