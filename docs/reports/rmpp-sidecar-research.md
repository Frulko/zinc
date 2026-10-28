# Sidecar for the reMarkable Paper Pro: prior art research (2026-10-28)

Goal: a macOS app makes (or mirrors) a display, captures it with ScreenCaptureKit, streams changed rectangles over USB networking (10.11.99.1 / 10.11.99.2) to an rMPP app (1620x2160, Gallery 3), which draws them in a fast mono waveform while moving and in colour/grey once settled. Pen and touch return to the Mac.
Method: GitHub API (`gh`), raw source files, Apple developer docs JSON, web search. "Not verified" marks anything I could not confirm from a primary source. Dates are the repo's last push (`pushed_at`) as of 2026-10-28.

## 1. OpenDisplay (peetzweg/opendisplay)

Repo: https://github.com/peetzweg/opendisplay. GPL-3.0 (versions up to v0.4.x were MIT), 5.9k stars, last push 2026-10-27, 356 commits. Mac, iOS, Android and Linux/Mac receivers. Protocol spec: https://github.com/peetzweg/opendisplay/blob/main/PROTOCOL.md (pv 3).

| Aspect | What it does | Source |
|---|---|---|
| Virtual display | Private `CGVirtualDisplay` (ObjC header `Mac/CGVirtualDisplayPrivate.h`, from Khaos Tian's example, same as DeskPad / BetterDisplay). Wrapper `Mac/VirtualDisplay.swift`. | [VirtualDisplay.swift](https://github.com/peetzweg/opendisplay/blob/main/Mac/VirtualDisplay.swift) |
| Modes | Exactly one mode per display: `CGVirtualDisplayMode(w, h, 60)` in points, `hiDPI = 1` for a Retina receiver (display = panel/2 points, backing store = panel pixels), `hiDPI = 0` (1x, streamed 1:1) for non-Retina panels. Mode list is replaced via `applySettings` on rotate or resize without destroying the display (destroying makes WindowServer shuffle windows). | same |
| Mode enforcement | macOS boots the new display in its 1x mode and may restore a stale saved mode seconds later, so a Task re-asserts the HiDPI mode every 200 ms until settled, then every 2 s. Falls back to 1x if macOS refuses 2x (`onModeRefused`). | same |
| Descriptor | `maxPixelsWide/High` = max(requested, 8192) (immutable after creation, so reserve headroom). `vendorID 0x5043`, `productID 0x4F53`, `serialNum` unique per concurrent display and stable per device (macOS keys saved arrangement on vendor/product/serial). `sizeInMillimeters` is passed in (computed from the panel). Large modes at creation can be refused, so it boots at a 3200x1800 envelope then promotes the same identity once ScreenCaptureKit sees it. | [VirtualCanvasSizing.swift](https://github.com/peetzweg/opendisplay/blob/main/Mac/VirtualCanvasSizing.swift) |
| Capture | ScreenCaptureKit, `SCContentFilter(display:)`. `minimumFrameInterval = 1/120` even for a 60 Hz display (asking exactly 1/60 made SCK skip early frames: ~51 fps measured). `pixelFormat = 420v` (matches encoder; BGRA is an A/B switch). `queueDepth = 8`. `showsCursor = !localCursor`. No `dirtyRects` use found in MacSender.swift (grep). Capped "latest frame wins" with 1 pending encode. | [MacSender.swift](https://github.com/peetzweg/opendisplay/blob/main/Mac/MacSender.swift) |
| Encode | VideoToolbox hardware, real-time, no B-frames, infinite GOP. HEVC when both ends have hardware HEVC (<=5120x2880), else H.264 (<=4096x2304). 4:2:0. Best preset ~18 Mb/s. Optional "refine" burst: N frames at boost x bitrate after motion stops. Keyframes carry SPS/PPS(/VPS). | README, PROTOCOL.md |
| Transport | One TCP connection, 4-byte length prefix, Annex B frames, `TCP_NODELAY`. The receiver listens on port 9000 and the sender dials, so Wi-Fi (Bonjour `_opensidecar._tcp`) and USB share one code path. USB: iOS via `usbmuxd` (`Mac/Usbmux.swift`), Android via AOA (`Mac/USBAccessory.swift`). Backpressure: max 3 frames pending, then drop at source; recover with a keyframe request (`kf`). Control messages are JSON in the same stream. | PROTOCOL.md sections 1-2, 5 |
| Input return | Receiver sends JSON `touch` (began/moved/ended, x, y) and, since pv 3, `pencil` (down/move/up, x, y, pressure, azimuth, altitude). `Mac/InputInjector.swift` posts `CGEvent` mouse/scroll events and, for the pen, a synthetic tablet (vendor 0x0D15, pressure + tilt + rotation + buttons). Needs Accessibility permission. Cursor can be drawn locally on the receiver (`cursorImg`, optional UDP cursor channel). | PROTOCOL.md section 6, InputInjector.swift |
| UI | SwiftUI `MenuBarExtra` plus a main window: device list, per-device display size, permission status, logs, Sparkle updates, quality presets (Best/Balanced/Fast). | OpenSidecarMacApp.swift |
| Latency | Cable, M5 Pro sender to 2017 5K iMac, capture-to-display: ~12 ms (Fast, 1440p, ~58 fps) to ~33 ms (5K scaled, ~29 fps). TCP over Thunderbolt: median 0.6 ms, p99 1.5 ms per frame; UDP/QUIC were not better on a cable. | [README](https://github.com/peetzweg/opendisplay#readme), [transport study](https://github.com/peetzweg/opendisplay/blob/main/research/transport-2026-09-30/README.md) |
| Entitlements | `OpenSidecarMac.entitlements` is an empty dict (no sandbox). | [entitlements](https://github.com/peetzweg/opendisplay/blob/main/Mac/OpenSidecarMac.entitlements) |

Takeaways for us: it is a video pipeline (H.264/HEVC) built for LCD receivers. Its Mac-side skeleton (virtual display lifecycle, mode enforcement, SCK settings, backpressure with latest-frame-wins, keyframe/refresh recovery, pen injection as a tablet) is reusable; its codec is the wrong tool for e-ink (see section 5). It never uses dirty rects, so we would add that ourselves. GPL-3.0: read it, do not copy code unless Zinc accepts GPL.

## 2. Screen-to-e-ink projects

| Project | Direction / transport / encoding | Waveform handling | Numbers | Licence, last push | rMPP? |
|---|---|---|---|---|---|
| [matteodelabre/vnsee](https://github.com/matteodelabre/vnsee) (ex rmvncclient; forks [ddvk/vnsee](https://github.com/ddvk/vnsee) 2020-12) | PC to tablet, VNC (libvncclient), RGB565 only, 1408x1872 fixed; touch/pen back as mouse. macOS server instructions "help wanted". | Writes the rM1/rM2 framebuffer, no waveform control | README: up to ~1 s extra latency on e-ink | GPL-3.0, 2021-08-29 (dead) | No (rM1/rM2, EPDC fb) |
| [Fallstop/macos-virtual-display-vnc](https://github.com/Fallstop/macos-virtual-display-vnc) | **Mac side only**: SwiftUI app, in-process `CGVirtualDisplay` (default **1620x2160 portrait "e.g. reMarkable Paper Pro"**) + patched macVNC (ScreenCaptureKit) on :5900, reachable at 10.11.99.x. Needs a VNC client on the tablet (none exists for rMPP that I found). Built on macOS 26. | none | none | GPL-2.0 (macVNC), 2026-06-21 | Display size targets rMPP; client side missing |
| [rien/reStream](https://github.com/rien/reStream) | Tablet to PC (reverse direction), SSH + lz4 + ffmpeg | n/a | n/a | MIT, 2026-06-10 | rM1/rM2 only per README |
| [owulveryck/goMarkableStream](https://github.com/owulveryck/goMarkableStream) | Tablet to browser (reverse), Go server on tablet, colour support | n/a | n/a | MIT, 2026-09-11 | Not verified for rMPP |
| [asivery/AppLoad-RMStream](https://github.com/asivery/AppLoad-RMStream) | Tablet to host, HTTP (reverse) | n/a | n/a | GPL-3.0, 2026-05-26 | AppLoad app, not verified |
| [bordaigorl/rmview](https://github.com/bordaigorl/rmview) | Tablet to PC viewer (PyQt) | n/a | n/a | GPL-3.0, 2025-10-08 | No |
| [blahgeek/rabbitink](https://github.com/blahgeek/rabbitink) | PC to IT8915 USB e-paper modules (Waveshare 6"/13.3"). Rust + wgpu. Row-diff packed 1 bpp over USB 2.0 (~28 MB/s). | Default `mono_bayers4`: A2 + Bayer ordered dither on GPU. Heuristics: big change (scroll) goes to DU, idle goes to a GC16 clear. Also `gray` mode (16 levels, Floyd-Steinberg). | Typing latency ~140 ms total: capture 2.5 ms, dither 3.5 ms, USB <1 ms, A2 panel update ~137-170 ms (27 C) | licence not set in GitHub metadata, 2024-01-20 | No (different hardware); best published design reference |
| [Modos-Labs/Glider](https://github.com/Modos-Labs/Glider) | Open FPGA e-ink monitor controller (DisplayPort/HDMI in) | Binary, 4-level and 16-level modes, hybrid auto switch, **hardware Bayer, blue-noise and error-diffusion dithering at no extra latency**, regional mode switching from host | latency-oriented, no single figure in README | NOASSERTION (see repo LICENSE), 2026-07-11 | No (hardware) |
| [szklsrz/kindle_second_monitor](https://github.com/szklsrz/kindle_second_monitor) | Kindle second monitor, no README | n/a | n/a | none, 2025-04-04 | No |
| Dasung Paperlike, Boox "Mira"/Onyx mirror, BetterDisplay | Closed source, nothing to read | | | | |

Gap: I found **no open-source screen-streaming client for the Paper Pro or Move** (searched GitHub for "remarkable paper pro", "vnc", "second screen", "external monitor"; web search found no hit either). Paper Pro repos found are about apps and tooling ([MaximeRivest/remagic](https://github.com/MaximeRivest/remagic), [paperterm](https://github.com/MaximeRivest/paperterm), [quill](https://github.com/MaximeRivest/quill), [riddle](https://github.com/MaximeRivest/riddle), [reTaskable](https://github.com/jdkruzr/reTaskable)). The VNC+virtual-display route (Fallstop + a new client) is the closest thing; nobody has published the rMPP client.

## 3. Virtual display on macOS

| Project | Notes | Licence, last push |
|---|---|---|
| [Stengo/DeskPad](https://github.com/Stengo/DeskPad) | Canonical open example; mirrors the virtual display in a window. Descriptor: name, `maxPixelsWide 5120 / High 2160`, `sizeInMillimeters 1600x1000`, `productID 0x1234`, `vendorID 0x3456`, `serialNum 1`; settings `hiDPI = 1` and a list of 60 Hz modes (32:9, 21:9, 16:9...). Runs **sandboxed** with a mach-lookup exception entitlement; no special display entitlement. README: needs Screen Recording permission, toggle off/on if it shows nothing. | MIT, 2026-02-28 |
| [KhaosT/CGVirtualDisplay](https://github.com/KhaosT/CGVirtualDisplay) | Origin of the private header. | Apache-2.0, 2021-02-17 |
| [Chromium `ui/display/mac/test/virtual_display_util_mac.mm`](https://github.com/chromium/chromium/blob/main/ui/display/mac/test/virtual_display_util_mac.mm) | Test utility. Uses a global-queue dispatch queue, `sizeInMillimeters = 25.4 * px / ppi` (this is how to get a correct ppi), colour primaries and white point set, `productID 0`, **non-zero vendorID needed on macOS 14, distinct serialNum per display on macOS 14**, mode = px/2 when hiDPI, `settings.rotation = 0`, refresh 60. | BSD-3 (Chromium) |
| [heeh02/superconnect](https://github.com/heeh02/superconnect), [lyonDan/vdscreen](https://github.com/lyonDan/vdscreen), [pacifistazero/vdisplay](https://github.com/pacifistazero/vdisplay), [pasky/hidpi-mirror](https://github.com/pasky/hidpi-mirror) | More CGVirtualDisplay users, all MIT, active Sept-Oct 2026 (hidpi-mirror: HiDPI on Apple silicon). Not read in detail. | MIT |
| [waydabber/BetterDisplay](https://github.com/waydabber/BetterDisplay) | Closed app (GitHub repo is the issue tracker/releases); creates virtual screens, "PIP/streaming". Active 2026-10-22. | proprietary |
| FreeDisplay | `free-display/FreeDisplay` does not exist; I found no canonical repo. Not verified. | n/a |
| go-macos/virtualdisplay | Not found on GitHub; not verified. | n/a |

API surface (from the headers above): `CGVirtualDisplayDescriptor` (queue, name, vendorID, productID, serialNum, maxPixelsWide/High, sizeInMillimeters, colour primaries, terminationHandler), `CGVirtualDisplayMode(width,height,refreshRate)`, `CGVirtualDisplaySettings` (`modes`, `hiDPI`, `rotation`), `CGVirtualDisplay(descriptor:)`, `applySettings:`, `displayID`.

Pitfalls (all from the sources above):
- Private API, undocumented, cannot ship on the App Store; capped at 60 Hz (OpenDisplay header comment). Works unsigned and unsandboxed (OpenDisplay ships with an empty entitlements file; DeskPad works sandboxed).
- Display is created at 1x and macOS may later restore a stale mode for that vendor/product/serial; enforce the wanted mode in a loop (OpenDisplay).
- Descriptor max size cannot change after creation; reserve headroom (8192). Creating directly at a big mode can be refused; start small, then apply the big mode (OpenDisplay).
- macOS 14: vendorID must be non-zero and serials unique per display (Chromium).
- Releasing the display makes WindowServer move windows; change modes in place for rotation (OpenDisplay).
- Reconfiguring the arrangement fades the screen 0.4-0.7 s and the fade cannot be disabled (OpenDisplay comment).
- Pick a stable serial so System Settings remembers the display position.
- For rMPP: 1620x2160 at 229 ppi gives `sizeInMillimeters` of about 180 x 240 mm. A 1x 1620x2160 desktop is tiny at 229 ppi (about 1.5x too small for comfort); a hiDPI 810x1080-point desktop is huge. Offer a custom 2x mode between (for example 1080x1440 points scaled) or render 1x and rely on macOS scaling. Needs trying on the device.
- macOS 15/26 specifics: only the macVNC project reports a working build on macOS 26 (Apple silicon); I found no documented regressions. Not verified further.
- The `pixelFormat`/refresh interplay: OpenDisplay measured ~51 fps when asking SCK for exactly 1/60 s (see section 4).

## 4. ScreenCaptureKit for a single display

| Item | Fact | Source |
|---|---|---|
| Dirty rects | `SCStreamFrameInfo.dirtyRects` (macOS 12.3+): rects that changed, "a union of the rectangles redrawn and moved". Read from `CMSampleBufferGetSampleAttachmentsArray(...)[0][.dirtyRects]`; WWDC22 recommends sending only those rects and having the receiver patch the previous frame. Moved content is included in the union, so scrolling returns big rects. | [Apple doc](https://developer.apple.com/documentation/screencapturekit/scstreamframeinfo/dirtyrects), [WWDC22 10155](https://developer.apple.com/videos/play/wwdc2022/10155/) |
| Pixel formats | The documented set is `BGRA`, `l10r`, `420v`, `420f` only. **No grayscale/OneComponent8 format is documented**, so do BGRA capture then convert on the GPU/CPU. (An undocumented format may fail; not tested.) | [pixelFormat doc](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/pixelformat) |
| Frame interval | `minimumFrameInterval` is a minimum between updates; output never exceeds the content's rate. OpenDisplay asks 1/120 for a 60 Hz display to avoid beat-frequency drops. For e-ink 1/30 is plenty. | [doc](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/minimumframeinterval), OpenDisplay MacSender.swift |
| Queue | `queueDepth` 3 to 8 (default 3); release buffers within `minimumFrameInterval * (queueDepth - 1)` or SCK stalls. | WWDC22 10155 |
| Cursor | `showsCursor` bakes the cursor into frames. For e-ink, set false and draw the cursor on the tablet (OpenDisplay `cursorImg`/UDP does this) so cursor moves do not dirty rects. | WWDC22, OpenDisplay PROTOCOL.md |
| Stable size | Keep output size constant; SCK scales in hardware; `updateConfiguration` changes settings live. | WWDC22 |
| Permission | Screen Recording TCC. Unsigned/ad-hoc dev builds: the grant is tied to the code signature, so each rebuild with ad-hoc signing silently invalidates it (toggle still shows on). Use a stable self-signed identity (`make-signing-identity.sh`). Accessibility is needed to inject input. | [Fallstop README](https://github.com/Fallstop/macos-virtual-display-vnc), [DeskPad README](https://github.com/Stengo/DeskPad) |

Idle frames: the frame `status` key exists, but I could not confirm the value names from Apple's text; check `SCFrameStatus` (`.idle`, `.complete`) in the SDK headers before relying on it. SCK sends no frame when nothing changes, which suits a static e-ink page.

## 5. Fast e-ink streaming techniques

### 5.1 What the rMPP exposes (API surface, not measurements)

| Path | Facts | Source |
|---|---|---|
| qtfb (xovi extension + AppLoad) | App gets a shared-memory framebuffer (`/qtfb_<key>`) and a Unix SEQPACKET socket `/tmp/qtfb.sock`. RMPP native size 1620x2160; formats RGB888 / RGBA8888 / RGB565; custom sizes possible (`MESSAGE_CUSTOM_INITIALIZE`). Messages: `UPDATE_ALL`, `UPDATE_PARTIAL(x,y,w,h)`, `SET_REFRESH_MODE`, `REQUEST_FULL_REFRESH`, user input (touch, **pen**, buttons, virtual keyboard), device-state/rotation. **Refresh modes: UFAST, FAST, ANIMATE, CONTENT, UI (default), SLEEP.** Clients: C++, Rust, Zig ([zqtfb](https://github.com/0xdeb7ef/zqtfb), 2026-10-04). | [common.h](https://github.com/asivery/rm-appload/blob/master/backends/qtfb-clients/cpp/common.h), [rm-appload](https://github.com/asivery/rm-appload) (GPL-3.0, 2026-10-06) |
| Quill (takeover) | Stops xochitl, drives the panel via the vendor `libqsgepaper` `EPFramebuffer`. Mono dirty-rect mode 0 ("best for live ink"), colour modes 3/4/5 for settled colour; mode 1 collapses to grey even with the colour content type. `full=0` keeps updates local (vendor may otherwise promote to a whole-panel refresh). Needs a wakelock during takeover. Raw evdev input. Calls the proprietary lib, not redistributable. | [quill](https://github.com/MaximeRivest/quill) (MIT, 2026-07-12), [epfb-re](https://github.com/asivery/epfb-re) (GPL-3.0, 2026-09-01) |
| Paperterm | Alacritty damage rects to qtfb `UPDATE_PARTIAL`, so only touched pixels refresh; touch and OSK over the same channel. Proof that qtfb partial updates work for a streaming-like use. | [paperterm](https://github.com/MaximeRivest/paperterm) (MIT, 2026-07-10) |
| Device facts | Pen `/dev/input/event2` X 0-11180, Y 0-15340, pressure 0-4096; touch `/dev/input/event3` X 0-2064, Y 0-2832; BusyBox, no python/gcc on device. Pen latency claimed 12 ms by reMarkable (vendor claim). | [remarkable-experiments](https://github.com/MaximeRivest/remarkable-experiments) (MIT, 2026-07-05) |
| Install | Developer mode, then remagic installs xovi and AppLoad on a Paper Pro. | [remagic](https://github.com/MaximeRivest/remagic) (MIT, 2026-07-13) |

**I found no published fps or per-update latency figure for UFAST or Quill mode 0 on the Paper Pro.** Treat any rMPP frame rate as unmeasured: it has to be benchmarked on the device (a qtfb test app that alternates UPDATE_PARTIAL rects of 100x100 / 810x1080 / full, in UFAST and FAST, timing to the next ack or camera).
Reference point from another controller: A2 on an IT8915 panel took ~137-170 ms per update (rabbitink above). Gallery 3 is a colour ACeP-style panel; expect same order or slower for colour, faster for mono fast modes. Not verified.

### 5.2 Dithering and refresh policy

| Technique | Evidence | Fit |
|---|---|---|
| Ordered (Bayer) dithering for A2/mono | rabbitink default `mono_bayers4` (GPU). FBInk thread: on Kobo/Kindle drivers only ordered dither is supported in hardware. Glider also offers blue-noise and error diffusion in hardware. Ordered is stateless per pixel, so a changed rect dithers identically and has no error propagation, which keeps partial updates artefact-free and cheap. | Use for moving content |
| Error diffusion (Floyd-Steinberg) | rabbitink `gray` mode (16 levels), described as better quality but not low latency. It propagates error across the rect so partial updates show seams. | Settled grey/colour pass only |
| Region-based mode switching | rabbitink: large changed area (scroll) goes to DU; idle goes to a GC16 clear. FBInk developer: use A2 automatically only for rapidly changing regions. Glider: host controls mode per region. | Same model fits qtfb: UFAST while changing, then CONTENT/UI refresh of the union rect after ~0.3-1 s idle |
| Periodic full refresh | KOReader exposes "Full refresh rate" (every N pages, never/99 to disable) on its e-ink settings (MobileRead report, PocketBook; settings differ per platform). A2/DU trade ghosting for speed; a full clear removes it. | Clear ghosting on idle, plus a manual "refresh" gesture |
| Quill/qtfb idea | Mono mode for motion; colour modes only for small settled areas. | Same |

I could not find KOReader's source for its fast-mode details (no primary source), so claims about its dithering choices are unverified.

## What to reuse / what to avoid

Reuse
- Tablet side: AppLoad + qtfb (GPL-3.0 host, clients C++/Rust/Zig). It gives 1620x2160 shared memory, `UPDATE_PARTIAL` rects, per-update refresh mode (UFAST to UI), and touch/pen events in one socket. It works without stopping xochitl. Quill's takeover path is lower-latency still but proprietary-library dependent and needs wakelock care; keep it as a later option.
- Mac side: the OpenDisplay lifecycle ideas (read, do not copy under GPL-3.0): single-mode `CGVirtualDisplay`, mode re-assertion loop, stable serial/vendor/product, reserve 8192 descriptor max, bootstrap-then-promote sizing, `minimumFrameInterval` 1/120 trick, latest-frame-wins backpressure, keyframe/refresh request, cursor drawn locally, pen injected as a synthetic tablet via `CGEvent`.
- Capture: SCK with `dirtyRects`, `showsCursor = false`, BGRA converted ourselves (no documented grayscale format), `queueDepth` 4-5.
- Transport: plain TCP with `TCP_NODELAY` and length-prefixed frames over the 10.11.99.x USB-network link, tablet listens, Mac dials (OpenDisplay's measurements: TCP beat UDP and QUIC on a cable). Raw 1-bit or 4-bit tile data with row/tile diff (rabbitink: ~1 bit per pixel over USB 2.0, <1 ms for typing) is likely enough; add lz4/zstd for colour tiles. No video codec.
- Display policy: ordered Bayer dither + UFAST while content changes, large changes to a faster/lower-quality path, then after idle an error-diffused grey or colour CONTENT/UI refresh of the dirty union, plus a timed full clear (rabbitink + Glider designs).
- Quick start for the Mac half: Fallstop's macos-virtual-display-vnc (GPL-2.0) already makes a 1620x2160 display; sizing `sizeInMillimeters` with `25.4 * px / ppi` (Chromium) gives the right ppi.
- Mac permission hygiene: a stable self-signed identity so the Screen Recording grant survives rebuilds.

Avoid
- H.264/HEVC: latency, 4:2:0, colour noise and ghosting-hostile dithering of lossy blocks; OpenDisplay's own quality levers (bitrate, refine bursts) are for LCDs.
- VNC/RFB for the final product: vnsee shows ~1 s e-ink latency, RGB565 and fixed-size limits; fine only as a first prototype using Fallstop's server.
- Error diffusion while moving (seams across partial rects, cost) and the UI waveform (default mode 4) for motion.
- Assuming rMPP frame rates: none are published; benchmark first.
- Whole-panel promotion: keep `full=0`/partial updates; a CompleteRefresh may flash the screen.
- Mixing GPL code into Zinc: OpenDisplay (GPL-3.0), rm-appload (GPL-3.0), vnsee (GPL-3.0), Fallstop (GPL-2.0). MIT sources: DeskPad, Quill, paperterm, remagic, zqtfb (check its LICENSE), reStream.
- Relying on private APIs for distribution: CGVirtualDisplay is private (no App Store) and may change; keep a "mirror an existing display" fallback.
- Closed tools (BetterDisplay, Dasung, Boox): nothing to learn from source.
