---
id: ZN-249
title: 'System: Transparent frames, vibrancy and multiple windows'
status: Review
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-11-09 06:33'
labels:
  - system
  - desktop
  - plugins
  - size-L
milestone: m-16
dependencies:
  - ZN-240
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Left: transparent frames and multiple windows on macOS.

From docs/reports/system-integration.md (section 11, SYS-20). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Spike S2 and S8 recorded first; `transparent: true` shows desktop content through cleared areas on macOS and on a compositing Linux session (screenshot with a known wallpaper).
- [ ] #2 `setVibrancy('sidebar')` produces a blurred backdrop (pixel-variance check on the screenshot); multiple windows only if the render roadmap exposes per-window scenes, otherwise this task splits and the second half is parked with the reason.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Key-colour transparent window, app.window.transparentColor and window.setVibrancy work per AppKit readbacks (opaque=NO, NSVisualEffectView). Open: the window screenshot still shows alpha 255 on the key-colour area (test warns); multi-window split not done; spike notes S2/S8 pending.
Review 2026-10-25: kept open. (review-close proposed, corrected by the verifier) Open work remains on the Mac. The notes say spikes S2/S8 are not recorded, and zinc-next-decisions.md has no S2/S8 entry. The window screenshot still shows alpha 255 on the key-colour area (the test warns), so transparency is not proven even on macOS, and the vibrancy pixel-variance check is not done. Evidence: plugins/system window transparentColor and setVibrancy (AppKit readbacks); ZN-663 Done gives several windows
Review 2026-11-07: done-partly. Vibrancy test exists (tests/t1/macos_vibrancy.sh); transparent frames and multiple windows to verify. Evidence: tests/t1/macos_vibrancy.sh

2026-11-09, M1 Pro, macOS 15, notch display.
Spike S2 (transparent window and vibrancy with software frames), recorded: a transparent window turns off the GL and Metal paths (targets/macos/hal_sdl.cpp 614/627) and presents the zinc:gfx frame through an SDL texture; with app.window.transparentColor the present turns the key colour into alpha 0 and every other pixel opaque (hal_sdl.cpp 2247), without it (transparent: true alone) the raster keeps its holes and the texture blends premultiplied. SDL_WINDOW_TRANSPARENT plus hal_sdl_transparent_layers make the NSWindow non-opaque (readback opaque 0). setVibrancy adds an NSVisualEffectView (behindWindow, active, material sidebar/menu/hud) below SDL's view, as the window-vibrancy crate and Electron do. Measured: window capture (screencapture -o -l) of tests/golden/macos/vibrancy: key area alpha 0 (min 0, max 0 over 140x90 units), yellow rectangle opaque; the screen region under the window shows the terminal behind it through the key area (mean luminance 70, detail 6.1, looked at on the capture). Not measured: the cost of the per-pixel key conversion per frame.
Spike S8 (multiple windows), recorded: answered by ZN-663, ZN-864 and ZN-1032 (Done): several windows per program, one zinc:ui tree and one surface per window, messages between windows, a scene window in a worker, closing rules as Electron. Nothing left of the multi-window half here.
Vibrancy blur: tests/t1/macos_vibrancy.sh now measures it: the mean luminance step between neighbours over the key area on the screen, before and after setVibrancy, must fall below 35%. On this Mac Reduce Transparency is on (defaults com.apple.universalaccess reduceTransparency = 1), so AppKit draws the material opaque (flat luminance 246, detail 6.1 -> 0.0): the blur cannot be told from an opaque fill here and the test skips that check with the reason. The key-colour alpha check is now a failure instead of a WARN (it passes). macos_vibrancy passed three times.
Linux: the Pi 3B+ player (zinc device zinc-player shell) runs the shell on KMS with no X11 or Wayland compositor and no xdg-utils, so the compositing Linux half cannot be shown on it.
Left for a person or a machine (Review): (1) the blur check with Reduce Transparency off: ZINC=build/zinc tests/run --only macos_vibrancy prints 'blur: detail a -> b' when it passes; (2) transparent: true on a compositing Linux session (X11 with a compositor or Wayland): run tests/golden/macos/vibrancy's program there over a known wallpaper and look at the cleared area (SDL's NET_WM_BYPASS_COMPOSITOR hint only matters in fullscreen).
Research (sonnet): every layer must be non-opaque (NSWindow isOpaque NO + clearColor, NSOpenGLCPSurfaceOpacity 0 or CAMetalLayer.opaque NO, a framebuffer with alpha, premultiplied clear to 0,0,0,0); window-vibrancy crate recipe (docs.rs/crate/window-vibrancy); on X11 SDL3 needs a 32-bit ARGB visual and a running compositor (_NET_WM_CM_S0 owner), XWayland gives no transparency (reddit r/sdl report), SDL_HINT_VIDEO_X11_NET_WM_BYPASS_COMPOSITOR defaults to 1; blur is measured by gradient or Laplacian energy against a control capture.
later.md lines: ZN-249: measure the cost of the key-colour to alpha conversion per frame on a large transparent window (it runs on every present) / ZN-249: transparent windows on a compositing Linux session (X11 ARGB visual, Wayland), proven over a known wallpaper.
<!-- SECTION:NOTES:END -->
