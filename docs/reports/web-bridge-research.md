# Web export: built-in server and local bridge (research, 2026-10-18)

Goal: `zinc run --web` / export starts a tiny server for the app and its assets, and a bridge daemon (WebSocket) gives the browser build what it cannot do (Sonos, SSDP/mDNS, raw sockets, serial, local files), with graceful fallback.
Conventions: each claim carries its source. `UNVERIFIED` = not confirmed from a primary source in this research. `[general]` = general engineering knowledge, no source fetched.

## 1. What browsers cannot do, and the escape hatches

- No raw TCP, UDP or multicast from a normal page [general]. Only fetch/XHR, WebSocket, WebTransport, WebRTC.
- Direct Sockets (raw TCP/UDP) exists only for Isolated Web Apps; the manifest needs the `direct-sockets` and `cross-origin-isolated` policies, otherwise constructors reject with NotAllowedError. https://developer.chrome.com/docs/iwa/direct-sockets
  The 2024 intent-to-ship said it reaches end users only where IWAs are supported (then ChromeOS only). Gecko: "closed without a position"; WebKit: "no signal". https://groups.google.com/a/chromium.org/g/blink-dev/c/5R0P_aYBWQI/m/rFMq-qYAEQAJ
  Current 2026 desktop status: UNVERIFIED. Conclusion: not usable for a plain website.
- Local Network Access (LNA) replaces Private Network Access (PNA, put on hold). Chrome 138 had an opt-in flag; the permission prompt launches in Chrome 142 (update of 2025-09-29). The permission is requestable only in secure contexts. Covers loopback (127/8, ::1) and local (RFC1918, link-local, fc00::/7, fe80::/10). https://developer.chrome.com/blog/local-network-access
  Rollout date discrepancy between sources (Sept 29 vs Oct 28 2025): https://support.beyondidentity.com/hc/en-us/articles/34457691192215-Managing-the-Chrome-v142Local-Network-Access-Prompt
- Mixed content: LNA-permitted requests are exempt from mixed-content blocking only if Chrome knows the target is local before DNS: private IP literal, `.local` name, or `fetch(..., {targetAddressSpace:"local"})`. A public name resolving to a local IP gets no exemption. https://developer.chrome.com/blog/local-network-access
- The PNA preflight (`Access-Control-Request-Private-Network: true` answered by `Access-Control-Allow-Private-Network: true`) was the old design. https://developer.chrome.com/blog/private-network-access-preflight
  The LNA post does not mention the header. Whether the daemon should still send it: UNVERIFIED; harmless to send. Always send correct CORS headers.
- WebSocket and WebTransport: not gated in Chrome 138 (WebRTC not gated either). https://developer.chrome.com/blog/local-network-access
  Chrome 147 gates WebSocket and WebTransport to local addresses behind the LNA prompt (secondary sources). https://www.phoronix.com/news/Chrome-147-Stable-Released , https://support.citrix.com/external/article/CTX696569/chrome-147-and-edge-147-local-network-ac.html
  Where prompts are suppressed by policy the connection is silently blocked (Citrix). WebRTC under 147: UNVERIFIED.
- Firefox: local-network permission for Strict ETP users in 149, everyone from 151, WebSocket included from 154. https://support.mozilla.org/en-US/kb/control-personal-device-local-network-permissions-firefox , https://linuxiac.com/firefox-154-adds-websocket-local-network-protection-and-new-ai-controls/
- Secure context: `http://localhost`, `127.0.0.1`, `*.localhost` are secure contexts. https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
  So a page served from the local Zinc server keeps service workers, SharedArrayBuffer (with COOP/COEP) and Web Serial/Bluetooth.
- Mixed content: loopback is treated as secure per MDN. https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content
  WebSocket case not covered by MDN: UNVERIFIED in spec text.
- Safari is the outlier: it has rejected `http://127.0.0.1` and `ws://127.0.0.1` from https pages for years (bug 173161, 2017). https://bugs.webkit.org/show_bug.cgi?id=173161
  A WebKit engineer argued loopback access is dangerous (bug 186039). https://www2.webkit.org/show_bug.cgi?id=186039
  A Safari 18 beta regression blocked localhost from https; marked RESOLVED FIXED, fix details unknown. https://bugs.webkit.org/show_bug.cgi?id=279249
  Current Safari 26 behaviour: UNVERIFIED, test first.
- Web Serial: Chromium since ~2020/21; Firefox desktop 151 (May 2026); Safari/WebKit oppose. https://theregister.com/2026/04/14/firefox_nightly_web_serial , https://news.slashdot.org/story/26/05/24/209218
  WebUSB/WebHID: Chromium only; Mozilla and Apple oppose. https://usefulangle.com/web-updates/post/80/firefox-decines-to-implement-web-usb-api
  Web Bluetooth: Chromium only (dated sources). https://www.beaconzone.co.uk/blog/browser-support-for-web-bluetooth/
- File System Access API (`showDirectoryPicker`): Chromium only, Safari/Firefox use OPFS and `<input webkitdirectory>` [general]. Not verified in this run: UNVERIFIED.
- WebRTC data channels reach a local peer, but need signalling (no discovery); mDNS ICE candidates are masked [general]. WebRTC is the one transport not gated by LNA in the Chrome 138 post.
- WebTransport needs HTTP/3 and a TLS cert (or a `serverCertificateHashes` pin, short-lived certs) [general]. Overkill for the bridge.

## 2. Bridge patterns in the wild

| Product | What it shows | Source |
|---|---|---|
| websockify | WS-to-TCP proxy; token plugin picks the target by URL param; auth plugin; `--web DIR` serves static files on the same port; WSS needs a cert the browser trusts | https://github.com/novnc/websockify |
| Home Assistant | WS API: server sends `auth_required`, client sends `auth` with a long-lived access token, server replies `auth_ok`/`auth_invalid`; numbered `id` per command, `result` with `success`/`error{code,message}`, `subscribe_events` streams `event` with the subscription id, `ping`/`pong` | https://contributors.home-assistant.io/core/internals/websocket-api/ |
| OBS WebSocket 5 | `Hello`(0) -> `Identify`(1) -> `Identified`(2); salt+challenge SHA-256 auth; `rpcVersion` negotiation; `eventSubscriptions` bitmask; `Request`(6)/`Response`(7); `RequestBatch`(8) with `executionType`/`haltOnFailure`; subprotocols `obswebsocket.json` and `obswebsocket.msgpack`; close codes 4000-4012 | https://raw.githubusercontent.com/obsproject/obs-websocket/master/docs/generated/protocol.md |
| Sonos local | UPnP/SOAP on the LAN is undocumented and unsupported but works on S2. The official local Control API is not available for wide release. | https://en.community.sonos.com/controllers-software-228995/local-upnp-control-on-s2-6842099 , https://en.community.sonos.com/smart-home-integrations-229108/upnp-s2-and-control-api-on-the-lan-6840238/index2.html |
| Sonos cloud | Cloud Control API with OAuth; code-to-token exchange needs the client secret so must be server-side; localhost redirect reportedly not accepted. CORS headers on Sonos cloud/speakers: UNVERIFIED (assume a browser cannot call speakers directly). | https://docs.sonos.com/docs/authorize |
| Spotify | PKCE for browser apps (43-128 char verifier, S256 challenge, no secret). Redirect: https required except loopback IP literals (`http://127.0.0.1:port`, `[::1]`); `localhost` not allowed; enforced for new apps 2025-04-09, all clients by Nov 2025 | https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow , https://developer.spotify.com/documentation/web-api/concepts/redirect_uri |
| Trezor Bridge | Local service on 127.0.0.1:21325 that the web page calls and that talks USB/HID. Origin allow-list claims come from low-quality SEO pages: UNVERIFIED; check trezord source. | https://github.com/trezor/trezord-go (not fetched) |
| Plex | Public DNS zone `plex.direct` encodes IPs in hostnames plus a per-server wildcard cert gives real HTTPS on private IPs. July 2026 forum reports of a CA-chain failure show the operational risk. | https://words.filippo.io/how-plex-is-doing-https-for-all-its-users/ , https://forums.plex.tv/t/stuck-plex-direct-certificate-unknown-ca-on-all-https-connections-macos/940582 |
| Philips Hue | Pairing = press the physical link button, get an application key. Bridge uses Signify private CA (older: self-signed); validate with bridge ID as hostname. CORS: UNVERIFIED. | https://hueblog.com/2025/05/24/philips-hue-improves-security-of-the-hue-bridge/ |
| Tailscale serve | Local 127.0.0.1 service becomes a tailnet-only HTTPS URL with a Let's Encrypt cert on `*.ts.net`; needs MagicDNS + HTTPS enabled in the admin console; LE rate limits apply | https://tailscale.com/docs/how-to/set-up-https-certificates.md |
| Tauri sidecar | Bundled binary per target triple; localhost server is one of several IPC options with its own security trade-offs | https://v2.tauri.app/develop/sidecar , https://v2.tauri.app/learn/sidecar-nodejs/ |
| Cloudflare tunnel, Syncthing GUI, Zigbee2MQTT, node-sonos-http-api, Ledger, Elgato | Not researched in this run: UNVERIFIED |  |

Auth patterns seen: long-lived token (HA), salted challenge/response with password (OBS), physical button (Hue), origin check (Trezor, unconfirmed), OAuth (Sonos/Spotify).

How https pages reach a local daemon, ranked [general plus above]:
1. Page served by the daemon itself (same origin, `http://localhost:PORT` or LAN IP): no mixed content, no cert, secure context on localhost. Recommended default.
2. Hosted https page + `ws://127.0.0.1`: works on Chrome/Firefox with an LNA prompt, uncertain on Safari (above).
3. Wildcard-cert trick (Plex style, or sslip/local-ip style): real HTTPS to LAN IPs, but needs a domain, DNS and cert operations and has a rotation risk. Not for v1.
4. Tailscale serve for remote/LAN HTTPS: needs a Tailscale account; optional recipe, not a dependency.

## 3. Protocol design

Candidates:
- JSON-RPC 2.0: id, method, params, result/error, notifications, batch. Tiny, ubiquitous, no binary or subscriptions defined (use notifications). Spec: https://www.jsonrpc.org/specification
- MessagePack-RPC / CBOR: compact binary encoding of the same shape. OBS already offers JSON and MsgPack through subprotocol negotiation (source in section 2). CBOR is a standard (RFC 8949) [general].
- gRPC-web / Cap'n Proto / tRPC: need codegen or HTTP/2 framing or a TS-only stack; no good fit for a C++ daemon plus a TS-subset runtime [general].
- Chrome DevTools Protocol: JSON messages with numeric ids, domains, events, plus `Target.attach` sessions [general; not fetched].

Recommendation: a JSON-RPC-2.0-shaped envelope over one WebSocket, OBS-style handshake, binary frames for media.
- Subprotocol `zinc.bridge.v1+json`, optional `+cbor` later (OBS precedent).
- Handshake: server `hello {protocol, bridgeVersion, nonce}`; client `identify {protocol, appId, token or pairing proof, subscribe}`; server `identified {negotiated, capabilities}`. Wrong version -> close code with a text reason (OBS uses 4010 for this).
- Capabilities: `{plugins: {"zinc:sonos": {version, methods:[...], events:[...]}, "zinc:socket": {...}}, limits:{maxFrame, maxStreams}}`. A web build asks once and caches; `bridge.capabilities` is callable again.
- Calls: `{id, method:"zinc:sonos.play", params}` -> `{id, result}` or `{id, error:{code,message,fix}}`. Use string ids; add a client `cancel(id)`.
- Events: `{method:"event", params:{sub, name, data}}` after `subscribe` (HA pattern); `unsubscribe`.
- Streams (media, socket data, serial): a binary frame = `[u8 kind][u32 streamId][payload]`; credit-based flow control (`window` grant messages) plus `bufferedAmount` watching on the browser side; `stream.open`/`close` as normal calls. UDP datagrams carry one datagram per frame.
- Reconnect: client exponential backoff with jitter; `resume token` is out of scope for v1, subscriptions are re-sent on reconnect; calls in flight fail with `bridge_disconnected`.
- Heartbeat: `ping`/`pong` call (HA pattern).
- Versioning: integer `protocol` plus per-plugin version; additive changes only inside a major.
- Discovery of the bridge (order): same-origin `/zinc-bridge.json` on the server that served the page; fixed well-known port (pick one, e.g. 48100; registered-port collisions: UNVERIFIED); a `?bridge=ws://host:port#token` URL or QR code printed by `zinc run --web`; mDNS `_zinc-bridge._tcp` advertised by the daemon (the browser cannot browse mDNS itself, so mDNS serves native clients and the QR text, not the page).
- Pairing: daemon prints a short code and QR; first connect sends the code, daemon returns a long-lived token stored per origin; subsequent connects send the token (HA/Hue model). Also enforce an `Origin` allow-list on the WS upgrade (the browser sets Origin and scripts cannot forge it) [general].

## 4. Serving assets (tiny server requirements)

- Range requests: Safari first probes with a small range and will not play audio/video unless the server answers 206 with `Accept-Ranges` and `Content-Range`; Chrome/Firefox tolerate 200. Also needs correct extension and `Content-Type`. https://dev.to/corevo/the-weird-case-of-streaming-in-safari-1a3b , https://blog.logrocket.com/streaming-video-in-safari/
- MIME: `.wasm` must be `application/wasm` for streaming compile [general]; also `.mjs`, `.webp`, `.mp4`, `.m4a`, `.ogg`, `.woff2`, `.zapp`/pack as `application/octet-stream`.
- Cross-origin isolation (SharedArrayBuffer, wasm threads): `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`); check `crossOriginIsolated`. Cross-origin subresources then need CORS or CORP. https://web.dev/articles/coop-coep , https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy
  Same-origin assets served by our server need nothing else; fonts from elsewhere need `Access-Control-Allow-Origin` [general]. Safari SAB support: UNVERIFIED.
- Caching: content-hashed filenames + `Cache-Control: public, max-age=31536000, immutable`; `index.html` and the service worker `no-cache`; `ETag`/`If-None-Match` for the rest [general].
- Compression: brotli/gzip for wasm, js, json, wasm-sized packs; never for already compressed media (and ranges must stay byte-exact on identity encoding) [general]. Precompress at export time, serve with `Content-Encoding` by `Accept-Encoding`.
- Service worker: precache the shell and wasm for offline; requires secure context (localhost qualifies, LAN IP over http does not) [general; secure-context rule source above]. So LAN access over plain http gets no service worker and no `crossOriginIsolated`: a real limitation. Mitigation: serve LAN over https with a local cert (see risks).
- What others do: `python -m http.server` has no range support in older versions and no COOP/COEP; Vite dev server needs a plugin or `server.headers`; Caddy and Go's `http.ServeContent` handle ranges and ETag. All [general], not fetched: UNVERIFIED for current versions.
- Single binary embedding: Bun `--compile` can embed assets (`--asset`, imports) https://bun.com/reference/bun/CompileBuildOptions/assets . For Zinc the C++ daemon already exists: embed the wasm shell with the engine, and read the app assets from the export folder with a ~200-line server using libuv/llhttp, both vendored already per AGENTS.md. No new dependency.

## 5. Graceful fallback design

- Each plugin declares per target a `web` support level in its manifest: `native` (browser API exists), `bridge` (needs the daemon), `none`.
- At startup the web runtime does feature detection (`'serial' in navigator`, `crossOriginIsolated`, `isSecureContext`, WebSocket reachable) and opens the bridge only when some used plugin needs it. No bridge, no prompt: avoids a pointless LNA prompt.
- Call result for a missing feature: the same typed error as everywhere, e.g. `unavailable` with `reason` (`no-bridge`, `blocked-by-browser`, `unsupported-browser`) and a `fix` string ("Run `zinc bridge` on this machine, or open http://localhost:48100").
- Browser-native substitutes first: fetch/WebSocket for HTTP/WS clients; Web Audio and MediaSession for audio and transport controls; WebRTC for peer data; Web Serial where present (Chromium, Firefox 151+); `<input type=file>`/OPFS instead of local files. Bridge only for UDP/TCP, SSDP/mDNS, Sonos SOAP, GPIO, arbitrary paths.
- Sonos on the web: no native path (no CORS to speakers, no UDP discovery) so bridge only; cloud Control API as a second backend needs a server-side token exchange, so also a daemon/server job. Spotify on the web: native fetch with PKCE, no bridge; redirect to `http://127.0.0.1:PORT/callback` served by the same local server.
- UI contract: the app can query `bridge.status` (absent, connecting, ready, permission-denied) to show a banner and a retry.

## Comparison

| Approach | Works on https pages | Needs install | Latency | Security risk |
|---|---|---|---|---|
| Daemon serves the page itself (same origin, localhost/LAN http) | Page is http, so the https case does not arise; localhost is a secure context | Zinc CLI only | LAN-local, lowest | Low: same origin, token + Origin check; LAN http is cleartext |
| Hosted https page + `ws://127.0.0.1` daemon | Chrome/Firefox yes with LNA prompt; Safari UNVERIFIED/likely problematic | Daemon | Low | Medium: any site could try; needs Origin allow-list + token |
| Wildcard cert on a public name (Plex style) | Yes, real HTTPS to LAN IP | Daemon + domain + cert ops | Low | Medium: key distribution, rotation, CA breakage |
| Tailscale serve / tunnel | Yes (https) | Tailscale account/agent | Medium | Medium: depends on tailnet ACLs |
| Browser-only (Direct Sockets) | Only in IWA | IWA install | Lowest | Low, but not widely available |
| Native browser APIs (Web Serial, fetch, Web Audio, WebRTC) | Yes | None | Lowest | Low (user prompts) but per-browser |
| Cloud relay (Sonos cloud, etc.) | Yes | Account/OAuth | High | Medium: secrets must live server-side |

## Recommended architecture

1. `zinc run --web` / export writes the static site (hashed assets, precompressed wasm, `zinc-bridge.json`) and starts one embedded server (libuv + llhttp, same binary as `zinc`): static files with 206/ETag/brotli/COOP+COEP, binds 127.0.0.1 by default, `--lan` binds 0.0.0.0 and prints a QR with the token URL.
2. The same process hosts `/bridge` (WebSocket, JSON envelope, binary frames) and exposes the host Zinc plugins that the page asked for: bridge plugins run natively in the daemon, the web runtime holds only thin proxies. One capability map, one error type.
3. Default is same-origin: the page and bridge share origin, avoiding mixed content, CORS and (for localhost) the LNA prompt. Hosted-page mode is opt-in with an Origin allow-list and a pairing token.
4. Auth: random per-run token in the URL fragment (never sent in requests) for localhost; pairing code to store a long-lived token for LAN/remote; reject missing/foreign `Origin`; refuse non-loopback binds without a token.
5. Fallback per section 5; an exported static site works without any daemon where the plugins have native web paths.

## Eight riskiest unknowns to test first

1. Safari 26 (macOS and iOS): does an https page reach `ws://127.0.0.1` / `http://127.0.0.1`? And does an http `localhost` page get a service worker, SAB and 206 video?
2. Chrome 147+ and Firefox 154+: exact prompt behaviour for WebSocket to loopback and to a LAN IP from (a) same-origin page (expected no prompt) and (b) hosted https page; does a denied/suppressed prompt fail silently (Citrix report)?
3. LAN-IP http page (phone opening `http://192.168.x.y:PORT`): no secure context, so no service worker, no `crossOriginIsolated`, no Web Serial. What breaks in the wasm build (threads) and is an https local cert (mkcert-style or wildcard trick) worth it?
4. COOP/COEP with video, fonts and the bridge socket together: does `require-corp` break any asset path or the WebSocket upgrade; Safari SAB status.
5. Backpressure and throughput of binary media over the WebSocket (video chunks, serial/UDP bursts): `bufferedAmount` behaviour in each browser and credit-window sizing; compare against a plain HTTP range for media (preferred for video).
6. Sonos from the web: confirm SSDP discovery plus SOAP via the daemon works with no CORS (the daemon proxies), and whether Sonos cloud OAuth is needed at all given the LAN path; check S2 firmware behaviour changes over time.
7. Pairing UX and token storage: QR scan from phone to a LAN daemon, token revocation, and DNS-rebinding defence (Host header check, Origin check) on the embedded server.
8. Spotify PKCE redirect through the local server: `http://127.0.0.1:port` (dynamic port allowed) from a browser build, token refresh with the app closed, and the daemon-less case.
