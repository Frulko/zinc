# Native CarPlay viewer

Run the local media demo on macOS with one command:

```sh
examples/carplay/run
```

It generates an eight-frame, four-second H.264 test pattern with FFmpeg and a
short 440 Hz PCM tone, then plays them in a native Zinc Canvas through the real
CarPlay media decoder. The screen says **OFFLINE MEDIA / no iPhone
authentication**. No receiver, identity, Bluetooth, iPhone or browser is needed.
Generated media stays in `build/carplay/demo-media`. Requires FFmpeg and a built
`build/zinc`; use `ZINC=/absolute/path/to/zinc examples/carplay/run` to reuse an
existing engine without rebuilding it. The launcher selects this checkout's
plugins and opens the window in the background by default. Set
`ZINC_BACKGROUND=0` for a manual foreground run that can request microphone
permission when Siri first opens capture.

For an actual receiver, follow [the plugin setup](../../plugins/carplay/README.md),
then run:

```sh
ZINC_CARPLAY_URL='ws://127.0.0.1:8080/ws?token=YOUR_LOCAL_TOKEN' examples/carplay/run --live
```

Live mode never substitutes offline media. Connect/Disconnect, Home, Siri,
Day/Night and two-contact touch use the receiver. Arrow keys move its rotary
focus; Enter selects, Escape/Backspace go back, Home opens Home, and S requests
Siri. A dropped receiver retries after 0.5 seconds, doubling to eight seconds;
Disconnect cancels retries. Audio and video resources are released on disconnect.
A backend WebSocket connection is **waiting for iPhone**, not authenticated
CarPlay. USB pairing, H.264 projection and automatic stereo 48 kHz audio
playback on the Mac are verified on one iPhone running iOS 27.0.1. Live Siri,
calls, physical multitouch and day/night appearance still need acceptance.

`src/main.tsx` mounts the UI; `src/services/offline.ts` feeds generated local
media. `tests/run --only carplay_demo` checks and captures the native demo and
asserts decoding, playback envelopes and cleanup across the complete local loop.

## Debug laboratory

Click **Debug**, or set `ZINC_CARPLAY_DEBUG=1`. Use the newly built engine for raw
trackpad support; the launcher enables `ZINC_TRACKPAD_TOUCHES=1` by default.
Set it to `0` to retain normal pointer/scroll input. Trackpad normalized positions
map to the window; contacts within the projected video are sent in two stable
slots. The Mac built-in trackpad and Bluetooth Magic Trackpad use the same SDL
indirect-touch path. Physical gestures still need acceptance on each device.
The separately labelled two-contact mouse simulator mirrors the pointer around
the video centre; it does not claim two real fingers. Keyboard capture starts enabled. The header button or **F6** toggles between
CarPlay and Zinc UI. While captured, arrows, Tab/Shift-Tab, Enter/Space, Escape,
Home and S go to CarPlay and Zinc controls cannot acquire focus. F6 releases the
keyboard so GPS fields and debug buttons work normally; F6 or a video click
captures it again. OS modifier shortcuts are left available.

The video shows blue/pink numbered contact rings and a small trackpad map, even
while waiting for the phone. Marker numbers persist until lift; the miniature
also shows contacts outside the video. **F7** or the **Trackpad ON/OFF** button
toggles native-contact forwarding and the markers independently of keyboard
capture. Turning it off releases both contacts immediately; mouse clicks remain
available. Only the first two contacts are forwarded
to CarPlay. Native contact IDs are opaque and may be negative.

External GPS debug is **simulated**. Edit latitude/longitude/speed (km/h), apply a
preset, or pick a GPX file with **Load GPX**. The panel shows whether the iPhone
has subscribed. The authenticated backend emits NMEA only while the source is
enabled and a location subscription is active. Stop GPS disables injection.
On wireless CarPlay, the receiver passes the phone's requested NMEA selectors to
the GPS source before sending. The TX count proves delivery to the iAP2 link;
it does not prove that iOS navigation replaces its own location estimate.

GPX files are limited to 1 MiB / 10,000 points; DTDs and external XML access are
rejected. Track timestamps define the timeline; without timestamps each point
is one second apart. Interpolation supports seeking and Play/Pause; injected
observations use current UTC. A short sample is `routes/paris.gpx`.

For an actual secondary screen, add `ZINC_CARPLAY_CLUSTER=1` to the backend
environment **before starting it**. This opts into a 960×360 cluster display. Set `ZINC_CARPLAY_CLUSTER_WIDTH=1280`
and `ZINC_CARPLAY_CLUSTER_HEIGHT=480` on the **backend** to change its resolution.
Dimensions must be even pixel counts between 64 and 4096. Restart the backend
and reconnect CarPlay after changing them; the player preserves the actual
received aspect ratio. Availability and rendering depend on the navigation app.
When `ZINC_CARPLAY_ULTRA_THEME=44C9FA31EC:985` is also enabled, the theme's
1920×720 center and cluster canvases override the normal display and cluster
sizes. The Cobranded dashboard uses its solid `dynamicColor` wallpaper: black
at night and `#f2f2f2` by day. Other theme artwork is not rendered by Zinc yet.
Start navigation and click **Request cluster map**. Its stream111 decoder is
independent of the main stream110 decoder. A blank preview means no cluster
video has arrived; it is not filled with a mock map.

The HUD shows decoded iAP2 road/instruction/distance and Now Playing metadata;
its bounded log contains message IDs and byte counts, not raw payloads. Missing
updates remain missing, and ended sessions are marked stale. Navigation apps
may differ in the guidance/cluster data they provide.

USB trust is persisted per explicitly selected phone under the backend state
directory, in owner-only files. The first run with this version may need one
last Trust approval. Later starts first try saved trust, with bounded waiting
when the phone is locked. Lockdown/USB Restricted Mode may still require an
unlock; the plugin does not bypass the iPhone's lock policy. Saved trust is
retained on locked, transient, TLS and transport failures.

For wireless launch options on Mac and Pi, see
[the wireless backend guide](../../plugins/carplay/backend/linux/README.md).
For a Pi with a local screen, the [performance and two-service plan](../../docs/reports/zinc-next-carplay-pi-performance.md)
keeps the receiver and Zinc player as separately supervised programs. The
player's existing reconnect loop handles receiver startup and restarts.
For instrument clusters and synthetic vehicle data, see the
[CarPlay Ultra feasibility report](../../docs/reports/zinc-next-carplay-ultra-feasibility.md):
the current stream 111 is a classic auxiliary video stream. The **Tableau de bord**
button opens a full-width local display with the cluster map and simulated speed,
RPM, gear and fuel; its presets are shared with Debug. In the Cobranded layout,
the map is cropped to the theme's central 600×480 zone without stretching it.
With the experimental
Ultra Vehicle State channel active, RPM, fuel and climate values are offered to
the phone; speed and gear remain local. The phone's Voiture, Radio and Climat
apps need vehicle services beyond this small profile and may remain blank.
The catalog offers several cluster layouts and wallpapers, but this receiver
currently requests the Cobranded cluster layout with its solid day/night color.
The full asset composition and a theme selector are not implemented.

The HUD button shows/hides navigation and media beneath the main video. It retains
incremental iAP2 metadata: title, artist, album, playback app, state and reported
elapsed/total time, plus instruction, road, destination, remaining distance/time.
Unknown values stay blank or “—”; the timer is the last phone report, not an
invented clock. The sidebar coalesces repeated ID/length log lines.
**Charger le trajet test** loads the bundled one-minute Paris GPX without a file
picker. The GPS TX counter counts completed iAP2 writes, not phone acceptance.

Now Playing covers use actual iAP2 artwork transfers, not a web lookup. The HUD
matches the transfer ID in metadata and releases the native image on replacement,
clear or disconnect. Supported: PNG/JPEG up to 2 MiB and 2048×2048; the journal
reports transfer ID, size and validation result. Restart both backend and player
for artwork support, then change song so the phone can publish a fresh transfer.

GPS status includes the requested iAP2 selectors (1=GGA, 2=RMC); only requested
sentences are emitted. A live inspection confirmed subscription and a counter
advancing by two sends per second, but Plans following the simulated route is
still unproven. This is external accessory GPS delivery, not a demonstrated
system-wide override. No phone settings, trust or location history are reset.

Unicode apostrophes and accented characters pass the WebHub JSON / WebSocket /
HUD regression. If the live instruction contains a literal question-mark byte
or invalid UTF-8, the journal reports `iAP2 instruction source: UTF8=...` to
identify source corruption; the viewer never guesses replacement punctuation.


### iAP2 inspector

In the live player, click **iAP2**. It releases keyboard capture and enables live
tracing. Search by ID, endpoint name or family; filter RX/TX and page through the
receiver's entire known catalog. Each entry shows its declared direction,
identification advertisement, TX/RX observations and available TLV schema.
Messages not in the catalog still appear after observation as unknown endpoints.
An advertised capability or subscription is not proof that the phone/app provides
values. Owner testing: Plans complete guidance; Google Maps partial data without
direction; Waze no HUD metadata in this setup. These are observations of that
phone/app session, not global claims about every app version.

The detailed journal shows the most recent20 exchanges; memory retains128. Pause
freezes the display, not capture. **Enregistrer** chooses a file and appends all
subsequent trace events until stopped, including when returning to the video.
**Exporter** saves a snapshot of the catalog/counters and current memory ring.
Long strings/raw bodies use the protocol formatter's bounded previews; this is
not an unlimited byte dump of media or cryptographic exchanges.

**Composer TX** takes a TLV body in hex. Selecting a supported start-subscription
entry preloads its actual protocol payload. Stop-subscription entries use an
empty body. The receiver checks valid TLV framing,4096-byte limit, TX direction,
authenticated link and the messages advertised for that link. Catalog-only
commands remain visible but cannot be sent until implemented/advertised. The
receiver's authentication, identification and Wi-Fi bodies remain hidden and
cannot be sent through this composer.

For startup tracing in the backend terminal, add
`ZINC_CARPLAY_IAP2_TRACE=1` to its existing environment. The UI toggle also controls
terminal output. RX/TX counters run while text tracing is off. No subscription is
sent merely by selecting an entry. Entering the inspector itself does not start
extra phone features; startup subscriptions request music, navigation, power,
communications and call updates. Extra metadata/exit/lane capacities are now
advertised/requested where specified, but availability remains app-dependent.

After reviewing the supplied CarPlay chapter, external-GPS identification now
also includes generic VehicleInformation, without inventing engine or battery
values. Restart backend/player and reconnect the phone to apply identification
changes. Whether this resolves Plans following the GPX still needs a phone test.
