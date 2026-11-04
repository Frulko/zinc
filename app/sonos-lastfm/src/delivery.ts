import * as fs from 'zinc:fs';
import { Lastfm, ApiError } from './lastfm';
import { Store, atomic } from './store';
import { Track } from './tracker';
import { Log } from './log';

/** Authorize Last.fm and drain the saved outbox without blocking Sonos monitoring. */
export class LastfmDelivery {
  api: Lastfm;
  store: Store;
  log: Log;
  retryAt: number = 0;
  backoff: number = 5;
  authToken: string = '';
  tokenExpires: number = 0;
  nextAuthAttempt: number = 0;
  nowPlaying: Track | null = null;

  constructor(api: Lastfm, store: Store, log: Log, sessionKey: string) {
    this.api = api;
    this.store = store;
    this.log = log;
    this.api.session = sessionKey;
    const sessionFile = store.dir + '/session.key';
    if (this.api.session === '' && fs.exists(sessionFile)) {
      this.api.session = fs.readText(sessionFile).trim();
    }
  }

  async update(): Promise<void> {
    const now = Date.now() / 1000;
    try {
      await this.authorize(now);
    } catch (error) {
      this.log.error('Last.fm authorization: ' + error.message + '; will retry');
    }

    await this.sendOldest(now);
    if (this.nowPlaying === null || this.api.session === '' || now < this.retryAt) return;

    const track = this.nowPlaying;
    this.nowPlaying = null;
    try {
      await this.api.nowPlaying(track);
      console.log('Last.fm now playing: ' + track.artist + ' - ' + track.title);
    } catch (error) {
      this.log.error('Last.fm now-playing unavailable');
    }
  }

  async authorize(now: number): Promise<void> {
    if (this.api.session !== '' || now < this.nextAuthAttempt) return;
    this.nextAuthAttempt = now + 10;

    if (this.authToken === '' || now >= this.tokenExpires) {
      this.authToken = await this.api.token();
      this.tokenExpires = now + 3500;
      console.log('Authorize Last.fm: https://www.last.fm/api/auth/?api_key=' +
        encodeURIComponent(this.api.key) + '&token=' + encodeURIComponent(this.authToken));
      return;
    }

    try {
      const session = await this.api.authorize(this.authToken);
      atomic(this.store.dir + '/session.key', session + '\n');
      this.api.session = session;
      this.authToken = '';
      console.log('Last.fm authorized');
    } catch (error) {
      if (error instanceof ApiError && (error.code === 14 || error.code === 15)) return;
      throw error;
    }
  }

  async sendOldest(now: number): Promise<void> {
    if (this.api.session === '' || this.store.pending.length === 0 || now < this.retryAt) return;

    const scrobble = this.store.pending[0];
    let rejection = '';
    try {
      rejection = await this.api.scrobble(scrobble);
    } catch (error) {
      if (error instanceof ApiError && error.code === 6) {
        scrobble.error = 'Last.fm invalid scrobble parameters';
        this.store.rejected.push(scrobble);
        this.store.pending.shift();
        this.store.save();
        return;
      }
      if (error instanceof ApiError && error.code === 9) {
        this.api.session = '';
        this.authToken = '';
        fs.remove(this.store.dir + '/session.key');
        this.log.error('Last.fm session revoked; reauthorization required');
      } else {
        this.log.error('Last.fm unavailable; queued listens retained');
      }
      this.retryAt = now + this.backoff;
      this.backoff = Math.min(this.backoff * 2, 900);
      return;
    }

    if (rejection !== '') {
      scrobble.error = rejection;
      this.store.rejected.push(scrobble);
    } else {
      this.store.sent++;
    }
    this.store.pending.shift();
    this.store.save();
    this.backoff = 5;
    this.retryAt = 0;
    console.log(rejection === '' ? 'Scrobbled: ' + scrobble.artist + ' - ' + scrobble.title : rejection);
  }
}
