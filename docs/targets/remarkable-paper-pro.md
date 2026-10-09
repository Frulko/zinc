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

**Hardware feedback:** the initial driver was tested on a Paper Pro and showed excessive refreshes, missing colour
and no finger input. The revised partial-RGB/qtfb-touch driver is covered by a socket-pair test, but the user
reports that FAST still has unacceptable handwriting lag. Native-speed drawing remains unresolved;
see the [source and device ABI investigation](../reports/rmpp-latency-2026-09-29.md).

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
`MESSAGE_SET_REFRESH_MODE` once at startup (protocol: `src/qtfb/common.h`). The server sleeps 1 s after
a mode change or full refresh on the sending connection, so neither belongs in the stroke update path.
Requires [xovi](https://github.com/asivery/xovi) + AppLoad on the tablet (e.g. via [Vellum](https://github.com/vellum-dev/vellum)
or [remagic](https://github.com/maximerivest/remagic); toltec does not support the Paper Pro).

**Device refresh** (`plugins/display-rmpp/rmpp.cpp`). Notes starts in `REFRESH_MODE_FAST` for drawing;
**Colour preview** explicitly switches to `REFRESH_MODE_UI`, and **Fast drawing** switches back.
Dashboard and other apps default to UI. Original RGB pixels are retained in both modes: FAST displays
monochrome, while preview and saved JSON/SVG retain the selected colours.

AppLoad sleeps one second after a mode change on the sending connection. The driver uses one connection,
continues processing input/rendering during a 1.1 s settling window, and coalesces unsent damage into one
rectangle containing the latest pixels. A mode switch repaints unchanged RGB too, so colours reappear without
another pen event. No per-stroke mode switching and no hardware full-refresh request.

Partial notifications are capped at 60/s in FAST and 8/s in UI (based on the observed ~8 UI paints/s).
These are submission limits, **not measured display frame rates**. The send is nonblocking: a full socket keeps
the pending damage for retry, and idle frames flush the final stroke segment. Rasterization uses the runtime's
`render_damage` callback when available. Xochitl owns the physical waveform; native pen latency is not guaranteed.

Configuration (settings are compiled into each app; environment override is read at launch):

```json
"display": { "driver": "rmpp", "refresh_mode": "fast", "fast_hz": 60, "color_hz": 8 }
```

`refresh_mode`: `fast` or `ui`; `ZINC_RMPP_REFRESH_MODE=fast|ui` overrides the initial mode.
Frequency knobs are clamped to 1–125 Hz. Desktop controls preview UI state only, not device timing.

The desktop emulator retains the illustrative FAST/QUALITY/FULL policy in `eink.h`.
Its `full_every`, `upgrade_ms` and `dither` options do **not** control the device backend.

**Input**: Marker samples come from evdev (pressure, tilt, eraser), queued on a reader thread.
Finger events come from AppLoad's `MESSAGE_USERINPUT`, already mapped to framebuffer coordinates;
quick press/release pairs are delivered on separate UI frames. Fingers are ignored while the Marker is in range
(palm rejection). Pen orientation override: `ZINC_RMPP_PEN_ROTATE` (0/90/180/270).
The app holds `/sys/power/wake_lock` while running. Notes has **Save & quit** (stays open if saving fails);
dashboard has **Quit**. AppLoad disconnect and SIGTERM also exit the app.

**Ink latency path** (`plugins/ink/index.ts`): each pen sample becomes one 2-point stroke command at the end of the
frame, so the damage is just the new segment → partial RGB update of the changed pixels. Finished strokes are baked into
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

Driver regression check (ARM64 container, no tablet required):

```sh
docker run --rm --platform linux/arm64 -v "$PWD:/work" -w /work zinc/sdk-rmpp sh -c \
  'g++ -std=c++17 -pthread -Iruntime/include tests/rmpp/qtfb.cpp -o /tmp/qtfb-test && /tmp/qtfb-test'
```

This checks partial-update packets, preserved RGB after 120 stroke updates, no redundant idle update,
mode settling, latest-frame coalescing, socket backpressure, colour restoration without new damage,
quick taps, multitouch, palm rejection and exit on qtfb disconnect.

To validate on hardware:

- continuous strokes without repeated screen flashes, colour swatches and coloured ink;
- finger taps with the Marker away from the screen, pressure, eraser and palm rejection;
- **Save & quit** / **Quit**, followed by relaunch from AppLoad;
- pen-to-glass latency and ghosting in FAST versus UI (the socket test cannot measure these).
