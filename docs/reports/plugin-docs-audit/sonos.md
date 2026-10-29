# zinc:sonos documentation audit

## What it is
Control Sonos speakers on your home network from a Zinc app: find rooms, see what plays, play/pause/skip, volume, group rooms, play radio streams and favorites. No Sonos account, no cloud.

## Targets and status
plugin.json: pure Zinc, targets macos, linux, windows, android, ios, rpi1, rmpp; `requires: net`. Doc: macos verified against S2 speakers (firmware 57.23); webOS/TouchPad built and installed; rpi1/rmpp manifest only.

## What the docs have
- [x] overview, [x] example, [x] API tables (free functions, `System` methods, data classes; matches exports except below), [x] notes (port 1400, coordinator, firewall/SSDP, source kinds, radio, Spotify), [x] reference report `docs/reports/sonos-upnp-api.md`
- [x] runnable use: `examples/music`, `examples/music-tree` (13 files), screenshots `docs/img/music-touchpad.png`, `music-weather.png`
- [x] tests exist: `tests/t1/music_tree_sonos.sh`, `music_city_standby.sh`, `tests/demo/music_notify.sh`
- [ ] screenshot on the plugin page; [ ] tutorial; [ ] fake/offline mode for people without a Sonos (hardware); [ ] troubleshooting section

## What is missing (priority)
1. Fix "Test. None yet": name `tests/t1/music_tree_sonos.sh` (and say what it uses; a mock speaker?).
2. A "no Sonos at home" path: document the mock used by `music_tree_sonos.sh`, or provide `ZINC_FAKE_SONOS`, so a student can run the quick start.
3. Tutorial "A Sonos remote in 40 lines": discover, show now playing with art, buttons for play/pause/volume, poll `update` every 2 s; screenshot from `examples/music`.
4. Screenshots of `examples/music` and `music-tree` main screens on the page (`docs/img/music-*.png` exist, check they are current).
5. Troubleshooting: "no Sonos speaker found" (multicast blocked, VLAN, different subnet, use `known` IP), firewall port for `discover`, S1 vs S2, grouped speakers refuse commands.
6. Document `queueIndex`, `queueEntry`, `removeFromQueue`, `seekTrack`, `queueSpotify`, `enqueue` (exported on `System`/free functions, absent from the API table).
7. Permissions: say the manifest requires only `net`; the page says `net` and `process`.
8. Polling recipe and update frequency, mute/volume read pattern.

## Wrong or stale
- "Test. None yet." is false (tests above).
- "needs the `net` and `process` permissions" vs plugin.json `requires: ["net"]` (no `process` in the code either).
- API table lacks `System.queueIndex/queueEntry/removeFromQueue/seekTrack/enqueue`, `queueSpotify`, and the `Favorite.container` details beyond one line.
- "macos supported, verified on x86_64" (dev machine is arm64 now).

## Suggested pages
- Sonos: overview and quick start
- Sonos: tutorial, a wall remote
- Sonos: API reference (generated: System, Group, Speaker, Track, Favorite)
- Sonos: discovery, networks and firewalls
- Sonos: playing radio, favorites and Spotify
- Sonos: queue and groups recipes
- Sonos: protocol notes (UPnP/SOAP, link to report)
- Sonos: examples (music, music-tree with screenshots)
- Sonos: troubleshooting
