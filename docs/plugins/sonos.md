# sonos plugin (`zinc:sonos`)

Sonos speakers on the local network, through the UPnP API they serve on port 1400: discovery, rooms and groups, what
plays, transport, volume, grouping, favorites, internet radio streams and events (what changed, the moment it changes). No Sonos account and no cloud.

- **No native code.** It is written in Zinc on [`zinc:socket`](socket.md) (SSDP discovery), `fetch` (the SOAP calls) and
  `zinc:xml` (the element tree of `lib/std/xml.ts`, which reads the answers): `plugins/sonos/index.ts`. It needs the `net` and `process` permissions
  and adds nothing to a program that does not import it.
- **Tests.** `tests/t1/sonos_plugin.sh` (every call below, on the interpreter and QuickJS), `tests/t1/music_tree_sonos.sh` and
  `tests/t1/ipod_sonos.sh`, against made-up speakers (`tests/data/sonos/stub_speaker.py`). **Examples.** `examples/music` (a wall
  remote for Sonos and Spotify), `examples/ipod` (plays an iPod's songs on a Sonos group and follows it through `Events`, its song server taking the NOTIFY requests).
- **Reference.** The names follow [SoCo](https://github.com/SoCo/SoCo) (`play_uri`, `add_uri_to_queue`...), in camelCase; what is
  done and what is left is the table of `docs/reports/sonos-soco-parity.md`.
- **Reference.** The protocol side (services, actions, URI shapes) is in `docs/reports/sonos-upnp-api.md`.

| target | status |
|---|---|
| macos | supported, verified on x86_64 against Sonos S2 speakers (firmware 57.23) |
| linux (webOS, armv7-webos, HP TouchPad) | built and installed |
| rpi1, rmpp | in the manifest only, not run |

```ts
import { discover } from 'zinc:sonos';

async function main(): Promise<void> {
  const sys = await discover();                       // SSDP search, then the rooms and groups
  const g = sys.groups[0];
  await sys.update(g);                                // state, track, source, group volume
  console.log(g.name(), g.state, g.track.title, '-', g.track.artist, '(' + g.track.source + ')');

  await sys.setGroupVolume(g, 25);
  await sys.playStream(g, 'http://stream.example.com:8000/live.mp3', 'My radio');
  await sys.pause(g);
}
main();
```

## API

Free functions:

| API | |
|---|---|
| `discover(known = '', waitMs = 2000, port = 0): Promise<System>` | Finds the household. With `known` (the address of a speaker that answered before) it asks that speaker first; otherwise, or if it does not answer, it sends an SSDP search and takes the first speaker that replies. Then it reads the rooms and groups. Throws `Error('no Sonos speaker found')` when nothing answers within `waitMs`. |
| `soap(address, service, path, action, args): Promise<El>` | One UPnP action sent to a speaker (`address`: `'ip'`, port 1400, or `'ip:port'`); returns the answer's element (`u:<action>Response`, a `zinc:xml` `El`: `r.textOf('CurrentVolume')`). Throws `UpnpError` on a fault. The 4 s timeout applies. |
| `UpnpError` | What every call throws on a fault: `code` (the UPnP code: 701 transition not available, 711 illegal seek target, 714 illegal MIME type, 800 only for the coordinator...; 0 when the answer had none), `status` (HTTP), `action`, `description` (the speaker's, else SoCo's table). `message` is `'Next: UPnP 701 (Transition not available)'`. |
| `artUri(address, art)`, `hostPort(address)`, `playModeOf(shuffle, repeat)` | A cover's absolute URL; `'ip:port'` with the default port; the play mode for a shuffle and `'none'`, `'all'` or `'one'`. |
| `sourceOf(uri): string` | The kind of source a transport URI names (see Source kinds). |
| `serviceId(sys, name): Promise<i32>` | The id of a music service in this household (`'Spotify'`: 9 or 12 depending on the region), -1 when it is not offered. |
| `accountOf(sys, sid): Promise<i32>` | The account number (`sn`) of a service, read from a Sonos favorite saved from that service, or -1. |
| `musicTrackMeta(song): string` | The DIDL of a `Song` (an `object.item.audioItem.musicTrack`, as SoCo's `DidlMusicTrack` writes it), for `playUri` and `addUriToQueue`. |
| `playSpotify(sys, g, uri, title, sid, sn): Promise<void>` | Plays a Spotify URI on a group through the speakers' own Spotify service, as the Sonos app does. `uri` is `spotify:playlist:`, `:album:`, `:track:`, `:artist:` (its top tracks) or `spotify:user:<id>:collection` (the liked songs). `sid` comes from `serviceId(sys, 'Spotify')`, `sn` from `accountOf` (else 1 for the first account). Everything is queued, even a track. |

`System` (the household, from `discover`; `new System(ip)` then `refresh()` also works):

| API | |
|---|---|
| `sys.speakers`, `sys.allSpeakers`, `sys.groups`, `sys.seed` | The visible rooms, every member with the hidden ones (a stereo pair's second speaker, a sub, satellites, bridges), the groups (sorted by name) and the address of the speaker asked for the topology (`'ip'` or `'ip:port'`: `discover('127.0.0.1:8000')` reaches a stand-in speaker). |
| `speaker(uuid)`, `speakerByName(name)`, `group(id)`, `groupOf(speaker)` | Lookups; null when not found. |
| `refresh(): Promise<void>` | Reads the rooms and groups again. A group that remains keeps its object (track, volume). Throws when no speaker answers. |
| `update(g): Promise<void>` | Reads what a group plays: state and status, track (with its raw DIDL in `track.metadata`), position, source, `media` (the transport URI, its DIDL, the queue's length), allowed actions, play mode, group volume and mute. |
| `readVolumes(g): Promise<void>` | Reads the volume and mute of every room of the group. |
| `play(g)`, `pause(g)`, `stop(g)`, `next(g)`, `previous(g)` | Transport. `pause` sends Stop when the source does not accept Pause (a radio). |
| `endDirectControlSession(g)` | Ends the session a service app holds on the group (Spotify Connect), so Sonos commands take it back. |
| `setShuffle(g, on)`, `setRepeat(g, 'none' \| 'all' \| 'one')`, `getCrossFade(g)`, `setCrossFade(g, on)` | The play mode by its two halves (the other half kept from `g.playMode`), and the cross fade. |
| `seek(g, seconds)` | Seeks in the current track. |
| `setPlayMode(g, mode)` | `NORMAL`, `SHUFFLE_NOREPEAT`, `REPEAT_ALL`, `SHUFFLE` (shuffle and repeat all), `REPEAT_ONE`, `SHUFFLE_REPEAT_ONE`. |
| `setGroupVolume(g, v)` | The whole group's volume, 0..100, the rooms keeping their balance. |
| `setRelativeGroupVolume(g, delta): Promise<i32>`, `getGroupMute(g)`, `setGroupMute(g, muted)` | The group's volume moved by `delta` (returns the new one); the group's mute. |
| `setVolume(speaker, v)`, `setMute(speaker, muted)` | One room. |
| `join(speaker, g)`, `leave(speaker)` (or `unjoin`), `partyMode(speaker)` | Makes a room play with a group (it leaves its own); takes a room out of its group (it plays alone and stops); every other room joins the room's group. |
| `playStream(g, url, name, art = '')` | Plays an internet radio stream on a group; `name` (and `art`) are what every Sonos app shows. |
| `playUri(g, uri, meta = '', title = '', start = true, forceRadio = false)` | Plays a URI on a group (SoCo's `play_uri`): a song file over `http://` with `musicTrackMeta(song)` as `meta`, or any URI a speaker takes. A `title` without `meta` plays it as a station of that name; `forceRadio` rewrites the scheme to `x-rincon-mp3radio`; `start` false only sets it. |
| `addUriToQueue(g, uri, meta = '', position = 0, asNext = false): Promise<i32>` | Adds a URI to the queue (`add_uri_to_queue`): at its end, at `position` (1 for the first), or right after the song that plays. Returns its number in the queue. |
| `clearQueue(g)` | Empties the queue (`clear_queue`). |
| `playFromQueue(g, index, start = true)` | Plays the queue from entry `index`, 0 for the first as SoCo counts (`play_from_queue`); the group then goes through the queue by itself. |
| `favorites(): Promise<Favorite[]>` | The Sonos favorites (as saved in the Sonos app). |
| `playFavorite(g, favorite)` | A stream is played directly; a container (playlist, album) is queued, then played. |

`Events` (UPnP GENA, SoCo's `events.py`):

| API | |
|---|---|
| `new Events(sys, port)` | `port`: the program's HTTP server (`serveAsync`), which hands requests to `handleNotify`; `path` (`'/sonos-events'`) is the CALLBACK's path. |
| `watch(g, timeoutSec = 1800)` | Ends the subscriptions it held and subscribes the group: AVTransport and GroupRenderingControl of the coordinator, RenderingControl of each room, ZoneGroupTopology. The speakers send their whole state at once. |
| `subscribe(speaker, service, timeoutSec = 1800): Promise<Subscription>` | One service: `AVTransport`, `RenderingControl`, `GroupRenderingControl`, `ZoneGroupTopology`, `ContentDirectory`, `AlarmClock`, `DeviceProperties`. Throws `UpnpError` when refused. Renewed by itself; a renewal refused (a speaker restarted) subscribes again. |
| `renew(sub)`, `unsubscribe(sub)`, `close()` | By hand; `close` ends them all. `subs` lists the live ones (`service`, `speaker`, `sid`, `timeout`, `active`). |
| `handleNotify(req): Reply \| null` | A `NOTIFY` under `path`: applied, then answered 200 (412 for an unknown SID; an event older than one applied is dropped); any other request gives null. |
| `onChange((g, e) => void)` | Called after each event, with the group it changed (null for a room's volume or the topology) and the `Event`. |
| `apply(sub, e)` | What `handleNotify` does with an event: state, play mode, actions, `media`, the track (its position kept for the same track) from AVTransport; `volume`, `muted` from GroupRenderingControl and RenderingControl; `sys.applyTopology` from ZoneGroupTopology. |

`parseEvent(service, body): Event` reads a `NOTIFY` body (`Event`: `service`, `sid`, `seq`, `get(name)`, `has(name)`; a LastChange's
variables by name, a channel other than Master after a slash: `Volume/LF`). `localAddressFor(ip)` is this computer's address on the
network of `ip` (SoCo's `get_listen_ip`): the one a speaker can reach for a CALLBACK or a song's URL. `sys.applyTopology(state)`
takes a ZoneGroupState document.

Data classes:

| class | fields |
|---|---|
| `Speaker` | `uuid`, `name`, `ip`, `port` (1400), `coordinator` (uuid of its group's coordinator), `volume` (-1 until read with `readVolumes`), `muted`, `visible`, `bridge`; `address()` is `'ip:port'`. A stereo pair or a home theatre with its satellites is one speaker in `sys.speakers`. |
| `Group` | `id`, `coordinator`, `members` (coordinator first), `state` (`PLAYING`, `PAUSED_PLAYBACK`, `STOPPED`, `TRANSITIONING`), `status`, `track`, `media`, `volume` (-1 until `update`), `muted`, `playMode`, `actions`. Methods: `name()` (`'Salon + Bureau'`), `playing()`, `can(action)`, `shuffle()`, `repeat()`, `isPlayingRadio()`, `isPlayingLineIn()`, `isPlayingTv()`. |
| `Track` | `title`, `artist`, `album`, `art` (absolute URL, or ''), `duration` and `position` in seconds (duration 0 for a radio), `source`, `station`, `uri`, `number` and `count` in the queue, `metadata` (the DIDL). |
| `Media` | `uri`, `meta`, `nrTracks`: what the transport is set to (SoCo's `get_current_media_info`). |
| `Favorite` | `title`, `art`, `uri`, `meta` (the DIDL, sent back as is), `container`. |
| `Song` | A song file over plain HTTP: `url`, `title`, `artist`, `album`, `art` (an absolute URL, or ''), `mime` (`'audio/mpeg'`, `'audio/mp4'`..., `'*'` when unknown), `duration` in seconds. |

## Notes

- **Port 1400.** Every call is an HTTP POST (SOAP) to `http://<speaker>:1400` (the port comes from the topology's
  `Location`, so a stand-in speaker of a test can sit on any port).
- **Events instead of polling.** `Events` subscribes the speakers (UPnP GENA: `SUBSCRIBE` with a `CALLBACK` to this
  computer, renewed at 85% of the time granted, `UNSUBSCRIBE` at the end); each `NOTIFY` updates the `Group` and `Speaker`
  objects. The program serves HTTP once, on any port, and passes each request to `handleNotify`; the speakers must reach that
  port (a firewall that drops it leaves the program on its poll, which stays as a slow fallback). An event carries no
  position: count it locally while `playing()`, and read `update` now and then.

  ```ts
  import { serveAsync } from 'zinc:net';
  let events: Events | null = null;
  const port = serveAsync(0, async (req) => {
    const r = events !== null ? (events as Events).handleNotify(req) : null;
    return r !== null ? r as Reply : myOwnRoutes(req);
  });
  events = new Events(sys, port);
  events.onChange((g, e) => { if (g !== null) show(g.state, g.track.title, g.volume); });
  await events.watch(group);              // AVTransport, GroupRenderingControl, RenderingControl per room, ZoneGroupTopology
  ```
- **Commands go to the group coordinator.** Transport, play mode and group volume use `group.coordinator`; a member of a
  group refuses them. Volume and mute of one room go to that room's own address.
- **Discovery and firewalls.** The SSDP search leaves from a UDP port and the speakers answer to that port. On a device
  with a firewall, pass a fixed port as `discover`'s `port` and open it in the firewall (`0` lets the system choose).
  On webOS an application may not open one (`com.palm.firewall` is not on its bus): `examples/music/helper.sh`, a root
  job, adds the `iptables` rule. `known` skips the search once a speaker's address is saved, which is how a program
  starts fast on the next run.
- **Source kinds** (`track.source`, from `sourceOf`): `spotify` (Spotify Connect), `radio`, `queue` (music queued by a
  Sonos app), `line-in`, `tv`, `airplay`, `stream` (another service) and `none`.
- **Radio streams.** `playStream` rewrites the URL to `x-rincon-mp3radio://`. The stream must be MP3 or AAC over plain
  HTTP; HLS (`.m3u8`) and Ogg are not reliably played that way. For a stream, `track.title` is the station name unless
  the stream announces the current song.
- **Song files.** A computer's own songs play from a plain `http://` URL the speakers can reach: `playUri` or the queue
  (`clearQueue`, `addUriToQueue` per song, `playFromQueue(g, 0)`), each with `musicTrackMeta`. MP3, AAC and ALAC in MP4 (`.m4a`),
  FLAC and WAV play; the server must answer byte ranges (a zinc:net `Reply.file` does), and listen on the LAN, not `127.0.0.1`:
  `serveAsync(0, ...)` returns the free port it took, and `os.networkInterfaces()` gives the address on the speaker's subnet.
  With the queue, the group goes to the next song by itself, and its next and previous work from any Sonos app.

  ```ts
  const s = new Song();
  s.url = 'http://192.168.1.10:51234/f3a9.../file/42'; s.title = 'Song'; s.artist = 'Band'; s.mime = 'audio/mp4';
  await sys.clearQueue(g);
  await sys.addUriToQueue(g, s.url, musicTrackMeta(s));
  await sys.playFromQueue(g, 0);
  ```
- **Spotify.** Spotify's Web API sees many Sonos speakers as restricted devices and takes no playback command for them.
  `playSpotify` starts the content through the speakers' own Spotify service instead, and transport and volume stay on
  Sonos. See [`zinc:spotify`](spotify.md) for the library and login.
- **Permissions.** `net` and `process` (see `docs/guide/08-security.md`).
