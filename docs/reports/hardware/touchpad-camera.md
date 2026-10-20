# HP TouchPad front camera: how to reach it from Zinc (webOS 3.0.0)

Status: desk research, nothing run on the device yet. Web sources for this device are very thin (the camera was never documented for the PDK). Every item is marked **[confirmed]** (cited), **[recall]** (from memory of the Qualcomm/Android tree, not re-verified) or **[?]** (unknown, the test plan below decides).

## Recommendation

1. **Try plain V4L2 on `/dev/video0` first**, from a tiny cross-compiled C probe, then from a `zinc:camera` plugin (`VIDIOC_QUERYCAP/ENUM_FMT/S_FMT/REQBUFS/QBUF/STREAMON`, mmap or userptr). It is the smallest path, needs no webOS service, and the jail already creates the node and puts the app user in `video`.
2. If `msm_v4l2` only works with pmem/ion-backed buffers or refuses plain mmap (a real risk, see "Driver"), fall back to **GStreamer from the device's own libs** (`dlopen` libgstreamer-0.10; the webOS camera app and Skype video use GStreamer 0.10 with Palm's camera source element, element name **[?]**, list with `gst-inspect`), reading frames from an `appsink`/`fakesink` handoff. No Luna service call is known to hand out frames (`palm://com.palm.camera` is **[?]**, the webOS 3 camera app is a native/Enyo app on the media server stack; no public API exists for PDK).
3. Do not go through `/dev/msm_camera/*` directly (the Android `liboemcamera` route): it needs the proprietary userspace to drive the sensor ISP and is only worth it if 1 and 2 fail.

Format to expect: **YUV422 (UYVY or YUYV), 640x480 at 30 fps (binned preview) and 1280x1024 at 15 fps (full)**, from the sensor driver data below **[confirmed for the sensor driver, [?] for what msm_v4l2 re-exposes: Qualcomm VFEs often convert to NV12/NV21 (YUV420SP) in hardware, which is what the Android HAL used]**. Zinc should accept both families and convert to RGBA/I420 on the CPU (the A9-class Scorpion handles 640x480 @30 easily with NEON-free C at ~2-3 ms).

## What is known

- Sensor: Aptina **MT9M113**, 1.3 MP SoC with on-chip ISP, 1280x1024 array, I2C control, single-lane MIPI CSI-2, 24 MHz clock, 1.8/2.8 V. Two contexts: A 640x480 binned preview at 30 fps, B 1280x1024 capture at 15 fps. Output YUV422 UYVY/YUYV. Controls: flip, effects, exposure, gain, AWB, power line. [confirmed: Herman van Hazendonk's 2026 mainline driver patch, https://lkml.indiana.edu/2606.0/12250.html, "ported from the legacy vendor kernel mt9m113.c"]
- Quirk worth designing around: the sensor MCU **sometimes wedges at stream start**; only a full power cycle recovers it (the mainline driver retries 3 times with power cycles; also needs frame-sync short packets re-asserted or the image drifts). So the Zinc plugin must treat STREAMON failure/no-frame timeout as "close the fd, reopen, retry (3x)". [confirmed on the mainline driver; the 2.6.35 vendor driver probably has the same silicon behaviour, **[?]**]
- Android history: CM7/CM9 had no camera; the front camera came in late 2012 with CM9/CM10 builds (https://liliputing.com/android-for-the-hp-touchpad-gets-working-camera-with-cyanogenmod-9-cm10/, page not readable here: 403; headline only). The HP kernel source is at github `dalingrin/hp-kernel-tenderloin` (branch `hp-topaz-android`) per the CM news coverage; contents not checked **[?]**. Whether the Android port used a proprietary `liboemcamera` or a V4L2-based HAL is **[?]**; for the MSM8660 family the stock Android HAL is `libcamera` over `liboemcamera.so` **[recall]**, which drives `/dev/msm_camera/{config0,control0,frame0}` **[recall]**.
- webOS side: webOS 3.0.4 added the Camera app (photos and video from the front camera) and better Skype video (https://mobilesyrup.com/2011/10/18/hp-touchpad-3-0-4-update-adds-camera-app-increased-performance/). Skype on the TouchPad is closed (SkypeKit-class), no reuse (https://www.webosarchive.org/pivot/2014/08/18/are-we-dreaming-skype-still-works/). webOS used GStreamer 0.10 + ALSA for media **[confirmed generally; camera elements [?]]**. Palm announced camera/mic access for developers (https://liliputing.com/palm-to-offer-webos-developers-access-to-camera-microphone/) but I found no PDK camera call; the PDK offered SDL, GLES, plugin APIs and no camera API **[recall]**.

## Driver: msm_v4l2 (kernel 2.6.35-palm-tenderloin)

- Upstream Qualcomm layout (the same as `drivers/staging/dream/camera` mirrors, https://googlers.googlesource.com/maze/linux/+/v2.6.36-rc6/drivers/staging/dream/camera): `msm_camera.c` exposes `/dev/msm_camera/*` (config/control/frame nodes, ioctl `MSM_CAM_IOCTL_*`, userspace daemon or HAL does the work); `msm_v4l2.c` is a **thin V4L2 shim** that forwards to the same core. [confirmed that the files exist; the thin-shim reading is recall]
- Consequences **[recall/?]**: only a subset of V4L2 ioctls; buffers likely must be pmem/ion-backed (not plain `mmap` from vmalloc), `VIDIOC_QBUF` may carry a physical-buffer handle; the format list may be odd (`V4L2_PIX_FMT_NV12/NV21`, or a private one). The three nodes `/dev/video0`, `/dev/video1`, `/dev/video20` are probably: preview node, second client/snapshot node, and a control/config node **[?]**.
- Permissions: the PDK jail creates `/dev/video0` and the app user is in group `video` (given). `/dev/msm_camera/*`, `/dev/pmem*` / `/dev/ion` are probably **not** in the jail **[?]**; if V4L2 needs them, the root helper (`plugins/webos/helper.sh`, already running as root over upstart) can `chmod`/`mknod` them, or even own the camera and serve frames over a local socket/shared memory (same pattern as the backlight and firewall requests).

## What Zinc has today

- No camera capture anywhere: no `getUserMedia`, no AVFoundation, no V4L2 capture (grep over `lib/`, `plugins/`, `src`). `plugins/video` is playback only (FFmpeg, VideoToolbox, V4L2 M2M decode). `plugins/gphoto2` and `examples/camera/{cli,bench,remote}` are DSLR remote control (libgphoto2, JPEG live view), not webcams. `plugins/audio` ships miniaudio (capture exists for the mic, same shape as what camera needs).
- So a new plugin `zinc:camera` is needed; the W3C surface goes on top.

## Mapping to the W3C Media Capture API

| Web | Zinc (proposal) | Backends |
|---|---|---|
| `navigator.mediaDevices.enumerateDevices()` | `Camera.list(): {id, label, facing}[]` | macOS AVCaptureDevice discovery; Linux/webOS `/dev/video*` with `VIDIOC_QUERYCAP` (skip non-capture nodes); webOS: one front camera |
| `getUserMedia({video:{width,height,frameRate}})` | `Camera.open(id, {width,height,fps})` returns a `MediaStreamTrack`-like object; constraints picked by nearest `ENUM_FMT/ENUM_FRAMESIZES` | permission = no prompt on device (jail), macOS needs `NSCameraUsageDescription` and TCC |
| `MediaStreamTrack` (`stop()`, `getSettings()`, `onended`) | same names; `stop()` closes the fd | |
| `<video>.srcObject` / preview | a runtime image updated per frame (as `plugins/video` does for playback: `Player` -> image), GL texture upload YUV->RGBA in a shader, so GLES2 on the TouchPad never converts on CPU | |
| `ImageCapture.grabFrame()` / `takePhoto()` | `track.grabFrame(): ImageData` (latest frame, RGBA) and `takePhoto()` (switch to the 1280x1024 context, JPEG via stb) | |
| QR use case | `grabFrame()` luma plane directly (Y of YUV is free, feed a vendored QR decoder: quirc/zxing-cpp, not a hand-written one) | |

Desktop path: macOS AVFoundation (`AVCaptureSession` + `AVCaptureVideoDataOutput`, BGRA or 420v; Objective-C++ in the plugin native part), Linux plain V4L2 (shared code with webOS: the webOS backend is the V4L2 backend plus the retry and pixel-format quirks), web target uses the real `getUserMedia`. One C++ frame-source interface with `open/start/next_frame/stop`, three implementations; no abstraction beyond that.

## On-device test plan (root shell over novacom, BusyBox 1.17)

All commands via `novacom run file://bin/sh` or `novacom -t open tty://`. Step order stops at the first success.

```sh
# 1. what exists
ls -l /dev/video* /dev/msm_camera /dev/msm_camera/* /dev/pmem* /dev/ion 2>&1
cat /sys/class/video4linux/video*/name
cat /proc/devices | grep -i -E "video|camera|pmem|ion"
dmesg | grep -i -E "mt9m113|msm_camera|v4l2|vfe|csi" | tail -40
lsmod 2>/dev/null | head
# 2. userland on the device
ls /usr/bin/gst-* /usr/lib/libgst* /usr/lib/gstreamer-0.10 2>&1 | head -50
ls /usr/lib/gstreamer-0.10 | grep -i -E "cam|v4l|palm|msm"
ps | grep -i -E "mediaserver|camera|umedia"
ls /usr/bin | grep -i -E "luna-send|v4l2"
find / -name "*camera*" -not -path "/proc/*" -not -path "/sys/*" 2>/dev/null | head -40
# 3. luna side (Palm services; read-only listing)
luna-send -n 1 palm://com.palm.lunabus/signal/addmatch '{"category":"/","method":"x"}' 2>&1 | head -3
ls /usr/share/dbus-1/services /var/palm/ls2/services/prv /var/palm/ls2/services/pub 2>/dev/null | grep -i -E "cam|media"
# 4. gst if present (frames to a file, no display)
gst-launch -v v4l2src device=/dev/video0 num-buffers=5 ! fakesink 2>&1 | head -30
gst-inspect | grep -i -E "cam|v4l2|palm"
```

Then the probe (cross-compiled with the same zig target as the apps, `arm-linux-gnueabi` glibc 2.8 softfp; pushed with `novacom put`), `camprobe.c`, about 80 lines, root and then as the app user (`su` to the app user from a jailed run is how the helper/launcher will see it):
`open("/dev/video0", O_RDWR)`; `VIDIOC_QUERYCAP` (print driver/card/caps); loop `VIDIOC_ENUM_FMT` and `VIDIOC_ENUM_FRAMESIZES` (print fourcc and sizes); `VIDIOC_S_FMT` 640x480 for each fourcc; `VIDIOC_REQBUFS` with `V4L2_MEMORY_MMAP`, then `USERPTR` if mmap fails; `QBUF`, `STREAMON`, `select()` with 2 s timeout, `DQBUF`; print `bytesused`, first 16 bytes, and write the frame to `/tmp/frame.raw` (view on the Mac with `ffmpeg -f rawvideo -pix_fmt uyvy422 -s 640x480 -i frame.raw out.png`, adjust pix_fmt to the reported fourcc). Run three times in a row to see the stream-start wedge and reopen recovery. Print `errno` for every failure; the first failing ioctl says which path (mmap vs pmem) is needed.

Decision table: QUERYCAP + DQBUF works -> V4L2 plugin (recommendation 1). OPEN fails with EACCES inside the jail but works as root -> extend `helper.sh` (chmod, or helper-served frames). REQBUFS/QBUF fails or frames are zero -> check `gst-inspect` and use GStreamer (recommendation 2). Nothing in `/usr/lib/gstreamer-0.10` for the camera -> reverse `/dev/msm_camera/*` (needs the HP kernel source `dalingrin/hp-kernel-tenderloin` to read the ioctls; cost is high, defer).

## Sources

- MT9M113 mainline driver patch (formats, fps, wedge): https://lkml.indiana.edu/2606.0/12250.html
- TouchPad Android camera history: https://liliputing.com/android-for-the-hp-touchpad-gets-working-camera-with-cyanogenmod-9-cm10/ (not readable, 403)
- webOS 3.0.4 camera app: https://mobilesyrup.com/2011/10/18/hp-touchpad-3-0-4-update-adds-camera-app-increased-performance/
- msm camera/v4l2 kernel files (generic Qualcomm tree): https://googlers.googlesource.com/maze/linux/+/v2.6.36-rc6/drivers/staging/dream/camera
- Skype on webOS closed: https://www.webosarchive.org/pivot/2014/08/18/are-we-dreaming-skype-still-works/

## Measured on the tablet (2026-10-15)

- `/dev/video0`, `/dev/video1`, `/dev/video20` (root:video 660); no `/dev/msm_camera`, no `/dev/ion`; `/dev/pmem_adsp`, `pmem_audio`,
  `pmem_smipool` present.
- GStreamer 0.10 is on the device with `gst-launch` and Palm's elements: `libcamsrc-msm.so` (element `camsrc`), `libpalmgstskype.so`,
  `libpalmvideodecoder.so`. `camsrc` offers NV12 at 160x128, 320x240, 640x480 (30 fps) on `src`, and a still pad `src_still` (640x480 NV12,
  `angle: 90`, `camid: 0`); properties `take-picture`, `camid` (sensor select), `flash-ctrl`, `stabilize-video`, `resume-preview`.
- `gst-launch camsrc ! <caps> ! filesink` does not link (the caps of `src` need more than format/size: not found yet); `camsrc ! fakesink`
  links, then fails: `cam_conf open driver failed: Input/output error`, `qcamera_previewInit: control thread is not responding`. Either the
  sensor is wedged (the known MCU hang: a reboot clears it) or the media server holds the camera. Next: reboot, then the same pipeline;
  then `camprobe.c` (V4L2) as root and as the app user.

## Why camsrc gives no frame (2026-10-15, after the reboot)

- `camsrc` with both pads linked (`c.src ! queue ! fakesink c.src_still ! queue ! fakesink`) reaches PLAYING and stops in
  `camsrc_preview_init: initializing qcamera`: Palm's `libqcameralib.so` opens `/dev/control%d`, `/dev/config%d`, `/dev/frame%d` (the
  msm_camera nodes, which do not exist) and `/dev/video20`, `/dev/msm_rotator`, `/dev/pmem_adsp`, `/dev/gemini0`.
- The nodes are missing because the kernel never found the sensor: at boot `mt9m113_i2c_rxdata Addr:0x3c failed` five times, then
  `msm_camera_mt9m113: probe of msm_camera_mt9m113.0 failed with error -5`. A new probe through sysfs
  (`echo msm_camera_mt9m113.0 > /sys/bus/platform/drivers/msm_camera_mt9m113/bind`) powers the sensor again and fails the same way, with
  the I2C controller's own `qup_i2c qup_i2c.1: I2C slave addr:0x3c not connected`: the sensor does not answer on its bus.
- So the camera is not reachable by any software on this tablet as it is: the MCU hang a full power cycle clears (switch off, not a
  restart, without the USB cable), or the module or its flex cable. Check after a cold start: `dmesg | grep mt9m113` must show no failure
  and `/dev/control0` must exist; only then does the Zinc side (camsrc into an appsink, NV12 to RGBA, getUserMedia) make sense.
- After a new start with the cable out (2026-10-15 11:56): the same five I2C failures at 2.9 s and the probe error -5. The sensor stays
  silent across power cycles: the module or its flex cable, not a state software can clear.
- Checked against the web (2026-10-15): the kernel looks where the mainline driver of Herman van Hazendonk does (i2c-1, 0x3c; sysfs
  `1-0078` is the 8-bit form), with the same rails (`8058_l14` 2.85 V analog, `8058_l15`); that driver documents only the stream-start
  hang (cleared by a power cycle), not a sensor silent at probe. No report of a software fix for a front camera missing at probe on
  webOS 3.0.0 (build Nova-HP-Topaz 41, kernel 2.6.35-palm-tenderloin 129.1.17). Next is the hardware: the camera's connector on the
  motherboard (iFixit "HP TouchPad Camera Replacement", guide 6075). The camera app came only with 3.0.4; the driver is the same.
