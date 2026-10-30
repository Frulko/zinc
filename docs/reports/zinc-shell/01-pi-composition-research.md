# Zinc shell on Raspberry Pi: composition research

Date 2026-10-30. Goal: one system process owns the screen (DRM/KMS), draws a permanent top bar, shows one app (separate process) below it, no X/Wayland, no GPU needed, Pi 1/Zero (ARMv6, 512 MB) to Pi 5.

Evidence levels: **[src]** = read in the Raspberry Pi kernel source (`rpi-6.12.y` or `rpi-6.1.y`, GitHub raw) during this research; **[doc]** = kernel/libdrm documentation or upstream source, cited from knowledge and not re-fetched this session; **[est]** = my estimate, to be measured on the rig (nothing was run on a device).

## 1. Hardware composition

### 1.1 What vc4 exposes per CRTC

All of Pi 0/1/2/3 (HVS4, `brcm,bcm2835-vc4`), Pi 4 (HVS5, `brcm,bcm2711-vc5`) and Pi 5 (HVS6, `brcm,bcm2712-vc6`) are driven by the same `drivers/gpu/drm/vc4` code, selected by generation in `vc4_of_match[]` [src: [vc4_drv.c](https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/gpu/drm/vc4/vc4_drv.c)]. Both driver variants set `DRIVER_MODESET | DRIVER_ATOMIC | DRIVER_GEM`.

From `vc4_plane.c` [src: [vc4_plane.c](https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/gpu/drm/vc4/vc4_plane.c), [master](https://github.com/torvalds/linux/blob/master/drivers/gpu/drm/vc4/vc4_plane.c)]:

| Plane type | Count | Notes |
|---|---|---|
| Primary | 1 per CRTC | zpos immutable 0 |
| Overlay | `VC4_NUM_OVERLAY_PLANES` = **16 total**, each with `possible_crtcs` = all CRTCs (shared pool, not 16 per CRTC) | zpos 1..16; comment: kept modest because every plane costs memory and atomic-loop time, "any sane usecase" fits |
| Cursor | 1 per CRTC | zpos 17 (on top); a real HVS plane, ARGB8888 |

The same table holds on every generation (the plane code is shared); the differences are in HVS internals:

| | Pi 0 / 1 / 2 / 3 (and Zero 2 W) | Pi 4 / 400 / CM4 | Pi 5 / CM5 |
|---|---|---|---|
| Driver gen | `VC4_GEN_4` | `VC4_GEN_5` | `VC4_GEN_6_C/D` |
| Display chip | VC4 HVS + pixelvalves | HVS5 | HVS6 (BCM2712), outputs via RP1 for DSI/DPI/composite, HDMI from BCM2712 |
| CRTCs usable | HDMI, DSI, DPI/composite (TXP = writeback) | 2x HDMI (+DSI, composite) | 2x HDMI (+DSI/DPI via RP1) |
| Line buffer (LBM) | 48 K words (2x12-bit) | 60 K words (4x12-bit) | 1024 entries, new UPM allocator |
| Dlist memory | `SCALER_DLIST_SIZE` (fixed, 16 KB class, small) | same style, larger | read at runtime from `SCALER6_CXM_SIZE` |
| Load tracker (hard `-ENOSPC`) | **enabled**: membus > 1.5 GB/s or HVS > 240 Mcycles/s rejects the commit | disabled ("not relevant for BCM2711") but used to size the core clock | like gen 5 |
| 10-bit RGB, P030 | no | yes | yes (+ P010/P012/P016) |
| Max pixel clock concern | 1080p60 ok | 4Kp60 ok | 4K ok |

[src: vc4_hvs.c, vc4_kms.c]. The HVS processes 4 px/cycle unscaled, 2 px/cycle when scaling (comment in `vc4_plane_calc_load`), so **unscaled planes are cheapest**: Zinc must never ask the HVS to scale.

### 1.2 Formats, alpha, scaling

From the `hvs_formats[]` table [src]:

| Format | HVS4 (Pi 0-3) | HVS5/6 | Use for Zinc |
|---|---|---|---|
| XRGB8888 / XBGR8888 / ARGB8888 / ABGR8888 and RGBX/BGRX/RGBA/BGRA | yes | yes | default, bar and app |
| RGB565 / BGR565 | yes | yes | app buffer on Pi 0/1 to halve bandwidth and copies |
| ARGB1555, ARGB4444 family, RGB332, RGB888/BGR888 | yes | yes | not needed |
| XRGB2101010 family | no | yes | no |
| YUV / NV12 | yes (linear, T-tiled only for 8/16-bit RGB) | yes (+SAND) | video later, free colour conversion |

* **Alpha**: per-plane alpha property plus blend modes `PIXEL_NONE`, `PREMULTI`, `COVERAGE`. A format with alpha, partial plane or plane alpha sets `needs_bg_fill`: extra cost. A bar/app with opaque XRGB8888 and no overlap is the cheap case.
* **Scaling**: supported (TPZ/PPF filters, any factor via `drm_atomic_helper_check_plane_state(..., 1, INT_MAX)`), uses LBM. Not needed here; costs HVS cycles. A free bonus: an app rendering 640x360 can be scaled to 1280x720 by the HVS (useful on a Pi 1 for heavy apps).
* **Overlay cost**: every plane adds a dlist entry (28 bytes minimum per the source comment) and per-line HVS fetch; cost is bandwidth = width x height x bytes x refresh for each plane, even partly occluded (the HVS fetches per line; do not rely on occlusion culling). Two planes sized to their own rectangle (no overlap) cost exactly the screen's worth of bytes, same as one plane. [src for the load model; the occlusion remark is [est], check with a bandwidth probe.]
* **Budget** (read bandwidth, XRGB8888, 60 Hz): 800x480 = 92 MB/s; 1280x720 = 221 MB/s; 1920x1080 = 498 MB/s. Pi 1's tracker limit of ~1.5 GB/s [src] leaves room for exactly: 1080p app (498) + 1080p full-size bar plane (498) = ~1 GB/s. Fine, but sizing the bar plane to its rectangle is better. RGB565 halves it.

### 1.3 Atomic modesetting availability

| Stack | Atomic | Planes | Verdict |
|---|---|---|---|
| `vc4-kms-v3d` (full KMS), Pi 0 to 4 | yes | 1 primary, 16 shared overlays, 1 cursor per CRTC | **Target.** Default of Pi OS since Bookworm on all models; Pi 1/Zero ARMv6 works but with a slow V3D (we do not use it) |
| `vc4-kms-v3d-pi5` (also `vc4-kms-v3d` on Pi 5 kernel) | yes | same | Target for Pi 5 |
| `vc4-fkms-v3d` (firmware KMS, ARM driver is a thin shim over the VPU mailbox) | atomic helpers, so yes | `PLANES_PER_CRTC` = **8: 1 primary, 6 overlay, 1 cursor**; formats XRGB/ARGB/XBGR/ABGR, RGBX/BGRX, RGB565, RGB888/BGR888, YUV420/422, NV12/21, P030; alpha and zpos (0..127) supported; **async page flips refused** [src: [vc4_firmware_kms.c](https://github.com/raspberrypi/linux/blob/rpi-6.1.y/drivers/gpu/drm/vc4/vc4_firmware_kms.c)] | Works with the same code (use `drmModeAtomic*`), 6 overlays still plenty. Legacy for Pi 0-3 and deprecated (Pi OS moved to full KMS); do not design for it, just do not break on it |
| Legacy firmware framebuffer (`/dev/fb0` from `bcm2708_fb`, no KMS) | no | one framebuffer, `FBIOPAN_DISPLAY`, `FBIO_WAITFORVSYNC`, no planes | Old images only. On current images `/dev/fb0` is the DRM fbdev emulation (a single primary plane). Fallback path: single buffer, software compose both bar and app, pan between two halves for vsync |

Capability probe at start: open `/dev/dri/cardN` that has connectors (on Pi 4/5 the display card is the vc4 node, `v3d` is a separate render node, so pick the card by `drmModeGetResources`, not by index), set `DRM_CLIENT_CAP_UNIVERSAL_PLANES` and `DRM_CLIENT_CAP_ATOMIC`; if atomic fails go to the fbdev fallback.

## 2. Sharing the app's frame with the compositor

### 2.1 Facts on vc4 buffers

* Dumb buffers are CMA (physically contiguous) memory from the GEM DMA helper: on Pi 0-3 `vc4_bo_dumb_create` -> `vc4_bo_create(..., VC4_BO_TYPE_DUMB)` -> `drm_gem_dma_create`; on Pi 4/5 `vc5_dumb_create` -> `drm_gem_dma_dumb_create_internal` [src: vc4_drv.c, [vc4_bo.c](https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/gpu/drm/vc4/vc4_bo.c)].
* Export: `vc4_prime_export` -> `drm_gem_prime_export`; this works for dumb BOs (shader BOs are rejected) [src]. Import: `vc4_prime_import_sg_table` -> `drm_gem_dma_prime_import_sg_table` (rejects SWIOTLB bounce pages) [src]. Since the CMA allocation is contiguous, an imported dma-buf from the same device is just the same pages.
* mmap of a dumb BO: `drm_gem_dma_mmap`; mappings from the DMA helper are write-combined [doc]. CPU reads from it are slow (uncached-class): the app must render into its own cached memory only if it must read back; otherwise write sequentially.
* `DRM_IOCTL_MODE_CREATE_DUMB` and `PRIME_HANDLE_TO_FD` need no DRM master [doc: [drm-uapi](https://docs.kernel.org/gpu/drm-uapi.html), [drm-mm PRIME](https://docs.kernel.org/gpu/drm-mm.html)]; only modesetting/commit needs master. So any process that can open `/dev/dri/card0` can allocate scanout-capable buffers. (Access to the card node is by group `video`; the compositor, as master, is the only committer.)

### 2.2 Options compared

| Option | Copy? | Works on all Pi? | Complexity | Notes |
|---|---|---|---|---|
| **A. Compositor allocates dumb buffers, sends dma-buf fds to the app, app mmaps them and draws into them** | **zero copy** | yes (vc4 dumb/PRIME verified in source) | low | Wire: `SCM_RIGHTS` over `AF_UNIX`. Compositor does `drmModeAddFB2` itself on its own handles (no import call at all, it created them). App needs only `mmap(fd)`, no libdrm, no card access. Best for Zinc's CPU raster (`runtime/` raster writes pixels into a buffer anyway) |
| B. App allocates dumb BO, exports with `drmPrimeHandleToFD`, sends fd; compositor does `drmPrimeFDToHandle` + `drmModeAddFB2` | zero copy | yes, same device so import returns the existing contiguous pages | medium | Needs the app to open the card node. Same result as A, more moving parts. Needed only if the app uses the GPU (GBM/EGL) to render |
| C. memfd/shm + memcpy into the compositor's dumb buffer | 1 copy per frame | yes | lowest | Cost (est): memcpy into a write-combined mapping on Pi 1 at roughly 150-300 MB/s => 800x480x4 (1.5 MB) ~5-10 ms; 1080p (8.3 MB) ~30-50 ms: too slow on Pi 1/Zero at 1080p, acceptable on Pi 3 (800x480 ~1-2 ms; 1080p ~8-15 ms) and fine on Pi 4/5. Use damage rects and RGB565 to cut it. Good as the universal fallback |
| D. udmabuf (`/dev/udmabuf`, wrap a memfd as dma-buf) | zero copy only if the display can scan out non-contiguous memory | **no**: vc4 `drmModeAddFB2` needs CMA-contiguous pages; a udmabuf is scattered, importing it would copy or fail (`vc4_prime_import_sg_table` expects a contiguous sgt) | n/a | Do not use [doc: [udmabuf](https://docs.kernel.org/driver-api/dma-buf.html)] |
| E. DRM leases (`drmModeCreateLease`) | zero copy | yes on kernels with leases | high | See 2.3: does not fit |

**Recommendation: A.** The compositor owns allocation, N (2-3) buffers per app, the app only maps them. One mmap per buffer once, then the app renders; the buffer index is the only per-frame message. Fall back to C only if mmap of the dma-buf fails (or on the legacy fbdev path).

### 2.3 DRM leases

`drmModeCreateLease(fd, objects, n, flags, &lessee_id)` returns a new fd whose holder acts as DRM master over the leased connector/CRTC/plane objects only [doc: [drm-uapi leases](https://docs.kernel.org/gpu/drm-kms.html#drm-leases-and-kms-objects), libdrm `xf86drmMode.h`]. It is made for VR HMDs and wlroots/Weston "drm-lease". It does not fit here: a plane can only be committed together with its CRTC, and a CRTC belongs to exactly one lease/master, so the app and the compositor could not each drive "their" plane on the same CRTC. Also vc4's commit tail serialises on the HVS channel [src: vc4_kms.c waits for the previous pending commit per FIFO channel], so two committers would gain nothing. Leases are the right tool only for "app owns a whole display" (a future second screen), not for a bar plus an app.

## 3. Input

* The compositor owns input: opens `/dev/input/event*` (via libinput, or raw evdev for ARMv6 minimalism), maps coordinates, and forwards events over the same Unix socket as small fixed structs (kind, time, x, y, key, buttons), exactly like Wayland's `wl_pointer`/`wl_touch` and Android's InputDispatcher. A local socket write is tens of microseconds, negligible against a 16 ms frame; the real latency is the frame pipeline (input -> app render -> flip -> next vblank, 1 to 2 frames), not the transport [est].
* Hit test in the compositor: bar rectangle goes to the shell (clock, back, menu), the rest is translated by `-bar_h` and sent to the app. Touch DOWN that started on the bar stays on the bar until UP (implicit grab).
* Keys: the compositor keeps system keys (power, a "home" chord) and forwards the rest. Alternative sometimes used (kmscon, Android on simple devices): pass evdev fds to the app (`libseat`/`logind` style); it saves a hop but loses the compositor's control, so not recommended.
* Session/permissions: the compositor needs DRM master and input access. On Pi OS Lite either run as root from a systemd unit (`TTYPath=/dev/tty1`, `ExecStartPre` to stop getty), or use `libseat`/`seatd` (what cage and labwc do) so it can run as a user in groups `video,input`. VT switching can be ignored in an appliance.
* Keep the cursor out unless a mouse is present; if so use the HVS cursor plane (free, 64x64 ARGB, one per CRTC) [src].

## 4. How other minimal systems do it

* **cage** (wlroots kiosk): one fullscreen Wayland client, wlroots DRM backend, libseat. Smallest *Wayland* answer, but needs a Wayland client (GL/SHM) and wlroots; heavy for ARMv6 [doc: [cage](https://github.com/cage-kiosk/cage)].
* **labwc / wlroots drm backend**: the DRM backend builds a per-output atomic commit; the scene graph assigns a client buffer to an overlay plane directly only when its format/size allows ("direct scanout"/plane offload, by testing the commit with `DRM_MODE_ATOMIC_TEST_ONLY`), else composites with the renderer (GLES2 or pixman) into the primary plane [doc: [wlroots backend/drm](https://gitlab.freedesktop.org/wlroots/wlroots/-/tree/master/backend/drm)]. The test-only commit idea is worth copying for our plane layout.
* **Weston drm-backend**: assigns views to planes (`drm_output_prepare_plane_view`, `DRM_PLANE_TYPE_OVERLAY`) with "plane-only" and "renderer-only" fallback; on Pi it uses the pixman renderer (CPU) without GL [doc: [weston libweston/backend-drm](https://gitlab.freedesktop.org/wayland/weston/-/tree/main/libweston/backend-drm)]. Confirms CPU compose + planes is a supported pattern on Pi.
* **kmscube / modeset.c** (libdrm `tests/modeset`): one dumb buffer, `drmModeSetCrtc`, then `drmModePageFlip`; the minimal template for our compositor core [doc: [libdrm tests](https://gitlab.freedesktop.org/mesa/drm/-/tree/main/tests/modeset)].
* **Kodi (GBM)**: GBM+EGL, video as NV12/YUV overlay plane (zero-copy via dma-buf from the decoder) and GUI on the primary plane: the same "video plane + UI plane" split Zinc uses for bar + app, atomic commits, vblank-driven.
* **webOS (LG/HP)**: Qt/Wayland compositor (`webos-wayland-compositor`) plus a window manager; heavy.
* **Kobo/Kindle**: fbdev, one process draws everything (the reader), the "bar" is app-drawn; e-ink refresh via ioctls, no compositor. **reMarkable**: xochitl owns the framebuffer; third-party apps use the `qtfb`/`rm2fb` shim (a shared-memory framebuffer plus a message to request refresh): essentially option C for e-ink.
* **Android SurfaceFlinger / HWC**: apps render into gralloc buffers (dma-buf), SurfaceFlinger asks the HWC to assign layers to hardware planes (device composition) and falls back to GPU composition (client). Status bar and app are two layers on two planes: exactly our design [doc: [AOSP HWC](https://source.android.com/docs/core/graphics/hwc)].
* **Mesa `kms_swrast`**: a GBM/EGL loader using software rasteriser and dumb buffers when no GPU driver is usable [doc: [Mesa](https://docs.mesa3d.org/)]. Only relevant for apps that need EGL on ARMv6; Zinc's CPU raster does not.

**Smallest design that works** (all of it is ~500 lines of C++):

1. `zinc-shell` opens the card, sets universal-planes + atomic, picks connector/mode (or `ZINC_MODE`).
2. Allocates: bar buffer (W x bar_h, XRGB8888) on the primary plane at (0,0) [size/position of a primary plane smaller than the CRTC must be confirmed on hardware; fallback: full-size primary holding the bar on top and black below]; N app buffers (W x (H-bar_h), XRGB8888 or RGB565) as dumb BOs, exported as fds.
3. Overlay plane at (0, bar_h), unscaled, shows the current app buffer.
4. App process is started by the shell with a socket fd; receives the buffer fds (`SCM_RIGHTS`), mmaps them, renders, sends "frame N ready (damage)".
5. Shell redraws the bar (clock, status) into its own buffer when needed and commits.

## 5. VSync and page flips with two producers

* Only the compositor commits. The app never touches KMS [doc: atomic uAPI, [drm-kms](https://docs.kernel.org/gpu/drm-kms.html)].
* App -> shell: `FRAME(buf_idx)` over the socket when the buffer is complete (and only after the last write; since the buffer is write-combined memory a store fence before the message is enough on the same CPU, since sendmsg is a syscall barrier).
* Shell: one atomic commit per vblank at most, containing every plane change that is pending (new `FB_ID` for the app plane, new bar buffer if the bar changed), flags `DRM_MODE_ATOMIC_NONBLOCK | DRM_MODE_PAGE_FLIP_EVENT`. Wait for the previous event before the next commit; vc4 serialises commits per HVS channel anyway [src: vc4_kms.c]. `drmHandleEvent` on the DRM fd in the same `poll()` loop as the socket and evdev.
* On the flip event: send `RELEASE(old_buf)` to the app (the old buffer is free), so the app can draw into it. Use 3 buffers (one scanning out, one pending, one being drawn) to stay at 60 fps with an app that takes a full frame; 2 buffers force the app to wait for the flip.
* App pacing: the app is not given a clock; the shell sends `FRAME_DONE(vblank_time)` after each flip (or only after a request, to let static apps idle). Static screens: no commit, no wake-up (battery on a Zero).
* Async flips: vc4 advertises `async_page_flip` for legacy-style updates but the atomic async path accepts only fb-pointer changes, and fkms refuses it [src]; do not use. Tearing-free vblank-aligned commits are cheap at 60 Hz.
* Bar updates (clock once per second) are a separate commit that is merged into the next app commit if one is due, so the two producers never fight over the CRTC.
* Timeout rule: if the app has not released/sent a frame for N seconds, keep the last frame and show an error in the bar; if the app dies (socket EOF) the shell keeps scanning out the last buffer and can start the launcher.

## 6. Conclusions

1. vc4 is one atomic KMS driver on every Pi: per CRTC 1 primary + 1 cursor, plus a shared pool of 16 overlays (fkms: 8 planes per CRTC). Two planes (bar, app) is far below any limit.
2. Plane cost is bandwidth, not plane count; keep planes unscaled and sized to their own rectangle. Pi 1/Zero limit (1.5 GB/s) is the only enforced cap [src]; 1080p XRGB60 costs 0.5 GB/s per plane, RGB565 halves it.
3. Zero-copy: the shell allocates the dumb buffers (CMA, exportable via PRIME) and passes fds with `SCM_RIGHTS`; the app mmaps and draws. No import, no libdrm in the app.
4. memfd + memcpy is the universal fallback (1 ms-ish on Pi 3 at 800x480, too slow for 1080p on Pi 1). udmabuf does not work for vc4 scanout (needs contiguous memory); DRM leases do not fit (one CRTC, one master).
5. Only the shell commits (atomic, NONBLOCK + PAGE_FLIP_EVENT, 3 buffers); the app signals "frame ready", the shell answers "buffer released".
6. Input: shell reads evdev/libinput, hit-tests the bar, forwards translated events over the socket.
7. Prior art that matches: Android HWC (layers to planes), Weston pixman + overlay planes, Kodi video plane + UI plane, kmscube/modeset for the core loop.
8. Fallbacks: fkms (same code), legacy fbdev (single buffer, software compose, `FBIO_WAITFORVSYNC`).

## 7. To verify on hardware (not done: no device was touched)

* A primary plane smaller than the CRTC accepted by `vc4_plane_atomic_check` on gen 4 / 5 / 6 (else full-size primary fallback).
* `TEST_ONLY` commit with primary + overlay at XRGB8888 and RGB565 on a Pi 1/Zero with 800x480 DSI and 1080p HDMI.
* mmap-write speed into the dumb buffer from ARMv6 (memcpy MB/s) to size option C.
* CMA size on 512 MB boards (`dmesg | grep -i cma`; the overlay parameter `cma-<n>` changes it): three 1080p XRGB buffers are ~25 MB.
* That the dma-buf `mmap` works as a non-master client on Pi OS trixie kernels (`/dev/dri/card0` group `video`).
