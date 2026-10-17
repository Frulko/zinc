# Musique

A wall remote for Sonos speakers, made for an HP TouchPad that lives on its charger: what plays, Spotify, radios, rooms and groups,
volumes. The screen goes off when nobody touches it, and the next touch wakes it. It runs on a desktop too (1024x768).

```sh
zinc run examples/music                  # on the Mac, with the speakers of the network
examples/music/install.sh                # on the TouchPad (novacom), in the webOS launcher as "Musique"
```

## Pages

- **À l'écoute**: the cover over its blurred copy, title, artist, progress, transport, shuffle, repeat and like (Spotify). The volume slider
  is the group's; touching it opens a slider per room, as the Sonos app does. The pills at the bottom switch to another group.
- **The home's carousel**: swipe sideways between the player, a StandBy clock (three faces: hands, digits, rings; swipe up or down to change
  it; the screen stays on while it shows), the weather (Open-Meteo: now, the next 24 hours, the week) and the rooms' volumes as rings. The
  slide and the face are remembered (AsyncStorage, plugins/async-storage). The weather's place is `lat`, `lon` and `city` in config.json,
  chosen in Réglages, else found once from the connection's address (ip-api.com). On the clock the screen goes off after 2 minutes
  whatever the settings' delay (unless "Jamais"), then lights for 10 seconds every 5 minutes, as iOS's StandBy does; a touch wakes it.
- **The Mac's notifications**: Zinc Relay on the Mac (examples/notify-relay) pairs once with the tablet over zinc:link and sends the
  notifications it lets through. On the clock, or when it wakes the screen, a notification plays over a black veil as iOS's StandBy does
  (the sender's picture or the app's icon, centred, then aside with who and what), several 10 seconds apart; elsewhere it comes as a grey
  card at the top over a dimmed page, several stack. A touch opens it on the Mac. The carousel's last slide lists the last 50, grouped by
  app, newest first: a touch opens one on the Mac, swipe one to the left to delete it, "Tout effacer" for all (kept in
  `notifications.json`, icons and pictures in `notif-icons/`). Before the first pairing that slide is the
  assistant: install Zinc Relay, then the 6-digit code and the tablet's address to type on the Mac (and what to do when the network blocks
  discovery). Protocol: docs/reports/notification-relay-design.md; `next/tests/data/music/relay.ts` stands in for the Mac with made-up
  notifications.
- **Context**: the room button (top of the player, or the sidebar) lists every group with what it plays and a play button; a touch makes it
  the group every command goes to. "Regrouper" opens the rooms.
- **Radios**: my radios (`radios.json` beside the program; nine French stations to start), the most voted of radio-browser.info, and a search
  with an AZERTY keyboard drawn by the app. `+` adds a station to mine, "Modifier" removes.
- **Spotify**: playlists, albums, liked songs, recent plays, search; a touch plays on the group.
- **Enceintes**: each group with its rooms, their volume and mute; check a room to make it play with the group under control.
- **Réglages**: the delay before the screen goes off, the weather's town (a search as the user types on the app's keyboard: Open-Meteo's
  geocoding, the towns with their region and country), the Spotify and Sonos state, the UDP commands.

## How it works

- `zinc:sonos` (plugins/sonos) speaks the speakers' UPnP API on port 1400; `zinc:spotify` (plugins/spotify) the Spotify Web API.
- Spotify sees most Sonos speakers as *restricted* devices: it shows what they play but takes no command for them. So Spotify content is
  started through the Spotify service of the speakers (`playSpotify` in zinc:sonos, as the Sonos app does), and transport and volume always
  go through Sonos. The account number of that service is found once (a Sonos favorite saved from Spotify names it, else the first numbers
  are tried) and kept in `config.json`.
- Spotify login, once, on a computer: create an app on developer.spotify.com with the redirect `http://127.0.0.1:8765/callback`, then
  `python3 plugins/spotify/login.py <CLIENT_ID> examples/music/spotify.json`. Spotify asks for it again after six months.
- The screen (webOS): the system's own "display off" also turns the touch panel off, so the program keeps the display on for the system
  (`screenTimeout(false)` of zinc:webos), draws black and turns the backlight off with `setBacklight(false)`; while the screen is on it asks
  for full speed with `setPerformance(true)` (webOS's governor leaves the CPU at 192 MHz between touches). Both are done by zinc-helper,
  the root job of zinc:webos that install.sh installs (`next/tools/webos-helper`), which also opens the two UDP ports (`openPort`).
  docs/reports/hardware/webos-screen-power.md, hp-touchpad-webos.md section 14.
- Buttons on the network (an ESP32, a phone): UDP text commands on port 7777: `toggle`, `play`, `pause`, `next`, `prev`, `vol+`, `vol-`,
  `radio <n>` (the n-th of my radios), `wake`. `echo toggle | nc -u -w0 <tablet> 7777`.
- Files beside the program, never committed: `config.json`, `radios.json`, `spotify.json`, `notifications.json`, `notif-icons/`.
