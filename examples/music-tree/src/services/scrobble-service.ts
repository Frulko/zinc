// ============================================================================
// services/scrobble-service.ts — Last.fm from the speakers the app already reads (zinc:lastfm)
// ============================================================================

import * as fs from 'zinc:fs';
import { ErrorLog, Lastfm, LastfmDelivery, Store, Track, atomic, record } from 'zinc:lastfm';
import { Group, System } from 'zinc:sonos';
import { bridge, isBridgeStream, readBridgeIntoGroup } from './airplay-bridge';

const SPOTIFY_LINK_SECONDS = 180;   // the time left to Spotify's own link to Last.fm after a song's end; a guess: raise it if doubles appear
const LONGEST_POLL_SECONDS = 20;   // the active group with the screen off, the other groups always

export class ScrobbleService {
  readonly dir: string;
  store: Store;
  delivery: LastfmDelivery | null = null;
  api: Lastfm | null = null;
  problem: string = '';
  private nowPlaying: Track | null = null;
  private busy: boolean = false;
  private savedAt: number = 0;
  /** Each reading of a group, with Last.fm connected or not: the app's own listening log. */
  onRead: (group: Group) => void = (group: Group): void => {};

  constructor(dir: string) {
    this.dir = dir;
    this.store = new Store(dir);
  }

  /** The private folder: listens, the Last.fm keys, the bridge's token. A damaged one stops the scrobbles, not the app. */
  start(): void {
    try {
      this.store.load();
      const tokenFile = this.dir + '/bridge.token';
      if (fs.exists(tokenFile)) bridge.token = fs.readText(tokenFile).trim();
      const file = this.dir + '/credentials.json';
      if (fs.exists(file)) {
        const saved = JSON.parse(fs.readText(file));
        this.use(('' + (saved.key)), ('' + (saved.secret)), ('' + (saved.account)));
      }
    } catch (error) {
      this.problem = error.message;
      console.error(`music: Last.fm: ${error.message}`);
    }
  }

  private use(key: string, secret: string, account: string): void {
    this.api = new Lastfm(key, secret);
    this.api.account = account;
    this.delivery = new LastfmDelivery(this.api, this.store, new ErrorLog(), '');
    this.delivery.holdSeconds = SPOTIFY_LINK_SECONDS;
  }

  connected(): boolean {
    return this.api !== null && this.api.session !== '';
  }

  account(): string {
    return this.api === null ? '' : this.api.account;
  }

  connect(key: string, secret: string, session: string, account: string): void {
    atomic(this.dir + '/credentials.json', JSON.stringify({ key, secret, account }));
    atomic(this.dir + '/session.key', session + '\n');
    this.use(key, secret, account);
    this.problem = '';
  }

  /** Forgets the account. The listens waiting stay, for the next one. */
  disconnect(): void {
    for (const name of ['/credentials.json', '/session.key']) {
      if (fs.exists(this.dir + name)) fs.remove(this.dir + name);
    }
    this.api = null;
    this.delivery = null;
  }

  saveBridgeToken(token: string): void {
    atomic(this.dir + '/bridge.token', token + '\n');
    bridge.token = token;
  }

  /** One reading of a group, after the app has updated it. */
  note(group: Group, now: number = Date.now() / 1000): void {
    this.onRead(group);
    if (!this.connected()) return;
    const track = new Track();
    track.artist = group.track.artist;
    track.title = group.track.title;
    track.album = group.track.album;
    track.uri = group.track.uri;
    track.duration = group.track.duration;
    track.position = group.track.position;
    track.playing = group.state === 'PLAYING';
    if (record(this.store, group.coordinator.uuid, track, now, LONGEST_POLL_SECONDS)) this.nowPlaying = track;
  }

  /** Every few seconds: sends what waits and reads the groups the app is not showing. */
  async tick(system: System | null, activeGroup: Group | null, readOthers: boolean): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      if (system !== null && readOthers) {
        const house = system as System;
        for (const group of house.groups) {
          if (group === activeGroup) continue;
          try {
            await house.update(group);
            if (isBridgeStream(group)) await readBridgeIntoGroup(group);
            this.note(group);
          } catch (error) {
            this.store.listen(group.coordinator.uuid).track.playing = false;   // a speaker gone must not hold the outbox
          }
        }
        this.store.listens = this.store.listens.filter((listen) =>
          house.groups.some((group: Group) => group.coordinator.uuid === listen.group));
      }
      if (!this.connected()) return;
      const delivery = this.delivery as LastfmDelivery;
      delivery.nowPlaying = this.nowPlaying !== null ? this.nowPlaying : delivery.nowPlaying;
      this.nowPlaying = null;
      if (this.connected()) await delivery.update();   // a revoked session stops here: asking again is for the settings
      const now = Date.now() / 1000;
      if (now - this.savedAt >= 60) {   // ponytail: a crash loses a minute of progress at most; the flash is spared
        this.store.save();
        this.savedAt = now;
      }
    } catch (error) {
      console.error(`music: scrobbling: ${error.message}`);
    } finally {
      this.busy = false;
    }
  }
}
