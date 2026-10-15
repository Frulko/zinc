# sonos plugin (`zinc:sonos`)

Sonos speakers on the local network, through the UPnP API they serve on port 1400: discovery, rooms and groups, what
plays, transport, volume, grouping, favorites and internet radio streams. No Sonos account and no cloud.

- **No native code.** It is written in Zinc on [`zinc:socket`](socket.md) (SSDP discovery) and `fetch` (the SOAP calls):
  `plugins/sonos/index.ts` and a small XML reader, `plugins/sonos/xml.ts`. It needs the `net` and `process` permissions
  and adds nothing to a program that does not import it.
- **Test.** None yet. **Example.** `examples/music` (a wall remote for Sonos and Spotify).
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
| `soap(ip, service, path, action, args): Promise<string>` | One UPnP action sent to a speaker; returns the answer text. Throws `Error('Action: UPnP 701')` (the UPnP error code, or the HTTP status) on a fault. The 4 s timeout applies. |
| `sourceOf(uri): string` | The kind of source a transport URI names (see Source kinds). |
| `serviceId(sys, name): Promise<i32>` | The id of a music service in this household (`'Spotify'`: 9 or 12 depending on the region), -1 when it is not offered. |
| `accountOf(sys, sid): Promise<i32>` | The account number (`sn`) of a service, read from a Sonos favorite saved from that service, or -1. |
| `playSpotify(sys, g, uri, title, sid, sn): Promise<void>` | Plays a Spotify URI on a group through the speakers' own Spotify service, as the Sonos app does. `uri` is `spotify:playlist:`, `:album:`, `:track:`, `:artist:` (its top tracks) or `spotify:user:<id>:collection` (the liked songs). `sid` comes from `serviceId(sys, 'Spotify')`, `sn` from `accountOf` (else 1 for the first account). Everything is queued, even a track. |

`System` (the household, from `discover`; `new System(ip)` then `refresh()` also works):

| API | |
|---|---|
| `sys.speakers`, `sys.groups`, `sys.seed` | The rooms, the groups (sorted by name) and the address of the speaker asked for the topology. |
| `speaker(uuid)`, `group(id)`, `groupOf(speaker)` | Lookups; null when not found. |
| `refresh(): Promise<void>` | Reads the rooms and groups again. A group that remains keeps its object (track, volume). Throws when no speaker answers. |
| `update(g): Promise<void>` | Reads what a group plays: state, track, position, source, allowed actions, play mode, group volume. |
| `readVolumes(g): Promise<void>` | Reads the volume and mute of every room of the group. |
| `play(g)`, `pause(g)`, `next(g)`, `previous(g)` | Transport. `pause` sends Stop when the source does not accept Pause (a radio). |
| `seek(g, seconds)` | Seeks in the current track. |
| `setPlayMode(g, mode)` | `NORMAL`, `SHUFFLE_NOREPEAT`, `REPEAT_ALL`, `SHUFFLE` (shuffle and repeat all), `REPEAT_ONE`, `SHUFFLE_REPEAT_ONE`. |
| `setGroupVolume(g, v)` | The whole group's volume, 0..100, the rooms keeping their balance. |
| `setVolume(speaker, v)`, `setMute(speaker, muted)` | One room. |
| `join(speaker, g)`, `leave(speaker)` | Makes a room play with a group (it leaves its own); takes a room out of its group (it plays alone and stops). |
| `playStream(g, url, name, art = '')` | Plays an internet radio stream on a group; `name` (and `art`) are what every Sonos app shows. |
| `favorites(): Promise<Favorite[]>` | The Sonos favorites (as saved in the Sonos app). |
| `playFavorite(g, favorite)` | A stream is played directly; a container (playlist, album) is queued, then played. |

Data classes:

| class | fields |
|---|---|
| `Speaker` | `uuid`, `name`, `ip`, `coordinator` (uuid of its group's coordinator), `volume` (-1 until read with `readVolumes`), `muted`. A stereo pair or a home theatre with its satellites is one speaker. |
| `Group` | `id`, `coordinator`, `members` (coordinator first), `state` (`PLAYING`, `PAUSED_PLAYBACK`, `STOPPED`, `TRANSITIONING`), `track`, `volume` (-1 until `update`), `playMode`, `actions`. Methods: `name()` (`'Salon + Bureau'`), `playing()`, `can(action)`. |
| `Track` | `title`, `artist`, `album`, `art` (absolute URL, or ''), `duration` and `position` in seconds (duration 0 for a radio), `source`, `station`, `uri`. |
| `Favorite` | `title`, `art`, `uri`, `meta` (the DIDL, sent back as is), `container`. |

## Notes

- **Port 1400.** Every call is an HTTP POST (SOAP) to `http://<speaker>:1400`. There is no eventing: a program polls
  `update` to follow a group.
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
- **Spotify.** Spotify's Web API sees many Sonos speakers as restricted devices and takes no playback command for them.
  `playSpotify` starts the content through the speakers' own Spotify service instead, and transport and volume stay on
  Sonos. See [`zinc:spotify`](spotify.md) for the library and login.
- **Permissions.** `net` and `process` (see `docs/guide/08-security.md`).
