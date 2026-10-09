# Paper Pro handwriting latency — read-only device observation

**Current status: unresolved.** The user subsequently tested Fast drawing and reported
that it still fails to track the pen adequately. The qtfb FAST changes below are an
unsuccessful latency experiment, not a native-ink fix. See the source/ABI investigation
at the end of this report.

Observed 2026-09-29, 15:04:28–15:04:55 Europe/Paris, while the user drew in Notes.
OS 3.27.3.0, Linux 6.12.49, AppLoad through xovi. No device files/settings were
changed, no services were stopped, and no qtfb display commands were sent by the investigator.
Only existing journal entries, process counters, device metadata and installed binaries were read.

Installed Notes SHA-256: `9b316078aeb2e7698e0816a46e9f7a18bce190d961b735bf68ebafe0708e97d6`.
This differs from the local build with the latest `render_damage` optimization.

## Observations

- 2,837 `Updated region` entries and 215 `FB Repaint triggered` entries in the sampled log.
- During continuous drawing: approximately 99–109 region updates per second, versus 7–8 paint calls per second.
- Median paint interval: 124.7 ms; active intervals (<500 ms): 109.2–169.2 ms.
- Median submitted update area: 63 pixels. The app is already submitting small partial rectangles.
- BusyBox top during the drawing window shows Notes around 5–7% CPU and xochitl around 63–66%,
  using that tool's aggregate CPU percentages. The samples after drawing are mostly idle.

## Interpretation and limits

The visible path is throttled after the application submits pixels: the compositor paints roughly
once every 125 ms despite receiving new small rectangles roughly every 10 ms. Optimizing Notes'
software rasterization alone cannot remove this observed bottleneck.

This is **not** a measured pen-to-glass latency: journal timestamps indicate request processing
and paint calls, not physical pigment changes. The stable colour UI waveform and the Qt/xochitl
compositor are suspects; a read-only observation cannot distinguish their individual costs.

The initial proposed experiment was to compare the same workload in qtfb's fast monochrome mode and
colour UI mode, with the same counters. This would change the application's display mode and
was outside the investigator's read-only device scope. The user has since reported FAST inadequate;
there is no new instrumented FAST capture. Switching mode per
stroke is unsuitable without further work because upstream qtfb sleeps one second after each
mode-change request. A direct display takeover is not authorized and has not been attempted.

## Projects reviewed and implementation prepared locally

Sources consulted on 2026-09-29:

| Project | Useful part for Zinc | Decision |
|---|---|---|
| [AppLoad qtfb](https://github.com/asivery/rm-appload/blob/master/src/qtfb/fbmanagement.cpp) | Partial rectangles, RGB shared memory, one-second sleep after mode requests | Keep the supported app transport; explicitly handle its settling delay |
| [KOReader qtfb](https://github.com/koreader/koreader-base/blob/master/ffi/framebuffer_qtfb.lua) | FAST loses colour, UI supports colour, mode requests avoided when unchanged | Separate fast drawing from user-requested colour preview |
| [Quill](https://github.com/MaximeRivest/quill) | Direct vendor engine, fast mono ink and partial colour updates | Reference only: requires stopping xochitl and firmware-dependent vendor integration, outside the authorized device scope |
| [Riddle](https://github.com/MaximeRivest/riddle) | Distinct AppLoad and Quill backends | Confirms that its instant-ink takeover demo is not evidence of equivalent qtfb latency |
| [inkbridge](https://github.com/ClinShaiju/inkbridge) | Raw Elan pressure/tilt/eraser and pen-priority palm rejection | Input reference; streams to Windows, does not solve on-device e-ink rendering |

Implemented locally:

- Notes defaults to FAST, with explicit **Fast drawing** / **Colour preview** controls. Switching does not
  alter saved stroke colours. No automatic switch on pen-up or pen-down.
- Driver retains RGB, rasterizes damaged regions, coalesces unsent changes, uses nonblocking sends and retries
  pending damage after socket backpressure. Submission caps: 60 Hz FAST / 8 Hz UI, configurable at build time.
- A mode change waits 1.1 s without blocking input, then submits the latest frame. The same connection orders
  mode changes before updates. Unchanged pixels are repainted on preview to restore colour.
- No physical full-refresh request, added device dependency, service restart or direct display takeover.

Validation: ARM64 socket-pair regression covers mode settling, coalescing, final-stroke flush, retained RGB,
colour restoration, a saturated socket, damage rendering, quick taps, multitouch, palm rejection and disconnect.
Notes and Dashboard exported for ARM64; Notes also built/captured on macOS and its controls inspected visually.
A fake qtfb server runs the actual ARM Notes binary in Docker. None of these tests measure panel latency.
The investigator did not deploy these binaries. The user's subsequent FAST test failed subjectively;
the exact tested binary and physical latency were not independently measured.

## Follow-up: direct ink, source review and device ABI

### What FAST actually changes

The local path is `input.h` reader → per-frame pen queue → `Ink.draw()` → rasterized
damage → RGB888 shared memory → qtfb update → Qt paint → vendor display engine.
AppLoad queues partial updates onto its controller; `FBController::paint()` draws
the shared image with QPainter. Changing refresh mode leaves this path intact.
The 60 Hz setting in Zinc is a submission cap, not a panel-frame-rate guarantee.
The observed 7–8 paints/s were from the earlier capture, not a new FAST measurement.
Sources: [qtfb dispatch](https://github.com/asivery/rm-appload/blob/master/src/qtfb/fbmanagement.cpp),
[controller](https://github.com/asivery/rm-appload/blob/master/src/qtfb/FBController.cpp).

Partial updates answer *where* to repaint; a low-latency ink path also controls
*when* the pixels reach the panel. The existing partial rectangles already address
the first question. More qtfb requests alone do not answer the second.

### Strongest applicable project: Quill

[Quill's C adapter](https://github.com/MaximeRivest/quill/blob/main/src/quill_c.cpp)
exposes a writable RGB32 buffer and direct rectangular vendor swaps. It distinguishes
mono-fast partial updates from colour partial/full updates. Its
[scribble demo](https://github.com/MaximeRivest/quill/blob/main/src/scribble.c)
reads raw pen events, rasterizes pressure-dependent lines and submits dirty bounds
in mode 0 with full-refresh disabled, with an 8 ms minimum flush interval.
That interval is software scheduling, **not measured pen-to-glass latency**.
Its demo brush is not xochitl's brush engine.

The [vendor adapter](https://github.com/MaximeRivest/quill/blob/main/src/vendor_probe.cpp)
captures external-memory QImage construction while initializing the framebuffer
singleton, checks candidate format/stride, and resolves the swap symbol dynamically.
This is a concrete implementation to evaluate, not a documented stable vendor API.
Loading it after xochitl already created its singleton is not a demonstrated
in-process integration: its capture window would miss those earlier constructions.

[Riddle](https://github.com/MaximeRivest/riddle) explicitly separates its qtfb windowed
backend from its direct Quill takeover backend. Its instant-ink demo uses the latter.
An AppLoad launcher entry therefore does not establish that a demo renders through qtfb.

### Verified on this tablet, without running an adapter

Read-only SSH hashing of `/usr/lib/plugins/scenegraph/libqsgepaper.so` returned:

```text
3800e9f3d01f40fa3f5cc96ca49bcd982471ce5b033320f8788707520c8ddd08
```

This exactly matches the library in Quill's
[device test record](https://github.com/MaximeRivest/quill/blob/main/docs/device-test-2026-07-12.md),
which also lists OS 3.27.3.0 and kernel 6.12.49. That record reports partial-update,
shutdown and visual colour checks. It does not establish xochitl-equivalent latency.
It records a reboot incident from a second xochitl instance after resume, followed
by a wakelock mitigation and successful retesting. Longer soak testing remains pending.

The library was copied **from** the tablet into `/tmp/zinc-device-libqsgepaper.so`;
local `nm -D -C` in the ARM64 SDK container confirmed these actual exported symbols:

```cpp
EPFramebuffer::instance()
EPFramebuffer::swapBuffers(QRect, EPContentType, EPScreenMode,
                          QFlags<EPFramebuffer::UpdateFlag>)
EPFramebuffer::swapBuffers(QRegion const&, EPContentMap const&,
                          EPScreenModeMap const&, QFlags<EPFramebuffer::UpdateFlag>)
```

Hash and symbols make Quill a strong compatibility candidate; they do not prove
runtime safety or the complete proprietary xochitl handwriting pipeline.
No vendor binary is added to the repository.

### References that are not drop-in solutions

- [epfb-re](https://github.com/asivery/epfb-re): useful Paper Pro reverse engineering.
  Its current header and README show different swap signatures. Use the actual
  firmware ABI above, not unversioned enum/signature assumptions. qtfb mode numbers
  must not be treated as vendor mode numbers.
- [libqsgepaper-snoop](https://github.com/pl-semiotics/libqsgepaper-snoop): targets
  reMarkable 2's static library and injects code with ptrace. It is not a verified
  Paper Pro handwriting backend.
- [PADD internals](https://github.com/nothintoulouse/padd-remarkable-terminal/blob/main/docs/DISPLAY-INTERNALS.md):
  useful leads but contains its own corrections: literm does not directly call
  `swapBuffers`. It is not evidence that an injected Qt item bypasses frame scheduling.

### Implementation decision and acceptance criteria

Evaluate a separate direct-display backend before further FAST tuning. Reuse Zinc's
stroke model, pressure curve, damage tracking and saved RGB colours; do not replace
them with scribble's demonstration brush. First isolate display latency with the
existing renderer. Then measure the per-frame input/render cost before introducing
a separate immediate-ink loop. If needed, that loop must share brush geometry with
the final page renderer to avoid a stroke changing shape on pen-up.

For colour, evaluate fast provisional ink followed by a bounded colour update after
pen-up, retaining the requested colour in the document. This is a proposed strategy,
not a claim that xochitl uses this exact implementation or that every colour waveform
is flash-free.

The direct approach needs exclusive ownership of the display engine. Quill's
[takeover script](https://github.com/MaximeRivest/quill/blob/main/scripts/takeover.sh)
stops xochitl, acquires a wakelock and removes a framebuffer lock. It was **not run**.
Its shell trap cannot recover from SIGKILL, and the script does not fail closed on
a failed wakelock or stop. Do not copy its “always restore” promise as a guarantee.
A test launcher needs checked ownership acquisition and an independent cleanup
supervisor, bounded runtime, and restoration after crash or SSH disconnection.
No firmware, boot configuration, waveform files or persistent service changes are
needed for the proposed experiment; temporarily stopping xochitl still changes the
tablet's running state and has not been performed.

Acceptance must include a same-device high-speed-camera comparison with xochitl
(same pen, stroke speed and colour), reporting first-mark and moving-tip lag, plus
fast curves, pressure changes, pen-up tail, erasing, finger controls, colour recovery
and exit. Test normal exit, SIGTERM, crash and disconnect restoration before a long
drawing session. Local socket tests cannot establish any of these panel results.

Only documentation changed in this follow-up. Native-speed drawing is not implemented
or validated yet; the evidence supports changing the backend, not declaring the bug fixed.
