# Target `rmpp`: reMarkable Paper Pro

```sh
zinc run examples/remarkable/notes                 # macOS: e-ink emulator at 1620x2160 (mouse = pen, right button = eraser)
NOTES_DEMO=1 zinc run examples/remarkable/notes    # scripted pressure-stroke replay
zinc build examples/remarkable/notes --target rmpp # static aarch64 ELF (docker zinc/sdk-rmpp)
zinc run   examples/hello --target rmpp            # runs it in the arm64 container, headless (ZINC_FRAMES/ZINC_SHOT work)
zinc export examples/remarkable/notes --target rmpp   # dist/notes-rmpp: binary + AppLoad manifest + icon + deploy.sh
zinc deploy examples/remarkable/notes --target rmpp [--device root@10.11.99.1]
zinc init myapp --template remarkable
```

A project opts into the screen driver with `"display": "rmpp"` in zinc.json (see the examples). Handwriting comes
from `zinc:ink` (`Ink`, `<InkCanvas ink={doc} />`); raw pen samples come from `zinc:gfx` (`penCount`, `penX/penY`,
`penPressure`, `penTiltX/penTiltY`, `penFlags`: `PenFlag.Down | Eraser | Hover`).

**Nothing here has run on a Paper Pro yet.** Everything below the "verified" line was checked on macOS and in an
arm64 container only (see the end of this document).

## Hardware and OS (research, 2026-09)

| | | source |
|---|---|---|
| SoC | NXP i.MX 8M Mini, 4x Cortex-A53 1.8 GHz, 2 GB LPDDR4 | device tree `ferrari.dtsi` in [reMarkable/linux-imx-rm](https://github.com/reMarkable/linux-imx-rm) (branch `rmpp_6.12.49_v3.28.x`); [product page](https://remarkable.com/products/remarkable-paper/pro/details/features) |
| display | 11.8" Canvas Color (E Ink Gallery 3 / ACeP), portrait 1620x2160, 229 ppi, RGB888 input | DT `display-info`; [remarkable.com/llms.txt](https://remarkable.com/llms.txt) |
| pipeline | LCDIF → MIPI-DSI → FPGA "cumulus bridge" → panel; waveforms computed in userspace (`libqsgepaper`: `EPFramebufferSwtcon`, `EPFramebufferAcep2`, LUTs `/usr/share/remarkable/ct33_{std,fast,pen,best}.bin`). No usable `/dev/fb0`, no waveform ioctl | DT + strings of the SDK's `libqsgepaper.so` |
| pen + touch | Elan SPI (`elants_spi`): "Elan marker input" (ABS_X 0–11180, ABS_Y 0–15340, pressure 0–4096, tilt ±9000 = 0.01°, `BTN_TOOL_RUBBER` eraser, ~480 Hz) and "Elan touch input" (MT type B, 0–2064 x 0–2832). Axes already match the portrait framebuffer (scale only) | kernel `drivers/input/touchscreen/elants_spi.c`; [KOReader device.lua](https://github.com/koreader/koreader/blob/master/frontend/device/remarkable/device.lua); [inkbridge findings](https://github.com/ClinShaiju/inkbridge/blob/main/docs/phase0-findings.md) |
| OS | reMarkable OS 3.x (Yocto "Codex"); 3.20+ ships glibc 2.39, 3.14–3.18 glibc 2.35; kernel 6.12 on 3.23+ | official SDK installers |
| developer mode | Settings > General > Paper Tablet > Software > Advanced; **factory reset**. `ssh root@10.11.99.1` over USB; password under Help > About > Copyrights and Licenses. `/` is read-only, `/home/root` writable. UI = systemd unit `xochitl` | [developer mode](https://developer.remarkable.com/documentation/developer-mode), [xochitl](https://developer.remarkable.com/documentation/xochitl) |
| official SDK | free, public: `storage.googleapis.com/remarkable-codex-toolchain/<ver>/…-ferrari-public-x86_64-toolchain.sh` (3.28: gcc 13.4, glibc 2.39, `aarch64-remarkable-linux`, ~500 MB) | [developer.remarkable.com/links](https://developer.remarkable.com/links) |

## Choices

**Toolchain: static binaries from Debian's native arm64 GCC** (`docker/sdk-rmpp`, `linux/arm64` image,
`-mcpu=cortex-a53 -static`). The official SDK is downloadable, but it is a 500 MB x86_64-host installer (aarch64 host
only from 3.27), and its glibc (2.39) makes binaries refuse to start on 3.14–3.19 tablets. A static binary has no glibc
dependency at all, builds at native speed on Apple Silicon (QEMU binfmt elsewhere, like `rpi1`) and `zinc run`
executes it in the same container. Cost: `zinc:net` (libcurl) is not available on `rmpp` (Z5003); the SDK route
(dynamic, sysroot 3.18 for glibc 2.35) is the upgrade path if it is needed.

**Display: AppLoad's qtfb** (xochitl keeps running). The panel has no kernel waveform API; the only drawing paths are
(a) Qt's `epaper` QPA with xochitl stopped ([docs](https://developer.remarkable.com/documentation/qt_epaper), Qt Quick
only), (b) calling `EPFramebuffer::swapBuffers` in the private `libqsgepaper` ABI ([quill](https://github.com/MaximeRivest/quill);
the signature changed in 3.28), (c) [rm-appload](https://github.com/asivery/rm-appload)'s qtfb: a shared-memory
framebuffer composited by xochitl, used by KOReader ([framebuffer_qtfb.lua](https://github.com/koreader/koreader-base/blob/master/ffi/framebuffer_qtfb.lua)).
(c) is the community standard, needs no private ABI and survives OS updates as long as AppLoad does, so
`plugins/display-rmpp/rmpp.cpp` implements it: `SOCK_SEQPACKET` `/tmp/qtfb.sock`, `MESSAGE_INITIALIZE` with
`QTFB_KEY` and `FBFMT_RMPP_RGB888`, `shm_open("/qtfb_<key>")`, `MESSAGE_UPDATE`(partial rect),
`MESSAGE_SET_REFRESH_MODE`, `MESSAGE_REQUEST_FULL_REFRESH` (protocol: `src/qtfb/common.h`). The server sleeps 1 s after
a mode change or full refresh on the sending connection, so those go through a second connection on its own thread.
Requires [xovi](https://github.com/asivery/xovi) + AppLoad on the tablet (e.g. via [Vellum](https://github.com/vellum-dev/vellum)
or [remagic](https://github.com/maximerivest/remagic); toltec does not support the Paper Pro).

**Refresh policy** (`plugins/display-rmpp/eink.h`, shared with the emulator). The runtime's damage rectangle is
rendered, then shrunk to the pixels that really changed (pixel diff against the last frame), then:

- small change (≤ 1/8 screen: pen segments, button feedback) → FAST (`REFRESH_MODE_FAST`, monochrome; KOReader notes
  FAST/UFAST lose colour); if the area had greys or colour it is queued;
- after 350 ms without updates the queued area is redrawn in QUALITY (`REFRESH_MODE_UI`, colour): colour ink appears
  right after the pen lifts, which is how xochitl behaves too
  ([review](https://ewritable.net/brands/remarkable/tablets/remarkable-paper-pro/));
- larger change → QUALITY; ≥ 60 % of the screen (page turn) or every 60 partial updates once idle → FULL (flash,
  clears ghosting).

Options (`zinc.json` `"display": { "driver": "rmpp", "full_every": 60, "upgrade_ms": 350, "dither": false }`).
`dither: true` quantizes QUALITY pixels ourselves (16 greys + 27-colour cube, 4x4 ordered dither: position-only, so
a partial update never changes pixels outside its rectangle); it is off on the device because xochitl's own ACeP
pipeline renders RGB. FAST is always black/white (ordered dither for greys).

**Input**: evdev directly (qtfb forwards pen pressure only, without tilt or eraser; xochitl does not grab the devices).
Devices are found by capability (`BTN_TOOL_PEN`, `ABS_MT_POSITION_X`), ranges come from `EVIOCGABS`; a reader thread
queues every pen report (~480 Hz), so nothing is lost while a frame renders, and wakes the idle main loop instantly.
The pen drives the UI pointer; fingers are ignored while the Marker is in range (palm rejection). Orientation override:
`ZINC_RMPP_PEN_ROTATE` / `ZINC_RMPP_TOUCH_ROTATE` (0/90/180/270). The app holds `/sys/power/wake_lock` while running.

**Ink latency path** (`plugins/ink/index.ts`): each pen sample becomes one 2-point stroke command at the end of the
frame, so the damage is just the new segment → FAST refresh of a few hundred pixels. Finished strokes are baked into
a runtime image with the same commands (identical pixels, so the pixel diff sees nothing to refresh). Stroke eraser
(Marker eraser end or the Eraser tool), undo (50 levels), clear, JSON (`toJSON`/`parseStrokes`) and SVG (`toSVG`,
round-capped polylines per width run: same geometry as the screen).

## Desktop emulator

On macOS/Linux, `display-rmpp` runs the same `eink.h` policy and shows its output in the SDL window: paper tint,
muted pigments, fast updates in black/white, colour arriving after the idle upgrade, a black flash on full refreshes.
`ZINC_EINK_LOOK=0` shows frames unchanged. Pens: SDL pen events (Wacom and other tablets; pressure, tilt, eraser tip),
else the mouse (left = pen at pressure 0.5, right = eraser). Give the project the device resolution with
`"targets": { "macos": { "width": 1620, "height": 2160 } }`.

## Install on the tablet

1. Enable developer mode (wipes the tablet), connect USB, `ssh root@10.11.99.1`.
2. Install xovi + AppLoad (Vellum or remagic).
3. `zinc deploy --target rmpp` copies `<name>`, `external.manifest.json` (`"qtfb": true, "disablesWindowedMode": true`)
   and `icon.png` to `/home/root/xovi/exthome/appload/<name>/`. In AppLoad, reload and launch it. Replace `icon.png`.
4. Without AppLoad (`QTFB_KEY` unset) the app runs headless and says so on stderr. Stopping xochitl
   (`systemctl stop xochitl`) does not give Zinc the screen: the panel needs xochitl's software TCON.

## What is verified and what is not

Verified here: conformance suite on `rmpp` (static ELF in the arm64 container, same bytes as the sim oracle, incl.
`tests/conformance/ink.ts`); `file` reports `ELF 64-bit LSB executable, ARM aarch64, statically linked`; the notes
app renders the scripted replay identically on macOS and in the container (headless frame); emulator screenshots
show FAST monochrome ink mid-stroke and the colour upgrade after.

To validate on hardware:

- qtfb attach, RGB888 byte order, partial updates, and whether our mode switches (FAST/UI/CONTENT, full refresh)
  behave as expected and quickly enough; the ordering between a mode change (control connection) and the next update;
- pen-to-glass latency of the FAST path through xochitl, and the `upgrade_ms` / `full_every` / fast-area thresholds;
- evdev discovery (both devices found, no rotation needed), pressure curve (`Stroke.segWidth` is linear), tilt sign;
- palm rejection feel, wake lock effect, exit by AppLoad's swipe-down gesture (SIGTERM handling);
- CPU cost of the full-row rasterization and pixel diff at 1620x2160 on the A53, memory (3 frame buffers ≈ 42 MB).
