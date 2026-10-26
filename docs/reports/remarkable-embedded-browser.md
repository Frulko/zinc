# A browser on the reMarkable Paper Pro: what exists, what could run, what to do

2026-10-26. Question (owner): an embedded, light, "compatible with everything" browser on the Paper Pro with the features of Zinc Web, or else a
self-hosted relay that keeps today's design. Research only: no code changed, the tablet was not touched. Facts not verified at the source are marked *(unverified)*.

## Short answer

1. **A native browser for the Paper Pro already exists and is recent**: [rmweb](https://github.com/exp78/rmweb) (MIT, WPE WebKit, CPU rendering, v0.9.7 of 2026-09-26, 110 MB, beta). It proves that a modern WebKit runs on the i.MX8M Mini with 2 GB. It takes the whole screen (stops xochitl), has no ink, and its author says single-page apps do not work (no JIT).
2. **No engine gives "compatible with everything" on 4x A53 / 2 GB** at a size and effort that fit: WPE WebKit is the only realistic one (proven by rmweb); Chromium/QtWebEngine is too heavy, Servo and Ladybird are not ready for this target, NetSurf/litehtml lack the web's JavaScript.
3. **Recommendation: keep the design and self-host the relay** (Docker / Zinc binary + Chromium on a NAS, Pi or VPS). Measure rmweb on the tablet first with one cheap experiment; only if its pages are good and its RAM leaves room, embed WPE in a Zinc app as the second step.

## 1. What exists for reMarkable

| Project | Devices | State (source) | Notes |
|---|---|---|---|
| [rmweb](https://github.com/exp78/rmweb) (exp78; fork [leifan89/rmweb](https://github.com/leifan89/rmweb) for Libby) | Paper Pro (Move untested) | MIT, created 2026-07-31, v0.9.7 on 2026-09-26, last push 2026-10-17, 8 stars; verified on OS 3.28.0.164 (kernel 6.12.49). [Announcement](https://www.ereadersforum.com/threads/rmweb-0-9-0-a-native-web-browser-for-the-paper-pro-open-source.14905/), 26 Aug 2026, 0 replies | WPE WebKit, Skia CPU raster + Mesa llvmpipe, Qt6 `epaper` QPA to the panel. Reader mode (Readability), bookmarks, history, content blocking, cookies, forms, downloads (PDF/EPUB land in the library). Page turns 120-250 ms (author). 110 MB tarball under `/home/root/rmweb` (rootfs is 500 MB, ~91 % full). xochitl is stopped while it runs and restored on exit; AppLoad/XOVI only gives the launcher icon. Author: "no JIT, modern SPAs will not work". AI-assisted; its own code review of 2026-07-18 found security issues, fixed since |
| [AppLoad / qtfb](https://github.com/asivery/rm-appload), [remagic](https://github.com/maximerivest/remagic) | rMPP | maintained, what Zinc already uses | remagic ships Paperterm and a store, no browser |
| Toltec, Oxide, rmkit apps | rM1/rM2 | Toltec does not support the Paper Pro (Zinc doc) | the rM2 web-browsing options are listed in [BorednBookless](https://borednbookless.com/web-browsing-on-remarkable-2/): none targets the Paper Pro |
| NetSurf (framebuffer `libnsfb` with dirty-box + debounce, used by an old rM1 port), w3m/links | rM1/rM2 | no rMPP port found | see NetSurf row below |
| KOReader | rM2/rMPP via qtfb | maintained | reads ebooks and saved pages; not a browser |
| Official: [Read on reMarkable](https://support.remarkable.com/articles/Knowledge/Read-on-reMarkable-Google-Chrome-Extension) Chrome extension (v2.0.2, 2026-05) | all | official, needs a reMarkable account, Chrome only | sends a simplified article or PDF through the cloud: reading, no browsing, no links to follow |
| Third party: [Remarkify](https://chromewebstore.google.com/detail/apnmhpkakdfighcgcjfflnngohhjafbo), reCraft | all | third party (cloud API) | same idea, "send page" |
| reMarkable web app (beta) | any browser | official | notebooks in a browser, not a browser on the tablet |

No Chromium, Qt WebEngine or Oxide browser for the Paper Pro was found. The stock OS has no browser by design (TechRadar review). `xochitl` is Qt 6.10.3 Quick/QML (rmweb's [device profile](https://github.com/exp78/rmweb/blob/main/docs/device-profile.md)); the libraries listed there are Core/Gui/Qml/Quick/QuickControls2, no WebEngine *(unverified: run `ls /usr/lib/libQt6WebEngine*` on the tablet; WebEngine is Chromium, so it would be too heavy anyway)*. The GPU (Vivante GC7000 UL) has no driver: everything is software rendering.

## 2. Engines that could run on the device

Target: 4x Cortex-A53 (in-order), ~2 GB RAM + ~2.5 GB swap, aarch64 glibc 2.39, no GPU, output to a buffer we blit through qtfb. Scores are the RULES.md §4 weights (fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1; max 70).

| Engine | Modern web (JS/CSS) | RAM / CPU on A53 | Offscreen buffer | Licence | Build effort, size | Score |
|---|---|---|---|---|---|---|
| **WPE WebKit** 2.50 (Nov 2025, [notes](https://wpewebkit.org/blog/2025-11-27-wpewebkit-2.50.html)); Igalia `meta-webkit` has scarthgap recipes for 2.52, libwpe, wpebackend-fdo, Cog | full HTML5/CSS3 (Safari-class); JSC; rmweb reports no JIT on this device (reason not documented *(unverified)*, so SPAs are slow or fail) | proven on this exact tablet by rmweb; Skia CPU raster is the embedded default since 2.46 ([Igalia](https://blogs.igalia.com/carlosgc/?p=1016)); needs llvmpipe EGL for the compositor | yes: WPEPlatform headless / fdo exported SHM buffers, then our qtfb blit | LGPL-2 + BSD (a separately loaded plugin library, allowed by RULES §3) | hours-long cross build (rmweb: Docker + Yocto SDK, tens of GB); ~110 MB with Mesa and libs | **44** |
| **Servo** 0.1.0 on crates.io ([2026-04-13](https://servo.org/blog/2026/04/13/servo-0.1.0-release/)), monthly breaking releases, LTS planned | good and growing, SpiderMonkey JS (with JIT) | not measured anywhere I found; heavy (Rust + SpiderMonkey) | yes: `SoftwareRenderingContext` + pixel readback ([iced_servo](https://docs.rs/iced_servo) does it) | MPL-2.0 | Rust build, large; aarch64 Linux software path not documented *(unverified)* | 41 |
| **Ladybird** | own engine, alpha planned for 2026 on Linux/macOS ([site](https://ladybird.org/), [July newsletter](https://ladybird.org/newsletter/2026-07-31/)); no aarch64 Linux claim found | unknown; Qt/GPU-oriented UI | not an embedding API | BSD-2 | not an embedder | not scored (not available) |
| **NetSurf** 3.11 (Dec 2023) | CSS incl. flex, HTML5 partial; Duktape JS limited and off by default ([Habr](https://habr.com/en/posts/784304)) | very light, framebuffer frontend exists | yes (`libnsfb`) | GPL-2 (plugin only) | small, easy | 45, but fails "compatible with everything" |
| **litehtml** | HTML/CSS renderer only, no JS, no network | tiny | yes, you draw | BSD-3 ([Qt attribution](https://code.qt.io/cgit/playground/qlitehtml.git/tree/src/3rdparty/qt_attribution.json)) | trivial | good for a reader view, not a browser |
| **Ultralight** | WebKit-based, good HTML/JS | CPU renderer (SIMD Skia) exists | yes, BGRA buffer | proprietary core; free only non-commercial / < 100 k USD ([README](https://github.com/ultralight-ux/Ultralight)); ARM64 Linux unclear | closed binaries | rejected (RULES §3: open, proven) |
| **Sciter** | own HTML/CSS/script, not the web | light | yes | proprietary | n/a | rejected (not "the web") |
| **Chromium / CEF / QtWebEngine** headless on aarch64 | best compatibility | headless shell ~190 MB installed ([example package](https://repo1.msvsphere-os.ru/msvsphere/10/distroscope/en/packages/c/ch/chromium-headless-0:140.0.7339.127-1.el10_0.inferit.aarch64.html)); a desktop tab costs 250 MB+ and a 2 GB Pi 4 runs short at ~7 tabs ([LinuxLinks](https://www.linuxlinks.com/raspberry-pi-4-chronicling-the-desktop-experience-memory-usage/2/)); multi-process on 4 in-order A53 is slow; would fight xochitl and the Zinc app for 2 GB | yes (CDP screenshot) | BSD | needs a prebuilt for glibc 2.39 aarch64 (Debian/Ubuntu builds exist; Google Chrome for ARM64 Linux appeared mid-2026, [Linuxiac](https://linuxiac.com/google-chrome-is-finally-coming-to-arm64-linux/)); 190 MB+ on a 42 MB-free rootfs, so under `/home` | 32 |

Scoring detail (fit/perf/size/maint/licence/portability/effort): WPE 5/3/2/2/4/3/1; Servo 4/2/2/3/4/3/2; NetSurf 1/5/5/3/2/4/3; Chromium on device 4/1/1/2/4/2/1.

## 3. Self-hosted relay (keeps the design)

The relay is a headless Zinc server plus Chrome over CDP and already "runs the same on a Linux machine" (`app/web-relay/README.md`). Nothing in the tablet app changes: only the relay URL in Settings.

- **Where**: a NAS or home server with Docker (x86 or arm64), a Raspberry Pi 4/5 (4 GB+), or a small VPS. Chrome is the heavy part (~0.3-1 GB while a page renders); one tab at a time, which is the relay's design, so 2 GB is enough. Use Chromium (BSD) in the image rather than Google Chrome (proprietary terms). Official Chrome for ARM64 Linux now exists too.
- **What is missing in the repo**: a container image or a `zinc build` of the relay for linux (x86_64 and aarch64), a `--chrome` path default for the image, a `--bind 0.0.0.0` option if not present, and a systemd unit. Small.
- **TLS and auth**: today a bearer token over plain HTTP, fine on USB (`10.11.99.2`) or a LAN, not on the internet. For a VPS or remote use: put it behind Caddy/Traefik (automatic TLS) or, better, a WireGuard/[Tailscale](https://tailscale.com) link so the port is never public (does the tablet run it? Tailscale on rMPP is community work *(unverified)*; a WireGuard peer from the home router is the fallback). The relay drives a browser that can open any URL: block private/loopback/link-local targets (SSRF to the NAS and metadata endpoints), keep `http(s)` only (already), keep the token mandatory and rate-limited, keep the Chrome profile per user (cookies and logins live there).
- **Similar products**: [Browserless](https://www.browserless.io/platform/self-hosted) (Chrome as a service, REST screenshot API, arm64 image `ghcr.io/browserless/chromium`; open-source edition is source-available / SSPL-style, check the LICENSE before commercial use) is the same idea in generic form and could replace our CDP client, but it adds a Node service and loses our link map, e-ink CSS and Readability steps. The Read on reMarkable / Remarkify extensions and `rmapi` push articles through reMarkable's cloud: no interaction, no annotation per URL. Kiwix serves offline wikis; useful as a complement, not a browser.
- **Hybrid**: Chromium as the relay on the tablet itself: rejected by the table above (RAM, CPU, 42 MB rootfs, no headroom beside xochitl and the Zinc app).

## 4. Options scored (RULES.md §4)

| Option | Fit x3 | Perf x3 | Size x2 | Maint x2 | Licence x2 | Port x1 | Effort x1 | Total /70 |
|---|---|---|---|---|---|---|---|---|
| A. Status quo (relay on the Mac) | 3 | 4 | 5 | 4 | 4 | 3 | 5 | 55 |
| **B. Self-hosted relay (Docker / Zinc binary + Chromium)** | 4 | 4 | 5 | 4 | 4 | 4 | 4 | **58** |
| C. Ship/launch rmweb as is | 3 | 3 | 2 | 3 | 5 | 2 | 5 | 45 |
| D. Embed WPE WebKit in a Zinc app (offscreen to qtfb) | 5 | 3 | 2 | 2 | 4 | 3 | 1 | 44 |
| E. Embed Servo | 4 | 2 | 2 | 3 | 4 | 3 | 2 | 41 |
| F. Chromium / QtWebEngine on the tablet | 4 | 1 | 1 | 2 | 4 | 2 | 1 | 32 |

Reading: B wins on size (nothing on the tablet), performance (a real CPU renders, the tablet only shows PNGs), and on keeping every Zinc Web feature (ink per URL, tabs, dashboard, Readability, link map) that an on-device engine would have to be rebuilt around. D has the best fit (works offline, no server) but costs a multi-hour cross build, 110 MB, and a JS story that is worse than Chrome's today. The gap between B and D (14 points) is mostly effort, size and performance, so B first does not close the door on D.

## 5. Recommendation and first experiments

**Do B now; decide D from one measurement.**

1. **B (a few hours)**: on any Linux box (a Pi, the NAS): `zinc build app/web-relay` for linux, install Chromium, run with `--data`, `--port 8790`, token on; point the tablet at it over Wi-Fi/USB. Pass criterion: `tests/t1/web_relay.sh` fixture pages render and a tap on a link works from the tablet with the Mac switched off. Then wrap it in a Dockerfile + compose + Caddy/WireGuard note, and add the SSRF filter.
2. **D probe (about an hour, owner's tablet, no build)**: download the [rmweb 0.9.7 tarball](https://github.com/exp78/rmweb/releases), extract to `/home/root/rmweb`, run it, and record for five pages (Wikipedia article, Hacker News, a news site, GitHub README, one SPA): time to readable, `free -m` and the browser's RSS (`ps -o rss`) at idle and after loading, whether xochitl + the Zinc app still fit in RAM beside it, and whether the SPA renders at all. Also `ls /usr/lib/libQt6WebEngine*`. Go to D only if: typical pages are readable in < 10 s, peak RSS < 700 MB, and the owner accepts sites that need a JIT being slow or broken (fall back to the relay for those: a per-tab switch is a natural hybrid).
3. If D goes ahead: build WPE with the `meta-webkit` recipes as a plugin library loaded by a Zinc `webview` backend for the `rmpp` target (the plugin today supports macOS, iOS, Android only), render with WPEPlatform headless into SHM, blit through the existing qtfb driver. The Zinc app keeps xochitl running, so the pen, widgets and ink lanes stay available, which rmweb (xochitl stopped) cannot offer.

## Risks

- rmweb is one author, three months old, AI-assisted, beta; its `epaper` QPA path needs xochitl stopped, a different display path from Zinc's qtfb, and breaks on OS updates (the same applies to AppLoad/XOVI: a 3.28 update crash-looped older builds per its install notes).
- "No JIT" is a claim in an announcement; the cause (JSC build flag, W^X, A53 memory) is not documented. It decides whether D is viable and is checked by the probe above.
- WPE's cross build is long and large; rootfs has 42 MB free, so everything lives under `/home/root` and must survive OTA.
- Self-hosting moves the risk to a network service that drives a browser: SSRF, open relay abuse, cookies in the Chrome profile. Token + TLS/VPN + private-range block are required before it leaves the LAN.
- Chrome ARM64 Linux packages are new (mid-2026) and not announced on the Chromium blog; use Debian/Ubuntu Chromium for the image.

## Sources

[rmweb](https://github.com/exp78/rmweb), [rmweb thread](https://www.ereadersforum.com/threads/rmweb-0-9-0-a-native-web-browser-for-the-paper-pro-open-source.14905/), [rmweb device profile and research notes](https://github.com/exp78/rmweb/tree/main/docs), [WPE 2.50](https://wpewebkit.org/blog/2025-11-27-wpewebkit-2.50.html), [Igalia on Skia](https://blogs.igalia.com/carlosgc/?p=1016), [Servo 0.1.0](https://servo.org/blog/2026/04/13/servo-0.1.0-release/), [iced_servo](https://docs.rs/iced_servo), [Ladybird](https://ladybird.org/), [Ultralight](https://github.com/ultralight-ux/Ultralight), [NetSurf (Wikipedia)](https://en.wikipedia.org/wiki/NetSurf), [reMarkable Qt epaper docs](https://developer.remarkable.com/documentation/qt_epaper), [Read on reMarkable](https://support.remarkable.com/articles/Knowledge/Read-on-reMarkable-Google-Chrome-Extension), [Browserless self-hosted](https://www.browserless.io/platform/self-hosted), [Chrome for ARM64 Linux](https://linuxiac.com/google-chrome-is-finally-coming-to-arm64-linux/), [remagic](https://github.com/maximerivest/remagic), [rm-appload](https://github.com/asivery/rm-appload). Local: `app/web/README.md`, `app/web-relay/README.md`, `docs/targets/remarkable-paper-pro.md`, `plugins/webview` (docs/plugins/webview.md).
