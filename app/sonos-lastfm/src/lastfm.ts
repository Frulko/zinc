import { fetch } from 'zinc:net';
import { subtle } from 'zinc:subtle';
import { utf8Encode } from 'zinc:sys';
import { toHex, URLSearchParams } from 'zinc:web';
import { Scrobble, Track } from './tracker';

export class ApiError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export async function signature(params: Map<string, string>, secret: string): Promise<string> {
  const names: string[] = [];
  params.forEach((value: string, name: string) => {
    if (name !== 'format' && name !== 'callback' && name !== 'api_sig') names.push(name);
  });
  names.sort();

  let payload = '';
  for (const name of names) payload += name + params.get(name)!;
  return toHex(await subtle.digest('MD5', utf8Encode(payload + secret)));
}

/** Last.fm protocol only. Session persistence and retry policy live in delivery.ts. */
export class Lastfm {
  key: string;
  secret: string;
  session: string = '';
  endpoint: string;

  constructor(key: string, secret: string, endpoint: string = 'https://ws.audioscrobbler.com/2.0/') {
    this.key = key;
    this.secret = secret;
    this.endpoint = endpoint;
  }

  async call(method: string, params: Map<string, string>): Promise<string> {
    params.set('method', method);
    params.set('api_key', this.key);
    if (this.session !== '') params.set('sk', this.session);
    params.set('api_sig', await signature(params, this.secret));
    params.set('format', 'json');

    const form = new URLSearchParams();
    params.forEach((value: string, name: string) => { form.set(name, value); });
    const response = await fetch(this.endpoint, {
      method: 'POST',
      body: form.toString(),
      contentType: 'application/x-www-form-urlencoded',
      timeoutMs: 10000,
      maxBytes: 256 * 1024,
    });
    const text = await response.text();

    // Last.fm also returns useful API errors under HTTP 403 (e.g. approval pending).
    try {
      const result = JSON.parse(text);
      if (result.error !== undefined) {
        throw new ApiError(Number(result.error), 'Last.fm API ' + String(result.error));
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, response.ok ? 'Invalid Last.fm JSON response' : 'Last.fm HTTP ' + response.status.toString());
    }
    if (!response.ok) throw new ApiError(0, 'Last.fm HTTP ' + response.status.toString());
    return text;
  }

  async token(): Promise<string> {
    const result = JSON.parse(await this.call('auth.getToken', new Map<string, string>()));
    if (typeof result.token !== 'string' || result.token.length === 0) {
      throw new Error('Missing Last.fm auth token');
    }
    return String(result.token);
  }

  async authorize(token: string): Promise<string> {
    const params = new Map<string, string>();
    params.set('token', token);
    const result = JSON.parse(await this.call('auth.getSession', params));
    if (result.session === undefined || typeof result.session.key !== 'string' || result.session.key.length === 0) {
      throw new Error('Missing Last.fm session');
    }
    return String(result.session.key);
  }

  async scrobble(scrobble: Scrobble): Promise<string> {
    const params = new Map<string, string>();
    params.set('artist', scrobble.artist);
    params.set('track', scrobble.title);
    params.set('album', scrobble.album);
    params.set('timestamp', scrobble.timestamp.toString());
    params.set('duration', Math.floor(scrobble.duration).toString());

    const result = JSON.parse(await this.call('track.scrobble', params));
    if (result.scrobbles === undefined || result.scrobbles['@attr'] === undefined) {
      throw new Error('Invalid Last.fm scrobble response');
    }
    const counts = result.scrobbles['@attr'];
    if (String(counts.accepted) === '1' && String(counts.ignored) === '0') return '';
    if (String(counts.ignored) !== '1' || result.scrobbles.scrobble === undefined) {
      throw new Error('Invalid Last.fm acceptance count');
    }
    const ignored = result.scrobbles.scrobble.ignoredMessage;
    if (ignored === undefined || ignored.code === undefined) {
      throw new Error('Missing Last.fm ignored reason');
    }
    if (String(ignored.code) === '4' || String(ignored.code) === '5') {
      throw new ApiError(29, 'Last.fm timestamp or daily limit; retry later');
    }
    return 'Last.fm ignored code ' + String(ignored.code);
  }

  async nowPlaying(track: Track): Promise<void> {
    const params = new Map<string, string>();
    params.set('artist', track.artist);
    params.set('track', track.title);
    params.set('album', track.album);
    await this.call('track.updateNowPlaying', params);
  }
}
