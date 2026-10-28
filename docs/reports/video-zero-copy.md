# Zero-copy video on Zinc: Raspberry Pi 3 first, then the other targets

Date: 2026-10-12. Research only, no code changed. Every statement is tagged **[sourced]** (URL, local file, or the
device read on 2026-10-12) or **[inference]** (reasoned, not read in a source, or from memory of the subject and not
re-fetched). No number below is invented; where a cost is unknown it is said so.

## 0. Summary

1. The Pi 3 decoder already hands out dmabuf-capable buffers and this FFmpeg build advertises `drm_prime` for
   `h264_v4l2m2m` [sourced: device, section 6]. `zinc:video` ignores that and copies and converts on the CPU
   (`plugins/video/native/video.host.cpp`: swscale to BGR0) [sourced: local file].
2. The HVS (the Pi's scan-out compositor) can show NV12 and YUV420 (3 planes) directly, scale, blend with alpha and
   stack 16 overlay planes per CRTC [sourced: `drivers/gpu/drm/vc4/vc4_plane.c`, v6.12]. So colour conversion and
   scaling can leave the CPU and the GPU entirely.
3. `display-gl`'s `kms.cpp` uses only legacy `drmModeSetCrtc` / `drmModePageFlip` on the primary plane; it never
   touches planes [sourced: `plugins/display-gl/src/kms.cpp` lines 222-266]. Nothing in Zinc owns a plane yet.
4. The HVS cannot do rounded corners, 90-degree rotation, or arbitrary shapes; the standard answer is a UI plane
   with alpha stacked above the video, with a hole [inference, section 4]. Zinc's software UI would then have to
   produce a real alpha channel (the GL overlay is "keyed, not alpha-blended" today [sourced: docs/plugins/display-gl.md, Limits]).

Ranked designs (details in section 7): **A** video on an HVS overlay plane under the software UI, UI on an
alpha plane above, with a "hardware image" command; **B** interim copy-free-ish path on the existing fbdev display
(decoder output at draw size, no swscale); **C** EGLImage external texture in `display-gl` for the cases the
plane cannot do.

## 1. Decoder to dmabuf on the Pi 3

### 1.1 What the device decoder is [sourced: device]

- Driver `bcm2835-codec`, card `bcm2835-codec-decode`, `/dev/video10`, multiplanar M2M, stateful (kernel
  `6.12.75+rpt-rpi-v8`).
- OUTPUT (compressed) formats: `MPG4`, `H264`, `MJPG`, `H263`. **No HEVC, VP8, VP9** on this node.
- CAPTURE (raw) formats: `YU12` (I420), `YV12`, `NV12`, `NV21`, `NC12` (NV12 128-byte column "SAND"), `RGBP`
  (RGB565), `AB24` (RGBA), `BGR4` (BGRX). The VPU firmware can therefore also output RGB itself [inference: that
  conversion runs on the VideoCore, its cost is not measured].
- Frame size: stepwise 32x32 to 1920x1920, step 2 (`v4l2-ctl --list-framesizes=H264`). H.264 profile control reports
  High, level up to the menu max of 15 entries (level 4 shown as current value).
- CMA is 256 MB total; `CmaFree` read 20 MB at the time of reading (the device was in use) [sourced: /proc/meminfo].
  The FFmpeg wrapper asks for 20 capture buffers by default (`num_capture_buffers`, section 1.2); for 1080p NV12
  (about 3.1 MB each) that is about 62 MB [inference: arithmetic]. Tune it down.
- Pi 3 limits "1080p30 H.264, no HEVC": matches the codec list above; the 1080p30 figure itself I could not fetch
  from an official page (raspberrypi.com documentation page fetched did not contain it) [not verified].

### 1.2 FFmpeg on this Pi [sourced: device]

- `ffmpeg 7.1.3-0+deb13u1+rpt1` (Raspberry Pi's Debian rebuild; libavcodec61 8:7.1.3-...+rpt1). Configure flags
  include `--enable-sand --enable-v4l2-request --enable-vout-drm --enable-libdrm --enable-epoxy --disable-mmal
  --disable-omx`.
- `ffmpeg -h decoder=h264_v4l2m2m`: "Supported pixel formats: drm_prime nv12 yuv420p"; options
  `num_output_buffers` (16), `num_capture_buffers` (20), `pixel_format`, `dmabuf_alloc`.
- `hevc_v4l2m2m`, `vp8_...`, `vp9_...`, `mpeg2_...` wrappers exist in the binary but the kernel node has no matching
  OUTPUT format, so they cannot work on a Pi 3 [inference from the V4L2 list].
- Pixel formats known: `drm_prime`, `sand128`, `sand64_10`, `sand64_16`. `-hwaccels` lists vdpau, cuda, vaapi, drm,
  opencl, vulkan (`drm` here is the generic DRM hwdevice, not a decoder).
- Muxer/device `vout_drm` exists (the Pi fork's DRM video output) and `kmsgrab`.
- Whether stock upstream n7.1 has the DRM_PRIME output: my fetches of `v4l2_m2m_dec.c` / `v4l2_buffers.c` (n7.1) came
  back without any DRM_PRIME code, but that was a summariser over a possibly truncated page, so it is **not
  verified**. The 2018 ffmpeg-devel patch "libavcodec: v4l2m2m: output AVDRMFrameDescriptor" (exports the V4L2
  buffer with EXPBUF, wraps it as the rkmpp decoder does, selects `AV_PIX_FMT_DRM_PRIME` via `get_format`, adds
  YUV420P handling "for raspberry pi") is only known from a search snippet [sourced: search result,
  https://lists.ffmpeg.org/pipermail/ffmpeg-devel/2018-August/233295.html; the page itself returned "Access Denied" to
  the fetcher]. What matters: the binary on the device advertises it.

### 1.3 How a program asks for dmabuf frames [inference, standard libavcodec API; not re-fetched]

1. Open `h264_v4l2m2m` with `avcodec_find_decoder_by_name`.
2. Install a `get_format` callback that returns `AV_PIX_FMT_DRM_PRIME` when it is in the offered list (the wrapper
   offers it first on this build per the pix_fmts list above; the callback is the documented way to choose).
3. Each decoded `AVFrame` then has `format == AV_PIX_FMT_DRM_PRIME` and `data[0]` points to an
   `AVDRMFrameDescriptor` (objects = dmabuf fds + sizes + format modifier; layers = DRM fourcc + planes with
   object index, offset, pitch). Max `AV_DRM_MAX_PLANES = 4`; "internal frame allocation is not currently supported -
   all frames must be allocated by the user" and `AVHWFramesContext` is NULL for these frames
   [sourced: https://ffmpeg.org/doxygen/7.1/hwcontext__drm_8h.html].
4. `drmPrimeFDToHandle` then `drmModeAddFB2WithModifiers` turns it into a KMS framebuffer; `eglCreateImage` with
   `EGL_LINUX_DMA_BUF_EXT` turns it into an EGLImage.
5. Lifetime: the V4L2 wrapper counts references per buffer; a buffer returns to the driver only when the last
   `AVBufferRef` is released [sourced: `v4l2_buffers.c` summary: `v4l2_buf_increase_ref`, `v4l2_free_buffer` re-queues
   the buffer on release]. So the frame must be kept referenced as long as the plane scans it out. Players hold
   several: mpv keeps three slots (current, last, old) "as triple buffering to make sure the drm framebuffer is not
   displayed when released" [sourced: mpv `video/out/hwdec/hwdec_drmprime_overlay.c`]; Kodi acquires a reference per
   picture and warns "unreleased video buffer" [sourced: Kodi `RendererDRMPRIME.cpp`]. With the wrapper's 20 capture
   buffers there is room; each held frame is one fewer buffer for the decoder's reorder queue [inference].
6. Pitfalls [inference unless marked]: (a) the wrapper's format may be YU12/I420 (3 planes in one buffer) or NV12;
   both are accepted by the HVS as linear formats [sourced: vc4_plane.c]; `NC12`/SAND is not requested by default.
   (b) Pitch and the coded height (rounded to 16/32) differ from the visible size: use the source rectangle
   (`SRC_W/H` in 16.16) to crop, as mpv does [sourced: mpv file]. (c) `AV_CODEC_CAP_DELAY`: the wrapper reorders
   and buffers (flags "delay avoidprobe hardware", device); expect several frames of latency, not measured here.
   (d) A seek or loop flushes the decoder: frames still on a plane must stay valid until the next commit replaces them.

### 1.4 References for what works on a Pi 3

- **V4L2 M2M directly (no FFmpeg)**: the same `/dev/video10` stateful API: QBUF compressed packets on OUTPUT,
  EXPBUF on CAPTURE buffers gives the dmabuf fds. It removes libavcodec's wrapper and its 20/16 buffers but means
  writing the stateful decoder protocol (resolution change event, drain) and an H.264 demux/Annex-B stage. The FFmpeg
  wrapper does that already [inference]. Not worth it for Zinc except for latency.
- **GStreamer**: the device has `gstreamer1.0-plugins-good` (`libgstvideo4linux2.so`), `-bad` (`libgstv4l2codecs.so`,
  `libgstkms.so`, `libgstopengl.so`, `libgstwaylandsink.so`) 1.26.2 [sourced: device]. So `v4l2h264dec ! kmssink`
  and `glimagesink` are installable references. I found **no** published Pi 3 benchmark of that pipeline [sourced:
  my searches returned only a GTK merge request about zero-copy DMABuf playback tested on a Pi 4]. Not measured.
- `mpv`, Kodi are not installed on the device; VLC is (`libdrm_vout_plugin.so`, `libgles2_plugin.so`,
  `libwl_dmabuf_plugin.so`, `libavcodec_plugin.so`) [sourced: device].

## 2. Dmabuf to the screen

### 2a. KMS overlay plane composed by the HVS

Facts [sourced: `drivers/gpu/drm/vc4/vc4_plane.c`, Linux v6.12, https://raw.githubusercontent.com/torvalds/linux/v6.12/drivers/gpu/drm/vc4/vc4_plane.c]:

- Formats (all planes): XRGB8888, ARGB8888, ABGR8888, XBGR8888, RGB565, BGR565, ARGB1555, XRGB1555, RGB888, BGR888,
  RGB332, several 4444; **YUV420 / YVU420 (3 planes), NV12 / NV21 (2 planes), YUV422 / YVU422, NV16 / NV61**. Those YUV
  formats only accept `DRM_FORMAT_MOD_LINEAR` on the vc4 (HVS4) build of the function; SAND/T-tiled modifiers are
  listed for the Pi 4 generation. 10-bit and P030 are `hvs5_only`.
- Properties on every plane: `alpha`, `pixel blend mode` (none / premultiplied / coverage), `rotation` (only
  0, 180, reflect-X, reflect-Y), `COLOR_ENCODING` (BT601, BT709, BT2020), `COLOR_RANGE` (limited/full), `zpos`.
  Primary plane zpos is immutable 0; overlays have mutable zpos.
- Scaling: no explicit maximum in the file; mode PPF when `3*dst >= 2*src`, otherwise TPZ (a poly-phase filter
  versus a trapezoid, i.e. downscale beyond 1.5x uses the cheaper, lower-quality filter). Real limits come from HVS
  line-buffer memory (LBM) and bandwidth; allocation failures return an error at atomic check, and the file shows
  no hard bandwidth ceiling [sourced for what the code shows; the actual ceiling for 854x480 -> 800x480 NV12 on a Pi 3 is unknown].
- Planes: `VC4_NUM_OVERLAY_PLANES = 16` per CRTC, zpos 1..17, plus a cursor plane per CRTC. The device's debugfs
  lists 56 `plane[...]` entries and zpos values up to at least 0xf [sourced: `/sys/kernel/debug/dri/0/state`, device].
  HVS display list is about 16 KB; a plane costs from 28 bytes [sourced: vc4_plane.c comments].
- Cost of a per-frame update: an atomic commit changing `FB_ID` on one overlay plane (plus the UI plane's FB_ID) is a
  normal flip; the display list is rewritten if anything but position/pointer changes. **Async update is only allowed
  on the primary plane** (`vc4_plane_atomic_async_check`), so an overlay flip is a vsync-synchronised commit
  [sourced: vc4_plane.c]. For video at 24 fps on a 60 Hz panel this is fine; the UI plane can be committed in the
  same atomic request [inference].
- vsync: commits complete at the next vblank; the DSI panel runs 800x480 [sourced: device `modes`]. Pace with the
  page-flip event as `kms.cpp` already does for the primary plane [sourced: kms.cpp:260].
- No colour key and no chroma key property exists in the list above, so "transparent hole" needs a real alpha channel
  [sourced by absence in vc4_plane.c; inference that it is the whole story].
- Which side of the video the UI sits: two layouts. **UI under, video over**: primary = UI (XRGB8888, opaque), video
  overlay with higher zpos; the UI cannot appear over the video. **Video under, UI over**: video on the primary plane or
  a low overlay, the UI on an ARGB8888 overlay above (premultiplied or coverage blend), transparent where the video
  shows. mpv's `--vo=drm` does the second: `--drm-draw-plane` carries video/OSD (with drmprime-overlay "only the OSD is
  rendered to this plane") and `--drm-drmprime-video-plane` defaults to `overlay` with `ZPOS 0` set on the video plane
  [sourced: mpv `DOCS/man/vo.rst`, `hwdec_drmprime_overlay.c`].
- Some devices require the primary plane to have a framebuffer even with the overlay in use; mpv's
  `disable_video_plane` comment says so [sourced: mpv file]. On vc4 the primary is where fbcon sits (below).

### 2b. EGLImage into a GLES 2 shader

- Mesa implements multi-planar YUV dmabuf import generically: the state tracker lowers an external YUV EGLImage to
  several texture fetches (one per plane, `st_nir_lower_tex_src_plane`) and colour-space conversion in the shader
  [sourced: Mesa commits found by search: "Support multi-planar YUV for external EGLImage's (currently just in the
  dma-buf import path) by lowering to multiple texture fetch's for each plane and CSC in shader"; fixed for NV12/YUV420/YVU420
  against piglit; URLs: https://gitlab.freedesktop.org/mesa/mesa/-/merge_requests/9812 and
  https://gitlab.freedesktop.org/gbeatty/mesa/-/commit/079e5f73d72e9ed8b06a3d14aa0e4ac93d9bac43]. That is the
  generic path; whether the vc4 driver on this Mesa (25.0.7 rpt4, device) exposes NV12 / YU12 through
  `eglQueryDmaBufFormatsEXT` I could **not** read (no `eglinfo` on the device, and starting a GL program is forbidden) [not verified].
  A separate v3d (Pi 4) change makes YUV external-only [sourced: https://gitlab.freedesktop.org/mesa/mesa/-/merge_requests/10524].
- Cost per pixel on VideoCore IV: not measured. The existing measurement is that the GL replay on this GPU is
  slower than software for ordinary UI because the QPU has no branches and one program per mode is needed (D111,
  docs/reports/raspberry-pi.md "Why the GL renderer is slow on VideoCore IV"). A video quad needs two
  fetches + a 3x3 matrix per fragment [inference]; at 800x480 that is 384k fragments per frame, probably affordable
  alone but unmeasured. Extensions needed: `EGL_EXT_image_dma_buf_import` (+`_modifiers`),
  `GL_OES_EGL_image_external` (and `_essl3` not on GLES 2) [inference, names standard].
- Advantages: any transform (rotation, rounded corners via the shader or a mask, blending, several videos, filters).
  Costs: a GPU pass, the frame must be re-composed with the software overlay (a second blend), and the GL path
  re-renders the whole frame per video frame.

### 2c. `/dev/fb0` and KMS

- On the device `/dev/fb0` is `vc4drmfb`, 800x480 virtual, 16 bpp; the debug state shows the primary `plane-2`
  on `pixelvalve-1` scanning an `[fbcon]`-allocated framebuffer, format `RG16` (RGB565) `modifier=0x0` `size=800x480`;
  `/sys/kernel/debug/dri/0/clients` lists no master [sourced: device]. (The 16 bpp is what fbcon has at the moment; it is
  the other agent's session or the default console, not a statement about display-fbdev.)
- fbdev is the kernel's emulation: it is a DRM client whose buffer sits on the primary plane; it exposes only that
  plane and no overlay, no alpha, no scaling, no YUV, no flip event (only pan/vsync ioctls) [inference from the
  fbdev API and the debugfs above; the kernel doc fetched did not discuss fbdev].
- Can a process still get an overlay while "being" an fbdev program? DRM master is one per device and can be taken
  with `SET_MASTER` or implicitly by opening the primary node; a master can share a subset of resources through DRM
  leases (objects not controlled "cannot be modified"; connectors "always report disconnected") [sourced:
  https://docs.kernel.org/gpu/drm-uapi.html]. `DRM_CLIENT_CAP_UNIVERSAL_PLANES` exposes primary, overlay and cursor
  planes; `DRM_CLIENT_CAP_ATOMIC` implies it, always supported on the Pi [sourced: same page]. The device shows no current
  master, so a Zinc process that opens `/dev/dri/card0` can become master, enable atomic, and drive the overlay
  planes itself without X/Wayland running [inference; exactly what `display-gl` does with SetCrtc].
- Practical consequence [inference]: do not try to mix `mmap(/dev/fb0)` writes with KMS plane ownership. Better: a
  KMS display that allocates its own dumb buffers (the software rasterizer writes into a mapped dumb buffer exactly like
  it writes into fb0 today) and does page flips; then `fb0` is unnecessary. Mixing would race with fbcon and with
  `drm_fb_helper` restore on master changes.

## 3. How the reference players do it

| Player | What it does | Source |
|---|---|---|
| mpv `--vo=gpu --hwdec=drm` | `drm` needs `--vo=gpu`/`gpu-next`; `drm-copy` copies back to RAM, "often less efficient than the direct modes" and "may not help too much over software decoding if you are short on CPU resources" | mpv `DOCS/man/options.rst` [sourced] |
| mpv `drmprime-overlay` interop | puts the DRM PRIME frame on a dedicated overlay plane (`FB_ID, CRTC_ID, SRC_*, CRTC_*, ZPOS`), 16.16 source crop, destination aligned to 2, three frame slots as triple buffering, falls back to legacy `drmModeSetPlane` without atomic, disables the plane with its own atomic request | `hwdec_drmprime_overlay.c` [sourced] |
| mpv `--vo=drm` | `--drm-draw-plane` (OSD/GL), `--drm-drmprime-video-plane` default overlay; `--drm-format` default xrgb8888 | `DOCS/man/vo.rst` [sourced] |
| Kodi (GBM/DRM) | `RendererDRMPRIME` accepts a frame only when `FindVideoAndGuiPlane(format, modifier, w, h)` finds a video plane + GUI plane pair; the video goes straight to the plane "bypasses GL video rendering entirely"; else Kodi falls back to another renderer (GL/CPU); acquires and releases buffers, warns on unreleased ones | Kodi `RendererDRMPRIME.cpp` [sourced] |
| ffplay / ffmpeg `-f vout_drm` | the Pi build has `--enable-vout-drm` and a `vout_drm` device | device `ffmpeg -devices/-muxers` [sourced]; behaviour not read |
| VLC 3.0.23 (Pi build) | has `libdrm_vout_plugin.so`, `libgles2_plugin.so`, `libwl_dmabuf_plugin.so` | device plugin dir [sourced]; behaviour not read |
| GStreamer | `v4l2h264dec` + `kmssink`/`glimagesink` installed | device [sourced]; no Pi 3 numbers found |
| flutter-pi | its README: "Gstreamer video player ... works with the official `video_player` package", needs KMS/DRI, reports 50-60 fps on Pi 4 / Pi 3 A+ for Flutter UI. It says nothing about planes in the README; I believe it composes Flutter layers on KMS planes and gets video frames as GL textures (EGLImage) | https://github.com/ardera/flutter-pi [sourced for README; the planes/EGLImage claim is **inference, not verified**; the source file I tried returned 404] |
| Chromium on Pi OS, Qt eglfs_kms QtMultimedia, LibreELEC notes | not fetched | **not verified** |

Pitfall seen in the wild [sourced: search snippets]: on a non-Pi board "Using hardware decoding (drm)" with black/frozen
frames (Armbian forum); on a Pi 4 the mpv + Mesa v3d combination needs patched FFmpeg/mpv for SAND128 modifiers
(https://gitlab.freedesktop.org/mesa/mesa/-/issues/7944). Neither applies directly to a Pi 3 (which outputs linear
NV12/YU12), but they show the failure mode: modifier/format mismatch between decoder and plane.

## 4. Subtitles, rounded corners, overlays and transforms

- **Hole punching** [inference, standard practice; the mpv and Kodi code above are the two examples seen]: video on a
  low plane; UI on an ARGB plane above, transparent where video must show, opaque elsewhere. Subtitles and controls are
  just UI pixels in that plane. Rounded corners of the video rectangle are made by the UI plane painting the four corners
  opaque (the hole has rounded corners). With `pixel blend mode = Pre-multiplied` the software raster must write
  premultiplied RGBA.
- What the HVS cannot do: rotate by 90/270 (only 0/180/reflect), non-rectangular clipping on its own, per-pixel
  masks other than the alpha plane, blur/filters, colour grading other than encoding/range [sourced: property list
  above]. A video drawn through a transformed IMAGE command (rotated, perspective, clipped to an arbitrary path,
  blended with an animated opacity not equal to a plane alpha) must fall back: GPU texture (2b) when `display-gl`
  is active, else the present CPU copy [inference]. Plane `alpha` property gives uniform opacity for free
  [sourced].
- Kodi does exactly this selection: direct plane when planes fit, else another renderer [sourced: Kodi file]; mpv's
  drmprime-overlay has no fallback inside itself, the user picks another hwdec [sourced: mpv doc text].
- Several simultaneous videos: one plane each, up to 16 overlays, but the HVS and memory bandwidth limit; the Pi 3
  decoder is also shared (the VPU does 1080p30 total, not per stream) [inference]. Unmeasured.
- Z-order against the Zinc scene: a video drawn under other UI is easy (that UI goes in the alpha plane); a video drawn
  *over* UI that then has UI *over it* again (video sandwiched) needs three layers: UI-under on the primary,
  video overlay, UI-over on a second ARGB overlay. Possible (two software buffers) but doubles the UI blits
  [inference].

## 5. The other targets (one paragraph each)

- **macOS**: VideoToolbox decodes to `CVPixelBuffer`s backed by `IOSurface`; with FFmpeg `AV_PIX_FMT_VIDEOTOOLBOX`
  frames carry a `CVPixelBufferRef`. Zero-copy to OpenGL goes through `CGLTexImageIOSurface2D` onto a
  `GL_TEXTURE_RECTANGLE` (NV12 as two planes) or to Metal through `CVMetalTextureCache`. The zinc plugin today calls
  `av_hwframe_transfer_data` to NV12 and swscales [sourced: video.md "Hardware frames are copied back"]. The rest is
  [inference, API names from memory, not fetched].
- **Linux desktop**: VA-API decode (`AV_PIX_FMT_VAAPI`), export with `vaExportSurfaceHandle`/FFmpeg's DRM PRIME mapping
  (`av_hwframe_map` to `AV_PIX_FMT_DRM_PRIME`), import as `EGLImage` (`EGL_EXT_image_dma_buf_import`), or hand the
  dmabuf to a Wayland `wl_subsurface` through `zwp_linux_dmabuf_v1` (compositor puts it on a plane) [inference].
  `video.md` says VAAPI/NVDEC are not wired [sourced].
- **Raspberry Pi 4/5**: Pi 4 has an H.264 stateful decoder (bcm2835-codec like the Pi 3) and an HEVC stateless
  decoder (`rpivid`, driven through the `v4l2request`/`hevc_v4l2request` FFmpeg patches); Pi 5 has HEVC only. The HVS
  is a newer generation (HVS5, `vc4_is_vc5`) with 10-bit and P030 formats and SAND modifiers
  [sourced: vc4_plane.c format/modifier lists; "hevc_v4l2_request comes from Kwiboo's patch set... requires RPi kernel
  6.18 for other applications than Kodi" per search snippets of the Gentoo `ffmpeg-soc-8.1.patch` / mpv 0.41
  `v4l2request` patch]. Mesa `v3d` supports SAND128 for NV12 in EGL import [sourced: Mesa issue 7944]. The Pi 3 design
  therefore carries over if the plane code takes the format/modifier from the `AVDRMFrameDescriptor`.
- **Windows**: D3D11VA (`AV_PIX_FMT_D3D11`), decoded textures are `ID3D11Texture2D` array slices; share with D3D11/D3D12
  rendering, with OpenGL via `WGL_NV_DX_interop2`, or present through DXGI/DirectComposition `IDXGIDecodeSwapChain` for
  overlay scan-out [inference, not fetched].
- **Android / iOS**: Android `MediaCodec` -> `Surface`/`SurfaceTexture` (`GL_TEXTURE_EXTERNAL_OES`, `updateTexImage`,
  `getTransformMatrix`) or `ASurfaceControl` / `AHardwareBuffer`; iOS `AVPlayerItemVideoOutput` / `VTDecompressionSession`
  into `CVPixelBuffer` + `CVOpenGLESTextureCache` / `CVMetalTextureCache`, or `AVPlayerLayer` as a system layer [inference, not fetched].
- **Stays a CPU path**: ESP32 (no decoder; MJPEG from flash is a different small plugin), PS1/PS2, wasm (use the browser
  `<video>`), `sim` [sourced: docs/plugins/video.md support matrix].

## 6. What the device says (read 2026-10-12, read-only)

- Pi 3 Model B Plus Rev 1.3, kernel `6.12.75+rpt-rpi-v8` aarch64, Debian 13 trixie. `config.txt`: `dtoverlay=vc4-kms-v3d`,
  `max_framebuffers=2`, `display_auto_detect=1`. `arm_64bit=1`, core clock 400 MHz when idle.
- Connectors: `DSI-1` connected, `800x480`; `HDMI-A-1` disconnected; `Writeback-1`. `/dev/dri/card0`, `renderD128`.
- Tools present: `v4l2-ctl`, `ffmpeg 7.1.3...+rpt1` (config above), `vlc`. Absent: `modetest`, `drm_info`, `mpv`, `gst-launch-1.0`,
  `kmscube`. Libraries: `libdrm2 2.4.131~bpo13+1+rpt2` (+dev), Mesa `25.0.7-2+rpt4` (`libgbm`, `libegl-mesa0`, `libgles2-mesa-dev`).
- V4L2 decoder facts in section 1.1. FFmpeg `h264_v4l2m2m` pixel formats `drm_prime nv12 yuv420p`.
- DRM debugfs (`/sys/kernel/debug/dri/0/state`, readable without sudo): 56 plane entries, overlays with `normalized-zpos`
  1, 2, 3, ... 0xf; the active scan-out is the `fbcon` RG16 framebuffer on `plane-2`; `clients` shows no DRM master.
  Plane format lists are not in that file, so the exact formats the live kernel offers per plane remain **unread**
  (I rely on the v6.12 source, which matches the running kernel's minor version).
- CMA 256 MB, `CmaFree` 20 MB when read (other work was running).
- `display-gl`'s `kms.cpp` (local) uses `drmModeAddFB`, `drmModeSetCrtc`, `drmModePageFlip` only [sourced].

## 7. A zero-copy video path for Zinc

Existing pieces: the `zinc:video` decode thread (ring of buffers, player clock, dyn image id that never changes);
the IMAGE command in `runtime/gfx.cpp`; `display-fbdev` (software bands, fb0); `display-gl` (`kms.cpp` for DRM+GBM+EGL,
software UI as an overlay texture, `zgl_layers`).

### Design A (best gain per effort on the Pi 3): `display-kms`, video on an HVS plane, UI in an alpha plane

What it is. A display driver that owns KMS (atomic, universal planes), allocates dumb buffers, and has the software
rasterizer write into them (the same way it writes fb0 today; four threads, bands). UI goes on an ARGB8888 overlay
plane (top) or an XRGB primary when no video is live. A video player created with a "hardware" flag decodes to
DRM PRIME (`get_format` -> `AV_PIX_FMT_DRM_PRIME`), keeps the frame referenced, and gives the driver the
`AVDRMFrameDescriptor` instead of CPU pixels. The driver imports it (`drmPrimeFDToHandle`, `AddFB2`), places it on a
video plane under the UI with `SRC_*` crop and `CRTC_*` destination, BT.601/709 and range from the frame's colour
metadata, and commits UI + video in one atomic request per presented frame, paced by the page-flip event.

What the engine needs.
1. **A "hardware image" kind in the command list**: IMAGE with a `video`/`hw` source (the dyn image id stays, plus a flag
   or a new HWIMAGE command with dest rect, src rect, opacity, z-slot). The software rasterizer *clears alpha to 0*
   in that rectangle (the hole) instead of copying pixels, and records the rectangle for the driver. A driver without
   planes (fbdev, sim, wasm, GL) falls back to today's path: the player provides CPU pixels on demand
   (so `dyn_view` still works) [design inference, matches video.md "GPU compositors read the pixels with `raster::dyn_view`"].
2. **Premultiplied-alpha output from the software UI** for the overlay (today it writes 0x00RRGGBB and display-gl keys
   a colour). Only the screen buffer needs alpha; goldens (`zinc test --pixels`) must not change, so alpha is a
   driver-side surface option, not a change of the reference [inference].
3. **Plane/format negotiation** at startup (read plane `type`, `zpos`, `IN_FORMATS`), choose primary + 1-2 overlays.
4. **Reference lifetime**: the driver releases a frame only after a later commit replaced it (three slots as mpv).
5. A decision to retire `fb0` for this target (section 2c).

Cannot do: rotation of the video other than 0/180/flip, rounded clips except as UI-drawn opaque corners over the
video, video under a transformed/animated-opacity parent, more than a couple of videos at once, screenshots through
`ZINC_SHOT` (video planes are not in the CPU frame; the driver must say so or composite a CPU fallback for the shot).

Risks. The Pi 3's HVS bandwidth with an ARGB 800x480 overlay + scaled NV12 at once is unmeasured; CMA pressure
(256 MB, 20 capture buffers by default); desktop use without a free DRM master (X/Wayland running) means this driver
only works from a console, exactly like `display-gl` today [sourced: display-gl.md "run from a console"]; a modifier
mismatch on Pi 4/5 (SAND) needs the descriptor-driven format check.

Proof on the device (when the screen is free): run `hero`'s Video tab on the new driver and log (1) CPU time of the
process (`resmon`), (2) frames shown vs dropped at 24 fps over 60 s (`frames`/`dropped` getters exist), (3) the UI
frame time with the video playing, to compare with the 30 ms / 11 pictures per second baseline in raspberry-pi.md.
Expected, as a hypothesis not a result: the 30 ms raster of the picture and the swscale both disappear; whatever is
left is the decode and the UI.

### Design B (cheapest, no KMS work): remove the avoidable CPU copies on the current fbdev path

Keep `display-fbdev`. In `video.host.cpp`: make sure the decode size equals the drawn size so the IMAGE is a row copy
(video.md already says this: "a 1:1 `drawImage` is a row copy"), and test whether the decoder or the
`bcm2835-codec-isp` node (`/dev/video12`, the VPU scaler/converter) can output BGR4 at the target size so swscale is
skipped. Reading a CMA capture buffer from the CPU may be slow if it is mapped uncached [inference]; measure
before building. This is a mitigation, not zero-copy; it also keeps the software 4-thread raster in the loop, which is
the 30 ms in the baseline unless the draw is an unscaled copy. Gain unknown; effort small; no engine change.
Proof: time `sws_scale` vs `memcpy` of the mapped capture buffer with `ZINC_VIDEO_LOG=1`, and `drawImage` at 1:1 vs scaled.

### Design C (for what planes cannot do): EGLImage external texture in `display-gl`

On the GL display, import the DRM PRIME frame as an EGLImage and sample it in a dedicated video shader; the existing
`zgl_layers` is the hook ("GPU layers under or over the overlay"). Needs: EGL dmabuf import extensions confirmed on
vc4 (unverified), a video program separate from the UI programs (D111: one program per mode), the player keeping a
reference while the GPU may read the frame (fence or one frame of delay). Handles rotation, rounded clips,
opacity and several videos; costs GPU time on VideoCore IV (unmeasured) and loses the HVS's free scaling and conversion.
Proof: `eglinfo`-style query of `eglQueryDmaBufFormatsEXT` on the Pi (not available now), then the same Video-tab
metrics as above. Recommended as the fallback for Design A, not as the first path.

### Ranking for the Pi 3

1. **B first as a 1-day measurement** (it tells how much of the 30 ms is the picture draw versus conversion; no risk).
2. **A as the real answer**: biggest gain (removes raster and conversion cost of the picture entirely), highest
   effort (new driver, alpha output, command kind).
3. **C** as the fallback for transforms, mainly valuable on desktop GL and Pi 4/5.

## 8. Not verified / not fetched

- Upstream FFmpeg n7.1 DRM PRIME code (fetcher gave truncated or empty summaries); the 2018 ffmpeg-devel patch page
  (Access Denied, only a search snippet).
- The official Pi 3 "1080p30 H.264" statement; GPU/HVS bandwidth limits; any Pi 3 benchmark for plane or
  EGLImage video (none found).
- Whether vc4 Mesa 25.0.7 exposes NV12/YU12 for `EGL_EXT_image_dma_buf_import` (no `eglinfo`; I did not run GL on the device).
- Live plane format lists and `IN_FORMATS` (no `modetest`/`drm_info`; debugfs `state` lacks them).
- Chromium, Qt eglfs_kms, LibreELEC, VLC drm vout, ffplay `vout_drm`, flutter-pi plane usage, GStreamer `kmssink` on Pi 3
  behaviour: not read. mpv `--hwdec=v4l2m2m(-copy)` entries: the fetched options page was truncated.
- All API names in section 5 for non-Pi targets are from memory, not fetched.
- Nothing was started or written on the device; no playback was done, so no latency or throughput number of the
  decoder is in this report.

## 9. What ZN-731 built, and what the device answered (2026-10-12)

Design A was built, inside `display-fbdev` and without owning the mode or the primary plane (numbers:
`raspberry-pi.md`, "The film without a CPU copy"; how: `docs/plugins/display-fbdev.md`, "Hardware layers").
The items above that were inference or not verified, as read on the Pi 3B+:

- **1.3, the DRM PRIME request**: a `get_format` callback that returns `AV_PIX_FMT_DRM_PRIME` is all `h264_v4l2m2m` of
  this FFmpeg (7.1.3 rpt1) needs: no hardware device context. The frame is one dmabuf (622 080 bytes for 854x480), one
  layer, DRM format `YU12`, pitches 864/432/432, offsets 0 / 414 720 / 518 400, modifier 0. The decoder says limited
  range for a full-range stream, as it does for its frames in memory: the plane's `COLOR_RANGE` is set from the stream.
- **1.3 (5), lifetime**: a KMS framebuffer made from the dmabuf holds the memory, so the GEM handle is closed right
  after `ADDFB2`; the player keeps the `AVFrame` of the picture on screen and of the two before it, so that the decoder
  does not write into a buffer the display still scans. No "unreleased buffer" warning, no stall over 2076 pictures.
- **2a, the live plane list**: plane 74 is the primary (the console's `RG16` framebuffer), planes 98 to 263 are 16
  overlays (zpos 1 to 16) and 648 the cursor; every one lists `YU12`, `NV12` and `AR24` among 34 formats. Properties of
  an overlay: `alpha`, `pixel blend mode` (0, premultiplied, by default), `rotation`, `zpos`, `COLOR_ENCODING` (default 1,
  BT.709), `COLOR_RANGE` (default 0, limited), `CHROMA_SITING_H/V`, `SCALING_FILTER`.
- **2a, the HVS's limits**: an ARGB8888 800x480 plane over a `YU12` 854x480 plane scaled to 500x281, to 800x450 or
  640x360 to its box, at 24 and 30 pictures a second with a commit per frame: no commit refused, no late flip. The
  ceiling is still unknown; the driver tries each new placement with a test commit and draws in software what is refused.
- **2c, the framebuffer and KMS**: a process that opens `/dev/dri/card0` while a program writes `/dev/fb0` becomes the
  master and can use the overlay planes; the primary plane goes on showing the console's buffer underneath. Closing the
  file removes the planes and their framebuffers, with nothing to restore. `FBIO_WAITFORVSYNC` returns at once on this
  screen (the emulation waits for its first CRTC; the DSI panel is on the third).
- **4, what is drawn over the video**: no alpha channel was added to the rasterizer. A hole is a marker value; rows
  where something is drawn over a picture are rendered twice, over black and over white holes, and the difference is
  the pixel's transparency. Text, translucent boxes and rounded clips come out as the rasterizer blends them.
- **Still not verified**: `EGL_EXT_image_dma_buf_import` formats on vc4 (design C was not needed), a Pi 4 or 5 (SAND
  formats, HEVC), several videos at once, 1080p, what the picture looks like beside the software path (nobody was at
  the screen with a reference).

`tools/kmsvid.cpp` is the spike: it plays a file on a plane with FFmpeg and libdrm alone, measures it, and
`--planes` lists the planes of the screen (the board has no `modetest`).

## 10. FFmpeg's decoder or Sidecar's, on the Pi 3B+ (2026-10-29)

The question (owner): plugins/video decodes with FFmpeg's `h264_v4l2m2m`, Sidecar with its own `plugins/display-fbdev/v4l2dec.h`;
should one replace the other, or GStreamer both? Both drive the same chip through the same kernel driver (`bcm2835-codec`,
`/dev/video10`), so only what is around it can differ. `tools/h264dec-bench.cpp` decodes one file each way, as fast as the decoder goes,
each picture given back at once and never read by the CPU (as a plane shows it); a process each; two runs each, the same in both.
Board at 49 to 58 C, `get_throttled` 0xd0000 (the old supply), gpu_freq 300; x264 High with B-frames, 20 s 1080p30 and 10 s 1080p60.

| way | pictures a second | CPU a picture | max RSS |
| --- | --- | --- | --- |
| FFmpeg, `h264_v4l2m2m` to DRM PRIME (plugins/video) | 56 (30p), 55 (60p) | 1.21 to 1.35 ms | 20 to 22 MB |
| FFmpeg's demuxer + `v4l2dec.h` (Sidecar's) | 54 to 55 | 1.24 to 1.38 ms | 20 to 22 MB |
| libavcodec's `h264` in software, 4 cores | 41.5 (30p, an easy test pattern) | 81.5 ms | 70 MB |

**Decision: nothing is merged.** The hardware decode costs the same either way, about 4% of one core at 30 pictures a second, and FFmpeg
is a little faster at full speed (it drains the decoder at the end; `v4l2dec.h` sends no end of stream and refused one unit of the 60p
film after its 100 ms wait, which a live stream paced at the screen's rate never meets). So each keeps its job: FFmpeg for files (every
container, audio, the software way for VP9 and AV1 that the Pi 3 has no chip for), `v4l2dec.h` for Sidecar's live stream (no libavcodec
in the display driver, the decoder's buffers and delay in its hands). `hwdecode` stays the one option: a `decoder` choice between two
ways that cost the same would be a knob for nothing. Software 1080p is 20 times the CPU and 3.5 times the memory: never the default
where a chip is. GStreamer (`v4l2h264dec`) drives the same driver with GLib on top; its case is HEVC on a Pi 4 or 5 (the stateless
`v4l2slh265dec` is upstream, FFmpeg needs the Raspberry Pi fork for it), to measure there.
