---
id: ZN-569
title: 'Image, ImageBitmap and FontFace in the web environment'
status: Backlog
assignee: []
created_date: '2026-10-09 08:11'
labels:
  - games
  - js
  - size-M
milestone: m-22
dependencies:
  - ZN-568
ordinal: 348270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Image.src (files, data/blob URLs, http through zinc:net) and createImageBitmap decode PNG, JPEG and WebP off the main thread with the vendored stb_image and libwebp (decision D34); texImage2D from them honours UNPACK_FLIP_Y_WEBGL, UNPACK_PREMULTIPLY_ALPHA_WEBGL and UNPACK_COLORSPACE_CONVERSION_WEBGL, and createImageBitmap applies imageOrientation/premultiplyAlpha itself; FontFace.load registers TTF/OTF with the text tier; document.fonts. Closes the known gap of examples/webgl-studio (GLTFLoader decodes textures through createImageBitmap). Related: ZN-432 adds imageFromBytes to zinc:gfx and the thread-pool decoding plan of docs/reports/games/toolchain-assets-loading.md; share the decoder entry points. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the Cesium Milk Truck in examples/webgl-studio shows its texture
- [ ] #2 PixiJS Assets.load('bunny.png') and Phaser this.load.image upload real pixels (pixel check of one sprite)
- [ ] #3 the WebGL conformance texture pages that need images run (count reported)
- [ ] #4 decoding a 4096x4096 PNG never blocks a frame for more than 2 ms
<!-- AC:END -->
