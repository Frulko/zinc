# spotify plugin (`zinc:spotify`)

The Spotify Web API for a remote: the account's playlists, albums, liked songs, recent plays, search, and playback on a
Spotify Connect device. One login on a computer, then the plugin refreshes the access token by itself.

- **No native code.** It is written in Zinc on `fetch` and `zinc:fs`: `plugins/spotify/index.ts`. The one-time login is a
  Python 3 script, `plugins/spotify/login.py` (PKCE, standard library only). It needs the `net` and `process` permissions.
- **Test.** None yet. **Example.** `examples/music` (with [`zinc:sonos`](sonos.md)).
- **Reference.** Endpoints, quotas and token rules: `docs/reports/spotify-web-api.md`.

| target | status |
|---|---|
| macos | supported, verified on x86_64 |
| linux (webOS, armv7-webos, HP TouchPad) | built |
| rpi1, rmpp | in the manifest only, not run |

## One-time login

1. Create an app on `developer.spotify.com/dashboard` with the redirect URI `http://127.0.0.1:8765/callback`.
2. On a computer with a browser: `python3 plugins/spotify/login.py <CLIENT_ID>`. It opens the Spotify consent page,
   receives the answer on port 8765, and writes `{ client_id, refresh_token }` to `$ZINC_HOME/spotify.json` (`~/.zinc`,
   mode 0600), the machine's shared login; a second argument writes another file instead.
3. `new Spotify(file)` reads `file`, or the shared login when `file` does not exist, so every Zinc app of the computer uses
   the one login. A device gets the file beside the app when it is installed (examples/music/install.sh copies it to a
   TouchPad). The device that runs the program needs no browser.

On a computer with a browser the app can do the login itself, with the client id of an earlier login (the file keeps it):
`new Login(sp.clientId, sp.file)` serves the redirect on port 8765, `openUrl(login.url)` (`zinc:system/opener`, the
permission `opener`) opens the consent page, and when `login.status` is `'done'` the file is written: `sp.reload()` reads
it. `status` is `'failed'` with `error` when Spotify refuses, when the port is taken, or after `cancel()`.
`examples/music` does this on macOS (the Spotify page); a tablet keeps the instructions above.

Things to know: since 2026-07-20 a refresh token expires six months after the login, and refreshing does not extend it.
When it does, `problem` becomes `'login expired'`: run the script again. Spotify may rotate the refresh token; the plugin
then rewrites the file. Keep the file private and out of git: it gives access to the account.

```ts
import { Spotify } from 'zinc:spotify';

async function main(): Promise<void> {
  const sp = new Spotify('spotify.json');
  if (!sp.ready()) { console.log(sp.problem); return; }      // 'not logged in', 'unreadable login file', 'login expired'
  console.log('hello', await sp.me());

  const hits = await sp.search('miles davis kind of blue');
  const dev = await sp.device('Salon');                      // a Connect device by name
  if (dev !== null && hits.length > 0) await sp.play(hits[0], dev.id);
}
main();
```

## API

| API | |
|---|---|
| `new Spotify(file)` | The account whose login is in `file`. |
| `ready(): boolean`, `problem: string` | `problem` is '' when usable; otherwise `'not logged in'`, `'unreadable login file'` or `'login expired'`. |
| `call(method, path, body = ''): Promise<any>` | One API call: the parsed answer, null for an empty one (204). Refreshes the token when needed and retries once after a 401. Throws `SpotifyError`. |
| `me(): Promise<string>` | The display name; also sets `userId`. Call it before playing the liked songs. |
| `playlists(offset = 0, limit = 50)`, `albums(...)`, `likedTracks(...)` | A page of each, as `Item[]` (`limit` at most 50; fewer than `limit` items: the last page). |
| `recent()` | Recently played tracks, newest first, each once. |
| `search(q)` | Tracks, playlists, albums and artists, 10 of each (Spotify's limit). |
| `devices(): Promise<Device[]>` | The Connect devices. |
| `device(name): Promise<Device \| null>` | The device with that name (case ignored) and a usable id. |
| `playback(): Promise<Playback>` | The account's playback (`active` is false when nothing is active). |
| `play(item, deviceId)` | Plays a playlist, album or artist from its start; a track inside its context (album or playlist) when it has one; the liked songs when `item.kind` is `'liked'`. |
| `transfer(deviceId, play)` | Moves the playback to a device. |
| `setShuffle(on)`, `setRepeat(mode)`, `queue(uri)` | `mode` is `off`, `track` or `context`. |
| `isLiked(uri)`, `setLiked(uri, liked)` | Whether a track is in the liked songs; add or remove it. |

Data classes:

| class | fields |
|---|---|
| `Item` | `kind` (`track`, `playlist`, `album`, `artist`, `episode`, `liked`), `uri`, `name`, `subtitle` (artists, or a playlist's owner), `art` (about 300 px, or ''), `context` (a track's album or playlist). |
| `Device` | `id`, `name`, `type`, `active`, `restricted`, `volume` (-1 when unknown). |
| `Playback` | `active`, `playing`, `device`, `item`, `progressMs`, `durationMs`, `shuffle`, `repeat`, `context`. |
| `SpotifyError` | An `Error` with `status`, the HTTP status (0 when the account is not usable). |

## Notes

- **Dev Mode limits.** A new app is in Development Mode: the app owner must have Premium, the account must be in the
  app's allowlist (at most five users), and search returns at most 10 results per type. Playback commands need Premium.
  Some endpoints are gone for Dev Mode apps (see the report).
- **Sonos is a restricted device.** Spotify reports many Sonos speakers with `restricted: true` (and no usable `id`),
  and accepts no command for them. Play Spotify content on them with `playSpotify` of
  [`zinc:sonos`](sonos.md) instead; use this plugin for browsing, search and likes.
- **Permissions.** `net` and `process` (see `docs/guide/08-security.md`); the login file is read and rewritten with `zinc:fs`.
