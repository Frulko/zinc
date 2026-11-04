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
