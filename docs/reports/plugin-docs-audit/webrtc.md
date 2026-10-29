# zinc:webrtc audit

## What it is
The Web's RTCPeerConnection for Zinc: peer-to-peer data channels and audio/video calls, with STUN/TURN, on libdatachannel. Two programs, or a program and a browser, with no server on a LAN.

## Targets and status
plugin.json: macos, linux, rpi1, ios builds; `web` entry (the page's own WebRTC); `requires: ["net","threads"]`. Tests: `tests/t1/webrtc.sh`, `webrtc_media.sh`, `webrtc_chat.sh`, `webrtc_call.sh`, `tests/t2/webrtc_interop.sh` (headless Chrome). Windows and Android have no build; H.264 only through VideoToolbox on macOS.

## What the docs have
- [x] overview, quick start (data channel and call), very complete support tables, codecs, STUN/TURN, privacy, how it runs, size, tests, not-supported list
- [x] two runnable examples (`examples/webrtc-chat`, `examples/webrtc-call`, with README)
- [x] screenshots exist (`examples/webrtc-call/screenshots/{idle,main,phone-dark}.png`) but are not shown in the doc
- [ ] step-by-step tutorial, commands section, troubleshooting, coturn guide

## What is missing
1. Embed the three webrtc-call screenshots and add one of webrtc-chat (`WEBRTC_DEMO=1 ZINC_SHOT=... zinc run examples/webrtc-chat`).
2. A tutorial "Chat in 10 minutes": the three signalling modes of webrtc-chat (this window, copy/paste, room with `signal-server.ts`) with exact commands.
3. A TURN guide for classrooms (coturn config, time-limited credentials), as in later.md.
4. Troubleshooting: connection stuck in `checking`, symmetric NAT, `a=setup` with Chrome, camera permission, why QuickJS timers fire early.
5. A "talk to a browser" recipe using `tools/webrtc-interop` as source.
6. A web-target paragraph (what `web/index.ts` gives).
7. Real two-machine / Internet verification (hardware, owner).

## Wrong or stale
- Doc: "The browser target (wasm): the page's own RTCPeerConnection would be the way, not this plugin." plugin.json and `web/index.ts` already implement exactly that.
- plugin.json lacks windows/android entries (consistent with doc "no build yet"), but the support table is prose only.
- `examples/webrtc-chat/README.md` says "the audio itself is not sent (audio tracks come later)"; audio tracks ship and webrtc-call uses them.

## Suggested pages
Webrtc (API, generated) / Guide: peer-to-peer in Zinc / Steps: chat with a data channel / Steps: a video call / Steps: signalling server / Notes: STUN, TURN, privacy, codecs / Examples: webrtc-chat, webrtc-call with screenshots / Interop with browsers.
