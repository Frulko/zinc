# lastfm plugin (`zinc:lastfm`)

Last.fm scrobbling, written in Zinc on `fetch` and `zinc:fs`. It counts what was really heard (seeks and downtime earn nothing), keeps a saved outbox with
retries, and signs the API calls. It reads no player: its host hands it one reading at a time. `app/sonos-lastfm` (its own Sonos polling, a command-line server)
and `examples/music-tree` (the app's Sonos system, keys typed on a phone) both run on it.

```ts
import { Store, Track, Lastfm, LastfmDelivery, ErrorLog, record } from 'zinc:lastfm';

const store = new Store('data');   // state.json in a mode 700 folder; refuses a damaged file rather than overwrite it
store.load();
const api = new Lastfm(key, secret);
const delivery = new LastfmDelivery(api, store, new ErrorLog(), sessionKey);   // '' reads data/session.key

// at each reading of a player; interval: the longest gap between two readings, in seconds
const started = record(store, 'living room', track, Date.now() / 1000, 5);
if (started) delivery.nowPlaying = track;
await delivery.update();           // regularly: sends the oldest waiting listen, retries with a backoff
```

A track without a duration counts for nothing, as Last.fm's rules want: half the song or 4 minutes, songs over 30 s. `Lastfm.authorize(token)` turns an authorized
token into a session key and sets `account`. `atomic(path, text)` writes a file of mode 600 in one step. `update()` also runs the desktop authorization flow while
there is no session, printing the link: a host with its own flow calls it only with a session.

## Two scrobblers on one account

`delivery.holdSeconds` (0 by default): the seconds after a song's end left to another scrobbler on the account, such as Spotify's link to Last.fm. The song then goes only if `user.getRecentTracks` does not have it. Last.fm cannot take a scrobble back, so the waiting is what avoids a double. `examples/music-tree` sets 180.
