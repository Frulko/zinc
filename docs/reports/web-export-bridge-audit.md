# Web export: assets and the features a browser cannot do (audit, 2026-10-18)

Read-only audit. Question: how does a Zinc app run or exported for the web handle assets and network/hardware features a browser lacks (Sonos UPnP, mDNS, raw TCP/UDP, MQTT, serial/USB, process, zinc:link, Spotify OAuth), and what would make it automatic: (1) a small asset server, (2) a bridge daemon behind the same plugin APIs. Paths are relative to the repository root.

## Exists and works

**The web target** (`zinc export --target web`, `zinc dev --target web`): the app's JS runs on the browser's engine with a thin JS host. Spec and scores: `docs/reports/zinc-web-export.md:1-30`; user page `docs/targets/web.md:1-17`. Code: `next/src/cli_web.cpp` (export ~l.650-815, dev server l.817-1200), `next/src/cli_web_deps.cpp` (npm pre-bundle), host `next/targets/web/runtime.js`. CLI entry `next/src/cli_core.cpp:1730` (export), `:3040` (dev). The older `wasm` target (ZBC interpreter in a worker, no plugins, needs COOP/COEP) is `docs/targets/wasm.md`, `next/tools/build-wasm`.

**Assets in an export** (`docs/targets/web.md:19-41`, `cli_web.cpp:696-706`):
- Separate files `assets/...<hash>.ext`, named by content (hash names), `_headers` with `immutable` one-year cache (`cli_web.cpp:749`), `index.html` and `sw.js` `no-cache`.
- Precompressed `.br`/`.gz` for what compresses (`cli_web.cpp:800-801`), MIME table (`cli_web.cpp:480`).
- Service worker `sw.js` (cache-first, offline after first visit, https/localhost only) and `manifest.webmanifest` (`cli_web.cpp:724-745`).
- Generated `serve.py`: static server on 127.0.0.1:8000, prefers `.br`/`.gz`, answers Range requests, correct MIME for webm/mp4/wasm (`cli_web.cpp:751-785`). Works for an export; any static host works too.
- Video is never preloaded: the `<video>` element streams it from its URL (`Asset.stream`, `cli_web.cpp:490`, `runtime.js:820`); codec check W0604 (`cli_web.cpp:178-199`). Images and fonts are fetched before the app starts and decoded (`runtime.js:820-843`); 40 MB download budget warning (`cli_web.cpp:706`).
- Models: three.js loads glTF through the browser (`docs/targets/web.md:218-240`, `zinc:three` web entry).

**Dev server** (`zinc dev --target web [--port] [--lan]`, `cli_web.cpp:1084-1200`): serves `/assets/` from the project, staged modules at `/stage/`, pre-bundled npm packages at `/__deps/`, HMR over its own WebSocket `/__zinc/ws` (`cli_web.cpp:1040`). `--lan` binds 0.0.0.0 (`:1090`). Plain `zinc dev --lan` (no `--target web`) is a different thing: it serves compiled code to the native app Zinc Go with a QR code (`cli_core.cpp:133`).

**Detection and reporting of "not on web"** (`docs/targets/web.md:242-262`; `cli_web.cpp:149-205`):
- Build time: `--check`/`--werror`; W0601 (browser lacks a feature, table `next/targets/web/browsers.json`), W0602 (native side has no browser backend), W0603 (program calls raw sockets/TLS, process, Yoga, asset packs, event loop; row list from tree-shaken code, `runtime.js:737` gives the runtime message), W0604 (video codec). `zinc explain W06xx`.
- Run time: `ZnUnsupported` (`error.code === 'ZN_UNSUPPORTED'`), shown as a bar in an export, an overlay in dev. `zinc:browser` `supports()/requireFeature()` (`plugins/browser/index.ts:26`, `plugins/browser/web/`); outside a browser it answers false so one source runs everywhere.
- Per-target capabilities: `targets/capabilities.json:15` (web: `net: true`, `process: false`, `fs: false`, `pack: "none"`, `deeplink: false`).

**Plugins with a web implementation** (a `web` key in `plugin.json`; 20): audio, browser, camera, canvas2d, gphoto2, lottie, map, microphone, midi, osc, physics2d, serial, socket, sqlite, svg, system, three, video, webos, webrtc. Three shapes: `web.entry`, `web.native`+`impl`, `web.wasm` (`docs/targets/web.md:304-320`, `docs/reports/zinc-web-export.md` Decision 4). Matrix with test status: `docs/targets/web.md:322-351`. Tests: `next/tests/t1/web_*.sh`, `webrtc_*.sh`.

**The one precedent of a bridge**: `zinc:osc/full` on the web takes `open(port, 'ws://relay')` and speaks binary OSC frames over a WebSocket; without a URL it throws ZnUnsupported (`plugins/osc/web/index.ts:2-6,39-43`, `docs/targets/web.md:345`). Tested only against a mock WebSocket.

**Remote machinery that exists natively** (reusable, none of it web-facing):
- Device agent `zinc agent` / `zinc device`: DNS-SD discovery, J-PAKE pairing, TLS 1.3 PSK sessions, one framed request per connection; ops include `connect` (relay to 127.0.0.1:port of the device), `listen`/`accepted` (reverse forwarding), `push/pull`, `shell`, `dev`, `top` (`docs/reports/zinc-next-agent.md:14-35,42-52,70-95`). Code `next/src/agent/`, frames `next/src/net/frame.h`, discovery `next/src/net/dnssd.cpp`.
- `zinc:link` (`plugins/link/index.ts:1-3`): same protocol between two Zinc programs; native only (`plugin.json` has macos/linux/android targets, no `web`).
- `display-remote` + `remote-view` (zinc:remote): TCP frame stream (RLE damage rects) plus input, token AUTH, UDP multicast beacon 239.255.90.1:7701 (`plugins/display-remote/remote_proto.h:1-19`).
- DevTools inspector (`plugins/devtools`, port 9229, CDP over WebSocket) and `zinc device inspect/shot` (`zinc-next-agent.md:156`).
- `zinc:socket` native: TCP/UDP/Unix/DNS/WebSocket client+server on the event loop (`plugins/socket/plugin.json`), used by sonos for SSDP (`plugins/sonos/index.ts:4,325`).
- `zinc:webrtc` native (libdatachannel) and its web twin under the same names (`docs/targets/web.md:327`); data channels need signalling (the demo uses a WebSocket relay, `docs/reports/zinc-webrtc.md:29`).

## Exists but partial

- **`zinc:socket` on web** (`plugins/socket/web/index.ts:1-27`): only `WebSocket` (+ events) works; `Socket`, `Server`, `Datagram`, `udp`, `connect`, `lookup`, `serveWebSocket` throw ZnUnsupported with the advice "use WebSocket, fetch or a data channel". No traffic test (`docs/targets/web.md:329`). This is where a bridge would plug in.
- **Asset serving**: the export server is a generated Python script, not part of the `zinc` binary and absent from the dev loop. The dev server (`cli_web.cpp:1035-1038,1077-1081`) reads each file whole, replies `Cache-Control: no-store`, `Connection: close`, no `Range`, no compression, no CORS headers: a video served by `zinc dev --target web` cannot seek (the export's `serve.py` can). Hash names exist in export only.
- **Service worker**: caches the listed files; it does not do Range slicing for cached video, and streamed videos are outside the pre-cache list (inferred from `Asset.stream`, `cli_web.cpp:490`).
- **Asset build not run for web**: zinc:assets rules, atlases, tilemaps, textures are skipped, so `examples/platformer` fails to start (`next/backlog/later.md:747`, no ZN id). `pack: "none"` for web in `targets/capabilities.json:15`; `.zpk` has no web reader: the browser path is the unstarted task ZN-449 ("Browser loading path: streaming compile, group packs, Cache Storage, KTX2", Backlog, `next/backlog/tasks/zn-449*.md`; `docs/zpk.md:51` says a group is "one request in the browser"). W0603 reports "asset packs" as unsupported. The wasm target only bakes images into `app.res` (`cli_core.cpp:1649-1650`).
- **`zinc:osc/full` relay**: the client half exists, the relay does not; "an OSC relay shipped with Zinc" is a later.md line without id (`next/backlog/later.md:739`).
- **Serial / MIDI / gphoto2**: Web Serial, Web MIDI, WebUSB implementations exist, Chromium-only (MIDI also Firefox), run against mocks only (`docs/targets/web.md:341-343`, `docs/reports/zinc-web-export.md` "Limits"; real-device pass is `later.md:740`).
- **`zinc:system`** partly (`docs/targets/web.md:333`): menus/tray accepted and ignored, shortcuts/autostart/updates answer unsupported.
- **zinc:http / fetch**: on web `fetch` is the browser's (`lib/std/fetch.browser.ts`), so CORS and mixed content apply in full. On native, fetch sends no Origin and does no CORS (`docs/guide/09-web-apis.md:97`), so code that works on the desktop silently depends on that.
- **Sonos on a browser**: `plugins/sonos/plugin.json` has no `web` key, so W0602 does not fire. It imports `udp` from `zinc:socket` (`plugins/sonos/index.ts:4`), which throws on web; its SOAP `fetch('http://<ip>:1400/...')` (`:74`) would be blocked by CORS (Sonos sends none) and, from an https page, by mixed content. Net result: discovery throws at run time, control cannot work. The doc table says "not yet: fetch and WebSocket over a proxy where the service has no CORS" (`docs/targets/web.md:350`), i.e. the proxy is planned in words only. Protocol facts: `docs/reports/sonos-upnp-api.md`.
- **Spotify on a browser**: `plugins/spotify/index.ts:1-5,97-135` calls `https://api.spotify.com` and `accounts.spotify.com/api/token` with `fetch`, which Spotify allows from browsers (PKCE is its browser flow), but the login is a Python script that writes `{client_id, refresh_token}` to `$ZINC_HOME/spotify.json` read with `zinc:fs` (`login.py`, `index.ts:97-105`); web `zinc:fs` is in memory (`docs/reports/zinc-web-export.md` "Limits"), so there is no login and no storage of the token. Redirect URI rules in `docs/reports/spotify-web-api.md:16` (https or loopback IP) fit a page. Needs a browser-side PKCE login + `localStorage` token, not a bridge.
- **examples/music** (`examples/music/zinc.json`): targets macos, linux, sim, android only; no `web` target; imports zinc:sonos, zinc:spotify, zinc:socket, zinc:link, zinc:webos, zinc:fs (src imports). It would export but Sonos, link, webos and Spotify login would not work. `examples/music-tree` is untracked, same shape.

## Missing

- **No `zinc run --web`**: web is only `export` and `dev --target web` (`cli_core.cpp:112,133`); no flag on `run`.
- **No asset/web server inside the `zinc` binary** for exports (a Python file is generated); no `zinc serve`; no shared server code between export preview and dev; no Range, compression, ETag in the dev server.
- **No bridge**: no daemon, no protocol, no WebSocket gateway to TCP/UDP/mDNS/serial/process anywhere in the tree. A grep of `docs/reports`, `plugins`, `next/src` for proxy/relay/bridge finds only the OSC client half, the TCP forwarding of `zinc agent` (workstation-to-device), and docs saying "over a proxy" (`docs/targets/web.md:350`). Names containing "bridge" in docs are the accessibility bridges (`docs/reports/zinc-next-a11y-bridges.md`), unrelated.
- **No browser-side `zinc:link`, `zinc:process`, `zinc:ffi`, `zinc:script`, `zinc:webos`, display plugins, MQTT** (no MQTT plugin exists in `plugins/`); `zinc:mapping`, `zinc:sonos`, `zinc:spotify` "not yet" (`docs/targets/web.md:350-351`).
- **No mDNS from a page**: nothing in browsers; `next/src/net/dnssd.cpp` is native only.
- **No capability field for "needs a bridge"**: `plugin.json` `web` has `entry/native/impl/wasm/needs` only; `capabilities.json` is boolean per target; W0602/W0603 cannot say "works with a bridge".
- **No bridge discovery / pairing from a page**: the agent's J-PAKE/TLS-PSK is not usable by a browser (no raw TLS-PSK, no PAKE); a page would need a token in the URL or a WebAuthn/WebCrypto scheme.
- **No `.zpk` reader in the web host**, no Cache Storage use, no KTX2 transcode (ZN-449, Backlog, frozen).
- Backlog is frozen (`AGENTS.md`): new work is only a line in `later.md` or a task with a `New-task:` trailer. Mentions found: `later.md:739-747` (OSC relay, asset build on web, real-device pass), `later.md:544` (camera note), ZN-449, ZN-563.03 (zinc:3d on wasm, Backlog), ZN-135 (wasm target), ZN-433/436/435 (zpk, assets v2, loading), ZN-631 (dev client over LAN). No task exists for a bridge or an asset server.

## Design sketch of what would make it automatic (not built)

1. **Asset server** (small): move the generated `serve.py` logic into the engine's existing dev HTTP loop (`cli_web.cpp:1084`), add Range, ETag, gzip/br from the precompressed files, hash names in dev too; `zinc run --web`/`zinc serve dist/x-web` start it with `ZINC_BACKGROUND` semantics (nothing opens a window). `.zpk` served as one file with Range so the web host can read group entries (matches `docs/zpk.md:51`).
2. **Bridge** (`zinc bridge`, or a mode of `zinc agent` so it reuses pairing, DNS-SD, framing): WebSocket on 127.0.0.1 (and LAN with a token); JSON control + binary frames; services `udp`, `tcp`, `dns`, `mdns`, `http` (CORS-less proxy with host allowlist, e.g. port 1400 on RFC1918 only), `serial`, `process`; the ops mirror `zinc:socket`'s native spec. On web, `plugins/socket/web/index.ts` replaces its `no(...)` stubs with bridge calls when `globalThis.__zincBridge` or a configured URL is present; `fetch` to blocked origins goes through the `http` service; if no bridge answers, keep ZnUnsupported. Tell the user at build time: a new W-code "needs a bridge" from a `web.bridge: ["udp","http"]` key next to `needs` in `plugin.json`, and `supports('bridge:udp')` in `zinc:browser`.
3. With 2 in place sonos, osc, link (as a client of a bridge-hosted peer), mqtt-over-TCP and serial on non-Chromium browsers work with unchanged plugin code. Spotify needs only a browser PKCE login + `localStorage`.

## Summary (10 lines)

1. `zinc export --target web` and `zinc dev --target web` exist and are solid: hashed assets, br/gz, immutable headers, service worker, PWA, `serve.py` with Range (`cli_web.cpp:696-785`).
2. Assets are separate files; images, fonts and data are fetched whole before start, video streams; `.zpk` packs have no web path (ZN-449 Backlog, `pack: "none"`).
3. The dev server is minimal: no Range, no compression, `no-store`; there is no `zinc run --web` and no server inside the binary for exports.
4. 20 plugins have a `web` entry; the rest are reported at build time (W0601-W0604) and throw `ZnUnsupported` at run time; `zinc:browser` `supports()` lets code adapt.
5. `zinc:socket` on web is WebSocket-only; TCP, UDP, DNS and servers throw (`plugins/socket/web/index.ts`).
6. Sonos cannot work in a browser today (UDP SSDP throws, SOAP on :1400 has no CORS and is http); the doc promises a proxy that does not exist.
7. Spotify's API calls are browser-legal, but login and token storage are native (python script + `zinc:fs`).
8. The only bridge-like thing is the OSC client expecting a WebSocket relay; the relay itself is an unfiled later.md line.
9. `zinc agent` has the right ingredients (discovery, pairing, TLS-PSK, framed `connect`/`listen` forwarding) but is workstation-to-device, not browser-facing.
10. examples/music has no web target and uses sonos, spotify, link, webos: it would export but mostly not work.

## The 5 biggest gaps

1. No bridge daemon or protocol (UDP/TCP/mDNS/http-proxy/serial over WebSocket) and no hook in `zinc:socket`'s web entry to use one.
2. No "needs a bridge" metadata or diagnostic: W0602/W0603 and `plugin.json` cannot express "works with a bridge", so a Sonos app exports silently and fails at run time.
3. No in-binary asset server (Range, ETag, compression, hash names) for export preview and dev; no `zinc run --web`.
4. No web path for `.zpk` packs, asset-build outputs (atlases, tilemaps, textures) or Cache Storage (ZN-449, `later.md:747`).
5. Browser-side identity and storage for services (Spotify PKCE login, token in `localStorage`, `zinc:fs` persistence) and a CORS-less HTTP proxy for LAN devices.

## Reuse points

- `zinc agent` pairing, DNS-SD, TLS-PSK and frames: `next/src/agent/server.cpp`, `wire.cpp`, `next/src/net/frame.h`, `next/src/net/dnssd.cpp`; its `connect`/`listen` ops are already TCP relays.
- Native `zinc:socket` host (`plugins/socket`) as the bridge's backend: the bridge can run the same code the desktop app runs.
- The OSC web client (`plugins/osc/web/index.ts:39`) as the model of "WebSocket relay URL as the host argument", and `zinc:webrtc` data channels as an optional transport.
- Dev server HTTP loop and WebSocket upgrade (`cli_web.cpp:1035-1084`) to host both the asset server and the bridge endpoint.
- `web.needs` + `webCheckReport` + `webExplain` (`cli_web.cpp:149-205`) for a new "bridge" diagnostic; `zinc:browser` `supports()` for run-time checks; `ZnUnsupported` as the fallback.
- `targets/web/runtime.js` asset loader and `sw.js` generator (`cli_web.cpp:734-745`) for pack and Range support; `docs/zpk.md` group layout for one-request groups.
