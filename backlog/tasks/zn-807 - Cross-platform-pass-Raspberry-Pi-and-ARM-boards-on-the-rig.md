---
id: ZN-807
title: 'Cross-platform pass: Raspberry Pi and ARM boards on the rig'
status: Backlog
assignee: []
created_date: '2026-10-24 23:55'
labels:
  - size-L
  - cross
milestone: m-25
dependencies: []
ordinal: 54200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-789: On a real Pi, install a newly signed engine/player/system update after the one-time updater-helper bootstrap; verify official 800×480 and HDMI 1920×1080 pixel-for-pixel output, USB keyboard AZERTY/dead keys and mouse/cursor hotplug, exclusive dev handoff, rollback and interrupted recovery, plus unique first-boot names across two flashes with reboot/explicit-Imager-name persistence. Native Mac fixtures do not prove KMS planes, real libxkbcommon or board boot.
- ZN-787: Build/install glass-icon-reveal on Android and run on a physical Android and Pi with the GL display; verify GPU compilation, spectral corners, touch/keyboard, rotation, idle and device performance (Mac captures do not prove GLES drivers or hardware).
- ZN-785: dispatch the dedicated Pi image workflow against a newly published signed ARM64 engine, flash the artifact with Etcher/Imager, apply a saved profile and verify physical first boot/login/network/display. Image checks are userspace/content checks, not physical boot proof.
- ZN-784: flash a newly built Pi image and verify SSH with a profile login after Raspberry Pi OS account rename; inject a cloud-init failure and confirm settings/initramfs survive, then retry successfully. Mac tests execute the cloud-config writer and cleanup policy against temporary files.
- ZN-783: on the Pi 3 B+ native 800×480 and rotated portrait, check Music Tree touch/scroll, screen resize/rotation, long real metadata and authenticated Spotify content; measure frame time against the previous layout. Native headless fixtures prove geometry/input only.
- ZN-782: on the Pi 3 B+, prove DRM/VT/input handoff between player, boot app, deploy and live dev; upgrade the existing updater helper, install a signed engine/system payload, and verify first-frame rollback plus recovery across a real power cut. Measure first/warm plugin preparation, source transfer and interpreted versus native frame time; Mac tests use fixtures only.
- ZN-777: rebuild the Pi image, verify a clean first boot/network availability and the new network-service restart button on the real Pi 3 B+, then test signed engine upgrade/downgrade, fbdev first-frame rollback and power loss during activation. Mac tests cover the bundle/UI and transaction logic; they do not prove sudo/systemd/DRM or the existing first-boot issue.
- Linux cross builds: a Pi Zero or Pi 1 (ARMv6) with the armhf archive: start time, `zinc run --interp` on a UI program, memory (512 MB), and whether ARMv6 is fast enough for `zinc run` or only for programs built with `zinc build --target armhf-linux`; only emulated so far (qemu `-cpu arm1176` on Raspbian Buster).
- ZN-734: on the Pi (spark), the command in the task notes: a sketch without a size must print `fbdev: /dev/fb0 800x480 16 bpp, surface 800x480 at 0,0 size 800x480`; and the same under ZINC_DISPLAY=gl on a KMS screen. ZN-736: the project card on Linux (its `Window, linux` label, xdg-open) with its own golden.
- ZN-731: on the Pi 3B+ with someone at the screen: colours beside the software path, the edge of the hole, a card dragged and zoomed with its film playing, two films at once, a 1080p clip, an hour of play, a minute of museum-table's film in one go.
- ZN-731: hardware layers on a Pi 4 and 5 (SAND formats with modifiers, HEVC through v4l2request): never run there; `tools/kmsvid.cpp --planes` lists what the planes take. Linux desktop: VA-API surfaces exported as dmabufs into the same `HalPicture`, a subsurface under a compositor. Windows, Android and iOS behind `HalDisplay.layers`.
- ZN-731: display-fbdev's pacing where the vsync wait really waits (HDMI on a Pi) and on SPI panels; its rpi1 build with and without the kernel's DRM headers.
- ZN-730: museum-table's film on the real `/dev/fb0` of the Pi 3B+ (off screen so far) and at a fixed 1400 MHz clock; the ISP (`/dev/video12`) handing the picture in BGRX at the drawn size (ZN-731).- ZN-729: `zinc agent` on Linux (x86_64 and a Raspberry Pi): `tests/t0/agent.sh` and `tests/t1/agent_apps.sh` there (forkpty with libutil, /proc figures, the temperature, a GUI app started from the agent under systemd), and a pairing between two machines over Wi-Fi with discovery through a real network.
- ZN-729.05: `tests/t1/agent_inspect.sh` on Linux and a Pi: `top`'s CPU and memory come from /proc there, the temperature from thermal_zone0 (written, never run).
- ZN-729.04: `zinc agent install` on a Linux board: the unit loads, the agent is back after a reboot with nobody logged in, apps survive `systemctl --user restart zinc-agent`, and mDNS announces when the agent starts before the network is up (`announce` returns at once without multicast).
- ZN-729.04: measure the 5 s trial of an update on a Pi 3 with a large `.zapp`: unpacking may outlast it, so the update would hold before its program starts.
- ZN-729.03: `zinc dev --device` and `zinc device deploy` pack for the workstation's target; pack for the device's (its asset packs, its plugins cross-built from what `info` says), or a Mac cannot drive a Pi app that has plugins.
- ZN-729.03: `zinc dev --device` on a real second machine over Wi-Fi: save-to-running time with megabytes of program and assets.
- ZN-729.06: Atelier's devices panel on a real device and in a real window (discovery by mDNS and pairing by name are not in the committed test).
- ZN-729.08: deploy to `rpi2`, `rpi1`, `linux` and `x86_64-linux` devices on real machines (mapped, never built); `tests/t1/agent_deploy.sh` runs on macOS only.
- ZN-729.07: `zinc agent install` (systemd user unit, linger) never run on the Pi; time one clean `tools/linux-build`.
- ZN-735: the flip on a Pi 4 or 5, at 24 and 32 bpp, and on the CHIP.
- ZN-737: hero's gallery scrolled to its end on the Pi 3B+ with a finger (the owner's check after the fix).
- ZN-737: the whole T1 of 2026-10-12 (377 pass, 25 fail) left failures to sort, none looked at: `fuse` (a fused app prints the step lines and gets `run <program> --` in its arguments), `native_gen`, `plugin_manifest`, `zinc_gl_api` (`getSupportedProfiles`), `first_run` (`net.serve: cannot listen`), `image_rect_wasm`, `install_nocompiler`, `launch_time` (two weak definitions), `museum_assets` (670 MB example), `profile` (psp), `proto_devtools` (tsc errors at `lib/std/ui.ts:3431`), `example_output` (chataigne), `museum_editor_views`, `pinball3d_editor`; `nuxt_ui`, `rn_tester` and `museum_details` fail the same with the sources of `9e2b64ae`, so not from the scroll fix.
- ZN-726: museum-table's zoom on the Pi 3 (GLES 2): frame time at the ladder steps, sharpness; on a target without TrueType files a scaled text takes the nearest baked size.
- ZN-725: a rounded CLIP on GLES 2 that does not read the framebuffer: the corner copy (`glCopyTexSubImage2D`) ends the driver's job, 26 of gallery's 39 stalls in 60 frames (gallery 22.8 ms against 13.8 for display-gl's cpu renderer).
- ZN-725: then an hour of Kit and Forms on the GL renderer under `timeout -s KILL` with the GPU reset counter (the 2026-09-29 hang), and display-gl's default renderer "auto" outside macOS.
- ZN-725: geometry kept across frames for maps (MESH, phase 4 of gpu-renderer-design.md): 22 ms of GPU work a frame on hero's map, and the city reprojected on the CPU at every frame.
- ZN-725: fringe strips as 3 indexed vertices per point instead of 8 per edge (the three fringe passes are 6 of navigation's 25 ms); translucent strokes as strips blended once (they keep the capsule shader).
- ZN-725: two glyph atlases used in turn, so an upload never waits for the previous frame (11 ms on a frame with new glyphs).
- ZN-725: stray background-coloured pixels inside some POLY fills of the map on VideoCore IV, also before the task.
- ZN-725: the GLES 2 path on v3d (Pi 4 and 5) and on Mali; the bands on the real `/dev/fb0` at 1400 MHz and with a heatsink; the program classes re-measured at 1400 MHz (they were compared at 600 MHz under a stray load).
- ZN-725: hero's map as a GPU layer under a software UI overlay (display-gl `cpu` renderer with its bands on four threads, `zgl_layers`), the mix the owner asked about on 2026-10-12: the UI is cheapest in software on this GPU, moving geometry on the GPU.
- ZN-334: display-gl defaults to `renderer: "cpu"`, which rasterizes on one core and uploads a texture: on a Pi it is slower than display-fbdev's bands (142 against 43 ms). Run its software path through render_bands.h, or make the default follow a measured choice per target.
- ZN-334: hero and museum-table name no Linux display that suits every board (hero: fbdev; museum-table: none, exported with ZINC_DISPLAY). Decide the default driver of the `linux`/`rpi` targets once the two above are measured at full clock.
- ZN-581: the sprite path on a Pi 3 (GLES 2) and on Linux GL, frames against the software ones.
- ZN-435: check the asset defaults of targets/capabilities.json on the devices (the rmpp, ps1 and ps2 values are estimates; the Pi and ESP32 budgets).
- ZN-446: measure exec to splash on Linux desktop (X11, Wayland) and the Pi 3 (KMSDRM) with `tools/splash-time --runs 11`, record them in the task (AC #1, task in Review).
- ZN-439: tests/t1/texture.sh on a Pi 3 (vc4, display-gl on KMS): ETC1 of the rpi1 packs uploaded as blocks within 2% / mae 3 of the RGBA path, and webgl_ext.js offering WEBGL_compressed_texture_etc1 (task in Review).
- ZN-718: display-gl: verify the ZINC_SHOT offscreen target on KMS (Pi) and webOS, GLES 2: screenshots are now surface-sized and unplaced, and the window is not refreshed during the run.
- ZN-744: rn-showcase fling on a Pi 3 (display-gl overlay and fbdev do not take HalFrame.move yet) and on the HP TouchPad, frame times before and after.
- ZN-746: the GPU layer under the CPU frame for the Pi's KMS/EGL and webOS windows (display-gl's overlay), and the lava face on a Pi 3 and the TouchPad.
- ZN-741: the damage-aware GLES 2 replay on the Pi 3 (ZINC_GL_DMG, the GPU-reset suspect) and the TouchPad.
- ZN-718: rn-showcase Camera screen: wire the real cameras (camera.macos.ts and camera.linux.ts, one line each: `export { devices, requestPermission, Camera, CameraDevice } from 'zinc:camera';`): tried, the screen then names 'Zinc Fake Camera' and the scripted `photo at frame 30` step does not happen (the plugin's frames come from a timer, not from the frame count): make the session test frame-driven for the plugin, re-record camera hashes, then add the files.
- ZN-741: ZINC_GL_INFO on the Pi 3 (KMS) and the TouchPad (webOS): check the family and the tuning row; move webOS's ZINC_GL_DIRECT=1 and ZINC_GL_CORNERS=0 into the Adreno 2xx row, measured there first.
- ZN-744: the GPU scroll on the Pi 3 (display-gl does not call glr::scroll yet) and the TouchPad.
- ZN-745: zinc build --target armv7-webos and --target aarch64-linux pick x.webos.ts / x.linux.ts (ZINC_PLATFORM from the target): implemented, not run.
- pi-image: on a real Pi 3 B+, what stops the first boot before multi-user.target (2026-10-23: cloud-final and zinc-firstboot ran only on the second boot; QEMU's first boot passes): flash `dist/zinc-pios-debug.img.xz`, read `zinc-report-previous.txt` on the boot partition after the reboot, and the player's bottom line while it starts.
- pi-image: the screen handover to a program of `zinc dev --device` on vc4 (the player killed, /dev/fb0 showing the program's frame): proven on QEMU without KMS planes only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pi 3B+ session: image first boot, signed update with rollback, dev --device handoff, agent install as a service
- [ ] #2 GLES 2 renderer: frame times, stalls, hero map and museum film on Pi 3 (and Pi 4/5 if available)
- [ ] #3 Pi 1/Zero armhf start time and memory; fbdev pacing; splash timing
- [ ] #4 Results in docs/reports/raspberry-pi.md and zinc-next-perf.md
<!-- AC:END -->
