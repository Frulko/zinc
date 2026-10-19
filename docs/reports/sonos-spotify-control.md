# Playing Spotify on Sonos from a third-party app (2026-10-19)

Question (owner): the official Spotify apps play on the Sonos and find them alone; examples/music (zinc:spotify on the public Web API,
zinc:sonos on local UPnP) cannot start, move or queue Spotify there. What works, and what the app should do.

## What the owner's house shows (read-only probes, 2026-10-19)

- Web API: the Sonos group is listed only while it plays, as `"Bureau Plafond + 1"`, `is_restricted: true`, `id: null`.
- One speaker advertises Spotify Connect (`_spotify-connect._tcp`, 192.168.2.190:1400, path `/spotifyzc`): no active user (Sonos logs
  out of Connect after a while).
- `http://<speaker>:1400/status/accounts` lists no account; `AddURIToQueue` of a Spotify item fails with UPnP 800 in our format
  (`?sid=&sn=`, sn 1 to 4) and in SoCo ShareLink's (service types 2311 and 3079). Spotify is not linked as a music service in the Sonos
  app: the speakers only get Spotify when an official Spotify app hands them a Connect session.

## The routes

| Route | Start / move (1) | Queue (2) | Play an item (3) | Needs | Risk |
|---|---|---|---|---|---|
| Public Web API on the Sonos | no | no | no | - | documented: a restricted device takes no Web API command |
| Spotify linked in the Sonos app, then local UPnP (what the app does) | emulated: read `/me/player`, start the same context at the same song and second on the Sonos, pause the other device (it is not restricted) | yes, the Sonos queue | yes | one setup in the Sonos app | none (Sonos's own local API) |
| A bridge Connect receiver (Music Assistant, SpotConnect; Spotify Soloist, Linux, 90-day builds) streaming on to the Sonos | yes | yes | yes | an always-on host | latency, lower quality |
| Sonos Control API (cloud, developer.sonos.com; same groups on the local WebSocket :1443) | favorites and playlists only | no | Sonos favorites only | OAuth integration | none |
| Spotify's internal Connect protocol, or logging the speakers in with Spotify's client credentials | yes | yes | yes | - | against Spotify's terms (reverse engineering): not taken |

The `sp_dc` web-player tokens that used to reach restricted devices were cut from the Web API on 2025-05-07.

## Decision for examples/music

1. The owner links Spotify once in the Sonos app: Settings, Services & Voice, Add a service, Spotify, then logs in; and adds one Spotify
   playlist to the Sonos favorites (the app reads the account serial `sn` from its URI: `accountOf`).
2. The app keeps its route: items and contexts through the Sonos queue over UPnP, "Reprendre ici" as the emulated transfer
   (`resumeThroughSonos`), transport over UPnP (it also works on a Connect session started from a phone), search, library and metadata
   on the Web API.
3. Later, if a favorite is not wanted: read the serial from the `ThirdPartyMediaServersX` value of a ZoneGroupTopology event (SoCo
   `music-services` branch, BookCatKid, 2026-09).

Sources: SoCo issues #875, #998, #557 (github.com/SoCo/SoCo); spotify/web-api #1337, #525; developer.spotify.com (Get Available
Devices, February 2026 migration guide, Soloist, developer terms); docs.sonos.com (loadFavorite, playback sessions); jishi/node-sonos-http-api
`lib/actions/spotify.js`; music-assistant.io; github.com/philippe44/SpotConnect; soco.readthedocs.io ShareLink plugin.
