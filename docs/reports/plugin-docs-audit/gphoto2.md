# zinc:gphoto2 documentation audit

## What it is
Remote control of DSLR/mirrorless cameras over USB (libgphoto2): detect, change ISO/aperture/etc, take pictures, download them, and show a live view. For makers building tethered shooting, timelapse or photobooth rigs.

## Targets and status
plugin.json: macos, linux, rpi1 (system libgphoto2 + turbojpeg), web (`webusb`). Doc: all "yes" but **no physical camera ever tested**; fake camera tested on macOS, sim, Linux/Pi image under QEMU. Not in the prebuilt archive (ZN-718).

## What the docs have
- [x] overview, [x] example, [x] API table (matches exports), [x] support table, [x] platform notes (ptpcamerad, gvfs, udev), [x] live-view pipeline with measured numbers, [x] fake camera with commands, [x] verified / not done
- [x] runnable examples: `examples/camera/{remote,cli,bench}` each with README; one screenshot `docs/img/camera-remote.png`
- [ ] test named on the page (`tests/t1/camera.sh` mentions gphoto2/examples/camera and `web_hw` covers the web shim; the page names neither)
- [ ] screenshot on the page; [ ] tutorial; [ ] Widget/CameraInfo field reference as types; [ ] web (WebUSB) section

## What is missing (priority)
1. A test line: name the test(s) that prove the fake-camera session (`tests/t1/camera.sh`, which despite its name is the gphoto2 test, and `web_hw`); `tests/affected.json` has no mapping for `plugins/gphoto2/` native files, add one.
2. Embed `docs/img/camera-remote.png` and add the run command `ZINC_FAKE_CAMERA=1 zinc run examples/camera/remote`.
3. Tutorial "Tether your camera": install `brew install libgphoto2 jpeg-turbo`, `killall ptpcamerad`, detect, set ISO, capture, live view, with a settings table of common widget names per brand.
4. Real camera proof (hardware): a Canon and a Nikon session log, live-view fps over USB, RAW download.
5. Document the `Widget` class (fields, how range/toggle/date values are strings) and `CameraInfo`.
6. Document the web target (`needs: webusb`, Chrome only, what works) or state it is untested; backlog has "libgphoto2 on the web" line.
7. Troubleshooting table: "Could not claim the USB device", permission denied on Linux (udev), camera asleep, live view needs `viewfinder=1`/`capturetarget`, Sony PC Remote mode.
8. Supported-camera pointer: how to check `gphoto2 --list-cameras`.

## Wrong or stale
- `ZINC_FAKE_CAMERA` is the same variable name `zinc:camera` reads (camera.md): a program importing both gets both fakes; undocumented clash.
- Doc "Targets" omit the `web` entry in plugin.json.
- "Tested cameras: none" is stated honestly but contradicts the "yes" status words in the support table; reword to "builds, untested on a body".

## Suggested pages
- Gphoto2: overview and quick start
- Gphoto2: tutorial, tethered shooting
- Gphoto2: API reference (generated)
- Gphoto2: settings and widgets by brand
- Gphoto2: live view pipeline and performance
- Gphoto2: platform notes (macOS ptpcamerad, Linux udev/gvfs, Pi)
- Gphoto2: the fake camera and testing
- Gphoto2: examples (remote, cli, bench)
- Gphoto2: troubleshooting
