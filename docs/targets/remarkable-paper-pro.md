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
"display": { "driver": "rmpp", "refresh_mode": "fast", "fast_hz": 60, "color_hz": 8, "ink": "qtfb" }
```

`ink`: `qtfb` (default), `native` or `session`, see "Display layers" below; `ZINC_RMPP_INK` overrides it at launch.

`refresh_mode`: `fast` or `ui`; `ZINC_RMPP_REFRESH_MODE=fast|ui` overrides the initial mode.

**Full refresh**: partial updates leave ghosts, the fast waveforms most. The driver counts them and adds up their area; once the
area reaches `full_after_pct` percent of the panel (100: one screen) or the count `full_after_updates` (300: about 30 s of writing,
a stroke being many small updates; 0 turns either off), and nothing has changed for `full_idle_ms` (1500) with the pen up, it asks for
one full refresh. The first page is not counted. `ZINC_RMPP_FULL_AFTER_PCT`, `ZINC_RMPP_FULL_AFTER_UPDATES` and
`ZINC_RMPP_FULL_IDLE_MS` override them at launch. An app asks for one itself with `refreshDisplay()` of `zinc:gfx` (Notes' Refresh button): it returns
true when the display does it at its next idle frame, false elsewhere. On qtfb this needs AppLoad 0.6.0 or later, recognised by
the device state it sends after init (0.5 drops a client that asks); the ink session swaps the whole panel in colour.
Frequency knobs are clamped to 1–125 Hz. Desktop controls preview UI state only, not device timing.

**Leaving an app without quitting**: a qtfb tile keeps AppLoad's window buttons (`"disablesWindowedMode": false`): a tap opens the
app full screen, a swipe down from the top shows `_`, which minimizes the window while the app keeps running (tap its bar to come
back), and `X`. An app minimizes itself with `minimizeWindow()` of `zinc:gfx` (the **Accueil** button of `zinc:remarkable`'s bar): it
needs AppLoad with the window-state patch of `integrations/remarkable-engine/appload`, recognised by the window visibility in the device
state it sends after init (another AppLoad drops a client that sends the message, so the driver never does there and the call returns
false; Accueil then quits like Quitter). While the window is hidden the driver sends nothing; when it shows again the whole page goes
out, then a full refresh.

**Widgets**: with the second patch (`0002`), AppLoad can show a rectangle of the app's screen 1:1 as a card over xochitl, its taps
going to the app. `zinc:remarkable`'s `RemarkableApp` declares it (`widget={{ view, width, height }}`) and Accueil shows it; the driver
then sends only what changes inside the rectangle and asks for no automatic full refresh, and the card's open button brings the full
window back (the whole page, then a full refresh). The patched AppLoad announces it in its device state (capabilities, bit 1).
With the third patch (`0003`) a tap on the card's header folds it to the header alone and another tap opens it (AppLoad keeps it
with the card's place): folded, the device state says hidden (0) and the driver sends nothing, the app keeps its widget view, and
when the card opens (2) the driver repaints the whole rectangle.

The desktop emulator retains the illustrative FAST/QUALITY/FULL policy in `eink.h`.
Its `full_every`, `upgrade_ms` and `dither` options do **not** control the device backend.

**Input**: Marker samples come from evdev (pressure, tilt, eraser), queued on a reader thread.
Finger events come from AppLoad's `MESSAGE_USERINPUT`, already mapped to framebuffer coordinates;
quick press/release pairs are delivered on separate UI frames, and the pointer stays where the finger or the Marker
left the glass, so the release lands on the button that was pressed (`tests/t1/rmpp_sim.sh` taps the dashboard's buttons
through the fake qtfb). Fingers are ignored while the Marker is in range
(palm rejection). Pen orientation override: `ZINC_RMPP_PEN_ROTATE` (0/90/180/270).
The app holds `/sys/power/wake_lock` while running. Notes has **Save & quit** (stays open if saving fails);
dashboard has **Quit**. AppLoad disconnect and SIGTERM also exit the app.

**Ink latency path** (`plugins/ink/index.ts`): each pen sample becomes one 2-point stroke command at the end of the
frame, so the damage is just the new segment → partial RGB update of the changed pixels. Finished strokes are baked into
a runtime image with the same commands (identical pixels, so the pixel diff sees nothing to refresh). Stroke eraser
(Marker eraser end or the Eraser tool), undo (50 levels), clear, JSON (`toJSON`/`parseStrokes`) and SVG (`toSVG`,
round-capped polylines per width run: same geometry as the screen).

## Display layers: the ink lane, the ink session and qtfb

`plugins/display-rmpp/rmpp.cpp` chooses one of three layers when the app starts
([design](../reports/remarkable-bridge-design.md), §7). The app's own frame draws the same pixels on all three.

| Layer | What draws | Return to xochitl | Chosen when |
|---|---|---|---|
| **L1 ink canvas or lane** (`lane.h`) | qtfb in UI mode, plus, while the Marker is down, the stroke's rectangles in xochitl's Pen mode: repainted by the `zinc-canvas` XOVI extension (preferred, see below), or swapped by the older `zinc-ink` lane; at pen-up the stroke's box is repainted through qtfb (the colour settle) | instant: the app never leaves xochitl | `"ink": "native"` or `"session"`, and an extension answers on `/run/zinc-ink.sock`: the canvas (it verified xochitl itself), or the lane with a vendor hash that is a row of `models.h` |
| **L2 ink session** (`native.h`) | the app owns the vendor engine through an engine shim with Quill's C ABI (`libquill.so`), with xochitl stopped by the lease | a xochitl restart (seconds), the open notebook view is lost | `"ink": "session"`, no lane, and the app was started through the lease (`ZINC_LEASE` and the checked `ZINC_VENDOR_SHA256` in its environment) |
| **L0 qtfb** (`rmpp.cpp`) | AppLoad's shared framebuffer, partial updates; FAST mode when `ink` asked for fast ink, `refresh_mode` otherwise | instant | always, and whenever L1 or L2 is not available |

Each fallback prints one line on stderr that names why: no lane, the lane refused the app (window not fullscreen 1:1),
a vendor library not verified for the model, an unknown model, a session started outside the lease. A downgrade is one way
during a session: when the lane closes (any error on its side: a missed deadline, the power key, the window leaving
fullscreen), the app says `ink lane closed; qtfb from now on`, repaints the stroke through qtfb and goes on in L0. It
never moves to L2 in the middle of work. Under the lease, an app whose engine does not open exits, and the lease brings
xochitl back.

The lane (`integrations/remarkable-ink`, protocol 2): no pixels on the socket. The app writes them into its qtfb shared
memory as on L0 and names the rectangle (`Hello` with the qtfb key, `StrokeBegin`, `Ink(rect)`, `StrokeEnd(box)`,
`Bye`). The lane blocks xochitl's rendering only for a stroke, with a deadline of 500 ms after the last `Ink` and 10 s per
stroke. Install it with `integrations/remarkable-ink/install.sh` on the tablet.

Proved on the Mac by `tests/t1/rmpp_sim.sh` (fake qtfb and fake lane): the choice per `ink` value, the L1 → L0 downgrade
on EOF, and each fallback with its message. `tests/native/rmpp/fake-xochitl/run.sh` (Docker, by hand) runs the real lane
in a fake xochitl under XOVI and framebuffer-spy. Only the tablet can prove the latency, the colour settle on a real
engine and the return time.

### The ink canvas (`zinc-canvas`, ZN-839)

The lane needs the vendor engine's symbols, and on OS 3.27 they are not in any library xochitl loads (the engine is linked
into `/usr/bin/xochitl`; design §11). The canvas needs none: it is route 2 of
[the fast-ink landscape](../reports/remarkable-fast-ink-landscape.md) (AppLoad PR #61's InkCanvas), written as its own
extension, `integrations/remarkable-ink/canvas.cpp`.

- When the app says `Hello`, it lays a `QQuickPaintedItem` over AppLoad's window (the `FBController` item, fullscreen 1:1),
  reading the app's qtfb shared memory directly (no copy), with a child `ScreenModeItem` of xochitl's own `xofm.libs.epaper`
  module (the type and the `Pen`/`UI` modes AppLoad's QMD uses). `StrokeBegin` sets that item to `Pen`; each `Ink(rect)`
  repaints only that rectangle; `StrokeEnd` goes back to `UI`, makes the item transparent again and repaints the box
  through AppLoad's item: the colour settle. Input stays with AppLoad's item underneath. `Bye` or any error removes the item.
- No override, no import, no QMD, no native address: it starts from Qt's `qAddPreRoutine` and uses exported Qt API and
  xochitl's QML names, created at run time. A missing type or mode is a QML error, caught: the canvas stays off for that app.
- Fail closed with one journal line (`[zinc-canvas] off: ...`): an unknown model; a running xochitl whose SHA-256 is not in
  `/home/root/xovi/exthome/zinc-canvas/verified` (`install.sh` records the tablet's xochitl there, so a new OS is one line
  after a test, not a build); the QML type or its modes missing. The crash guard is the lane's: `/run/zinc-canvas/armed`
  while it touches xochitl's scene; a leftover mark refuses it until the next reboot (the lease clears the mark after its
  own clean stop of xochitl, which is no crash).
- It also brings back the open document after a lease (below).

Install and test it on the tablet (one load test, rule 10):

```sh
# on the Mac
sh integrations/remarkable-ink/build.sh          # dist/zinc-canvas.so and dist/zinc-ink.so, official SDK, one-shot container
scp -r integrations/remarkable-ink root@10.11.99.1:/home/root/zinc-ink
# on the tablet (ssh root@10.11.99.1)
rm -f /home/root/xovi/extensions.d/zinc-ink.so   # the lane answers on the same socket
sh /home/root/zinc-ink/install.sh canvas         # records xochitl's hash for this OS, copies zinc-canvas.so; no restart
/home/root/xovi/start                            # ONCE; then wait for the UI
journalctl -u xochitl --since "-5min" --no-pager | grep zinc-canvas   # "ready on /run/zinc-ink.sock (Paper Pro, OS ...)" or "off: <why>"
```

Then launch an app exported with `"ink": "native"` from AppLoad (fullscreen); its stderr says `ink canvas on (Paper Pro,
xochitl <hash>)`, and the journal `canvas granted to pid N`. Remove it with `rm /home/root/xovi/extensions.d/zinc-canvas.so`
(it is gone at the next `xovi/start`; until then it stays idle), and `rm -r /home/root/xovi/exthome/zinc-canvas`.

## Models, and adding a model or an OS

One driver serves every tablet; `plugins/display-rmpp/models.h` holds one row per model, read from
`/sys/devices/soc0/machine` (`ZINC_RMPP_MACHINE` overrides it in tests):

| Codename | Model | Panel | qtfb format | Display path | Fast ink |
|---|---|---|---|---|---|
| reMarkable Ferrari | Paper Pro | 1620x2160 colour | 1 | qtfb (L0), lane (L1), session (L2) | OS 3.27.3.0 and 3.29.0.153 verified |
| reMarkable Chiappa | Paper Pro Move | 954x1696 colour | 4 | qtfb (L0), lane and session once a vendor row exists | none verified yet: qtfb |
| reMarkable Tatsu | Paper Pure | 1404x1872 mono | 7 | as the Move | none verified yet: qtfb |
| reMarkable 2.0 | reMarkable 2 | 1404x1872 mono | n/a | [timower's rm2fb](https://github.com/timower/rM2-stuff) client (DU for ink, GC16_FAST for UI) | rm2fb's DU waveform |

An unknown codename runs on qtfb with the row of the same panel size and one message (`unknown model '...'`). A known
model whose `libqsgepaper.so` hash has no row in `vendors` stays on qtfb with one message naming the hash. The rM2 has no
bridge of our own: its SWTCON is static inside xochitl, and rm2fb already owns the panel for every client; without rm2fb
the app runs headless and says so. (The rM2 is 32-bit ARM: its build comes with the cross-platform pass.)

**A new OS on a known model** is one row of `vendors`, added after a tablet test, never guessed:

1. Read only, on the tablet: `sha256sum /usr/lib/plugins/scenegraph/libqsgepaper.so`, the OS version, and the swap's
   mangled name with `nm -D -C` on a copy of the library taken off the tablet (`EPFramebuffer::swapBuffers(QRect, ...)`;
   3.27 takes `EPContentType, EPScreenMode, flags`, 3.28 `EPScreenMode, flags`: `abi` 327 or 328).
2. Check `systemctl show xochitl -p StartLimitBurst -p StartLimitIntervalUSec -p WatchdogUSec` against the model row.
3. Add the row (hash, codename, OS, swap symbol, `abi`, Pen mode, colour mode and content, engine shim), then run
   `tests/t1/rmpp_sim.sh` and the fake-xochitl harness with that ABI.
4. On the tablet: one `xovi/start`, the journal must say `lane ready`; then the camera and settle tests (T2 to T4 of the
   design's §9). Record the result in the row's comment.

An OS update also breaks what XOVI loads into xochitl. On 3.29 a QML patch built for 3.27 (`ghostbuster.qmd`) aborted
xochitl ("Couldn't resolve the hashed identifier"); three aborts, and `rm-emergency` rebooted on stock xochitl. Before
the first `xovi/start`, install the AppLoad build for the new OS and move every `.qmd` of
`exthome/qt-resource-rebuilder` out. Bring them back one per start, after their authors publish a build for the new OS.

**A new model** is one row of `models`: codename, panel size, qtfb format (AppLoad's `src/qtfb/common.h`), the vendor
buffer that framebuffer-spy reports (width, height, bytes per line; 0 until read), colour, pen and touch maxima
(`evtest`), pen rotation, the display path, and the xochitl unit limits as shipped. Add a `size=WxH` run to
`tests/t1/rmpp_sim.sh` for its qtfb format. Its fast ink stays off until a vendor row exists.

## Safety rules

The same rules bind the lane, the lease and anyone diagnosing on a tablet
([design](../reports/remarkable-bridge-design.md), §7.1). The 2026-09-29 reboot came from breaking the first one.

1. Zinc code never restarts xochitl more than 2 times in 10 minutes or 6 times per hour (the lease's budget). The lane
   never restarts xochitl.
2. Never freeze, `SIGSTOP` or `kill` xochitl; never mask, edit or override its unit; never set `WatchdogSec=0`.
3. Never run two vendor engines: the lease checks the display lock, the DRM openers and its cgroup before every stop and
   start.
4. `systemctl reset-failed xochitl` only right after our own clean stop, never after xochitl failed by itself.
5. Every lease has a dead-man: `RuntimeMaxSec`, the app's watchdog (`WATCHDOG=1` every frame, `WatchdogSec=10`), and the
   power-key escape, which belongs to the supervisor: the app never opens the power key.
6. Every failure leaves xochitl running. The lane and the canvas never take xochitl down more than once per boot: each
   writes its `armed` mark (`/run/zinc-ink/`, `/run/zinc-canvas/`) while it may touch the engine or the scene, and a
   leftover mark at load (xochitl died while it was armed) makes it refuse to load until the next reboot (the reason is
   in its `last` file).
7. No load-time XOVI condition or override on `libqsgepaper` (Qt `dlopen`s it after XOVI's constructor), and no override
   of a symbol another installed extension hooks (`install.sh` checks `extensions.d`). Vendor symbols are resolved at
   run time.
8. Hash-gated everywhere: an unknown `libqsgepaper.so` hash means L0 only, with a message. A new OS is one row of
   `models.h` after a tablet test, not a new design.
9. A wakelock is held whenever xochitl is stopped.
10. Diagnosis on a tablet never repeats xochitl restarts: one load test (one `xovi/start`), then read the journal.

## The display lease (`"ink": "session"`)

An app that needs the panel to itself (direct ink through the vendor engine) runs under the display lease,
`integrations/remarkable-ink/lease.c` (design: `docs/reports/remarkable-bridge-design.md` §3 and §7.1).
With `"display": { "driver": "rmpp", "ink": "session" }`, `zinc export --target rmpp` writes beside the app (a dynamic
glibc 2.28 aarch64 binary, which can `dlopen` the engine):

- `lease`, the static supervisor (zig, aarch64 musl);
- `libquill.so` and `QUILL-LICENSE`: [Quill](https://github.com/MaximeRivest/quill)'s engine shim (MIT), patched to call
  both swap signatures (3.27 and 3.28+) and built with reMarkable's SDK; it lives in `integrations/remarkable-ink/quill`;
- `launch.sh`, the AppLoad entry (`"application": "launch.sh"`, `"qtfb": false`): it puts the app's directory and
  `/usr/lib/plugins/scenegraph` on `LD_LIBRARY_PATH` (libquill.so needs `libqsgepaper.so`) and runs
  `lease launch --watchdog 10 --vendor-sha256 <the tablet's hash> <app>` when that hash is one of the rows of models.h,
  and refuses with one line otherwise.

The lease refuses a tablet whose `libqsgepaper.so` has another hash, then hands the app `ZINC_LEASE=1`,
`ZINC_VENDOR_SHA256` and `LD_LIBRARY_PATH`; systemd adds `NOTIFY_SOCKET`. The app loads `libquill.so` with `RTLD_GLOBAL`
(Quill finds the vendor engine with `dlsym(RTLD_DEFAULT)` and must see its framebuffer constructor first) and sends
`WATCHDOG=1` every frame; the lease sends one itself just before it starts the app, so stopping xochitl does not eat into
the app's 10 s. Nothing in the app or in `libquill.so` opens the power key: the lease grabs it (`EVIOCGRAB`). Quill's own
`scribble` test opens it too, which is why `examples/remarkable/quill-test` is not the model for an app.

**Notes stays on qtfb by default.** An ink session stops xochitl (seconds to come back, the open notebook view is lost),
fits in the lease's budget of 2 restarts per 10 minutes, and ends after 30 minutes; a power-key exit or the dead-man ends
the app with SIGTERM, which does not save the page (only **Save & quit** does). To try it, add `"ink": "session"` to the
`display` object of `examples/remarkable/notes/zinc.json`, then `zinc export ... --target rmpp` and run its `deploy.sh`.

- `lease launch` checks everything first, then starts one transient unit, `zinc-lease`; a second launch is refused
  while it runs. Inside it, `lease session` takes a wakelock, owns the power button, runs `systemctl stop xochitl` and
  starts the app. Every way out (the app quits or crashes, the app stops sending `WATCHDOG=1` for 10 s, a 2 s press on
  the power button, `systemctl stop zinc-lease`, the supervisor dies, the dead-man `RuntimeMaxSec`, 30 min by default,
  `--max` up to 2 h) ends in `lease restore`, the unit's `ExecStopPost`. It starts xochitl once, then releases the
  wakelock.
- xochitl is stopped through systemd only. The lease never freezes, kills or masks xochitl, and never edits its unit.
  It refuses to run when the unit's `StartLimitBurst`, `StartLimitIntervalUSec` or `WatchdogUSec` differ from the stock
  4 / 10min / 1min (after an OS update, verify again first). It also refuses when xochitl is not active, failed, has been
  up for less than 30 s, or restarted on its own this boot.
- Budget: at most 2 xochitl starts by the lease in 10 minutes, 6 per hour, and 60 s between leases (`/run/zinc-lease/starts`,
  reset at boot). A refused launch says why and when the next one is allowed. `reset-failed xochitl` runs only right
  after the lease's own clean stop, so its cycles never use up systemd's 4 starts in 600 s and xochitl's own crashes still count.
- The open document comes back when `zinc-canvas` is loaded. It records xochitl's `Settings.lastOpen` in
  `/run/zinc-canvas/document`; `lease session` copies it to `/run/zinc-lease/reopen` before the stop (and says
  `reopen: <id>`), and at xochitl's next start the canvas opens it once, the way rm-hacks-qmd's `openLastDocument` does
  (`Library.entryForId`, then `navigator.requestOpenDocument`), and writes the result to `/run/zinc-lease/reopened`
  (`lease status` prints it). Without the canvas the lease says why it cannot (`reopen: not possible, zinc-canvas is not
  loaded`), and xochitl shows its home screen.
- A failed restore makes no retry loop. It retries once after 10 s, and only when the display was busy. It keeps the
  wakelock, writes the reason to the journal and `/run/zinc-lease/last`, and refuses every later launch until someone
  looks at it.

Proven on the Mac by `tests/run --only rmpp_lease`: a fake systemd (`tests/native/rmpp/lease-sim`) with the stock start
limit and a fake clock. Not proven: the real unit on the tablet, the power key device, the return time to a usable
xochitl (test plan T5/T6 of the design report).

### Recovery

From the host, over USB (`ssh root@10.11.99.1`); `<app>` is the AppLoad directory holding `lease`:

```sh
systemctl status zinc-lease xochitl --no-pager      # what runs
journalctl -u zinc-lease -n 100 --no-pager          # the lease's lines, its restore included
/home/root/xovi/exthome/appload/<app>/lease status  # budget, last result, pending restore
cat /run/zinc-lease/last /run/zinc-lease/starts
systemctl stop zinc-lease                           # ends a lease; its restore starts xochitl
systemctl show xochitl -p ActiveState -p Result -p NRestarts
```

If xochitl is still down after `systemctl stop zinc-lease`, check that no app still holds the panel
(`cat /tmp/epframebuffer.lock` must not name a live process, `ls -l /proc/*/fd | grep dri/card` must be empty).
Then start it **once**, and release the lease's wakelock and its pending restore:

```sh
systemctl start xochitl
echo zinc-lease > /sys/power/wake_unlock
rm -f /run/zinc-lease/restore /run/zinc-lease/ours /run/zinc-lease/stopped /run/zinc-lease/wake
```

Never loop `systemctl restart xochitl`. Four starts in 600 s hit `start-limit-hit`, and its `OnFailure` reboots the
tablet (2026-09-29). Never run `reset-failed` after a crash of xochitl itself. A reboot clears `/run/zinc-lease`.

## Desktop emulator

On macOS/Linux, `display-rmpp` runs the same `eink.h` policy and shows its output in the SDL window: paper tint,
muted pigments, fast updates in black/white, colour arriving after the idle upgrade, a black flash on full refreshes.
`ZINC_EINK_LOOK=0` shows frames unchanged. Pens: SDL pen events (Wacom and other tablets; pressure, tilt, eraser tip),
else the mouse (left = pen at pressure 0.5, right = eraser). Give the project the device resolution with
`"targets": { "macos": { "width": 1620, "height": 2160 } }`.

## Install on the tablet

1. Enable developer mode (wipes the tablet), connect USB, `ssh root@10.11.99.1`.
2. Install xovi + AppLoad (Vellum or remagic).
3. `zinc export --target rmpp` writes `<name>`, `external.manifest.json` (`"qtfb": true, "disablesWindowedMode": true`;
   `launch.sh`, `lease` and `libquill.so` for `"ink": "session"`), `icon.png` (zinc.json `app.icon`, a PNG or an SVG, as a 150 px square on white; a framed square without one) and `deploy.sh`, which copies
   them to `/home/root/xovi/exthome/appload/<name>/`. In AppLoad, reload and launch it.
4. Without AppLoad (`QTFB_KEY` unset) the app runs headless and says so on stderr. Stopping xochitl
   (`systemctl stop xochitl`) does not give Zinc the screen: the panel needs xochitl's software TCON.

## The engine on the tablet (ZN-841)

zinc itself runs on the Paper Pro (aarch64, glibc), so the tablet runs and packs `.zapp` files with no C toolchain and no export per
app: the first step of an app store for the reMarkable.

```sh
# on the Mac
tools/rmpp-engine                         # tools/build-linux --arch aarch64, then dist/rmpp/zinc-rmpp.tar.gz and deploy.sh
dist/rmpp/deploy.sh root@10.11.99.1 notes.zapp notes.zapp --session   # /home/root/zinc, the apps in /home/root/zinc-apps, one tile each
# on the tablet
/home/root/zinc/bin/zinc pack             # in a project copied there: build/<name>.zapp
/home/root/zinc/bin/zinc-tile build/<name>.zapp [--session]   # its AppLoad tile; zinc-tile --remove zinc-<name>
```

- The bundle is the Linux package of `tools/build-linux` (`bin/zinc`, `share/zinc`) plus `bin/lease` (the display lease, static),
  `lib/libquill.so` and `QUILL-LICENSE` (the ink session), `bin/zinc-app`, `bin/zinc-tile`, `bin/qtfb-hold` (keeps a tile's window
  open while it hands it from the hub to an app and back: AppLoad closes a window when its last client leaves), and `share/zinc/rmpp/` (the tiles' icon and
  `verified`, the `libqsgepaper.so` hashes of `models.h`). Sources: `integrations/remarkable-engine/`.
- **Native code comes prebuilt.** The engine finds out it runs on a reMarkable (`/sys/devices/soc0/machine`; `ZINC_DEVICE_TARGET` overrides
  it) and loads display-rmpp's `rmpp` entry instead of the desktop emulator of `linux`, from `prebuilt/rmpp/`, which `tools/package` builds
  for aarch64 with the driver's default options. The options a project sets in `display` reach the prebuilt driver at launch as
  `ZINC_RMPP_<OPTION>` (`ZINC_RMPP_INK`, `ZINC_RMPP_REFRESH_MODE`, `ZINC_RMPP_FAST_HZ`, `ZINC_RMPP_COLOR_HZ`); a variable already set wins.
  The other plugins are the package's `prebuilt/linux/`. A project's own native module (`native/*.rmpp.cpp`) needs a compiler: on the
  tablet the program gets its `x.sim.ts` stand-in, with a warning (notes' **Colour preview** then switches nothing on the panel); export
  such an app with `zinc export --target rmpp` for its native code.
- **A tile** (`zinc-tile`) is an AppLoad directory `zinc-<name>` whose `launch.sh` runs `bin/zinc-app <app.zapp>`: qtfb (L0, or L1 when
  an ink canvas answers), xochitl keeps running. `--session` makes `zinc-<name>-session`, `"qtfb": false`, whose `launch.sh` checks the
  tablet's `libqsgepaper.so` against `verified` and runs `lease launch --watchdog 10 --vendor-sha256 <hash> zinc-app <app.zapp>`; under the
  lease `zinc-app` sets `ZINC_RMPP_INK=session`, `HOME` and the library path (the engine's `lib/`, then `/usr/lib/plugins/scenegraph`).
- **Icons.** The tile shows the `.zapp`'s `icon.png` (`zinc pack` makes it from zinc.json `app.icon`, a PNG or an SVG, 150 x 150 on white as
  AppLoad draws it), else `share/zinc/rmpp/icon.png`. Lucide icons (ISC) suit e-paper: black strokes, `stroke-width="2.5"`, as the hub's
  `app/hub/icon.svg`.
- `ZINC_RMPP_DIR` gives `deploy.sh` another directory for a trial beside an installed engine. Proven on the Mac by `tests/run --only rmpp_engine`
  (the bundle's layout, the tiles and their launchers against stand-ins).
- **The hub** (`app/hub`, ZN-843; `app/hub/README.md`): an app with its own tile that pairs with a hub server (`app/hub-server`), checks the
  catalog's, the manifest's and the `.zapp`'s signatures and SHA-256, installs each app as `/home/root/zinc-apps/<name>.zapp`, keeps the
  previous package for Rollback and calls `zinc-tile` for the app's tile. Its list shows each app's icon, which the server takes from the
  published `.zapp` and lists with its SHA-256 in the signed catalog.
- **Lecteur web and dashboard** (`app/web`, ZN-844; `app/web/README.md`): the Mac's relay (`zinc run app/web-relay`) renders pages in
  headless Chrome at the tablet's size, grey. **Bookmarks, Dashboard** turns a page into a TRMNL-style dashboard: page 1 full screen,
  rendered again every 5, 15, 30 or 60 minutes (`&fresh=1`: the relay's running Chrome reloads the tab), the picture swapped only when its
  SHA-256 changed and followed by one full refresh (`refreshDisplay()`), so it does not ghost; a tap renders it now. **Accueil** shows the
  top of the page as an 810 x 540 widget on the same timer. The program's timers keep running while the window is minimized or a widget:
  `rm_present` waits at most 8 ms for input and returns. The mode is kept in `web.conf`, so a reopened app is the dashboard again.

## Zinc PDF (ZN-844)

`app/pdf` reads the PDFs of `/home/root/zinc-docs` with pen notes (`app/pdf/README.md`). The pages are drawn by `zinc:pdf`
(`plugins/pdf`), over PDFium: the prebuilt `libpdfium.so` of bblanchon/pdfium-binaries `chromium/8100` (pinned by SHA-256 in
`plugins/pdf/vendor/PIN`; MuPDF is AGPL). It needs GLIBC_2.17 at most and no libstdc++, so it loads on every OS 3.x; `tools/rmpp-engine`
fetches it and puts it in the bundle's `lib/` (with `PDFIUM-LICENSES/`), where `zinc-app`'s `LD_LIBRARY_PATH` finds it, and the plugin's
own code is in the package's `prebuilt/linux/` like the others (it loads PDFium with `dlopen`, so it cross-builds with no library).

- The page is fitted to the page view and drawn by PDFium into one runtime image the size of the view; a zoomed page is only the visible
  rectangle at the larger scale, never a bigger image (memory stays at one screen, about 14 MB).
- The ink is in page points, saved per page beside the document (`<name>.pdf.ink/p<n>.json`); Export writes `<name>.annotated.pdf`
  with real `/Ink` annotations. `display.refresh_mode` is `fast` for the pen.
- Proven on the Mac: `tests/t0/pdf.sh` (the plugin) and `tests/t1/pdf_reader.sh` (the app headless). Not yet on the tablet: the
  pen and pinch there, and how long PDFium takes per page on the Cortex-A53.

## Zinc Read: Markdown and Notion (ZN-844)

`app/markdown` (`app/markdown/README.md`) reads the `.md` files of `~/zinc-docs` on the tablet: md4c parses them (`zinc:markdown`,
`plugins/markdown`, MIT), the reader lays each one out on fixed pages of the screen (swipe or **Previous**/**Next**, no scrolling), with a
table of contents, links between documents (and to `#headings`), task boxes ticked into the file, A−/A+ and pen notes per document saved
under `~/.zinc/markdown/ink`. **Settings** takes a Notion integration secret (`~/.zinc/markdown/read.conf`, mode 600) and a page link:
the page and its nested blocks come through `https://api.notion.com/v1` (`Notion-Version: 2026-03-11`, zinc:net over mbedTLS) and are saved
as `~/zinc-docs/notion/<title>-<id>.md`, read offline; **Sync** fetches them again. Without internet the status line says so.
`zinc pack app/markdown -o markdown.zapp`, then the hub or `zinc-tile` as for any `.zapp`; the engine bundle must include the
`markdown` plugin's prebuilt library (`tools/rmpp-engine` after this plugin landed). Proven headless on the Mac by
`tests/run --only markdown_reader` (a fake Notion API); not yet run on the tablet.

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

## Credits and inspiration

Zinc on the reMarkable stands on the work of others:

- [AppLoad](https://github.com/asivery/rm-appload) and [xovi](https://github.com/asivery/xovi) by asivery: the app
  launcher and its qtfb framebuffer, which Zinc's display driver talks to. The window and widget patches of
  `integrations/remarkable-engine/appload` are written on top of AppLoad v0.6.0.
- [KOReader](https://github.com/koreader/koreader), whose qtfb client showed how to draw through AppLoad, and
  [quill](https://github.com/MaximeRivest/quill), which documents the tablet's private e-paper calls.
- The [`eeems/remarkable-toolchain`](https://hub.docker.com/r/eeems/remarkable-toolchain) image by Eeems, in which AppLoad is built.
- [PDFium](https://pdfium.googlesource.com/pdfium/) (Google, BSD-3-Clause and Apache 2.0) in the prebuilt libraries of
  [pdfium-binaries](https://github.com/bblanchon/pdfium-binaries) by Benoît Blanchon: Zinc PDF.
- [md4c](https://github.com/mity/md4c) by Martin Mitáš (MIT): Zinc Read's Markdown parser. The
  [Notion API](https://developers.notion.com/) brings Notion pages in.
- Headless [Google Chrome](https://www.google.com/chrome/) through the Chrome DevTools Protocol: the pages of Zinc Web.
- [nanosvg](https://github.com/memononen/nanosvg) by Mikko Mononen (zlib): app icons drawn from SVG.
- [Lucide](https://lucide.dev) (ISC): the icons of the apps and of the AppLoad patches.

Inspiration: [TRMNL](https://usetrmnl.com) for the web dashboard (a page rendered elsewhere, shown on e-ink at
a fixed period), iOS WidgetKit and Android's Glance for the widgets, and the reMarkable's own notebooks for the ink.
