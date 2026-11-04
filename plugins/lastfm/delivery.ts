import * as fs from 'zinc:fs';
import { Lastfm, ApiError } from './lastfm';
import { Store, atomic } from './store';
import { Track } from './tracker';

/** Says an error once, until it changes. */
export class ErrorLog {
  lastError: string = '';

  error(message: string): void {
    if (message !== this.lastError) console.error(message);
    this.lastError = message;
  }
}

/** Authorize Last.fm and drain the saved outbox without blocking Sonos monitoring. */
export class LastfmDelivery {
  api: Lastfm;
  store: Store;
  log: ErrorLog;
  retryAt: number = 0;
  backoff: number = 5;
  authToken: string = '';
  tokenExpires: number = 0;
  nextAuthAttempt: number = 0;
  nowPlaying: Track | null = null;
  /** When another scrobbler may have the same account (Spotify's link to Last.fm): the seconds after a song's end left to it, then
   *  the song goes only if Last.fm does not have it. Last.fm has no way to take a scrobble back, so waiting is the only way. 0: no check. */
  holdSeconds: number = 0;

  constructor(api: Lastfm, store: Store, log: ErrorLog, sessionKey: string) {
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
    if (this.holdSeconds > 0) {
      if (now < scrobble.timestamp + scrobble.duration + this.holdSeconds) return;
      try {
        // ponytail: the same song played twice in a row can lose its second listen if the other scrobbler dates it at the end of the first
        if (this.api.account !== '' && await this.api.heardSince(scrobble, scrobble.timestamp - 60, now)) {
          this.store.pending.shift();
          this.store.save();
          console.log('Already on Last.fm: ' + scrobble.artist + ' - ' + scrobble.title);
          return;
        }
      } catch (error) {
        // a history refused for good (hidden by the account) must not hold the listens forever: they go unchecked
        if (!(error instanceof ApiError) || error.code === 0 || error.code === 11 || error.code === 16 || error.code === 29) {
          this.log.error('Last.fm unavailable; queued listens retained');
          this.retryAt = now + this.backoff;
          this.backoff = Math.min(this.backoff * 2, 900);
          return;
        }
      }
    }
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
