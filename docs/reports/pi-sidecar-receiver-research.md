# Sidecar with a Raspberry Pi as the receiver (research, 2026-10-28)

Question: can a Pi (not the reMarkable Paper Pro) receive the Sidecar stream and drive a smaller e-paper panel? No code, no build, nothing run on a device.
Legend: **F** = fact with a source; **I** = inference (mine); **?** = not found / to measure.

## 1. Short answer

- **F**: Two families exist. (a) SPI/USB/I80 HATs with the IT8951 controller (Waveshare 6" to 10.3"): the host pushes pixels and picks a waveform. (b) FPGA "HDMI" e-paper monitors (Waveshare HDMI, Modos): the panel is a normal monitor and the controller does the waveforms.
- **I**: For Sidecar, family (a) fits `stream.h` (1-bit RECT -> 1bpp load + A2 area). Family (b) needs no receiver at all (the Mac already sees a display), but loses the tile-diff / blue-noise / pointer work and the control of waveforms.
- **I**: Best latency per euro for a Zinc-native receiver: Waveshare 7.8" IT8951 HAT (about 147 USD) on a Pi Zero 2 W or Pi 4. Best absolute latency: Modos dev kit (13" 699 USD / 6" 249 USD), but it is a different project (no receiver, HDMI/USB-C).
- **I**: A Pi receiver is smaller than the rMPP (see section 5) but removes its worst limit: **the panel drive time (rMPP about 1.4 s per update in every reachable mode, owner's measure)** versus A2 on a mono panel (waveform of the order of 100-300 ms, **?** not published per panel).

## 2. Panels and controllers a Pi can drive

| Option | Size / res | Interface to Pi | Refresh (vendor / measured) | Price (source date) | Fits Sidecar? |
|---|---|---|---|---|---|
| Waveshare 7.8" e-Paper HAT (IT8951) | 7.8", 1872x1404, 16 grey | SPI, USB, I80 | full "450 ms" and "<1 s" table; partial "about 0.3 s"; A2 not documented. [Waveshare 7.8"](https://www.waveshare.com/7.8inch-e-paper-hat.htm) | 146.99 USD (same page) | Yes: 1bpp load + A2 |
| Waveshare 9.7" HAT (IT8951) | 1200x825 | SPI, USB, I80, I2C | full <1 s; GIF demo about 7 fps "limit"; A2 mode 6, 1bpp only. [wiki 9.7"](https://www.waveshare.com/wiki/9.7inch_e-Paper_HAT) | ? | Yes |
| Waveshare 10.3" HAT (D) (IT8951 likely) | 1872x1404 | USB, SPI, I80 | full <1 s [listing via search, Waveshare product list](https://www.waveshare.com/product/raspberry-pi/displays/e-paper.htm?p=1) | about 198-203 USD ([search snippet](https://core-electronics.com.au/waveshare-10-3inch-e-paper-display-hat-for-raspberry-pi-black-white.html)) | Yes |
| Waveshare 6" HAT (IT8951) | 1448x1072 | SPI/USB | full <1 s, partial about 0.3 s. [welectron](https://welectron.com/Waveshare-15852-6inch-e-Paper-HAT) | ? | Yes (smallest, cheapest) |
| Waveshare 13.3" HAT (K) | 1600x1200 | SPI | 5 s, 4 grey, not IT8951 in the results. [wiki](https://www.waveshare.com/wiki/13.3inch_e-Paper_HAT_(K)_Manual) | ? | No (too slow) |
| Waveshare HDMI e-paper 7.8" / 10.3" / 13.3" (FPGA) | 1872x1404 / 1872x1404 / 1600x1200 | HDMI + USB power | "15 Hz" in A2 (fastest setting 5); "low latency", no ms. [7.8"](https://www.waveshare.com/7.8inch-hdmi-e-paper.htm), [10.3"](https://www.waveshare.com/10.3inch-hdmi-e-paper.htm). **All three marked discontinued.** | 10.3": 316.99 USD, discontinued | Not as a receiver; plain monitor |
| Modos Paper dev kit (Caster FPGA + Glider) | 6" 1448x1072; 13.3" 1600x1200 | HDMI or USB-C (DP alt) | up to 75 Hz (kit) / 60 Hz (Caster text); gateware delay <20 us; binary, 4 and 16-level modes, regional updates, dithering. No touch. [Crowd Supply](https://www.crowdsupply.com/modos-tech/modos-paper-monitor), [Liliputing](https://liliputing.com/modos-paper-monitor-is-an-open-hardware-13-3-inch-e-ink-monitor-crowdfunding/) | 6": 249 USD, ships 2027-01-29; 13": 699 USD in stock (Crowd Supply) | Monitor, not a receiver |
| Waveshare small SPI panels (2.13", 4.2"...) | 250x122 and up | SPI | 2.13": partial 0.3 s, full 2 s; "do not use partial continuously". [welectron](https://welectron.com/Waveshare-12915-213inch-e-Paper-HAT), 4.2" about 5 s full (ambiguous) | cheap | No: far too slow and tiny |
| Inkplate (ESP32) | 6", 10" | own board, not Pi | 6": partial 0.264 s; 6MOTION: partial 91 ms, B&W full 500 ms. [Inkplate 6](https://www.crowdsupply.com/e-radionica/inkplate-6/updates/successfully-funded-also-third-party-master-controllers-and-partial-updates), [6MOTION](https://thepihut.com/products/inkplate-6-motion) | ? | Alternative host (Wi-Fi), not Pi |
| EPDiy (ESP32-S3 + raw parallel panels) | ED097/ED060... | own board | per-panel timings **?** (not found) [epdiy](https://components.espressif.com/components/vroland/epdiy/versions/2.1.3/readme) | DIY | Not Pi |
| DIY Pi DPI-driven raw EPD | - | - | **?** nothing found by search | - | Ignore |
| Good Display | - | - | no 7.8"/10.3" IT8951 module found; only small modules | - | Ignore |

Notes
- **F**: IT8951 modes (ESPHome page): DU fast B/W; GC16 16-grey; GL16; DU4; **A2 fastest, B/W only**, minimal ghosting. Only GC16 and DU verified on Seeed panels; other modes can render white as grey. [ESPHome](https://esphome.io/components/display/it8951/)
- **F**: Waveshare: A2 works in 1bpp mode only; INIT (mode 0) clears ghosting "after several A2 refreshes". [wiki 9.7"](https://www.waveshare.com/wiki/9.7inch_e-Paper_HAT)
- **F (secondary, source page not identified by my search)**: a Rust IT8951 driver on a Pi 4 + 9.7" reports DU about 195 ms (200x100) and 224 ms (full panel), waveform time nearly independent of area, and `load_image` waiting for a running refresh. Treat as indicative, **?** to reproduce.
- **F**: rabbitink (blahgeek) drives IT8951 over USB; per a PaperTTY issue it uses A2 or GC16 by colour count. [issue](https://github.com/joukos/papertty/issues/122). A kernel-module "IT8951 as Pi desktop" exists (Pi 3, 6", no numbers given). [it8951-pi-desktop](https://github.com/gigoh/it8951-pi-desktop/blob/master/README.md)
- **F**: IT8951 over USB = SCSI-over-mass-storage commands and needs a panel-specific firmware. [Waveshare USB FAQ](https://www.waveshare.com/w/upload/7/70/IT8951_USB_FAQ.pdf)

## 3. Latency budget

Reference, rMPP (owner's measures in `stream.h`/README): panel drive about 1.4 s per update in every reachable mode, 85 Hz LCDIF, small-rect round trip under 3 ms (receiver side). The rMPP is limited by the **panel**, not by transport.

| Stage | Pi + IT8951 SPI | Pi + IT8951 USB | Modos / HDMI monitor | rMPP (today) |
|---|---|---|---|---|
| Mac -> receiver | USB gadget Ethernet or Wi-Fi: ping about 0.56 ms wired vs about 2.2 ms Wi-Fi on a Zero 2 W ([Vogons thread](https://www.vogons.org/viewtopic.php?p=1237539); unclear it was g_ether). No g_ether throughput number found (**?**) | same | none (video link) | USB cable, small |
| Receiver -> controller | SPI, see below | USB mass-storage SCSI, **?** | HDMI scan-out | memcpy to qtfb |
| Pixel load | 1bpp 1872x1404 = 328 KB full frame; typical 32x16-tile rect a few KB | same | n/a | n/a |
| Panel waveform | A2/DU: of the order of 0.1-0.3 s (**F** DU 195-224 ms above; vendor "partial about 0.3 s") | same | one frame at 60-75 Hz, i.e. about 13-17 ms **vendor claim** (Modos), Waveshare HDMI 15 Hz = about 67 ms | about 1.4 s |

SPI numbers
- **F**: Waveshare wiki: Pi 4B must use SPI divider 32 (16 gives errors); the faster divider only helps Pi 3. [wiki 9.7"](https://www.waveshare.com/wiki/9.7inch_e-Paper_HAT)
- **F (same unnamed Rust driver source)**: measured 2.73 MB/s at 24 MHz, 3.70 at 32, 4.21 at 40, 4.85 at 48 MHz.
- **I**: Waveshare's code on a Pi 4 is therefore slower than that (divider 32 of the 250 MHz core clock is about 8 MHz, about 1 MB/s; arithmetic, not measured). A 328 KB full 1bpp frame: about 70 ms at 4.85 MB/s, about 330 ms at 1 MB/s. A typed line (about 20 KB) 4-20 ms. Dirty-tile traffic is small, so SPI is acceptable once the bus is tuned (use a larger transfer size: the Rust note says 4 KiB default transfers hurt).
- **I**: a Pi 5 needs its own SPI path (RP1); not verified. Pi Zero 2 W is enough CPU for lz4 + 1bpp (the Zinc fbdev driver already runs on a Pi 3B+, see `docs/reports/raspberry-pi.md`).

End-to-end estimate (**I**, not measured)

| Action | rMPP now | Pi + IT8951 A2 (7.8"/10.3") | Modos 13" |
|---|---|---|---|
| Typed character (small rect) | about 1.4 s to settle, panel-bound | about 0.2-0.35 s (3-20 ms network+load, then waveform) | about 20-50 ms plausible (vendor <100 ms claim from [search summary of notebookcheck coverage](https://www.notebookcheck.net/Modos-E-Ink-display-supports-impressive-75-Hz-refresh-rate.1080417.0.html)) |
| Pointer move | dot, rate-limited by the 1.4 s drive | one A2 update per move, one at a time, about 3-5 per second | tens of Hz |
| Scroll (COPY) | copy in qtfb shadow + new strip | Pi shadow copy, then a load of the moved area: a large A2 area, 0.2-0.3 s | 60 Hz hybrid scroll (vendor) |

## 4. What Zinc already has (repo reading)

- **F (repo)**: `plugins/display-rmpp/stream.h` is the receiver (TCP 7710, messages RECT/MODE/FULL/CURSOR/POINTER/COPY/SET, ACK, lz4, `+ptr +lz4 +copy` handshake). It writes into qtfb's buffer; the panel part is specific to the rMPP (`eink.h`, `lane.h`, `models.h`, `rm2fb.h`).
- **F (repo)**: no IT8951, Waveshare or generic e-paper driver exists. `grep` finds e-ink only in the rMPP plugin, `plugins/ink`, and `targets/capabilities.json` (`"eink": "plugin"` for esp32, `true` for rmpp, `false` for `rpi1`). `boards/` holds only esp32-2432s022, pimoroni-scroll-phat, waveshare-esp32-s3-matrix (LED matrix, not e-paper).
- **F (repo)**: Pi display plugins are `display-fbdev`, `display-gl`, `display-remote`; `tools/device <user@host>` handles push/run/shot/profile on a Pi; the Pi test rig is a 3B+ (memory notes).
- **I**: reusable as is: `stream.h` framing and parser (it is header-only C++, depends on lz4, sockets), the Mac side unchanged. New: a panel back-end replacing the qtfb write.

Message mapping

| Message | Pi + IT8951 |
|---|---|
| RECT depth 1 | write rows into a Pi-side 1bpp shadow; `LoadImageArea` (1bpp packed) then `DisplayArea(A2)` |
| RECT depth 8 | quantise or GC16/DU4 load; rare in Speed preset |
| MODE | map: UFAST/FAST -> A2/DU, ANIMATE -> A2, CONTENT -> GC16, UI -> GL16 |
| FULL | INIT or GC16 full (clears A2 ghosting; Waveshare advises INIT after several A2) |
| CURSOR / POINTER | draw locally into the shadow, send the small area (as today) |
| COPY | memmove in the shadow, load the moved rectangle (no controller-side scroll known: **?**) |
| SET 1-3 (hold ms) | replace by the panel's busy flag: the hold is the Pi's own "one display in flight" |
| ACK | after the load (not after the waveform) to keep the Mac pipeline full; or after DisplayArea |
| INPUT / TURN / SCROLL / MENU | none on these panels: HATs have no touch and no pen; mouse and keyboard stay on the Mac. TURN could come from a fixed config |

Collision handling
- **F**: a `load_image` waits for a refresh in progress (Rust driver note, unnamed source); ESPHome's driver gates SPI on the HRDY pin. [ESPHome](https://esphome.io/components/display/it8951/)
- **?**: whether the IT8951 accepts a second display area while the first is driving, and what happens to overlapping pixels, is **not documented in anything I found**. **I**: assume one display in flight; merge dirty rectangles into one area while busy (the Mac-side "more" merge and `n_held` logic already do the same thing for the rMPP). Needs a one-hour bench test.
- **I**: the area x-extent is rounded to 32 px (ESPHome note), which matches the Mac's 32x16 tiles.

## 5. Recommendation

| Criterion | Pi + Waveshare 7.8" IT8951 HAT | rMPP (today) |
|---|---|---|
| Cost | about 147 USD panel + Pi Zero 2 W/4 (about 20-60 EUR) | owned |
| Resolution | 1872x1404 (300 dpi), mono | 11.8" colour; ours drives mono |
| Latency | 0.2-0.35 s to settle (**I**) | about 1.4 s |
| Pen / touch | none (**F**: no touch listed) | Marker + touch (better) |
| Frontlight | none (**F**: "No backlight") | yes (rMPP has one; not re-verified) |
| Colour | no | yes |
| Size | 7.8" | 11.8" |
| Typing / pointer | far better than rMPP, still 3-5 updates/s | worst |

Pick, in order:
1. **Prototype**: Waveshare 7.8" IT8951 HAT (about 147 USD) on a Pi 4 or Pi Zero 2 W (SPI first, USB later only if SPI is the bottleneck). Cheapest way to measure A2 on the real chain.
2. **Also consider (I)**: the Modos 6" dev kit (249 USD) as a Mac second monitor over USB-C: no receiver to write, probably the lowest latency of all, but it ships 2027-01-29 and loses Sidecar's dither/pointer work (the Mac would just see a display; one could still feed it the 1-bit picture from `main.swift`).
3. **Skip**: Waveshare HDMI e-paper (discontinued), 13.3" SPI HAT (5 s), small SPI panels, raw DPI/EPDiy projects.

Effort (**I**)
- Pi receiver: reuse `stream.h` parsing, new `it8951.h` back-end (SPI via `/dev/spidev`, HRDY on GPIO, 1bpp load, display-area, INIT/A2/GC16): about 3-5 days including bring-up; one more day for a `zinc` plugin / target profile (`capabilities.json` entry `rpi-eink`, `boards/` preset).
- Mac side: a size negotiation (`RMPP w h` header exists), no change otherwise; tone curve and dither stay valuable on a 300 dpi panel.

Risks
- A2 on a 1872x1404 panel might not be 100 ms: no vendor number; measure first (A2 full area, A2 small rect, DU).
- Overlapping/in-flight display behaviour of the IT8951 undocumented: may need a software queue (section 4).
- A2-only usage ghosts: needs periodic INIT/GC16 (the "clean" logic of the Mac already exists).
- SPI throughput on Pi 4 (divider 32 limit) and Pi 5 support unverified.
- Prices and stock come from search snippets of mixed dates; the Waveshare IT8951 prices differ strongly by retailer (e.g. 244 USD vs 147 USD for the 7.8").

## 6. Next steps (no action taken)
1. Buy 1x 7.8" HAT, run Waveshare's A2 demo on the Pi rig, log A2/DU/GC16 times for full, 200x100 and a text line.
2. Bench the in-flight display question.
3. Only then write the back-end.
