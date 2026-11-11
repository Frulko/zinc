---
id: ZN-672
title: >-
  wasm target: imageFromBytes, runtime images and render targets in the browser
  host
status: Done
assignee: []
created_date: '2026-10-10 19:20'
updated_date: '2026-11-11 22:49'
labels:
  - wasm
  - gfx
  - size-M
dependencies: []
ordinal: 53500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of ZN-432, D73.) In the browser host imageFromBytes answers -1 with a warning, and runtime images and render targets do not draw; readBytes of exported assets is needed too (or depend on ZN-449).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tests/data/image_rect/main.ts passes check.py in headless Chrome
- [x] #2 a render target shows in the page
- [x] #3 readBytes reads an exported asset
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented wasm runtime image creation/fromPixels/updateImage/packed updatePixels, destruction with monotonically allocated ids, browser image decode through JSPI, and one active render target with explicit page/image transitions. HostArg B/U values now decode eight-byte Slots; pointer/count bounds and payload caps are checked before allocating. Browser decode copies bytes before suspension, checks dimensions using vendored stb/libwebp metadata before bitmap allocation, caps output at 2^24 pixels/16384 per side, closes bitmaps in finally, and removes failed image allocations. Translation is absolute, clips nest to the native depth, frame/target transitions restore context state.

Native contract checked before export changes: src/host/assets_host.h read(kind=0) excludes cooked images; sys_host.cpp falls back to original assetsDir files. Kept that distinction: exporter stores only existing imported image source files as private data entries in the same group pack, with boot.originals mapping. No entire raw directory, separate loader, or filesystem escape. Generated atlas pages have no original source; containment and private-name collisions are checked. Existing entry codecs are preserved. readBytes/readText fallback uses the mapping, and public list names hide private entries. Original bytes retain pack SHA verification, group unload and RAM budgets.

Research (delegated before task, primary details verified): https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas ; https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/createImageBitmap ; https://v8.dev/blog/jspi . Browser canvas/decoder reuse won over a new codec implementation. Vendored stb_info/WebPGetInfo guard dimensions before browser decode. No new dependency. JSPI is used where present; asset-free SAB fallback remains available, with encoded decode returning -1 when JSPI is absent. docs/targets/wasm.md records this.

Proof 2026-11-11, Chrome 157.0.8103.51, all heavy commands bounded through tools/work-run:
- tools/build zinc and own wasm export succeed. Existing warnings in src/agent/dev.cpp:155 and vendored nanosvg.h:3211 remain outside scope; no new warning in changed code.
- ZINC_ROOT=$PWD build/zinc check tests/data/image_rect/main.ts passes (.logs/672-check.log).
- Original tests/data/image_rect/main.ts copied unchanged into a temporary 400x180 export harness (no new demo). .logs/672-image-proof/result.json: baked 32 16 decoded 32 16 true; not an image -1 -1 destroyed 0; exit0; no browser problems. Original check.py .logs/672-image-proof/frame.png tests/data/image_rect/assets/sheet.png passes with default zero slack and no nearest simplification (.logs/672-check-pixels.log). Visually inspected capture.
- Temporary .logs/672-rt fixture renders red/blue target into page and updates B/U pixel data. .logs/672-rt-proof/result.json and pixels.json: target8, destroyed0, target dimensions8x4; exact red(255,0,0), blue(0,0,255), updated(16,32,48)/(64,80,96); exit0 and no browser problems.
- .logs/672-pack-proof.json: exported original PNG 272 bytes matches source SHA256 874470dd4671407c7f783db057c876204223538ee5739ffa8dd3bada37fad259. Existing cooked pack2860B becomes3228B (+368B) including raw bytes/index; this is artifact size, no performance claim.
- tests/run --only wasm_images passes (.logs/672-t0-final.log): Slot B/U conversion, bounds/invalid sizes, target destruction/restoration, stale ids, decoder failures; actual wasm metadata rejects oversized/invalid PNG before decoding. git diff --check passes.
- Full hashes, source/binary/wasm/browser/manifest provenance: .logs/672-provenance.json. No process remains owned.

Proposed tests: tests/t1/image_rect_wasm.sh and tests/t2/wasm_browser.sh at owner's milestone (broader callers/SAB fallback, ~10-40s, memory unmeasured); JPEG/WebP/GIF first-frame and EXIF/alpha browser cases plus group churn on other JSPI browsers (~1min, memory unmeasured). No suite, benchmark, physical/browser matrix, or RSS measurement run. Existing broader browser-host gaps (gradients, polygons, imageAlpha behavior) remain outside this task's three acceptance criteria. usage: n/a.
<!-- SECTION:NOTES:END -->
