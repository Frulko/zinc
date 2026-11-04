import { Store } from './store';

export class Track {
  artist: string = '';
  title: string = '';
  album: string = '';
  uri: string = '';
  duration: number = 0;
  position: number = 0;
  playing: boolean = false;

  key(): string {
    return JSON.stringify([this.uri, this.artist, this.title, this.album]);
  }
}

export class Listen {
  group: string = '';
  track: Track = new Track();
  started: number = 0;
  heard: number = 0;
  sampled: number = 0;
  queued: boolean = false;
}

export class Scrobble {
  id: string = '';
  artist: string = '';
  title: string = '';
  album: string = '';
  duration: number = 0;
  timestamp: number = 0;
  error: string = '';
}

export function eligible(listen: Listen): boolean {
  const track = listen.track;
  return !listen.queued && track.artist.trim() !== '' && track.title.trim() !== '' &&
    track.duration > 30 && listen.heard >= Math.min(track.duration / 2, 240);
}

/** Count observed playback only: seeks and server downtime earn no listening time. */
export function observe(listen: Listen, track: Track, now: number, interval: number): void {
  const previous = listen.track;
  const elapsed = now - listen.sampled;
  const advance = track.position - previous.position;
  const repeated = previous.duration > 30 && previous.position >= previous.duration - interval * 2 &&
    track.position <= interval * 2 && advance < -interval;

  if (listen.sampled === 0 || previous.key() !== track.key() || repeated) {
    listen.started = Math.floor(now);
    listen.heard = 0;
    listen.queued = false;
  } else if (previous.playing && track.playing && elapsed > 0 && elapsed <= interval * 3 &&
      advance >= 0 && advance <= elapsed + 2) {
    listen.heard += Math.min(elapsed, advance);
  }
  listen.track = track;
  listen.sampled = now;
}

export function entry(listen: Listen): Scrobble {
  const scrobble = new Scrobble();
  scrobble.id = JSON.stringify([listen.group, listen.started.toString(), listen.track.key()]);
  scrobble.artist = listen.track.artist;
  scrobble.title = listen.track.title;
  scrobble.album = listen.track.album;
  scrobble.timestamp = listen.started;
  scrobble.duration = listen.track.duration;
  return scrobble;
}

/** One reading of a group: counts the listen and queues it once eligible. True when a new song began (now playing). */
export function record(store: Store, group: string, track: Track, now: number, interval: number): boolean {
  const listen = store.listen(group);
  if (!Number.isFinite(track.duration) || !Number.isFinite(track.position) || track.duration <= 0 || track.position < 0) {
    listen.track = track;
    listen.track.playing = false;
    return false;
  }
  const previous = listen.track.key();
  observe(listen, track, now, interval);
  if (eligible(listen)) {
    store.enqueue(entry(listen));
    listen.queued = true;
    store.save();
    console.log('Queued: ' + track.artist + ' - ' + track.title);
  }
  return track.playing && previous !== track.key() && track.artist !== '' && track.title !== '';
}
