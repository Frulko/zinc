# zinc-canvas and zinc-ink: fast ink inside xochitl (XOVI extensions, protocol 2)

**zinc-canvas** (`canvas.cpp`, `canvas.xovi`; ZN-839) is the one to install: a painted item over AppLoad's window, under
xochitl's own Pen screen mode, repainting only the stroke's rectangles from the app's qtfb memory. No override, no QMD, no native
address; gated on the model and on the running xochitl's SHA-256 listed in `exthome/zinc-canvas/verified` (written by
`install.sh canvas`). It also reopens the document a display lease closed. Tablet steps: `docs/targets/remarkable-paper-pro.md`,
"The ink canvas". The lane below needs vendor symbols that xochitl 3.27 does not expose (design §11); both answer on the same
socket, so `install.sh` installs one at a time.

## zinc-ink: the ink lane

L1 of the reMarkable display layers (`docs/targets/remarkable-paper-pro.md`, "Display layers"; design:
`docs/reports/remarkable-bridge-design.md` §4.3, §7). Inside xochitl, while the Marker is down, it copies the rectangles an
app names from the app's qtfb shared memory into xochitl's own vendor buffer and calls the Pen/Mono partial swap; at
pen-up it repaints the stroke's box through AppLoad's item (the colour settle). One engine, nothing restarted, nothing to
restore. Apps opt in with `"display": { "ink": "native" }` (or `"session"`); any refusal leaves them on qtfb.

- `bridge.cpp`, `bridge.xovi`: the extension. One override, on Qt6Quick (`QQuickWindow::exposeEvent`), to start after the
  first frame; nothing on `libqsgepaper` at load time; vendor symbols from the loaded library's handle at run time; gates on
  the model, framebuffer-spy's geometry and the vendor hash (`plugins/display-rmpp/models.h`); crash guard in `/run/zinc-ink`.
- `protocol.h`: the wire format shared with `plugins/display-rmpp/lane.h`.
- `install.sh [canvas|lane]`: copies `dist/zinc-canvas.so` (default) or `dist/zinc-ink.so` into `extensions.d` on the tablet, refused when the other is installed, framebuffer-spy is missing (lane) or another
  extension hooks the same symbol. It never restarts xochitl.
- `build.sh`: builds `dist/zinc-canvas.so` and `dist/zinc-ink.so` with the official SDK, in a one-shot container.
- The fake-xochitl harness: `tests/native/rmpp/fake-xochitl/run.sh` (Docker, by hand).

Not yet tested on a tablet: load (one `xovi/start`, then the journal), latency, the colour settle on a real engine.

## Device test incident, 2026-09-29

Repeated xochitl restarts during diagnosis of the first bridge hit the stock service's `StartLimitBurst=4` /
`StartLimitIntervalSec=600`. The journal records `start-limit-hit` followed by `rm-emergency.sh`, which rebooted the tablet.
Never repeat a restart loop or change the device's safety limits to bypass it: the rules are in the target doc, "Safety rules".

The old rollback timer also restarted xochitl outside any rate limit; it is removed. `lease.c` (the display lease, docs/targets/remarkable-paper-pro.md) is now the only Zinc code that restarts xochitl, within a budget of 2 starts per 10 minutes. Further loading diagnosis should happen off-device before another controlled hardware test.

Build: `sh integrations/remarkable-ink/build.sh` needs the `zinc/sdk-rmpp` image, the SDK volume `zinc-rm-sdk-5.7.119` and XOVI master in `/tmp/zinc-xovi` (`XOVI_SRC`).
