import * as fs from 'zinc:fs';
import { Listen, Scrobble, entry } from './tracker';

export function atomic(path: string, text: string): void {
  const temporary = path + '.tmp';
  fs.writeText(temporary, text);
  fs.chmod(temporary, 0o600);
  fs.rename(temporary, path);
}

export class Store {
  dir: string;
  listens: Listen[] = [];
  pending: Scrobble[] = [];
  rejected: Scrobble[] = [];
  sent: number = 0;

  constructor(dir: string) {
    this.dir = dir;
  }

  load(): void {
    if (!fs.mkdir(this.dir, true)) throw new Error('Cannot create data directory');
    fs.chmod(this.dir, 0o700);
    const path = this.dir + '/state.json';
    if (!fs.exists(path)) return;

    // Refuse damaged state instead of overwriting listening history.
    const saved = JSON.parse(fs.readText(path));
    if (saved.version !== 1 || !Array.isArray(saved.pending) || !Array.isArray(saved.rejected) ||
        !Array.isArray(saved.listens) || typeof saved.sent !== 'number' ||
        !Number.isInteger(Number(saved.sent)) || Number(saved.sent) < 0) {
      throw new Error('Invalid state.json; restore a backup');
    }
    this.sent = Number(saved.sent);
    for (const raw of saved.pending) this.pending.push(this.readEntry(JSON.stringify(raw)));
    for (const raw of saved.rejected) this.rejected.push(this.readEntry(JSON.stringify(raw)));
    for (const raw of saved.listens) this.listens.push(this.readListen(JSON.stringify(raw)));
  }

  readListen(raw: string): Listen {
    const saved = JSON.parse(raw);
    if (typeof saved.group !== 'string' || typeof saved.started !== 'number' ||
        typeof saved.heard !== 'number' || typeof saved.queued !== 'boolean' ||
        saved.track === undefined || saved.track === null ||
        typeof saved.track.artist !== 'string' || typeof saved.track.title !== 'string' ||
        typeof saved.track.album !== 'string' || typeof saved.track.uri !== 'string' ||
        typeof saved.track.duration !== 'number' || typeof saved.track.position !== 'number') {
      throw new Error('Invalid saved listening session');
    }

    const listen = new Listen();
    listen.group = ('' + (saved.group));
    listen.started = Number(saved.started);
    listen.heard = Number(saved.heard);
    listen.queued = saved.queued === true;
    listen.track.artist = ('' + (saved.track.artist));
    listen.track.title = ('' + (saved.track.title));
    listen.track.album = ('' + (saved.track.album));
    listen.track.uri = ('' + (saved.track.uri));
    listen.track.duration = Number(saved.track.duration);
    listen.track.position = Number(saved.track.position);

    if (!Number.isFinite(listen.started) || !Number.isFinite(listen.heard) || listen.heard < 0 ||
        !Number.isFinite(listen.track.duration) || !Number.isFinite(listen.track.position)) {
      throw new Error('Invalid saved listening session');
    }
    // Restore progress without counting the time the server was stopped.
    listen.sampled = -1;
    return listen;
  }

  readEntry(raw: string): Scrobble {
    const saved = JSON.parse(raw);
    if (typeof saved.id !== 'string' || typeof saved.artist !== 'string' ||
        typeof saved.title !== 'string' || typeof saved.album !== 'string' ||
        typeof saved.timestamp !== 'number' || typeof saved.duration !== 'number' ||
        !Number.isFinite(Number(saved.timestamp)) || !Number.isFinite(Number(saved.duration)) ||
        Number(saved.timestamp) <= 0 || Number(saved.duration) <= 30) {
      throw new Error('Invalid saved scrobble');
    }

    const scrobble = new Scrobble();
    scrobble.id = ('' + (saved.id));
    scrobble.artist = ('' + (saved.artist));
    scrobble.title = ('' + (saved.title));
    scrobble.album = ('' + (saved.album));
    scrobble.timestamp = Number(saved.timestamp);
    scrobble.duration = Number(saved.duration);
    scrobble.error = typeof saved.error === 'string' ? ('' + (saved.error)) : '';
    return scrobble;
  }

  save(): void {
    atomic(this.dir + '/state.json', JSON.stringify({
      version: 1,
      sent: this.sent,
      listens: this.listens,
      pending: this.pending,
      rejected: this.rejected,
    }));
  }

  listen(group: string): Listen {
    for (const listen of this.listens) if (listen.group === group) return listen;
    const listen = new Listen();
    listen.group = group;
    this.listens.push(listen);
    return listen;
  }

  deliveryStatus(listen: Listen): string {
    if (!listen.queued) return '';
    const id = entry(listen).id;
    for (const scrobble of this.pending) if (scrobble.id === id) return 'Last.fm: queued for delivery';
    for (const scrobble of this.rejected) if (scrobble.id === id) return 'Last.fm: ' + scrobble.error;
    return 'Last.fm: scrobbled';
  }

  enqueue(scrobble: Scrobble): void {
    if (!this.pending.some((pending: Scrobble) => pending.id === scrobble.id)) {
      this.pending.push(scrobble);
    }
  }
}
