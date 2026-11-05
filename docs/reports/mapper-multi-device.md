# Mapper multi-device: one canvas on many machines, plugin sources, OSC, Chataigne

Research 2026-11-05, no code changed. Legend: **[V]** read in the repo or fetched this session, **[K]** from memory, not re-checked, **[A]** assumption to measure.
Builds on `docs/reports/mapper-fleet-sync.md` (2026-11-04: clocks, timeline, per-backend correction, camera test), which this report does not repeat; where a section says "see fleet-sync" it is settled there.

## A. What Zinc already has

### A1. Sources (what gives an image a mapping layer can show)

A layer takes any **runtime image id** (`mapping.setImage(layer, id)`, OSC `/layer/<n>/image id` + `/layer/<n>/source image`): the host uploads it to a GL texture when `raster::image_version(id)` changed (`plugins/mapping/native/mapping.host.cpp` ~l.376-395, `dyn_view` + `glTexSubImage2D`, a CPU RGBA copy per new frame) [V]. So any plugin that fills a `zinc:gfx` runtime image works with no change in `plugins/mapping`. Cost: one upload per frame per source (the "bottleneck" on Pi 3B+, per `docs/plugins/mapping.md`).

| Source | Plugin / doc | Gives an image? | Platforms (plugin.json `targets` / doc) | Settings it has | Missing for the mapper |
|---|---|---|---|---|---|
| Webcam | `plugins/camera`, `docs/plugins/camera.md` | yes, `Camera.image` (runtime image), `onFrame`, `snapshot()`; `devices()` lists id/name/position; `open(id,{width,height,fps})`; `setOption(mirror/brightness/contrast)` [V] | macos (AVFoundation), ios, android (camera2), linux + rpi1 (V4L2), fake camera everywhere; windows, wasm no (Z5005) | device, size, fps, mirror, brightness, contrast | No list of a device's formats (`VIDIOC_ENUM_FMT` is used inside, not exposed), no focus/exposure/zoom, no hot-plug event. **No real frame was ever captured on macOS; Linux/Android backends never built or run** [V, doc "Verified here"]. Permission `camera` in zinc.json. |
| Screen capture | `plugins/screen-capture`, `docs/plugins/screen-capture.md` | yes, `ScreenCapture.open(id,{width,height,frameRate,cursor}).image`, IOSurface no-copy on macOS [V] | **macos only in practice** (ScreenCaptureKit; `linux`/`windows` keys exist in plugin.json but have no native impl: "cross-platform pass") | `getSources` (screens/windows + thumbnails), size, fps (<=60), cursor | Linux (PipeWire/X11), Windows. Permission `screen`. |
| Screen-capture settings UI (lite-discord) | `plugins/screen-capture/picker.ts` (`pickScreen`), used by `examples/discord` Go Live and `examples/webrtc-call` [V] | n/a (a dialog) | same as above | tabs Applications / Entire screen / Devices, previews refreshed every 1.5 s, search, preset SD 720p30 / HD 1080p60, resolution (720p, 1080p, Source), fps (15, 30, 60), pointer, Share/Cancel; returns `{kind, sourceId, width, height, frameRate, cursor, resolution}` | It is a `zinc:ui` modal in the app, not usable from the mapper's browser editor (a Zinc web export). The mapper needs the same choices as a **settings schema** rendered by its own editor (see D5), `getSources()` supplying the choice list. `examples/discord` has no generic "source settings" module, only this picker. |
| Webview | `plugins/webview`, `docs/plugins/webview.md` | **no**. It is a native view (WKWebView, android.webkit.WebView, WebKitGTK) *above* the GL surface, not a texture. Only `display-sidecar` takes WebKit snapshots (`takeSnapshotWithConfiguration`, `plugins/webview/src/webview.mm` l.141-160) of off-screen views into its frames, macOS only [V] | macos, ios, android, linux (WebKitGTK, X11 only); rpi1/windows/wasm no | `navigate(url)`, `loadHtml`, `eval(js)`, `postMessage`/`handle` RPC, `setZoom`, `key(code,text,mods)` | An image output: `webview.snapshot()`/`onFrame` into a runtime image (macOS: WKSnapshot at ~10-30 fps is CPU/GPU-heavy [K, A]; Linux: WebKitGTK `webkit_web_view_get_snapshot`; Android: `View.draw` into a bitmap; or CEF/offscreen rendering, not vendored). This is an **engine gap**, to fix in the plugin ("Fill the engine's gaps"), not worked around by overlaying the view. "Remote control" exists (eval/postMessage/key) but a mapped layer has no pointer path. |
| "Sidecar" | `docs/plugins/display-sidecar.md`, `app/sidecar`, `app/sidecar-screen`, `plugins/display-rmpp/stream.h` | These are **outputs** (a Zinc app's frames sent to a tablet/Pi screen) [V]. As an input, the nearest is `zinc:remote` (`plugins/remote-view`): `remote.connect(host,port,token)` gives `s.image` (runtime image of another Zinc app's screen, `fps`, `latency`, `kbps`), discovery of announced apps; macos/linux/rpi1 [V, docs/plugins/remote.md]. `zinc:webrtc` can also return `RemoteVideo.image` (VP8) [V]. | remote: macos, linux, rpi1 | host/port/token | **Worth keeping** as a source: `zinc:remote` = "show another Zinc app (or a Pi's player UI) as a layer", loss-tolerant, zstd frames; good for UI/interactive content, not for video (software compressed, ~1 Mbit/s at 640x400 per sidecar numbers). Not worth keeping as sources: the rMPP e-ink sidecar, Mac virtual display driver (`app/sidecar/mac/screen.swift`). Needs confirming with the owner what "sidecar" meant (assumed: another screen/app as a source). |
| Video file | `plugins/video`, `docs/plugins/video.md` | yes, `Player.image`; used by the mapper through `services/layerMedia.ts` (`new Player(0,0)` per layer, `bindDecodedVideos`) | macos (VideoToolbox), rpi1/linux (FFmpeg + V4L2 M2M), android (MediaCodec), ios, sim | playlist, order, repeat | **No `seek(seconds)`, no rate, no sync** (doc "Follow-ups") [V]; no audio on any target. Android additionally has the compositor's own `MediaPlayer` path (`ZincMappingMedia.java`). |
| HLS / RTSP streams | **none**. `plugins/video/native/video.host.cpp:115` calls `avformat_open_input(&fmt, path, ...)` on a string, so an `http(s)://...m3u8` or `rtsp://` URL *may* open if the FFmpeg build has the protocols (Homebrew's does; the Alpine armhf SDK image **[A]**), but nothing handles `avformat_network_init`, `rtsp_transport=tcp`, `stimeout`/`rw_timeout`, reconnect, live (unbounded) streams, low-latency flags (`nobuffer`, `fflags=+discardcorrupt`) [V: grep found no mention in repo]. `plugins/video/web` mentions MSE/HLS for the browser export only [V]. | would reuse `Player` | macos, linux, rpi1 where FFmpeg is; android/ios use platform decoders (ExoPlayer/AVPlayer would be needed for HLS) | | A `stream` source: either extend `Player.add()` with an options object (url, transport, timeout, latency) or a sibling class in `plugins/video`; a **test** (probe: open, read first frame, report codec/size/fps/latency or the error). Sonos docs say HLS `.m3u8` is unreliable for their own purposes, irrelevant here. |
| gphoto2 live | `plugins/gphoto2`, `docs/plugins/gphoto2.md` | yes, `liveImage()` runtime image (TurboJPEG decode on a worker, triple buffer), `startLiveView/setViewSize`; `config()` widget tree with `type` (`text range toggle radio menu date button`), `choices`, `min/max/step`, `get/set` [V] | macos, linux, rpi1 (libgphoto2 + jpeg-turbo from brew/apt); sim fake | the whole config tree: already **a settings schema** (best model for D5) | **Never tested on a physical camera** [V]. One camera at a time. macOS `ptpcamerad` grabs PTP cameras. 15-30 fps over USB 2. |
| Chataigne | `examples/chataigne` (app: faders, GO, XY, meters over OSC; `chataigne-project/zinc-demo.noisette`, `chataigne-module/module.json + zinc.js`, `tools/fake-chataigne.mjs`) [V] | n/a | | | The project/module were "written by hand from Chataigne's source, not saved by Chataigne; not opened in a real Chataigne yet" [V, its README]. Nothing in it addresses the mapper. |

Platform declaration today: `plugin.json` `targets` (a key per supported platform with its sources/frameworks/libs), `requires: ["camera"]` (capability named in `targets/capabilities.json`, per profile boolean; true on macos/android/ios/sim, optional linux/rpi1), build errors Z5003 (plugin has no target) and Z5005 (profile lacks the capability) [V: plugins/*/plugin.json, camera.md]. These are **build-time** facts. The mapper's editor needs a **runtime** answer ("which source kinds can this device run, and are they ready?"); today `devices()` returning `[]`, `permissionStatus()`, and the fake camera are per-plugin ad hoc answers.

### A2. Network, control, mapper, devices

| Topic | What exists | Gap for the goal |
|---|---|---|
| OSC | Engine short `zinc:osc` (`listen(port, cb)` numbers+strings; used by `plugins/mapping` `listen()` and `services/control.ts`; datagrams <= 2048 B, **no bundles/time tags, no feedback sender in the mapper**) and `zinc:osc/full` (`plugins/osc`, pure Zinc on `zinc:socket`: OSC 1.0, bundles, NTP time tags, patterns, `send/sendBundle`; macos verified, linux/rpi1 listed not run; **not on QuickJS**) [V]. Mapper address space: `docs/plugins/mapping.md` (`/layer/<n>/...`, `/add /remove /move /select /sync /save /load`) + mapper-owned `/column n`, `/cell column layer`, `/stop [layer]`, `/hud`, `/volume`, `/mute`, `/card kind [target]` (`services/control.ts`) [V]. `/sync host port` replies `/state/info` + `/state/layer i {json}`, max 10 Hz. | No feedback (column launched, clip playing, position), no transport (`pause`, `seek`), no wildcards on the short module, no 1-based/named aliases, no `?` query, no Resolume/Millumin names. UDP bound on all interfaces with no authentication (documented). |
| Discovery / pairing in the mapper | `services/pairing.ts`: `zinc:link` DNS-SD service `zinc-mapper` (TXT info = web port), 6-digit code (5 min, 3 tries), then `channel.send({t:'editor', port, token})`; the native editor lists mappers (`editor/src/services/discovery.ts`, `link.ts`) [V]. `zinc:link`: TLS 1.3 PSK channel, JSON + bytes, reconnecting, `Peer{id,name,host,port,paired}`, macOS/Linux/Android [V]. | The channel's `onMessage` is empty: there is **no mapper-to-mapper protocol**. Discovery finds a mapper for an *editor*, not a *player for a master*. |
| `zinc agent` / `zinc device` | TCP 7733, TLS pairing (J-PAKE) + TLS1.3 PSK sessions, one request per connection (35 ms): `info push pull install run stop logs top forward reverse deploy`; Pi/Linux/macOS [V, `docs/reports/zinc-next-agent.md`]. | The right path to **provision** (push app + media + show to N machines, `info` for load/temps). Not a real-time channel. The mapper already has its own media upload (`/media`, `TransferDialog.tsx`, `mediaStore.ts`). |
| Time sync / clock | **None** in repo (checked by `mapper-fleet-sync.md` §4; `Date.now()` and `hal_time_us()` only) [V]. `zinc:osc/full` has NTP time tags (a format, not a clock). | Everything in C. |
| Video decoder per platform | macOS VideoToolbox (FFmpeg hwaccel), Pi/Linux V4L2 M2M (`h264_v4l2m2m`, dmabuf zero-copy only with `display-fbdev`, not GL), NUC/x86 Linux: **software only, VAAPI/NVDEC not wired** [V video.md], Android MediaCodec (+ `MediaPlayer` in the mapping compositor), iOS AVAssetReader. | NUC: no hardware decode wired (an Intel NUC does 1080p30 H.264 in software, 4K no [A]); `mapping` on `linux` is **not supported** ("display-gl has no linux backend wired", KMS would work) [V mapping.md support matrix]. So **NUC = linux target = mapper cannot run there today**. This is the first blocker for "NUCs" unless the NUCs run Windows (also unsupported) or macOS. |
| Mapping on which platforms | macos verified; android 4.4 verified; rpi1 builds, not run on hardware; linux, windows no | see above |
| Show model | `show.json`: `columns[{cells[layer]: {media|source, fit, frame, picture, loop, color...}}], active, playing[]` (`services/show.ts`), scenes, history; editor sends the whole show with `PUT/POST /show` | A show is small JSON, easy to replicate to every machine. |

## B. OSC: Millumin and Resolume

### B1. Millumin (fetched: https://github.com/anome/millumin-dev-kit/wiki/OSC-documentation)

Prefix `/millumin` optional on input, always on feedback; case-insensitive. Layer targeting: `/selectedLayer/...`, `/layer:<name>/...`, `/index:<n>/...`, or `/<name>/...`. Ports are **not stated on the page** (from memory Millumin listens on 5000 and sends feedback to a configured IP/port, **[K]** verify in Preferences).

| Group | Addresses (args) |
|---|---|
| Column | `/action/launchColumn [idx or "name"]`, `/action/launchOrStopColumn`, `/action/stopColumn`, `/action/launchPreviousColumn`, `/action/launchNextColumn` |
| Clip | `/selectedLayer/startMedia [] / [7] / ["Movie.mov"]`, `pauseMedia`, `startOrPauseMedia`, `stopMedia`; `/selectedLayer/import ["path", idx]`, `importAndStart` |
| Layer | `.../opacity [0..1]`, `.../position/xy [x,y]` (`/x`, `/y`), `.../rotation [deg]`, `.../scale`, `.../mapping/topLeft [x,y]` (+ topRight, bottomRight, bottomLeft; `/x` `/y`), `.../effect1/red`, relative suffix `/+` `/-`, `/layer:n/selected [0/1]`, `.../media/speed`, `media/time [s | "hh:mm:ss.mmm"]`, `media/normalizedTime` |
| Transport | `/action/play|pause|playOrPause`, `/action/goToTime [s | "timecode"]`, `/masterVideo`, `/masterAudio`, `/masterDMX` |
| Test / UI | `/action/displayTestCard`, `/action/hideTestCard`, `/action/enterFullscreen`, `/action/brush [x,y,(pressure)]` (interactive painting), `/action/selectBoard|selectLayer`, `/action/saveProject`, `/ping` |
| Feedback | `/millumin/board/launchedColumn [idx,"name"]`, `stoppedColumn`, `/millumin/layer:<n>/mediaStarted [idx,"name",duration]`, `mediaPaused`, `mediaStopped`, property echoes `/millumin/layer:<n>/opacity [v]`, `/millumin/selectedLayer/media/time [t,dur]`; enable "API feedback" in the Device manager; query by `/?` suffix. (The page contradicts itself on a few feedback names: `columnLaunched` vs `launchedColumn`.) |

### B2. Resolume Arena/Avenue (fetched: https://resolume.com/support/en/osc; the page omits the column/clip connect addresses, which come from memory **[K]**, confirm with "Edit OSC" shortcut mode)

Default input port 7000; output needs destination + port; every parameter has an address; **floats are 0..1 mapped to the parameter's range**, ints are indices (a float is mapped linearly), strings `s`, colours `r` + RGBA uint32. Absolute/relative: first arg `"a"` (absolute) or `"+" "-" "*"`; send `"?"` to an address to poll, the reply comes on the same address. "Output All OSC Messages" preset echoes everything.

| Group | Addresses |
|---|---|
| Verified on the page | `/composition/layers/1/video/opacity`, `/composition/layers/2/clips/8/transport/position`, `/composition/video/effects/transform/scale`, `.../rotationz`, `/composition/layers/1/video/mixer/blendmode`, `/composition/selectedlayer/video/mixer/blendmode`, `/composition/layers/1/clips/1/video/effects/transform/positionx` |
| From memory [K] | `/composition/columns/<n>/connect 1` (launch a column, **1-based**), `/composition/layers/<l>/clips/<c>/connect 1`, `/composition/layers/<l>/clear 1`, `/composition/disconnectall`, `/composition/master`, `/composition/layers/<l>/master`, `.../video/opacity`, `.../audio/volume`, `.../clips/<c>/transport/position` (0..1), `.../transport/position/behaviour/speed`, `/composition/selectedcolumn`, `/composition/layers/<l>/bypassed`, `/composition/tempocontroller/tempo`; feedback: connected state of clips (`.../connected` 0/1/2/3), layer opacity echoes |

### B3. Proposed Zinc mapper namespace

Principle: keep today's `/layer/<n>/...` (0-based, the vocabulary of `mapping.json`) as the **native** namespace and add thin **aliases** in `services/control.ts` (an alias table, not a second implementation), plus the missing categories: feedback, transport, fleet. The whole OSC surface goes through `applyCommand` already, so aliases are one function `normalize(address, args) -> LayerCommand`.

| Zinc address | Args | Same as / maps to |
|---|---|---|
| `/column n` (exists, 0-based) | | alias `/composition/columns/<n+1>/connect 1` (Resolume), `/action/launchColumn n` (Millumin, 0- or 1-based per Millumin's own config **[A]**), `/column/next`, `/column/prev` ↔ `/action/launchNextColumn|PreviousColumn` |
| `/cell column layer` (exists) | | alias `/composition/layers/<l>/clips/<c>/connect 1`; note Resolume is layer/clip, Zinc is column/layer |
| `/stop [layer]` (exists) | | `/composition/layers/<l>/clear`, `/composition/disconnectall`, `/action/stopColumn` |
| `/layer/<n>/opacity` (exists, 0..1) | | `/composition/layers/<n+1>/video/opacity`, `/layer:<name>/opacity`, `/selectedLayer/opacity` (needs a "selected layer" = `/select n`, which exists) |
| `/layer/<n>/corner i x y`, `/corners` (exists) | | Millumin `.../mapping/topLeft [x,y]` etc. (corner order TL TR BR BL) |
| `/layer/<n>/position`, `scale`, `rotation` (exists) | | Millumin names |
| `/master v`, `/volume v`, `/mute` (exist) | | `/masterVideo`, `/composition/master` (these two should scale *opacity*, today `/master` is volume: needs a separate `/brightness` master, **new**) |
| `/transport play|pause|stop` , `/transport/seek s`, `/transport/rate r` | | **new**; needs `Player.seek/rate` (A1 video). `/layer/<n>/time`, `/layer/<n>/normalizedTime` ↔ Millumin `media/time`, Resolume `transport/position` |
| `/card kind [target]` (exists) + `/card/off` | | `/action/displayTestCard`, `/hideTestCard` |
| `/source/<k>/...` | settings keys of a source (D5) | **new**: `/source/<id>/set key value`, `/source/<id>/start|stop`, `/source/<id>/test` |
| `/fleet/...` | `/fleet/device/<id>/test`, `/fleet/device/<id>/viewport x y w h`, `/fleet/device/<id>/trim ms`, `/fleet/device/<id>/identify` | **new** (D2) |
| Query | any address with `?` as in Resolume, or `/ping` | reply `/state/...` to the sender (generalises `/sync`) |
| Feedback (UDP to the senders registered with `/feedback/subscribe host port` or to the last sender) | `/column/launched n name`, `/column/stopped n name`, `/layer/<n>/playing media duration`, `/layer/<n>/time t dur` at <= 10 Hz while playing, `/layer/<n>/opacity v`, `/fleet/device/<id>/state online|offline fps clockOffsetMs`, `/show/active n` | Millumin's `/millumin/board/launchedColumn`, `/millumin/layer:x/mediaStarted`; mirrored in Resolume style when `--osc-dialect resolume|millumin` |

Choices: (1) dialects are **opt-in aliases** (`--osc-dialect`), since 0/1-based ambiguity must not be guessed. (2) Switch the mapper's listener to `zinc:osc/full` (bundles with time tags, patterns, one endpoint also used to send feedback); the engine's short module cannot send to a chosen port with replies from the same socket **[A: check]** and drops bundles. Caveat: `zinc:osc/full` is not on QuickJS. (3) Fleet-internal traffic between master and players is **not** this namespace's UDP; see D3.

## C. Sync techniques (additions to fleet-sync; recommended numbers)

| Topic | Practice | Realistic numbers / recommendation |
|---|---|---|
| Clock | NTP-style 4-timestamp over UDP with min-RTT filter + drift line (fleet-sync §2.1). PTP (IEEE 1588) gives sub-microsecond only with hardware timestamping NICs and PTP-aware switches; Pi 4/5 and many Intel NICs have it, Pi 3B+, Wi-Fi and macOS do not [K]. Chrony/ptp4l on Linux, `timed` on macOS exist but cannot be controlled from an app. | Wired GbE software: 50-300 us p95 **[A]**; 5 GHz Wi-Fi: 1-5 ms p95 with spikes of 20+ ms when the AP sleeps stations **[A]**; 2.4 GHz busy: 5-20 ms. **Recommendation: own NTP-style, 8-probe burst at join, 1 Hz steady, keep best-RTT sample of the last 8; report `offset`, `rtt`, `jitter` per device. Wi-Fi players are allowed but flagged "sync > 1 frame possible"; wired recommended.** |
| Frame-accurate start | Resolume/Millumin/Watchout chase timecode or run their own timeline; commercial walls (disguise, Pandora, Watchout) also genlock/frame-lock on output cards. Open source: Snapcast (timestamp + fixed buffer, 0.2 ms drift), omxplayer-sync (position messages and rate nudging, tens of ms), Syncplay (pause/seek/rate-nudge to the slowest, tolerance ~0.5-1 s; for humans, not frames) [K, partially in fleet-sync §1]. | Start in the future (`lead`): **500 ms** for preloaded media on wired, **1.5 s** when it must open a decoder (fleet-sync). A column launch is a message `{columnN, startAt}`; every player should have *preloaded* (opened + first frame decoded, paused) every clip of the **next 1-2 columns** so a launch costs one message, not a decode (decode open takes 100-500 ms, Pi more). |
| Drift correction | video: drop/repeat one frame when error > 0.5 frame, seek > ~3 frames; rate nudge 0.99-1.01x only where the backend offers rate (FFmpeg path: we control timestamps; MediaPlayer API 19: no). | Target **p95 <= 1 frame (16.7 ms @60), median <= 8 ms** after trim (fleet-sync). Without genlock the vsync phase floor is 0-16.7 ms. |
| Genlock absence | not available on NUC/Pi/Mac HDMI; Quadro Sync/ Intel? none; Pi KMS vtotal nudge is theoretical [A]. | Accept one-frame phase; say so in the UI ("sync quality" per device); for edge-blend seams on fast horizontal motion advise 50-60 Hz identical modes on all outputs. Unequal refresh rates (59.94 vs 60) are the real enemy: **force the same mode on all players and log the measured vsync period**; compensate with the drop/repeat servo. |
| One logical canvas | Per-device viewport into a virtual canvas, identical in Watchout ("display = a window in the stage"), Resolume Advanced Output (slices), Millumin (outputs). Edge blend = overlap region with a gamma-corrected ramp per side on each device (Resolume, TouchDesigner). | Model in D4. Overlap typically 10-20 % of the width; blend gamma 2.2 (already the mapping default). |
| Media distribution | Watchout prefetches to each display computer; Resolume Arena needs the same file on each machine; disguise syncs by content. | Push by content hash from the master (mapper's `/media` + hash); skip files that match; show progress per device (the editor already has transfer UI). Do not stream pixels between players for files. |
| Live sources across machines | no one gets frame sync from a live camera for free: the camera is on one machine; others see it later. | Source host timestamps frames; other devices **play out at `captureTime + delay`** (fixed jitter buffer **150-300 ms** wired). Transport: `zinc:webrtc` (VP8, FEC; `RemoteVideo.image`) or `zinc:remote`. Latency is the price; the editor must say it. Same canvas but distinct locals (each device with its own webcam) needs no sync. |
| Master election / failover | Snapcast: fixed server. AirPlay2: PTP BMCA. Watchout: production PC fixed + backup. | **Configured master** (operator choice, stored with the fleet), plus *replicated state*: every player holds the show, the fleet layout and the clock epoch. Failover: players promote the lowest `id` among **master-capable** peers after **3 s** without master heartbeats (hysteresis, and only if "auto-failover" is on); the new master continues the same `epoch`/timeline so playback does not restart. Split brain is resolved by a monotone `term` number (higher wins), as in Raft-lite. One device can be master and player (it runs both roles in one process; its own clock is the reference, offset 0). |

## D. Recommended architecture

### D1. Where things live

| Piece | Home | Reason |
|---|---|---|
| Clock (probes, filter, drift fit), timeline math, `FleetClock` | new `plugins/fleet` (module `zinc:fleet`, pure Zinc on `zinc:socket`/`zinc:link`, no native code at first) | Not mapper-specific (any Zinc multi-screen app, a game) and AGENTS says look for providers first: nothing exists [V]; `lib/std` cannot import a plugin, and a plugin is compiled only into programs that use it. Native receive-time stamping later if loop jitter shows (fleet-sync A). |
| Roles, fleet state, device list, viewports, command replication, media sync | `examples/video/mapper/src/services/fleet/*.ts` | App logic; promote to `zinc:fleet` only when a second app needs it. |
| `Player.seek(s)`, `rate`, `clock source` hook, `Player.onFrameTime` | `plugins/video` (`player.h`) | The fleet-sync hook point: `clock = timeline(now)`. |
| Output viewport + output-level edge blend + `/output/*` commands | `plugins/mapping` | It already owns "Output (0,0)-(1,1)" and edge blend; the missing piece is the global transform + a final blend ramp (the "Not done: multiple outputs/projectors" line). |
| Sources: contract | `examples/video/mapper/src/sources/` (registry + adapters) first; each *plugin* keeps its own API and exports an adapter only if reused elsewhere | Avoid a premature `lib/std` interface; one app uses it. |
| Stream source (HLS/RTSP) + test, webview image | `plugins/video` (`stream`), `plugins/webview` (`snapshot`) | engine gaps, fix there |
| OSC dialect aliases, feedback | `examples/video/mapper/src/services/osc/` | |
| Editor: devices, sources, fleet | `examples/video/mapper/editor/src/components/` | |

### D2. Roles in one app

`mapper --role master|player|both` (default `both` = today's behaviour: standalone is a fleet of one). Every instance runs the **player** half (compositor, media, sources, clock client) when `player` is on, and the **master** half (show state, editor/web server, OSC in, fleet server, clock reference) when `master` is on. A `both` instance talks to its own player half through the same code path over a loopback (no special case: this is also how it is tested on one Mac). Device identity: `zinc:link` `Peer.id`. Discovery: reuse DNS-SD with a second service type `zinc-mapper-player` (players) next to `zinc-mapper` (editor target); a player offers pairing (6-digit code, as the editor does today); the master keeps the paired list.

### D3. Protocol

| Channel | Transport | Content | Rate |
|---|---|---|---|
| Control | `zinc:link` `Channel` (TLS, ordered, reconnecting) | `hello{id,name,role,caps,platform,sources[],viewport}`, `fleet{devices,viewports,term}`, `show{json,hash}`, `cmd{t:'osc',address,args,at}` (the replicated mapper command, stamped), `media{need[hashes]}`, `state{fps,load,temp,clockOffset,rtt,resyncs,playing[]}` to the master | commands on event; `state` 1 Hz; heartbeat 1 Hz |
| Clock | **plain UDP**, fixed port (7790), 32-byte probes | NTP 4-timestamp | burst 8 at join, 1 Hz, 4 Hz for 10 s after a step |
| Timeline | control channel (+ UDP re-broadcast of the last one every 1 s for fast join) | `{epoch, term, startAt, rate, loop, column, clips[{layer,media|source,hash}]}` | on column launch / transport; 1 Hz re-send |
| Live edits (later) | UDP, last-wins | layer deltas stamped `at = now + lookahead` | 30-60 Hz drag, with a full-state resync on the channel |
| Files | HTTP from the master (`/media/<hash>`, already there for the editor, with the web token replaced by a fleet token) or `zinc device push` for first provisioning | | background |

Every state change that must be simultaneous carries `at` in master-clock microseconds; players apply it at the first vsync after `at` (`lookahead` 50 ms wired, 100 ms Wi-Fi, per-fleet setting). Without `at` = "as soon as possible" (editing, not performing). External OSC in, when fleet is on, is converted by the master into `cmd` messages with `at = now + lookahead`. (Time tags in incoming OSC bundles may set `at` directly once OSC full is used.)

### D4. Virtual canvas model

`fleet.json` (part of the show, edited in the editor): `canvas {w, h}` (reference pixels, e.g. 3840x1080) and per device `viewport {x, y, w, h}` in canvas pixels, `output {w, h}` (its real resolution, learned via `hello`), `blend {l, r, t, b}` in canvas pixels (overlap with neighbours; gamma), `trim` ms, `rotation` 0/90/180/270 (later), `mirror`. The master holds **one** mapping scene in **canvas-normalized** coordinates (0..1 over the canvas). Each player receives the same scene plus its viewport and applies one affine in the vertex stage: `out = (canvasN * canvasSize - viewport.xy) / viewport.wh`, a new `/output/viewport x y w h` command of `plugins/mapping` (clip to the device's 0..1 by GL), and a final edge-blend ramp for the overlap sides `/output/edge l r t b gamma` (a screen-space multiply in the last pass, so layers' own `edge` stays for surfaces). Masks/meshes are in surface space and follow. Media are not cropped per device: each device decodes the whole clip (cost!) unless the clip is a "canvas-wide" clip, in which case `inputRect` can crop the decode region (software `Player` cannot crop at decode on all backends today; start by decoding whole). Decode-bound cases (4K canvas over four Pi) need per-device pre-cropped files: the media pipeline tooling (ffmpeg crop per viewport at push time) is a later step.

### D5. Source plugin contract

```ts
// examples/video/mapper/src/sources/source.ts  (promote to a plugin export when a second app needs it)
interface SourceKind {
  kind: 'camera' | 'screen' | 'webview' | 'stream' | 'gphoto' | 'remote';
  label: string;
  platforms: string[];                      // from plugin.json targets keys: ['macos','linux','rpi1','android','ios']; derived, not typed twice
  available(): Promise<{ ok: boolean; reason?: string }>;   // runtime: permission, library present, device attached
  fields(): Field[];                        // the settings schema
  choices?(field: string, values: Values): Promise<Choice[]>;   // dynamic lists: cameras, screens/windows (+thumbnail), gphoto widgets
  open(values: Values): Promise<SourceHandle>;
  test?(values: Values): Promise<{ ok: boolean; message: string; width?: number; height?: number; fps?: number; latencyMs?: number }>;
}
type Field = { key: string; label: string; type: 'choice'|'text'|'url'|'number'|'bool'|'range'|'button';
               choices?: Choice[]; min?: number; max?: number; step?: number; default?: any;
               live?: boolean;                 // applied without reopening
               when?: { key: string; equals: any } };    // conditional fields (stream type -> url shape)
interface SourceHandle {
  image: number;                            // gfx runtime image id -> mapping.setImage(layer, image)
  width: number; height: number; fps: number;
  status: 'connecting' | 'live' | 'error'; error?: string;
  apply(key: string, value: any): void;     // live settings
  command?(name: string, args: any[]): void;   // remote control: webview eval/key/navigate, gphoto focus/capture
  close(): void;
}
```

Per source: **camera** fields = device (choice from `devices()`), size/fps (choice; needs the format list gap), mirror/brightness/contrast (live); **gphoto** fields = generated from `config()` widgets 1:1 (type mapping `radio|menu -> choice`, `range -> range`, `toggle -> bool`, `button -> button`), plus view size; **screen** fields = the `pickScreen` result (source choice with thumbnails, resolution 720/1080/source, fps 15/30/60, cursor) rendered by the editor, `getSources()` for the list, permission state; **webview** = URL, size, zoom, plus commands (reload, key, eval, click x y) from a "remote control" panel, needs the snapshot image (A1 gap); **stream** = type (`hls`, `rtsp`, `http`, `srt`/`udp` later), URL, transport (tcp/udp for rtsp), latency preset (low/normal), reconnect, `test()` shows codec/size/fps/first-frame delay; **remote** (sidecar) = discovered Zinc app + token. A source is a **clip type** in the show: `{source:'camera', sourceKind, settings:{...}}` next to today's `{media}` / `{source:'pattern'|...}`. Note the existing `clip.source` string means the mapping's built-in kinds (`pattern`, `solid`, `gradient`, `image`); a live source needs a new key (`live`) to avoid a clash in `isClip` (`services/show.ts`).

Runtime availability: the mapper builds the list at start from each linked plugin's `available()`, sends it in `hello.sources[]`; the editor greys what a given device cannot run (e.g. screen capture on a Pi) and the show plays a placeholder card with the reason on a device that cannot open a clip. `platforms` is read from `plugin.json` so a plugin declares it once. Only plugins **linked into the player build** can be offered (a plugin is compiled only into programs that import it): the mapper imports the source plugins unconditionally and relies on per-target `targets` to compile what exists; for platforms where a plugin has no target, a stub or conditional import is needed (**[A]** confirm how Z5003 behaves for an optional import; may need a `zinc.json` `plugins` switch or a build per target).

Where a live source runs: on the device that owns the hardware (a camera on the NUC feeds that NUC's layers); to appear on other devices it is re-served (D3, "live sources") with a playout delay. First version: sources are **local to a device** and a clip is assigned a `device` (default: all/any capable).

### D6. Editor

Add a **Devices** view (list from the master's `fleet`: name, role, platform, fps, load, clock offset/rtt, resyncs, media state with hash progress, `Identify` (flash the device's card), `Test pattern`, set `trim`, viewport rectangles drawn on a canvas editor for the fleet layout with drag to place and overlap highlighted) and a **Sources** panel in the library (kinds greyed per device, a form generated from `fields()`, live preview thumbnail, **Test**). The bottom bar (`StatusBar.tsx`) today shows one device; it becomes the master + a fleet dot row. The editor talks only to the master (`/state`, `/osc`, `/show`, plus new `/fleet`).

### D7. Staged plan (each step demoable alone)

State on 2026-11-05: steps 1 and 2 are done, measured between two windowed instances on one Mac (not yet between machines). The clock agrees within 0.3 ms round trip, using the arrival time the kernel stamps on each datagram; 24 of 24 columns ran on both, the shared times of their runs 0.06 to 0.19 ms apart in the median and 2 ms at most. Two windows on one display share a vsync: separate machines will add up to one frame, which video (step 3) and a real film (fleet-sync A) must measure. As built, step 2 differs from D2 to D4: no `--role` (a mapper leads as soon as it has devices), viewports are 0 to 1 with no canvas size, the setup and the show go whole on change (compared every 500 ms) rather than as a hashed `show` message, and the time goes through `runAt` in the frame loop.

Step 3 as built: the master is the film's truth and is never corrected; every 250 ms it sends each layer's `at` (shared time at which position 0 would have played) and each player steers to it, by rate within 200 ms, else by a seek 250 ms ahead (doubled on a miss) and a hold until that moment. Measured on one Mac, 30 fps film, frame by frame on the wall clock: pictures p50 0 ms, p95 33 ms (one film frame), playhead p50 under 1 ms when the machine is quiet, and the same after a player restart or a file arriving late. Copying a 270 MiB file at the same time: 17 MB/s, picture p95 33 ms, b's frame gaps p99 42 ms. The clock itself, checked on the wall clock for the first time: both machines agree within 0.1 ms. Not proved: two machines, Wi-Fi, a Pi or NUC decoding the film. Android (the system's `MediaPlayer`) does not follow.

| # | Step | Demo / test | Size |
|---|---|---|---|
| 1 | **Smallest: shared clock + a clock-driven test pattern over two viewports.** `plugins/fleet` clock (UDP probes, offset/drift), `mapper --role player --join <host>`, `/output/viewport` in `plugins/mapping`, new `/card sync`: a vertical bar sweeping the whole canvas at 1 canvas/s as a pure function of `FleetClock.now()` plus a big frame counter. Master and one player show left and right half. No video, no decoder, no seek. | Two instances on one Mac side by side: the bar crosses the seam continuously. Headless test: two processes, injected offset (`ZINC_FLEET_SKEW_US`) and delay, assert converged offset < 1 ms and equal bar position hash at given timeline instants. Film on two real machines with a phone at 240 fps (fleet-sync §5). | S-M |
| 2 | Roles, discovery, pairing, `fleet.json` (canvas + viewports), command replication with `at`, replicated show. Editor Devices view (list + layout canvas). `/fleet/...` OSC. | two instances: launching a column from the editor/OSC on the master changes both; kill the player and restart: it catches up | M |
| 3 | Done on 2026-11-05 between two instances on one Mac, see below. Media: size and date sync (not a hash), progress; `Player.seek/rate/playhead`; video follows the master's film (rate, or a seek ahead and a hold) | counter video on two Macs; p95 report (fleet-sync §5 A/B/C) | M-L |
| 4 | Done on 2026-11-05, as the README's OSC section. No `--osc-dialect`: their addresses never clash with the mapper's. Millumin counts from 1 (its page: "`[11]` to launch the 11th column"); Resolume's column addresses come from memory, not from its page. A plain Chataigne project, no module. Not done: master brightness, relative values, effects. Never tried against the real Chataigne, Millumin or Resolume | a scripted desk in `tests/t1/mapper.sh`; real Chataigne by hand | M |
| 4b | **Linux mapping backend (owner, 2026-11-05: right after 4; Pi and NUCs)**: the NUCs are Linux, this comes before sources | the mapper on a Pi and a NUC, then two machines for real | L |
| 5 | Source contract + camera + screen (macOS) + stream (`Player` network URLs + `test()`); editor Sources panel; availability by platform | camera fake and screen fake first (`ZINC_FAKE_CAMERA`, `ZINC_FAKE_SCREEN`), then real | M-L |
| 6 | webview image output, gphoto2 as source (on a real camera), remote/sidecar source | per source | L each |
| 7 | Failover (`term`, promote), Android MediaCodec path, live-source re-serve with playout delay, viewport-cropped media, EdgeBlend output pass, NUC/linux mapping backend (KMS) | | L |
| 8 | Interactive mapping from the master (stamped live edits, 30-60 Hz) | | later |

Blocker to schedule early: **`plugins/mapping` has no linux backend**, so NUCs cannot run the player until it exists (display-gl KMS or an SDL/GL backend on Linux) or the NUCs run macOS. Raspberry Pi: rpi1 target "builds, not run on hardware"; the Pi 3B+/4 decode path measured only in `docs/reports/raspberry-pi.md`.

### D8. What can be tested on one Mac with two instances

Works: clock exchange logic (loopback has ~0 asymmetry, so inject delay/skew with an env knob in the UDP path to prove filter and drift fit), roles/pairing/discovery (mDNS on the same host works; give each instance its own `ZINC_HOME`/working directory, because `show.json`, `mapping.json`, pairing keys and the link service port 7744 are per directory/host and would collide), command replication, show sync, viewport math (pixel-compare the two halves against a single full render via `ZINC_SHOT`), the sync-bar pattern, media hash sync, OSC dialects/feedback, the editor, all sources via the fake camera/screen. Run each with `ZINC_BACKGROUND=1`, distinct `--port`/`--web`. Not provable on one Mac: real Wi-Fi/Ethernet clock error, vsync phase between displays, HDMI/projector latency, Pi/NUC decode performance, Android. Both instances share one GPU and one display clock, so a measured "sync" there is always perfect in phase and says nothing about frame lock.

### D9. Chataigne test project

Put it in `examples/video/mapper/chataigne/` (not in `examples/chataigne`, which is a Zinc app that *controls* Chataigne): `mapper.noisette` (Chataigne project: an OSC module "Zinc Mapper" with output to the master's OSC port and input for feedback; custom variables for each device's `fps` / `clockOffset`; a state machine with actions Column 1..N -> `/column n`; a mapping from a Chataigne fader to `/layer/0/opacity`; trigger `/card sync`; a sequence that fires columns over time) and `module.json + zinc-mapper.js` (named commands Launch Column, Stop, Layer Opacity, Test Card, Seek, Device Test; named values from feedback: current column, playing clip, device state). Pattern: copy the structure of `examples/chataigne/chataigne-module/module.json` and its README. Test without Chataigne: a Node script in `tests/t1` that parses `mapper.noisette`/`module.json` for the addresses it uses and replays them over UDP to a headless mapper (the existing `tests/t1/mapper.sh` and `tools/fake-chataigne.mjs` are the starting points), asserting `/column` takes effect and feedback arrives. Whether Chataigne itself opens the project is **unverified** (same caveat as the existing project: hand-written from source, never opened in a real Chataigne).

## E. Not verified

- No code run, no windows opened, nothing built. All performance and precision figures are [A]/[K] except those quoted from repo reports.
- Millumin ports and 0/1-based column indexing; Resolume column/clip `connect` addresses and feedback (page omits them).
- That FFmpeg in the Pi/NUC builds has `http/https/tls/rtsp` protocols; whether `Player.add(url)` works at all for HLS/RTSP; behaviour on live streams (no duration, no loop).
- `zinc:osc` (short) sending/replying details, and whether `mapping.android.cpp` / `rpi1` accept any runtime image (host does; android/rpi1 not read).
- Real camera (macOS) / gphoto2 hardware / Linux V4L2 / Android camera paths: written, never run.
- What the owner means by "sidecar" as a source (assumed another Zinc app/screen via `zinc:remote`).
- How an optional plugin import behaves per target (Z5003) for sources missing on a platform.
- NUC OS: if Windows, neither `mapping` nor `display-gl` supports it; if Linux, `mapping` does not support it yet.
